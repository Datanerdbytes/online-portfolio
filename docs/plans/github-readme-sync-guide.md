# Dynamic GitHub README display

This feature displays each published portfolio project's GitHub README in its
own Next.js detail page. The browser never receives the GitHub token.

## Request flow

1. A visitor opens the portfolio's `#projects` section and follows a project
   title or **Read project details** link to `/projects/{project-slug}`.
2. The Next.js page streams its back link, slug-based title, and separate
   skeletons for project metadata and README content. Project metadata supplies
   the summary, technology tags, and repository link.
3. Next.js makes server-side requests to FastAPI using `API_BASE_URL`, which is
   private to the web server:
   - `GET /api/v1/projects/{project-slug}` loads the published project details.
   - `GET /api/v1/github/projects/{project-slug}/readme` loads README HTML.
4. FastAPI only resolves README requests for a project already present in the
   public projects table. It accepts only a GitHub repository URL owned by
   `GITHUB_USERNAME`, verifies that GitHub reports the repository as public,
   and then requests the rendered README.
5. Next.js caches project details for five minutes and README responses for
   one hour. If the README cannot be retrieved, the page offers a link to the
   project's configured repository URL instead.

## Configuration

Backend variables are loaded from `apps/api/.env` when running the API from
`apps/api/`. Copy `apps/api/.env.example` and set:

```env
GITHUB_USERNAME=your-github-account
GITHUB_PAT=your-server-side-token
```

The token must be stored only in the backend environment. No repository scope
is required for public repositories. The API verifies the repository's public
visibility before requesting its README, even if the configured token has
broader access.

The web app loads `apps/web/.env.local` when running from `apps/web/`. Copy
`apps/web/.env.example` and set the server-only FastAPI base URL:

```env
API_BASE_URL=http://localhost:8000
```

Do not use `NEXT_PUBLIC_` for the backend URL or GitHub token. The browser only
requests the Next.js page; it does not call FastAPI or GitHub directly. CORS is
not needed for this server-to-server flow.

## Source files

- `apps/web/src/components/projects.tsx` links project titles and detail
  actions to `/projects/{slug}`.
- `apps/web/src/app/projects/[slug]/page.tsx` renders the streamed details and
  README sections.
- `apps/api/app/api/v1/projects.py` provides public project detail lookup.
- `apps/api/app/api/v1/github.py` validates the configured project repository
  and fetches GitHub's rendered HTML.
- `apps/api/app/core/config.py` and `apps/api/.env.example` define the backend
  GitHub settings.

## Local verification

Start PostgreSQL and apply migrations using the root README instructions. Add
a project through the owner project-management UI with a public GitHub
repository URL under `GITHUB_USERNAME`, then start both services:

```bash
# From apps/api/
uv run uvicorn app.main:app --reload

# From apps/web/
npm run dev
```

Open the homepage, select the project's title or **Read project details**, and
verify its metadata, technology tags, and README. To test the fallback, stop the
API and revisit the detail page; the page should still render and provide the
configured GitHub repository link when available.

Focused automated checks:

```bash
# From apps/api/
uv run pytest tests/test_github_readme.py tests/test_projects.py
uv run ruff check app/api/v1/github.py app/api/v1/projects.py tests/test_github_readme.py tests/test_projects.py

# From apps/web/
npm run typecheck
npm run lint
npm run build
```
