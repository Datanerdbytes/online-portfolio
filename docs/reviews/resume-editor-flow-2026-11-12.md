# Resume editor flow review

Date: 2026-11-12
Scope: read-only UX/UI review of the private resume editor (`/admin/resume` and related
`/admin/**` surfaces) — how the editing flow works today and where it can be streamlined.
Status: findings grounded in the current code at commit `db87c68`; every citation was read
and verified directly. No code was changed and nothing was saved.

## Method

- Read the full wizard (`resume-wizard.tsx`, `resume-wizard.ts`), stepper (`step-nav.tsx`),
  section editors (`resume-sections.tsx`), project manager (`project-manager.tsx`), the
  workspace overview (`admin/page.tsx`), and the publication controls.
- Cross-checked the backend contracts (`apps/api/app/schemas/resume.py`) against what the
  manual editors actually expose.
- Mapped the complete user journey: sign-in → overview → wizard steps → import review →
  preview → publish.

## The current flow in one paragraph

The editor is a 7-step wizard on one route (`/admin/resume?step=…`): Profile → Skills →
Projects → Experience → Education → Contact → Review, with a free-jump horizontal stepper
and a sticky Back/Next footer. Every record is saved explicitly (per-field, per-item, per
entry), with a three-stage mental model repeated in copy after nearly every action
("Draft saved. Publish to update your public portfolio."). Publishing happens only on
`/admin/preview` for first-time users, with a conditional inline publish button on the
Projects step. Resume import overlays the same wizard with a review mode; the AI writing
assistant exists only inside that review mode.

## Findings, ordered by impact

### 1. Save friction: every edit costs a request, a button, and a message (High)

There is no auto-save and no step-level save; each record has its own explicit action:

- "Save profile" — `resume-sections.tsx:314`
- Inline "Save" per skill group and per skill item — `resume-sections.tsx:508`, `536`
- "Add entry"/"Save" per experience row — `resume-sections.tsx:935`, `1015`
- "Add entry"/"Save" per education row — `resume-sections.tsx:1234`, `1287`
- "Save contact" — `resume-sections.tsx:1630`
- "Create project"/"Save project details" — `project-manager.tsx` (form footer)
- "Save order" — `project-manager.tsx:992`

Editing 10 skill items means 10 saves and 10 network requests. Worse, the Projects step
mixes three save models in one screen: screenshot uploads auto-save to the draft while
field edits need a button, and ordering needs a separate "Save order" button
(`project-management.ts` even carries a message explaining the mismatch,
`PROJECT_NO_CHANGES_MESSAGE`). Users must learn per-widget semantics.

Meanwhile the post-save copy "Draft saved. Publish to update your public portfolio."
appears after nearly every action (12+ occurrences in `resume-sections.tsx` and
`project-manager.tsx`), re-teaching the draft→preview→publish model on every keystroke of
work. Publication state itself is never visible inside `/admin/resume`, so the repeated
copy substitutes for a status display.

**Streamline to:** one save per step (a footer-level "Save changes" that persists all
pending edits in the step), or debounced auto-save with a "Saving…/Saved" indicator. One
save model per step; the order save merges into the same action (persist on move). Drop
the repeated publish tutorial copy in favor of a persistent draft/publish status control.

### 2. Unsaved manual edits can be silently discarded (High, data loss)

The dirty-state system is split in two:

- Manual steps use a DOM-snapshot heuristic (`snapshotOf`, `resume-wizard.tsx:90-100`,
  baseline reset at `175-177`); Projects uses a semantic flag (`projectsDirty`, `173`).
- The global link-click interceptor and `beforeunload` guard are installed **only** when
  `flow.dirty` (import review) — `resume-wizard.tsx:205-229`.
- The step-change `window.confirm` covers only in-wizard `go()` — `resume-wizard.tsx:231-246`.

Consequences, all reachable today:

- Clicking top-nav "Overview"/"Preview" (`site-frame.tsx:34-67`) with unsaved profile or
  skills edits discards them with no prompt — the interceptor is not armed for manual dirt.
- Browser Back triggers `popstate` → `setStep` (`resume-wizard.tsx:195-203`) with no dirty
  check at all.
- Closing the tab with unsaved manual edits is silent (`beforeunload` only for `flow.dirty`).
- If the resume fetch fails, the page still says "editing remain available"
  (`admin/resume/page.tsx:46-51`) but `ProfileTab` initializes from `profile ?? null`
  (`resume-sections.tsx:222-228`) → empty fields, and a blind "Save profile" would PATCH
  empty values over saved data.

The DOM snapshot also produces false positives: mounting an inline input (e.g. clicking
"+ Add skill", `resume-sections.tsx:570-614`) changes the snapshot without any user edit —
this was partially fixed in #34 for projects via the semantic flag, but the heuristic
remains for the other five steps.

**Streamline to:** one semantic dirty model per step (each section editor reports
"edited/clean"), one navigation guard that covers in-wizard navigation, top-nav links,
browser back, and tab close, and a visible "Unsaved changes" pill with Save/Discard in the
sticky footer so the guard almost never has to fire.

### 3. Content parity gaps: the app supports fields the manual editors don't expose (High)

The backend accepts experience `highlights` on create (`resume.py:148`, returned at
`resume.py:135`), and import review can populate them — but the manual Experience form has
no highlights input at all (`resume-sections.tsx:878-925`: Slug, Role, Organization,
Started, Ended, current checkbox, Description only). Achievement bullets — the strongest
content in a resume — are only enterable by importing a file.

Same pattern for AI writing: `writingLimits` covers `profile.headline`, `profile.about`,
`profile.introduction`, `experience.description`, `projects.summary`
(`ai-writing-assistant.tsx:7-11`), but the assistant renders only inside import review
(`review-panel.tsx:200-217`). A user who types their resume manually never sees the
feature — the two editor modes have different capabilities for identical fields.

**Streamline to:** add a structured highlights (bullets) editor to experience; extract the
AI writing affordance so the same five fields offer it in both modes.

### 4. Form ergonomics demand developer jargon (Medium)

- Experience and education require a hand-typed "Slug (URL-safe id, e.g. company-role)"
  (`resume-sections.tsx:880`, `1206`). Projects validate a slug regex only on submit
  (`project-manager.tsx:355`) — the error appears after the fact.
- Dates are free-text "YYYY-MM" inputs (`resume-sections.tsx:883-884`, education
  `1204-1224`); format rules live in the import pipeline and the backend, so manual users
  discover `YYYY-MM` only via a server error.
- Contact email is not client-validated in the manual tab (the import pipeline validates
  it, `lib/resume-review.ts:125-164` — the validation logic exists but is not reused).

Slugs are system bookkeeping (and mostly invisible — `import-*` slugs are already hidden
in the UI, `project-manager.tsx:831-833`). Asking non-technical users to author URL-safe
IDs is friction with no user-visible payoff.

**Streamline to:** auto-generate slugs from role/organization/title, keep an optional
"Advanced" edit affordance; use `type="month"` inputs (or paired month/year selects);
reuse `lib/resume-review.ts` validators client-side.

### 5. Wizard sequence doesn't match authoring reality (Medium)

The step order is Profile → Skills → Projects → Experience → Education → Contact
(`resume-wizard.ts:12-20`). Resume authors naturally write Profile → Experience →
Education → Skills → Projects → Contact; being asked for Skills and Projects before the
work history that feeds them is backwards. The overview compounds this: the "Tell your
story" card says "Add experience or a project…" but deep-links to
`?step=projects` (`admin/page.tsx:26-31`) — the copy promises experience first, the link
delivers projects.

Also in the stepper: status text mapping is confusing — a section with status `optional`
displays "Review" and `empty` displays "Optional" (`step-nav.tsx:19-20`), so two different
states read as near-synonyms. And the 7-column grid with `min-w-[48rem]`
(`step-nav.tsx:40`) always scrolls horizontally below ~800 px, against a page that is
otherwise responsive.

**Streamline to:** reorder `STEPS` to the authoring order (deep links like `?step=projects`
keep working; only display order changes), align the overview card copy/link, and make the
stepper wrap on narrow screens with distinct status labels.

### 6. Publishing is split across surfaces with different visibility rules (Medium)

- First-time publish is possible only from `/admin/preview` (`publication-controls.tsx`);
  the Review step offers just a "Preview portfolio" link (`resume-wizard.tsx:735-737`).
- The inline `PublishChangesButton` lives only in the Projects list footer
  (`project-manager.tsx:994`) and only renders when already published with unpublished
  changes (`publish-changes-button.tsx:28-33`) — invisible to first-time publishers.
- The preview document is server-rendered; after editor saves the user must click
  "Refresh preview" (`publication-controls.tsx:116-123`); the preview page's remount key
  reacts to status changes, not content changes (`admin/preview/page.tsx:43-46`).

The state machine is honest but its controls are scattered: draft/publish status lives on
the Overview banner (`admin/page.tsx:63-77`), publish lives on Preview, a second publish
surface lives in Projects, and the editor itself shows none of it.

**Streamline to:** one persistent publication control in the editor (banner or footer):
"Private draft / Live · N unpublished changes" with Publish and Preview actions, reusing
the `PublishChangesButton` logic. Auto-refresh preview on return (`staleTime`/focus
refetch) instead of a manual button.

### 7. Deletion and confirmation patterns are inconsistent (Medium)

- Skill item delete fires immediately with no confirm (`resume-sections.tsx:560-562` →
  `handleDeleteItem`, `451-466`) while group delete uses `ConfirmDialog` (`684-695`) and
  experience/education/contact-link/project deletes all confirm.
- Three confirm patterns coexist: `window.confirm()` (wizard navigation, discard —
  `resume-wizard.tsx:215-221`, `237-241`, `678-683`), the styled `ConfirmDialog`
  (`confirm-dialog.tsx`), and a hand-rolled native `<dialog>` with a manual focus trap in
  ProjectManager (`project-manager.tsx:1005-1078`).

**Streamline to:** one confirm component everywhere; confirm (or undoable) deletes for all
records, including skill items.

### 8. Feedback is inconsistent and transient (Low-Medium)

- Save messages are a single transient `<p>` per tab with no consistent live-region role:
  the experience form's message has no `role` (`resume-sections.tsx:926-932`), some
  controls use `role="alert"`/`role="status"`, others plain text.
- No admin `loading.tsx` skeletons (only the public `/resume` route has one); the wizard's
  `useResume` refetch shows no visible indicator (`resume-wizard.tsx:121-124`).
- Import progress is a single text line "Reading document · 12s elapsed"
  (`resume-wizard.tsx:814-817`) — honest but bare; the only affordance is Cancel.

**Streamline to:** a shared status/toast surface with consistent `role="status"`/`alert`
semantics; skeleton states for admin pages; a determinate import progress meter if the
streaming stage events can drive one.

### 9. Import integration rough edges (Low)

- The profile step's "Import a resume" button is silently `disabled={!context}`
  (`resume-wizard.tsx:479-486`); the explanation ("Resume import is unavailable…") appears
  only on the Review step (`752-757`).
- Staleness handling requires "Refresh existing values" + full reconfirmation of every
  selection after any draft change elsewhere (`use-import-flow.ts:315-339`,
  `resume-wizard.tsx:626-637`) — correct for safety but repetitive.

**Streamline to:** an adjacent inline note when import is disabled; consider preserving
field-level selections through `refresh()` where the underlying value did not change.

## What works well (keep)

- Free-jump stepper + deep-linkable `?step=` state with focus management on step change
  (`resume-wizard.tsx:245`, `824-831`); sticky footer with live section-completion count.
- Honest draft-vs-published separation and typed, friendly per-status error copy
  (`lib/project-queries.ts:32-46`, `71-83`).
- Evidence-based AI writing with consent, sanitized facts, and explicit "review and edit
  before using" — a strong pattern worth extending (Finding 3).
- Import safety: idempotent apply keys, `expected_owner_id`, session-mismatch protection,
  review-lives-in-this-tab disclosure.
- Empty states in import review for every section; honest placeholder labeling throughout
  the public document.

## Target model: "edit like a document, publish like a release"

The streamlining thesis: **editing should feel like filling in one private document;
publishing is the only deliberate act.** Concretely:

1. **One save per step** (or autosave) instead of per-record saves; one save semantics per
   step; the Projects order-save merges into it.
2. **One dirty model** guarding every exit (in-wizard, top nav, browser back, tab close),
   surfaced as a footer "Unsaved changes · Save · Discard" pill rather than surprise
   dialogs.
3. **Authoring-shaped forms**: auto-slugs, month inputs, structured bullet lists
   (experience highlights), client validation reused from `lib/resume-review.ts`.
4. **Publication state in the editor**: a persistent "Private draft / Live · N unpublished
   changes" control with Preview and Publish one click away.
5. **Capability parity between modes**: AI writing on the same five fields in manual and
   import review; highlights editable in both.
6. **Consistent primitives**: one confirm dialog, one status surface, skeletons on admin
   routes.

## Prioritized roadmap

| Priority | Change                                                                   | Effort | Key files                                            |
| -------- | ------------------------------------------------------------------------ | ------ | ---------------------------------------------------- |
| P0       | Unified dirty model + guard all exits (top nav, back, unload)            | M      | `resume-wizard.tsx`, `site-frame.tsx`                |
| P0       | Confirm skill-item deletes; single confirm component                     | S      | `resume-sections.tsx`, `confirm-dialog.tsx`          |
| P1       | Step-level "Save changes" (batch existing per-record mutations)          | M      | `resume-sections.tsx`, `lib/project-queries.ts`      |
| P1       | Publication control in the editor + auto-refresh preview                 | M      | `resume-wizard.tsx`, `publish-changes-button.tsx`    |
| P1       | Auto-generated slugs; optional advanced edit                             | S      | `resume-sections.tsx`, `project-manager.tsx`         |
| P1       | Month inputs for dates + client validation reuse                         | S      | `resume-sections.tsx`                                |
| P2       | Experience highlights editor (manual mode)                               | M      | `resume-sections.tsx`, `lib/api.ts`                  |
| P2       | AI writing assist on the five fields in manual editors                   | M      | `ai-writing-assistant.tsx`, `resume-sections.tsx`    |
| P2       | Step order + overview card alignment; stepper responsive/status labels   | S      | `resume-wizard.ts`, `step-nav.tsx`, `admin/page.tsx` |
| P3       | Empty states (experience/education), `role` consistency, admin skeletons | S      | `resume-sections.tsx`, `app/admin/**`                |
| P3       | Explain disabled import inline; preserve selections through refresh      | S      | `resume-wizard.tsx`, `use-import-flow.ts`            |

Tracker issues for the actionable items: `.scratch/resume-editor-flow/`.
