"""Tests for the published-project GitHub README proxy."""

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.tenant import get_content_db as get_db
from app.main import app


@contextmanager
def _client_with_project(project):
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = project
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)


class StubResponse:
    def __init__(self, status_code, text="", json_body=None):
        self.status_code = status_code
        self.text = text
        self.json_body = json_body

    def json(self):
        return self.json_body


def _project(repository_url="https://github.com/portfolio-owner/my-awesome-app"):
    return SimpleNamespace(
        slug="my-awesome-app",
        repository_url=repository_url,
    )


def _configure_github(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_PAT", "test-token")
    monkeypatch.setattr(settings, "GITHUB_USERNAME", "portfolio-owner")


def test_readme_returns_rendered_html_for_public_portfolio_project(monkeypatch):
    _configure_github(monkeypatch)
    responses = [
        StubResponse(200, json_body={"private": False}),
        StubResponse(200, text="<h1>My Awesome App</h1>"),
    ]
    requests = []

    class StubAsyncClient:
        def __init__(self, *, timeout):
            assert timeout > 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, url, *, headers):
            requests.append((url, headers))
            return responses.pop(0)

    monkeypatch.setattr(httpx, "AsyncClient", StubAsyncClient)
    with _client_with_project(_project()) as client:
        response = client.get("/api/v1/github/projects/my-awesome-app/readme")

    assert response.status_code == 200
    assert response.text == "<h1>My Awesome App</h1>"
    assert response.headers["content-type"].startswith("text/html")
    assert len(requests) == 2
    assert requests[0][0] == "https://api.github.com/repos/portfolio-owner/my-awesome-app"
    assert requests[0][1]["Authorization"] == "Bearer test-token"
    assert requests[1][1]["Accept"] == "application/vnd.github.html+json"


def test_readme_is_not_fetched_for_a_private_repository(monkeypatch):
    _configure_github(monkeypatch)
    requests = []

    class StubAsyncClient:
        def __init__(self, *, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, url, *, headers):
            requests.append(url)
            return StubResponse(200, json_body={"private": True})

    monkeypatch.setattr(httpx, "AsyncClient", StubAsyncClient)
    with _client_with_project(_project()) as client:
        response = client.get("/api/v1/github/projects/my-awesome-app/readme")

    assert response.status_code == 404
    assert len(requests) == 1


def test_readme_is_not_fetched_for_an_unpublished_or_unapproved_repository(monkeypatch):
    _configure_github(monkeypatch)

    class UnexpectedAsyncClient:
        def __init__(self, **_):
            raise AssertionError("GitHub must not be contacted for an unapproved project")

    monkeypatch.setattr(httpx, "AsyncClient", UnexpectedAsyncClient)
    with _client_with_project(_project("https://github.com/someone-else/private-repo")) as client:
        response = client.get("/api/v1/github/projects/my-awesome-app/readme")

    assert response.status_code == 404


def test_readme_returns_404_for_unknown_project(monkeypatch):
    _configure_github(monkeypatch)

    class UnexpectedAsyncClient:
        def __init__(self, **_):
            raise AssertionError("GitHub must not be contacted for an unknown project")

    monkeypatch.setattr(httpx, "AsyncClient", UnexpectedAsyncClient)
    with _client_with_project(None) as client:
        response = client.get("/api/v1/github/projects/not-published/readme")

    assert response.status_code == 404


def test_readme_returns_503_when_github_times_out(monkeypatch):
    _configure_github(monkeypatch)

    class TimeoutAsyncClient:
        def __init__(self, *, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, *_args, **_kwargs):
            raise httpx.ReadTimeout("private upstream details")

    monkeypatch.setattr(httpx, "AsyncClient", TimeoutAsyncClient)
    with _client_with_project(_project()) as client:
        response = client.get("/api/v1/github/projects/my-awesome-app/readme")

    assert response.status_code == 503
    assert "private upstream details" not in response.text
