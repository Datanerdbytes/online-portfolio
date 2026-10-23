"""API behavior tests; database lifecycle regressions live in test_database_lifecycle.py.

Default tests use doubles. Persistence and ordering tests use the opt-in
PostgreSQL fixtures, which own a unique disposable database.
"""

from contextlib import contextmanager
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import get_db
from app.main import app


class FailingSession:
    """A session stand-in whose queries always fail, used to exercise the 503 path."""

    def query(self, *args, **kwargs):
        raise SQLAlchemyError("connection failed")

    def close(self):
        pass


@contextmanager
def _client_with_session(session):
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_health_without_database():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_empty_projects_returns_empty_items():
    mock_session = MagicMock()
    mock_session.query.return_value.order_by.return_value.all.return_value = []

    with _client_with_session(mock_session) as client:
        response = client.get("/api/v1/projects")
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_get_project_returns_project_details():
    from app.models.project import Project

    project = Project(
        id=12,
        slug="my-awesome-app",
        title="My Awesome App",
        summary="A project summary",
        technologies=["Next.js", "FastAPI"],
        repository_url="https://github.com/example/my-awesome-app",
        demo_url=None,
        display_order=1,
        is_sample=False,
    )
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = project

    with _client_with_session(mock_session) as client:
        response = client.get("/api/v1/projects/my-awesome-app")

    assert response.status_code == 200
    assert response.json() == {
        "id": 12,
        "slug": "my-awesome-app",
        "title": "My Awesome App",
        "summary": "A project summary",
        "technologies": ["Next.js", "FastAPI"],
        "repository_url": "https://github.com/example/my-awesome-app",
        "demo_url": None,
        "display_order": 1,
        "is_sample": False,
    }


def test_get_missing_project_returns_404():
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = None

    with _client_with_session(mock_session) as client:
        response = client.get("/api/v1/projects/missing")

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found"}


def test_database_unavailable_returns_503():
    failing_session = FailingSession()

    with _client_with_session(failing_session) as client:
        response = client.get("/api/v1/projects")
    assert response.status_code == 503
    body = response.json()
    assert "detail" in body
    detail = body["detail"].lower()
    for secret in ["postgresql", "resume", "5432", "password", "://", "credential"]:
        assert secret not in detail, f"leaked secret fragment: {secret!r}"


def test_populated_projects_serialization(db_session, client):
    from app.models.project import Project

    sample_summary = (
        "Illustrative project entry for development; not a completed portfolio project."
    )
    db_session.add(
        Project(
            slug="sample-task-board",
            title="Sample: Task Board",
            summary=sample_summary,
            technologies=["Next.js", "FastAPI", "PostgreSQL"],
            repository_url=None,
            demo_url=None,
            display_order=10,
            is_sample=True,
        )
    )
    db_session.flush()

    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    item = items[0]
    assert isinstance(item["id"], int) and item["id"] > 0  # never assume id == 1
    assert item["slug"] == "sample-task-board"
    assert item["title"] == "Sample: Task Board"
    assert item["summary"] == sample_summary
    assert item["technologies"] == ["Next.js", "FastAPI", "PostgreSQL"]
    assert item["repository_url"] is None
    assert item["demo_url"] is None
    assert item["display_order"] == 10
    assert item["is_sample"] is True


def test_ordering_display_order_then_id(db_session, client):
    from app.models.project import Project

    db_session.add_all(
        [
            Project(
                slug="sample-c",
                title="Sample: C",
                summary="s",
                technologies=["a"],
                display_order=30,
                is_sample=True,
            ),
            Project(
                slug="sample-a",
                title="Sample: A",
                summary="s",
                technologies=["a"],
                display_order=10,
                is_sample=True,
            ),
            Project(
                slug="sample-b",
                title="Sample: B",
                summary="s",
                technologies=["a"],
                display_order=10,
                is_sample=True,
            ),
        ]
    )
    db_session.flush()

    response = client.get("/api/v1/projects")
    items = response.json()["items"]
    keys = [(item["display_order"], item["id"]) for item in items]
    assert keys == sorted(keys)
    assert [item["display_order"] for item in items] == [10, 10, 30]


def test_sample_labels_nullable_urls_and_technologies(db_session, client):
    from app.models.project import Project

    sample_summary = (
        "Illustrative project entry for development; not a completed portfolio project."
    )

    db_session.add(
        Project(
            slug="sample-api-gateway",
            title="Sample: API Gateway",
            summary=sample_summary,
            technologies=["FastAPI", "PostgreSQL", "Docker"],
            repository_url=None,
            demo_url=None,
            display_order=20,
            is_sample=True,
        )
    )
    db_session.flush()

    response = client.get("/api/v1/projects")
    item = response.json()["items"][0]
    assert item["title"].startswith("Sample:")
    assert item["is_sample"] is True
    assert item["repository_url"] is None
    assert item["demo_url"] is None
    assert item["technologies"] == ["FastAPI", "PostgreSQL", "Docker"]
