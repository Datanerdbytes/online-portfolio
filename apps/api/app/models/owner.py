"""Application ownership only; Neon owns all authentication data."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

LEGACY_OWNER_ID = "00000000-0000-0000-0000-000000000001"


class PortfolioOwner(Base):
    __tablename__ = "portfolio_owners"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    neon_user_id: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)


class OwnedContent:
    user_id: Mapped[str] = mapped_column(
        ForeignKey("portfolio_owners.id", ondelete="CASCADE"), nullable=False, index=True
    )


class PortfolioPublication(Base):
    __tablename__ = "portfolio_publications"

    owner_id: Mapped[str] = mapped_column(
        ForeignKey("portfolio_owners.id", ondelete="CASCADE"), primary_key=True
    )
    snapshot_owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("portfolio_owners.id"), unique=True, nullable=True
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    draft_revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    published_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
