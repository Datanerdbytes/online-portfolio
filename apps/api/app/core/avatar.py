"""Validation rules for the owner profile portrait.

`app.core.storage` moves bytes around; this module decides whether bytes are an
acceptable portrait and what the canonical avatar URL is. The magic bytes are
authoritative: the client-declared content type is only a hint and a mismatch
between the two is a rejection, never a silent correction.
"""

from __future__ import annotations

# Canonical backend-relative URL of the portrait. The web layer builds its own
# same-origin URL from this contract; the stored filename is never exposed.
AVATAR_URL = "/api/v1/resume/profile/avatar"

# Detected content type -> leading magic bytes.
IMAGE_SIGNATURES: dict[str, bytes] = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",
}

ALLOWED_CONTENT_TYPES = frozenset(IMAGE_SIGNATURES)

# WebP is a RIFF container: bytes 0-3 are "RIFF" and bytes 8-11 are "WEBP".
_WEBP_MARKER = b"WEBP"


class AvatarValidationError(Exception):
    """Raised when an uploaded file is not an acceptable portrait.

    `detail` is the public message and `status_code` the HTTP status the API
    answers with. Neither ever contains a filesystem path or a filename.
    """

    def __init__(self, detail: str, status_code: int = 400) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def normalize_content_type(content_type: str | None) -> str:
    """Strip parameters and casing from a declared content type."""
    if not content_type:
        return ""
    return content_type.split(";", 1)[0].strip().lower()


def detect_content_type(data: bytes) -> str | None:
    """Return the content type implied by the magic bytes, or None."""
    for content_type, signature in IMAGE_SIGNATURES.items():
        if not data.startswith(signature):
            continue
        if content_type == "image/webp":
            if len(data) >= 12 and data[8:12] == _WEBP_MARKER:
                return content_type
            continue
        return content_type
    return None


def validate_avatar_payload(
    *,
    declared_content_type: str | None,
    declared_size: int | None,
    data: bytes,
    max_bytes: int,
) -> str:
    """Validate an uploaded portrait and return the detected content type.

    The order of the checks is fixed: declared type, declared size, empty payload,
    actual size, magic bytes. The first failure wins and no file is written.
    """
    declared = normalize_content_type(declared_content_type)
    if declared not in ALLOWED_CONTENT_TYPES:
        raise AvatarValidationError("Unsupported image type")
    if declared_size is not None and declared_size > max_bytes:
        raise AvatarValidationError("Avatar too large", status_code=413)
    if not data:
        raise AvatarValidationError("Invalid request")
    if len(data) > max_bytes:
        raise AvatarValidationError("Avatar too large", status_code=413)
    detected = detect_content_type(data)
    if detected is None or detected != declared:
        raise AvatarValidationError("Unsupported image type")
    return detected
