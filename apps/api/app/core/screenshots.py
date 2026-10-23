"""Thumbnail policy for project screenshots."""

from app.core.image_processing import InvalidImage as InvalidScreenshot  # noqa: F401
from app.core.image_processing import optimize_image

MAX_SCREENSHOT_EDGE = 400
MAX_SCREENSHOT_PIXELS = 20_000_000


def optimize_screenshot(data: bytes) -> bytes:
    return optimize_image(data, max_edge=MAX_SCREENSHOT_EDGE, max_pixels=MAX_SCREENSHOT_PIXELS)
