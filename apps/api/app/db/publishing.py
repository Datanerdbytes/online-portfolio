"""Atomic publication copies and retention of media referenced by those copies."""

from typing import cast
from uuid import uuid4

from sqlalchemy import Table, delete, exists, or_, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models.owner import PortfolioOwner
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

CONTENT_MODELS = (
    Profile,
    Contact,
    SkillGroup,
    Experience,
    Education,
    Project,
    SkillItem,
    ExperienceHighlight,
    ContactLink,
)
PARENTS = {
    "skill_items": ("group_id", "skill_groups"),
    "experience_highlights": ("experience_id", "experience"),
    "contact_links": ("contact_id", "contact"),
}


def copy_content(connection: Connection, source: str, destination: str) -> None:
    """Copy all owned rows, remapping nested foreign keys inside one transaction."""
    for model in reversed(CONTENT_MODELS):
        table = cast(Table, model.__table__)
        connection.execute(delete(table).where(table.c.user_id == destination))
    ids: dict[str, dict[int, int]] = {}
    for model in CONTENT_MODELS:
        table = cast(Table, model.__table__)
        ids[table.name] = {}
        rows = (
            connection.execute(select(table).where(table.c.user_id == source).order_by(table.c.id))
            .mappings()
            .all()
        )
        for row in rows:
            values = {key: value for key, value in row.items() if key != "id"}
            values["user_id"] = destination
            if table.name in PARENTS:
                key, parent = PARENTS[table.name]
                values[key] = ids[parent][row[key]]
            new_id = connection.execute(table.insert().values(**values).returning(table.c.id))
            ids[table.name][row["id"]] = new_id.scalar_one()


def new_snapshot_owner(db: Session) -> str:
    owner_id = f"snapshot-{uuid4()}"
    db.add(PortfolioOwner(id=owner_id))
    db.flush()
    return owner_id


def image_is_referenced(db: Session, filename: str) -> bool:
    """Core queries intentionally cover both draft and published owners."""
    profile = Profile.__table__
    project = Project.__table__
    return bool(
        db.connection().scalar(
            select(
                or_(
                    exists(
                        select(profile.c.id).where(
                            or_(
                                profile.c.avatar_filename == filename,
                                profile.c.banner_filename == filename,
                            )
                        )
                    ),
                    exists(select(project.c.id).where(project.c.screenshot_filename == filename)),
                )
            )
        )
    )


def content_image_filenames(connection: Connection, owner: str) -> set[str]:
    profile = Profile.__table__
    project = Project.__table__
    rows = connection.execute(
        select(profile.c.avatar_filename, profile.c.banner_filename).where(
            profile.c.user_id == owner
        )
    ).all()
    names = {name for row in rows for name in row if name}
    names.update(
        name
        for name in connection.scalars(
            select(project.c.screenshot_filename).where(project.c.user_id == owner)
        )
        if name
    )
    return names
