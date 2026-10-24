from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.v1.resume import get_current_owner
from app.core.auth import TokenClaims
from app.db.tenant import TenantSession
from app.db.tenant import get_content_db as get_db
from app.main import app
from app.models.owner import PortfolioPublication
from app.models.resume import SkillGroup, SkillItem

OWNER_CLAIMS = TokenClaims(
    sub="portfolio-owner",
    iss="online-resume-api",
    aud="online-resume-web",
    iat=1_800_000_000,
    exp=1_800_000_900,
    jti="test-jti",
)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [PortfolioPublication.__table__, SkillGroup.__table__, SkillItem.__table__]
    SkillGroup.metadata.create_all(engine, tables=tables)
    try:
        with TenantSession(engine, user_id="test-owner") as session:
            yield session
    finally:
        SkillGroup.metadata.drop_all(engine, tables=tables)
        engine.dispose()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_owner] = lambda: OWNER_CLAIMS
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_owner, None)


def test_repeated_skill_item_create_replays_existing_result(client, db_session):
    group = SkillGroup(label="Languages", display_order=0)
    db_session.add(group)
    db_session.commit()

    path = f"/api/v1/resume/skills/{group.id}/items"
    headers = {"Idempotency-Key": "a49ca978-f74c-46d9-9462-41ddc513f66c"}
    body = {"item": "Python", "display_order": 1}

    first = client.post(path, json=body, headers=headers)
    retry = client.post(path, json=body, headers=headers)

    assert first.status_code == 201
    assert retry.status_code == 201
    assert retry.json() == first.json()
    assert len(db_session.scalars(select(SkillItem)).all()) == 1


def test_skill_item_create_rejects_key_reuse_with_different_payload(client, db_session):
    group = SkillGroup(label="Languages", display_order=0)
    db_session.add(group)
    db_session.commit()

    path = f"/api/v1/resume/skills/{group.id}/items"
    headers = {"Idempotency-Key": "a49ca978-f74c-46d9-9462-41ddc513f66c"}
    first = client.post(
        path,
        json={"item": "Python", "display_order": 1},
        headers=headers,
    )
    conflict = client.post(
        path,
        json={"item": "TypeScript", "display_order": 1},
        headers=headers,
    )

    assert first.status_code == 201
    assert conflict.status_code == 409
    assert len(db_session.scalars(select(SkillItem)).all()) == 1


def test_skill_item_create_validates_idempotency_key(client, db_session):
    group = SkillGroup(label="Languages", display_order=0)
    db_session.add(group)
    db_session.commit()

    response = client.post(
        f"/api/v1/resume/skills/{group.id}/items",
        json={"item": "Python"},
        headers={"Idempotency-Key": "not-a-uuid"},
    )

    assert response.status_code == 400
    assert db_session.scalars(select(SkillItem)).all() == []
