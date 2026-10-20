from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.project import Project
from app.schemas.project import ProjectsResponse

router = APIRouter()


@router.get(
    "/projects",
    response_model=ProjectsResponse,
    summary="List projects",
    description=(
        "Return illustrative project entries ordered by display_order ascending, "
        "then id ascending for deterministic ties. Returns an empty items list "
        "when no projects exist."
    ),
)
def list_projects(db: Session = Depends(get_db)):  # noqa: B008  # FastAPI idiom
    try:
        items = db.query(Project).order_by(Project.display_order.asc(), Project.id.asc()).all()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Projects service temporarily unavailable.",
        ) from None
    return {"items": items}
