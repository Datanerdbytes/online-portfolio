# Production authentication domain redirect — 2026-10-24

Password recovery at `online-portfolio-two-swart.vercel.app` returned HTTP 403
with `{"detail":"Request not permitted"}` before contacting Neon. The deployed
`ADMIN_WEB_ORIGIN` accepted `https://online-portfolio-datanerdbytes-4121.vercel.app`.
Serving the application on both domains allowed visitors to load account forms
on an origin that could not submit them.

## Applied configuration

Updated Vercel project `online-portfolio` (`prj_WO8baqdRYXxlA5aayCSvRggsmu53`)
in team `datanerdbytes-4121` (`team_aWWXAsZiAMPGuRFGhIqQyyFA`):

- Registered the existing canonical alias,
  `online-portfolio-datanerdbytes-4121.vercel.app`, as a verified project domain.
- Set `online-portfolio-two-swart.vercel.app` to redirect to that domain with
  HTTP **308 Permanent Redirect**.

Both domains were verified to belong to this project and the same ready
production deployment, `dpl_9r8HhSmNZTTd33wG4wRQs9aHaiKY`, before changing
configuration. This fix is stored in Vercel's project domain settings and does
not require an application rebuild. Authentication origin checks remain intact.

Keep the canonical domain attached to this project and retain the alternate
domain's redirect when managing domains or future releases. A future canonical
domain change must coordinate `ADMIN_WEB_ORIGIN`, Neon's trusted origins, and
the redirect destination.

## Verification

- Live GET requests to `/`, `/auth/forgot-password`, `/auth/signin` with a `next`
  query, and `/auth/reset-password` with a synthetic token query returned 308
  with the exact canonical destination, preserving each path and query string.
- The canonical recovery form returned HTTP 200.
- A canonical same-origin POST with an empty JSON body reached input validation
  (HTTP 400 `Invalid request`), rather than the former origin rejection (403).
  This probe sends no email.
- Browser navigation through the formerly broken reset URL reached the
  canonical recovery form.
- Before this configuration change, submitting the account email on the
  canonical recovery form produced the expected generic acknowledgment.
  Email delivery and password replacement were not verified during this fix;
  the account holder completes password entry and submission.

No application code, dependencies, database schema, or authentication provider
settings were changed. No automated application test suite was run because the
change is in Vercel domain configuration; verification exercised the live routes.
