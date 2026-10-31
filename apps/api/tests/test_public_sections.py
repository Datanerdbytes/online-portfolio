"""Per-section public reads; database-free session doubles."""

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.db.tenant import get_public_db
from app.main import app

PUBLIC_USER_ID = "acct-1"
SECTIONS = ("about", "skills", "experience", "education", "contact")


class FailingSession:
    """A session stand-in whose queries always fail, used to exercise the 503 path."""

    info = {"user_id": "snapshot-1", "public_user_id": PUBLIC_USER_ID}

    def query(self, *args, **kwargs):
        raise SQLAlchemyError("connection failed")

    def close(self):
        pass


@contextmanager
def _client_with_public_session(session):
    app.dependency_overrides[get_public_db] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_public_db, None)


def _profile() -> SimpleNamespace:
    return SimpleNamespace(
        id=1,
        name="Ada Lovelace",
        headline="Analyst",
        introduction="An introduction.",
        about="About text",
        location="Remote",
        avatar_url="/api/v1/resume/profile/avatar",
        avatar_updated_at=None,
        avatar_content_type="image/png",
        banner_url="/api/v1/resume/profile/banner",
        banner_updated_at=None,
        banner_content_type="image/png",
    )


def _session(**info) -> MagicMock:
    session = MagicMock()
    session.info = {"user_id": "snapshot-1", "public_user_id": PUBLIC_USER_ID, **info}
    return session


def test_section_routes_are_registered_on_both_mounts():
    paths = app.openapi()["paths"]
    for section in SECTIONS:
        assert f"/api/v1/public/{section}" in paths
        assert f"/api/v1/public/users/{{user_id}}/{section}" in paths


def test_about_rewrites_media_urls():
    session = _session()
    session.query.return_value.first.return_value = _profile()

    with _client_with_public_session(session) as client:
        response = client.get("/api/v1/public/users/acct-1/about")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Ada Lovelace"
    assert body["avatar_url"] == (f"/api/v1/public/users/{PUBLIC_USER_ID}/resume/profile/avatar")
    assert body["banner_url"] == (f"/api/v1/public/users/{PUBLIC_USER_ID}/resume/profile/banner")
    assert response.headers["cache-control"] == "no-store"


def test_about_without_images_returns_nulls():
    profile = _profile()
    profile.avatar_url = None
    profile.banner_url = None
    session = _session()
    session.query.return_value.first.return_value = profile

    with _client_with_public_session(session) as client:
        response = client.get("/api/v1/public/about")

    assert response.status_code == 200
    assert response.json()["avatar_url"] is None
    assert response.json()["banner_url"] is None


def test_about_missing_returns_404():
    session = _session()
    session.query.return_value.first.return_value = None

    with _client_with_public_session(session) as client:
        response = client.get("/api/v1/public/about")

    assert response.status_code == 404
    assert response.json() == {"detail": "Profile not found"}


def test_list_sections_return_items_envelope():
    for section in ("skills", "experience", "education"):
        session = _session()
        session.query.return_value.options.return_value.order_by.return_value.all.return_value = []
        session.query.return_value.order_by.return_value.all.return_value = []

        with _client_with_public_session(session) as client:
            response = client.get(f"/api/v1/public/{section}")

        assert response.status_code == 200, section
        assert response.json() == {"items": []}, section


def test_contact_returns_details():
    contact = SimpleNamespace(id=3, phone="+15555550100", email="ada@example.com", links=[])
    session = _session()
    session.query.return_value.options.return_value.first.return_value = contact

    with _client_with_public_session(session) as client:
        response = client.get("/api/v1/public/contact")

    assert response.status_code == 200
    assert response.json() == {
        "id": 3,
        "phone": "+15555550100",
        "email": "ada@example.com",
        "links": [],
    }


def test_contact_missing_returns_404():
    session = _session()
    session.query.return_value.options.return_value.first.return_value = None

    with _client_with_public_session(session) as client:
        response = client.get("/api/v1/public/contact")

    assert response.status_code == 404
    assert response.json() == {"detail": "Contact not found"}


def test_database_failure_returns_sanitized_503():
    with _client_with_public_session(FailingSession()) as client:
        response = client.get("/api/v1/public/skills")

    assert response.status_code == 503
    assert response.json() == {"detail": "Portfolio service unavailable"}
    detail = response.json()["detail"].lower()
    for secret in ["postgresql", "5432", "password", "://", "credential"]:
        assert secret not in detail, f"leaked secret fragment: {secret!r}"
    assert response.headers["cache-control"] == "no-store"
