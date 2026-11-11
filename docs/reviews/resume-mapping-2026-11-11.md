# Resume → field mapping review

Date: 2026-11-11
Scope: read-only review of how a parsed resume maps into the portfolio's available fields.
Status: findings below are grounded in the exact extracted text of `resume.pdf` and in the
app's own grounding/validation logic executed locally. Live-preview confirmation is pending
(see "Preview confirmation").

## Method

- Read the mapping pipeline end to end: extraction → NVIDIA prompt/schema → evidence
  grounding → strict validation → review UI → apply.
- Extracted `resume.pdf` with the app's own `extract_document` (7,093 characters) so the
  source matches exactly what the provider receives.
- Ran the app's real `source_excerpt`, `ground_proposals`, and `validate_extraction`
  against that text with representative candidate payloads. No provider call was made and
  nothing was saved. Each "confirmed" finding below was reproduced by executing this logic.

## Available fields per section

From `apps/api/app/schemas/resume_import.py` (`VALUE_MODELS`) and mirrored in
`apps/web/src/lib/resume-import.ts` (`sectionFields`):

| Section    | Available fields                                                       |
| ---------- | ---------------------------------------------------------------------- |
| profile    | name, headline, introduction, about, location                          |
| contact    | email, phone                                                           |
| skills     | label, items[]                                                         |
| experience | role, organization, started, ended, current, description, highlights[] |
| education  | qualification, institution, started, ended                             |
| projects   | title, summary, technologies[], repository_url, demo_url               |
| links      | label, url                                                             |

## How mapping decides what survives

1. The provider returns candidates with `values` plus a source `evidence` quote per field
   (`resume_extraction.py:367`).
2. `ground_proposals` keeps a scalar field only if its evidence quote (or the value itself)
   is found in the source text, tolerating line-wrapping and case (`resume_extraction.py:188`).
   List items are filtered one-by-one the same way (`resume_extraction.py:200`).
3. `validate_extraction` re-checks that every retained field's evidence is an exact substring
   of the source and drops anything unverifiable, adding a warning (`resume_extraction.py:252`).
4. The review UI and `apply` then enforce format rules: `YYYY-MM` dates, http/https URLs,
   valid email, required fields (`resume_import.py:117`, `resume-importer.tsx:90`).

The design is deliberately conservative: a field that cannot be tied to an exact source span
is dropped rather than guessed. That is correct for trust, but it interacts with this resume's
formatting in ways that lose content. Findings are ordered by impact.

## Findings

### 1. Projects have no `highlights` field — project bullet detail is lost (High)

`ProjectValues` exposes only `title, summary, technologies, repository_url, demo_url`
(`apps/api/app/schemas/resume_import.py:54`, `apps/web/src/lib/resume-import.ts:79`).
Experience has `highlights[]`, but projects do not.

This resume is project-heavy: most projects carry 3–5 detailed achievement bullets
(e.g. the Medallion/dbt warehouse, the Snowflake ELT platform, the AdventureWorks ETL/BI
project). Those bullets have no target field. They can only be:

- compressed into `summary`, which is capped at 1,000 characters and must be a verbatim
  source span (see finding 6), or
- emitted as `not_imported` notes.

Impact: the richest content in this resume — quantified project achievements — is the least
representable. This is a schema gap, not a model error.

### 2. PDF letter-spacing makes some skill items fail evidence grounding (High, confirmed)

The source PDF renders one skill with per-letter positioning, so extraction yields
`M e d a l l i o n  A r c h i t e c t u r e` rather than `Medallion Architecture`.

Executed against the real text:

- `source_excerpt("Medallion Architecture", text)` → **None** (dropped)
- `source_excerpt("M e d a l l i o n  A r c h i t e c t u r e", text)` → found

So if the model normalizes the item to readable text (the desirable output), grounding drops
it; if it echoes the spaced text, it survives but displays poorly. A full skills candidate run
through `validate_extraction` kept `Google BigQuery` and `Snowflake` but omitted
`Medallion Architecture` with the warning "Some list items were omitted because their wording
could not be verified."

Root cause is the interaction of `extraction_mode="plain"` (`resume_extraction.py:54`) with
`source_excerpt`'s whitespace-only normalization (`resume_extraction.py:176`), which collapses
whitespace but cannot re-join letters split by spaces.

### 3. Scheme-less demo URL passes grounding but fails URL validation (Medium, confirmed)

The first project lists `Live Interactive App: tech-job-market-dashboard-five.vercel.app`
with no `https://`. Executed:

- `source_excerpt("tech-job-market-dashboard-five.vercel.app", text)` → found (survives grounding)
- `source_excerpt("https://tech-job-market-dashboard-five.vercel.app", text)` → None

But `safe_values` and the review UI require an http/https scheme
(`resume_import.py:131`, `resume-importer.tsx:114`). So the value that survives grounding is
rejected at review/save, and the value that would pass validation cannot be grounded. The user
must manually add `https://` in the review textarea. The URL line-wrap special case
(`resume_extraction.py:229`) only helps URLs that already include a scheme in the source.

### 4. Date normalization is not instructed by the prompt (Medium, confirmed behavior)

The resume uses month-year dates (`Oct 2021 – Oct 2022`, `June 2019 – Feb 2021`,
`May 2017 – Dec 2017`, `June 2001 – May 2005`). Apply/review require `YYYY-MM`
(`resume_import.py:147`, `resume-importer.tsx:97`).

The logic _can_ map these cleanly: a candidate with `started="2021-10"` and
`evidence="Oct 2021"` survives `validate_extraction` (confirmed), because grounding checks the
evidence quote, not the normalized value. However, the prompt only says "Keep year-only dates
as years and warn they need review" and "Never invent facts or dates"
(`resume_extraction.py:385`); it never explicitly instructs month-year → `YYYY-MM`
normalization. Whether dates arrive usable therefore depends on model behavior. If the model
echoes `Oct 2021` as the value, it grounds fine but fails the `YYYY-MM` check and needs manual
correction.

### 5. `current=false` is dropped without evidence (Low, confirmed)

For past roles the model may emit `current=false`. `ground_proposals` removes a boolean
`current` whose evidence is not found and warns "Whether this role is current was not verified"
(`resume_extraction.py:240`). Confirmed: an experience candidate with `current=false` and no
`current` evidence lost the field. This does not block saving (an `ended` date is present and
`apply` defaults `current` to false), but the review shows "Not determined" instead of
"Past role".

### 6. Project `summary` must be a verbatim span ≤ 1,000 chars (Low, confirmed)

`summary` is capped at 1,000 characters (`resume_import.py:56`) and must be an exact source
substring. Confirmed: a paraphrased/truncated summary was dropped ("Fields omitted because
their source evidence could not be verified: summary"), while a verbatim contiguous span
survived. Consequence: the model cannot compose a summary from scattered sentences, and any
summary longer than 1,000 characters cannot be fully imported. Combined with finding 1, this
squeezes project detail further.

### 7. `introduction` vs `about` ambiguity (Low)

Profile has both `introduction` and `about` (`resume_import.py:18`), and the preview renders
both (`resume-document.tsx:94`). The resume has a single PROFESSIONAL SUMMARY paragraph. The
model may place it in either field. Publishing requires `introduction` specifically
(`resume-importer.tsx:439`), so if the summary lands only in `about`, the publish-readiness
check flags `introduction` as missing even though the content exists.

## What maps reliably

Grounded checks and the source text indicate these map cleanly for this resume:

- profile: `name` (case-normalization is tolerated by IGNORECASE grounding), `headline`,
  `location` (line-wrap tolerated).
- contact: `email`, `phone`.
- links: the header "Online Resume" URL, even though `https://` wraps to the next line — the
  URL special case grounds it (confirmed).
- skills: group `label` and most `items` (except letter-spaced ones, finding 2).
- experience: `role`, `organization`, verbatim `highlights`, and dates when normalized
  (finding 4). `description` is typically empty here because the source uses bullets.
- education: `qualification`, `institution`, dates when normalized.
- projects: `title`, grounded `technologies`, `repository_url`, and verbatim `summary`.

Unsupported content is routed to `not_imported` notes rather than silently discarded, which is
the intended safety net.

## Preview confirmation

The linked preview (`/admin/preview`) requires production sign-in; the in-app browser has no
production session and redirected to `/auth/signin`. The findings above are therefore grounded
in the exact source text plus the app's executed grounding/validation logic, not in the rendered
preview. To confirm which gaps actually manifested in the saved draft, sign in to the preview
and this review can be reconciled against the populated fields.

## Recommendations (not applied — review is read-only)

Highest value first:

1. Add a `highlights[]` field to projects (schema + review UI + apply) so project achievement
   bullets have a home. This addresses the largest content loss for this resume.
2. Make `source_excerpt` tolerant of per-letter spacing (collapse single-letter space runs)
   so normalized skill items like "Medallion Architecture" can ground.
3. In the prompt, explicitly instruct month-year → `YYYY-MM` normalization with the original
   span as evidence, and instruct adding `https://` to scheme-less URLs while keeping the
   original span as evidence (extend the URL grounding special case to match scheme-less hosts).
4. Clarify `introduction` vs `about` in the prompt (e.g. summary → `introduction`) so the
   publish-readiness check is not surprised.

No code was changed. Fixes await explicit approval.
