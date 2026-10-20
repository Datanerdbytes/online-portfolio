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

## Available Commands

### Frontend (apps/web)

Root workspace scripts run from the repository root; equivalently run `npm run <command>` from `apps/web`.

| Command                 | Description                                      | Directory  |
| ----------------------- | ------------------------------------------------ | ---------- |
| `npm run dev:web`       | Start development server (http://localhost:3000) | Root       |
| `npm run build:web`     | Production build                                 | Root       |
| `npm run start`         | Start production server                          | `apps/web` |
| `npm run lint:web`      | Run ESLint                                       | Root       |
| `npm run typecheck:web` | Run TypeScript compiler check                    | Root       |

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

## API Endpoints

- `GET /api/v1/health` — Health check (returns `{"status": "ok"}`); process liveness only, not a database connectivity check.

## Environment Variables

### Backend (apps/api/.env)

Loaded from the `apps/api/` working directory by `pydantic-settings`.

| Variable       | Description                                                                                | Default                                                    |
| -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+psycopg` driver, used by SQLAlchemy and Alembic) | `postgresql+psycopg://resume:resume@localhost:5432/resume` |
| `API_HOST`     | Host to bind                                                                               | `0.0.0.0`                                                  |
| `API_PORT`     | Port to bind                                                                               | `8000`                                                     |

### Frontend (apps/web/.env.local)

Loaded by Next.js in development from `apps/web/`. Copied from `apps/web/.env.example` (which documents `.env.local`, not `.env`).

| Variable       | Description                                                          | Default                 |
| -------------- | -------------------------------------------------------------------- | ----------------------- |
| `API_BASE_URL` | Backend base URL; server-side only, never exposed via `NEXT_PUBLIC_` | `http://localhost:8000` |

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
