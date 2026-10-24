"""Import accounting and atomic, non-destructive application of reviewed changes."""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.api.v1.portfolio import status_for
from app.models.owner import PortfolioPublication
from app.models.project import Project
from app.models.resume import (
    Contact,
    ContactLink,
    Education,
    Experience,
    ExperienceHighlight,
    Profile,
    SkillGroup,
    SkillItem,
)
from app.models.resume_import import ImportAttempt, ImportReceipt
from app.schemas.resume_import import REQUIRED, ApplyImport

MODELS: dict[str, Any] = {
    "profile": Profile,
    "contact": Contact,
    "skills": SkillGroup,
    "experience": Experience,
    "education": Education,
    "projects": Project,
    "links": ContactLink,
}


def expire_metadata(db: Session):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    db.execute(delete(ImportAttempt).where(ImportAttempt.created_at < cutoff))
    db.execute(delete(ImportReceipt).where(ImportReceipt.created_at < cutoff))


def reserve_attempt(db: Session, owner: str, operation: str = "analyze") -> str:
    if operation not in {"analyze", "write"}:
        raise ValueError("Unknown operation")
    hourly_limit, daily_limit, global_limit = (
        (20, 50, 500) if operation == "write" else (5, 20, 200)
    )
    # A single short transaction serializes the global quota across instances.
    db.execute(text("SELECT pg_advisory_xact_lock(735281904)"))
    expire_metadata(db)
    now = datetime.now(timezone.utc)
    active = db.scalar(
        select(func.count())
        .select_from(ImportAttempt)
        .where(
            ImportAttempt.owner_id == owner,
            ImportAttempt.completed_at.is_(None),
            ImportAttempt.created_at > now - timedelta(seconds=120),
        )
    )
    hour = db.scalar(
        select(func.count())
        .select_from(ImportAttempt)
        .where(
            ImportAttempt.owner_id == owner,
            ImportAttempt.operation == operation,
            ImportAttempt.created_at > now - timedelta(hours=1),
        )
    )
    day = db.scalar(
        select(func.count())
        .select_from(ImportAttempt)
        .where(ImportAttempt.owner_id == owner, ImportAttempt.operation == operation)
    )
    total = db.scalar(
        select(func.count()).select_from(ImportAttempt).where(ImportAttempt.operation == operation)
    )
    if (
        active
        or (hour or 0) >= hourly_limit
        or (day or 0) >= daily_limit
        or (total or 0) >= global_limit
    ):
        raise HTTPException(
            429,
            "Import limit reached. Retry later or use the manual editor.",
            headers={"Retry-After": "300"},
        )
    key = str(uuid4())
    db.add(ImportAttempt(id=key, owner_id=owner, created_at=now, operation=operation))
    db.commit()
    return key


def safe_values(section: str, values: dict):
    result = {}
    for key, value in values.items():
        if isinstance(value, str):
            value = value.strip()
        if isinstance(value, list):
            if any(
                not isinstance(v, str)
                or not v.strip()
                or len(v) > (200 if key == "items" else 2000)
                for v in value
            ):
                raise HTTPException(400, "Check the selected list entries.")
            value = list(dict.fromkeys(v.strip() for v in value))
        if key in {"url", "demo_url", "repository_url"} and value:
            from urllib.parse import urlsplit

            try:
                parsed = urlsplit(value)
                if (
                    parsed.scheme not in {"http", "https"}
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                ):
                    raise ValueError()
            except ValueError:
                raise HTTPException(400, "Use a valid http or https link.") from None
        if key == "email" and value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise HTTPException(400, "Check the selected email address.")
        if (
            key in {"started", "ended"}
            and value
            and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", value)
        ):
            raise HTTPException(400, "Complete dates as YYYY-MM, or omit optional dates.")
        if section == "projects" and key == "technologies" and any(len(v) > 50 for v in value):
            raise HTTPException(400, "Project technologies must be at most 50 characters.")
        result[key] = value
    return result


def apply_import(db: Session, owner: str, body: ApplyImport):
    if body.expected_owner_id != owner:
        raise HTTPException(
            409, "The signed-in account changed. Start a new import in your own workspace."
        )
    publication = db.scalar(
        select(PortfolioPublication).where(PortfolioPublication.owner_id == owner).with_for_update()
    )
    assert publication is not None
    expire_metadata(db)
    digest = hashlib.sha256(
        json.dumps(body.model_dump(), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    receipt = db.get(ImportReceipt, (owner, body.idempotency_key))
    if receipt:
        if receipt.digest != digest:
            raise HTTPException(409, "This save key was already used for different changes.")
        return {
            "revision": receipt.revision,
            "counts": receipt.counts,
            "status": status_for(db, owner, publication).model_dump(mode="json"),
            "replayed": True,
        }
    if body.revision != publication.draft_revision:
        raise HTTPException(
            409, "Your draft changed. Refresh existing values and review your choices again."
        )
    counts: dict[str, int] = {}
    seen: set[tuple[str, int | None]] = set()
    for change in body.changes:
        section = change.section
        model = MODELS[section]
        row: Any = None
        if section in {"profile", "contact"}:
            if change.target_id is not None:
                raise HTTPException(400, "Profile and contact are selected by the signed-in owner.")
            row = db.scalar(select(model).where(model.user_id == owner))
        elif change.target_id is not None:
            row = db.scalar(
                select(model).where(model.id == change.target_id, model.user_id == owner)
            )
            if row is None:
                raise HTTPException(404, "Selected entry not found in your account.")
        identity = (section, change.target_id)
        if (row is not None or section in {"profile", "contact"}) and identity in seen:
            raise HTTPException(400, "Review duplicate updates to the same entry.")
        seen.add(identity)
        values = safe_values(section, change.values)
        for key in REQUIRED[section]:
            if not (values.get(key) if key in values else getattr(row, key, None)):
                raise HTTPException(400, f"Complete {section} {key}, or exclude this entry.")
        if section == "experience":
            current = values.get("current", getattr(row, "current", False))
            ended = values.get("ended", getattr(row, "ended", None))
            if not current and not ended:
                raise HTTPException(
                    400, "Supply an end date or explicitly mark the role as current."
                )
            if current:
                values["ended"] = None
        started = values.get("started", getattr(row, "started", None))
        ended = values.get("ended", getattr(row, "ended", None))
        if started and ended and ended < started:
            raise HTTPException(400, "An end date cannot precede the start date.")
        nested_key = (
            "items" if section == "skills" else "highlights" if section == "experience" else None
        )
        nested = values.pop(nested_key, []) if nested_key else []
        if row is None:
            defaults: dict[str, Any] = {"user_id": owner}
            if section in {"experience", "education", "projects"}:
                defaults["slug"] = "import-" + uuid4().hex
                defaults["display_order"] = (
                    db.scalar(select(func.max(model.display_order)).where(model.user_id == owner))
                    or 0
                ) + 1
            if section == "skills":
                defaults["display_order"] = (
                    db.scalar(
                        select(func.max(SkillGroup.display_order)).where(
                            SkillGroup.user_id == owner
                        )
                    )
                    or 0
                ) + 1
            if section == "links":
                contact = db.scalar(select(Contact).where(Contact.user_id == owner))
                assert contact is not None
                defaults["contact_id"] = contact.id
                defaults["display_order"] = (
                    db.scalar(
                        select(func.max(ContactLink.display_order)).where(
                            ContactLink.user_id == owner
                        )
                    )
                    or 0
                ) + 1
            row = model(**defaults, **values)
            db.add(row)
        else:
            for key, value in values.items():
                if key == "technologies":
                    value = list(dict.fromkeys([*row.technologies, *value]))
                    if len(value) > 20:
                        raise HTTPException(400, "A project can contain at most 20 technologies.")
                setattr(row, key, value)
        db.flush()
        if nested_key:
            child_model: Any = SkillItem if section == "skills" else ExperienceHighlight
            parent_key = "group_id" if section == "skills" else "experience_id"
            text_key = "item" if section == "skills" else "text"
            children = list(
                db.scalars(
                    select(child_model).where(
                        child_model.user_id == owner, getattr(child_model, parent_key) == row.id
                    )
                )
            )
            known = {getattr(c, text_key).casefold() for c in children}
            order = max((c.display_order for c in children), default=-1) + 1
            for value in nested:
                if value.casefold() not in known:
                    db.add(
                        child_model(
                            user_id=owner,
                            **{parent_key: row.id, text_key: value, "display_order": order},
                        )
                    )
                    known.add(value.casefold())
                    order += 1
        counts[section] = counts.get(section, 0) + 1
    db.flush()
    # Plain Session intentionally performs one revision increment for the whole import.
    publication.draft_revision += 1
    db.add(
        ImportReceipt(
            owner_id=owner,
            key=body.idempotency_key,
            digest=digest,
            revision=publication.draft_revision,
            counts=counts,
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    return {
        "revision": publication.draft_revision,
        "counts": counts,
        "status": status_for(db, owner, publication).model_dump(mode="json"),
        "replayed": False,
    }
