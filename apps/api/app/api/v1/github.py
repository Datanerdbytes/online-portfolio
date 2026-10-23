"""GitHub README proxy routes."""

import re
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.project import Project

router = APIRouter()

GITHUB_API_URL = "https://api.github.com"
GITHUB_TIMEOUT_SECONDS = 5.0
_REPOSITORY_PART_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


def _github_repository_name(repository_url: str | None, github_username: str) -> str | None:
    if not repository_url:
        return None

    parsed = urlparse(repository_url)
    parts = [unquote(part) for part in parsed.path.split("/") if part]
    if (
        parsed.scheme != "https"
        or parsed.netloc.lower() != "github.com"
        or parsed.query
        or parsed.fragment
        or len(parts) != 2
        or any(part in {".", ".."} for part in parts)
        or parts[0].casefold() != github_username.casefold()
        or not all(_REPOSITORY_PART_PATTERN.fullmatch(part) for part in parts)
    ):
        return None

    repository_name = parts[1]
    if repository_name.endswith(".git"):
        repository_name = repository_name[:-4]
    return repository_name or None


@router.get(
    "/github/projects/{project_slug}/readme",
    response_class=HTMLResponse,
    summary="Get a project's rendered GitHub README",
)
async def get_github_readme(
    project_slug: str,
    db: Session = Depends(get_db),  # noqa: B008  # FastAPI idiom
):
    """Return GitHub-rendered HTML only for a configured public portfolio project."""
    try:
        project = db.query(Project).filter(Project.slug == project_slug).first()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503, detail="Projects service temporarily unavailable."
        ) from None

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    github_username = (settings.GITHUB_USERNAME or "").strip()
    if not github_username or not _REPOSITORY_PART_PATTERN.fullmatch(github_username):
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: GITHUB_USERNAME must be a GitHub username.",
        )

    repository_name = _github_repository_name(project.repository_url, github_username)
    if repository_name is None:
        raise HTTPException(status_code=404, detail="README is not available for this project.")

    github_pat = (settings.GITHUB_PAT or "").strip()
    if not github_pat:
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: GITHUB_PAT environment variable is missing.",
        )

    repository_url = f"{GITHUB_API_URL}/repos/{github_username}/{repository_name}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_pat}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        async with httpx.AsyncClient(timeout=GITHUB_TIMEOUT_SECONDS) as client:
            repository_response = await client.get(repository_url, headers=headers)
            if repository_response.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail="README is not available for this project.",
                )
            if repository_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="GitHub repository could not be verified.",
                )

            repository = repository_response.json()
            if not isinstance(repository, dict) or repository.get("private") is not False:
                raise HTTPException(
                    status_code=404,
                    detail="README is not available for this project.",
                )

            readme_response = await client.get(
                f"{repository_url}/readme",
                headers={
                    **headers,
                    "Accept": "application/vnd.github.html+json",
                },
            )
            if readme_response.status_code == 404:
                raise HTTPException(status_code=404, detail="README not found for this project.")
            if readme_response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="GitHub README could not be retrieved.",
                )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=503, detail="GitHub documentation service timed out."
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="GitHub documentation service is temporarily unavailable.",
        ) from None
    except ValueError:
        raise HTTPException(
            status_code=502, detail="GitHub returned an invalid repository response."
        ) from None

    return HTMLResponse(content=readme_response.text, status_code=200)
