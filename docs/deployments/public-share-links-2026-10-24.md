# Public share links — 2026-10-24

Frontend deployment `dpl_GPP6UHLQ8uBewJgW86MY38R6kwFh` was built and promoted to
<https://online-portfolio-datanerdbytes-4121.vercel.app> after staged checks passed.

The homepage has **Share portfolio**, `/resume` has **Share resume**, and each
`/u/<userId>` portfolio has its own share button. Buttons copy a public URL using
the current origin and the explicit public path, without query strings or
fragments. Successful requests show **Link copied** with accessible feedback.
Clipboard errors reveal a selectable link for manual copying. Print controls
continue to hide these actions in resume printouts.

All 68 existing frontend tests, type checking, secret scanning and ESLint passed
(the existing avatar image warning remains). The hosted Turbopack build passed;
the staged resume returned 200 with the new button. Browser checks on both local
and live resume pages showed the copy-success confirmation. The browser tool's
separate clipboard reader returned empty, so it did not independently verify the
system clipboard contents. Authentication, API and database settings were not
changed. Work remains uncommitted locally.
