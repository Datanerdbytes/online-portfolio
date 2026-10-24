"""Atomic draft imports and shared quotas against disposable PostgreSQL."""

# ruff: noqa: F811 -- fixture import
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1 import resume_import as routes
from app.core.config import settings
from app.models.owner import PortfolioPublication
from app.models.resume import Profile
from app.models.resume_import import ImportAttempt, ImportReceipt
from app.schemas.resume_import import Extraction
from app.services.resume_import import reserve_attempt
from tests.test_neon_ownership_integration import accounts  # noqa: F401
from tests.test_publication_integration import prepare, publish
from tests.test_resume_extraction import docx, proposal


@pytest.fixture
def enabled(monkeypatch):
    monkeypatch.setattr(settings, "RESUME_IMPORT_ENABLED", True)
    monkeypatch.setattr(settings, "NVIDIA_API_KEY", "test-only")


def apply(client, headers, revision, changes, key=None):
    return client.post(
        "/api/v1/resume-import/apply",
        headers=headers,
        json={
            "expected_owner_id": client.get("/api/v1/portfolio", headers=headers).json()[
                "owner_id"
            ],
            "revision": revision,
            "changes": changes,
            "idempotency_key": key or str(uuid4()),
        },
    )


def test_import_is_atomic_idempotent_private_and_owner_scoped(accounts, enabled):
    client, engine, ids, (a, b) = accounts
    prepare(client, a)
    assert publish(client, a).status_code == 200
    context = client.get("/api/v1/resume-import/context", headers=a).json()
    assert context["resume"]["profile"]["name"] == "Original"
    key = str(uuid4())
    rev = context["status"]["revision"]
    changes = [
        {"section": "profile", "values": {"name": "Imported"}},
        {"section": "skills", "values": {"label": "Languages", "items": ["Python"]}},
        {
            "section": "projects",
            "values": {"title": "Pipeline", "summary": "Data pipeline", "technologies": ["SQL"]},
        },
    ]
    first = apply(client, a, rev, changes, key)
    assert first.status_code == 200, first.text
    assert first.json()["revision"] == rev + 1
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == "Imported"
    assert (
        client.get(f"/api/v1/public/users/{ids[0]}/resume").json()["profile"]["name"] == "Original"
    )
    assert client.get("/api/v1/resume", headers=b).json()["skills"] == []
    assert apply(client, a, rev, changes, key).json()["replayed"] is True
    assert len(client.get("/api/v1/projects", headers=a).json()["items"]) == 1
    assert (
        apply(
            client, a, rev, [{"section": "profile", "values": {"name": "Other"}}], key
        ).status_code
        == 409
    )
    assert apply(client, a, rev, changes).status_code == 409
    newrev = first.json()["revision"]
    group = client.get("/api/v1/resume", headers=a).json()["skills"][0]
    assert (
        apply(
            client,
            b,
            0,
            [{"section": "skills", "target_id": group["id"], "values": {"label": "Stolen"}}],
        ).status_code
        == 404
    )
    failing = [
        {"section": "profile", "values": {"name": "Must roll back"}},
        {"section": "education", "values": {"qualification": "Missing institution"}},
    ]
    assert apply(client, a, newrev, failing).status_code == 400
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == "Imported"
    with Session(engine) as db:
        assert (
            db.scalar(
                select(PortfolioPublication.draft_revision).where(
                    PortfolioPublication.owner_id == ids[0]
                )
            )
            == newrev
        )
        assert (
            len(list(db.scalars(select(ImportReceipt).where(ImportReceipt.owner_id == ids[0]))))
            == 1
        )


def test_merge_preserves_nested_entries_and_media_metadata(accounts, enabled):
    client, engine, ids, (a, _) = accounts
    group = client.post(
        "/api/v1/resume/skills", headers=a, json={"label": "Skills", "items": ["Python"]}
    ).json()
    with Session(engine) as db:
        profile = db.scalar(select(Profile).where(Profile.user_id == ids[0]))
        profile.avatar_filename = "existing.webp"
        db.commit()
    revision = client.get("/api/v1/portfolio", headers=a).json()["revision"]
    result = apply(
        client,
        a,
        revision,
        [
            {"section": "skills", "target_id": group["id"], "values": {"items": ["Python", "SQL"]}},
            {"section": "profile", "values": {"headline": "Data engineer"}},
        ],
    )
    assert result.status_code == 200, result.text
    resume = client.get("/api/v1/resume", headers=a).json()
    assert [x["item"] for x in resume["skills"][0]["items"]] == ["Python", "SQL"]
    assert resume["profile"]["avatar_url"]
    assert result.json()["status"]["profile_complete"] is False


def test_streamed_analysis_consent_gate_and_no_content_writes(accounts, enabled, monkeypatch):
    client, engine, ids, (a, _) = accounts
    monkeypatch.setattr(routes, "extract_bounded", lambda *_: "Alex Example")
    monkeypatch.setattr(routes, "map_resume", lambda _: Extraction.model_validate(proposal()))
    upload = {
        "file": (
            "resume.docx",
            docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    }
    assert (
        client.post(
            "/api/v1/resume-import/analyze", files=upload, data={"consent": "true"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/resume-import/analyze", headers=a, files=upload, data={"consent": "false"}
        ).status_code
        == 400
    )
    response = client.post(
        "/api/v1/resume-import/analyze", headers=a, files=upload, data={"consent": "true"}
    )
    assert response.status_code == 200, response.text
    import json

    assert [json.loads(line)["stage"] for line in response.text.splitlines()] == [
        "reading",
        "mapping",
        "ready",
    ]
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == ""
    with Session(engine) as db:
        attempt = db.scalar(select(ImportAttempt).where(ImportAttempt.owner_id == ids[0]))
        assert attempt.completed_at is not None
    monkeypatch.setattr(settings, "RESUME_IMPORT_ENABLED", False)
    assert (
        client.post(
            "/api/v1/resume-import/analyze", headers=a, files=upload, data={"consent": "true"}
        ).status_code
        == 503
    )


def test_shared_quota_active_lease_and_expiration(accounts):
    _, engine, ids, _ = accounts
    with Session(engine) as db:
        attempt = reserve_attempt(db, ids[0])
        with pytest.raises(Exception) as error:
            reserve_attempt(db, ids[0])
        assert error.value.status_code == 429
        db.rollback()
        row = db.get(ImportAttempt, attempt)
        row.completed_at = datetime.now(timezone.utc)
        db.commit()
        # Complete five attempts; sixth must fail across fresh sessions.
        for _ in range(4):
            key = reserve_attempt(db, ids[0])
            row = db.get(ImportAttempt, key)
            row.completed_at = datetime.now(timezone.utc)
            db.commit()
    with Session(engine) as db:
        with pytest.raises(Exception) as error:
            reserve_attempt(db, ids[0])
        assert error.value.status_code == 429
        db.rollback()
        for row in db.scalars(select(ImportAttempt).where(ImportAttempt.owner_id == ids[0])):
            row.created_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
        reserve_attempt(db, ids[0])
        assert db.scalar(select(ImportAttempt.id).where(ImportAttempt.id == attempt)) is None


def test_local_read_preview_never_calls_provider_or_changes_content(accounts, monkeypatch):
    client, _, _, (a, _) = accounts
    monkeypatch.setattr(settings, "RESUME_IMPORT_LOCAL_PREVIEW", True)
    monkeypatch.setattr(settings, "RESUME_IMPORT_ENABLED", False)
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(routes, "extract_bounded", lambda *_: "Alex Example: synthetic resume text")
    monkeypatch.setattr(routes, "map_resume", lambda *_: pytest.fail("No provider call allowed"))
    upload = {"file": ("resume.docx", docx(), "application/octet-stream")}
    response = client.post("/api/v1/resume-import/read", headers=a, files=upload)
    assert response.status_code == 200, response.text
    assert "Alex Example" in response.json()["text"]
    assert client.get("/api/v1/resume", headers=a).json()["profile"]["name"] == ""
    monkeypatch.setenv("VERCEL", "1")
    assert client.post("/api/v1/resume-import/read", headers=a, files=upload).status_code == 404


def test_account_switch_cannot_apply_another_owners_review(accounts, enabled):
    client, _, ids, (_, b) = accounts
    response = client.post(
        "/api/v1/resume-import/apply",
        headers=b,
        json={
            "expected_owner_id": ids[0],
            "revision": 0,
            "idempotency_key": str(uuid4()),
            "changes": [{"section": "profile", "values": {"name": "Wrong account"}}],
        },
    )
    assert response.status_code == 409
    assert client.get("/api/v1/resume", headers=b).json()["profile"]["name"] == ""


def test_daily_and_global_limits_share_database_state(accounts):
    _, engine, ids, _ = accounts
    now = datetime.now(timezone.utc)
    with Session(engine) as db:
        for _ in range(20):
            db.add(
                ImportAttempt(
                    id=str(uuid4()),
                    owner_id=ids[0],
                    created_at=now - timedelta(hours=2),
                    completed_at=now,
                )
            )
        db.commit()
        with pytest.raises(Exception) as error:
            reserve_attempt(db, ids[0])
        assert error.value.status_code == 429
        db.rollback()
        from sqlalchemy import delete

        db.execute(delete(ImportAttempt).where(ImportAttempt.owner_id == ids[0]))
        for _ in range(200):
            db.add(
                ImportAttempt(
                    id=str(uuid4()),
                    owner_id=ids[1],
                    created_at=now - timedelta(hours=2),
                    completed_at=now,
                )
            )
        db.commit()
        with pytest.raises(Exception) as error:
            reserve_attempt(db, ids[0])
        assert error.value.status_code == 429
