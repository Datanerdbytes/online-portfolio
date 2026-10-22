"""Pydantic schemas for resume content endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

class ProfileBase(BaseModel):
    name: str
    headline: str
    introduction: str
    about: str
    location: str | None = None


class ProfileResponse(ProfileBase):
    id: int
    # Canonical URL of the portrait, or None when no portrait exists. The stored
    # filename is never exposed.
    avatar_url: str | None = None
    avatar_updated_at: datetime | None = None
    avatar_content_type: str | None = None
    banner_url: str | None = None
    banner_updated_at: datetime | None = None
    banner_content_type: str | None = None
    model_config = ConfigDict(from_attributes=True)


class ProfilePatch(BaseModel):
    name: str | None = None
    headline: str | None = None
    introduction: str | None = None
    about: str | None = None
    location: str | None = None


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

class SkillItemResponse(BaseModel):
    id: int
    item: str
    display_order: int
    model_config = ConfigDict(from_attributes=True)


class SkillGroupResponse(BaseModel):
    id: int
    label: str
    display_order: int
    items: list[SkillItemResponse] = []
    model_config = ConfigDict(from_attributes=True)


class SkillGroupCreate(BaseModel):
    label: str
    display_order: int = 0
    items: list[str] = []


class SkillGroupPatch(BaseModel):
    label: str | None = None
    display_order: int | None = None


class SkillItemCreate(BaseModel):
    item: str
    display_order: int = 0


class SkillItemPatch(BaseModel):
    item: str | None = None
    display_order: int | None = None


# ---------------------------------------------------------------------------
# Experience
# ---------------------------------------------------------------------------

class HighlightResponse(BaseModel):
    id: int
    text: str
    display_order: int
    model_config = ConfigDict(from_attributes=True)


class ExperienceResponse(BaseModel):
    id: int
    slug: str
    role: str
    organization: str
    started: str
    ended: str | None = None
    current: bool
    description: str
    display_order: int
    highlights: list[HighlightResponse] = []
    model_config = ConfigDict(from_attributes=True)


class ExperienceCreate(BaseModel):
    slug: str
    role: str
    organization: str
    started: str
    ended: str | None = None
    current: bool = False
    description: str = ""
    display_order: int = 0
    highlights: list[str] = []


class ExperiencePatch(BaseModel):
    role: str | None = None
    organization: str | None = None
    started: str | None = None
    ended: str | None = None
    current: bool | None = None
    description: str | None = None
    display_order: int | None = None


class HighlightCreate(BaseModel):
    text: str
    display_order: int = 0


class HighlightPatch(BaseModel):
    text: str | None = None
    display_order: int | None = None


# ---------------------------------------------------------------------------
# Education
# ---------------------------------------------------------------------------

class EducationResponse(BaseModel):
    id: int
    slug: str
    qualification: str
    institution: str
    started: str | None = None
    ended: str | None = None
    display_order: int
    model_config = ConfigDict(from_attributes=True)


class EducationCreate(BaseModel):
    slug: str
    qualification: str
    institution: str
    started: str | None = None
    ended: str | None = None
    display_order: int = 0


class EducationPatch(BaseModel):
    qualification: str | None = None
    institution: str | None = None
    started: str | None = None
    ended: str | None = None
    display_order: int | None = None


# ---------------------------------------------------------------------------
# Contact
# ---------------------------------------------------------------------------

class ContactLinkResponse(BaseModel):
    id: int
    label: str
    url: str
    display_order: int
    model_config = ConfigDict(from_attributes=True)


class ContactResponse(BaseModel):
    id: int
    phone: str | None = None
    email: str | None = None
    links: list[ContactLinkResponse] = []
    model_config = ConfigDict(from_attributes=True)


class ContactPatch(BaseModel):
    phone: str | None = None
    email: str | None = None


class ContactLinkCreate(BaseModel):
    label: str
    url: str
    display_order: int = 0


class ContactLinkPatch(BaseModel):
    label: str | None = None
    url: str | None = None
    display_order: int | None = None


# ---------------------------------------------------------------------------
# Full resume (read-only composite)
# ---------------------------------------------------------------------------

class ResumeResponse(BaseModel):
    profile: ProfileResponse | None = None
    skills: list[SkillGroupResponse] = []
    experience: list[ExperienceResponse] = []
    education: list[EducationResponse] = []
    contact: ContactResponse | None = None
