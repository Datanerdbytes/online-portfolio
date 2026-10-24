"""Scoped application sessions; public reads and owner-only writes."""

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import event, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, with_loader_criteria

from app.core.auth import verify_owner_token
from app.core.config import settings
from app.db.session import engine, get_db
from app.models.owner import LEGACY_OWNER_ID, OwnedContent, PortfolioOwner, PortfolioPublication
from app.models.resume import Contact, Profile


class TenantSession(Session):
    def __init__(self, *args, user_id: str, read_only: bool = False, **kwargs):
        super().__init__(*args, **kwargs)
        self.info.update(user_id=user_id, read_only=read_only)


@event.listens_for(TenantSession, "do_orm_execute")
def restrict_reads(state):
    if not state.is_select or not state.is_orm_statement:
        raise RuntimeError("Content sessions prohibit raw and bulk operations")
    user_id = state.session.info["user_id"]
    state.statement = state.statement.options(
        with_loader_criteria(OwnedContent, lambda row: row.user_id == user_id, include_aliases=True)
    )


@event.listens_for(TenantSession, "before_flush")
def restrict_writes(db, context, instances):
    if db.info["read_only"] and (db.new or db.dirty or db.deleted):
        raise RuntimeError("Public sessions are read-only")
    for row in db.new.union(db.dirty).union(db.deleted):
        if not isinstance(row, OwnedContent):
            raise RuntimeError("Not an owned content record")
        if row in db.new and row.user_id is None:
            row.user_id = db.info["user_id"]
        if row.user_id != db.info["user_id"]:
            raise HTTPException(403, "Not authorized")
    if db.new or db.deleted or any(db.is_modified(row) for row in db.dirty):
        table = PortfolioPublication.__table__
        db.connection().execute(
            update(table)
            .where(table.c.owner_id == db.info["user_id"])
            .values(draft_revision=table.c.draft_revision + 1)
        )


def provision_owner(db: Session, neon_user_id: str) -> str:
    """Idempotent blank portfolio; never stores a password or Neon session."""
    if neon_user_id == settings.LEGACY_NEON_USER_ID:
        legacy = db.get(PortfolioOwner, LEGACY_OWNER_ID, with_for_update=True)
        if legacy is None or legacy.neon_user_id not in (None, neon_user_id):
            raise HTTPException(503, "Legacy portfolio ownership requires operator review")
        legacy.neon_user_id = neon_user_id
        db.commit()
        return legacy.id
    db.execute(
        insert(PortfolioOwner)
        .values(id=neon_user_id, neon_user_id=neon_user_id)
        .on_conflict_do_nothing()
    )
    owner = db.scalar(select(PortfolioOwner).where(PortfolioOwner.neon_user_id == neon_user_id))
    if owner is None:
        raise HTTPException(503, "Portfolio provisioning unavailable")
    db.execute(
        insert(Profile)
        .values(user_id=owner.id, name="", headline="", introduction="", about="")
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    db.execute(
        insert(Contact).values(user_id=owner.id).on_conflict_do_nothing(index_elements=["user_id"])
    )
    db.execute(insert(PortfolioPublication).values(owner_id=owner.id).on_conflict_do_nothing())
    db.commit()
    return owner.id


def get_public_db(user_id: str | None = None):
    with TenantSession(
        engine,
        user_id=user_id or settings.PUBLIC_PORTFOLIO_USER_ID,
        read_only=True,
        autoflush=False,
    ) as db:
        selected = user_id or settings.PUBLIC_PORTFOLIO_USER_ID
        table = PortfolioPublication.__table__
        snapshot = db.connection().scalar(
            select(table.c.snapshot_owner_id)
            .where(table.c.owner_id == selected, table.c.is_published.is_(True))
            .with_for_update(read=True)
        )
        if not snapshot:
            raise HTTPException(404, "Portfolio not published")
        db.info.update(user_id=snapshot, public_user_id=selected)
        yield db


def get_content_db(
    request: Request,
    authorization: str | None = Header(None),
    account_db: Session = Depends(get_db),  # noqa: B008
):
    if request.method in {"GET", "HEAD"}:
        selected = request.query_params.get("user_id")
        if selected or not authorization:
            yield from get_public_db(selected)
            return
    claims = verify_owner_token(authorization)
    owner_id = provision_owner(account_db, claims.sub)
    with TenantSession(engine, user_id=owner_id, autoflush=False) as db:
        if request.method not in {"GET", "HEAD"}:
            table = PortfolioPublication.__table__
            db.connection().execute(
                select(table.c.owner_id).where(table.c.owner_id == owner_id).with_for_update()
            )
        yield db
