"""Decode, orient, resize, and compress portfolio images without source metadata."""

import warnings
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_PIXELS = 20_000_000
PROFILE_PHOTO_MAX_EDGE = 512
HERO_BANNER_MAX_EDGE = 1200


class InvalidImage(ValueError):
    pass


def optimize_image(
    data: bytes, *, max_edge: int, max_pixels: int = MAX_IMAGE_PIXELS, quality: int = 80
) -> bytes:
    """Decode the first frame, orient it, and shrink without cropping or upscaling."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data), formats=("JPEG", "PNG", "WEBP")) as source:
                if source.width * source.height > max_pixels:
                    raise InvalidImage("Image dimensions are too large")
                source.seek(0)
                image = ImageOps.exif_transpose(source)
                image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                image = image.convert(
                    "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
                )
                # Do not retain source metadata (including EXIF location data).
                image.info.clear()
                output = BytesIO()
                image.save(output, format="WEBP", quality=quality, method=6)
                return output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InvalidImage("Invalid image") from None
