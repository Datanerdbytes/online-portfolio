"""Development-only seed for clearly labeled illustrative sample projects.

Usage (from apps/api):

    uv run python -m app.scripts.seed_projects --allow-sample-data

Safety behavior:
- Requires the explicit ``--allow-sample-data`` flag; refuses otherwise.
- Never runs during application startup or migrations.
- Repeatable: stable slugs mean re-seeding inserts nothing new.
- Never modifies existing rows; entries with matching slugs are preserved.
- One transaction: a failure rolls back everything, so no partial seed remains.
- Prints the target database host/port/name without credentials.
"""

from __future__ import annotations

import argparse
import sys
from typing import Optional, Tuple

from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.project import Project

SAMPLE_PROJECTS: list[dict] = [
    {
        "slug": "sample-task-board",
        "title": "Sample: Task Board",
        "summary": "Illustrative project entry for development; not a completed portfolio project.",
        "technologies": ["Next.js", "FastAPI", "PostgreSQL"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 10,
        "is_sample": True,
    },
    {
        "slug": "sample-api-gateway",
        "title": "Sample: API Gateway",
        "summary": "Illustrative project entry for development; not a completed portfolio project.",
        "technologies": ["FastAPI", "PostgreSQL", "Docker"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 20,
        "is_sample": True,
    },
    {
        "slug": "sample-portfolio-frontend",
        "title": "Sample: Portfolio Frontend",
        "summary": "Illustrative project entry for development; not a completed portfolio project.",
        "technologies": ["Next.js", "Tailwind CSS", "shadcn/ui"],
        "repository_url": None,
        "demo_url": None,
        "display_order": 30,
        "is_sample": True,
    },
]


def _display_target(database_url) -> str:
    """Return hostname, optional port, and database name without credentials.

    Uses SQLAlchemy's structured URL parsing so username, password, query
    parameters, and the full connection URL are never displayed.
    """
    parsed = make_url(database_url)
    if parsed.drivername not in ("postgresql", "postgresql+psycopg"):
        raise ValueError(f"Unsupported database driver: {parsed.drivername!r}")

    host = parsed.host or ""
    port = f":{parsed.port}" if parsed.port else ""
    database = f"/{parsed.database}" if parsed.database else ""
    return f"{host}{port}{database}"


def seed_projects(session: Session, allow_sample_data: bool = False) -> Tuple[int, int]:
    """Insert missing sample projects within the caller's transaction.

    Returns ``(inserted, skipped)``. Existing rows matching a stable slug are
    left untouched. Raises ``ValueError`` unless ``allow_sample_data`` is true.

    All inserts are flushed but not committed here: the caller owns the single
    transaction boundary (commit persists all or nothing; rollback on failure
    leaves no partial seed).
    """
    if not allow_sample_data:
        raise ValueError("Refusing to seed sample data: pass --allow-sample-data to opt in.")

    inserted = 0
    skipped = 0
    for data in SAMPLE_PROJECTS:
        existing = session.query(Project).filter_by(slug=data["slug"]).first()
        if existing is not None:
            skipped += 1
            continue
        session.add(Project(**data))
        inserted += 1

    session.flush()
    return inserted, skipped


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Seed clearly labeled illustrative sample projects (development only)."
    )
    parser.add_argument(
        "--allow-sample-data",
        action="store_true",
        help="Opt in to seeding sample project data.",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.allow_sample_data:
        print(
            "Error: --allow-sample-data is required to seed sample project data.",
            file=sys.stderr,
        )
        return 2

    session = SessionLocal()
    try:
        inserted, skipped = seed_projects(session, allow_sample_data=True)
        session.commit()  # one transaction: all or nothing
        print(
            f"Seeded {inserted} sample project(s); {skipped} existing slug(s) preserved unchanged."
        )
        print(f"Target database: {_display_target(settings.DATABASE_URL)}")
    except Exception:  # noqa: BLE001 - surface a controlled CLI failure without secrets
        session.rollback()
        print(
            "Error: seed failed without partial changes. Check the database "
            "configuration and try again.",
            file=sys.stderr,
        )
        return 1
    finally:
        session.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
