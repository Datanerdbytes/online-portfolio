from fastapi import FastAPI

from app.api.v1 import auth, health, projects, resume
from app.core.config import settings
from app.schemas.root import RootResponse

app = FastAPI(title="Online Resume API", version="0.0.0")

app.include_router(auth.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(resume.router, prefix="/api/v1")


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
