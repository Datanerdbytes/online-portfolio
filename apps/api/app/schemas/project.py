from typing import Annotated, List, Optional
from urllib.parse import urlparse

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
MAX_DISPLAY_ORDER = 2147483647
MAX_URL_LENGTH = 1024

ProjectSlug = Annotated[str, Field(min_length=1, max_length=100, pattern=SLUG_PATTERN)]
ProjectTitle = Annotated[str, Field(min_length=1, max_length=200)]
ProjectSummary = Annotated[str, Field(min_length=1, max_length=1000)]
ProjectTechnologies = Annotated[List[str], Field(max_length=20)]
DisplayOrder = Annotated[int, Field(ge=0, le=MAX_DISPLAY_ORDER)]
_http_url = TypeAdapter(AnyHttpUrl)


class ProjectResponse(BaseModel):
    """Serialized project entry returned by GET /api/v1/projects."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    summary: str
    technologies: List[str]
    repository_url: Optional[str]
    demo_url: Optional[str]
    display_order: int
    is_sample: bool


class ProjectsResponse(BaseModel):
    """Top-level shape for GET /api/v1/projects. Always returns an ``items`` list."""

    items: List[ProjectResponse]


class _ProjectMutableFields(BaseModel):
    """Shared validation for the writable project fields.

    Strings are trimmed before length checks; blank results are rejected.
    ``strict=True`` rejects booleans, floats, and numeric strings where an
    integer is required. Unknown fields are always rejected.
    """

    model_config = ConfigDict(strict=True, extra="forbid")

    title: ProjectTitle
    summary: ProjectSummary
    technologies: ProjectTechnologies
    repository_url: Optional[str] = None
    demo_url: Optional[str] = None
    display_order: DisplayOrder = 0

    @field_validator("title", "summary", mode="before")
    @classmethod
    def _trim_required_text(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("technologies", mode="before")
    @classmethod
    def _clean_technologies(cls, value):
        if not isinstance(value, list):
            return value
        cleaned: List[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                return value
            item = item.strip()
            if not item:
                raise ValueError("technology entries must not be blank")
            if len(item) > 50:
                raise ValueError("technology entries must be at most 50 characters")
            if item in seen:
                raise ValueError("duplicate technology")
            seen.add(item)
            cleaned.append(item)
        return cleaned

    @field_validator("repository_url", "demo_url", mode="before")
    @classmethod
    def _clean_url(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("repository_url", "demo_url")
    @classmethod
    def _validate_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not value:
            raise ValueError("URL must not be blank")
        if len(value) > MAX_URL_LENGTH:
            raise ValueError("URL must not exceed 1024 characters")
        parsed = urlparse(value)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or any(character.isspace() or ord(character) < 32 for character in value)
        ):
            raise ValueError("URL must be an absolute HTTP(S) URL with a host")
        # Validate host/port syntax without replacing the owner's supplied URL
        # with the URL parser's normalized representation.
        _http_url.validate_python(value)
        return value


class ProjectCreate(_ProjectMutableFields):
    """Request body for POST /api/v1/projects."""

    slug: ProjectSlug


class ProjectReplace(_ProjectMutableFields):
    """Request body for PUT /api/v1/projects/{slug}; every writable field is required."""

    repository_url: Optional[str]
    demo_url: Optional[str]
    display_order: DisplayOrder


class ProjectPatch(_ProjectMutableFields):
    """Request body for PATCH /api/v1/projects/{slug}; omitted fields are unchanged."""

    # Patches make normally required fields optional to represent omission.
    title: Optional[ProjectTitle] = None  # type: ignore[assignment]
    summary: Optional[ProjectSummary] = None  # type: ignore[assignment]
    technologies: Optional[ProjectTechnologies] = None  # type: ignore[assignment]
    repository_url: Optional[str] = None
    demo_url: Optional[str] = None
    display_order: Optional[DisplayOrder] = None  # type: ignore[assignment]

    @field_validator("title", "summary", "technologies", "display_order", mode="before")
    @classmethod
    def _reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("null is not valid for this field")
        return value

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "ProjectPatch":
        if not self.model_fields_set:
            raise ValueError("at least one field is required")
        return self


class ReorderEntry(BaseModel):
    """One entry of the reorder batch."""

    model_config = ConfigDict(strict=True, extra="forbid")

    slug: ProjectSlug
    display_order: int = Field(ge=0, le=MAX_DISPLAY_ORDER)


class ReorderRequest(BaseModel):
    """Request body for POST /api/v1/projects/reorder."""

    model_config = ConfigDict(strict=True, extra="forbid")

    orders: List[ReorderEntry] = Field(min_length=1, max_length=100)


class ReorderResponse(BaseModel):
    """Response body for POST /api/v1/projects/reorder."""

    updated: int
