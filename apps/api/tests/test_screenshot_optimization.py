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
# The GIF input cap sits above the stored limit so oversized GIFs transcode
# down instead of being rejected; mirrors the production settings.
STORED_LIMIT = 2 * 1024 * 1024
GIF_INPUT_LIMIT = 4 * 1024 * 1024


def _gif(*, animated: bool = True, size: tuple[int, int] = (8, 8), frames: int = 3) -> bytes:
    # Distinct palette indices per frame: Pillow's GIF encoder collapses
    # identical frames, so a shared image object would produce one frame.
    frames_images = [Image.new("P", size, (i * 20, 10, 90)) for i in range(frames)]
    buffer = BytesIO()
    if animated:
        frames_images[0].save(
            buffer,
            format="GIF",
            save_all=True,
            append_images=frames_images[1:],
            duration=[100, 200, 300, 400, 500][:frames],
            loop=0,
        )
    else:
        frames_images[0].save(buffer, format="GIF")
    return buffer.getvalue()


def _frame_durations(output) -> list:
    durations = []
    for index in range(output.n_frames):
        output.seek(index)
        output.load()
        durations.append(output.info["duration"])
    return durations


def test_prepare_transcodes_animated_gif_to_animated_webp():
    payload = _gif(frames=3)
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=len(payload),
        data=payload,
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as output:
        assert output.format == "WEBP"
        assert output.is_animated
        assert output.n_frames == 3
        assert _frame_durations(output) == [100, 200, 300]
        assert output.info["loop"] == 0


def test_prepare_transcodes_static_gif_to_single_frame_webp():
    payload = _gif(animated=False)
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=payload,
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as output:
        assert output.format == "WEBP"
        assert not output.is_animated


def test_prepare_transcodes_gif_declared_with_content_type_parameters():
    payload = _gif()
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif; charset=binary",
        declared_size=None,
        data=payload,
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    assert stored


def test_gif_transcode_never_upscales_and_downsizes_large_frames():
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=_gif(size=(800, 450)),
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as output:
        assert output.size == (400, 225)

    _, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=_gif(size=(246, 126)),
        max_bytes=GENEROUS_MAX_BYTES,
    )
    with Image.open(BytesIO(stored)) as output:
        assert output.size == (246, 126)


def test_gif_transcode_samples_frames_and_preserves_total_duration(monkeypatch):
    # The source is five frames at 100-500ms (1500ms total). Keeping two evenly
    # spaced frames must merge each dropped frame's duration into the span of
    # the kept frame that follows it, preserving the loop's total duration.
    payload = _gif(frames=5)
    monkeypatch.setattr(screenshots, "MAX_ANIMATED_FRAMES", 2)

    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=payload,
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as output:
        assert output.n_frames == 2
        durations = _frame_durations(output)
        assert durations == [600, 900]
        assert sum(durations) == 1500


def test_gif_transcode_without_loop_block_plays_once():
    frames_images = [Image.new("P", (8, 8), (i * 20, 10, 90)) for i in range(2)]
    buffer = BytesIO()
    frames_images[0].save(
        buffer, format="GIF", save_all=True, append_images=frames_images[1:], duration=100
    )
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=buffer.getvalue(),
        max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    with Image.open(BytesIO(stored)) as output:
        assert output.info["loop"] == 1


def test_gif_transcode_rejects_oversized_canvas(monkeypatch):
    monkeypatch.setattr(screenshots, "MAX_SCREENSHOT_PIXELS", 100)
    with pytest.raises(screenshots.InvalidScreenshot):
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=None,
            data=_gif(size=(16, 16)),
            max_bytes=GENEROUS_MAX_BYTES,
        )


def test_gif_transcode_rejects_malformed_payload():
    with pytest.raises(screenshots.InvalidScreenshot):
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=None,
            data=b"GIF89a" + b"\x00" * 32,
            max_bytes=GENEROUS_MAX_BYTES,
        )


def test_gif_transcode_falls_back_to_fewer_frames_for_the_size_budget():
    from app.core.image_processing import optimize_animated_gif

    payload = _gif(frames=3)
    first_tier = optimize_animated_gif(
        payload,
        max_edge=screenshots.MAX_SCREENSHOT_EDGE,
        max_pixels=screenshots.MAX_SCREENSHOT_PIXELS,
        max_frames=screenshots.MAX_ANIMATED_FRAMES,
        quality=screenshots.ANIMATED_QUALITY,
    )
    # A budget just under the first tier's output must switch to the fallback
    # tier (fewer frames, lower quality) instead of rejecting the upload.
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=payload,
        max_bytes=len(first_tier) - 1,
    )

    assert detected == "image/webp"
    assert len(stored) <= len(first_tier) - 1


def test_gif_transcode_rejects_when_no_tier_fits_the_budget():
    payload = _gif(frames=3)
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots._transcode_gif(payload, max_bytes=0)
    assert raised.value.detail == "Screenshot too large"
    assert raised.value.status_code == 413


def test_gif_transcode_last_resort_tier_fits_the_budget(monkeypatch):
    from app.core.image_processing import optimize_animated_gif

    payload = _gif(frames=3)
    monkeypatch.setattr(screenshots, "_FALLBACK_FRAMES", 2)
    monkeypatch.setattr(screenshots, "_FALLBACK_QUALITY", 70)
    monkeypatch.setattr(screenshots, "_LAST_RESORT_FRAMES", 1)
    monkeypatch.setattr(screenshots, "_LAST_RESORT_QUALITY", 40)
    fallback = optimize_animated_gif(
        payload,
        max_edge=screenshots.MAX_SCREENSHOT_EDGE,
        max_pixels=screenshots.MAX_SCREENSHOT_PIXELS,
        max_frames=2,
        quality=70,
    )
    # A budget just under the fallback tier's output must switch to the last
    # resort tier (a single low-quality frame) instead of rejecting.
    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=None,
        data=payload,
        max_bytes=len(fallback) - 1,
        input_max_bytes=GENEROUS_MAX_BYTES,
    )

    assert detected == "image/webp"
    assert len(stored) <= len(fallback) - 1
    with Image.open(BytesIO(stored)) as output:
        assert output.n_frames == 1


def test_prepare_accepts_gif_input_above_the_stored_limit():
    # A GIF larger than the stored limit but within the input cap is accepted:
    # the transcode brings the stored bytes back under the stored limit.
    payload = _gif(frames=3) + b"\x00" * (STORED_LIMIT + 1)
    assert len(payload) > STORED_LIMIT
    assert len(payload) < GIF_INPUT_LIMIT

    detected, stored = screenshots.prepare_screenshot_upload(
        declared_content_type="image/gif",
        declared_size=len(payload),
        data=payload,
        max_bytes=STORED_LIMIT,
        input_max_bytes=GIF_INPUT_LIMIT,
    )

    assert detected == "image/webp"
    assert len(stored) <= STORED_LIMIT
    with Image.open(BytesIO(stored)) as output:
        assert output.format == "WEBP"
        assert output.is_animated
        assert output.n_frames == 3


def test_prepare_rejects_gif_input_above_the_gif_cap():
    payload = _gif(frames=3) + b"\x00" * (GIF_INPUT_LIMIT + 1)
    with pytest.raises(screenshots.AvatarValidationError) as raised:
        screenshots.prepare_screenshot_upload(
            declared_content_type="image/gif",
            declared_size=len(payload),
            data=payload,
            max_bytes=STORED_LIMIT,
            input_max_bytes=GIF_INPUT_LIMIT,
        )
    assert raised.value.detail == "Screenshot too large"
    assert raised.value.status_code == 413


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
