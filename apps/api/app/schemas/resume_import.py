"""Strict, bounded import proposals; the provider never chooses database IDs."""

from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Section = Literal["profile", "contact", "skills", "experience", "education", "projects", "links"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ProfileValues(StrictModel):
    name: str | None = Field(None, max_length=200)
    headline: str | None = Field(None, max_length=300)
    introduction: str | None = Field(None, max_length=10000)
    about: str | None = Field(None, max_length=10000)
    location: str | None = Field(None, max_length=200)


class ContactValues(StrictModel):
    email: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=50)


class SkillValues(StrictModel):
    label: str | None = Field(None, max_length=200)
    items: list[str] = Field(default_factory=list, max_length=100)


class ExperienceValues(StrictModel):
    role: str | None = Field(None, max_length=200)
    organization: str | None = Field(None, max_length=200)
    started: str | None = Field(None, max_length=20)
    ended: str | None = Field(None, max_length=20)
    current: bool | None = None
    description: str | None = Field(None, max_length=10000)
    highlights: list[str] = Field(default_factory=list, max_length=50)


class EducationValues(StrictModel):
    qualification: str | None = Field(None, max_length=300)
    institution: str | None = Field(None, max_length=300)
    started: str | None = Field(None, max_length=20)
    ended: str | None = Field(None, max_length=20)


class ProjectValues(StrictModel):
    title: str | None = Field(None, max_length=200)
    summary: str | None = Field(None, max_length=1000)
    technologies: list[str] = Field(default_factory=list, max_length=20)
    repository_url: str | None = Field(None, max_length=1024)
    demo_url: str | None = Field(None, max_length=1024)


class LinkValues(StrictModel):
    label: str | None = Field(None, max_length=100)
    url: str | None = Field(None, max_length=1024)


VALUE_MODELS: dict[str, type[BaseModel]] = {
    "profile": ProfileValues,
    "contact": ContactValues,
    "skills": SkillValues,
    "experience": ExperienceValues,
    "education": EducationValues,
    "projects": ProjectValues,
    "links": LinkValues,
}
REQUIRED = {
    "profile": [],
    "contact": [],
    "skills": ["label"],
    "experience": ["role", "organization", "started"],
    "education": ["qualification", "institution"],
    "projects": ["title", "summary"],
    "links": ["label", "url"],
}


class Candidate(StrictModel):
    section: Section
    values: dict[str, Any]
    evidence: dict[
        str,
        Annotated[str, Field(max_length=1000)]
        | Annotated[list[Annotated[str, Field(max_length=1000)]], Field(max_length=100)],
    ]
    generated: list[Literal["headline", "introduction"]] = Field(default_factory=list, max_length=2)
    warnings: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def omit_absent_evidence(cls, data):
        # Providers often emit null for missing fields. Null is absence, never
        # evidence: remove it, then require a real quote for every extracted value.
        if not isinstance(data, dict):
            return data
        normalized = dict(data)
        if isinstance(data.get("evidence"), dict):
            normalized["evidence"] = {
                k: v for k, v in data["evidence"].items() if v is not None and v != "" and v != []
            }
        if isinstance(data.get("values"), dict):
            normalized["values"] = {
                k: v
                for k, v in data["values"].items()
                if not (v is None and k in {"items", "highlights", "technologies"})
            }
        if isinstance(data.get("generated"), list) and isinstance(data.get("values"), dict):
            normalized["generated"] = [
                key
                for key in data["generated"]
                if not (
                    isinstance(key, str)
                    and key in {"headline", "introduction"}
                    and not data["values"].get(key)
                )
            ]
        return normalized

    @model_validator(mode="after")
    def validate_values(self):
        parsed = VALUE_MODELS[self.section].model_validate(self.values)
        self.values = parsed.model_dump(exclude_unset=True, exclude_none=True)
        if any(len(v) > 1000 for v in self.evidence.values()):
            raise ValueError("Evidence too long")
        if set(self.evidence) - set(self.values):
            raise ValueError("Unexpected evidence field")
        if self.generated and (
            self.section != "profile" or set(self.generated) - {"headline", "introduction"}
        ):
            raise ValueError("Only headline and introduction may be generated")
        if set(self.generated) - set(self.values):
            raise ValueError("Missing suggestion")
        return self


class Extraction(StrictModel):
    candidates: list[Candidate] = Field(max_length=100)
    not_imported: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def unique_singletons(self):
        for section in ("profile", "contact"):
            if sum(c.section == section for c in self.candidates) > 1:
                raise ValueError("Only one profile/contact proposal is allowed")
        if any(len(note) > 2000 for note in self.not_imported):
            raise ValueError("Unsupported notes too long")
        return self


class Change(StrictModel):
    section: Section
    target_id: int | None = Field(None, gt=0)
    values: dict[str, Any]

    @model_validator(mode="after")
    def validate_values(self):
        parsed = VALUE_MODELS[self.section].model_validate(self.values)
        self.values = parsed.model_dump(exclude_unset=True, exclude_none=True)
        if not self.values:
            raise ValueError("Select a change")
        return self


class ApplyImport(StrictModel):
    expected_owner_id: str = Field(min_length=1, max_length=128)
    revision: int = Field(ge=0)
    idempotency_key: str = Field(min_length=36, max_length=36)
    changes: list[Change] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_key(self):
        UUID(self.idempotency_key)
        return self


WRITING_FIELDS = {
    ("profile", "headline"): 300,
    ("profile", "introduction"): 2000,
    ("profile", "about"): 3000,
    ("experience", "description"): 2000,
    ("projects", "summary"): 1000,
}


class WritingRequest(StrictModel):
    consent: bool
    expected_owner_id: str = Field(min_length=1, max_length=128)
    section: Section
    field: str = Field(min_length=1, max_length=30)
    facts: str = Field(min_length=1, max_length=32000)
    current_text: str = Field(default="", max_length=10000)
    guidance: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def writable_field(self):
        if not self.consent:
            raise ValueError("Consent is required before AI writing")
        if (self.section, self.field) not in WRITING_FIELDS:
            raise ValueError("AI writing is only available for narrative fields")
        return self
