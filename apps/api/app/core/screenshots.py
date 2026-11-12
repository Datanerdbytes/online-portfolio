"""Upload and thumbnail policy for project screenshots."""

from app.core.avatar import (
    AvatarValidationError,
    normalize_content_type,
    validate_avatar_payload,
    validate_size_bounds,
)
from app.core.image_processing import InvalidImage as InvalidScreenshot  # noqa: F401
from app.core.image_processing import optimize_image

MAX_SCREENSHOT_EDGE = 400
MAX_SCREENSHOT_PIXELS = 20_000_000

# GIF87a/GIF89a leading magic bytes. GIFs are the one accepted screenshot type
# stored verbatim: decoding and re-encoding frame by frame would risk the
# animation and its timing, while the first frame alone would drop it. Screens
# render through unoptimized images, so browsers animate the stored bytes.
GIF_CONTENT_TYPE = "image/gif"
_GIF_SIGNATURES = (b"GIF87a", b"GIF89a")
_THUMBNAIL_CONTENT_TYPE = "image/webp"


def optimize_screenshot(data: bytes) -> bytes:
    return optimize_image(data, max_edge=MAX_SCREENSHOT_EDGE, max_pixels=MAX_SCREENSHOT_PIXELS)


def is_gif(data: bytes) -> bool:
    """Return whether the payload starts with a GIF signature."""
    return data[:6] in _GIF_SIGNATURES


def prepare_screenshot_upload(
    *,
    declared_content_type: str | None,
    declared_size: int | None,
    data: bytes,
    max_bytes: int,
) -> tuple[str, bytes]:
    """Validate an uploaded screenshot and return its content type and stored bytes.

    JPEG/PNG/WebP follow the portrait rules and are re-encoded as a WebP
    thumbnail. A declared GIF with matching magic bytes passes the same size
    checks and is returned unmodified so its animation survives; its frames are
    never decoded server-side. The order of the checks is fixed and the first
    failure wins; nothing is written.
    """
    if normalize_content_type(declared_content_type) == GIF_CONTENT_TYPE:
        validate_size_bounds(
            declared_size=declared_size, data=data, max_bytes=max_bytes, kind="Screenshot"
        )
        if not is_gif(data):
            raise AvatarValidationError("Unsupported image type")
        return GIF_CONTENT_TYPE, data
    validate_avatar_payload(
        declared_content_type=declared_content_type,
        declared_size=declared_size,
        data=data,
        max_bytes=max_bytes,
    )
    return _THUMBNAIL_CONTENT_TYPE, optimize_screenshot(data)
