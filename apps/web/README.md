# Online Resume — Frontend (apps/web)

This is the Next.js 16 App Router frontend of the online resume/portfolio monorepo. It is a workspace of the root [`package.json`](../package.json).

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS + shadcn/ui primitives (locally owned under `src/components/ui`)
- Same-origin API proxy routes under `src/app/api/` that forward to the FastAPI backend

## Commands

All commands run from this directory (`apps/web/`) unless noted. From the repository root, use the equivalent workspace scripts (`npm run dev:web`, `npm run build:web`, `npm run lint:web`, `npm run typecheck:web`).

| Command | Description |
| --- | --- |
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler check |

## Environment

Configuration is loaded from `apps/web/`. Copy `apps/web/.env.example` to `apps/web/.env.local` and adjust as needed. Do not commit `.env.local` or other `.env.*` files.

| Variable | Description | Default |
| --- | --- | --- |
| `API_BASE_URL` | FastAPI backend base URL; server-side only, never exposed via `NEXT_PUBLIC_` | `http://localhost:8000` |

## API integration

- `GET /api/projects` (Next.js server route, `src/app/api/projects/route.ts`) forwards to `GET /api/v1/projects` on the FastAPI backend using the server-only `API_BASE_URL`.
- The proxy applies a bounded upstream timeout, disables caching (`no-store`), validates the response payload at runtime, and returns a controlled `502` with `{ status: "unavailable" }` for upstream failures, timeouts, invalid payloads, or non-2xx responses. Raw upstream errors and connection details are never exposed.
- The browser requests `/api/projects` through the client `ProjectsClient` component (`src/components/projects.tsx`) with its own bounded timeout, abort-on-unmount, and request deduplication so stale responses cannot overwrite newer ones.

Authenticated project-management proxy routes (require the admin session cookie and pass CSRF/origin checks):

- `POST /api/projects` → `POST /api/v1/projects` — create a project (201). Requires slug, title, summary and technologies; omits read-only fields.
- `PUT /api/projects/[slug]` → `PUT /api/v1/projects/{slug}` — full replacement of all writable fields (200). Slug is immutable.
- `PATCH /api/projects/[slug]` → `PATCH /api/v1/projects/{slug}` — partial update (200). Null clears only `repository_url` or `demo_url`; omitted fields are unchanged.
- `DELETE /api/projects/[slug]` → `DELETE /api/v1/projects/{slug}` — delete (204).
- `POST /api/projects/reorder` → `POST /api/v1/projects/reorder` — atomic batch display-order update (200).

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

1. Sign in at `/auth/signin`; the `HttpOnly` cookie is set and `/admin/projects` renders the manager.
2. Create a project — submit the form; a `201` creates it, the list refreshes, and the form resets.
3. Create with a duplicate slug — the proxy returns `409`, the error shows, and entered values are retained.
4. Edit a project — open the editor, change fields, save; a `200` refreshes the list and shows "Project saved."
5. Clear a URL — set repository/demo URL to blank and save; the stored value becomes `null`.
6. Edit with a `401`/session expiry — the error prompts sign-in again and entered values stay in the form.
7. Delete a project — the confirmation dialog names the project and returns focus to "Delete project"; confirming deletes it (`204`) and refreshes the list.
8. Cancel deletion — the dialog closes and the project remains.
9. Reorder — change display-order numbers and save; `POST /api/projects/reorder` returns `{"updated":N}` and the list reflects the new order.
10. Unavailable backend — create/edit/delete/reorder each show a clear error and distinguish "not authenticated" from "service unavailable."

Run `npm run test:auth` for the Node regression suite (uses the installed
TypeScript compiler and real handlers; no additional test framework). It covers
CSRF, production/development cookies, malformed payloads, expired response data,
upstream outages, and deadlines during JSON parsing. Also run `npm run lint`,
`npm run typecheck`, and `npm run build`.


## Owner sign-in (A0)

Set server-only `API_BASE_URL` and `ADMIN_WEB_ORIGIN` in `apps/web/.env.local`.
The origin must be the exact browser origin (scheme, hostname and port), without a
path or trailing slash. For example, `http://localhost:3000` and
`http://127.0.0.1:3000` are different origins. Production requires an HTTPS origin.
Missing/invalid admin origin disables admin routes while public browsing works.
Owner credentials and the signing key belong only in the FastAPI configuration.
No Auth.js dependency, frontend signing secret or owner table is used.

Visit `/auth/signin`. `/admin/projects` shows verified identity and session
diagnostics, plus owner project management: create, edit, delete (with an
accessible confirmation) and atomic display-order reorder. The browser sends
JSON to the same-origin proxy routes; Next.js keeps the backend bearer token in
a host-only HttpOnly cookie. JSON/HTML/client props contain only sanitized
identity. Development uses `portfolio-admin`; production uses
`__Host-portfolio-admin` with Secure, HttpOnly, SameSite=Lax and Path=/, no Domain.
Cookie expiry is the backend's original 15-minute expiry, never sliding.

Login, diagnostic and logout POSTs require an exact configured Origin and
`X-Requested-With: online-resume-admin`; `Sec-Fetch-Site`, when present, must be
`same-origin`. The browser supplies Origin automatically. Normal HTML forms do
not meet this custom-header contract. Logout clears the cookie even when FastAPI
is offline. Copied tokens remain valid until expiry or backend key rotation.

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
