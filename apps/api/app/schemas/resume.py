"""Pydantic schemas for resume content endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

MAX_DISPLAY_ORDER = 2_147_483_647
MAX_SKILL_GROUPS = 30
MAX_SKILL_ITEMS_PER_GROUP = 30
MAX_EXPERIENCE_ENTRIES = 50
MAX_HIGHLIGHTS_PER_EXPERIENCE = 20
MAX_EDUCATION_ENTRIES = 50
MAX_CONTACT_LINKS = 30

DisplayOrder = Annotated[int, Field(ge=0, le=MAX_DISPLAY_ORDER)]
ProfileName = Annotated[str, Field(max_length=200)]
Headline = Annotated[str, Field(max_length=300)]
ProfileText = Annotated[str, Field(max_length=6000)]
Location = Annotated[str, Field(max_length=200)]
SkillText = Annotated[str, Field(min_length=1, max_length=200)]
EntrySlug = Annotated[
    str,
    Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
]
EntryTitle = Annotated[str, Field(min_length=1, max_length=200)]
EducationTitle = Annotated[str, Field(min_length=1, max_length=300)]
DateText = Annotated[str, Field(max_length=20)]
Description = Annotated[str, Field(max_length=4000)]
HighlightText = Annotated[str, Field(min_length=1, max_length=500)]
ContactEmail = Annotated[str, Field(max_length=200)]
ContactPhone = Annotated[str, Field(max_length=50)]
LinkLabel = Annotated[str, Field(min_length=1, max_length=100)]
LinkUrl = Annotated[str, Field(min_length=1, max_length=1024)]

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
    name: ProfileName | None = None
    headline: Headline | None = None
    introduction: ProfileText | None = None
    about: ProfileText | None = None
    location: Location | None = None


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
    label: Annotated[str, Field(min_length=1, max_length=200)]
    display_order: DisplayOrder = 0
    items: list[SkillText] = Field(default_factory=list, max_length=MAX_SKILL_ITEMS_PER_GROUP)


class SkillGroupPatch(BaseModel):
    label: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    display_order: DisplayOrder | None = None


class SkillItemCreate(BaseModel):
    item: SkillText
    display_order: DisplayOrder = 0


class SkillItemPatch(BaseModel):
    item: SkillText | None = None
    display_order: DisplayOrder | None = None


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
    slug: EntrySlug
    role: EntryTitle
    organization: EntryTitle
    started: DateText
    ended: DateText | None = None
    current: bool = False
    description: Description = ""
    display_order: DisplayOrder = 0
    highlights: list[HighlightText] = Field(
        default_factory=list, max_length=MAX_HIGHLIGHTS_PER_EXPERIENCE
    )


class ExperiencePatch(BaseModel):
    role: EntryTitle | None = None
    organization: EntryTitle | None = None
    started: DateText | None = None
    ended: DateText | None = None
    current: bool | None = None
    description: Description | None = None
    display_order: DisplayOrder | None = None


class HighlightCreate(BaseModel):
    text: HighlightText
    display_order: DisplayOrder = 0


class HighlightPatch(BaseModel):
    text: HighlightText | None = None
    display_order: DisplayOrder | None = None


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
    slug: EntrySlug
    qualification: EducationTitle
    institution: EducationTitle
    started: DateText | None = None
    ended: DateText | None = None
    display_order: DisplayOrder = 0


class EducationPatch(BaseModel):
    qualification: EducationTitle | None = None
    institution: EducationTitle | None = None
    started: DateText | None = None
    ended: DateText | None = None
    display_order: DisplayOrder | None = None


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
    phone: ContactPhone | None = None
    email: ContactEmail | None = None


class ContactLinkCreate(BaseModel):
    label: LinkLabel
    url: LinkUrl
    display_order: DisplayOrder = 0


class ContactLinkPatch(BaseModel):
    label: LinkLabel | None = None
    url: LinkUrl | None = None
    display_order: DisplayOrder | None = None


# ---------------------------------------------------------------------------
# Full resume (read-only composite)
# ---------------------------------------------------------------------------


class ResumeResponse(BaseModel):
    profile: ProfileResponse | None = None
    skills: list[SkillGroupResponse] = []
    experience: list[ExperienceResponse] = []
    education: list[EducationResponse] = []
    contact: ContactResponse | None = None


class SkillsResponse(BaseModel):
    items: list[SkillGroupResponse]


class ExperienceListResponse(BaseModel):
    items: list[ExperienceResponse]


class EducationListResponse(BaseModel):
    items: list[EducationResponse]
