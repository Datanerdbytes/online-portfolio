# Project administration: owner authentication and API contract

- Worktree: `/Users/roelsomido/python-project/online-resume/.kilo/worktrees/innate-raja`
- Branch: `plan-owner-auth-and-project-api-contract`; starting commit `f455f24`.
- Status: owner selected the FastAPI token + Next.js cookie bridge and 15-minute absolute expiry on 2026-10-20. This document records that decision; only A0 is the next assignment. Full CRUD/UI, deployment, accounts, and real credentials remain outside A0.
- Scope: one portfolio owner manages projects; public visitors never sign in. No registration, owner table, refresh tokens, password reset, or new schema is proposed for this milestone.

## 1. Selected architecture: FastAPI token + Next.js cookie bridge

The owner selected the simpler cookie bridge, previously Option B. There is no Auth.js dependency, encrypted JWE session, second session secret, refresh token, or frontend signing authority.

1. The browser posts credentials to a same-origin Next.js login route. Next.js applies browser-origin protections and forwards validated credentials server-to-server to FastAPI.
2. FastAPI verifies the configured owner password, enforces login throttling, and issues its own signed HS256 JWT. Only FastAPI has `API_ACCESS_SECRET`.
3. Next.js stores that token in a dedicated HttpOnly cookie. It returns only sanitized owner/expiry information in JSON, never `access_token`.
4. On admin-page/session checks, Next.js forwards the cookie's token as `Authorization: Bearer` to FastAPI `/auth/me`. A cookie's presence or unverified decoded claims never prove authentication. On protected operations FastAPI independently verifies the bearer token again.
5. Public pages, project listing, and health retain their existing unauthenticated flow.

The token is signed, not encrypted. Keep claims minimal; never put passwords, hashes, or sensitive profile content in it. The browser stores the token as a cookie and its owner can inspect it in browser tools, but application JavaScript must not be able to read it. Never duplicate it into JSON, HTML, React client props, logs, localStorage, or sessionStorage. The supported public identity response contains only `owner_id`, `authenticated`, and `expires_at`.

Use a shared server-only cookie helper, backend request helper, browser-origin guard, and admin-page identity guard rather than scattered ad hoc handling. Next.js holds neither password hashes nor signing keys. No local token decoding is used for authorization.

## 2. Token, lifetime, and logout contract

### FastAPI token

- Format: signed JWS JWT; allowed algorithm **HS256 only**, configured independently of the token's untrusted header.
- Require `iss="online-resume-api"`, `aud="online-resume-web"`, `sub=OWNER_ID`, integer `iat`, integer `exp`, and nonempty random `jti`.
- `OWNER_ID` is a stable configured identifier, separate from the changeable login username.
- Proposed lifetime: 900 seconds. Require `exp > iat`, `exp - iat <= 900`, no future `iat` beyond an explicit maximum 30-second clock tolerance, and no acceptance at/after `exp`.
- Verify signature, required claims, issuer, audience, and expiry before using identity. Missing/invalid/expired token: 401 with `WWW-Authenticate: Bearer`. A valid token for a different subject: 403.
- Reject unsigned tokens, other algorithms, wrong audience/issuer, malformed claims, and excessive lifetime. Never use a decode-without-verification path for authorization.
- Password hashing: propose Argon2id via `pwdlib[argon2]`, following FastAPI's current password/JWT tutorial [S3]. Store only the hash; verification must not block an async event loop. Bound login input sizes before hashing and use a dummy hash verification for an unknown username.

### One effective lifetime; no renewal

The agreed effective login lifetime is **15 minutes absolute**, matching the backend JWT. There is no refresh endpoint and no password retained for silent re-login.

- FastAPI signs `exp = iat + 900` and returns that exact `expires_at` at login and on valid `/auth/me` responses.
- After a validated login response, Next.js writes a host-only cookie with `Path=/`, HttpOnly, `SameSite=Lax`, and `Secure` in production. Use `__Host-portfolio-admin` in HTTPS production and `portfolio-admin` for local HTTP development; never set a `Domain` attribute.
- Set cookie `Expires` to the backend expiration and `Max-Age` to the remaining whole seconds (positive and at most 900), not a fresh 900 seconds after a delayed response. Reject malformed or already-expired login responses. Session reads and activity never rewrite/extend this cookie or issue tokens.
- The browser cookie expiry is a convenience, not the security boundary. FastAPI rejects at/after the signed token's `exp`, including a copied cookie deliberately retained past expiry.
- The server-rendered admin page validates the token through FastAPI `/auth/me`. Missing/expired/invalid tokens show the sign-in gate. A backend outage shows administration unavailable, not an authenticated page or an invalid-password claim.
- JSON auth/protected operations return 401 for missing/expired/invalid credentials; the UI requests sign-in again, without automatic login loops. Keep unsaved form input in component memory when practical.
- Logout is a CSRF-checked Next.js POST that expires the exact same cookie name and `Path=/`, with matching security attributes. It works even if FastAPI is down and returns idempotent 204. No backend no-op logout endpoint is added.

Logout does not revoke a copied stateless token; it can be replayed until the original expiry. Password changes alone do not revoke tokens. Rotating `API_ACCESS_SECRET` immediately invalidates all existing tokens. Longer uninterrupted sessions or immediate per-session revocation require a separately reviewed refresh/stateful design. These are documented limits, not features implemented by cookie deletion [S4].

## 3. Browser request protection and login limits

### Browser to Next.js

- HTTPS in production; session cookie is HttpOnly, host-only, `Secure`, `Path=/`, and `SameSite=Lax`. Local HTTP uses the development name/settings above. SameSite is supplemental, not the sole protection.
- Apply the same **custom-header and exact-origin CSRF strategy** to login, logout, the A0 diagnostic POST, and all future project mutations [S5]. Require `X-Requested-With: online-resume-admin` and an `Origin` exactly matching configured `ADMIN_WEB_ORIGIN` (scheme, host, port). Missing, `null`, malformed, or mismatched Origin: 403. No permissive CORS/preflight responses.
- When `Sec-Fetch-Site` is present, require `same-origin`. Its absence does not bypass Origin/header checks.
- Require `application/json` for login and POST/PUT/PATCH with request bodies; reject form/text content types. Logout/diagnostic POST and DELETE have no body but still require Origin and custom header. GET never performs project writes or logout.
- The fixed custom header is not a secret token. Its protection depends on the origin checks and no cross-origin credentialed CORS. Do not add an unrelated CSRF-cookie/token protocol.
- Verify Origin against configuration, never an arbitrary incoming `Host`, `Forwarded`, or `X-Forwarded-Host`. Set any trusted reverse-proxy configuration explicitly before deployment.
- Strip client Authorization, owner/identity headers, and other cookies. Construct the backend Authorization header only from the server-read admin cookie. FastAPI accepts bearer tokens only, never browser cookies or owner headers.
- Auth/admin responses are `Cache-Control: no-store`; requests have bounded deadlines covering response-body parsing. The sign-in form submits JSON through same-origin fetch and never includes credentials in URLs. Never echo credentials or raw upstream failures.
- `/api/auth/me` is read-only; no-store prevents identity caching. A shared server-only helper validates the backend's identity/expiry response before using it in the page or returning its sanitized fields. Do not make a server component call its own Next.js URL when it can use that helper directly.

### Rate limiting is mandatory at FastAPI login

Next.js-only throttling is bypassable through direct FastAPI access. FastAPI must enforce a backend-owned global single-owner login-attempt bucket, proposed **five attempts per five minutes**, checked before password hashing, regardless of supplied username or forwarded client IP. Return generic 429 plus `Retry-After`; use generic 401 for invalid credentials. This prevents attacker-controlled usernames/IP headers from creating unlimited buckets. The global limit can temporarily inconvenience the owner during an attack; this is an explicit tradeoff of the small single-owner scope.

Initial deployment constraint: one FastAPI process/replica may use a bounded, concurrency-safe in-memory bucket with a monotonic clock. Restart resets it. Multiple workers/replicas require a shared limiter before deployment; do not claim a process-local limit is deployment-wide. Next.js may add a supplemental limiter, but cannot replace the backend limit. No passwords, tokens, hashes, or raw authentication request bodies in logs/errors. Wrong usernames receive the same generic response and comparable password-verification path.

## 4. Configuration and failure modes

| Service | Variable | Contract |
| --- | --- | --- |
| Next.js server only | `API_BASE_URL` | Trusted FastAPI base URL; HTTPS between remote services |
| Next.js server only | `ADMIN_WEB_ORIGIN` | Exact canonical browser origin, e.g. local `http://localhost:3000` |
| FastAPI only | `API_ACCESS_SECRET` | Independent strong random HS256 key, at least 32 random bytes |
| FastAPI only | `OWNER_ID` | Stable owner subject identifier |
| FastAPI only | `OWNER_USERNAME` | Login identifier |
| FastAPI only | `OWNER_PASSWORD_HASH` | Argon2id hash provisioned out of band |

Agreed 900-second lifetime and rate-limit policy are constants initially, not inconsistent frontend/backend environment knobs. No secret is prefixed `NEXT_PUBLIC_`, sent as page props, or put into the public session response. `.env.example` contains descriptions/placeholders only and **is committed**; actual `.env` files are not.

Auth settings are optional during settings parsing (`None`/empty treated as unconfigured), with a separate admin-configuration validator that rejects partial, weak, or invalid configuration. Do not declare an unconditional required Pydantic auth field that prevents the public app from starting. Login and protected backend endpoints return generic 503 `{"detail":"Administration unavailable"}` when auth is unconfigured. Next.js admin routes do likewise if its configuration is incomplete. Public layouts, public project routes, and health must not eagerly initialize auth or import a module that throws on missing secrets. Public browsing remains independent of **admin configuration**, but project listing still depends on PostgreSQL and health still only reports process liveness.

## 5. Exact routes and project contract

### Authentication: A0 route contract

| Next.js file / URL | FastAPI | Behavior |
| --- | --- | --- |
| `app/auth/signin/page.tsx` → `/auth/signin` | — | Minimal credentials form, JSON fetch |
| `app/api/auth/login/route.ts` → `POST /api/auth/login` | `POST /api/v1/auth/login` | CSRF check, credential forwarding, write cookie, sanitize response |
| `app/api/auth/me/route.ts` → `GET /api/auth/me` | `GET /api/v1/auth/me` | Read cookie, verify through backend; return sanitized identity |
| `app/api/auth/logout/route.ts` → `POST /api/auth/logout` | — | CSRF check, expire cookie, idempotent 204 even during backend outage |
| `app/api/auth/check/route.ts` → `POST /api/auth/check` | `GET /api/v1/auth/me` | Protected, CSRF-checked diagnostic action; no persistent changes |
| `app/admin/projects/page.tsx` → `/admin/projects` | `GET /api/v1/auth/me` through server-only helper | A0 identity/status page only; no project-management forms yet |

FastAPI login JSON: `{"username":"owner-login","password":"provided-password"}`. Success 200: `{"access_token":"<JWT>","token_type":"bearer","expires_at":1800000900,"owner_id":"portfolio-owner"}`. `expires_at` is the exact JWT `exp`, not a sliding interval. Validate credential lengths before hashing (username 1–200 characters; password 1–1024 UTF-8 bytes; never trim passwords). Login errors: 400 invalid JSON/schema, 401 invalid credentials, 429 rate limit, 503 unconfigured. Direct FastAPI login is subject to the backend limiter even when Next.js is bypassed.

FastAPI `/auth/me` uses bearer authentication and returns 200 `{"owner_id":"portfolio-owner","authenticated":true,"expires_at":1800000900}`; otherwise 401/403/503. Backend 401 includes `WWW-Authenticate: Bearer`. The Next.js login response returns those sanitized identity fields only, without the access token. Next.js `/auth/me` and diagnostic POST return the same sanitized shape and propagate sanitized backend auth statuses. Missing cookie is 401 without an upstream request. An upstream connection failure/timeout/malformed response is generic 502; admin misconfiguration is 503. Sign-in pages may show a gate; JSON endpoints never redirect to HTML.

The diagnostic POST verifies the real browser-cookie-to-bearer boundary and CSRF handling without adding project writes. A0 does not expose any CRUD route.

### Public and protected project routes

Public `GET /api/projects` → `GET /api/v1/projects` stays unchanged: `{"items":[ProjectResponse...]}`, ordered `display_order ASC, id ASC`. API outages still produce the current public proxy unavailable response; do not replace them with fake content.

| Next.js | FastAPI | Protected operation |
| --- | --- | --- |
| `POST /api/projects` | `POST /api/v1/projects` | Create |
| `PUT /api/projects/[slug]` | `PUT /api/v1/projects/{slug}` | Full replacement of writable fields |
| `PATCH /api/projects/[slug]` | `PATCH /api/v1/projects/{slug}` | Partial update |
| `DELETE /api/projects/[slug]` | `DELETE /api/v1/projects/{slug}` | Delete |
| `POST /api/projects/reorder` | `POST /api/v1/projects/reorder` | Atomic partial batch reorder |

Define static `reorder` routes before dynamic routes where router matching requires it. File paths are literal `app/admin/projects/page.tsx`, `app/auth/signin/page.tsx`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`, `app/api/auth/check/route.ts`, `app/api/projects/route.ts`, `app/api/projects/[slug]/route.ts`, and `app/api/projects/reorder/route.ts`. No duplicate collection-level PUT/PATCH/DELETE handlers.

Create body:

```json
{"slug":"resume-site","title":"Resume site","summary":"Portfolio application.","technologies":["Next.js","FastAPI"],"repository_url":null,"demo_url":null,"display_order":0}
```

Create requires slug/title/summary/technologies. Omitted URLs default null; omitted order defaults 0. Success 201 returns the existing full `ProjectResponse`, including generated `id` and `is_sample:false`. Duplicate slug: 409. The create is transactional; a unique-constraint race also becomes a sanitized 409 after rollback.

PUT body (all six fields required):

```json
{"title":"Updated title","summary":"Updated summary.","technologies":[],"repository_url":null,"demo_url":"https://example.com/demo","display_order":2}
```

PUT returns 200/full `ProjectResponse`; omitted fields fail validation. Slug is immutable after creation; body `slug`, `id`, `is_sample`, and other unknown fields are rejected, never silently ignored. There is no impossible “slug conflict on update” promise.

PATCH example: `{"title":"Revised title","repository_url":null}`. Omission leaves the stored value unchanged; null clears only the two URL fields. Null is invalid for title, summary, technologies, and order. An empty PATCH is rejected. PATCH returns 200/full response. Missing target on PUT/PATCH/DELETE: 404. DELETE returns empty 204. API responses never erase a sample marker: `is_sample` is read-only, false on create and preserved on updates. To replace an illustrative seeded project with real work, create a new real entry and explicitly delete the obsolete sample; do not relabel samples automatically.

Reorder example: `{"orders":[{"slug":"resume-site","display_order":1},{"slug":"another-project","display_order":2}]}` → 200 `{"updated":2}`. Accept 1–100 entries; slugs must be unique within the batch. Entries omitted from the batch retain their positions. Duplicate order values are permitted: existing `id` tiebreaker makes the public order deterministic. Validate and write in a single database transaction with target rows locked; any invalid or duplicate slug/order produces 400, and any missing target produces 404, with **no partial writes**. The updated count is the number of supplied target rows, including already-equal values. Concurrent deletion/update cannot leave a partial reorder.

Validation: trim title/summary/technology values and reject empty results; slug must already match `^[a-z0-9]+(?:-[a-z0-9]+)*$`, length 1–100. Title 1–200, summary 1–1000, technologies 0–20 items each 1–50; reject duplicate technology strings after trimming, preserve their order. URLs null or absolute HTTP(S), max 1024; reject blank URLs rather than silently clearing. Order is a strict integer 0–2147483647; reject booleans, floats, and numeric strings. Explicit null is never a substitute for an omitted non-nullable field. Reject unknown request fields.

Admin API/proxy errors use `{"detail":"<sanitized string>"}`: 400 invalid JSON/schema, 401 missing/invalid/expired auth, 403 valid non-owner or browser CSRF failure, 404 missing project, 409 duplicate create slug, 429 login limit, 503 admin misconfiguration/backend database unavailable. Unexpected upstream failures at the Next.js proxy produce generic 502. Implement admin-scoped validation handling explicitly; Pydantic/FastAPI do not produce the proposed 400/string shape automatically. Never echo passwords, tokens, input bodies, database URLs, or SQL errors. Backend 401 includes `WWW-Authenticate: Bearer`; browser sign-in pages may redirect, but JSON mutation routes return status codes rather than HTML redirects. Preserve unrelated public response contracts.

## 6. Implementation sequence and ownership (after approval)

### A0 — Authentication interoperability slice, before CRUD/UI

One agent coordinates the small cross-stack slice; do not split this auth boundary across agents yet. Read installed Next.js 16 documentation. Use pinned stable PyJWT/password-hashing packages with corresponding backend lockfile updates; no Auth.js or new frontend auth dependency. Add only FastAPI login/me, server-only cookie/origin/fetch/identity helpers, the literal A0 routes above, a minimal sign-in form and protected identity page, tests and environment examples. No project writes, schema changes, real credentials, or provider setup.

Acceptance covers the **real cross-runtime boundary**, not just a TestClient roundtrip:

- Backend login issues a token accepted by `/auth/me`; missing/tampered/wrong issuer/audience/algorithm/missing claims/expired tokens fail. A correctly signed non-owner token returns 403.
- Browser sign-in creates the expected HttpOnly cookie; Next.js reads it server-side and forwards a bearer credential verified independently by FastAPI. The protected diagnostic POST succeeds only with valid cookie and origin/header checks.
- Inspect login/me/check JSON, rendered HTML and client props: no access token; no token in localStorage/sessionStorage. Check production cookie attributes and prefix through tests as well as the local development cookie in the browser.
- Advance injected test clocks past original `exp`, including after repeated reads and activity: FastAPI and the protected page/check flow deny access. No sliding renewal, refresh endpoint, production bypass flag, or 15-minute sleep in tests.
- Logout clears the exact cookie and works while backend is unavailable; cookie absence denies future actions. Document copied-token replay until expiry and test signing-key rotation.
- Cross-origin, null/missing Origin, wrong/missing custom header, and disallowed content-type tests reject login/logout/check. Reject spoofed Authorization/identity headers rather than treating them as the logged-in owner.
- Direct backend login is rate limited: fixed-window boundary and concurrent-attempt tests, generic failures and no password leakage. No database is required for default auth tests.
- Missing/partial/weak admin config leaves public startup, liveness, and project listing independent of admin auth. Test backend outages separately from invalid credentials.
- Existing public health/project features and UI remain usable. All temporary ports/data are isolated; keep user servers running.

Owner has agreed to the architecture and lifetime. Implement A0 only when assigned; completing A0 does not authorize A1/A2 or deployment. Review A0 results before parallel CRUD/frontend-management work.

### A1 — Backend project management (`apps/api/`)

After A0 freezes the auth dependency and schemas: own config/auth helpers, auth and project routers, Pydantic schemas, `.env.example`, `pyproject.toml` and `uv.lock` changes needed for approved dependencies, and pytest tests. Add protected CRUD/reorder to the existing model; no new migration. Tests cover null/omitted/unknown fields, strict validation, sample-marker preservation, owner enforcement, create races, rollback and atomic reorder.

Default tests remain database-free. Persistence/transaction checks use the existing explicit integration opt-in and run-owned disposable database lifecycle. Never migrate, downgrade, seed, reset, or drop a developer database.

### A2 — Frontend management (`apps/web/`)

Can run in parallel with A1 **after A0 and the contract are accepted**, using controlled stubs until integration. Own the sign-in/admin pages, literal routes above, server-only guards and fetch helpers, UI forms, types and `.env.example`. Scope the required fields and complete PUT body correctly; use PATCH for targeted edits; never send read-only fields. Render pending/error/success states, handle expiry and 401 without losing form input unnecessarily, confirm destructive deletion, and preserve public project rendering, labels, keyboard navigation, health and Retry independence.

Root npm lockfile is a shared artifact: name one owner before any dependency change; A2 coordinates rather than editing it concurrently. No frontend authorization replaces FastAPI authorization. Configure no-store/timeouts through response-body parsing; cancellation and stale-response safeguards remain intact.

### A3 — Integration/review

Verify browser login → Next.js authenticated/CSRF-checked mutation → independently authorized FastAPI → isolated PostgreSQL → refreshed public project list. Exercise create/edit/delete/reorder, duplicate slug, failure rollback, missing config, expiry, logout, direct backend rejection, stopped backend, and public browsing without login. Use isolated ports and disposable data; preserve user servers and database volumes.

Run frontend lint, typecheck and production build; backend pytest and Ruff; opted-in PostgreSQL integration checks. Record what ran, results, limitations, exact worktree/branch and files. Do not claim mocked CRUD proves persistence or a TestClient login proves browser-cookie interoperability. No commits, pushes, deployment or agent spawning unless separately requested.

## 7. Agreed choices and later deployment decisions

The owner accepted **FastAPI authentication with the Next.js cookie bridge and 15-minute absolute expiry requiring re-login** on 2026-10-20. The alternative Auth.js design is discarded, not an implementation option. No frontend `AUTH_SECRET`, callbacks, JWE session, or library-owned authentication endpoints remain.

Routine defaults: `/admin/projects`, settings-based stable owner identity (no owner table), a backend-only signing key, strict same-origin request protection, and the mandatory backend login limit above. No additional approval questions are needed for these routine implementation details. Real owner credential provisioning is a separate local setup step; never request that passwords or keys be pasted into chat. Use throwaway secrets/credentials for tests.

Deployment provider can wait. Multi-replica/shared rate limiting, HTTPS/cookie security, canonical browser origin, inter-service TLS and trusted proxy configuration must be settled before deployment. Longer sessions or immediate per-session revocation need a separately reviewed extension.

## 8. Sources and current limitations

Primary references checked on 2026-10-20:

- [S3: FastAPI password/JWT tutorial](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/): PyJWT and modern password hashing; this tutorial does not define our application's session/CSRF policy.
- [S4: Auth.js session strategies](https://authjs.dev/concepts/session-strategies): background explanation of stateless-token early-revocation limits; Auth.js is not used in the selected design.
- [S5: OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): custom-header protections, exact origin validation, and limits of SameSite alone.
- [S6: OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): generic login errors and throttling.

This document records the selected design, not a working implementation or completed security audit. No auth code, dependencies, migrations, accounts, real secrets, runtime services, or deployment were created by this revision. Required A0 behavior is acceptance criteria, not a claim of executed tests.
