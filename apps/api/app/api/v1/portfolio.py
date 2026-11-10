"""Owner workspace state and explicit publication of saved drafts."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.v1.auth import AuthRoute
from app.core.auth import verify_owner_token
from app.core.storage import ProfileImageError, ProfileImageStore, get_image_store
from app.db.publishing import (
    content_image_filenames,
    copy_content,
    image_is_referenced,
    new_snapshot_owner,
)
from app.db.session import get_db
from app.db.tenant import provision_owner
from app.models.owner import PortfolioOwner, PortfolioPublication
from app.models.project import Project
from app.models.resume import Experience, Profile

router = APIRouter(route_class=AuthRoute, tags=["portfolio"])
logger = logging.getLogger(__name__)


class PublicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0, strict=True)


class PortfolioStatus(BaseModel):
    owner_id: str
    is_published: bool
    has_unpublished_changes: bool
    revision: int
    published_at: datetime | None
    profile_complete: bool
    has_work: bool


def owner_id(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> str:  # noqa: B008
    return provision_owner(db, verify_owner_token(authorization).sub)


def status_for(db: Session, owner: str, publication: PortfolioPublication) -> PortfolioStatus:
    profile = db.scalar(select(Profile).where(Profile.user_id == owner))
    complete = bool(
        profile
        and all((profile.name.strip(), profile.headline.strip(), profile.introduction.strip()))
    )
    projects = db.scalar(select(func.count()).select_from(Project).where(Project.user_id == owner))
    experience = db.scalar(
        select(func.count()).select_from(Experience).where(Experience.user_id == owner)
    )
    return PortfolioStatus(
        owner_id=owner,
        is_published=publication.is_published,
        has_unpublished_changes=publication.draft_revision != publication.published_revision,
        revision=publication.draft_revision,
        published_at=publication.published_at,
        profile_complete=complete,
        has_work=bool(projects or experience),
    )


@router.get("/portfolio", response_model=PortfolioStatus)
def status(owner: str = Depends(owner_id), db: Session = Depends(get_db)):  # noqa: B008
    publication = db.get(PortfolioPublication, owner)
    assert publication is not None
    return status_for(db, owner, publication)


@router.post("/portfolio/{action}", response_model=PortfolioStatus)
def publish(
    action: str,
    body: PublicationRequest,
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):
    if action not in {"publish", "unpublish"}:
        raise HTTPException(404, "Action not found")
    publication = db.scalar(
        select(PortfolioPublication).where(PortfolioPublication.owner_id == owner).with_for_update()
    )
    assert publication is not None
    if publication.draft_revision != body.revision:
        raise HTTPException(409, "Your draft changed. Refresh the preview before publishing.")
    previous_images: set[str] = set()
    if action == "publish":
        if not status_for(db, owner, publication).profile_complete:
            raise HTTPException(400, "Add your name, headline, and introduction before publishing.")
        if not publication.snapshot_owner_id:
            publication.snapshot_owner_id = new_snapshot_owner(db)
        else:
            previous_images = content_image_filenames(
                db.connection(), publication.snapshot_owner_id
            )
        copy_content(db.connection(), owner, publication.snapshot_owner_id)
        publication.is_published = True
        publication.published_at = datetime.now(timezone.utc)
        publication.published_revision = publication.draft_revision
    else:
        publication.is_published = False
    db.commit()
    result = status_for(db, owner, publication)
    for filename in previous_images:
        try:
            if not image_is_referenced(db, filename):
                store.delete(filename)
        except (ProfileImageError, SQLAlchemyError):
            logger.warning("Unused publication media could not be cleaned up")
            db.rollback()
    return result


@router.delete(
    "/portfolio/data",
    status_code=204,
    summary="Delete all portfolio data",
    description=(
        "Permanently delete every draft and published content row, import "
        "record, and uploaded media file for the authenticated owner. The "
        "sign-in account itself is not removed. Returns an empty 204."
    ),
)
def delete_portfolio_data(
    owner: str = Depends(owner_id),  # noqa: B008
    db: Session = Depends(get_db),  # noqa: B008
    store: ProfileImageStore = Depends(get_image_store),  # noqa: B008
):
    try:
        publication = db.scalar(
            select(PortfolioPublication)
            .where(PortfolioPublication.owner_id == owner)
            .with_for_update()
        )
        snapshot_owner_id = publication.snapshot_owner_id if publication else None
        filenames = content_image_filenames(db.connection(), owner)
        if snapshot_owner_id:
            filenames |= content_image_filenames(db.connection(), snapshot_owner_id)
        # The publication row must go first: its snapshot_owner_id FK has no
        # ON DELETE rule, so the snapshot owner cannot be removed while it exists.
        if publication is not None:
            db.delete(publication)
        if snapshot_owner_id:
            snapshot = db.get(PortfolioOwner, snapshot_owner_id)
            if snapshot is not None:
                db.delete(snapshot)
        account = db.get(PortfolioOwner, owner)
        if account is not None:
            db.delete(account)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "Portfolio service temporarily unavailable.") from None
    for filename in filenames:
        try:
            if not image_is_referenced(db, filename):
                store.delete(filename)
        except (ProfileImageError, SQLAlchemyError):
            logger.warning("Unused media could not be cleaned up")
            db.rollback()
    return None
