# Backend API (apps/api)

FastAPI backend for the online resume portfolio. Runs on http://localhost:8000.

## Commands (run from `apps/api`)

| Command | Description |
| --- | --- |
| `uv run uvicorn app.main:app --reload` | Start dev server (http://localhost:8000) |
| `uv run pytest` | Run database-free tests (no PostgreSQL) |
| `uv run pytest --run-integration` | Run integration tests against a disposable PostgreSQL database |
| `TEST_DATABASE_ADMIN_URL=postgresql+psycopg://resume:resume@localhost:5432/postgres uv run pytest --run-integration` | Run integration tests with explicit admin URL |
| `uv run alembic upgrade head` | Apply migrations |
| `uv run alembic downgrade base` | Reverse all migrations |
| `uv run alembic revision --autogenerate -m "message"` | Create a migration |
| `uv run ruff check .` | Lint |
| `uv run ruff format .` | Format |
| `uv run python -m app.scripts.seed_projects --allow-sample-data` | Seed illustrative sample projects (dev only) |

## Environment

`apps/api/.env` (copied from `apps/api/.env.example`, never committed) is loaded from the `apps/api/` working directory by `pydantic-settings`.

| Variable | Description | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg` driver, used by SQLAlchemy and Alembic) | `postgresql+psycopg://resume:resume@localhost:5432/resume` |
| `API_HOST` | Host to bind | `0.0.0.0` |
| `API_PORT` | Port to bind | `8000` |

## API endpoints

All endpoints live under `/api/v1`. OpenAPI documentation is available at `/docs` and `/openapi.json`.

- `GET /api/v1/health` — `{"status": "ok"}`. Process liveness only; never claims PostgreSQL is connected.
- `GET /api/v1/projects` — Returns `{"items": [...]}` of project entries ordered by `display_order` ascending, then `id` ascending. Returns `{"items": []}` when none exist. A database failure returns a controlled HTTP 503 without exposing connection strings or raw exceptions.

## Project model

`app/models/project.py` defines the SQLAlchemy 2 `Project` table:

- `id` — generated primary key.
- `slug` — required, unique, URL-safe identifier (`String(100)`, indexed).
- `title` — required (`String(200)`).
- `summary` — required (`String(1000)`).
- `technologies` — PostgreSQL `text[]` (`ARRAY(String(50))`), an ordered list of strings that round-trips through psycopg as a Python `list[str]`. A native PostgreSQL array was chosen over JSONB (simpler for a list of strings) and over a comma-separated string (not natively ordered or queryable).
- `repository_url` — optional (`String(1024)`, nullable).
- `demo_url` — optional (`String(1024)`, nullable).
- `display_order` — required integer, default 0.
- `is_sample` — required boolean, default false. Flags clearly labeled illustrative placeholder entries.

Migrations are managed with Alembic; `create_all()` is not used on application startup. Model metadata is registered in `migrations/env.py` for autogeneration.

Current migration: `6151be1aade3` (`create_projects_table`).

## Development-only seed

`uv run python -m app.scripts.seed_projects --allow-sample-data`

Creates three clearly labeled illustrative project entries (every title starts with `Sample:`, each has an explicit sample description, and `is_sample=true`). Repository and demo URLs are null. Technology lists describe the illustrative projects, not the owner's verified expertise. No people, employers, achievements, metrics, or completed work are invented.

Safety behavior:
- Requires the explicit `--allow-sample-data` flag; refuses otherwise (exit code 2).
- Never runs during application startup or migrations.
- Repeatable: stable slugs mean re-seeding inserts nothing new.
- Never modifies existing rows; entries with matching slugs are preserved unchanged.
- One transaction: all inserts commit together, or a failure rolls back and leaves no partial seed.
- Prints the target database host/port/name without credentials.

Run against the local development database (PostgreSQL via Compose on localhost:5432) after applying migrations. Do not seed a developer's existing database without separate authorization; use an isolated disposable test database.

## Tests

### Database-free tests (default, no PostgreSQL)

```bash
uv run pytest
```

These tests do not connect to, create, modify, or drop any PostgreSQL database.
They use dependency overrides and test doubles for API behavior, and pure
functions for URL parsing.

### Integration tests (disposable PostgreSQL database)

Integration tests require an explicit opt-in and a dedicated test-server admin
connection. They create a uniquely named disposable database, apply migrations,
run against real PostgreSQL, and drop only the database created by the run.

```bash
# From apps/api, with PostgreSQL running on localhost:5432
TEST_DATABASE_ADMIN_URL=postgresql+psycopg://resume:resume@localhost:5432/postgres \
  uv run pytest --run-integration
```

- ``TEST_DATABASE_ADMIN_URL`` is required; ``DATABASE_URL`` is never used as a fallback.
- A unique database name is generated per run; pre-existing databases are never reused or dropped.
- Only the database created by the current run is dropped at teardown.
- If the account cannot create databases or the configuration is missing/invalid, the run fails with an actionable message.

Do not run integration tests against a developer's existing database without separate authorization.
