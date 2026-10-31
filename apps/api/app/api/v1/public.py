"""Read-only public portfolios selected by stable application owner ID."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.v1 import avatar, project_screenshot, projects, resume
from app.api.v1.auth import AuthRoute
from app.api.v1.public_urls import public_media_url, rewrite_profile_media
from app.core.storage import ProfileImageStore, get_image_store
from app.db.tenant import get_public_db
from app.schemas.project import ProjectResponse, ProjectsResponse
from app.schemas.resume import (
    ContactResponse,
    EducationListResponse,
    ExperienceListResponse,
    ProfileResponse,
    ResumeResponse,
    SkillsResponse,
)
from app.services import resume_reads

router = APIRouter(route_class=AuthRoute)


@router.get("/resume", response_model=ResumeResponse)
def public_resume(db: Session = Depends(get_public_db)):  # noqa: B008
    data = resume.get_resume(db)
    if data.profile:
        rewrite_profile_media(data.profile, db.info["public_user_id"])
    return data


@router.get("/about", response_model=ProfileResponse)
def public_about(db: Session = Depends(get_public_db)):  # noqa: B008
    profile = resume_reads.read_profile(db)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    # Rewrite on the response model: Profile.avatar_url/banner_url are read-only.
    return rewrite_profile_media(ProfileResponse.model_validate(profile), db.info["public_user_id"])


@router.get("/skills", response_model=SkillsResponse)
def public_skills(db: Session = Depends(get_public_db)):  # noqa: B008
    return SkillsResponse.model_validate({"items": resume_reads.read_skill_groups(db)})


@router.get("/experience", response_model=ExperienceListResponse)
def public_experience(db: Session = Depends(get_public_db)):  # noqa: B008
    return ExperienceListResponse.model_validate({"items": resume_reads.read_experience(db)})


@router.get("/education", response_model=EducationListResponse)
def public_education(db: Session = Depends(get_public_db)):  # noqa: B008
    return EducationListResponse.model_validate({"items": resume_reads.read_education(db)})


@router.get("/contact", response_model=ContactResponse)
def public_contact(db: Session = Depends(get_public_db)):  # noqa: B008
    contact = resume_reads.read_contact(db)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.get("/projects", response_model=ProjectsResponse)
def public_projects(db: Session = Depends(get_public_db)):  # noqa: B008
    data = ProjectsResponse.model_validate(projects.list_projects(db))
    for row in data.items:
        row.screenshot_url = public_media_url(row.screenshot_url, db.info["public_user_id"])
    return data


@router.get("/resume/profile/{kind}")
def public_image(
    kind: str,
    request: Request,
    db: Session = Depends(get_public_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):  # noqa: B008
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
    data.screenshot_url = public_media_url(data.screenshot_url, db.info["public_user_id"])
    return data


@router.get("/projects/{slug}/screenshot")
def public_screenshot(
    slug: str,
    request: Request,
    db: Session = Depends(get_public_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):  # noqa: B008
    return project_screenshot.get_project_screenshot(slug, request, db, store)
