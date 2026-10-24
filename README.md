# Online Resume & Portfolio

A full-stack online resume and portfolio built with Next.js, TypeScript, FastAPI, and PostgreSQL. Neon Managed Better Auth protects each user's workspace. Saved edits remain private drafts until the owner publishes them; visitors browse published portfolios without an account.

## What it includes

- Responsive portfolio homepage with profile, skills, experience, education, contact details, and featured projects.
- A print-friendly resume page.
- Project detail pages with GitHub-rendered README content and Mermaid diagrams when configured.
- FastAPI endpoints for resume and project content, backed by PostgreSQL and managed with Alembic.
- Neon-managed accounts and owner-authorized editing of projects, resume content, and images.
- Generated resume fallback content so the portfolio can still show resume details when the API is unavailable.
- Same-origin frontend API routes, including backend health status and protected administration requests.

Resume and portfolio entries are application content; update them with accurate information before publishing. The optional project seeder creates explicitly labeled development samples, not claims about completed work.

## Technology

| Area             | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| Frontend         | Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend          | FastAPI, Python 3.12+, SQLAlchemy 2, Alembic                   |
| Database         | PostgreSQL 16                                                  |
| Package managers | npm workspaces and uv                                          |

## Repository layout

```text
apps/
  web/    Next.js frontend, UI, API proxy routes, and frontend tests
  api/    FastAPI application, database models, migrations, and backend tests
compose.yaml
package.json
```

## Run locally

### Prerequisites

- Node.js 20 or newer and npm
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/)
- Docker Compose, for the local PostgreSQL database

### Install dependencies and configure the environment

Run from the repository root:

```bash
npm install
(cd apps/api && uv sync)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The examples use local development settings. The API loads `apps/api/.env` when commands run from `apps/api`; Next.js loads `apps/web/.env.local` from `apps/web`. Do not commit real `.env` files or credentials.

### Start PostgreSQL and prepare the database

Run from the repository root:

```bash
docker compose up -d
(cd apps/api && uv run alembic upgrade head)
(cd apps/api && uv run python -m app.scripts.seed_resume)
```

The resume seed is repeatable and synchronizes missing canonical resume content while preserving entries managed through the administration interface. To add clearly labeled sample projects for local development only, run:

```bash
(cd apps/api && uv run python -m app.scripts.seed_projects --allow-sample-data)
```

Sample projects are never added automatically. The `--allow-sample-data` flag is required, and existing entries are not overwritten.

### Start the application

Open two terminals from the repository root.

**Terminal 1 — API**

```bash
cd apps/api
uv run uvicorn app.main:app --reload
```

The API runs at <http://localhost:8000>. Its interactive OpenAPI docs are at <http://localhost:8000/docs>.

**Terminal 2 — web**

```bash
npm run dev:web
```

The site runs at <http://localhost:3000>. The frontend's server-side API routes use `API_BASE_URL` (default `http://localhost:8000`).

### Verify the services

```bash
curl http://localhost:8000/api/v1/health
curl http://localhost:3000/api/health
```

The API health endpoint returns `{"status":"ok"}` as a process-liveness check; it does not assert that PostgreSQL is available. The frontend health route reports the upstream API status separately.

## Configuration

| Variable                         | App | Purpose                                                                                        |
| -------------------------------- | --- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | API | PostgreSQL URL using the `postgresql+psycopg` SQLAlchemy driver                                |
| `API_HOST`, `API_PORT`           | API | API bind address and port                                                                      |
| `WEB_APP_URL`                    | API | Public frontend URL returned by the API root endpoint                                          |
| `API_BASE_URL`                   | Web | Server-only URL for the FastAPI service                                                        |
| `GITHUB_USERNAME`, `GITHUB_PAT`  | API | Optional server-side GitHub configuration for README rendering of eligible public repositories |
| `NEON_AUTH_BASE_URL`             | API | Neon Managed Better Auth endpoint for the selected branch                                      |
| `ADMIN_WEB_ORIGIN`               | Web | Exact site origin required for owner administration                                            |
| `MEDIA_ROOT`, `MAX_AVATAR_BYTES` | API | Profile image storage location and upload size limit                                           |

See [`apps/api/.env.example`](./apps/api/.env.example) and [`apps/web/.env.example`](./apps/web/.env.example) for the full examples. Owner settings are optional; without valid configuration, public browsing remains available and administration is disabled. `ADMIN_WEB_ORIGIN` must match the site's exact origin and use HTTPS in production.

## Content and fallback behavior

Resume data is served from PostgreSQL through the API. If the API is unavailable, the homepage and resume page use the generated fallback at `apps/web/src/content/resume.ts` and indicate that fallback is in use. Do not edit that generated file by hand.

After changing resume data, refresh the fallback while the API is running:

```bash
(cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npm run sync:resume-content)
```

Check whether the checked-in fallback matches the API:

```bash
(cd apps/web && API_BASE_URL=http://127.0.0.1:8000 npm run sync:resume-content:check)
```

Project listings come from the API. Empty results and unavailable-service states are handled explicitly; the UI does not present seeded sample projects as real work.

## Checks and tests

Run frontend checks from the repository root:

```bash
npm run lint:web
npm run typecheck:web
npm run build:web
```

Run the frontend test suite from `apps/web`:

```bash
cd apps/web
npm test
```

Run backend checks from `apps/api`:

```bash
uv run pytest
uv run ruff check .
uv run mypy --explicit-package-bases app
```

The default backend tests do not require PostgreSQL. PostgreSQL integration tests are opt-in and require an explicit admin connection URL for a disposable test server:

```bash
cd apps/api
TEST_DATABASE_ADMIN_URL='postgresql+psycopg://resume:resume@localhost:5432/postgres' uv run pytest --run-integration
```

This example uses the local Compose defaults; adjust it if you changed the database credentials or port. The integration suite creates and removes only the isolated database it creates. Do not point it at a database containing data you need to keep. See the [API README](./apps/api/README.md) and [web README](./apps/web/README.md) for additional test and verification details.

## Pull request and commit checks

Installing the npm workspace also installs its Husky Git hooks. Before each commit, the pre-commit hook formats staged JavaScript/TypeScript and Python files, checks staged file sizes and TOML syntax, scans tracked files for newly introduced secrets, and runs the frontend lint/typecheck/tests plus backend Ruff, Mypy, and pytest checks. Prettier also parses and formats staged JSON and YAML. Install frontend dependencies with `npm install` and backend development dependencies with `(cd apps/api && uv sync)` before committing.

The GitHub Actions workflow runs the frontend checks and production build, backend checks, tracked-file secret scanning, changed-file formatting, and repository file validation on pull requests targeting `main` (and on pushes to `main`). To require these checks before merging, enable branch protection or a ruleset for `main` in the GitHub repository settings and require the **Web checks**, **API checks**, and **Repository file checks** statuses.

## Neon Managed Better Auth

Accounts, passwords, email verification and sessions are managed by Neon. The
Next.js server uses the official `@neondatabase/auth` SDK and managed HttpOnly
cookies. FastAPI verifies Neon-issued Ed25519 JWTs for service-to-service requests;
it no longer issues login tokens or verifies passwords itself.

Only published resumes/projects are public. New accounts receive a private, empty draft on first
verified editor access. Each edit is restricted to that user's portfolio through
scoped database sessions and ownership constraints. Share `/u/<account-id>` to
view a portfolio without signing in.

Enable **Managed Better Auth** on the intended branch of the `online-portfolio`
Neon project. Configure its localhost/trusted-domain settings, then copy its Auth
URL into `NEON_AUTH_BASE_URL` in both `apps/web/.env.local` and `apps/api/.env`.
Generate `NEON_AUTH_COOKIE_SECRET` only for the frontend server with
`openssl rand -base64 32`; never publish it or use a `NEXT_PUBLIC_*` variable.
`ADMIN_WEB_ORIGIN` must exactly match the browser origin. Run from `apps/api/`:

```bash
uv sync --locked --group dev
uv run alembic upgrade head
```

Back up an existing database before migrating. The migration preserves existing
content and accommodates databases that ran the discarded custom-auth revision.
Its old account/session tables, if present, remain unused for a reviewed export;
their passwords and tokens cannot authenticate anyone. No Neon-owned schema is
created or modified by Alembic. If you need to edit the existing portfolio, bind
`LEGACY_NEON_USER_ID` deliberately before that account first opens the editor;
normal new users never inherit it.

Visit `/auth/register` to create a managed account, verify email if required, then
sign in at `/auth/signin`. Sessions and authentication throttling belong to Neon.
The former `API_ACCESS_SECRET`, `OWNER_*` and login-bucket settings no longer
authenticate users. See [setup and verification](docs/neon-auth.md) for contracts,
migration details, live-setup status, and actual checks.

## PostgreSQL lifecycle

Run these commands from the repository root:

```bash
docker compose up -d     # Start PostgreSQL
docker compose down      # Stop it; preserve the named data volume
```

`docker compose down -v` also deletes the local PostgreSQL volume and its data. Use it only when you intend to discard that development database.

## Vercel frontend deployment

Routine production releases use the [GitHub Actions deployment workflow](docs/deployment.md).
It requires all frontend, backend, PostgreSQL integration, and repository checks
to pass before staging and checking both apps, then promoting their production
deployments. The direct CLI commands below are for manual recovery and setup.

The frontend is deployed to the Vercel project `online-portfolio` under
`datanerdbytes-4121`. Its project settings use the Next.js preset, Node.js 24.x,
and `apps/web` as the root directory. The install command is:

```bash
cd ../.. && HUSKY=0 npm ci --include=dev --workspaces --include-workspace-root
```

To deploy from the repository root with the Vercel CLI:

```bash
vercel link --project online-portfolio --scope datanerdbytes-4121 --yes
vercel project inspect --non-interactive --scope datanerdbytes-4121
vercel deploy --prod --yes --scope datanerdbytes-4121
```

The frontend connects to the separate `online-portfolio-api` Vercel project
through server-only `API_BASE_URL`. Neon PostgreSQL stores the application data.
The checked-in resume remains an outage fallback. Local environment files are
excluded from uploads through `.vercelignore`.

### FastAPI and Neon

The API deploys from `apps/api`, using Python 3.12, the FastAPI preset, and
`app.main:app` as its entry point. Run these commands from `apps/api`:

```bash
vercel link --project online-portfolio-api --scope datanerdbytes-4121 --yes
vercel project inspect --non-interactive --scope datanerdbytes-4121
vercel deploy --prod --yes --scope datanerdbytes-4121
```

Configure these production variables in the API project: `DATABASE_URL`
(`postgresql+psycopg://` with Neon's pooled endpoint and SSL), `WEB_APP_URL`,
`MEDIA_STORAGE=database`, `DATABASE_POOL_MODE=external`, and `NEON_AUTH_BASE_URL`. External pooling uses Neon's pooler without
an additional per-instance SQLAlchemy connection pool. Configure
`NEON_AUTH_BASE_URL` for the selected branch to enable managed authentication. Optional GitHub
credentials remain server-only. The frontend's `API_BASE_URL` points to the
backend origin; `ADMIN_WEB_ORIGIN` must match the exact frontend production origin.

Apply migrations separately before deployment using Neon's direct connection
and the same `postgresql+psycopg://` driver. Never run migrations on request or
automatically seed sample projects in production. The local ignored file
`apps/api/.env.production.local` is a deployment credential input; FastAPI does
not load it automatically and normal local development still uses `.env`.

With database media storage, avatars, banners, and screenshots live in
PostgreSQL `bytea` rows with the existing 2 MiB upload limit. This suits this
small portfolio and avoids ephemeral serverless filesystem storage. If media
volume grows, move the storage adapter to object storage. The database login
authentication service manages credential throttling and sessions.

`GET /api/v1/health` checks process liveness. `GET /api/v1/ready` executes a real
database query and returns 503 without database exception details on failure.

## Further documentation

- [Backend API and database guide](./apps/api/README.md)
- [Frontend guide and browser verification](./apps/web/README.md)
- [Project design plan](./docs/plans/design-plan.md)

## Portfolio workspace and publication

After verification or sign-in, `/admin` shows the setup checklist and publication
status. Edit the resume at `/admin/resume`, projects at `/admin/projects`, and
review saved changes at `/admin/preview`. Only publishing makes changes public.
`/admin/account` keeps sign-in details and session controls separate from public
contact information. The optional verification recovery link stays on sign-in
because this project uses Neon's shared email sender.

Publishing requires a name, headline, and introduction. Experience and projects
are optional. Saving an open form is separate from publishing: preview and publish
include only saved changes. A stale preview returns a conflict rather than silently
publishing a changed draft. Unpublish retains the draft and hides public routes.

Migration `84ac7d2e19f0` preserves existing public portfolios in separate published
copies, including media references, before drafts become private. Back up local
data before `uv run alembic upgrade head` from `apps/api`. Production migrations
and releases run through `.github/workflows/ci.yml`; never deploy local files or
run production migrations manually. See [the flow plan](docs/plans/portfolio-publishing-flow.md).
