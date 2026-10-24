# Portfolio account and publishing flow

Approved scope: public browsing without authentication; registration and email
verification; onboarding; resume and project drafts; private preview; explicit
publish/update and unpublish; account controls; honest service failures.

Existing public portfolios stay published when the migration runs. New accounts
start unpublished. Saving any content or media updates only the owner's draft.
Published copies remain independent of draft edits and deletions. Publishing is
atomic and serialized against mutations; unpublished portfolios return 404.

Implementation checklist:

- [x] Add publication metadata, immutable public content copies, and migration.
- [x] Add owner-only publication APIs and protect published media references.
- [x] Add workspace overview/onboarding, preview, publication controls, account page.
- [x] Continue directly to the workspace after successful email verification.
- [x] Update editor/public messaging and distinguish unavailable from unpublished.
- [x] Verify owner isolation, publication lifecycle, media, migrations, and UI.
- [ ] Prepare a PR and use GitHub Actions checks; deploy only through workflows.

The shared Neon sender and optional verification recovery link remain in use.
Custom email delivery, custom public slugs, and new authentication providers are
outside this change. Existing editor forms keep explicit Save controls; saved
drafts are durable, and publication includes only saved changes.

Implementation details:

- Publication copies use internal snapshot owners and remap nested foreign keys.
  Public readers hold a shared publication lock for a consistent response;
  draft mutations and publishing acquire the same row exclusively.
- Published media references prevent draft cleanup from deleting public images.
  Re-publication cleans up files no longer referenced by either version.
- The local development database was backed up before migration; production has
  not been migrated or deployed outside GitHub Actions.
- Local checks include PostgreSQL integration, a nonempty migration backfill,
  owner-only publication proxies, TypeScript, ESLint, and a production build.
- Browser checks used the existing local signed-in account and did not publish,
  unpublish, or alter its profile. The legacy migration preserves even empty
  preexisting public portfolios; accounts created after migration start private.

Verification results (local): 284 backend tests including PostgreSQL integration,
73 frontend tests, five release-smoke unit tests, TypeScript, Ruff, and mypy pass.
ESLint has only the existing avatar `<img>` warning. The workspace, preview, and
account pages were checked using the existing session. At 375px the workspace
had no horizontal overflow; the unpublish modal focused Keep published, and
Escape closed it and restored focus without changing publication state. Fresh
registration email delivery and the post-verification session handoff were not
exercised with a new live provider account.

A pre-publication API rollback after private editing begins could expose draft
content through its old anonymous endpoints. Release recovery must use a reviewed
forward fix through GitHub Actions, rather than reverting to that API version.
