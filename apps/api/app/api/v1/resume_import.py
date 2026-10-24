"""Private import proposals, streamed progress, and explicit draft application."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import AuthRoute
from app.api.v1.portfolio import owner_id
from app.core.config import settings
from app.db.session import get_db
from app.models.owner import PortfolioPublication
from app.models.resume_import import ImportAttempt
from app.schemas.resume_import import ApplyImport
from app.services.resume_extraction import (
    MAX_FILE_BYTES,
    ImportProblem,
    extract_bounded,
    map_resume,
)
from app.services.resume_import import apply_import, reserve_attempt

router = APIRouter(route_class=AuthRoute, tags=["resume import"])


def require_import():
    if not settings.RESUME_IMPORT_ENABLED or not settings.NVIDIA_API_KEY:
        raise HTTPException(
            503, "Resume import is unavailable. You can still use the manual editor."
        )


@router.post("/resume-import/analyze")
def analyze(
    file: UploadFile = File(...),  # noqa: B008
    consent: bool = Form(...),  # noqa: B008
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    require_import()
    if not consent:
        raise HTTPException(400, "Consent is required before sending resume text to NVIDIA.")
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".pdf", ".docx"}:
        raise HTTPException(400, "Choose a PDF or DOCX file.")
    try:
        content = file.file.read(MAX_FILE_BYTES + 1)
    finally:
        file.file.close()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(413, "Choose a file no larger than 3 MiB.")
    revision = db.scalar(
        select(PortfolioPublication.draft_revision).where(PortfolioPublication.owner_id == owner)
    )
    attempt = reserve_attempt(db, owner)
    bind = db.get_bind()

    def events():
        nonlocal content

        def event(value):
            return json.dumps(value, separators=(",", ":")) + "\n"

        try:
            yield event({"stage": "reading"})
            document = extract_bounded(content, extension)
            content = b""
            yield event({"stage": "mapping"})
            proposals = map_resume(document)
            yield event({"stage": "ready", "revision": revision, **proposals.model_dump()})
        except ImportProblem as exc:
            yield event({"stage": "error", "detail": str(exc)})
        except Exception:
            yield event(
                {
                    "stage": "error",
                    "detail": "Import could not finish. Nothing was saved; "
                    "use the manual editor or retry.",
                }
            )
        finally:
            content = b""
            with Session(bind) as cleanup:
                row = cleanup.get(ImportAttempt, attempt)
                if row:
                    row.completed_at = datetime.now(timezone.utc)
                    cleanup.commit()

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post("/resume-import/apply")
def apply(
    body: ApplyImport,
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    require_import()
    try:
        return apply_import(db, owner, body)
    except Exception:
        db.rollback()
        raise


@router.get("/resume-import/context")
def context(
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    from app.api.v1.portfolio import status_for
    from app.api.v1.projects import list_projects
    from app.api.v1.resume import get_resume
    from app.db.tenant import TenantSession
    from app.schemas.project import ProjectsResponse

    with TenantSession(db.get_bind(), user_id=owner, read_only=True) as tenant:
        publication = tenant.scalar(
            select(PortfolioPublication)
            .where(PortfolioPublication.owner_id == owner)
            .with_for_update(read=True)
        )
        assert publication is not None
        return {
            "resume": get_resume(tenant).model_dump(mode="json"),
            "projects": ProjectsResponse.model_validate(list_projects(tenant)).model_dump(
                mode="json"
            ),
            "status": status_for(tenant, owner, publication).model_dump(mode="json"),
            "enabled": bool(settings.RESUME_IMPORT_ENABLED and settings.NVIDIA_API_KEY),
            "can_read_locally": bool(
                settings.RESUME_IMPORT_LOCAL_PREVIEW and not os.environ.get("VERCEL")
            ),
        }


@router.post("/resume-import/read")
def read_locally(
    file: UploadFile = File(...),  # noqa: B008
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
):
    if not settings.RESUME_IMPORT_LOCAL_PREVIEW or os.environ.get("VERCEL"):
        raise HTTPException(404, "Local document preview is unavailable.")
    extension = Path(file.filename or "").suffix.lower()
    try:
        content = file.file.read(MAX_FILE_BYTES + 1)
    finally:
        file.file.close()
    attempt = reserve_attempt(db, owner)
    try:
        document = extract_bounded(content, extension)
        return {"text": document, "characters": len(document)}
    except ImportProblem as exc:
        raise HTTPException(400, str(exc)) from None
    finally:
        row = db.get(ImportAttempt, attempt)
        if row:
            row.completed_at = datetime.now(timezone.utc)
            db.commit()
