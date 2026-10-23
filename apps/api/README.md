# Backend API (apps/api)

FastAPI backend for the online resume portfolio. Runs on http://localhost:8000.

## Commands (run from `apps/api`)

| Command                                                                                                              | Description                                                    |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `uv run uvicorn app.main:app --reload`                                                                               | Start dev server (http://localhost:8000)                       |
| `uv run pytest`                                                                                                      | Run database-free tests (no PostgreSQL)                        |
| `uv run pytest --run-integration`                                                                                    | Run integration tests against a disposable PostgreSQL database |
| `TEST_DATABASE_ADMIN_URL=postgresql+psycopg://resume:resume@localhost:5432/postgres uv run pytest --run-integration` | Run integration tests with explicit admin URL                  |
| `uv run alembic upgrade head`                                                                                        | Apply migrations                                               |
| `uv run alembic downgrade base`                                                                                      | Reverse all migrations                                         |
| `uv run alembic revision --autogenerate -m "message"`                                                                | Create a migration                                             |
| `uv run ruff check .`                                                                                                | Lint                                                           |
| `uv run ruff format .`                                                                                               | Format                                                         |
| `uv run python -m app.scripts.seed_projects --allow-sample-data`                                                     | Seed illustrative sample projects (dev only)                   |

## Environment

`apps/api/.env` (copied from `apps/api/.env.example`, never committed) is loaded from the `apps/api/` working directory by `pydantic-settings`.

| Variable          | Description                                                                                | Default                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string (`postgresql+psycopg` driver, used by SQLAlchemy and Alembic) | `postgresql+psycopg://resume:resume@localhost:5432/resume` |
| `API_HOST`        | Host to bind                                                                               | `0.0.0.0`                                                  |
| `API_PORT`        | Port to bind                                                                               | `8000`                                                     |
| `GITHUB_USERNAME` | GitHub account that owns repositories linked by published projects                         | unset                                                      |
| `GITHUB_PAT`      | Server-side token used for GitHub API requests; no public-repository scope is needed       | unset                                                      |

## API endpoints

All endpoints live under `/api/v1`. OpenAPI documentation is available at `/docs` and `/openapi.json`.

- `GET /api/v1/health` — `{"status": "ok"}`. Process liveness only; never claims PostgreSQL is connected.
- `GET /api/v1/projects` — Returns `{"items": [...]}` of project entries ordered by `display_order` ascending, then `id` ascending. Returns `{"items": []}` when none exist. A database failure returns a controlled HTTP 503 without exposing connection strings or raw exceptions. Public: no authentication required.
- `GET /api/v1/projects/{slug}` — Returns one published project, including its summary, repository URL, and technology tags. Missing projects return 404. Public: no authentication required.
- `GET /api/v1/github/projects/{slug}/readme` — Returns GitHub-rendered README HTML for a published project whose repository URL belongs to `GITHUB_USERNAME`. The repository must also be public according to GitHub; private repositories and projects without an eligible GitHub URL return 404. Requires `GITHUB_USERNAME` and `GITHUB_PAT`; the token is never sent to the browser.
- `GET /api/v1/resume/profile/avatar` and `GET /api/v1/resume/profile/banner` — Public image reads for the independent sidebar profile photo and square hero banner. Both return the image bytes with an ETag; absent images return 404.
- `PUT` and `DELETE` on those image paths — Owner-only uploads and removals. Uploads accept JPEG, PNG, or WebP up to `MAX_AVATAR_BYTES` (2 MiB by default). Image files are stored beneath `MEDIA_ROOT`; the database stores only generated filenames and image metadata.
- `GET /api/v1/projects/{slug}/screenshot` — Public read of the project's optional screenshot, returned with an ETag. Missing projects or screenshots return 404.
- `PUT` and `DELETE /api/v1/projects/{slug}/screenshot` — Owner-only upload, replacement, or removal. Uploads accept JPEG, PNG, or WebP up to `MAX_AVATAR_BYTES` (2 MiB by default), reuse the validated profile-image storage, and persist only generated filenames and image metadata. Uploaded screenshots are shown as small thumbnails beside project technology tags.

## Protected project management (owner only)

All mutation routes require a valid FastAPI bearer token issued by `POST /api/v1/auth/login`. Every mutation independently verifies the bearer token and owner; cookies, supplied owner headers, and frontend checks are never used for authorization. Missing/invalid/expired tokens return 401 (`WWW-Authenticate: Bearer`); tokens for a different owner return 403. When administration is unconfigured, mutations return 503.

- `POST /api/v1/projects` — Create a project. Requires `slug`, `title`, `summary`, `technologies`; `repository_url`/`demo_url` default null; `display_order` defaults 0. Returns 201 with the full `ProjectResponse` including generated `id` and `is_sample:false`. `is_sample` is always false on creation and read-only thereafter. Duplicate slug (including unique-constraint races) returns a sanitized 409 after rollback.
- `PUT /api/v1/projects/{slug}` — Full replacement of all writable fields. Every writable field is required; omitted fields fail validation. `slug`, `id`, `is_sample`, and unknown fields are rejected. `slug` is immutable; `is_sample` is preserved. Missing target returns 404. Returns 200 with the full `ProjectResponse`.
- `PATCH /api/v1/projects/{slug}` — Partial update. Omitted fields are unchanged; null clears only the two URL fields. Null is invalid for `title`, `summary`, `technologies`, and `display_order`. An empty body is rejected. `is_sample` is preserved. Missing target returns 404. Returns 200 with the full `ProjectResponse`.
- `DELETE /api/v1/projects/{slug}` — Deletes a project. Returns an empty 204 on success; missing target returns 404.
- `POST /api/v1/projects/reorder` — Atomic partial batch reorder. Body `{"orders": [{"slug": "...", "display_order": N}, ...]}` (1–100 entries, unique slugs within the batch). Validates and writes in a single transaction with target rows locked; any invalid entry, duplicate slug, or missing target rejects the whole batch with no partial writes (400/404). Returns 200 `{"updated": N}`.

Validation: `slug` must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` (1–100 chars, not trimmed). `title` 1–200, `summary` 1–1000 (trimmed). `technologies` 0–20 items, each 1–50 chars (trimmed, deduplicated after trim, order preserved). URLs null or absolute HTTP(S) with a host, max 1024 chars; blank URLs rejected. `display_order` is a strict integer 0–2147483647; booleans, floats, and numeric strings are rejected. Unknown request fields are rejected. All error responses use `{"detail": "..."}` and never echo credentials, tokens, or request bodies.

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
- `screenshot_filename`, `screenshot_content_type`, `screenshot_updated_at` — nullable screenshot storage metadata. Files live beneath `MEDIA_ROOT`; `ProjectResponse.screenshot_url` is non-null only when a screenshot has been uploaded.

Migrations are managed with Alembic; `create_all()` is not used on application startup. Model metadata is registered in `migrations/env.py` for autogeneration.

Current migration adds the optional screenshot metadata after the project-table migration.

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

- `tests/test_projects_crud.py` — database-free project CRUD tests: bearer-token
  auth enforcement, validation, null/omitted semantics, sample-marker
  preservation, duplicate-create race (sanitized 409 after rollback), and
  atomic-reorder rollback behavior.
- `tests/test_github_readme.py` — database-free tests for published-project
  allowlisting, public-repository verification, rendered HTML, and sanitized
  GitHub failure handling.
- `tests/test_projects_integration.py` — opt-in PostgreSQL tests for create
  persistence, duplicate slug (409), and atomic reorder (no partial writes).

### Integration tests (disposable PostgreSQL database)

Integration tests require an explicit opt-in and a dedicated test-server admin
connection. They create a uniquely named disposable database, apply migrations,
run against real PostgreSQL, and drop only the database created by the run.

```bash
# From apps/api, with PostgreSQL running on localhost:5432
TEST_DATABASE_ADMIN_URL=postgresql+psycopg://resume:resume@localhost:5432/postgres \
  uv run pytest --run-integration
```

- `TEST_DATABASE_ADMIN_URL` is required; `DATABASE_URL` is never used as a fallback.
- A unique database name is generated per run; pre-existing databases are never reused or dropped.
- Only the database created by the current run is dropped at teardown.
- If the account cannot create databases or the configuration is missing/invalid, the run fails with an actionable message.

Do not run integration tests against a developer's existing database without separate authorization.

## Owner authentication (A0)

Public health and project listing do not require admin configuration. To enable
administration, provision all four settings in `apps/api/.env`: `OWNER_ID` (stable
subject), `OWNER_USERNAME`, `OWNER_PASSWORD_HASH` (Argon2id), and
`API_ACCESS_SECRET` (at least 32 random bytes). Never commit the real values.
Generate the key locally with `uv run python -c "import secrets; print(secrets.token_urlsafe(32))"`.
Generate the hash without putting the password in shell history:

```bash
# From apps/api/; enter the password only at the hidden prompt.
uv run python -c 'from getpass import getpass; from argon2 import PasswordHasher; print(PasswordHasher().hash(getpass("Owner password: ")))'
```

`POST /api/v1/auth/login` accepts JSON username/password and issues a backend-only
HS256 bearer credential. `GET /api/v1/auth/me` verifies it independently. Tokens
expire at their original 900-second deadline; reads never renew them. No backend
logout/refresh route exists. The Next.js logout route deletes its browser cookie;
a copied bearer token remains valid until expiry. Rotating `API_ACCESS_SECRET`
invalidates all outstanding tokens immediately.

Login permits five attempts per fixed 300-second monotonic-clock window, including
failed logins and unknown usernames. The concurrency-safe bucket is process-local:
use **one worker/replica** until a shared limiter is implemented. Restart resets
the bucket. Invalid/missing configuration gives admin endpoints a generic 503;
public startup and liveness remain independent.

`uv run pytest` covers auth without PostgreSQL, including malformed configuration,
strict claims, absolute expiry/key rotation, rate limits and credential-free
validation errors. PostgreSQL integration tests still require their existing
explicit opt-in; A0 introduces no migration or database writes.
