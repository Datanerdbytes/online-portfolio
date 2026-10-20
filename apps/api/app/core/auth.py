"""Backend-owned bearer authentication; no browser cookies or Auth.js internals."""

from __future__ import annotations

import math
import secrets
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException
from pydantic import BaseModel

from app.core.config import is_auth_configured, settings

ISSUER = "online-resume-api"
AUDIENCE = "online-resume-web"
ALGORITHM = "HS256"
CLOCK_TOLERANCE_SECONDS = 30
_password_hasher = PasswordHasher()
# Generated once; unknown usernames still perform one real verification.
DUMMY_PASSWORD_HASH = _password_hasher.hash(secrets.token_urlsafe(32))


def require_auth_configured() -> None:
    if not is_auth_configured():
        raise HTTPException(503, "Administration unavailable")


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _password_hasher.verify(hashed_password, plain_password)
    except (VerificationError, InvalidHashError):
        return False


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    iss: str
    aud: str
    iat: int
    exp: int
    jti: str


def create_access_token(owner_id: str, secret: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": owner_id,
            "iat": now,
            "exp": now + settings.ACCESS_TOKEN_EXPIRE_SECONDS,
            "jti": secrets.token_urlsafe(16),
        },
        secret,
        algorithm=ALGORITHM,
    )


def bearer_token_from_header(authorization: str | None) -> str:
    """Extract and validate a bearer credential from an Authorization header.

    FastAPI accepts bearer tokens only: no cookies, no owner headers.
    """
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or token != token.strip():
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return token


def _unauthorized() -> HTTPException:
    return HTTPException(
        401, "Invalid authentication credentials", headers={"WWW-Authenticate": "Bearer"}
    )


def verify_owner_token(authorization: str | None) -> TokenClaims:
    """Verify an incoming bearer token independently for a protected operation.

    Raises 503 when administration is unconfigured, 401 for missing/invalid/
    expired tokens, and 403 for tokens issued for a different owner.
    """
    secret = secret_or_fail()
    return decode_and_verify_token(bearer_token_from_header(authorization), secret)


def decode_and_verify_token(token: str, secret: str) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            audience=AUDIENCE,
            options={
                "require": ["exp", "iat", "jti", "sub", "iss", "aud"],
                "verify_signature": True,
                "verify_iss": True,
                "verify_aud": True,
                "strict_aud": True,
                # Validate dates below with exact types, the same injectable clock,
                # no expiration grace period, and bounded future-iat tolerance.
                "verify_exp": False,
                "verify_iat": False,
            },
        )
    except (jwt.PyJWTError, TypeError, ValueError, OverflowError):
        raise _unauthorized() from None
    now = time.time()
    issued_at, expires_at = payload["iat"], payload["exp"]
    if (
        type(issued_at) is not int
        or type(expires_at) is not int
        or not isinstance(payload["jti"], str)
        or not payload["jti"].strip()
        or not isinstance(payload["sub"], str)
        or not payload["sub"].strip()
    ):
        raise _unauthorized()
    if (
        expires_at <= now
        or expires_at <= issued_at
        or expires_at - issued_at > settings.ACCESS_TOKEN_EXPIRE_SECONDS
        or issued_at > now + CLOCK_TOLERANCE_SECONDS
    ):
        raise _unauthorized()
    if payload["sub"] != settings.OWNER_ID:
        raise HTTPException(403, "Token not valid for this owner")
    return TokenClaims(
        sub=payload["sub"],
        iss=ISSUER,
        aud=AUDIENCE,
        iat=issued_at,
        exp=expires_at,
        jti=payload["jti"],
    )


class LoginRateLimiter:
    """One bounded process-local bucket; use one worker until a shared limiter exists."""

    def __init__(self, clock: Callable[[], float] | None = None) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._window: int | None = None
        self._count = 0

    def check_and_record(self) -> None:
        with self._lock:
            now = self._clock() if self._clock else time.monotonic()
            seconds = settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS
            window = math.floor(now / seconds)
            if window != self._window:
                self._window, self._count = window, 0
            if self._count >= settings.LOGIN_RATE_LIMIT_ATTEMPTS:
                raise HTTPException(
                    429,
                    "Too many login attempts",
                    headers={"Retry-After": str(max(1, math.ceil((window + 1) * seconds - now)))},
                )
            self._count += 1


_rate_limiter = LoginRateLimiter()


def rate_limited_login() -> None:
    _rate_limiter.check_and_record()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: int
    owner_id: str


class IdentityResponse(BaseModel):
    owner_id: str
    authenticated: bool
    expires_at: int


def identity_response_from_claims(claims: TokenClaims) -> IdentityResponse:
    return IdentityResponse(owner_id=claims.sub, authenticated=True, expires_at=claims.exp)


def secret_or_fail() -> str:
    require_auth_configured()
    assert settings.API_ACCESS_SECRET is not None
    return settings.API_ACCESS_SECRET
