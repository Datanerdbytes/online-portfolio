# Online Resume / Portfolio — Agent Guide

## Purpose and current authorization

Build a production-style full-stack online resume and portfolio that demonstrates frontend and backend engineering. Work incrementally, keep changes reviewable, and verify what is actually runnable.

**Current status:** planning only. The user has paused application implementation and intends to delegate tasks to parallel agents before requesting a review. Creating this guide does not authorize an agent to implement every phase. Start only the task explicitly assigned by the user; treat the plan below as the roadmap, not a blanket instruction to build everything.

The project root is `/Users/roelsomido/python-project/online-resume`. Inspect existing files and applicable instructions before editing. Preserve work created by other agents.

## Agreed technology stack

| Area | Required technology | Role |
| --- | --- | --- |
| Repository | Monorepo | Keep frontend, backend, and development documentation together |
| Frontend | Next.js App Router | Application shell, routing, and rendering |
| Frontend language | TypeScript | Typed components, configuration, and API consumers |
| Styling | Tailwind CSS | Responsive styling and shared visual tokens |
| UI components | shadcn/ui | Accessible, locally owned component primitives |
| Backend | FastAPI | Versioned HTTP API and generated OpenAPI documentation |
| Backend language | Python | Backend application and tests |
| ORM | SQLAlchemy 2 | Typed models, sessions, and database access |
| Migrations | Alembic | Version-controlled database schema changes |
| Database | PostgreSQL | Local and eventual deployed persistence |
| Local database runtime | Docker Compose | Reproducible local PostgreSQL service |
| Backend testing | pytest | Health, configuration, and database-related checks |

Supporting tools, package managers, exact versions, and deployment targets are not yet agreed. Choose compatible maintained versions when implementation starts, record runtime requirements, and commit the resulting dependency lockfiles. Do not substitute a different framework or database without user approval.

## Initial milestone: scope and boundaries

Deliver the following incrementally:

- A clean monorepo structure and development configuration.
- A polished starter landing page with clearly labeled placeholder resume content.
- A working FastAPI `GET /api/v1/health` endpoint.
- Configurable PostgreSQL connectivity, SQLAlchemy session setup, and Alembic configuration.
- Docker Compose for local PostgreSQL.
- Basic backend tests and appropriate frontend checks.
- A README with accurate setup, local run, migration, and verification instructions.

Do not add authentication, an admin dashboard, contact-form delivery, analytics, a CMS, file uploads, or deployment infrastructure as part of this milestone unless explicitly assigned. Do not create speculative application tables just to demonstrate migrations; establish the migration environment and add schema revisions when a real data model is approved.

## Proposed repository structure

This layout is the starting proposal; adapt it deliberately if existing project files require a different arrangement.

```text
online-resume/
├── AGENTS.md
├── README.md
├── .gitignore
├── .env.example                 # Compose configuration, without real secrets
├── compose.yaml
├── package.json                 # Frontend workspace and common commands
├── <frontend-lockfile>
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── .env.example
│   │   ├── components.json       # shadcn/ui configuration
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── public/
│   │   └── src/
│   │       ├── app/             # App Router routes, layout, and global styles
│   │       ├── components/
│   │       │   └── ui/          # Locally owned shadcn/ui components
│   │       ├── content/         # Clearly labeled placeholder resume data
│   │       └── lib/             # Utilities and API boundary
│   └── api/
│       ├── pyproject.toml
│       ├── <backend-lockfile>
│       ├── .env.example
│       ├── alembic.ini
│       ├── migrations/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/v1/          # Versioned routes
│       │   ├── core/            # Settings and application configuration
│       │   ├── db/              # Engine, sessions, declarative base
│       │   ├── models/
│       │   └── schemas/
│       └── tests/
└── docs/                        # Architecture and task handoffs, when useful
```

Do not create empty files or extra packages merely to match the diagram. Package-manager-specific filenames must be resolved before agents independently modify dependency configuration.

## Overall implementation plan

### Phase 0 — Inspect and agree on contracts

1. Inspect the project root, existing Git boundaries, files, and local instructions.
2. Confirm each agent's task and file ownership before parallel edits.
3. Agree on runtime versions, package managers, commands, and lockfile locations.
4. Establish the health response and environment-variable conventions below before connecting frontend and backend.

Acceptance: agents have bounded assignments and a shared interface; existing work remains intact.

### Phase 1 — Repository and development foundation

1. Create the monorepo structure and frontend workspace configuration.
2. Define the backend package and development dependencies.
3. Add ignore rules for secrets, virtual environments, dependencies, caches, and build output.
4. Add example environment files and reproducible dependency locks.
5. Provide clear commands for development, checks, builds, tests, and migrations.

Acceptance: dependencies install using documented runtimes and lockfiles; environment examples explain their working directories and purpose.

### Phase 2 — FastAPI foundation

1. Create application configuration and a versioned router.
2. Implement `GET /api/v1/health` with a typed response.
3. Configure database URL loading, a SQLAlchemy 2 engine, declarative base, and request-scoped sessions.
4. Ensure sessions close correctly and connections are released on shutdown.
5. Initialize Alembic against the same settings and model metadata used by the application.
6. Add pytest coverage for the health contract and relevant configuration or failure behavior.

Acceptance: the API starts, its OpenAPI documentation loads, and health tests pass without requiring a running database.

### Phase 3 — Local PostgreSQL and connectivity

1. Add a PostgreSQL Compose service with a pinned major version, named volume, configurable local port, and database health check.
2. Bind the local database port to localhost and label example credentials as development-only.
3. Document starting and stopping the service and explain that deleting its volume removes local data.
4. Verify a real database connection and the Alembic upgrade path against PostgreSQL when available.
5. Add an opt-in integration test that uses an explicitly configured disposable test database.

Acceptance: a real PostgreSQL query succeeds and Alembic can connect. If Docker is unavailable, record this as unverified rather than claiming success from mocks or SQLite.

### Phase 4 — Starter frontend

1. Scaffold Next.js App Router with TypeScript, Tailwind CSS, and shadcn/ui.
2. Establish reusable typography, spacing, colors, and focus styles.
3. Build a responsive landing page with intro, about, skills, selected-project placeholders, experience placeholders, and a contact placeholder where appropriate.
4. Keep placeholder content in one typed module so real resume details can replace it later.
5. Add developer-focused details such as a stack overview and a live API health check, within the assigned scope.
6. Handle API loading, success, timeout, and unavailable states honestly.

Acceptance: the page is polished on mobile and desktop, navigation works, placeholder content is explicit, and the frontend renders even when the backend is stopped.

### Phase 5 — Integration, verification, and documentation

1. Connect the frontend health feature to the FastAPI health endpoint.
2. Verify the browser-to-API flow, including a stopped-backend state.
3. Run frontend linting, type checking, and production build independently.
4. Run backend tests and any configured static checks.
5. Verify PostgreSQL connectivity and migrations when Docker is available.
6. Write README instructions that reproduce the exact checked commands.
7. Review the combined changes for regressions, scope, accessibility, secrets, and misleading resume claims.

Acceptance: report what passed, what failed, and what could not run, with concrete evidence. A milestone is complete only when its required work and checks are finished or its limitations have been explicitly reported to the user.

## API and environment contracts

- Required route: `GET /api/v1/health` returns HTTP 200 and JSON `{"status":"ok"}` with a documented response schema.
- Health is a process-liveness check. It must not claim that PostgreSQL is connected.
- If database readiness is added, use a separate endpoint such as `GET /api/v1/ready`; execute a real lightweight query and return HTTP 503 when the database is unavailable. Never expose connection strings or raw database exceptions in responses.
- Keep application endpoints under `/api/v1`.
- Backend settings use `DATABASE_URL`. Select and document the PostgreSQL driver explicitly so SQLAlchemy and Alembic use the same URL format.
- Prefer a same-origin Next.js server route for the browser health request. If this approach is adopted, keep the upstream base URL in server-only `API_BASE_URL`; do not expose it through a `NEXT_PUBLIC_` variable unnecessarily.
- If direct browser-to-FastAPI requests are chosen instead, document the public API URL and configure an explicit CORS origin allowlist.
- Apply bounded request timeouts and avoid caching live health results. An API outage must not prevent the landing page from rendering.
- Document the directory from which each environment file is loaded. Never commit actual `.env` files or credentials.

## UI and resume-content requirements

- Direction: minimal, professional, developer-focused; prioritize readable content, restrained accents, consistent spacing, and clear hierarchy.
- Use semantic landmarks, ordered heading levels, keyboard-operable controls, visible focus, and accessible contrast.
- Check mobile and desktop layouts, including narrow screens and text wrapping. Respect reduced-motion preferences when animation exists.
- Prefer Server Components for static content and isolate client components to actual interactivity.
- Use shadcn/ui primitives where they fit; keep their source in the repository and configure import aliases consistently.
- Do not invent a name, job history, employers, degrees, certifications, location, contact details, achievements, statistics, or completed projects.
- Clearly label example projects and resume entries as placeholders. Stack choices describe this application, not verified personal expertise.
- Do not add fake download, repository, social, or contact links. Omit unavailable actions or explain their placeholder status.
- Show real backend status only after a successful request; never use a decorative indicator that implies the API is online.

## Backend and database requirements

- Use SQLAlchemy 2 typed patterns and choose either synchronous or asynchronous database access consistently.
- Keep blocking database operations out of asynchronous request handlers unless correctly offloaded.
- Centralize settings, database setup, and dependency injection; avoid scattered engine creation or connection strings.
- Use Alembic for schema changes; do not call `create_all()` on application startup as a migration substitute.
- Keep migration imports deterministic and ensure future models are registered with Alembic metadata.
- Tests must not depend on a developer's existing database or remove existing data. Integration tests need an explicit isolated database URL.
- Do not add persistence endpoints or database models beyond the task's approved scope.

## Parallel-agent coordination and review

The user controls delegation. This guide does not automatically instruct any agent to spawn other agents.

Suggested task boundaries once assigned:

| Workstream | Primary ownership | Coordination required |
| --- | --- | --- |
| Foundation | Root configuration, Compose, repository commands | Agree package-manager and environment conventions first |
| Backend | `apps/api/` | Publish health contract and database configuration |
| Frontend | `apps/web/` | Consume the agreed health contract; coordinate workspace dependencies |
| Integration/review | README, cross-stack verification, review findings | Wait for implementation handoffs and preserve unfinished work |

- Inspect current changes before editing; do not overwrite, reset, clean, or remove another agent's work.
- Assign one owner to shared manifests, lockfiles, Compose, and the README at a time.
- Use isolated branches or worktrees when Git is configured and the task calls for them; agree on the integration branch first.
- Do not initialize, modify, or commit to an unrelated parent repository. Establish a repository at this project root only when assigned.
- Keep commits focused if commits are requested; never commit secrets, generated caches, or local environments.
- Communicate changes to API contracts and environment variables before dependent work proceeds.
- Every handoff should list changed files, commands run, results, limitations, and work remaining.
- A review assignment is read-only unless fixes are also authorized. Report actionable findings with file and line references; distinguish defects from optional suggestions.

## Verification and completion checklist

Run checks appropriate to the assigned change; do not claim checks that were not executed.

- [ ] Frontend dependencies install reproducibly from the lockfile.
- [ ] Backend dependencies install reproducibly from the lockfile.
- [ ] Frontend lint, TypeScript checks, and production build pass.
- [ ] FastAPI starts and `GET /api/v1/health` returns the agreed status and body.
- [ ] Backend pytest suite passes without PostgreSQL for unit tests.
- [ ] PostgreSQL starts with Compose and accepts a real application connection.
- [ ] Alembic connects and applies the approved migration chain.
- [ ] Frontend health UI reflects both available and unavailable backend states.
- [ ] Browser layout, navigation, focus, and narrow-screen behavior are checked.
- [ ] All personal content is supplied by the user or clearly marked as placeholder.
- [ ] README commands, paths, ports, prerequisites, and environment examples match the implementation.
- [ ] Remaining failures, unavailable tools, and unverified integration checks are reported explicitly.

At planning time, Docker was installed but its engine was not running, and dependency downloads required network access beyond the restricted execution environment. These are observations, not permanent assumptions: check the current environment again when verification begins.
