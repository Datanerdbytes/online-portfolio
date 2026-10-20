"""Opt-in PostgreSQL integration tests for project CRUD and atomic reorder.

Requires ``--run-integration`` and ``TEST_DATABASE_ADMIN_URL``. The conftest
fixtures create a uniquely named disposable database and tear it down; no
developer database is ever touched. Default (non-integration) runs skip these
tests without connecting to PostgreSQL.
"""

import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.projects import get_current_owner
from app.core.auth import TokenClaims, hash_password
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.project import Project

OWNER_CLAIMS = TokenClaims(
    sub="portfolio-owner",
    iss="online-resume-api",
    aud="online-resume-web",
    iat=1_800_000_000,
    exp=1_800_000_900,
    jti="integration-jti",
)


@pytest.fixture(autouse=True)
def _override_owner():
    app.dependency_overrides[get_current_owner] = lambda: OWNER_CLAIMS
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_owner, None)


@pytest.fixture
def crud_engine(integration_db):
    if integration_db is None:
        pytest.skip("requires --run-integration and TEST_DATABASE_ADMIN_URL")
    # integration_db is the run-owned disposable database, never DATABASE_URL.
    engine = create_engine(integration_db)
    try:
        yield engine
    finally:
        # Requests commit for real; remove only records in the run-owned database.
        try:
            with engine.begin() as connection:
                connection.execute(delete(Project))
        except SQLAlchemyError:
            raise RuntimeError("Disposable project fixture cleanup failed") from None
        finally:
            engine.dispose()


@pytest.fixture
def db_session(crud_engine):
    with Session(crud_engine) as session:
        yield session


@pytest.fixture
def client(crud_engine):
    def request_session():
        with Session(crud_engine) as session:
            yield session

    app.dependency_overrides[get_db] = request_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


def persisted(engine):
    # Fresh connection observes actual committed state, not a session identity map.
    with engine.connect() as connection:
        return {
            row.slug: dict(row._mapping) for row in connection.execute(select(Project.__table__))
        }


def _project_payload(slug="resume-site", **overrides):
    payload = {
        "slug": slug,
        "title": "Resume site",
        "summary": "Portfolio application.",
        "technologies": ["Next.js", "FastAPI"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 0,
    }
    payload.update(overrides)
    return payload


class TestCreatePersistence:
    def test_create_persists_with_sample_false(self, db_session, client: TestClient, crud_engine):
        response = client.post("/api/v1/projects", json=_project_payload())
        assert response.status_code == 201
        body = response.json()
        assert isinstance(body["id"], int) and body["id"] > 0
        assert body["slug"] == "resume-site"
        assert body["is_sample"] is False

        list_response = client.get("/api/v1/projects")
        assert list_response.status_code == 200
        items = list_response.json()["items"]
        assert len(items) == 1
        assert items[0]["is_sample"] is False
        assert persisted(crud_engine)["resume-site"]["id"] == body["id"]

    def test_duplicate_slug_returns_409(self, db_session, client: TestClient):
        first = client.post("/api/v1/projects", json=_project_payload())
        assert first.status_code == 201

        second = client.post("/api/v1/projects", json=_project_payload())
        assert second.status_code == 409
        assert second.json() == {"detail": "Project with this slug already exists"}

    def test_update_preserves_is_sample(self, db_session, client: TestClient):
        client.post("/api/v1/projects", json=_project_payload())

        response = client.put(
            "/api/v1/projects/resume-site",
            json={
                "title": "Updated title",
                "summary": "Updated summary.",
                "technologies": [],
                "repository_url": None,
                "demo_url": None,
                "display_order": 3,
            },
        )
        assert response.status_code == 200
        assert response.json()["is_sample"] is False


class TestReorderAtomic:
    def test_reorder_updates_in_single_transaction(
        self, db_session, client: TestClient, crud_engine
    ):
        db_session.add_all(
            [
                Project(
                    slug="a",
                    title="A",
                    summary="S",
                    technologies=[],
                    display_order=1,
                    is_sample=False,
                ),
                Project(
                    slug="b",
                    title="B",
                    summary="S",
                    technologies=[],
                    display_order=2,
                    is_sample=False,
                ),
            ]
        )
        db_session.commit()

        response = client.post(
            "/api/v1/projects/reorder",
            json={
                "orders": [
                    {"slug": "a", "display_order": 5},
                    {"slug": "b", "display_order": 6},
                ]
            },
        )
        assert response.status_code == 200
        assert response.json() == {"updated": 2}

        items = client.get("/api/v1/projects").json()["items"]
        by_slug = {item["slug"]: item for item in items}
        assert by_slug["a"]["display_order"] == 5
        assert by_slug["b"]["display_order"] == 6
        assert persisted(crud_engine)["a"]["display_order"] == 5
        assert persisted(crud_engine)["b"]["display_order"] == 6

    def test_reorder_missing_target_404_no_partial_write(
        self, db_session, client: TestClient, crud_engine
    ):
        db_session.add(
            Project(
                slug="a",
                title="A",
                summary="S",
                technologies=[],
                display_order=1,
                is_sample=False,
            )
        )
        db_session.commit()

        response = client.post(
            "/api/v1/projects/reorder",
            json={
                "orders": [
                    {"slug": "a", "display_order": 9},
                    {"slug": "missing", "display_order": 2},
                ]
            },
        )
        assert response.status_code == 404

        items = client.get("/api/v1/projects").json()["items"]
        assert len(items) == 1
        assert items[0]["display_order"] == 1
        assert persisted(crud_engine)["a"]["display_order"] == 1


def test_real_bearer_crud_and_sample_preservation(client, db_session, crud_engine, monkeypatch):
    app.dependency_overrides.pop(get_current_owner)
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "test-integration-secret-at-least-32-bytes!")
    monkeypatch.setattr(settings, "OWNER_ID", "test-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "test-owner")
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", hash_password("test-password"))
    login = client.post(
        "/api/v1/auth/login", json={"username": "test-owner", "password": "test-password"}
    )
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert (
        client.post("/api/v1/projects", json=_project_payload(), headers=headers).status_code == 201
    )
    assert persisted(crud_engine)["resume-site"]["is_sample"] is False
    project = db_session.scalar(select(Project).where(Project.slug == "resume-site"))
    project.is_sample = True
    db_session.commit()
    replacement = _project_payload(title="Updated", repository_url="https://example.com/repo")
    replacement.pop("slug")
    assert (
        client.put("/api/v1/projects/resume-site", json=replacement, headers=headers).status_code
        == 200
    )
    assert persisted(crud_engine)["resume-site"]["is_sample"] is True
    assert (
        client.patch(
            "/api/v1/projects/resume-site", json={"repository_url": None}, headers=headers
        ).status_code
        == 200
    )
    assert persisted(crud_engine)["resume-site"]["repository_url"] is None
    orders = {"orders": [{"slug": "resume-site", "display_order": 3}]}
    assert client.post("/api/v1/projects/reorder", json=orders, headers=headers).status_code == 200
    assert persisted(crud_engine)["resume-site"]["display_order"] == 3
    assert client.delete("/api/v1/projects/resume-site", headers=headers).status_code == 204
    assert persisted(crud_engine) == {}


def test_response_failure_does_not_commit_insert(client, crud_engine, monkeypatch):
    def broken_refresh(self, *args, **kwargs):
        raise SQLAlchemyError("test-only refresh failure")

    monkeypatch.setattr(Session, "refresh", broken_refresh)
    response = client.post("/api/v1/projects", json=_project_payload())
    assert response.status_code == 503
    assert persisted(crud_engine) == {}


def test_reorder_database_failure_rolls_back_executed_updates(client, crud_engine):
    client.post("/api/v1/projects", json=_project_payload(slug="a", display_order=1))
    client.post("/api/v1/projects", json=_project_payload(slug="b", display_order=2))
    executed = []

    def fail_after_update(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("UPDATE projects"):
            executed.append(True)
            raise SQLAlchemyError("test-only error after database update")

    event.listen(crud_engine, "after_cursor_execute", fail_after_update)
    try:
        response = client.post(
            "/api/v1/projects/reorder",
            json={"orders": [{"slug": "a", "display_order": 8}, {"slug": "b", "display_order": 9}]},
        )
        assert response.status_code == 503
    finally:
        event.remove(crud_engine, "after_cursor_execute", fail_after_update)
    assert executed
    rows = persisted(crud_engine)
    assert rows["a"]["display_order"] == 1
    assert rows["b"]["display_order"] == 2


def test_concurrent_delete_cannot_partially_reorder(client, crud_engine):
    client.post("/api/v1/projects", json=_project_payload(slug="a", display_order=1))
    client.post("/api/v1/projects", json=_project_payload(slug="b", display_order=2))
    connection = crud_engine.connect()
    transaction = connection.begin()
    connection.execute(select(Project).where(Project.slug == "a").with_for_update()).all()
    attempting = Event()

    def signal_lock_attempt(conn, cursor, statement, parameters, context, executemany):
        if "FOR UPDATE" in statement:
            attempting.set()

    event.listen(crud_engine, "before_cursor_execute", signal_lock_attempt)
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(
            client.post,
            "/api/v1/projects/reorder",
            json={"orders": [{"slug": "b", "display_order": 9}, {"slug": "a", "display_order": 8}]},
        )
        assert attempting.wait(5), "reorder did not attempt row locking"
        connection.execute(delete(Project).where(Project.slug == "a"))
        transaction.commit()
        assert future.result(timeout=5).status_code == 404
    finally:
        if transaction.is_active:
            transaction.rollback()
        connection.close()
        executor.shutdown(wait=True)
        event.remove(crud_engine, "before_cursor_execute", signal_lock_attempt)
    rows = persisted(crud_engine)
    assert "a" not in rows
    assert rows["b"]["display_order"] == 2


def test_fixture_disposes_engine_and_sanitizes_cleanup_error(monkeypatch):
    class BrokenCleanupEngine:
        disposed = False

        @contextmanager
        def begin(self):
            raise SQLAlchemyError("private connection details")
            yield  # pragma: no cover

        def dispose(self):
            self.disposed = True

    engine = BrokenCleanupEngine()
    monkeypatch.setattr(sys.modules[__name__], "create_engine", lambda url: engine)
    fixture = crud_engine.__wrapped__("test-owned-disposable-url")
    assert next(fixture) is engine
    with pytest.raises(RuntimeError, match="Disposable project fixture cleanup failed") as exc:
        fixture.close()
    assert engine.disposed
    assert "private" not in str(exc.value)
    assert exc.value.__suppress_context__
