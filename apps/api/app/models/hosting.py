"""Persistent media and shared login limits for stateless API hosting."""

from sqlalchemy import BigInteger, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoredImage(Base):
    __tablename__ = "stored_images"

    filename: Mapped[str] = mapped_column(String(255), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class LoginBucket(Base):
    __tablename__ = "login_buckets"

    scope: Mapped[str] = mapped_column(String(100), primary_key=True)
    window: Mapped[int] = mapped_column(BigInteger, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
