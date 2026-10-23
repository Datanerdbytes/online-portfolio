"""Database-free tests for the owner portrait endpoints.

Uses stub SQLAlchemy sessions, a stub image store, and dependency overrides. No
PostgreSQL is created, modified, or dropped. The bearer dependency is exercised
through the real token verification; the rest of the behaviour is exercised with
test doubles so the suite runs without a database.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.avatar import get_current_owner
from app.core.auth import TokenClaims
from app.core.avatar import AvatarValidationError, validate_avatar_payload
from app.core.config import settings
from app.core.middleware import MULTIPART_OVERHEAD_BYTES, RequestBodyLimitMiddleware
from app.core.storage import (
    ProfileImageNotFound,
    ProfileImageStorageUnavailable,
    get_image_store,
)
from app.db.tenant import get_content_db as get_db
from app.main import app
from app.models.resume import Profile
from tests.neon_support import configure_neon, create_access_token, hash_password

AVATAR_PATH = "/api/v1/resume/profile/avatar"

TEST_SECRET = "test-secret-key-at-least-32-chars-long!"

OWNER_CLAIMS = TokenClaims(
    sub="portfolio-owner",
    iss="online-resume-api",
    aud="online-resume-web",
    iat=1_800_000_000,
    exp=1_800_000_900,
    jti="test-jti",
)


def _image_bytes(format):
    output = BytesIO()
    Image.new("RGB", (1600, 900), "navy").save(output, format=format)
    return output.getvalue()


PNG_BYTES = _image_bytes("PNG")
JPEG_BYTES = _image_bytes("JPEG")
WEBP_BYTES = _image_bytes("WEBP")


@pytest.mark.parametrize("kind", ["avatar", "banner"])
def test_corrupt_profile_image_is_rejected_before_storage(kind):
    store = StubStore()
    with _client(StubSession(first=_profile()), store) as client:
        response = client.put(
            f"/api/v1/resume/profile/{kind}",
            files=_upload(data=b"\x89PNG\r\n\x1a\n" + b"\x00" * 32),
        )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request"}
    assert not store.saved


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class StubQuery:
    def __init__(self, first_value):
        self.first_value = first_value

    def first(self):
        return self.first_value


class StubSession:
    def __init__(self, first=None, fail_commit=False, commit_exc=None):
        self.first_value = first
        self.fail_commit = fail_commit
        self.commit_exc = commit_exc or SQLAlchemyError("connection failed")
        self.committed = False
        self.rolled_back = False

    def query(self, *args, **kwargs):
        return StubQuery(self.first_value)

    def flush(self):
        pass

    def commit(self):
        if self.fail_commit:
            raise self.commit_exc
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class StubStore:
    """In-memory stand-in for the local avatar store."""

    def __init__(self, files=None, fail_save=False, fail_read=False):
        self.files = dict(files or {})
        self.fail_save = fail_save
        self.fail_read = fail_read
        self.saved = []
        self.deleted = []

    def save(self, data, content_type):
        if self.fail_save:
            raise ProfileImageStorageUnavailable("avatar storage unavailable")
        filename = f"avatar-{len(self.saved) + 1}.bin"
        self.files[filename] = data
        self.saved.append((filename, data, content_type))
        return filename

    def read(self, filename):
        if self.fail_read:
            raise ProfileImageStorageUnavailable("avatar storage unavailable")
        if filename not in self.files:
            raise ProfileImageNotFound("avatar not found")
        return self.files[filename]

    def delete(self, filename):
        if filename not in self.files:
            raise ProfileImageNotFound("avatar not found")
        del self.files[filename]
        self.deleted.append(filename)

    def path_for(self, filename):
        return Path(filename)


def _profile(**overrides) -> Profile:
    values = {
        "id": 1,
        "name": "Placeholder Name",
        "headline": "Placeholder headline",
        "introduction": "Placeholder introduction.",
        "about": "Placeholder about text.",
        "location": None,
        "avatar_filename": None,
        "avatar_content_type": None,
        "avatar_updated_at": None,
        "banner_filename": None,
        "banner_content_type": None,
        "banner_updated_at": None,
    }
    values.update(overrides)
    return Profile(**values)


@contextmanager
def _client(session=None, store=None, override_owner=True):
    if session is not None:
        app.dependency_overrides[get_db] = lambda: session
    if store is not None:
        app.dependency_overrides[get_image_store] = lambda: store
    if override_owner:
        app.dependency_overrides[get_current_owner] = lambda: OWNER_CLAIMS
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_image_store, None)
        app.dependency_overrides.pop(get_current_owner, None)


def _configure_auth(monkeypatch):
    configure_neon(monkeypatch)
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", TEST_SECRET)
    monkeypatch.setattr(settings, "OWNER_ID", "portfolio-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "owner-login")
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", hash_password("test-password"))


def _unconfigure_auth(monkeypatch):
    monkeypatch.setattr(settings, "NEON_AUTH_BASE_URL", None)
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", None)
    monkeypatch.setattr(settings, "OWNER_ID", None)
    monkeypatch.setattr(settings, "OWNER_USERNAME", None)
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", None)


def _upload(data=PNG_BYTES, content_type="image/png", filename="avatar.png"):
    return {"file": (filename, data, content_type)}


# ---------------------------------------------------------------------------
# Public read
# ---------------------------------------------------------------------------


class TestPublicRead:
    def test_get_without_profile_404(self):
        session = StubSession(first=None)
        with _client(session, StubStore()) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 404
        assert response.json() == {"detail": "Avatar not found"}
        assert response.headers["cache-control"] == "no-store"

    def test_get_without_avatar_404(self):
        session = StubSession(first=_profile())
        with _client(session, StubStore()) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 404
        assert response.json() == {"detail": "Avatar not found"}

    def test_get_requires_no_auth(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store, override_owner=False) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 200

    def test_get_returns_bytes_with_etag_and_cache_control(self):
        session = StubSession(
            first=_profile(avatar_filename="avatar-1.bin", avatar_content_type="image/png")
        )
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 200
        assert response.content == PNG_BYTES
        assert response.headers["content-type"] == "image/png"
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["etag"].startswith('"')
        assert len(response.headers["etag"]) == 66  # quoted sha256 hex

    def test_get_falls_back_to_octet_stream_without_content_type(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.get(AVATAR_PATH)
        assert response.headers["content-type"] == "application/octet-stream"

    def test_get_304_on_matching_etag(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            first = client.get(AVATAR_PATH)
            second = client.get(AVATAR_PATH, headers={"If-None-Match": first.headers["etag"]})
        assert second.status_code == 304
        assert second.content == b""
        assert second.headers["etag"] == first.headers["etag"]

    def test_get_404_when_file_missing_from_storage(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        with _client(session, StubStore()) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 404
        assert response.json() == {"detail": "Avatar not found"}

    def test_get_503_when_storage_unavailable(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES}, fail_read=True)
        with _client(session, store) as client:
            response = client.get(AVATAR_PATH)
        assert response.status_code == 503
        assert response.json() == {"detail": "Avatar storage unavailable"}
        assert response.headers["cache-control"] == "no-store"

    def test_get_never_exposes_the_stored_filename(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.get(AVATAR_PATH)
        assert "avatar-1.bin" not in response.text
        assert "avatar-1.bin" not in response.headers.get("etag", "")


class TestBanner:
    def test_public_read_returns_banner_bytes(self):
        profile = _profile(banner_filename="banner.png", banner_content_type="image/png")
        store = StubStore({"banner.png": PNG_BYTES})
        with _client(StubSession(first=profile), store, override_owner=False) as client:
            response = client.get("/api/v1/resume/profile/banner")
        assert response.status_code == 200
        assert response.content == PNG_BYTES
        assert response.headers["content-type"] == "image/png"

    def test_upload_banner_requires_owner_authentication(self, monkeypatch):
        _configure_auth(monkeypatch)
        with _client(StubSession(first=_profile()), StubStore(), override_owner=False) as client:
            response = client.put("/api/v1/resume/profile/banner", files=_upload())
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_upload_banner_does_not_replace_profile_avatar(self):
        profile = _profile(avatar_filename="profile-photo.jpg", avatar_content_type="image/jpeg")
        store = StubStore({"profile-photo.jpg": JPEG_BYTES})
        with _client(StubSession(first=profile), store) as client:
            response = client.put("/api/v1/resume/profile/banner", files=_upload())
        assert response.status_code == 200
        body = response.json()
        assert body["banner_url"] == "/api/v1/resume/profile/banner"
        assert body["banner_content_type"] == "image/webp"
        with Image.open(BytesIO(store.saved[0][1])) as banner:
            assert banner.size == (1200, 675)
        assert profile.banner_filename is not None
        assert profile.avatar_filename == "profile-photo.jpg"
        assert "profile-photo.jpg" in store.files

    def test_remove_banner_keeps_profile_avatar(self):
        profile = _profile(
            avatar_filename="profile-photo.jpg",
            avatar_content_type="image/jpeg",
            banner_filename="banner.png",
            banner_content_type="image/png",
        )
        store = StubStore({"profile-photo.jpg": JPEG_BYTES, "banner.png": PNG_BYTES})
        with _client(StubSession(first=profile), store) as client:
            response = client.delete("/api/v1/resume/profile/banner")
        assert response.status_code == 204
        assert profile.banner_filename is None
        assert profile.avatar_filename == "profile-photo.jpg"
        assert store.files == {"profile-photo.jpg": JPEG_BYTES}


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


class TestUpload:
    def test_upload_requires_auth_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        session = StubSession(first=_profile())
        with _client(session, StubStore(), override_owner=False) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"
        assert response.headers["cache-control"] == "no-store"

    def test_upload_with_non_owner_token_403(self, monkeypatch):
        _configure_auth(monkeypatch)
        token = create_access_token("someone-else", "foreign")
        session = StubSession(first=_profile())
        with _client(session, StubStore(), override_owner=False) as client:
            response = client.put(
                AVATAR_PATH, files=_upload(), headers={"Authorization": f"Bearer {token}"}
            )
        assert response.status_code == 401

    def test_upload_unconfigured_auth_503(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        session = StubSession(first=_profile())
        with _client(session, StubStore(), override_owner=False) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 503

    def test_upload_without_profile_404(self):
        session = StubSession(first=None)
        with _client(session, StubStore()) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 404
        assert response.json() == {"detail": "Profile not found"}

    def test_upload_without_file_part_400(self):
        session = StubSession(first=_profile())
        with _client(session, StubStore()) as client:
            response = client.put(AVATAR_PATH, files={})
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid request"}

    def test_upload_with_non_multipart_body_400(self):
        session = StubSession(first=_profile())
        with _client(session, StubStore()) as client:
            response = client.put(AVATAR_PATH, json={"not": "multipart"})
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid request"}

    @pytest.mark.parametrize("content_type", ["image/gif", "application/pdf", "text/plain", ""])
    def test_upload_unsupported_declared_type_400(self, content_type):
        session = StubSession(first=_profile())
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(content_type=content_type))
        assert response.status_code == 400
        assert response.json() == {"detail": "Unsupported image type"}
        assert store.saved == []

    def test_upload_signature_mismatch_400(self):
        session = StubSession(first=_profile())
        store = StubStore()
        # Declared PNG, but the bytes are a JPEG.
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(data=JPEG_BYTES))
        assert response.status_code == 400
        assert response.json() == {"detail": "Unsupported image type"}
        assert store.saved == []

    def test_upload_empty_payload_400(self):
        session = StubSession(first=_profile())
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(data=b""))
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid request"}
        assert store.saved == []

    def test_upload_oversized_payload_413(self):
        session = StubSession(first=_profile())
        store = StubStore()
        oversized = PNG_BYTES + b"\x00" * (settings.MAX_AVATAR_BYTES + 1)
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(data=oversized))
        assert response.status_code == 413
        assert response.json() == {"detail": "Avatar too large"}
        assert store.saved == []

    def test_upload_success_stores_file_and_updates_profile(self):
        profile = _profile()
        session = StubSession(first=profile)
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 200
        body = response.json()
        assert body["avatar_url"] == "/api/v1/resume/profile/avatar"
        assert body["avatar_content_type"] == "image/webp"
        assert body["avatar_updated_at"] is not None
        assert profile.avatar_filename is not None
        assert profile.avatar_filename not in body.values()
        assert len(store.saved) == 1
        with Image.open(BytesIO(store.saved[0][1])) as photo:
            assert photo.size == (512, 288)
            assert photo.format == "WEBP"
        assert store.saved[0][2] == "image/webp"
        assert session.committed is True

    @pytest.mark.parametrize(
        "data,content_type",
        [(PNG_BYTES, "image/png"), (JPEG_BYTES, "image/jpeg"), (WEBP_BYTES, "image/webp")],
    )
    def test_upload_accepts_every_allowed_type(self, data, content_type):
        session = StubSession(first=_profile())
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(data=data, content_type=content_type))
        assert response.status_code == 200
        assert response.json()["avatar_content_type"] == "image/webp"

    def test_upload_ignores_the_client_filename(self):
        session = StubSession(first=_profile())
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(filename="../../etc/passwd"))
        assert response.status_code == 200
        assert "passwd" not in response.json()["avatar_url"]
        assert store.saved[0][0] == "avatar-1.bin"

    def test_upload_replaces_and_removes_the_previous_file(self):
        profile = _profile(avatar_filename="old.bin")
        session = StubSession(first=profile)
        store = StubStore({"old.bin": JPEG_BYTES})
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 200
        assert store.deleted == ["old.bin"]
        assert "old.bin" not in store.files
        assert profile.avatar_filename != "old.bin"

    def test_upload_commit_failure_keeps_the_previous_avatar(self):
        profile = _profile(avatar_filename="old.bin")
        session = StubSession(first=profile, fail_commit=True)
        store = StubStore({"old.bin": JPEG_BYTES})
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 400
        assert response.json() == {"detail": "Avatar upload failed"}
        assert session.rolled_back is True
        assert session.committed is False
        # The new file is removed, the previous portrait survives.
        assert list(store.files) == ["old.bin"]

    def test_upload_storage_unavailable_503(self):
        session = StubSession(first=_profile())
        store = StubStore(fail_save=True)
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.status_code == 503
        assert response.json() == {"detail": "Avatar storage unavailable"}

    def test_upload_response_is_not_cached(self):
        session = StubSession(first=_profile())
        with _client(session, StubStore()) as client:
            response = client.put(AVATAR_PATH, files=_upload())
        assert response.headers["cache-control"] == "no-store"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


class TestDelete:
    def test_delete_requires_auth_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        with _client(session, StubStore(), override_owner=False) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_delete_clears_metadata_and_removes_the_file(self):
        profile = _profile(avatar_filename="avatar-1.bin")
        session = StubSession(first=profile)
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 204
        assert response.content == b""
        assert profile.avatar_filename is None
        assert profile.avatar_content_type is None
        assert profile.avatar_updated_at is None
        assert store.files == {}
        assert session.committed is True

    def test_delete_without_avatar_404(self):
        session = StubSession(first=_profile())
        with _client(session, StubStore()) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 404
        assert response.json() == {"detail": "Avatar not found"}

    def test_delete_without_profile_404(self):
        session = StubSession(first=None)
        with _client(session, StubStore()) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 404
        assert response.json() == {"detail": "Profile not found"}

    def test_delete_missing_file_still_succeeds(self):
        profile = _profile(avatar_filename="avatar-1.bin")
        session = StubSession(first=profile)
        store = StubStore()  # file already gone
        with _client(session, store) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 204
        assert profile.avatar_filename is None
        assert session.committed is True

    def test_delete_commit_failure_400(self):
        profile = _profile(avatar_filename="avatar-1.bin")
        session = StubSession(first=profile, fail_commit=True)
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.delete(AVATAR_PATH)
        assert response.status_code == 400
        assert response.json() == {"detail": "Avatar removal failed"}
        assert session.rolled_back is True
        # The stored file is kept because the metadata change was not persisted.
        assert "avatar-1.bin" in store.files

    def test_delete_response_is_not_cached(self):
        session = StubSession(first=_profile(avatar_filename="avatar-1.bin"))
        store = StubStore({"avatar-1.bin": PNG_BYTES})
        with _client(session, store) as client:
            response = client.delete(AVATAR_PATH)
        assert response.headers["cache-control"] == "no-store"


# ---------------------------------------------------------------------------
# Validator unit tests
# ---------------------------------------------------------------------------


class TestValidator:
    def test_declared_size_over_limit_413(self):
        with pytest.raises(AvatarValidationError) as exc:
            validate_avatar_payload(
                declared_content_type="image/png",
                declared_size=11,
                data=PNG_BYTES,
                max_bytes=10,
            )
        assert exc.value.status_code == 413
        assert exc.value.detail == "Avatar too large"

    def test_actual_size_over_limit_413(self):
        with pytest.raises(AvatarValidationError) as exc:
            validate_avatar_payload(
                declared_content_type="image/png",
                declared_size=5,
                data=b"x" * 11,
                max_bytes=10,
            )
        assert exc.value.status_code == 413

    def test_empty_payload_400(self):
        with pytest.raises(AvatarValidationError) as exc:
            validate_avatar_payload(
                declared_content_type="image/png",
                declared_size=0,
                data=b"",
                max_bytes=10,
            )
        assert exc.value.status_code == 400
        assert exc.value.detail == "Invalid request"

    def test_unsupported_declared_type_is_checked_first(self):
        with pytest.raises(AvatarValidationError) as exc:
            validate_avatar_payload(
                declared_content_type="image/gif",
                declared_size=9999,
                data=b"",
                max_bytes=10,
            )
        assert exc.value.detail == "Unsupported image type"

    def test_content_type_parameters_are_ignored(self):
        detected = validate_avatar_payload(
            declared_content_type="image/png; charset=binary",
            declared_size=len(PNG_BYTES),
            data=PNG_BYTES,
            max_bytes=len(PNG_BYTES),
        )
        assert detected == "image/png"

    def test_riff_without_webp_marker_is_rejected(self):
        with pytest.raises(AvatarValidationError) as exc:
            validate_avatar_payload(
                declared_content_type="image/webp",
                declared_size=16,
                data=b"RIFF" + b"\x00" * 12,
                max_bytes=1024,
            )
        assert exc.value.detail == "Unsupported image type"


# ---------------------------------------------------------------------------
# Request body limit middleware
# ---------------------------------------------------------------------------


async def _echo_app(scope, receive, send):
    body = b""
    while True:
        message = await receive()
        body += message.get("body", b"")
        if not message.get("more_body", False):
            break
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-length", str(len(body)).encode("ascii"))],
        }
    )
    await send({"type": "http.response.body", "body": body})


def _run_asgi(application, method="PUT", path="/x", body=b"", headers=None):
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "root_path": "",
        "headers": headers or [],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
    }

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    sent = []

    async def send(message):
        sent.append(message)

    asyncio.run(application(scope, receive, send))
    return sent


def _limited_app(max_bytes, method="PUT", path="/x"):
    return RequestBodyLimitMiddleware(_echo_app, max_bytes=max_bytes, method=method, path=path)


class TestRequestBodyLimitMiddleware:
    def test_body_within_limit_is_replayed(self):
        sent = _run_asgi(_limited_app(10), body=b"12345")
        assert sent[0]["status"] == 200
        assert sent[1]["body"] == b"12345"

    def test_body_exactly_at_limit_is_accepted(self):
        sent = _run_asgi(_limited_app(5), body=b"12345")
        assert sent[0]["status"] == 200
        assert sent[1]["body"] == b"12345"

    def test_streamed_body_over_limit_is_rejected(self):
        sent = _run_asgi(_limited_app(10), body=b"x" * 11)
        assert sent[0]["status"] == 413
        assert sent[1]["body"] == b'{"detail":"Avatar too large"}'

    def test_declared_length_over_limit_is_rejected_without_reading(self):
        headers = [(b"content-length", b"100")]
        sent = _run_asgi(_limited_app(10), body=b"", headers=headers)
        assert sent[0]["status"] == 413
        assert dict(sent[0]["headers"])[b"cache-control"] == b"no-store"

    def test_other_paths_are_not_guarded(self):
        sent = _run_asgi(_limited_app(10, path="/x"), method="PUT", path="/other", body=b"x" * 50)
        assert sent[0]["status"] == 200
        assert len(sent[1]["body"]) == 50

    def test_other_methods_are_not_guarded(self):
        sent = _run_asgi(_limited_app(10), method="POST", body=b"x" * 50)
        assert sent[0]["status"] == 200
        assert len(sent[1]["body"]) == 50

    def test_rejection_body_declares_its_length(self):
        sent = _run_asgi(_limited_app(10), body=b"x" * 11)
        headers = dict(sent[0]["headers"])
        assert headers[b"content-type"] == b"application/json"
        assert int(headers[b"content-length"]) == len(sent[1]["body"])


class TestMiddlewareWiring:
    def test_oversized_upload_is_rejected_before_the_route(self):
        # The body exceeds MAX_AVATAR_BYTES plus the multipart overhead, so the
        # transport guard answers instead of the route.
        oversized = PNG_BYTES + b"\x00" * (settings.MAX_AVATAR_BYTES + MULTIPART_OVERHEAD_BYTES)
        session = StubSession(first=_profile())
        store = StubStore()
        with _client(session, store) as client:
            response = client.put(AVATAR_PATH, files=_upload(data=oversized))
        assert response.status_code == 413
        assert response.json() == {"detail": "Avatar too large"}
        assert store.saved == []
        assert session.committed is False
