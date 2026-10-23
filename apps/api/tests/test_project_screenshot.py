from __future__ import annotations

from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.project_screenshot import get_current_owner
from app.core.auth import hash_password
from app.core.config import settings
from app.core.storage import ProfileImageNotFound, get_image_store
from app.db.session import get_db
from app.main import app
from app.models.project import Project

SCREENSHOT_PATH = "/api/v1/projects/sample-project/screenshot"
_png = BytesIO()
Image.new("RGB", (800, 450), "navy").save(_png, format="PNG")
PNG_BYTES = _png.getvalue()


class StubQuery:
    def __init__(self, project):
        self.project = project

    def filter(self, *_args, **_kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self.project


class StubSession:
    def __init__(self, project, *, fail_commit=False):
        self.project = project
        self.fail_commit = fail_commit
        self.committed = False
        self.rolled_back = False

    def query(self, *_args, **_kwargs):
        return StubQuery(self.project)

    def flush(self):
        pass

    def refresh(self, _project):
        pass

    def commit(self):
        if self.fail_commit:
            raise SQLAlchemyError("private database details")
        self.committed = True

    def rollback(self):
        self.rolled_back = True


class StubStore:
    def __init__(self, files=None):
        self.files = dict(files or {})
        self.saved = []
        self.deleted = []

    def save(self, data, content_type):
        extension = "webp" if content_type == "image/webp" else "png"
        filename = f"screenshot-{len(self.saved) + 1}.{extension}"
        self.files[filename] = data
        self.saved.append((filename, data, content_type))
        return filename

    def read(self, filename):
        try:
            return self.files[filename]
        except KeyError:
            raise ProfileImageNotFound("missing") from None

    def delete(self, filename):
        if filename not in self.files:
            raise ProfileImageNotFound("missing")
        del self.files[filename]
        self.deleted.append(filename)

    def path_for(self, filename):
        return Path(filename)


def _project(**overrides):
    values = {
        "id": 1,
        "slug": "sample-project",
        "title": "Sample project",
        "summary": "Project summary",
        "technologies": ["Python"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 0,
        "is_sample": True,
        "screenshot_filename": None,
        "screenshot_content_type": None,
        "screenshot_updated_at": None,
    }
    values.update(overrides)
    return Project(**values)


@contextmanager
def _client(session=None, store=None, *, override_owner=True):
    if session is not None:
        app.dependency_overrides[get_db] = lambda: session
    if store is not None:
        app.dependency_overrides[get_image_store] = lambda: store
    if override_owner:
        app.dependency_overrides[get_current_owner] = lambda: object()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_image_store, None)
        app.dependency_overrides.pop(get_current_owner, None)


def _configure_auth(monkeypatch):
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "test-secret-key-at-least-32-chars-long!")
    monkeypatch.setattr(settings, "OWNER_ID", "portfolio-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "owner-login")
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", hash_password("test-password"))


def test_public_screenshot_read_has_etag_and_does_not_require_owner():
    project = _project(
        screenshot_filename="screen.png",
        screenshot_content_type="image/png",
    )
    store = StubStore({"screen.png": PNG_BYTES})
    with _client(StubSession(project), store, override_owner=False) as client:
        first = client.get(SCREENSHOT_PATH)
        cached = client.get(
            SCREENSHOT_PATH,
            headers={"If-None-Match": first.headers["etag"]},
        )

    assert first.status_code == 200
    assert first.content == PNG_BYTES
    assert first.headers["content-type"] == "image/png"
    assert first.headers["cache-control"] == "public, max-age=300, must-revalidate"
    assert cached.status_code == 304


def test_upload_saves_metadata_and_returns_public_url():
    project = _project()
    session, store = StubSession(project), StubStore()
    with _client(session, store) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("screenshot.png", PNG_BYTES, "image/png")},
        )

    assert response.status_code == 200
    assert response.json()["screenshot_url"] == SCREENSHOT_PATH
    assert response.json()["screenshot_updated_at"]
    assert "screenshot_filename" not in response.json()
    assert project.screenshot_content_type == "image/webp"
    with Image.open(BytesIO(store.saved[0][1])) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == (400, 225)
    assert session.committed


def test_upload_replaces_previous_file_after_commit():
    project = _project(
        screenshot_filename="old.png",
        screenshot_content_type="image/png",
    )
    session, store = StubSession(project), StubStore({"old.png": PNG_BYTES})
    with _client(session, store) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("new.png", PNG_BYTES, "image/png")},
        )

    assert response.status_code == 200
    assert store.deleted == ["old.png"]
    assert project.screenshot_filename == "screenshot-1.webp"


def test_upload_validation_failure_does_not_store_file():
    store = StubStore()
    with _client(StubSession(_project()), store) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("not-image.png", b"not an image", "image/png")},
        )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unsupported image type"}
    assert not store.saved


def test_upload_database_failure_removes_new_file_and_sanitizes_error():
    session, store = StubSession(_project(), fail_commit=True), StubStore()
    with _client(session, store) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("screenshot.png", PNG_BYTES, "image/png")},
        )

    assert response.status_code == 503
    assert "private database details" not in response.text
    assert store.deleted == ["screenshot-1.webp"]
    assert session.rolled_back


def test_remove_screenshot_clears_metadata_and_deletes_file():
    project = _project(
        screenshot_filename="screen.png",
        screenshot_content_type="image/png",
    )
    session, store = StubSession(project), StubStore({"screen.png": PNG_BYTES})
    with _client(session, store) as client:
        response = client.delete(SCREENSHOT_PATH)

    assert response.status_code == 204
    assert project.screenshot_filename is None
    assert project.screenshot_content_type is None
    assert project.screenshot_updated_at is None
    assert store.deleted == ["screen.png"]
    assert session.committed


def test_upload_requires_authenticated_owner(monkeypatch):
    _configure_auth(monkeypatch)
    with _client(StubSession(_project()), StubStore(), override_owner=False) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("screenshot.png", PNG_BYTES, "image/png")},
        )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_upload_rejects_forged_image_signature_before_storage():
    store = StubStore()
    with _client(StubSession(_project()), store) as client:
        response = client.put(
            SCREENSHOT_PATH,
            files={"file": ("broken.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png")},
        )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid request"}
    assert not store.saved
