# Production releases through GitHub Actions

The workflow in `.github/workflows/ci.yml` checks pull requests and pushes to
`main`. Only successful checks on `main` can reach the production deployment
job. A manual run from the Actions page also runs every check before deployment;
manual runs on other branches cannot deploy.

## Release sequence

1. Frontend lint, TypeScript, tests, release-check tests, and production build.
2. Backend Ruff, Mypy, unit tests, PostgreSQL integration tests, and secret scan.
   PostgreSQL 16 runs as a temporary service on the GitHub runner. Tests create
   their own disposable database and apply the full Alembic migration chain;
   they do not connect to Neon.
3. Repository formatting and file checks.
4. Owner approval in the GitHub `production` environment, restricted to `main`.
5. Build both Vercel projects with production settings, then upload those exact
   build outputs using `--prebuilt --prod --skip-domain`. Neither live domain
   changes during staging.
6. Apply committed production migrations through the guarded workflow step. Then
   check staged API health, real database readiness, resume and project reads.
   Check the staged frontend homepage and its health, resume and project proxies.
   Protected deployment checks use `vercel curl`; no protection settings are
   disabled. Requests are read-only.
7. After both sets of checks pass, promote the API, then the frontend. Check
   the stable live domains again to verify frontend-to-API reads.

Production runs are serialized and an in-progress release is not cancelled by
another push. Pull request checks can be cancelled when a newer commit arrives.
Actions are pinned to exact commits; Vercel CLI is pinned to `64.2.0`. Check and
update these pins deliberately. Node.js 24 matches the frontend's Vercel runtime.

## One-time credentials and environment

The GitHub repository is `Datanerdbytes/online-portfolio`.
Its `production` environment must have:

- A deployment branch rule for `main` only.
- `Datanerdbytes` as required reviewer. Self-review is permitted for this
  single-owner repository.
- An environment secret named `VERCEL_TOKEN`, created by the owner in Vercel,
  scoped to the `datanerdbytes-4121` team, with an appropriate expiry.
- An environment secret named `MIGRATION_DATABASE_URL` containing the API's
  production Neon application database URL. Keep it synchronized when rotating
  the API's `DATABASE_URL`; Vercel Secret values are unavailable in pulled settings.

Create the token at <https://vercel.com/account/settings/tokens> and save it
through GitHub's environment settings. Do not paste it into chat, commit it,
or use an application API secret as the deployment token. Rotate it before
expiry. The workflow checks for a missing token before deployment starts.

The workflow contains public project identifiers:

| Target   | Working directory                        | Vercel project ID                  |
| -------- | ---------------------------------------- | ---------------------------------- |
| Frontend | repository root (Vercel root `apps/web`) | `prj_WO8baqdRYXxlA5aayCSvRggsmu53` |
| Backend  | `apps/api`                               | `prj_3sln5uC4QRmNGwwxQN3dCKFiNbSZ` |

Both use organization `team_aWWXAsZiAMPGuRFGhIqQyyFA`. Application secrets
remain in Vercel. `vercel pull` downloads settings into the runner's ignored
`.vercel` directories; these files are never uploaded as workflow artifacts.
The deployment token is supplied only to authenticated deployment steps.

The backend's `vercel.json` excludes local environment files, media, tests, and
caches from the Python function bundle itself. This complements `.vercelignore`:
prebuilt function source maps must not reference files that upload rules omit.
The deployment job checks the generated source map before uploading the backend.
The frontend build uses `--standalone` to inline traced dependencies into the
build output instead of referring to ignored source `node_modules` files.

Both Vercel projects were configured without Git integration when this workflow
was introduced. Keep automatic Git production deployments disabled so they do
not release a commit before these checks pass. Routine production changes
should go through this workflow rather than a direct local CLI deployment.

## Database changes and recovery

The pipeline tests migrations against disposable PostgreSQL, then applies committed
migrations to the production application database through its guarded deployment
step after environment approval. Review schema changes and arrange a backup before
approving that job. Keep old and new application versions compatible during the
rollout; production data is never seeded automatically.

These are two independent Vercel projects; promotion is not atomic. Staging
failures leave the live domains unchanged. If promotion or the final live checks
fail, inspect both projects before retrying. The Actions summary lists staged
URLs and the exact Git commit. The staged frontend uses the configured stable
backend origin, so its new-backend integration is checked after promotion.

For a bad release, inspect the failed workflow run and prepare a reviewed forward
fix through GitHub Actions. Any needed rollback must be implemented as an authorized
workflow operation with an exact known production revision. Preserve schema and data;
never downgrade automatically. Direct CLI/API/dashboard deployment recovery is not
an alternative to the workflow. Report missing workflow support before proceeding.

## Verification commands

```bash
node --test scripts/tests/deployment-smoke.test.mjs
node scripts/deployment-smoke.mjs api https://online-portfolio-api-datanerdbytes-4121.vercel.app
node scripts/deployment-smoke.mjs web https://online-portfolio-datanerdbytes-4121.vercel.app
```

The last two commands require a Vercel-authenticated CLI and make no data writes.
These smoke checks cover public reads, not a full browser or owner-editing test.
Workflow runs and their results are available in the repository's Actions tab.

## Publication schema rollout

The GitHub Actions production job applies committed Alembic migrations after
building both applications and before staged smoke checks and promotion.
`scripts/migrate-production.py` reads `MIGRATION_DATABASE_URL` from the protected
GitHub production environment, requires GitHub Actions on `main`, and checks that
it targets `onlineportfoliodb` on Neon. Standard PostgreSQL URLs are normalized to
the pinned psycopg driver. A configuration-only check runs before either build;
it never connects or migrates. Credentials and raw driver errors are never printed.

Migration `84ac7d2e19f0` snapshots existing public portfolios while preserving the
original editable rows and media. It briefly locks content tables against writes
so the backfill is consistent; public readers can continue. Back up production
before approving a release that changes schema. If migration or staged checks
fail, the job stops before promotion. The previous API can keep serving during
the additive schema backfill. After the new flow accepts private draft edits,
reverting to the pre-publication API would expose those drafts through its old
anonymous read behavior. Use a reviewed forward fix; the migration deliberately
rejects an automatic downgrade that would expose private drafts.
