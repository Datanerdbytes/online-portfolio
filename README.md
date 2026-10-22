# Online Resume / Portfolio

A production-style full-stack online resume and portfolio demonstrating frontend and backend engineering.

## Stack

| Area             | Technology                                                 |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui |
| Backend          | FastAPI, Python 3.12+, SQLAlchemy 2, Alembic               |
| Database         | PostgreSQL 16 (Docker Compose)                             |
| Package Managers | npm (frontend), uv (backend)                               |

## Repository Structure

```
online-resume/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # FastAPI backend
├── compose.yaml      # Docker Compose for PostgreSQL
├── package.json      # Root workspace configuration
└── README.md
```

## Prerequisites

- Node.js >= 20
- Python >= 3.12
- uv (Python package manager): `pip install uv`
- Docker & Docker Compose (for PostgreSQL)

## Quick Start

All command groups below start from the repository root (`online-resume/`). Commands that must run inside `apps/api` use a subshell `(cd apps/api && ...)` so your shell returns to the root afterward; terminal-specific instructions state the directory explicitly.

### 1. Install dependencies

**Starting directory:** repository root

```bash
# Frontend (root workspace)
npm install

# Backend (subshell; shell returns to root when done)
(cd apps/api && uv sync)
```

### 2. Start PostgreSQL

**Starting directory:** repository root (`compose.yaml` lives here)

```bash
docker compose up -d
```

Verify it is healthy:

```bash
docker compose ps
```

### 3. Configure environment

**Starting directory:** repository root

Copy the example files and adjust as needed. Do not commit `.env` or `.env.local`.

```bash
# Backend (settings load .env from the apps/api/ working directory)
cp apps/api/.env.example apps/api/.env

# Frontend (Next.js loads .env.local in development; server-side only)
cp apps/web/.env.example apps/web/.env.local
```

The defaults run a public-only site. To enable the project administration interface, provision the four owner values in `apps/api/.env` and set `ADMIN_WEB_ORIGIN` in `apps/web/.env.local` — see [Administration](#administration).

### 4. Run database migrations

**Starting directory:** repository root (the subshell runs Alembic from `apps/api`, then returns to root)

```bash
(cd apps/api && uv run alembic upgrade head)
```

Migrations require PostgreSQL to be running (step 2). Alembic connects using `DATABASE_URL` from `apps/api/.env`.

### 5. Start development servers

Use two terminals. Each command group states its starting directory.

**Terminal 1 — Backend** (runs on http://localhost:8000)

**Starting directory:** repository root

```bash
cd apps/api
uv run uvicorn app.main:app --reload
```

**Terminal 2 — Frontend** (runs on http://localhost:3000)

**Starting directory:** repository root

```bash
npm run dev:web
```

### 6. Verify the health endpoint

Backend liveness:

```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok"}
```

Frontend health proxy (honestly reports unavailable when the backend is stopped):

```bash
curl http://localhost:3000/api/health
```

`GET /api/v1/health` is a process-liveness check only. It never claims that PostgreSQL is connected. Database connectivity is established separately by running PostgreSQL via Compose (step 2) and applying migrations (step 4). If database readiness is ever added, it belongs on a separate endpoint such as `GET /api/v1/ready`, never on `/api/v1/health`.

### 7. Seed the resume content

**Starting directory:** repository root (the subshell runs the script from `apps/api`)

```bash
(cd apps/api && uv run python -m app.scripts.seed_resume)
```

The script inserts the resume content that is missing and is safe to run repeatedly. It also synchronizes the skill list: canonical skills from the resume PDF are created or restored, renamed entries are normalized, and duplicate skills inside a group are removed. Rows added through the administration interface are preserved.

Refresh the frontend fallback copy after seeding (the API must be running):

```bash
(cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npm run sync:resume-content)
```

## Available Commands

### Frontend (apps/web)

Root workspace scripts run from the repository root; equivalently run `npm run <command>` from `apps/web`.

| Command                             | Description                                      | Directory  |
| ----------------------------------- | ------------------------------------------------ | ---------- |
| `npm run dev:web`                   | Start development server (http://localhost:3000) | Root       |
| `npm run build:web`                 | Production build                                 | Root       |
| `npm run start`                     | Start production server                          | `apps/web` |
| `npm run lint:web`                  | Run ESLint                                       | Root       |
| `npm run typecheck:web`             | Run TypeScript compiler check                    | Root       |
| `npm run test`                      | Run the frontend test suite                      | `apps/web` |
| `npm run sync:resume-content`       | Regenerate the fallback copy from the API        | `apps/web` |
| `npm run sync:resume-content:check` | Fail when the fallback copy is stale             | `apps/web` |

### Backend (apps/api)

All backend commands run from `apps/api` so that `app.core.config` loads `apps/api/.env`.

| Command                                               | Description                                      |
| ----------------------------------------------------- | ------------------------------------------------ |
| `uv run uvicorn app.main:app --reload`                | Start development server (http://localhost:8000) |
| `uv run pytest`                                       | Run tests                                        |
| `uv run alembic upgrade head`                         | Apply migrations                                 |
| `uv run alembic revision --autogenerate -m "message"` | Create migration                                 |
| `uv run ruff check .`                                 | Lint                                             |
| `uv run ruff format .`                                | Format                                           |
| `uv run python -m app.scripts.seed_resume`            | Seed or synchronize resume content               |

### Root

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `npm install`           | Install frontend dependencies  |
| `npm run dev:web`       | Start frontend dev server      |
| `npm run build:web`     | Build frontend                 |
| `npm run lint:web`      | Lint frontend                  |
| `npm run typecheck:web` | Type-check frontend            |
| `npm run format`        | Format all files with Prettier |
| `npm run format:check`  | Check formatting with Prettier |

## Resume Content and Fallback

The `/resume` page and the homepage read their content from the API, which serves the rows stored in PostgreSQL.

```
PostgreSQL → GET /api/v1/resume, GET /api/v1/projects → frontend
```

When the API is unavailable the frontend falls back to `apps/web/src/content/resume.ts`, a repository copy of the same content, and says so on the page. The fallback file is generated, not edited by hand:

| File                                       | Role                                                      |
| ------------------------------------------ | --------------------------------------------------------- |
| `apps/web/src/content/resume-types.ts`     | Hand-written types shared by the API and fallback shapes  |
| `apps/web/src/content/resume.ts`           | Generated fallback content (skills, experience, projects) |
| `apps/web/scripts/sync-resume-content.mjs` | Reads the API and rewrites the fallback file              |

Regenerate it after seeding or editing content, and use the check mode in CI to catch drift:

```bash
(cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npm run sync:resume-content)
(cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npm run sync:resume-content:check)
```

## Administration

Project administration is optional. Without owner configuration the site stays public-only and the administration routes are disabled.

### Backend owner configuration (apps/api/.env)

All four values must be provisioned together. A partial configuration fails closed: administration is disabled while public browsing keeps working.

| Variable              | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `API_ACCESS_SECRET`   | HMAC signing secret for owner access tokens; at least 32 bytes of random data |
| `OWNER_ID`            | Stable identifier shown in the administration interface                       |
| `OWNER_USERNAME`      | Login name for the owner account                                              |
| `OWNER_PASSWORD_HASH` | Argon2id hash of the owner password; the plaintext password is never stored   |

Generate the password hash out of band and keep the plaintext out of every environment file:

```bash
cd apps/api
uv run python -c "from argon2 import PasswordHasher; print(PasswordHasher().hash('change-me'))"
```

### Frontend configuration (apps/web/.env.local)

`ADMIN_WEB_ORIGIN` must match the scheme, host, and port of the public site exactly — no trailing slash and no path. It is read on the server only and is never exposed through a `NEXT_PUBLIC_` variable.

- Development: a plain-HTTP origin such as `http://localhost:3000` is accepted.
- Production: the origin must use HTTPS. A plain-HTTP origin is rejected, because the session cookie is issued as `__Host-portfolio-admin` with the `Secure` attribute and could not be set over HTTP.

A missing or invalid origin disables the administration routes (`Administration unavailable`) while public browsing keeps working.

### Signing in

1. Open `/auth/signin` and enter the owner username and password.
2. The Next.js server route forwards the credentials to `POST /api/v1/auth/login`, the backend verifies them against `OWNER_PASSWORD_HASH`, and the returned token is stored in an HttpOnly, `SameSite=Lax` cookie. The browser never receives the token.
3. Every mutation is re-authorized by the backend against that token, and the frontend proxies reject requests that do not come from the exact configured origin.
4. Sessions last 15 minutes and are not extended by activity, so sign in again after expiry.

The login limiter is process-local: 5 attempts per 300 seconds per process, counting successful and failed attempts. Run a single backend worker or replica, otherwise the effective limit scales with the number of workers.

## API Endpoints

### Backend (apps/api)

| Method   | Path                       | Access       | Description                                                                    |
| -------- | -------------------------- | ------------ | ------------------------------------------------------------------------------ |
| `GET`    | `/api/v1/health`           | Public       | Health check (`{"status": "ok"}`); process liveness only, not a database check |
| `GET`    | `/api/v1/projects`         | Public       | Project list for the landing page                                              |
| `POST`   | `/api/v1/auth/login`       | Public       | Verify owner credentials and issue a short-lived access token                  |
| `GET`    | `/api/v1/auth/me`          | Bearer token | Return the verified owner identity and token expiry                            |
| `POST`   | `/api/v1/projects`         | Bearer token | Create a project (`is_sample` is always `false`)                               |
| `PUT`    | `/api/v1/projects/{slug}`  | Bearer token | Replace the mutable fields of a project                                        |
| `PATCH`  | `/api/v1/projects/{slug}`  | Bearer token | Partially update a project; `is_sample` is preserved                           |
| `DELETE` | `/api/v1/projects/{slug}`  | Bearer token | Delete a project                                                               |
| `POST`   | `/api/v1/projects/reorder` | Bearer token | Atomically update `display_order` for a batch of slugs; no partial writes      |

OpenAPI documentation is served at `/docs`, with the raw schema at `/openapi.json`.

### Frontend (apps/web)

| Method   | Path                    | Description                                         |
| -------- | ----------------------- | --------------------------------------------------- |
| `GET`    | `/api/health`           | Backend liveness proxy                              |
| `GET`    | `/api/projects`         | Public project list                                 |
| `POST`   | `/api/projects`         | Authenticated create proxy                          |
| `PUT`    | `/api/projects/[slug]`  | Authenticated replace proxy                         |
| `PATCH`  | `/api/projects/[slug]`  | Authenticated partial-update proxy                  |
| `DELETE` | `/api/projects/[slug]`  | Authenticated delete proxy                          |
| `POST`   | `/api/projects/reorder` | Authenticated reorder proxy                         |
| `POST`   | `/api/auth/login`       | Credential proxy that sets the session cookie       |
| `POST`   | `/api/auth/logout`      | Clears the session cookie                           |
| `GET`    | `/api/auth/me`          | Identity check used by the administration interface |
| `POST`   | `/api/auth/check`       | Session status check                                |

Mutation proxies require the exact `ADMIN_WEB_ORIGIN` `Origin`, a custom request header, and a same-origin `Sec-Fetch-Site` value. They never accept a bearer token from the browser.

## Environment Variables

### Backend (apps/api/.env)

Loaded from the `apps/api/` working directory by `pydantic-settings`.

| Variable              | Description                                                                                | Default                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string (`postgresql+psycopg` driver, used by SQLAlchemy and Alembic) | `postgresql+psycopg://resume:resume@localhost:5432/resume` |
| `API_HOST`            | Host to bind                                                                               | `0.0.0.0`                                                  |
| `API_PORT`            | Port to bind                                                                               | `8000`                                                     |
| `API_ACCESS_SECRET`   | Optional. HMAC signing secret for owner access tokens; at least 32 bytes of random data    | unset (administration disabled)                            |
| `OWNER_ID`            | Optional. Stable identifier for the owner account                                          | unset (administration disabled)                            |
| `OWNER_USERNAME`      | Optional. Owner login name                                                                 | unset (administration disabled)                            |
| `OWNER_PASSWORD_HASH` | Optional. Argon2id hash of the owner password; provision out of band                       | unset (administration disabled)                            |

The four administration variables must be provided together. A partial configuration fails closed: the administration routes report `Administration unavailable` and the public site keeps working.

### Frontend (apps/web/.env.local)

Loaded by Next.js in development from `apps/web/`. Copied from `apps/web/.env.example` (which documents `.env.local`, not `.env`).

| Variable           | Description                                                                               | Default                         |
| ------------------ | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `API_BASE_URL`     | Backend base URL; server-side only, never exposed via `NEXT_PUBLIC_`                      | `http://localhost:8000`         |
| `ADMIN_WEB_ORIGIN` | Exact public origin of the site (scheme, host, port; no trailing slash); server-side only | unset (administration disabled) |

`ADMIN_WEB_ORIGIN` must use HTTPS in production; a plain-HTTP origin is rejected because the session cookie is issued as `__Host-portfolio-admin` with the `Secure` attribute. A missing or invalid origin disables the administration routes while public browsing keeps working.

## Docker Compose

**Starting directory:** repository root

```bash
# Start PostgreSQL (binds 127.0.0.1:${POSTGRES_PORT:-5432})
docker compose up -d

# Stop PostgreSQL (data preserved in the postgres_data volume)
docker compose down

# Stop and remove volumes (destroys local data)
docker compose down -v
```

## License

MIT
