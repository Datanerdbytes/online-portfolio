# Resume import

Signed-in owners can import a text-based PDF or DOCX into a private draft from
`/admin/import`. Review and saving are separate from publishing. Imports never
remove existing rows or media; nested skill items, highlights, and technologies
are appended without removing existing entries. Existing populated fields and AI
writing suggestions are unselected by default. New repeated entries require
explicit inclusion and can target an existing entry selected by the owner.

## Local attachment testing without a provider key

Set `RESUME_IMPORT_LOCAL_PREVIEW=true` in `apps/api/.env` and restart the local
API after applying the metadata migration to the local database. The page then
shows **Read document locally**. It posts to the authenticated, bounded
`/api/v1/resume-import/read` endpoint and displays extracted text in page memory;
it never calls NVIDIA or changes resume fields. The same shared attempt limits
apply. This endpoint is unavailable when `VERCEL` is set and defaults to disabled.
The picker stays visible while AI import is disabled so the setup state is clear.

## Configuration and enablement

The feature is **disabled by default**. Set these only on the FastAPI service:

- `NVIDIA_API_KEY`: server-side Secret, never `NEXT_PUBLIC_` or committed.
- `NVIDIA_MODEL`: defaults to `meta/llama-3.3-70b-instruct`.
- `RESUME_IMPORT_ENABLED`: enable only after the evaluation below passes.

The adapter calls `https://integrate.api.nvidia.com/v1/chat/completions` without
redirects, tools, automatic retries, or sending existing account data. It requests
JSON then validates the result and exact source excerpts locally. The hosted
model is not assumed to support self-hosted NIM structured-generation parameters.
Each call has a 75-second total deadline and 4096 output tokens; truncated results
are rejected rather than partially imported.

From the repository root, load the key securely into the process environment,
then run (synthetic fixtures only; never use a real resume for CI):

```sh
uv run --project apps/api python scripts/evaluate-resume-import.py --live
```

Do not put the key in a command argument, PR body, chat, or log. The evaluator
prints only fixture names, gate results, and latency. It checks normal content,
ambiguous dates, schema/evidence integrity, and embedded malicious instructions.
A missing key, failed model call, failed gate, or unreviewed suggestions means
production must remain disabled. Model changes require repeating evaluation.

Configure provider secrets through the hosting secret mechanism; ship code,
migrations, and enablement through the repository's GitHub Actions release gates.
No direct deployment or production migration is part of local setup. After a
successful approved release, run one owner-consented end-to-end import, verify
the saved draft, then confirm the published snapshot remains unchanged.

## Privacy and limits

Consent is required before mapping. Files are processed transiently and discarded;
review proposals exist only in page memory. Leaving or refreshing loses unsaved
review. The original document is never published, placed in media storage, or
uploaded to a provider file endpoint. Extracted text goes to NVIDIA, whose own
policies govern its handling. App deletion is not a provider-retention promise.
No source text, names, contact data, filenames, or proposals are logged. PDF
extraction uses text order rather than layout padding; Unicode ligatures are
normalized before mapping. A four-page user-provided PDF was verified locally
without sending its contents to NVIDIA; no private fixture is committed.

Uploads are bounded at both proxies before multipart parsing: 3 MiB plus 64 KiB
framing. PDFs allow 1–10 readable pages, extracted text is limited to 50,000
characters, and DOCX archives to 1000 members / 20 MiB total expansion. A parser
worker is terminated after 10 seconds and additionally CPU/memory bounded on
Linux. Image-only pages, malformed/encrypted files, and exceeded limits are
rejected. Export a simpler text-based document or use the manual editor.

Database-coordinated rolling limits: one active analysis per owner (120-second
lease), 5 attempts/hour, 20/day per owner, 200/day globally. Attempts count even
when parsing or mapping fails, avoiding free retries that bypass quotas.
Operational metadata and import receipts are valid for 24 hours; expired records
are deleted on the next analyze/apply request. They contain only owner IDs,
timestamps, random keys, request digests, revision numbers, and section counts.

Apply verifies the expected owner against the authenticated session before any
write. The browser also checks identity before saving and on focus/periodically
while reviewing, clearing the review after sign-out or an account change.
Apply is one transaction under the publication row lock. A stale revision returns
409 and the user refreshes existing values and reconfirms choices without another
AI call. Retries with the same key and body return the prior receipt; changed
bodies with the same key return 409. Idempotency receipts expire after 24 hours.

## Verification

```sh
uv run --project apps/api pytest apps/api/tests/test_resume_extraction.py
# From apps/api; TEST_DATABASE_ADMIN_URL must identify a local test server:
uv run pytest tests/test_resume_import_integration.py --run-integration
node --test apps/web/tests/resume-import.test.mjs
```

Full CI also runs lint, types, production build, all existing tests, and disposable
PostgreSQL migrations. Provider calls are mocked in CI. No live model-quality or
real-document end-to-end verification is claimed until performed explicitly.
