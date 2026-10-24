# Neon Managed Better Auth

This integration replaces application-managed passwords and sessions with Neon
Managed Better Auth. FastAPI remains the application API; it verifies the JWTs
issued by Neon. Saved resume and project changes are private drafts. Explicit
publication creates the version visitors can read. Authentication permits changes
only to the signed-in user's portfolio.

## Configure the selected project

The selected Neon project is **online-portfolio**. Enable Managed Auth on the
branch used by the app, then copy that branch's Auth URL. Configure its trusted
origins for the exact local and deployed frontend origins. The database and Auth
endpoint must refer to the intended branch; do not mix development and production
identities.

Set these server-only values:

| File (loaded from its application directory) | Variables                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/api/.env`                              | `DATABASE_URL`, `NEON_AUTH_BASE_URL`                                                |
| `apps/web/.env.local`                        | `API_BASE_URL`, `ADMIN_WEB_ORIGIN`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` |

Use the same Auth URL in both apps. Generate a random cookie secret of at least
32 characters, for example with `openssl rand -hex 32`. Do not reuse a Neon API
key as the cookie secret. `ADMIN_WEB_ORIGIN` is an exact origin, such as
`http://localhost:3000`; use HTTPS in production. Restart both applications after
changing their environment. Configure equivalent variables in each hosting
project; local files do not configure deployed apps.

Production uses `https://online-portfolio-datanerdbytes-4121.vercel.app` as its
canonical origin. Vercel permanently redirects
`online-portfolio-two-swart.vercel.app` to that domain, preserving paths and
query strings so account forms submit from the configured origin. Keep this
project domain redirect in place across releases; see the
[domain redirect record](deployments/auth-domain-redirect-2026-10-24.md).

Run migrations from `apps/api` using `uv run alembic upgrade head` before running
the API. Never use a production database for automated integration tests.

## Accounts and public portfolios

Register at `/auth/register` and complete email verification. A managed session
created by successful verification continues directly to `/admin`; otherwise
the workspace requests sign-in. Returning users go directly to the workspace
after sign-in. New identities receive blank profile/contact records on their first
authenticated API request, with no projects, skills, education or experience.
Registration never copies another user's content or publishes their login email.

The workspace includes Overview, Resume, Projects, Preview, and Account. Saves
update the draft. Preview renders only the current owner's saved draft; Publish
creates an atomic public copy at `/u/<owner_id>`. Unpublish hides the public copy
without deleting the draft. A changed draft revision rejects a stale publication
request with 409 so the owner can refresh before publishing. Existing public
portfolios are copied and kept published by migration `84ac7d2e19f0`; accounts
created after migration begin unpublished. Public content and images never fall
back to private drafts. See [the flow implementation](plans/portfolio-publishing-flow.md).

### Email verification and password recovery

Production now requires email verification. Registration opens
`/auth/verify-email`, where users enter the six-digit code or request another.
The sign-in form includes **Verify your email or request a new code** so users
can finish registration later. This link is retained at the user's request
because the application uses Neon's shared email sender. Already verified
accounts do not need to use it. An explicit unverified-email sign-in rejection
explains the next step and pre-fills the verification form's email when session
storage is available. Other forbidden requests do not claim that verification
is required.
Neon's shared email provider supports verification codes; verification links
require a custom email provider. No existing account is marked verified by the
application or by a database update.

The shared Neon email body cannot be customized to include a link back to
`/auth/verify-email`. Adding that link to registration emails requires an email
delivery webhook and a configured transactional email provider. Subscribing to
the delivery event replaces Neon's default email delivery. The user chose to
retain the shared sender and the link on the sign-in form rather than configure
a custom provider. See
[Neon's email customization guide](https://neon.com/docs/auth/guides/customize-emails).

Use **Forgot password?** on `/auth/signin`, or open `/auth/forgot-password`.
Neon emails a reset link whose callback is fixed to the configured production
origin at `/auth/reset-password`. The user enters and confirms a new password
there. Invalid or expired links have a route back to request another link.
Passwords, verification codes and reset tokens are handled by the provider;
the application does not persist them. Recovery requests use bounded inputs,
same-origin/CSRF checks, no-store responses and provider rate-limit handling.
Email-send acknowledgments do not reveal whether an account exists.

The configured sender is `Neon Auth <auth@mail.myneon.app>`. Check spam when
testing. Enabling the verification requirement can affect existing unverified
accounts at their next sign-in; verifying their email preserves all portfolio
ownership and content. Existing sessions follow the provider's session policy.

Application owner IDs normally equal the immutable Neon user ID. Every content
row stores an owner ID. Queries and writes use an owner-scoped session; nested
records also have composite database foreign keys preventing cross-owner parent
links. IDs supplied in paths or request bodies never select the editing owner.
The verified credential selects that owner. Another user's record ID returns 404. Public requests remain read-only, including when the visitor is signed in.

Public HTTP contracts:

- Default portfolio: `/api/v1/public/resume` and `/api/v1/public/projects`.
- Named portfolio: `/api/v1/public/users/<owner_id>/resume` and
  `/api/v1/public/users/<owner_id>/projects`.
- The Next.js `/api/public/...` proxy forwards those public requests without
  cookies or bearer tokens. Image URLs include the portfolio owner.
- Existing mutation paths remain under `/api/v1/resume` and `/api/v1/projects`.
  They require a Neon bearer JWT. `/api/v1/auth/me` returns the application owner
  ID and expiry after verifying the token and provisioning the blank portfolio.

## Existing data

The migration retains existing content. Previously unowned rows belong to the
reserved owner `00000000-0000-0000-0000-000000000001`, which is also the default
public portfolio. `PUBLIC_PORTFOLIO_USER_ID` can select another default portfolio.

To grant an established Neon account control of the original portfolio, an
operator must set `LEGACY_NEON_USER_ID` to that account's verified immutable user
ID **before its first editor request**. Never derive this binding from an email,
request parameter or the first person to register. Conflicting assignments fail
closed and require operator review. Additional owners retained from the discarded
custom-auth implementation remain public but unbound; account linking for those
records requires a separately reviewed data migration.

The compatibility anchor recognizes the discarded implementation's migration ID
without recreating its authentication tables on a fresh database. If `users` or
`auth_sessions` already exist, their data is preserved for an operator-reviewed
export or removal; the runtime never trusts their passwords or tokens. Alembic
autogeneration excludes reflected tables absent from application metadata, so it
will not propose deleting provider or retired authentication tables. Downgrading
the ownership migration requires a reviewed export/restore.

The local development database was backed up to the ignored `apps/api/media/backups/`
directory before applying the migration. A restored copy passed migration checks,
with matching content counts and no rows missing an owner. The live migration and release are recorded in
[the production cutover record](deployments/neon-auth-production-2026-10-23.md).

## Security boundary

The official `@neondatabase/auth` SDK manages HttpOnly cookies and provider
sessions. Browser-facing login/register responses contain no bearer tokens.
Mutations require the configured same-origin request and CSRF header. Passwords
are sent to Neon; this application does not store hashes or mint auth tokens.

The Next.js server obtains a provider JWT using `auth.token()`; the opaque session
token is never used as a JWT. FastAPI checks the EdDSA signature through the
provider's JWKS, origin-based issuer/audience, expiry and subject. Signing-key
network requests have a five-second timeout and keys are cached for five minutes.
Invalid tokens return 401; unavailable auth configuration or signing-key service
returns 503. Missing auth configuration does not prevent public reads.

Logout revokes the managed session through Neon. An already copied JWT can remain
valid until its provider-set expiry (normally 15 minutes). Neon owns password
rules, email verification, session policies and authentication rate limiting;
configure those in the managed service. Old `OWNER_*`, `API_ACCESS_SECRET` and
`LOGIN_RATE_LIMIT_STORAGE` settings no longer authenticate or throttle users.

## Verification

Local verification covered frontend auth delegation and error handling, real
Ed25519 signature verification, invalid credentials, and PostgreSQL-backed
isolation between two accounts. The full backend suite passed 278 tests, including
fresh migrations and public/owner access checks. All 63 frontend tests, TypeScript,
ESLint, Ruff and mypy passed. A webpack production build passed; this repository's
Tailwind loader is configured for Turbopack, so that fallback build does not verify
styling. The normal Turbopack build was also attempted and failed because its
CSS worker could not bind a local port in this execution environment. The
hosted Vercel production Turbopack build subsequently passed. ESLint retains the existing profile-avatar image warning. Dependency
audit reports existing Next.js lint tooling, typography and Mermaid findings;
no forced unrelated dependency upgrades were made.

Live verification on 2026-10-23 connected the local app to Managed Better Auth
on `online-portfolio` / `production`. Registration returned 200; browser sign-in
opened an empty account editor; FastAPI verified the real provider JWT. An owner
created a disposable project (201), an anonymous request read it (200), and the
owner removed it (204). Anonymous edits returned 401. Logout returned 204 and
replaying the revoked session cookie returned 401. The generated test account was
deleted with user approval, along with its local empty portfolio and temporary
credentials. The default portfolio and existing accounts were not modified.

The selected Auth endpoint is configured in the ignored local environment files.
Local content still uses local PostgreSQL. Production now uses the migrated
`onlineportfoliodb` database; see the
[production cutover record](deployments/neon-auth-production-2026-10-23.md). Neon allows localhost and email/password
registration. Email verification was disabled at the initial cutover and was
subsequently enabled with verification codes. The recovery release passed all
68 frontend tests, type checking, ESLint (the existing avatar warning remains),
secret scanning and the hosted Turbopack production build. Live recovery pages,
invalid-input rejection, CSRF protection and the public resume were checked.
Both approved test email requests were accepted, and the account holder confirmed
that both emails arrived. Completion of verification and password replacement
remains with the account holder and has not been confirmed.
The production frontend origin and environment settings are configured. A shared account-page frame avoids showing
the default portfolio owner's personal branding on other users' portfolios.

Official references: [Next.js API-only setup](https://neon.com/docs/auth/quick-start/nextjs-api-only),
[server SDK](https://neon.com/docs/auth/reference/nextjs-server),
[JWT plugin](https://neon.com/docs/auth/guides/plugins/jwt).
Recovery references: [password reset](https://neon.com/docs/auth/guides/password-reset),
[email verification](https://neon.com/docs/auth/guides/email-verification),
[Email OTP](https://neon.com/docs/auth/guides/plugins/email-otp).
