"""SQLAlchemy 2 models for editable resume content.

Sections: profile, skill_groups + skill_items, experience +
experience_highlights, education, contact + contact_links.
"""

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Profile(Base):
    """Single-row table for the owner's profile/hero content."""

    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    headline: Mapped[str] = mapped_column(String(300), nullable=False)
    introduction: Mapped[str] = mapped_column(Text, nullable=False)
    about: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)


class SkillGroup(Base):
    """A named group of skills, e.g. 'Data Engineering & Cloud Warehousing'."""

    __tablename__ = "skill_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    items: Mapped[list["SkillItem"]] = relationship(
        "SkillItem", back_populates="group", cascade="all, delete-orphan", order_by="SkillItem.display_order"
    )


class SkillItem(Base):
    """A single skill within a SkillGroup."""

    __tablename__ = "skill_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("skill_groups.id", ondelete="CASCADE"), nullable=False)
    item: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    group: Mapped["SkillGroup"] = relationship("SkillGroup", back_populates="items")


class Experience(Base):
    """A work experience entry."""

    __tablename__ = "experience"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    organization: Mapped[str] = mapped_column(String(200), nullable=False)
    started: Mapped[str] = mapped_column(String(20), nullable=False)  # YYYY-MM
    ended: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    highlights: Mapped[list["ExperienceHighlight"]] = relationship(
        "ExperienceHighlight", back_populates="experience", cascade="all, delete-orphan",
        order_by="ExperienceHighlight.display_order"
    )


class ExperienceHighlight(Base):
    """A bullet-point highlight for an Experience entry."""

    __tablename__ = "experience_highlights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    experience_id: Mapped[int] = mapped_column(ForeignKey("experience.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    experience: Mapped["Experience"] = relationship("Experience", back_populates="highlights")


class Education(Base):
    """An education entry."""

    __tablename__ = "education"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    qualification: Mapped[str] = mapped_column(String(300), nullable=False)
    institution: Mapped[str] = mapped_column(String(300), nullable=False)
    started: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ended: Mapped[str | None] = mapped_column(String(20), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Contact(Base):
    """Single-row contact info."""

    __tablename__ = "contact"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)

    links: Mapped[list["ContactLink"]] = relationship(
        "ContactLink", back_populates="contact", cascade="all, delete-orphan",
        order_by="ContactLink.display_order"
    )


class ContactLink(Base):
    """A labelled URL in the contact section (GitHub, Tableau Public, etc.)."""

    __tablename__ = "contact_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("contact.id", ondelete="CASCADE"), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(1024), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    contact: Mapped["Contact"] = relationship("Contact", back_populates="links")
