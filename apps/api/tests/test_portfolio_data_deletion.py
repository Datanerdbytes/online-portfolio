"""Database-free tests for DELETE /api/v1/portfolio/data.

Uses stub sessions, dependency overrides, and monkeypatched media helpers.
No PostgreSQL is created, modified, or dropped. Authentication is exercised
through the real dependency in a dedicated test; the rest override ``owner_id``
to focus on deletion ordering, media cleanup, and failure handling.
"""

from contextlib import contextmanager
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1 import portfolio
from app.api.v1.portfolio import owner_id
from app.core.storage import ProfileImageError, get_image_store
from app.db.session import get_db
from app.main import app
from app.models.owner import PortfolioPublication
from tests.neon_support import configure_neon

OWNER_ID = "owner-1"
SNAPSHOT_ID = "snapshot-1"


class DataWipeSession:
    def __init__(self, publication, account, snapshot):
        self.publication = publication
        self.account = account
        self.snapshot = snapshot
        self.deleted = []
        self.committed = False
        self.rolled_back = False
        self.commit_exc = None

    def scalar(self, *_args, **_kwargs):
        return self.publication

    def connection(self):
        return Mock()

    def get(self, _model, primary_key):
        if primary_key == SNAPSHOT_ID:
            return self.snapshot
        return self.account

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        if self.commit_exc is not None:
            raise self.commit_exc
        self.committed = True

    def rollback(self):
        self.rolled_back = True


@contextmanager
def _client(session=None, store=None):
    if session is not None:
        app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[owner_id] = lambda: OWNER_ID
    if store is not None:
        app.dependency_overrides[get_image_store] = lambda: store
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(owner_id, None)
        app.dependency_overrides.pop(get_image_store, None)


@pytest.fixture
def media_helpers(monkeypatch):
    """Patch publishing helpers; returns (filenames, referenced) registries."""
    filenames: dict[str, set[str]] = {}
    referenced: set[str] = set()

    def fake_content_image_filenames(_connection, owner):
        return set(filenames.get(owner, set()))

    def fake_image_is_referenced(_db, filename):
        return filename in referenced

    monkeypatch.setattr(portfolio, "content_image_filenames", fake_content_image_filenames)
    monkeypatch.setattr(portfolio, "image_is_referenced", fake_image_is_referenced)
    return filenames, referenced


def _publication(**overrides):
    values = {
        "owner_id": OWNER_ID,
        "snapshot_owner_id": SNAPSHOT_ID,
        "is_published": True,
        "draft_revision": 3,
        "published_revision": 3,
    }
    values.update(overrides)
    return PortfolioPublication(**values)


class TestDeleteAllData:
    def test_returns_204_and_removes_publication_and_owners(self, media_helpers):
        publication = _publication()
        session = DataWipeSession(publication, account=object(), snapshot=object())
        with _client(session) as client:
            response = client.delete("/api/v1/portfolio/data")
        assert response.status_code == 204
        assert response.content == b""
        assert session.deleted == [publication, session.snapshot, session.account]
        assert session.committed is True

    def test_without_publication_still_deletes_account(self, media_helpers):
        session = DataWipeSession(None, account=object(), snapshot=None)
        with _client(session) as client:
            response = client.delete("/api/v1/portfolio/data")
        assert response.status_code == 204
        assert session.deleted == [session.account]
        assert session.committed is True

    def test_deletes_unreferenced_media_after_commit(self, media_helpers):
        filenames, referenced = media_helpers
        filenames[OWNER_ID] = {"avatar-a.png", "shot-b.png"}
        filenames[SNAPSHOT_ID] = {"banner-c.png"}
        referenced.add("avatar-a.png")
        session = DataWipeSession(_publication(), account=object(), snapshot=object())
        store = Mock()

        def assert_commit_before_cleanup(filename):
            assert session.committed

        store.delete.side_effect = assert_commit_before_cleanup
        with _client(session, store=store) as client:
            response = client.delete("/api/v1/portfolio/data")

        assert response.status_code == 204
        assert {call.args[0] for call in store.delete.call_args_list} == {
            "shot-b.png",
            "banner-c.png",
        }

    def test_media_cleanup_failure_still_succeeds(self, media_helpers):
        filenames, _referenced = media_helpers
        filenames[OWNER_ID] = {"avatar-a.png"}
        session = DataWipeSession(_publication(), account=object(), snapshot=object())
        store = Mock()
        store.delete.side_effect = ProfileImageError("boom")
        with _client(session, store=store) as client:
            response = client.delete("/api/v1/portfolio/data")
        assert response.status_code == 204
        assert session.committed is True

    def test_database_failure_returns_503_and_rolls_back(self, media_helpers):
        session = DataWipeSession(_publication(), account=object(), snapshot=object())
        session.commit_exc = SQLAlchemyError("connection failed")
        with _client(session) as client:
            response = client.delete("/api/v1/portfolio/data")
        assert response.status_code == 503
        assert response.json()["detail"] == "Portfolio service temporarily unavailable."
        assert session.rolled_back is True
        assert session.committed is False
        assert len(session.deleted) == 3

    def test_requires_authentication(self, monkeypatch):
        # Configure managed auth explicitly: the auth dependency fails closed with
        # 503 when no provider is configured, so the 401 path is only reachable
        # once a provider URL is set. This must not depend on a developer's .env.
        configure_neon(monkeypatch)
        with TestClient(app) as client:
            response = client.delete("/api/v1/portfolio/data")
        assert response.status_code == 401
