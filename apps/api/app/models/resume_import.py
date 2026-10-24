"""Import operational metadata only. Never store source documents or proposals."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImportAttempt(Base):
    __tablename__ = "resume_import_attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("portfolio_owners.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    operation: Mapped[str] = mapped_column(String(16), default="analyze", server_default="analyze")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ImportReceipt(Base):
    __tablename__ = "resume_import_receipts"
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("portfolio_owners.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(36), primary_key=True)
    digest: Mapped[str] = mapped_column(String(64))
    revision: Mapped[int] = mapped_column(Integer)
    counts: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
