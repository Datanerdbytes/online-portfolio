"""Database-free failure checks plus opt-in real PostgreSQL hosting checks."""

from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core import auth, storage
from app.core.config import settings


def test_database_limiter_fails_closed(monkeypatch):
    broken = MagicMock()
    broken.begin.side_effect = OperationalError("query", {}, Exception("private detail"))
    monkeypatch.setattr(auth, "engine", broken)
    with pytest.raises(HTTPException) as caught:
        auth.check_database_login_limit()
    assert caught.value.status_code == 503
    assert caught.value.detail == "Administration unavailable"


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
    monkeypatch.setattr(auth, "engine", engine)
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

        def attempt(_):
            try:
                auth.check_database_login_limit()
                return 200
            except HTTPException as exc:
                return exc.status_code

        with ThreadPoolExecutor(max_workers=10) as workers:
            statuses = list(workers.map(attempt, range(10)))
        assert statuses.count(200) == settings.LOGIN_RATE_LIMIT_ATTEMPTS
        assert statuses.count(429) == 10 - settings.LOGIN_RATE_LIMIT_ATTEMPTS
        # Expired windows reset the shared bucket, independent of process state.
        with engine.begin() as connection:
            connection.execute(text('UPDATE login_buckets SET "window" = 0'))
        auth.check_database_login_limit()
        # Simulate a newer-window request winning the row lock before a delayed
        # older-window request. The delayed request must not reset the counter.
        limit = settings.LOGIN_RATE_LIMIT_ATTEMPTS
        with engine.begin() as connection:
            newer_window = connection.execute(
                text(
                    'UPDATE login_buckets SET "window" = '
                    "floor(extract(epoch FROM CURRENT_TIMESTAMP) / :seconds)::bigint + 1, "
                    'attempts = :limit RETURNING "window"'
                ),
                {"seconds": settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS, "limit": limit},
            ).scalar_one()
        with pytest.raises(HTTPException) as caught:
            auth.check_database_login_limit()
        assert caught.value.status_code == 429
        with engine.connect() as connection:
            window, attempts = connection.execute(
                text('SELECT "window", attempts FROM login_buckets')
            ).one()
        assert window == newer_window
        assert attempts == limit + 1
    finally:
        engine.dispose()
