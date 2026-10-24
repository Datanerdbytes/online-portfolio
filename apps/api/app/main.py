import re

from fastapi import FastAPI

from app.api.v1 import (
    auth,
    avatar,
    github,
    health,
    portfolio,
    project_screenshot,
    projects,
    public,
    resume,
    resume_import,
)
from app.core.config import settings
from app.core.middleware import MULTIPART_OVERHEAD_BYTES, RequestBodyLimitMiddleware
from app.schemas.root import RootResponse

app = FastAPI(title="Online Resume API", version="0.0.0")

app.include_router(auth.router, prefix="/api/v1")
app.include_router(portfolio.router, prefix="/api/v1")
app.include_router(resume_import.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1/public")
app.include_router(public.router, prefix="/api/v1/public/users/{user_id}")
app.include_router(avatar.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(project_screenshot.router, prefix="/api/v1")
app.include_router(resume.router, prefix="/api/v1")
app.include_router(github.router, prefix="/api/v1")

# Bound JSON parsing across create/update routes before Starlette/FastAPI reads
# the complete body. Multipart uploads have their own, larger route-specific caps.
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=512 * 1024,
    method=("POST", "PUT", "PATCH"),
    path_pattern=re.compile(r"/api/v1/.*"),
    content_type="application/json",
    too_large_detail="Request body too large.",
)

app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=3 * 1024 * 1024 + MULTIPART_OVERHEAD_BYTES,
    method="POST",
    path_pattern=re.compile(r"/api/v1/resume-import/(analyze|read)"),
    too_large_detail="Resume too large. Choose a file no larger than 3 MiB.",
)

app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=512000,
    method="POST",
    path_pattern=re.compile(r"/api/v1/resume-import/(apply|write)"),
    too_large_detail="Selected import changes are too large.",
)

# The portrait upload is bounded before the multipart parser runs, so an
# oversized file never reaches the disk spool of the request handler.
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=settings.MAX_AVATAR_BYTES + MULTIPART_OVERHEAD_BYTES,
    method="PUT",
    path="/api/v1/resume/profile/avatar",
)
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=settings.MAX_AVATAR_BYTES + MULTIPART_OVERHEAD_BYTES,
    method="PUT",
    path_pattern=re.compile(r"/api/v1/projects/[^/]+/screenshot"),
    too_large_detail="Screenshot too large",
)
app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=settings.MAX_AVATAR_BYTES + MULTIPART_OVERHEAD_BYTES,
    method="PUT",
    path="/api/v1/resume/profile/banner",
)


@app.get("/", response_model=RootResponse, include_in_schema=False)
def root():
    """Point callers at the useful entry points instead of a bare 404."""
    return {
        "service": "Online Resume API",
        "version": "0.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
        "web": settings.WEB_APP_URL,
    }
