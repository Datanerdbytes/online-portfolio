"""Owner authentication. FastAPI accepts bearer credentials, never browser cookies."""

from collections.abc import Callable

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict

from app.core.auth import (
    DUMMY_PASSWORD_HASH,
    IdentityResponse,
    TokenResponse,
    create_access_token,
    decode_and_verify_token,
    identity_response_from_claims,
    rate_limited_login,
    require_auth_configured,
    secret_or_fail,
    verify_password,
)
from app.core.config import settings


class AuthRoute(APIRoute):
    """Keep validation errors credential-free without changing public API errors."""

    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def sanitized(request: Request) -> Response:
            try:
                response = await handler(request)
            except HTTPException as exc:
                response = JSONResponse(
                    {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
                )
            except RequestValidationError:
                response = JSONResponse({"detail": "Invalid request"}, status_code=400)
            response.headers["Cache-Control"] = "no-store"
            return response

        return sanitized


router = APIRouter(route_class=AuthRoute)


class LoginRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    username: str
    password: str


def _get_bearer_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or token != token.strip():
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return token


@router.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request):
    require_auth_configured()
    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if media_type != "application/json":
        raise HTTPException(400, "Invalid request")
    try:
        password_length = len(body.password.encode("utf-8"))
    except UnicodeEncodeError:
        raise HTTPException(400, "Invalid credentials") from None
    if not 1 <= len(body.username) <= 200 or not 1 <= password_length <= 1024:
        raise HTTPException(400, "Invalid credentials")
    rate_limited_login()
    known_owner = body.username == settings.OWNER_USERNAME
    hashed = settings.OWNER_PASSWORD_HASH if known_owner else DUMMY_PASSWORD_HASH
    assert hashed is not None
    password_matches = verify_password(body.password, hashed)
    if not known_owner or not password_matches:
        raise HTTPException(401, "Invalid credentials", headers={"WWW-Authenticate": "Bearer"})
    secret = secret_or_fail()
    assert settings.OWNER_ID is not None
    token = create_access_token(settings.OWNER_ID, secret)
    claims = decode_and_verify_token(token, secret)
    return TokenResponse(access_token=token, expires_at=claims.exp, owner_id=claims.sub)


@router.get("/auth/me", response_model=IdentityResponse)
def me(authorization: str | None = Header(None)):
    secret = secret_or_fail()
    claims = decode_and_verify_token(_get_bearer_token(authorization), secret)
    return identity_response_from_claims(claims)
