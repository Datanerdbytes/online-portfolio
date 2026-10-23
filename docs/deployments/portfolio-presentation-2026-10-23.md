# Personal portfolio presentation — 2026-10-23

The homepage continues to show the owner's personal resume and projects. The
user explicitly chose to keep public registration open. Neon signup and email
verification settings were not changed by this release.

## Presentation changes

- Removed Admin from the personal portfolio's primary navigation.
- Added secondary footer links for **Build your own portfolio** and
  **Editor sign in**.
- Added `/build-your-portfolio`, explaining the existing features, blank-account
  starting point, public visibility, email verification and sharing flow.
- Standardized sign-in, registration, forgot-password, new-password and email
  verification pages using one shared `AuthPanel`, field styles and feedback.
  Confirmation and invalid-reset-link screens use the same design.
- Removed the large account sidebar at the user's request. Account pages and
  named public portfolios use the full page width with a compact top bar. Editors
  retain resume/projects navigation, without a redundant Sign in link.
- Added a theme control to the compact header. The personal portfolio keeps its
  existing sidebar, theme and content.

## Release and verification

Frontend deployment: `dpl_8gWrSscsyXdgb8hzqkThH5kY7Yqr`.
Deployment URL: <https://online-portfolio-lj1vbxkyt-datanerdbytes-4121.vercel.app>.
Canonical domain: <https://online-portfolio-datanerdbytes-4121.vercel.app>.

The production Turbopack build, all 68 frontend tests, TypeScript, secret scanning
and ESLint passed; ESLint retains the existing profile-avatar image warning.
Staged homepage and sign-in requests returned 200. HTML checks confirmed the
personal identity, footer links, shared form card, compact header and removed
account sidebar. Local browser inspection covered the introduction, sign-in,
registration, password recovery and new-password form, including light and dark
mode. No account was created and no password was changed during these visual
checks. A synthetic, nonfunctional token was used only to display the new-password
form. Narrow layouts use wrapping navigation and stacked cards; a separate mobile
browser session was not available for visual verification.

After promotion, a signed-in browser loaded the live resume editor with its
existing profile and images, full-width content and compact editor navigation.
The large blue sidebar was absent. The live sign-in form also rendered with the
shared card and compact header.

The earlier presentation-only deployment `dpl_GxFhMr5mhyQ7RPwQxHnorVQye7Bj` was
left unpromoted when the user added account design and sidebar changes. No API
deployment or database migration was needed. Work remains uncommitted locally.
