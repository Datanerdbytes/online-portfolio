"""Decode, orient, resize, and compress portfolio images without source metadata."""

import warnings
from io import BytesIO
from typing import cast

from PIL import GifImagePlugin, Image, ImageOps, UnidentifiedImageError

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


def optimize_animated_gif(
    data: bytes,
    *,
    max_edge: int,
    max_frames: int,
    max_pixels: int = MAX_IMAGE_PIXELS,
    quality: int = 80,
) -> bytes:
    """Transcode a GIF into a bounded animated WebP.

    Frames are composited by seeking through the source, downscaled to fit
    within ``max_edge`` without upscaling, and re-encoded as full WebP frames.
    Sources with more than ``max_frames`` frames keep evenly spaced frames;
    each kept frame inherits the summed duration of the frames it spans, so
    the loop's total duration is preserved. The loop count and per-frame
    timing carry over, and no source metadata (ICC, XMP, EXIF) is written.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with cast(
                GifImagePlugin.GifImageFile, Image.open(BytesIO(data), formats=("GIF",))
            ) as source:
                if source.width * source.height > max_pixels:
                    raise InvalidImage("Image dimensions are too large")
                durations = []
                for index in range(source.n_frames):
                    source.seek(index)
                    durations.append(max(int(source.info.get("duration", 0)), 0))
                # A GIF without a loop block plays once; WebP loop counts are
                # total iterations with 0 meaning infinite, matching GIF's
                # Netscape block where 0 means infinite.
                loop = source.info.get("loop", 1)
                stride = max(1, -(-source.n_frames // max_frames))
                keep = list(range(0, source.n_frames, stride))
                # Each kept frame holds the summed duration of the frames it
                # spans, so sampling never changes the loop's total duration.
                spans = []
                for position, index in enumerate(keep):
                    following = keep[position + 1] if position + 1 < len(keep) else source.n_frames
                    spans.append(sum(durations[index:following]))
                frames = []
                for index in keep:
                    source.seek(index)
                    frame = source.convert("RGBA")
                    frame.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                    # Do not retain source metadata.
                    frame.info.clear()
                    frames.append(frame)
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InvalidImage("Invalid image") from None
    # GIF viewers clamp sub-100ms delays loosely; 20ms keeps sampled frames
    # visible when a source carries zero-duration frames.
    output = BytesIO()
    frames[0].save(
        output,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=[max(span, 20) for span in spans],
        loop=loop,
        quality=quality,
        method=4,
    )
    return output.getvalue()
