"""Storage for the owner profile portrait.

The API owns the image bytes. Routes depend on the `ProfileImageStore` protocol so the
storage mechanism can be replaced without touching route code. The only implementation
today stores files in a flat directory under `settings.MEDIA_ROOT`.
"""

from __future__ import annotations

import contextlib
import os
import tempfile
from pathlib import Path
from typing import Protocol, runtime_checkable
from uuid import uuid4

from app.core.config import settings

# Detected content type -> stored file extension. Never derived from the client filename.
CONTENT_TYPE_EXTENSIONS: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


class ProfileImageError(Exception):
    """Base class for avatar storage failures."""


class ProfileImageNotFound(ProfileImageError):
    """The referenced avatar file does not exist."""


class ProfileImageStorageUnavailable(ProfileImageError):
    """The media directory or the avatar file cannot be used."""


@runtime_checkable
class ProfileImageStore(Protocol):
    """Storage contract for the single owner portrait.

    `save` returns the stored filename, never a path. `read` and `delete` raise
    `ProfileImageNotFound` when the file is missing. `path_for` never escapes the
    configured media root.
    """

    def save(self, data: bytes, content_type: str) -> str: ...

    def read(self, filename: str) -> bytes: ...

    def delete(self, filename: str) -> None: ...

    def path_for(self, filename: str) -> Path: ...


class LocalProfileImageStore:
    """Flat-directory avatar store with atomic writes and path containment."""

    def __init__(self, root: Path | str | None = None) -> None:
        self._root = Path(root) if root is not None else Path(settings.MEDIA_ROOT)

    @property
    def root(self) -> Path:
        return self._root

    def _ensure_root(self) -> Path:
        try:
            self._root.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ProfileImageStorageUnavailable("avatar storage unavailable") from exc
        return self._root

    def path_for(self, filename: str) -> Path:
        """Resolve a stored filename inside the media root.

        A filename that could escape the root (path separators, traversal, absolute
        paths) is rejected instead of being sanitised, so a poisoned database value
        can never reach an arbitrary file.
        """
        if (
            not filename
            or filename != filename.strip()
            or filename in {".", ".."}
            or "/" in filename
            or "\\" in filename
            or "\x00" in filename
        ):
            raise ProfileImageStorageUnavailable("avatar storage unavailable")
        try:
            root = self._root.resolve()
            candidate = (root / filename).resolve()
        except OSError as exc:
            raise ProfileImageStorageUnavailable("avatar storage unavailable") from exc
        if not candidate.is_relative_to(root):
            raise ProfileImageStorageUnavailable("avatar storage unavailable")
        return candidate

    def save(self, data: bytes, content_type: str) -> str:
        extension = CONTENT_TYPE_EXTENSIONS.get(content_type)
        if extension is None:
            raise ValueError("unsupported avatar content type")
        root = self._ensure_root()
        filename = f"{uuid4().hex}.{extension}"
        target = self.path_for(filename)
        tmp_path: str | None = None
        try:
            handle, tmp_path = tempfile.mkstemp(dir=root, prefix=".avatar-", suffix=".tmp")
            with os.fdopen(handle, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(tmp_path, target)
        except OSError as exc:
            if tmp_path is not None:
                with contextlib.suppress(OSError):
                    os.unlink(tmp_path)
            raise ProfileImageStorageUnavailable("avatar storage unavailable") from exc
        return filename

    def read(self, filename: str) -> bytes:
        path = self.path_for(filename)
        try:
            return path.read_bytes()
        except FileNotFoundError as exc:
            raise ProfileImageNotFound("avatar not found") from exc
        except OSError as exc:
            raise ProfileImageStorageUnavailable("avatar storage unavailable") from exc

    def delete(self, filename: str) -> None:
        path = self.path_for(filename)
        try:
            path.unlink()
        except FileNotFoundError as exc:
            raise ProfileImageNotFound("avatar not found") from exc
        except OSError as exc:
            raise ProfileImageStorageUnavailable("avatar storage unavailable") from exc


def get_image_store() -> ProfileImageStore:
    """Request-scoped store bound to the current settings."""
    return LocalProfileImageStore(Path(settings.MEDIA_ROOT))
