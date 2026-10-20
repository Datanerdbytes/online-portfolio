# A0 authentication review and fixes — 2026-10-20

Worktree: `.kilo/worktrees/innate-raja`; branch:
`plan-owner-auth-and-project-api-contract`, based on `f455f24`.
Implementation and review fixes are uncommitted. No project CRUD, schema,
Compose, real credential, deployment, commit, merge, or push work was performed.

## Confirmed defects corrected

- Admin buttons now send CSRF-compliant same-origin POST requests instead of
  plain forms that always fail the required custom-header check.
- Server-only helpers catch outages, keep deadlines active through JSON parsing,
  and validate identity/token/expiry payloads without coercion. A failed service
  produces an unavailable state rather than an unhandled page error or a false
  invalid-password message.
- Missing/weak/partial/malformed admin configuration fails closed. Auth policy
  values are actual constants, not environment-overridable Pydantic fields.
- Bearer claims have strict integer dates, positive bounded lifetime, nonempty
  identifiers, issuer/audience/algorithm/signature checks, original absolute
  expiry, and key-rotation rejection. No-op backend logout was removed.
- Credential validation errors are generic and do not echo request bodies.
  Unknown usernames perform one dummy verification; known wrong passwords also
  perform one verification. Login throttling uses a bounded, locked monotonic
  clock bucket.
- Browser mutations reject noncanonical/missing/null/mismatched origins,
  missing/wrong custom headers, and disallowed Fetch Metadata. Login requires
  the exact JSON media type and bounded credential shapes.
- Shared cookie helpers consistently set/clear development and production
  cookies; production uses Secure `__Host-portfolio-admin`, host-only, Path=/,
  HttpOnly, SameSite=Lax. Session expiry cannot slide or exceed 900 seconds.
- Shared resume navigation now links to home-page sections from auth/admin
  routes. Successful sign-in resets the credential form.

## Executed verification

- Backend: `uv run pytest -q` — **92 passed, 7 skipped**. The skipped tests retain
  their existing explicit PostgreSQL integration opt-in. Auth tests use no
  database; public-list independence uses a test double rather than a developer
  PostgreSQL connection.
- Backend: `uv run ruff check .` and `uv run ruff format --check .` pass.
- Frontend: `npm run test:auth` — **9 passed**, including actual helper/handler
  tests for CSRF, cookie attributes, malformed payloads, network failures and a
  stalled body with an injected deadline. Uses installed TypeScript/Node APIs;
  no new frontend dependency or lockfile changes.
- Frontend: typecheck, lint, production build pass. Lint retains the existing
  `tailwind.config.js` anonymous-default-export warning. Existing pytest/Starlette
  dependency deprecation warnings remain.
- Live HTTP boundary: real FastAPI auth on isolated port 8200, Next.js on 3200,
  controlled transport fixture on 8201. Verified login/cookie/me/check/logout,
  sanitized JSON/HTML, CSRF rejection, malformed identities, unavailable page,
  backend outage and cookie deletion during outage. A headers-first stalled JSON
  body returned generic 502 in **8.02 seconds**.
- Browser: successful login and protected page, Enter-operated diagnostic and
  sign-out, unavailable sign-in message, logout during outage, recovery,
  backend expiry via an injected test clock followed by protected-page denial,
  and denial after logout. No hydration/console errors observed. Admin page
  document width equaled viewport at **375, 664, 1280 px**; visible keyboard focus
  and mobile-menu Escape focus return checked. These are browser observations,
  not conclusions inferred from curl or CSS classes.
- Temporary test credentials and a database-free public-list fixture were used.
  No developer database writes, migration, seeding, or Compose changes occurred;
  existing user servers on 3000/8000 were preserved. Only isolated review
  servers were started and are stopped at completion.

## Remaining boundaries

A0 is the auth bridge and identity/status page. Project CRUD and management UI
remain the next assignments. Auth.js beta, shared Auth.js signing keys and an
8-hour session are discarded options, not pending decisions. Provider selection
belongs to deployment and does not block local CRUD work.

Logout deletes the cookie but copied bearer credentials remain usable until
their original 15-minute expiry or signing-key rotation. The login limiter is
process-local and resets on restart; deployment must use one worker/replica
until a shared limiter exists. No production deployment or public security
assessment is claimed.
