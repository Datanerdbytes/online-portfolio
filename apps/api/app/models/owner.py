"""Application ownership only; Neon owns all authentication data."""

from sqlalchemy import ForeignKey, String
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
