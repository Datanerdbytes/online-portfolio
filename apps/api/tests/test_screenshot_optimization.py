from io import BytesIO

import pytest
from PIL import Image

from app.core import screenshots


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
