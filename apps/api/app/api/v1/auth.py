"""Neon identity verification and application-portfolio provisioning."""

from collections.abc import Callable

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.auth import IdentityResponse, verify_owner_token
from app.db.session import get_db
from app.db.tenant import provision_owner


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
            except SQLAlchemyError:
                response = JSONResponse(
                    {"detail": "Portfolio service unavailable"}, status_code=503
                )
            response.headers["Cache-Control"] = "no-store"
            return response

        return sanitized


router = APIRouter(route_class=AuthRoute)


@router.get("/auth/me", response_model=IdentityResponse)
def me(authorization: str | None = Header(None), db: Session = Depends(get_db)):  # noqa: B008
    claims = verify_owner_token(authorization)
    owner_id = provision_owner(db, claims.sub)
    return IdentityResponse(owner_id=owner_id, expires_at=claims.exp)
