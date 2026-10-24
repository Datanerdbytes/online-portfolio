"""GitHub README proxy routes."""

import re
import time
from collections import OrderedDict
from threading import Lock
from urllib.parse import unquote, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.tenant import get_content_db as get_db
from app.models.project import Project

router = APIRouter()

GITHUB_API_URL = "https://api.github.com"
GITHUB_TIMEOUT_SECONDS = 5.0
MAX_README_HTML_BYTES = 1024 * 1024
README_CACHE_SECONDS = 300
README_CACHE_ENTRIES = 128
README_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
_REPOSITORY_PART_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
_readme_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()
_readme_cache_lock = Lock()


def _cached_readme(key: str) -> str | None:
    now = time.monotonic()
    with _readme_cache_lock:
        cached = _readme_cache.get(key)
        if cached is None:
            return None
        expires_at, html = cached
        if expires_at <= now:
            del _readme_cache[key]
            return None
        _readme_cache.move_to_end(key)
        return html


def _store_readme(key: str, html: str) -> None:
    with _readme_cache_lock:
        _readme_cache[key] = (time.monotonic() + README_CACHE_SECONDS, html)
        _readme_cache.move_to_end(key)
        while len(_readme_cache) > README_CACHE_ENTRIES:
            _readme_cache.popitem(last=False)


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
def get_github_readme(
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
    cache_key = f"{github_username.casefold()}/{repository_name.casefold()}"
    cached_html = _cached_readme(cache_key)
    if cached_html is not None:
        return HTMLResponse(
            content=cached_html,
            status_code=200,
            headers={"Cache-Control": README_CACHE_CONTROL},
        )
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_pat}",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    try:
        with httpx.Client(timeout=GITHUB_TIMEOUT_SECONDS, follow_redirects=False) as client:
            repository_response = client.get(repository_url, headers=headers)
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

            with client.stream(
                "GET",
                f"{repository_url}/readme",
                headers={**headers, "Accept": "application/vnd.github.html+json"},
            ) as readme_response:
                if readme_response.status_code == 404:
                    raise HTTPException(
                        status_code=404, detail="README not found for this project."
                    )
                if readme_response.status_code != 200:
                    raise HTTPException(
                        status_code=502,
                        detail="GitHub README could not be retrieved.",
                    )
                content = bytearray()
                for chunk in readme_response.iter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_README_HTML_BYTES:
                        raise HTTPException(
                            status_code=502,
                            detail="GitHub README exceeds the supported size.",
                        )
                html = bytes(content).decode("utf-8")
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

    _store_readme(cache_key, html)
    return HTMLResponse(
        content=html,
        status_code=200,
        headers={"Cache-Control": README_CACHE_CONTROL},
    )
