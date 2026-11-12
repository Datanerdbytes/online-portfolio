from io import BytesIO

import pytest
from PIL import Image

from app.core import screenshots
from app.core.avatar import validate_avatar_payload


@pytest.mark.parametrize(
    ("size", "expected"),
    [((1600, 900), (400, 225)), ((300, 900), (133, 400)), ((80, 50), (80, 50))],
)
def test_resize_preserves_proportions_and_never_upscales(size, expected):
    source = BytesIO()
    Image.new("RGB", size, "navy").save(source, format="PNG")
    with Image.open(BytesIO(screenshots.optimize_screenshot(source.getvalue()))) as output:
        assert output.size == expected
        assert output.format == "WEBP"


def test_resize_preserves_transparency_and_strips_metadata():
    source = BytesIO()
    Image.new("RGBA", (800, 450), (255, 0, 0, 0)).save(source, format="PNG")
    with Image.open(BytesIO(screenshots.optimize_screenshot(source.getvalue()))) as output:
        assert output.getpixel((0, 0))[3] == 0
        assert not output.getexif()


def test_resize_applies_orientation_before_resizing():
    source = BytesIO()
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = "private source metadata"
    Image.new("RGB", (800, 400), "navy").save(source, format="JPEG", exif=exif)
    with Image.open(BytesIO(screenshots.optimize_screenshot(source.getvalue()))) as output:
        assert output.size == (200, 400)
        assert not output.getexif()


def test_resize_rejects_excessive_pixel_dimensions(monkeypatch):
    monkeypatch.setattr(screenshots, "MAX_SCREENSHOT_PIXELS", 100)
    source = BytesIO()
    Image.new("RGB", (20, 20)).save(source, format="PNG")
    with pytest.raises(screenshots.InvalidScreenshot):
        screenshots.optimize_screenshot(source.getvalue())


MAX_BYTES = 2_000
# Raster transcode tests still must fit inside the declared upload limit.
GENEROUS_MAX_BYTES = 10_000_000


def _gif(*, animated: bool = True) -> bytes:
    frame = Image.new("P", (8, 8), "navy")
    buffer = BytesIO()
    if animated:
        frame.save(buffer, format="GIF", save_all=True, append_images=[frame, frame], duration=100)
    else:
        frame.save(buffer, format="GIF")
    return buffer.getvalue()


def test_prepare_returns_declared_gif_verbatim_even_when_animated():
    payload = _gif()
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=len(payload),
        data=payload,
        max_bytes=MAX_BYTES,
    )

    assert detected == "image/gif"
    assert stored == payload


def test_prepare_stores_single_frame_gif_verbatim_too():
    payload = _gif(animated=False)
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=payload,
        max_bytes=MAX_BYTES,
    )

    assert detected == "image/gif"
    assert stored == payload


def test_prepare_strips_content_type_parameters_from_gif_declaration():
    payload = _gif()
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif; charset=binary",
        declared_size=None,
        data=payload,
        max_bytes=MAX_BYTES,
    )

    assert detected == "image/gif"
    assert stored == payload


def test_prepare_rejects_gif_declaration_without_gif_bytes():
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=None,
            data=b"not a gif",
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Unsupported image type"
    assert raised.value.status_code == 400


def test_prepare_rejects_gif_bytes_without_gif_declaration():
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/png",
            declared_size=None,
            data=_gif(),
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Unsupported image type"


def test_prepare_applies_declared_size_check_before_payload():
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=MAX_BYTES + 1,
            data=b"",
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Screenshot too large"
    assert raised.value.status_code == 413


def test_prepare_applies_actual_size_check_to_gif():
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=None,
            data=_gif() + b"\x00" * MAX_BYTES,
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Screenshot too large"
    assert raised.value.status_code == 413


def test_prepare_rejects_empty_gif_payload():
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=None,
            data=b"",
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Invalid request"
    assert raised.value.status_code == 400


def test_prepare_transcodes_raster_images_to_webp_thumbnail():
    source = BytesIO()
    Image.new("RGB", (800, 450), "navy").save(source, format="PNG")
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/png",
        declared_size=source.getbuffer().nbytes,
        data=source.getvalue(),
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == (400, 225)


def test_avatar_validation_still_rejects_gif():
    # The GIF policy is screenshot-specific: portrait uploads keep accepting
    # only JPEG/PNG/WebP, so avatars cannot become GIFs through this change.
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        validate_avatar_payload(
            declared_content_type="image/gif",
            declared_size=None,
            data=_gif(),
            max_bytes=MAX_BYTES,
        )
    assert raised.value.detail == "Unsupported image type"
