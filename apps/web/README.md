# Online Resume — Frontend (apps/web)

This is the Next.js 16 App Router frontend of the online resume/portfolio monorepo. It is a workspace of the root [`package.json`](../package.json).

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS + shadcn/ui primitives (locally owned under `src/components/ui`)
- Same-origin API proxy routes under `src/app/api/` that forward to the FastAPI backend

## Commands

All commands run from this directory (`apps/web/`) unless noted. From the repository root, use the equivalent workspace scripts (`npm run dev:web`, `npm run build:web`, `npm run lint:web`, `npm run typecheck:web`).

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start dev server (http://localhost:3000) |
| `npm run build`     | Production build                         |
| `npm run start`     | Start production server                  |
| `npm run lint`      | Run ESLint                               |
| `npm run typecheck` | Run TypeScript compiler check            |

## Environment

Configuration is loaded from `apps/web/`. Copy `apps/web/.env.example` to `apps/web/.env.local` and adjust as needed. Do not commit `.env.local` or other `.env.*` files.

| Variable       | Description                                                                  | Default                 |
| -------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `API_BASE_URL` | FastAPI backend base URL; server-side only, never exposed via `NEXT_PUBLIC_` | `http://localhost:8000` |

## API integration

- `GET /api/projects` (Next.js server route, `src/app/api/projects/route.ts`) forwards to `GET /api/v1/projects` on the FastAPI backend using the server-only `API_BASE_URL`.
- The proxy applies a bounded upstream timeout, disables caching (`no-store`), validates the response payload at runtime, and returns a controlled `502` with `{ status: "unavailable" }` for upstream failures, timeouts, invalid payloads, or non-2xx responses. Raw upstream errors and connection details are never exposed.
- The browser requests `/api/projects` through the client `ProjectsClient` component (`src/components/projects.tsx`) with its own bounded timeout, abort-on-unmount, and request deduplication so stale responses cannot overwrite newer ones.
- Project titles and the **Read project details** action link to `/projects/{slug}`. The dynamic page loads public project metadata and GitHub-rendered README HTML server-side using the same `API_BASE_URL`; README content is revalidated hourly, and the browser never receives the GitHub token.
- `GET /api/v1/github/projects/{slug}/readme` is restricted to published projects whose configured GitHub repository belongs to `GITHUB_USERNAME` and is public. README failures leave the detail page usable and link to the configured repository when available.
- GitHub-rendered README fences marked `lang="mermaid"` are rendered as diagrams in the browser using Mermaid's strict security mode. Other code fences remain code blocks; invalid diagrams fall back to their original source.

Authenticated project-management proxy routes (require the admin session cookie and pass CSRF/origin checks):

- `POST /api/projects` → `POST /api/v1/projects` — create a project (201). Requires slug, title, summary and technologies; omits read-only fields.
- `PUT /api/projects/[slug]` → `PUT /api/v1/projects/{slug}` — full replacement of all writable fields (200). Slug is immutable.
- `PATCH /api/projects/[slug]` → `PATCH /api/v1/projects/{slug}` — partial update (200). Null clears only `repository_url` or `demo_url`; omitted fields are unchanged.
- `DELETE /api/projects/[slug]` → `DELETE /api/v1/projects/{slug}` — delete (204).
- `POST /api/projects/reorder` → `POST /api/v1/projects/reorder` — atomic batch display-order update (200).
- `GET`, `PUT`, and `DELETE /api/projects/[slug]/screenshot` → the corresponding `/api/v1/projects/{slug}/screenshot` routes — owner-authenticated draft image read, upload, replacement, and removal. Uploads accept JPEG, PNG, or WebP up to 2 MiB. Screenshot management is available when editing an existing project; uploaded screenshots appear as small thumbnails beside the technology tags in public project cards.

All authenticated mutation proxies construct the backend `Authorization: Bearer` header only from the server-read admin cookie, set `Cache-Control: no-store`, apply a bounded deadline that stays active through body parsing, and return sanitized errors. They never forward browser-supplied `Authorization` or owner headers.

Projects are rendered only when the backend returns them. A `Sample` badge marks entries where `is_sample` is true. Repository/demo links render only when provided as valid absolute `http(s)` URLs. Empty and unavailable states are shown explicitly, with a retry control for unavailable; failed requests never fall back to static sample cards.

The backend legitimately returns an empty `{"items":[]}` list until development data is explicitly seeded (see `apps/api/app/scripts/seed_projects.py`). An empty list is not an error.

## Verification

Run the full check suite from this directory:

```bash
npm run lint
npm run typecheck
npm run build
```

Runtime checks require the FastAPI backend running on `API_BASE_URL` (default `http://localhost:8000`). Start PostgreSQL and the backend per the root README, then open http://localhost:3000.

Browser scenarios to check against the real page and the `/api/projects` proxy:

1. Populated results — sample entries render with a visible `Sample` badge; real entries render without it.
2. Empty results — backend returns `{"items":[]}`; the empty state renders.
3. HTTP 503 — backend database unavailable; the proxy returns `502`, the page shows the unavailable state.
4. Backend stopped or upstream timeout — the page shows the unavailable state and keeps rendering.
5. Malformed upstream payload — the proxy returns `502`; the page shows the unavailable state.
6. Retry recovery — after an unavailable response, the retry button reloads from the proxy.
7. Null links and unsafe URL schemes — entries with null, missing, or non-http(s) links render no link.
8. Layout at 375px, 664px, and desktop widths — no clipping or horizontal overflow; long titles and technology lists wrap.

Check mobile and desktop layouts, keyboard focus, and the retry control. Report any scenario that cannot run (e.g. no browser tooling) as unverified rather than inferring success from a passing build.

### Project management verification (`/admin/projects`)

These require a signed-in owner session and a stub or real FastAPI backend on `API_BASE_URL`.

1. Sign in at `/auth/signin`; the `HttpOnly` cookie is set and `/admin` opens the workspace overview. Open Projects to use the manager.
2. Create a project — submit the form; a `201` creates it, the list refreshes, and the form resets.
3. Create with a duplicate slug — the proxy returns `409`, the error shows, and entered values are retained.
4. Edit a project — open the editor, change fields, save; a `200` refreshes the list and shows "Project draft saved."
5. Clear a URL — set repository/demo URL to blank and save; the stored value becomes `null`.
6. Edit with a `401`/session expiry — the error prompts sign-in again and entered values stay in the form.
7. Delete a project — the confirmation dialog names the project and returns focus to "Delete project"; confirming deletes it (`204`) and refreshes the list.
8. Cancel deletion — the dialog closes and the project remains.
9. Reorder — change display-order numbers and save; `POST /api/projects/reorder` returns `{"updated":N}` and the list reflects the new order.
10. Unavailable backend — create/edit/delete/reorder each show a clear error and distinguish "not authenticated" from "service unavailable."
11. Project screenshot — edit an existing project, upload or replace a JPEG/PNG/WebP screenshot (up to 2 MiB), verify its draft preview, publish to check the public thumbnail, then remove it from the draft; the public image remains until another publication.

Run `npm run test:auth` for the Node regression suite (uses the installed
TypeScript compiler and real handlers; no additional test framework). It covers
CSRF, production/development cookies, malformed payloads, expired response data,
upstream outages, and deadlines during JSON parsing. Also run `npm run lint`,
`npm run typecheck`, and `npm run build`.

## Neon Managed Better Auth

Use server-only `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (32+ random
characters), `API_BASE_URL`, and exact `ADMIN_WEB_ORIGIN` in `.env.local`. The
Neon SDK owns cookie handling and session operations; the app never signs its
own credential. `/api/auth/login`, `/register`, and `/logout` delegate to the
managed service, preserve CSRF checks and return sanitized results.
`/api/auth/[...path]` provides the SDK proxy for provider flows such as email
verification. Registration is at `/auth/register`; sign-in is `/auth/signin`.

The BFF obtains a provider JWT with the server SDK's `auth.token()`, never by
misusing the opaque `getSession().data.session.token`. FastAPI independently
validates it and enforces record ownership. Managed sign-out ends the provider
session. An already-issued JWT can remain valid for its provider-controlled
15-minute lifetime; do not promise immediate revocation of copied JWTs.
Only published content is public; each user can edit and preview only their own draft.
Missing configuration fails closed for authentication and leaves public pages
available. See [setup and verification](../../docs/neon-auth.md).

Run `npm run test:auth` for the Node regression suite (uses the installed
TypeScript compiler and real handlers; no additional test framework). It covers
CSRF, production/development cookies, malformed payloads, expired response data,
upstream outages, and deadlines during JSON parsing. Also run `npm run lint`,
`npm run typecheck`, and `npm run build`.

### Management edge cases and verification

Technology lists may be empty. The comma-separated editor preserves unchanged
stored labels containing commas; entering a new comma-containing label is not
supported by this input format. Edit sends only changed fields, and blank URL
inputs clear URLs with null. Only absolute HTTP(S) links are rendered.

Save order submits only changed projects, with at most 100 changes per batch;
large collections remain manageable by saving smaller batches. Unsaved order
values survive Refresh. Saves cancel stale list requests, and failed mutations
restore an enabled Refresh control. Drafts survive errors; the reauthentication
link opens a separate tab so signing in does not discard the original form.
The legal project slug `reorder` supports PUT/PATCH/DELETE at its literal path;
POST on that path remains the batch-order operation.

Review verification used an isolated in-memory backend fixture and the actual
Next.js application in a browser: create with no technologies, partial edit and
URL clearing, changed-only reorder, duplicate conflict, session-expiry draft
recovery through a separate sign-in tab, outage retry, confirmation Cancel and
Escape focus return, pending-delete protection, and refresh cancellation after a
failed mutation. Long title/summary/technology fixtures had no horizontal
page overflow at 375px, 664px and 1280px. No hydration errors were captured.
Boundary Tab/Shift+Tab automation was unreliable; that focus-wrap behavior is
source-checked, not claimed as browser verified. The 30-test Node suite also
covers exact response statuses, payload sanitization, path safety and CRUD for
the `reorder` slug. A3 must still prove real FastAPI authorization, PostgreSQL
persistence and atomic rollback with both implementation branches combined.

## Workspace flow

`/admin` is the authenticated overview and setup checklist. Resume and Projects
save private drafts, Preview shows saved content with publish/update/unpublish
controls, and Account contains private sign-in details and session controls.
Verification continues directly into the workspace when Neon creates a session.
The existing verification recovery link remains on sign-in.

Draft image proxies require a session; public images use `/api/public/...`.
Public pages use published API data and do not substitute repository content for
an unpublished portfolio. Publication errors preserve the saved draft and offer
retry or refresh guidance. An unavailable backend produces a workspace service
message rather than claiming the password was rejected.
