"""Project routes.

Public listing; authenticated, owner-verified mutations. Reuses A0 bearer
authentication: every mutation independently verifies the bearer token and
owner through FastAPI, never cookies or supplied owner headers.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.auth import AuthRoute
from app.api.v1.project_screenshot import remove_screenshot_quietly
from app.core.auth import TokenClaims, verify_owner_token
from app.core.storage import ProfileImageStore, get_image_store
from app.db.tenant import get_content_db as get_db
from app.models.project import Project
from app.schemas.project import (
    ProjectCreate,
    ProjectPatch,
    ProjectReplace,
    ProjectResponse,
    ProjectsResponse,
    ReorderRequest,
    ReorderResponse,
)

router = APIRouter(route_class=AuthRoute)


def get_current_owner(authorization: str | None = Header(None)) -> TokenClaims:  # noqa: B008  # FastAPI idiom
    """Verify the bearer token and return the owner identity for a mutation."""
    return verify_owner_token(authorization)


@router.post(
    "/projects/reorder",
    response_model=ReorderResponse,
    summary="Atomically reorder projects",
    description=(
        "Validate and update display_order for the supplied slugs in a single "
        "transaction with target rows locked. Any invalid entry, duplicate "
        "slug, or missing target rejects the whole batch with no partial "
        "writes. Returns the number of supplied target rows."
    ),
)
def reorder_projects(
    body: ReorderRequest,
    current_owner: TokenClaims = Depends(get_current_owner),  # noqa: B008  # FastAPI idiom
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
):
    slugs = [entry.slug for entry in body.orders]
    if len(set(slugs)) != len(slugs):
        raise HTTPException(status_code=400, detail="Duplicate slug in reorder batch")

    try:
        rows = (
            db.query(Project)
            .filter(Project.slug.in_(slugs))
            .order_by(Project.id)
            .with_for_update()
            .all()
        )
        found = {row.slug: row for row in rows}
        missing = [slug for slug in slugs if slug not in found]
        if missing:
            raise HTTPException(status_code=404, detail="Project not found")

        for entry in body.orders:
            found[entry.slug].display_order = entry.display_order

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    return ReorderResponse(updated=len(body.orders))


@router.post(
    "/projects",
    status_code=201,
    response_model=ProjectResponse,
    summary="Create a project",
    description=(
        "Create a project entry. ``is_sample`` is always false on creation. "
        "A duplicate slug, including a unique-constraint race, becomes a "
        "sanitized 409 after rollback."
    ),
)
def create_project(
    body: ProjectCreate,
    current_owner: TokenClaims = Depends(get_current_owner),  # noqa: B008  # FastAPI idiom
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
):
    project = Project(
        slug=body.slug,
        title=body.title,
        summary=body.summary,
        technologies=body.technologies,
        repository_url=body.repository_url,
        demo_url=body.demo_url,
        display_order=body.display_order,
        is_sample=False,
    )
    try:
        db.add(project)
        db.flush()
        db.refresh(project)
        response = ProjectResponse.model_validate(project)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Project with this slug already exists"
        ) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    return response


@router.get(
    "/projects",
    response_model=ProjectsResponse,
    summary="List projects",
    description=(
        "Return project entries ordered by display_order ascending, then id "
        "ascending for deterministic ties. Returns an empty items list when "
        "no projects exist. Public: no authentication required."
    ),
)
def list_projects(db: Session = Depends(get_db)):  # noqa: B008  # FastAPI idiom
    try:
        items = db.query(Project).order_by(Project.display_order.asc(), Project.id.asc()).all()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    return {"items": items}


@router.get(
    "/projects/{slug}",
    response_model=ProjectResponse,
    summary="Get a project",
    description="Return one published project by slug. Public: no authentication required.",
)
def get_project(slug: str, db: Session = Depends(get_db)):  # noqa: B008  # FastAPI idiom
    try:
        project = db.query(Project).filter(Project.slug == slug).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put(
    "/projects/{slug}",
    response_model=ProjectResponse,
    summary="Fully replace a project",
    description=(
        "Replace every writable field of an existing project. The slug from "
        "the path is immutable; ``slug``, ``id``, ``is_sample``, and unknown "
        "fields in the body are rejected. ``is_sample`` is preserved."
    ),
)
def replace_project(
    slug: str,
    body: ProjectReplace,
    current_owner: TokenClaims = Depends(get_current_owner),  # noqa: B008  # FastAPI idiom
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
):
    try:
        project = db.query(Project).filter(Project.slug == slug).with_for_update().first()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        project.title = body.title
        project.summary = body.summary
        project.technologies = body.technologies
        project.repository_url = body.repository_url
        project.demo_url = body.demo_url
        project.display_order = body.display_order
        # is_sample is read-only: preserved on updates. Slug is immutable.
        db.flush()
        db.refresh(project)
        response = ProjectResponse.model_validate(project)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    return response


@router.patch(
    "/projects/{slug}",
    response_model=ProjectResponse,
    summary="Partially update a project",
    description=(
        "Update only the supplied fields. Omitted fields are unchanged; null "
        "clears only the two URL fields. Null is invalid for title, summary, "
        "technologies, and display_order. An empty body is rejected."
    ),
)
def patch_project(
    slug: str,
    body: ProjectPatch,
    current_owner: TokenClaims = Depends(get_current_owner),  # noqa: B008  # FastAPI idiom
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
):
    try:
        project = db.query(Project).filter(Project.slug == slug).with_for_update().first()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(project, field, value)

        db.flush()
        db.refresh(project)
        response = ProjectResponse.model_validate(project)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    return response


@router.delete(
    "/projects/{slug}",
    status_code=204,
    summary="Delete a project",
    description="Delete an existing project. Returns an empty 204 on success.",
)
def delete_project(
    slug: str,
    current_owner: TokenClaims = Depends(get_current_owner),  # noqa: B008  # FastAPI idiom
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):
    try:
        project = db.query(Project).filter(Project.slug == slug).with_for_update().first()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        screenshot_filename = getattr(project, "screenshot_filename", None)
        db.delete(project)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None
    remove_screenshot_quietly(store, screenshot_filename)
    return None
