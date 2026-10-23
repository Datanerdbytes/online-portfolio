"""Owner portrait routes.

The public GET is cacheable; every mutation requires the owner bearer token.
The stored filename never leaves the API: clients only ever receive the
canonical avatar URL returned by the profile.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.auth import TokenClaims, verify_owner_token
from app.core.avatar import AvatarValidationError, validate_avatar_payload
from app.core.config import settings
from app.core.image_processing import (
    HERO_BANNER_MAX_EDGE,
    PROFILE_PHOTO_MAX_EDGE,
    InvalidImage,
    optimize_image,
)
from app.core.storage import (
    ProfileImageError,
    ProfileImageNotFound,
    ProfileImageStorageUnavailable,
    ProfileImageStore,
    get_image_store,
)
from app.db.session import get_db
from app.models.resume import Profile
from app.schemas.resume import ProfileResponse

logger = logging.getLogger(__name__)

# A successful public read is cacheable for a short while. The ETag makes the
# browser revalidate instead of guessing when the portrait changed.
AVATAR_CACHE_CONTROL = "public, max-age=300, must-revalidate"

# 400 responses may only use these messages. Anything else - a framework
# internal body-parse error, for example - is replaced with the generic one so
# the public error vocabulary stays predictable.
_PUBLIC_400_DETAILS = frozenset(
    {
        "Invalid request",
        "Unsupported image type",
        "Avatar upload failed",
        "Avatar removal failed",
    }
)


class AvatarRoute(APIRoute):
    """Keep the public avatar contract stable.

    * Only a successful GET may be cached; mutations and failures are `no-store`.
    * 400 responses never expose a framework or storage message.
    """

    def get_route_handler(self) -> Callable:
        handler = super().get_route_handler()

        async def avatar_handler(request: Request) -> Response:
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

        return avatar_handler


router = APIRouter(route_class=AvatarRoute, tags=["avatar"])
ImageKind = Literal["avatar", "banner"]
_IMAGE_FIELDS = {
    "avatar": ("avatar_filename", "avatar_content_type", "avatar_updated_at"),
    "banner": ("banner_filename", "banner_content_type", "banner_updated_at"),
}


def get_current_owner(authorization: str | None = Header(None)) -> TokenClaims:  # noqa: B008
    return verify_owner_token(authorization)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uploaded_size(file: UploadFile) -> int:
    """Size of the received part in bytes.

    Starlette does not track the size of an uploaded part, so it is measured on
    the spooled file. The stream is rewound afterwards.
    """
    try:
        file.file.seek(0, os.SEEK_END)
        size = file.file.tell()
        file.file.seek(0)
    except OSError:
        return 0
    return size


def _etag_for(data: bytes) -> str:
    return '"' + hashlib.sha256(data).hexdigest() + '"'


def _matches_etag(header: str | None, etag: str) -> bool:
    if not header:
        return False
    candidates = {tag.strip() for tag in header.split(",")}
    return etag in candidates or "*" in candidates


def _remove_quietly(store: ProfileImageStore, filename: str | None) -> None:
    """Best-effort cleanup of a stored file."""
    if not filename:
        return
    try:
        store.delete(filename)
    except ProfileImageNotFound:
        pass
    except ProfileImageError:
        logger.warning("Could not remove stored avatar %s", filename)


# ---------------------------------------------------------------------------
# Public read
# ---------------------------------------------------------------------------


def _get_profile_image(
    image_kind: ImageKind,
    request: Request,
    db: Session,
    store: ProfileImageStore,
) -> Response:
    profile = db.query(Profile).first()
    filename_field, content_type_field, _ = _IMAGE_FIELDS[image_kind]
    filename = getattr(profile, filename_field, None) if profile else None
    if not profile or not filename:
        raise HTTPException(status_code=404, detail=f"{image_kind.title()} not found")
    try:
        data = store.read(filename)
    except ProfileImageNotFound:
        raise HTTPException(status_code=404, detail=f"{image_kind.title()} not found") from None
    except ProfileImageStorageUnavailable:
        raise HTTPException(status_code=503, detail="Avatar storage unavailable") from None

    etag = _etag_for(data)
    if _matches_etag(request.headers.get("if-none-match"), etag):
        return Response(
            status_code=304,
            headers={"ETag": etag, "Cache-Control": AVATAR_CACHE_CONTROL},
        )

    content_type = getattr(profile, content_type_field) or "application/octet-stream"
    return Response(
        content=data,
        media_type=content_type,
        headers={"ETag": etag, "Cache-Control": AVATAR_CACHE_CONTROL},
    )


@router.get("/resume/profile/avatar")
def get_avatar(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):
    """Return the profile portrait."""
    return _get_profile_image("avatar", request, db, store)


@router.get("/resume/profile/banner")
def get_banner(
    request: Request,
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):
    """Return the hero banner image."""
    return _get_profile_image("banner", request, db, store)


# ---------------------------------------------------------------------------
# Owner mutations
# ---------------------------------------------------------------------------


def _upload_profile_image(
    image_kind: ImageKind, file: UploadFile | None, db: Session, store: ProfileImageStore
) -> Profile:
    profile = db.query(Profile).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if file is None:
        raise HTTPException(status_code=400, detail="Invalid request")

    limit = settings.MAX_AVATAR_BYTES
    size = _uploaded_size(file)
    # Read one byte more than the limit so an oversized upload is detected
    # without buffering the whole file.
    data = file.file.read(limit + 1)
    try:
        validate_avatar_payload(
            declared_content_type=file.content_type,
            declared_size=size,
            data=data,
            max_bytes=limit,
        )
    except AvatarValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from None

    try:
        data = optimize_image(
            data,
            max_edge=PROFILE_PHOTO_MAX_EDGE if image_kind == "avatar" else HERO_BANNER_MAX_EDGE,
            quality=85,
        )
    except InvalidImage:
        raise HTTPException(status_code=400, detail="Invalid request") from None
    detected = "image/webp"

    filename_field, content_type_field, updated_at_field = _IMAGE_FIELDS[image_kind]
    previous_filename = getattr(profile, filename_field)
    try:
        filename = store.save(data, detected)
    except ProfileImageStorageUnavailable:
        raise HTTPException(status_code=503, detail="Avatar storage unavailable") from None
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported image type") from None

    setattr(profile, filename_field, filename)
    setattr(profile, content_type_field, detected)
    setattr(profile, updated_at_field, datetime.now(timezone.utc))
    try:
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        _remove_quietly(store, filename)
        raise HTTPException(status_code=400, detail="Avatar upload failed") from None

    if previous_filename and previous_filename != filename:
        _remove_quietly(store, previous_filename)
    return profile


@router.put("/resume/profile/avatar", response_model=ProfileResponse)
def upload_avatar(
    file: UploadFile | None = File(default=None),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    """Replace the portrait. The previous portrait is removed after the commit."""
    return _upload_profile_image("avatar", file, db, store)


@router.put("/resume/profile/banner", response_model=ProfileResponse)
def upload_banner(
    file: UploadFile | None = File(default=None),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    """Replace the hero banner image."""
    return _upload_profile_image("banner", file, db, store)


def _delete_profile_image(image_kind: ImageKind, db: Session, store: ProfileImageStore) -> None:
    profile = db.query(Profile).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    filename_field, content_type_field, updated_at_field = _IMAGE_FIELDS[image_kind]
    filename = getattr(profile, filename_field)
    if not filename:
        raise HTTPException(status_code=404, detail=f"{image_kind.title()} not found")

    setattr(profile, filename_field, None)
    setattr(profile, content_type_field, None)
    setattr(profile, updated_at_field, None)
    try:
        db.flush()
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Avatar removal failed") from None

    _remove_quietly(store, filename)


@router.delete("/resume/profile/avatar", status_code=204)
def delete_avatar(
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    """Remove the portrait. Removing an already-missing file still succeeds."""
    _delete_profile_image("avatar", db, store)


@router.delete("/resume/profile/banner", status_code=204)
def delete_banner(
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
    _owner: TokenClaims = Depends(get_current_owner),  # noqa: B008
):
    """Remove the hero banner image."""
    _delete_profile_image("banner", db, store)
