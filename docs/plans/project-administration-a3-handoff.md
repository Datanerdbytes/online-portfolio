# A3 administration verification and documentation — 2026-10-21

Worktree: `.kilo/worktrees/golden-mustang`; branch: `integration/a3-project-administration`,
based on `main` at `9a181fd`. A1 (`d1c9534`, from `1e0b67b`) and A2 (`07ea05a`, from
`d22a296`) are merged into the branch. The verification work and the documentation
changes in this handoff are uncommitted. No merge into `main`, no push, no
deployment, and no change to the A1/A2 source worktrees.

## Scope

A3 is the verification and documentation pass for the owner administration
feature delivered by A1 and A2. It did not add product behaviour: no product
defect was reproduced, so no source fix and no regression test were required.
The committed change set of this handoff is documentation only.

## Documentation added

- `README.md` gained an **Administration** section: the four backend owner
  variables and the all-or-nothing provisioning rule, the out-of-band Argon2id
  password-hash command, the exact-match `ADMIN_WEB_ORIGIN` rule, the
  production HTTPS requirement and its `__Host-portfolio-admin` cookie
  consequence, the sign-in flow, the 15-minute absolute session lifetime, and
  the process-local login limiter with its single-worker deployment note.
- `README.md` **API Endpoints** now lists the full backend surface with the
  access level of each route and the frontend proxy surface, including the
  origin/custom-header/Fetch-Metadata requirements of the mutation proxies.
- `README.md` **Environment Variables** now lists the four optional owner
  variables and `ADMIN_WEB_ORIGIN` alongside the existing entries, including
  the fail-closed behaviour of a partial or missing configuration.
- `README.md` step 3 of the Quick Start points to the Administration section so
  the public-only default is not mistaken for the full configuration.

## Executed verification

- Backend: `uv run pytest -q` — **205 passed, 16 skipped** (the 16 skips are the
  explicit PostgreSQL integration opt-in). `uv run ruff check .` and
  `uv run ruff format --check .` pass.
- Frontend: `npm run test:auth` in `apps/web` — **30 passed**. Typecheck and
  production build pass. Lint reports 0 errors and the pre-existing
  `apps/web/tailwind.config.js:2:1` anonymous-default-export warning.
- PostgreSQL integration: **221 passed, 1 warning** on two consecutive runs
  against a disposable database, including the 16 previously skipped tests.
- Live HTTP acceptance against a real FastAPI backend, a real Next.js server,
  and a disposable PostgreSQL database with migration `6151be1aade3` applied:
  **58/58** checks passed, covering public listing, owner sign-in, session
  verification, project create/replace/patch/delete/reorder, validation
  rejection, unauthenticated rejection, and logout.
- Live outage evidence: sign-in **2/2**; with the backend stopped **8/8** (the
  landing page stayed 200, `/api/projects` returned 502 `unavailable`, login
  returned 502 `Authentication service unavailable`, the administration page
  rendered `Administration unavailable`, health returned 502); after restart
  **4/4** recovered.
- Browser verification with real Chrome over CDP and no added dependency:
  **70/70** checks passed — `main` 54, `signin` 3, `outage` 9 (backend really
  stopped), `recovery` 4. Coverage included keyboard operation, narrow and wide
  viewports, project create/edit/delete, batch reorder, repository and demo URL
  save, pre-fill and clear, sign-out, the real-backend outage state, and
  recovery. The editing of a seeded sample project's summary is intended
  behaviour: samples stay editable and keep `is_sample`.

## Limitations

- The browser harness was a temporary script outside the repository; it is
  removed during cleanup and is not part of the committed change set.
- Browser evidence covers Chrome on macOS only. Other engines, real devices,
  and assistive-technology passes are not claimed.
- The login limiter is process-local and was reset by restarting the backend
  between phases; no multi-worker or multi-replica behaviour is verified.
- The 30 frontend auth tests use Node's test runner against helper and handler
  code, not a browser DOM.
- The 37 files reported by `npm run format:check` are pre-existing and were
  deliberately left untouched; only `README.md` was formatted.
- No production deployment, no public security assessment, and no external
  audit is claimed.

## Cleanup

Cleanup is complete. The temporary owner credentials, the gitignored
`apps/api/.env` and `apps/web/.env.local`, the disposable verification database
`a3_verify_1792511288`, the temporary HTTP and browser scripts, the session
cookie file, and the Chrome profile were all removed. The isolated FastAPI
(127.0.0.1:8123) and Next.js (127.0.0.1:3123) servers started for verification
were stopped; no listener remains on either port.

Preserved: the `online-resume-postgres` container (still healthy) and its
volume, the developer database `resume`, and the pre-existing integration
databases `resume_integration_38c56a5ff11646a4` and
`resume_integration_bd2d8432fcea4c48`.

The working tree contains only the intended uncommitted documentation changes:
`README.md` and this handoff document.
