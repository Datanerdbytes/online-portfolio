"""SQLAlchemy 2 models for editable resume content.

Sections: profile, skill_groups + skill_items, experience +
experience_highlights, education, contact + contact_links.
"""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.avatar import AVATAR_URL
from app.db.base import Base
from app.models.owner import OwnedContent

PROFILE_BANNER_URL = "/api/v1/resume/profile/banner"


class Profile(OwnedContent, Base):
    """Single-row table for the owner's profile/hero content."""

    __tablename__ = "profile"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_profile_id_user"),
        UniqueConstraint("user_id", name="uq_profile_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    headline: Mapped[str] = mapped_column(String(300), nullable=False)
    introduction: Mapped[str] = mapped_column(Text, nullable=False)
    about: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Portrait metadata. All three are NULL when no portrait exists; the absence of
    # a portrait is expressed by the absence of metadata, never by a sentinel name.
    avatar_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    banner_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    banner_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    banner_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def avatar_url(self) -> str | None:
        """Canonical URL of the portrait, or None when there is none.

        The stored filename stays inside the API: this is the only reference a
        client ever receives.
        """
        return AVATAR_URL if self.avatar_filename else None

    @property
    def banner_url(self) -> str | None:
        """Canonical URL of the hero banner, or None when there is none."""
        return PROFILE_BANNER_URL if self.banner_filename else None


class SkillGroup(OwnedContent, Base):
    """A named group of skills, e.g. 'Data Engineering & Cloud Warehousing'."""

    __tablename__ = "skill_groups"
    __table_args__ = (UniqueConstraint("id", "user_id", name="uq_skill_groups_id_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    items: Mapped[list["SkillItem"]] = relationship(
        "SkillItem",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="SkillItem.display_order",
    )


class SkillItem(OwnedContent, Base):
    """A single skill within a SkillGroup."""

    __tablename__ = "skill_items"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_skill_items_id_user"),
        ForeignKeyConstraint(
            ["group_id", "user_id"],
            ["skill_groups.id", "skill_groups.user_id"],
            ondelete="CASCADE",
            name="fk_skill_items_parent_user",
        ),
        UniqueConstraint("user_id", "idempotency_key", name="uq_skill_items_user_idempotency_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(Integer, nullable=False)
    item: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(36), nullable=True)

    group: Mapped["SkillGroup"] = relationship("SkillGroup", back_populates="items")


class Experience(OwnedContent, Base):
    """A work experience entry."""

    __tablename__ = "experience"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_experience_id_user"),
        UniqueConstraint("user_id", "slug", name="uq_experience_user_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    organization: Mapped[str] = mapped_column(String(200), nullable=False)
    started: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM
    ended: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    highlights: Mapped[list["ExperienceHighlight"]] = relationship(
        "ExperienceHighlight",
        back_populates="experience",
        cascade="all, delete-orphan",
        order_by="ExperienceHighlight.display_order",
    )


class ExperienceHighlight(OwnedContent, Base):
    """A bullet-point highlight for an Experience entry."""

    __tablename__ = "experience_highlights"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_experience_highlights_id_user"),
        ForeignKeyConstraint(
            ["experience_id", "user_id"],
            ["experience.id", "experience.user_id"],
            ondelete="CASCADE",
            name="fk_experience_highlights_parent_user",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    experience_id: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    experience: Mapped["Experience"] = relationship("Experience", back_populates="highlights")


class Education(OwnedContent, Base):
    """An education entry."""

    __tablename__ = "education"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_education_id_user"),
        UniqueConstraint("user_id", "slug", name="uq_education_user_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    qualification: Mapped[str] = mapped_column(String(300), nullable=False)
    institution: Mapped[str] = mapped_column(String(300), nullable=False)
    started: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ended: Mapped[str | None] = mapped_column(String(20), nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


class Contact(OwnedContent, Base):
    """Single-row contact info."""

    __tablename__ = "contact"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_contact_id_user"),
        UniqueConstraint("user_id", name="uq_contact_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)

    links: Mapped[list["ContactLink"]] = relationship(
        "ContactLink",
        back_populates="contact",
        cascade="all, delete-orphan",
        order_by="ContactLink.display_order",
    )


class ContactLink(OwnedContent, Base):
    """A labelled URL in the contact section (GitHub, Tableau Public, etc.)."""

    __tablename__ = "contact_links"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_contact_links_id_user"),
        ForeignKeyConstraint(
            ["contact_id", "user_id"],
            ["contact.id", "contact.user_id"],
            ondelete="CASCADE",
            name="fk_contact_links_parent_user",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contact_id: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    contact: Mapped["Contact"] = relationship("Contact", back_populates="links")
