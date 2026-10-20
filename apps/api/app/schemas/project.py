from typing import List, Optional

from pydantic import BaseModel, ConfigDict


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
