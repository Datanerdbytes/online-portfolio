"""Database-free project CRUD tests.

Uses stub SQLAlchemy sessions and dependency overrides. No PostgreSQL is
created, modified, or dropped. Auth enforcement is exercised through the real
bearer-token dependency; CRUD behavior overrides ``get_current_owner`` to focus
on validation, null/omitted semantics, sample preservation, errors, and rollback.
"""

from contextlib import contextmanager
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.v1.projects import get_current_owner
from app.core.auth import TokenClaims, create_access_token
from app.core.config import settings
from app.core.storage import get_image_store
from app.db.session import get_db
from app.main import app
from app.models.project import Project

OWNER_CLAIMS = TokenClaims(
    sub="portfolio-owner",
    iss="online-resume-api",
    aud="online-resume-web",
    iat=1_800_000_000,
    exp=1_800_000_900,
    jti="test-jti",
)


class StubQuery:
    def __init__(self, first_value, all_value):
        self.first_value = first_value
        self.all_value = list(all_value or [])
        self.filter_calls = 0
        self.with_for_update_called = False
        self.order_by_calls = []

    def filter(self, *criterion):
        self.filter_calls += 1
        return self

    def with_for_update(self):
        self.with_for_update_called = True
        return self

    def order_by(self, *criterion):
        self.order_by_calls.append(criterion)
        return self

    def first(self):
        return self.first_value

    def all(self):
        return list(self.all_value)


class StubSession:
    def __init__(self, first=None, all=None, fail_commit=False, fail_query=False, commit_exc=None):
        self.first_value = first
        self.all_value = list(all or [])
        self.fail_commit = fail_commit
        self.fail_query = fail_query
        self.commit_exc = commit_exc or IntegrityError("duplicate key", None, None)
        self.added = []
        self.deleted = []
        self.committed = False
        self.rolled_back = False
        self.refreshed = []

    def query(self, *args, **kwargs):
        if self.fail_query:
            raise SQLAlchemyError("connection failed")
        return StubQuery(self.first_value, self.all_value)

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def flush(self):
        pass

    def commit(self):
        if self.fail_commit:
            raise self.commit_exc
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def refresh(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = 1
        if getattr(obj, "is_sample", None) is None:
            obj.is_sample = False
        if getattr(obj, "display_order", None) is None:
            obj.display_order = 0
        if getattr(obj, "technologies", None) is None:
            obj.technologies = []
        self.refreshed.append(obj)


@contextmanager
def _client_with_overrides(session=None, override_owner=True, store=None):
    if session is not None:
        app.dependency_overrides[get_db] = lambda: session
    if override_owner:
        app.dependency_overrides[get_current_owner] = lambda: OWNER_CLAIMS
    if store is not None:
        app.dependency_overrides[get_image_store] = lambda: store
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_owner, None)
        app.dependency_overrides.pop(get_image_store, None)


def _configure_auth(monkeypatch):
    from app.core.auth import hash_password

    monkeypatch.setattr(settings, "API_ACCESS_SECRET", "test-secret-key-at-least-32-chars-long!")
    monkeypatch.setattr(settings, "OWNER_ID", "portfolio-owner")
    monkeypatch.setattr(settings, "OWNER_USERNAME", "owner-login")
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", hash_password("test-password"))


def _unconfigure_auth(monkeypatch):
    monkeypatch.setattr(settings, "API_ACCESS_SECRET", None)
    monkeypatch.setattr(settings, "OWNER_ID", None)
    monkeypatch.setattr(settings, "OWNER_USERNAME", None)
    monkeypatch.setattr(settings, "OWNER_PASSWORD_HASH", None)


class _StubAuth:
    """Bearer-only authentication stand-in used to assert dependency wiring."""

    def __init__(self, owner_id="portfolio-owner"):
        self.owner_id = owner_id


def _create_project_payload(**overrides):
    payload = {
        "slug": "resume-site",
        "title": "Resume site",
        "summary": "Portfolio application.",
        "technologies": ["Next.js", "FastAPI"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 0,
    }
    payload.update(overrides)
    return payload


def _replace_payload(**overrides):
    payload = {
        "title": "Resume site",
        "summary": "Portfolio application.",
        "technologies": ["Next.js", "FastAPI"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 0,
    }
    payload.update(overrides)
    return payload


class TestAuthEnforcement:
    def test_mutation_without_token_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        with _client_with_overrides(override_owner=False) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload())
        assert response.status_code == 401
        assert response.headers.get("WWW-Authenticate") == "Bearer"

    def test_mutation_with_bad_scheme_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        with _client_with_overrides(override_owner=False) as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(),
                headers={"Authorization": "Basic abc"},
            )
        assert response.status_code == 401

    def test_mutation_with_tampered_token_401(self, monkeypatch):
        _configure_auth(monkeypatch)
        with _client_with_overrides(override_owner=False) as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(),
                headers={"Authorization": "Bearer not-a-real-token"},
            )
        assert response.status_code == 401

    def test_mutation_with_non_owner_token_403(self, monkeypatch):
        _configure_auth(monkeypatch)
        secret = settings.API_ACCESS_SECRET or ""
        token = create_access_token("someone-else", secret)
        with _client_with_overrides(override_owner=False) as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(),
                headers={"Authorization": f"Bearer {token}"},
            )
        assert response.status_code == 403

    def test_mutation_unconfigured_503(self, monkeypatch):
        _unconfigure_auth(monkeypatch)
        with _client_with_overrides(override_owner=False) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload())
        assert response.status_code == 503


class TestCreate:
    def test_create_returns_full_response_with_id_and_sample_false(self):
        session = StubSession()
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload())
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == 1
        assert body["slug"] == "resume-site"
        assert body["title"] == "Resume site"
        assert body["summary"] == "Portfolio application."
        assert body["technologies"] == ["Next.js", "FastAPI"]
        assert body["repository_url"] is None
        assert body["demo_url"] is None
        assert body["display_order"] == 0
        assert body["is_sample"] is False
        assert session.committed is True
        assert len(session.refreshed) == 1

    def test_create_persists_provided_fields(self):
        session = StubSession()
        payload = _create_project_payload(
            slug="api-gateway",
            title="API Gateway",
            summary="Gateway summary.",
            technologies=["FastAPI", "PostgreSQL"],
            repository_url="https://example.com/repo",
            demo_url="https://example.com/demo",
            display_order=5,
        )
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201
        added = session.added[0]
        assert added.slug == "api-gateway"
        assert added.title == "API Gateway"
        assert added.summary == "Gateway summary."
        assert added.technologies == ["FastAPI", "PostgreSQL"]
        assert added.repository_url == "https://example.com/repo"
        assert added.demo_url == "https://example.com/demo"
        assert added.display_order == 5
        assert added.is_sample is False

    def test_create_trims_title_and_summary(self):
        session = StubSession()
        payload = _create_project_payload(
            slug="trimmed-slug",
            title="  Trimmed Title  ",
            summary="  Trimmed summary.  ",
        )
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201
        added = session.added[0]
        assert added.title == "Trimmed Title"
        assert added.summary == "Trimmed summary."

    @pytest.mark.parametrize("slug", ["  trimmed-slug  ", " trailing", "leading "])
    def test_create_untrimmed_slug_rejected_400(self, slug):
        with _client_with_overrides() as client:
            response = client.post("/api/v1/projects", json=_create_project_payload(slug=slug))
        assert response.status_code == 400

    def test_create_missing_required_field_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects",
                json={"slug": "x", "title": "T"},
            )
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid request"}

    def test_create_unknown_field_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects",
                json={**_create_project_payload(), "bogus": True},
            )
        assert response.status_code == 400

    def test_create_empty_body_400(self):
        with _client_with_overrides() as client:
            response = client.post("/api/v1/projects", json={})
        assert response.status_code == 400

    def test_create_duplicate_slug_race_409_after_rollback(self):
        session = StubSession(fail_commit=True)
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload())
        assert response.status_code == 409
        assert response.json() == {"detail": "Project with this slug already exists"}
        assert session.rolled_back is True
        assert session.committed is False

    @pytest.mark.parametrize("slug", ["Upper", "has space", "trailing-", "-leading", "a.b", "a__b"])
    def test_create_invalid_slug_400(self, slug):
        with _client_with_overrides() as client:
            response = client.post("/api/v1/projects", json=_create_project_payload(slug=slug))
        assert response.status_code == 400

    @pytest.mark.parametrize("slug", ["a", "resume-site", "my-project-1", "x-y-z"])
    def test_create_valid_slug_201(self, slug):
        session = StubSession()
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload(slug=slug))
        assert response.status_code == 201

    @pytest.mark.parametrize(
        "field,value",
        [("title", ""), ("title", " "), ("summary", ""), ("summary", "  ")],
    )
    def test_create_blank_required_text_400(self, field, value):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects", json=_create_project_payload(**{field: value})
            )
        assert response.status_code == 400

    def test_create_title_over_200_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects", json=_create_project_payload(title="x" * 201)
            )
        assert response.status_code == 400

    def test_create_summary_over_1000_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects", json=_create_project_payload(summary="x" * 1001)
            )
        assert response.status_code == 400

    @pytest.mark.parametrize("technologies", [["a"] * 21, ["a", "a"], ["", "b"], ["x" * 51]])
    def test_create_invalid_technologies_400(self, technologies):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(technologies=technologies),
            )
        assert response.status_code == 400

    @pytest.mark.parametrize(
        "url",
        ["", "   ", "ftp://example.com", "example.com", "http://", "https://"],
    )
    def test_create_invalid_url_400(self, url):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(repository_url=url),
            )
        assert response.status_code == 400

    def test_create_url_too_long_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects",
                json=_create_project_payload(repository_url="https://" + "x" * 1020),
            )
        assert response.status_code == 400

    @pytest.mark.parametrize("order", [True, 1.5, "3", -1, 2147483648])
    def test_create_invalid_display_order_400(self, order):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects", json=_create_project_payload(display_order=order)
            )
        assert response.status_code == 400

    def test_create_database_error_503_credential_free(self):
        session = StubSession(fail_commit=True, commit_exc=SQLAlchemyError("connection failed"))
        with _client_with_overrides(session) as client:
            response = client.post("/api/v1/projects", json=_create_project_payload())
        assert response.status_code == 503
        detail = response.json()["detail"].lower()
        for secret in ["postgresql", "resume", "5432", "password", "://", "credential"]:
            assert secret not in detail


class TestReplace:
    def test_replace_requires_all_writable_fields(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.put(
                "/api/v1/projects/resume-site",
                json={"title": "Only title"},
            )
        assert response.status_code == 400

    def test_replace_full_body_updates_and_preserves_sample(self):
        existing = Project(
            slug="resume-site",
            title="Old",
            summary="Old summary.",
            technologies=["old"],
            repository_url=None,
            demo_url=None,
            display_order=0,
            is_sample=True,
        )
        session = StubSession(first=existing)
        payload = {
            "title": "New title",
            "summary": "New summary.",
            "technologies": [],
            "repository_url": None,
            "demo_url": None,
            "display_order": 3,
        }
        with _client_with_overrides(session) as client:
            response = client.put("/api/v1/projects/resume-site", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "New title"
        assert body["summary"] == "New summary."
        assert body["technologies"] == []
        assert body["repository_url"] is None
        assert body["demo_url"] is None
        assert body["display_order"] == 3
        assert body["is_sample"] is True  # read-only, preserved

    def test_replace_slug_in_body_rejected_400(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.put(
                "/api/v1/projects/resume-site",
                json={**_create_project_payload(), "slug": "other-slug"},
            )
        assert response.status_code == 400

    def test_replace_unknown_field_rejected_400(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.put(
                "/api/v1/projects/resume-site",
                json={**_create_project_payload(), "bogus": 1},
            )
        assert response.status_code == 400

    def test_replace_missing_target_404(self):
        session = StubSession(first=None)
        with _client_with_overrides(session) as client:
            response = client.put("/api/v1/projects/nope", json=_replace_payload())
        assert response.status_code == 404

    def test_replace_database_error_503(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            ),
            fail_query=True,
        )
        with _client_with_overrides(session) as client:
            response = client.put("/api/v1/projects/resume-site", json=_replace_payload())
        assert response.status_code == 503


class TestPatch:
    def test_patch_partial_update_leaves_others_unchanged(self):
        existing = Project(
            slug="resume-site",
            title="Old title",
            summary="Old summary.",
            technologies=["old"],
            repository_url="https://old.com/repo",
            demo_url=None,
            display_order=1,
            is_sample=False,
        )
        session = StubSession(first=existing)
        with _client_with_overrides(session) as client:
            response = client.patch(
                "/api/v1/projects/resume-site",
                json={"title": "New title"},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "New title"
        assert body["summary"] == "Old summary."
        assert body["technologies"] == ["old"]
        assert body["repository_url"] == "https://old.com/repo"
        assert body["display_order"] == 1
        assert body["is_sample"] is False

    def test_patch_null_clears_only_url_fields(self):
        existing = Project(
            slug="resume-site",
            title="T",
            summary="S",
            technologies=[],
            repository_url="https://old.com/repo",
            demo_url="https://old.com/demo",
            display_order=0,
            is_sample=False,
        )
        session = StubSession(first=existing)
        with _client_with_overrides(session) as client:
            response = client.patch(
                "/api/v1/projects/resume-site",
                json={"repository_url": None, "demo_url": None},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["repository_url"] is None
        assert body["demo_url"] is None
        assert body["title"] == "T"

    def test_patch_null_on_non_nullable_field_400(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.patch(
                "/api/v1/projects/resume-site",
                json={"title": None},
            )
        assert response.status_code == 400

    def test_patch_empty_body_400(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.patch("/api/v1/projects/resume-site", json={})
        assert response.status_code == 400

    def test_patch_sample_preserved(self):
        existing = Project(
            slug="resume-site",
            title="T",
            summary="S",
            technologies=[],
            repository_url=None,
            demo_url=None,
            display_order=0,
            is_sample=True,
        )
        session = StubSession(first=existing)
        with _client_with_overrides(session) as client:
            response = client.patch(
                "/api/v1/projects/resume-site",
                json={"title": "Revised"},
            )
        assert response.status_code == 200
        assert response.json()["is_sample"] is True

    def test_patch_missing_target_404(self):
        session = StubSession(first=None)
        with _client_with_overrides(session) as client:
            response = client.patch("/api/v1/projects/nope", json={"title": "X"})
        assert response.status_code == 404


class TestDelete:
    def test_delete_returns_204(self):
        session = StubSession(
            first=Project(
                slug="resume-site", title="T", summary="S", technologies=[], display_order=0
            )
        )
        with _client_with_overrides(session) as client:
            response = client.delete("/api/v1/projects/resume-site")
        assert response.status_code == 204
        assert response.content == b""
        assert session.deleted == [session.first_value]
        assert session.committed is True

    def test_delete_missing_target_404(self):
        session = StubSession(first=None)
        with _client_with_overrides(session) as client:
            response = client.delete("/api/v1/projects/nope")
        assert response.status_code == 404

    def test_delete_removes_screenshot_after_project_commit(self):
        project = Project(
            slug="resume-site",
            title="T",
            summary="S",
            technologies=[],
            display_order=0,
            screenshot_filename="screenshot.png",
        )
        session = StubSession(first=project)
        store = Mock()

        def assert_commit_before_cleanup(filename):
            assert session.committed
            assert filename == "screenshot.png"

        store.delete.side_effect = assert_commit_before_cleanup
        with _client_with_overrides(session, store=store) as client:
            response = client.delete("/api/v1/projects/resume-site")

        assert response.status_code == 204
        store.delete.assert_called_once_with("screenshot.png")


class TestReorder:
    def test_reorder_updates_atomically_and_returns_count(self):
        a = Project(slug="a", title="A", summary="S", technologies=[], display_order=1, id=1)
        b = Project(slug="b", title="B", summary="S", technologies=[], display_order=2, id=2)
        session = StubSession(all=[a, b])
        with _client_with_overrides(session) as client:
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
        assert a.display_order == 5
        assert b.display_order == 6
        assert session.committed is True

    def test_reorder_duplicate_slug_in_batch_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects/reorder",
                json={
                    "orders": [
                        {"slug": "a", "display_order": 1},
                        {"slug": "a", "display_order": 2},
                    ]
                },
            )
        assert response.status_code == 400

    def test_reorder_empty_batch_400(self):
        with _client_with_overrides() as client:
            response = client.post("/api/v1/projects/reorder", json={"orders": []})
        assert response.status_code == 400

    def test_reorder_over_100_entries_400(self):
        orders = [{"slug": f"s{i}", "display_order": i} for i in range(101)]
        with _client_with_overrides() as client:
            response = client.post("/api/v1/projects/reorder", json={"orders": orders})
        assert response.status_code == 400

    def test_reorder_missing_target_404_no_partial_write(self):
        a = Project(slug="a", title="A", summary="S", technologies=[], display_order=1, id=1)
        session = StubSession(all=[a])
        with _client_with_overrides(session) as client:
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
        assert session.committed is False
        assert a.display_order == 1  # unchanged

    def test_reorder_invalid_order_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects/reorder",
                json={"orders": [{"slug": "a", "display_order": True}]},
            )
        assert response.status_code == 400

    def test_reorder_unknown_field_400(self):
        with _client_with_overrides() as client:
            response = client.post(
                "/api/v1/projects/reorder",
                json={"orders": [{"slug": "a", "display_order": 1, "extra": True}]},
            )
        assert response.status_code == 400

    def test_reorder_database_error_503_rollback(self):
        session = StubSession(all=[], fail_query=True)
        with _client_with_overrides(session) as client:
            response = client.post(
                "/api/v1/projects/reorder",
                json={"orders": [{"slug": "a", "display_order": 1}]},
            )
        assert response.status_code == 503


class TestListUnchanged:
    def test_list_public_and_ordered(self):
        session = StubSession(all=[])
        with _client_with_overrides(session, override_owner=False) as client:
            response = client.get("/api/v1/projects")
        assert response.status_code == 200
        assert response.json() == {"items": []}

    def test_list_requires_no_auth(self):
        session = StubSession(all=[])
        with _client_with_overrides(session, override_owner=False) as client:
            response = client.get("/api/v1/projects")
        assert response.status_code == 200


@pytest.mark.parametrize("method", ["put", "patch"])
@pytest.mark.parametrize(
    "field,value",
    [
        ("title", " "),
        ("title", "x" * 201),
        ("summary", " "),
        ("summary", "x" * 1001),
        ("technologies", [f"tech-{i}" for i in range(21)]),
        ("display_order", -1),
        ("display_order", 2147483648),
    ],
)
def test_update_retains_shared_field_limits(method, field, value):
    project = Project(
        id=1,
        slug="resume-site",
        title="Old",
        summary="S",
        technologies=[],
        display_order=0,
        is_sample=False,
    )
    session = StubSession(first=project)
    payload = _replace_payload(**{field: value}) if method == "put" else {field: value}
    with _client_with_overrides(session) as client:
        response = getattr(client, method)("/api/v1/projects/resume-site", json=payload)
    assert response.status_code == 400
    assert not session.committed


@pytest.mark.parametrize(
    "url", ["http://@", "https://:443", "https://exa mple.com", "https://example.com:bad"]
)
def test_url_requires_valid_host_and_port(url):
    with _client_with_overrides(StubSession()) as client:
        response = client.post("/api/v1/projects", json=_create_project_payload(demo_url=url))
    assert response.status_code == 400


@pytest.mark.parametrize("slug", ["Upper", "has space", "x" * 101, "trailing-"])
def test_reorder_invalid_slug_is_400(slug):
    with _client_with_overrides(StubSession()) as client:
        response = client.post(
            "/api/v1/projects/reorder", json={"orders": [{"slug": slug, "display_order": 1}]}
        )
    assert response.status_code == 400


@pytest.mark.parametrize("method", ["post", "put", "patch"])
def test_response_refresh_failure_rolls_back_before_commit(method):
    class BrokenRefresh(StubSession):
        def refresh(self, obj):
            raise SQLAlchemyError("private database connection details")

    project = Project(
        id=1,
        slug="resume-site",
        title="Old",
        summary="S",
        technologies=[],
        display_order=0,
        is_sample=False,
    )
    session = BrokenRefresh(first=project)
    path = "/api/v1/projects" if method == "post" else "/api/v1/projects/resume-site"
    payload = _create_project_payload() if method == "post" else _replace_payload()
    with _client_with_overrides(session) as client:
        response = getattr(client, method)(path, json=payload)
    assert response.status_code == 503
    assert response.json() == {"detail": "Projects service temporarily unavailable."}
    assert session.rolled_back
    assert not session.committed


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("POST", "/api/v1/projects", _create_project_payload()),
        ("PUT", "/api/v1/projects/resume-site", _replace_payload()),
        ("PATCH", "/api/v1/projects/resume-site", {"title": "Updated"}),
        ("DELETE", "/api/v1/projects/resume-site", None),
        (
            "POST",
            "/api/v1/projects/reorder",
            {"orders": [{"slug": "resume-site", "display_order": 1}]},
        ),
    ],
)
@pytest.mark.parametrize(
    "auth_case,expected", [("missing", 401), ("non-owner", 403), ("unconfigured", 503)]
)
def test_every_mutation_enforces_owner_before_database(
    monkeypatch, method, path, payload, auth_case, expected
):
    if auth_case == "unconfigured":
        _unconfigure_auth(monkeypatch)
    else:
        _configure_auth(monkeypatch)
    headers = {"X-Owner-ID": "portfolio-owner", "Cookie": "portfolio-admin=spoofed"}
    if auth_case == "non-owner":
        token = create_access_token("other-owner", settings.API_ACCESS_SECRET)
        headers["Authorization"] = f"Bearer {token}"
    session = StubSession(fail_query=True)
    with _client_with_overrides(session, override_owner=False) as client:
        response = client.request(method, path, json=payload, headers=headers)
    assert response.status_code == expected
    assert not session.added and not session.deleted and not session.committed
    assert not session.rolled_back  # No persistence operation started.
    if expected == 401:
        assert response.headers["WWW-Authenticate"] == "Bearer"
