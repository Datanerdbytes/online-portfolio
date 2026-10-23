from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Callable
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.auth import TokenClaims, verify_owner_token
from app.core.avatar import AvatarValidationError, validate_avatar_payload
from app.core.config import settings
from app.core.screenshots import InvalidScreenshot, optimize_screenshot
from app.core.storage import (
    ProfileImageError,
    ProfileImageNotFound,
    ProfileImageStorageUnavailable,
    ProfileImageStore,
    get_image_store,
)
from app.db.tenant import get_content_db as get_db
from app.models.project import Project
from app.schemas.project import ProjectResponse

logger = logging.getLogger(__name__)
SCREENSHOT_CACHE_CONTROL = "private, no-store"
_PUBLIC_400_DETAILS = frozenset(
    {
        "Invalid request",
        "Unsupported image type",
        "Screenshot too large",
        "Screenshot upload failed",
        "Screenshot removal failed",
    }
)


class ProjectScreenshotRoute(APIRoute):
    """Keep screenshot errors sanitized and prevent caching mutations."""

    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def screenshot_handler(request: Request) -> Response:
            try:
                response = await handler(request)
            except HTTPException as exc:
                detail = exc.detail
                if exc.status_code == 400 and detail not in _PUBLIC_400_DETAILS:
                    detail = "Invalid request"
                response = JSONResponse(
                    {"detail": detail}, status_code=exc.status_code, headers=exc.headers
                )
            except RequestValidationError:
                response = JSONResponse({"detail": "Invalid request"}, status_code=400)
            if request.method != "GET" or response.status_code >= 400:
                response.headers["Cache-Control"] = "no-store"
            return response

        return screenshot_handler


router = APIRouter(route_class=ProjectScreenshotRoute, tags=["projects"])


def get_current_owner(authorization: str | None = Header(None)) -> TokenClaims:  # noqa: B008
    return verify_owner_token(authorization)


def _uploaded_size(file: UploadFile) -> int:
    try:
        file.file.seek(0, os.SEEK_END)
        size = file.file.tell()
        file.file.seek(0)
    except OSError:
        return 0
    return size


def _etag_for(data: bytes) -> str:
    return f'"{hashlib.sha256(data).hexdigest()}"'


def _matches_etag(header: str | None, etag: str) -> bool:
    if not header:
        return False
    return etag in {tag.strip() for tag in header.split(",")} or "*" in header


def remove_screenshot_quietly(store: ProfileImageStore, filename: str | None) -> None:
    if not filename:
        return
    try:
        store.delete(filename)
    except ProfileImageNotFound:
        pass
    except ProfileImageError:
        logger.warning("Could not remove stored project screenshot")


@router.get("/projects/{slug}/screenshot")
def get_project_screenshot(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
) -> Response:
    try:
        project = db.query(Project).filter(Project.slug == slug).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    if project is None or not project.screenshot_filename:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    try:
        data = store.read(project.screenshot_filename)
    except ProfileImageNotFound:
        raise HTTPException(status_code=404, detail="Screenshot not found") from None
    except ProfileImageStorageUnavailable:
        raise HTTPException(status_code=503, detail="Image storage unavailable") from None

    etag = _etag_for(data)
    headers = {"ETag": etag, "Cache-Control": SCREENSHOT_CACHE_CONTROL}
    if _matches_etag(request.headers.get("if-none-match"), etag):
        return Response(status_code=304, headers=headers)
    return Response(
        content=data,
        media_type=project.screenshot_content_type or "application/octet-stream",
        headers=headers,
    )


@router.put("/projects/{slug}/screenshot", response_model=ProjectResponse)
def upload_project_screenshot(
    slug: str,
    file: UploadFile | None = File(default=None),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
) -> Project:
    try:
        project = db.query(Project).filter(Project.slug == slug).with_for_update().first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if file is None:
        raise HTTPException(status_code=400, detail="Invalid request")

    limit = settings.MAX_AVATAR_BYTES
    size = _uploaded_size(file)
    data = file.file.read(limit + 1)
    try:
        validate_avatar_payload(
            declared_content_type=file.content_type,
            declared_size=size,
            data=data,
            max_bytes=limit,
        )
    except AvatarValidationError as exc:
        detail = "Screenshot too large" if exc.status_code == 413 else exc.detail
        raise HTTPException(status_code=exc.status_code, detail=detail) from None

    try:
        data = optimize_screenshot(data)
    except InvalidScreenshot:
        raise HTTPException(status_code=400, detail="Invalid request") from None
    detected = "image/webp"

    try:
        filename = store.save(data, detected)
    except ProfileImageStorageUnavailable:
        raise HTTPException(status_code=503, detail="Image storage unavailable") from None
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported image type") from None

    previous_filename = project.screenshot_filename
    project.screenshot_filename = filename
    project.screenshot_content_type = detected
    project.screenshot_updated_at = datetime.now(timezone.utc)
    try:
        db.flush()
        db.commit()
        db.refresh(project)
    except SQLAlchemyError:
        db.rollback()
        remove_screenshot_quietly(store, filename)
        raise HTTPException(status_code=503, detail="Screenshot upload failed") from None

    if previous_filename and previous_filename != filename:
        remove_screenshot_quietly(store, previous_filename)
    return project


@router.delete("/projects/{slug}/screenshot", status_code=204)
def delete_project_screenshot(
    slug: str,
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    try:
        project = db.query(Project).filter(Project.slug == slug).with_for_update().first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    filename = project.screenshot_filename
    if not filename:
        raise HTTPException(status_code=404, detail="Screenshot not found")

    project.screenshot_filename = None
    project.screenshot_content_type = None
    project.screenshot_updated_at = None
    try:
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=503, detail="Screenshot removal failed") from None
    remove_screenshot_quietly(store, filename)
