"""Database-free failure checks plus opt-in real PostgreSQL hosting checks."""

from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core import storage
from app.core.config import settings


def test_storage_selection_and_limits(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_STORAGE", "database")
    store = storage.get_image_store()
    assert isinstance(store, storage.DatabaseProfileImageStore)
    with pytest.raises(storage.ProfileImageStorageUnavailable):
        store.read("../private")
    with pytest.raises(storage.ProfileImageStorageUnavailable):
        store.save(b"x" * (settings.MAX_AVATAR_BYTES + 1), "image/png")


def test_database_readiness_hides_errors(monkeypatch):
    from fastapi.testclient import TestClient

    from app.api.v1 import health
    from app.main import app

    broken = MagicMock()
    broken.connect.side_effect = OperationalError("query", {}, Exception("private detail"))
    monkeypatch.setattr(health, "engine", broken)
    with TestClient(app) as client:
        response = client.get("/api/v1/ready")
        assert response.status_code == 503
        assert response.json() == {"detail": "Database unavailable"}
        assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_hosted_storage_and_concurrent_limits(integration_db, monkeypatch):
    if integration_db is None:
        pytest.skip("requires explicitly isolated integration database")
    engine = create_engine(integration_db)
    monkeypatch.setattr(storage, "SessionLocal", sessionmaker(bind=engine))
    store = storage.DatabaseProfileImageStore()
    try:
        data = b"bounded image bytes already validated by the route"
        filename = store.save(data, "image/png")
        # A separate store/session must see the bytes, as another instance would.
        assert storage.DatabaseProfileImageStore().read(filename) == data
        store.delete(filename)
        with pytest.raises(storage.ProfileImageNotFound):
            store.read(filename)
        with pytest.raises(storage.ProfileImageNotFound):
            store.delete(filename)

    finally:
        engine.dispose()
