"""Validate Neon Managed Better Auth credentials; never issue tokens or hash passwords."""

from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

import jwt
from fastapi import HTTPException
from pydantic import BaseModel

from app.core.config import is_auth_configured, settings


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    iss: str
    aud: str
    iat: int
    exp: int
    jti: str = ""


class IdentityResponse(BaseModel):
    owner_id: str
    authenticated: bool = True
    expires_at: int


def require_auth_configured() -> None:
    if not is_auth_configured():
        raise HTTPException(503, "Neon authentication is not configured")


def bearer_token_from_header(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or token != token.strip() or len(token) > 8192:
        raise unauthorized()
    return token


def unauthorized() -> HTTPException:
    return HTTPException(
        401, "Invalid authentication credentials", headers={"WWW-Authenticate": "Bearer"}
    )


@lru_cache(maxsize=4)
def jwks_client(base_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        f"{base_url.rstrip('/')}/.well-known/jwks.json",
        cache_jwk_set=True,
        lifespan=300,
        timeout=5,
    )


def verify_owner_token(authorization: str | None) -> TokenClaims:
    require_auth_configured()
    token = bearer_token_from_header(authorization)
    base = settings.NEON_AUTH_BASE_URL or ""
    parsed = urlsplit(base)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "EdDSA" or not isinstance(header.get("kid"), str):
            raise unauthorized()
        key = jwks_client(base).get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            key,
            algorithms=["EdDSA"],
            issuer=origin,
            audience=origin,
            options={"require": ["sub", "iss", "aud", "iat", "exp"], "strict_aud": True},
        )
        if (
            not isinstance(payload["sub"], str)
            or not 1 <= len(payload["sub"]) <= 128
            or type(payload["iat"]) is not int
            or type(payload["exp"]) is not int
            or payload["exp"] <= payload["iat"]
        ):
            raise unauthorized()
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "Authentication service unavailable") from None
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise unauthorized() from None
    return TokenClaims(
        sub=payload["sub"],
        iss=origin,
        aud=origin,
        iat=payload["iat"],
        exp=payload["exp"],
    )
