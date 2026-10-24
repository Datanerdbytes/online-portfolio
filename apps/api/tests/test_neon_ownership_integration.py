"""Real PostgreSQL ownership with cryptographically signed test-provider identities."""

from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import tenant
from app.db.session import get_db
from app.main import app
from app.models.owner import PortfolioOwner
from app.models.resume import Profile, SkillItem
from tests.neon_support import configure_neon, create_access_token


@pytest.fixture
def accounts(integration_db, monkeypatch):
    if integration_db is None:
        pytest.skip("requires --run-integration and TEST_DATABASE_ADMIN_URL")
    engine = create_engine(integration_db)
    configure_neon(monkeypatch)
    monkeypatch.setattr(tenant, "engine", engine)

    def session():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = session
    ids = [str(uuid4()), str(uuid4())]
    headers = [{"Authorization": "Bearer " + create_access_token(user)} for user in ids]
    try:
        with TestClient(app) as client:
            for header in headers:
                assert client.get("/api/v1/auth/me", headers=header).status_code == 200
            yield client, engine, ids, headers
    finally:
        app.dependency_overrides.pop(get_db, None)
        with Session(engine) as db:
            db.execute(delete(PortfolioOwner).where(PortfolioOwner.id.in_(ids)))
            db.commit()
        engine.dispose()


def test_new_users_are_empty_and_own_only_their_content(accounts):
    client, _, ids, (a, b) = accounts
    assert client.get("/api/v1/resume", headers=b).json()["experience"] == []
    assert client.patch("/api/v1/resume/profile", headers=a, json={"name": "A"}).status_code == 200
    assert (
        client.patch(
            "/api/v1/resume/profile?user_id=" + ids[0], headers=b, json={"name": "B"}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == "A"
    assert client.get(f"/api/v1/public/users/{ids[0]}/resume").status_code == 404
    client.patch("/api/v1/resume/profile", headers=a, json={"headline": "A", "introduction": "A"})
    state = client.get("/api/v1/portfolio", headers=a).json()
    assert (
        client.post(
            "/api/v1/portfolio/publish", headers=a, json={"revision": state["revision"]}
        ).status_code
        == 200
    )
    public = client.get(f"/api/v1/public/users/{ids[0]}/resume")
    assert public.status_code == 200 and public.json()["profile"]["name"] == "A"
    assert client.patch("/api/v1/resume/profile", json={"name": "anonymous"}).status_code == 401


def test_nested_records_are_scoped_and_composite_fk_enforced(accounts):
    client, engine, ids, (a, b) = accounts
    group = client.post(
        "/api/v1/resume/skills", headers=a, json={"label": "A", "items": ["Python"]}
    ).json()
    item_id = group["items"][0]["id"]
    assert client.delete(f"/api/v1/resume/skills/items/{item_id}", headers=b).status_code == 404
    assert (
        client.post(
            f"/api/v1/resume/skills/{group['id']}/items", headers=b, json={"item": "stolen"}
        ).status_code
        == 404
    )
    with Session(engine) as db:
        db.add(SkillItem(user_id=ids[1], group_id=group["id"], item="cross-owner"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_projects_and_public_reads_are_per_account(accounts):
    client, _, ids, (a, b) = accounts
    payload = {"slug": "same-slug", "title": "A", "summary": "Example", "technologies": []}
    assert client.post("/api/v1/projects", headers=a, json=payload).status_code == 201
    assert (
        client.patch("/api/v1/projects/same-slug", headers=b, json={"title": "stolen"}).status_code
        == 404
    )
    assert client.delete("/api/v1/projects/same-slug", headers=b).status_code == 404
    assert (
        client.post(
            "/api/v1/projects/reorder",
            headers=b,
            json={"orders": [{"slug": "same-slug", "display_order": 8}]},
        ).status_code
        == 404
    )
    assert (
        client.post("/api/v1/projects", headers=b, json={**payload, "title": "B"}).status_code
        == 201
    )
    for header in (a, b):
        client.patch(
            "/api/v1/resume/profile",
            headers=header,
            json={"name": "Name", "headline": "Headline", "introduction": "Intro"},
        )
        state = client.get("/api/v1/portfolio", headers=header).json()
        assert (
            client.post(
                "/api/v1/portfolio/publish", headers=header, json={"revision": state["revision"]}
            ).status_code
            == 200
        )
    assert client.get(f"/api/v1/public/users/{ids[0]}/projects").json()["items"][0]["title"] == "A"
    assert client.get(f"/api/v1/public/users/{ids[1]}/projects").json()["items"][0]["title"] == "B"


def test_concurrent_first_session_creates_one_profile(accounts):
    client, engine, ids, (a, _) = accounts
    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(
            pool.map(lambda _: client.get("/api/v1/auth/me", headers=a).status_code, range(4))
        )
    assert statuses == [200] * 4
    with Session(engine) as db:
        assert len(db.scalars(select(Profile).where(Profile.user_id == ids[0])).all()) == 1
