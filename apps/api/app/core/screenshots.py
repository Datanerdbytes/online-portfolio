"""Upload and thumbnail policy for project screenshots."""

from app.core.avatar import (
    AvatarValidationError,
    normalize_content_type,
    validate_avatar_payload,
    validate_size_bounds,
)
from app.core.image_processing import (
    InvalidImage as InvalidScreenshot,  # noqa: F401
)
from app.core.image_processing import (
    optimize_animated_gif,
    optimize_image,
)

MAX_SCREENSHOT_EDGE = 400
MAX_SCREENSHOT_PIXELS = 20_000_000

# GIF87a/GIF89a leading magic bytes. GIFs are transcoded into bounded animated
# WebP thumbnails: all frames are re-encoded, so the animation and its timing
# survive while the 400px thumbnail bound and the storage limit keep files
# small. Screens render through unoptimized images, so browsers animate the
# stored frames.
GIF_CONTENT_TYPE = "image/gif"
_GIF_SIGNATURES = (b"GIF87a", b"GIF89a")
_THUMBNAIL_CONTENT_TYPE = "image/webp"

# Transcode tiers: the first keeps up to 120 frames at quality 80; the
# fallbacks halve the frame rate and lower the quality so a long or dense
# recording still fits the storage limit before the upload is rejected.
MAX_ANIMATED_FRAMES = 120
ANIMATED_QUALITY = 80
_FALLBACK_FRAMES = 60
_FALLBACK_QUALITY = 60
_LAST_RESORT_FRAMES = 30
_LAST_RESORT_QUALITY = 45


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
    input_max_bytes: int | None = None,
) -> tuple[str, bytes]:
    """Validate an uploaded screenshot and return its content type and stored bytes.

    JPEG/PNG/WebP follow the portrait rules and are re-encoded as a WebP
    thumbnail. A declared GIF with matching magic bytes may arrive up to
    ``input_max_bytes`` — above the stored limit, because the transcode brings
    the stored bytes back under ``max_bytes`` — and is transcoded into a
    bounded animated WebP so its animation survives. The order of the checks
    is fixed and the first failure wins; nothing is written.
    """
    if normalize_content_type(declared_content_type) == GIF_CONTENT_TYPE:
        validate_size_bounds(
            declared_size=declared_size,
            data=data,
            max_bytes=input_max_bytes if input_max_bytes is not None else max_bytes,
            kind="Screenshot",
        )
        if not is_gif(data):
            raise AvatarValidationError("Unsupported image type")
        return _THUMBNAIL_CONTENT_TYPE, _transcode_gif(data, max_bytes=max_bytes)
    validate_avatar_payload(
        declared_content_type=declared_content_type,
        declared_size=declared_size,
        data=data,
        max_bytes=max_bytes,
    )
    return _THUMBNAIL_CONTENT_TYPE, optimize_screenshot(data)


def _transcode_gif(data: bytes, *, max_bytes: int) -> bytes:
    """Encode a GIF screenshot as an animated WebP that fits the storage limit.

    The input size is already bounded here; this guards the transcoded output,
    which can exceed the input for dense or long recordings. Each tier decodes
    the source again, so the fallback never compounds quality loss. Tier
    constants are read at call time so tests can tighten them.
    """
    tiers = (
        (MAX_ANIMATED_FRAMES, ANIMATED_QUALITY),
        (_FALLBACK_FRAMES, _FALLBACK_QUALITY),
        (_LAST_RESORT_FRAMES, _LAST_RESORT_QUALITY),
    )
    for max_frames, quality in tiers:
        encoded = optimize_animated_gif(
            data,
            max_edge=MAX_SCREENSHOT_EDGE,
            max_pixels=MAX_SCREENSHOT_PIXELS,
            max_frames=max_frames,
            quality=quality,
        )
        if len(encoded) <= max_bytes:
            return encoded
    raise AvatarValidationError("Screenshot too large", status_code=413)
