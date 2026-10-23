"""Read-only public portfolios selected by stable application owner ID."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.v1 import avatar, project_screenshot, projects, resume
from app.api.v1.auth import AuthRoute
from app.core.storage import ProfileImageStore, get_image_store
from app.db.tenant import get_public_db
from app.schemas.project import ProjectResponse, ProjectsResponse
from app.schemas.resume import ResumeResponse

router = APIRouter(route_class=AuthRoute)


@router.get("/resume", response_model=ResumeResponse)
def public_resume(db: Session = Depends(get_public_db)):  # noqa: B008
    data = resume.get_resume(db)
    if data.profile:
        for field in ("avatar_url", "banner_url"):
            value = getattr(data.profile, field)
            if value:
                setattr(
                    data.profile,
                    field,
                    value.replace("/api/v1/", f"/api/v1/public/users/{db.info['user_id']}/"),
                )
    return data


@router.get("/projects", response_model=ProjectsResponse)
def public_projects(db: Session = Depends(get_public_db)):  # noqa: B008
    data = ProjectsResponse.model_validate(projects.list_projects(db))
    for row in data.items:
        if row.screenshot_url:
            row.screenshot_url = row.screenshot_url.replace(
                "/api/v1/", f"/api/v1/public/users/{db.info['user_id']}/"
            )
    return data


@router.get("/resume/profile/{kind}")
def public_image(
    kind: str,
    request: Request,
    db: Session = Depends(get_public_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):  # noqa: B008
    from fastapi import HTTPException

    if kind not in {"avatar", "banner"}:
        raise HTTPException(404, "Image not found")
    return (
        avatar.get_avatar(request, db, store)
        if kind == "avatar"
        else avatar.get_banner(request, db, store)
    )


@router.get("/projects/{slug}", response_model=ProjectResponse)
def public_project(slug: str, db: Session = Depends(get_public_db)):  # noqa: B008
    data = ProjectResponse.model_validate(projects.get_project(slug, db))
    if data.screenshot_url:
        data.screenshot_url = data.screenshot_url.replace(
            "/api/v1/", f"/api/v1/public/users/{db.info['user_id']}/"
        )
    return data


@router.get("/projects/{slug}/screenshot")
def public_screenshot(
    slug: str,
    request: Request,
    db: Session = Depends(get_public_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):  # noqa: B008
    return project_screenshot.get_project_screenshot(slug, request, db, store)
