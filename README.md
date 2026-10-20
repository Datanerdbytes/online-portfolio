# Online Resume / Portfolio

A production-style full-stack online resume and portfolio demonstrating frontend and backend engineering.

## Stack

| Area | Technology |
|------|------------|
| Frontend | Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.12+, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 (Docker Compose) |
| Package Managers | npm (frontend), uv (backend) |

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

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd apps/api && uv sync
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

Verify it's healthy:
```bash
docker compose ps
```

### 3. Configure environment

Copy example environment files and adjust as needed:

```bash
# Backend
cp apps/api/.env.example apps/api/.env

# Frontend
cp apps/web/.env.example apps/web/.env
```

### 4. Run database migrations

```bash
cd apps/api && uv run alembic upgrade head
```

### 5. Start development servers

```bash
# Terminal 1: Backend (runs on http://localhost:8000)
cd apps/api && uv run uvicorn app.main:app --reload

# Terminal 2: Frontend (runs on http://localhost:3000)
npm run dev:web
```

## Available Commands

### Frontend (apps/web)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler check |

### Backend (apps/api)

| Command | Description |
|---------|-------------|
| `uv run uvicorn app.main:app --reload` | Start development server |
| `uv run pytest` | Run tests |
| `uv run alembic upgrade head` | Apply migrations |
| `uv run alembic revision --autogenerate -m "message"` | Create migration |
| `uv run ruff check .` | Lint |
| `uv run ruff format .` | Format |

### Root

| Command | Description |
|---------|-------------|
| `npm run dev:web` | Start frontend dev server |
| `npm run build:web` | Build frontend |
| `npm run lint:web` | Lint frontend |
| `npm run typecheck:web` | Type-check frontend |
| `npm run format` | Format all files with Prettier |

## API Endpoints

- `GET /api/v1/health` — Health check (returns `{"status": "ok"}`)

## Environment Variables

### Backend (apps/api/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://resume:resume@localhost:5432/resume` |
| `API_HOST` | Host to bind | `0.0.0.0` |
| `API_PORT` | Port to bind | `8000` |

### Frontend (apps/web/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `API_BASE_URL` | Backend base URL (server-side only) | `http://localhost:8000` |

## Docker Compose

```bash
# Start PostgreSQL
docker compose up -d

# Stop PostgreSQL
docker compose down

# Stop and remove volumes (destroys data)
docker compose down -v
```

## License

MIT