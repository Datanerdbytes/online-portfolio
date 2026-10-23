# Neon Auth production cutover — 2026-10-23

The ownership migration and both application releases completed on the live
`online-portfolio` Neon project and the `datanerdbytes-4121` Vercel team.

## Targets and data protection

- Neon project: `floral-block-10490057`; production branch:
  `br-rough-river-b39t2w0g`.
- Application database: `onlineportfoliodb`. Managed Better Auth uses the
  separate `neondb` database on the same branch.
- Backup snapshot: `snap-snowy-queen-b3ifyvvq`, named
  `before-managed-auth-20261023`, created before the migration.
- The migration was rehearsed on copied branch `br-jolly-union-b30z9wq6`, named
  `auth-migration-rehearsal-20261023`. That branch was removed with explicit user
  approval after live checks passed; the snapshot remains.
- Both rehearsal and production migrations preserved row counts and complete
  content fingerprints for all 11 existing public-schema application tables,
  including stored media. No existing content was deleted or reassigned to a
  newly registered account.
- Migration chain: `e4b3179c820a` → compatibility anchor `f6a1c2d3e4b5` →
  ownership revision `6e0a9b12c345`.
- Detailed before/after manifests are in the ignored `apps/api/media/backups/`
  directory. No database credentials are included in this release record.

## Released applications

| Application | Production URL                                               | Deployment ID                      |
| ----------- | ------------------------------------------------------------ | ---------------------------------- |
| Frontend    | <https://online-portfolio-datanerdbytes-4121.vercel.app>     | `dpl_EikyxWcnzDyv4GY3r5tjd81AbGJB` |
| API         | <https://online-portfolio-api-datanerdbytes-4121.vercel.app> | `dpl_E4mh7RRnfAV1NDGBHkZegMKC5uA4` |

Both were built as production deployments without assigning their domains. The
API was promoted after the live migration and staged API checks passed. The
frontend was promoted after its public proxy returned the existing resume from
the new API.

This release was uploaded from the reviewed working tree based on
`f3a72b97396f3efe6a1d5b7bf7d611cd6e91658a`; the implementation remains uncommitted
locally. No Git push or commit was performed.

## Configuration changes

- Added server-only `NEON_AUTH_BASE_URL` in both Vercel projects and a freshly
  generated production `NEON_AUTH_COOKIE_SECRET` stored as a Secret in the
  frontend project. The local development cookie secret was not reused.
- Set `ADMIN_WEB_ORIGIN` and `WEB_APP_URL` to the frontend production origin,
  and `API_BASE_URL` to the API production origin. Existing database and GitHub
  credentials were kept unchanged; no complete environment export was needed.
- Added the exact frontend production origin to Neon Auth's trusted domains.
- Both Vercel projects previously used `all_except_custom_domains`, which also
  placed their `vercel.app` production domains behind Vercel login. The frontend
  consequently received a Vercel login HTML page from its API instead of JSON.
  Both now use Standard Protection (`prod_deployment_urls_and_all_previews`):
  production domains are public; preview and temporary deployment URLs remain
  protected. Application edits independently require verified Neon credentials.
  [Vercel protection settings](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).

## Verification

- Both hosted production builds succeeded, including Next.js's normal Turbopack
  build and Python dependency installation from `uv.lock`.
- Existing public resume: 200, including all three experience records.
- Existing public projects: 200, all eight projects retained.
- Frontend homepage, registration and sign-in pages: 200 without Vercel login.
- Browser inspection confirmed the live registration form and neutral account
  branding render correctly.
- Avatar, banner and a project screenshot returned 200 with image content types.
- Anonymous editor navigation redirected to sign-in; `/api/auth/me` returned 401.
- A login attempt with invalid credentials reached the live provider and returned 401. Invalid registration input returned 400. No account was created by these
  production smoke checks.
- Anonymous edits through both API and frontend proxy returned 401.
- Before release, all 63 frontend tests and Ruff passed. The previously completed
  backend suite passed all 278 tests, including PostgreSQL ownership isolation.
  Local verification had already exercised real Neon registration, browser login,
  owner CRUD, logout and revoked-cookie rejection; its generated test account
  was deleted with user approval.

## Account setup and recovery at initial cutover

The original portfolio remains public under its reserved application owner ID.
Linking it to a particular Neon account is deliberately separate: an operator
must confirm the intended immutable Neon user ID before setting
`LEGACY_NEON_USER_ID`. New accounts continue to receive blank portfolios.

Email verification remains disabled in the existing Neon configuration; email
verification delivery was not tested or changed during this cutover.

Previous live deployments were frontend `dpl_B98aPYSRHzeETShRVhi9xnzrFAEB` and API
`dpl_DNnJ8RspNVSHuJyS49jLbrTNJryw`. They predate owner isolation. Do not restore the
old API after new users begin editing without a reviewed recovery plan: it does
not enforce the new per-user model. Prefer a compatible forward fix. Restoring
the branch snapshot or reversing ownership requires an operator-reviewed
export/restore, accounting for any users and content created after the snapshot.

## Account link and region follow-up

The operator linked the user-selected Neon identity to the original portfolio
after checking that the account's automatically provisioned portfolio was blank.
The identity mapping changed atomically; all resume, project and image rows stayed
in place. The blank placeholder owner was retained without an auth mapping. The
private recovery record is in `apps/api/media/backups/neon-account-link-20261023.json`.
No permanent `LEGACY_NEON_USER_ID` environment override was needed.

Live browser verification exposed an existing authenticated project-read timeout:
the frontend returned 502 while the API eventually returned 200. Credential-free
error classification confirmed `AbortError` at the five-second upstream deadline.
The API was running in `iad1` while Neon is in Singapore, so provisioning and
content reads repeatedly crossed regions. The API is now pinned to `sin1` in
`apps/api/vercel.json`, alongside its database. The five-second read timeout and
authentication checks remain unchanged. After promotion, the same signed-in
project list loaded all eight projects and their editing controls. The resume
editor also loaded the existing profile text, portrait and banner.

Latest frontend: `dpl_JAnprsQSwhcgWjqZFrxiRSnqScJ7` (safe error-class logging).
Latest API: `dpl_C5zP1KHjQ5RJdKZqLvERqnj6Rums` (Singapore runtime). The earlier
cutover deployment IDs above describe the initial release, before this follow-up.

## Password recovery and email verification follow-up

Frontend deployment `dpl_7rKdu24GixvwNfvtsz5siN9hda1D` was built, checked on its
protected deployment URL, and promoted to the canonical production domain.
It adds forgot-password, reset-password and email-verification pages, a resend
code action, and server-side delegation to the Neon SDK. No database migration
or API redeployment was needed for these provider-managed operations.

In Neon Settings → Better Auth, **Verify at Sign-up** is now enabled with
**Verification code**. A subsequent MCP configuration read confirmed
`require_email_verification: true` and `email_verification_method: "otp"`.
The shared sender remains `auth@mail.myneon.app`. Other authentication settings,
account identities and portfolio ownership mappings were preserved.

All 68 frontend tests, TypeScript, secret scanning and the hosted production
build passed. ESLint passed with its existing avatar warning. Production pages
returned 200; invalid verification/reset inputs returned 400, missing-CSRF
requests returned 403, and the original public resume remained readable (200).
The user authorized verification-code and password-reset test emails to their
account; both application requests were accepted. The account holder confirmed
that both emails arrived. Completion of verification and password replacement
has not been confirmed. Password entry and submission remain with the user.
