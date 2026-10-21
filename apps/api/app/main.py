from fastapi import FastAPI

from app.api.v1 import auth, health, projects, resume

app = FastAPI(title="Online Resume API", version="0.0.0")

app.include_router(auth.router, prefix="/api/v1")
app.include_router(health.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(resume.router, prefix="/api/v1")
