# Contextual verification guidance — 2026-10-24

The initial removal below was superseded by the account holder's decision to
retain the visible link. See the follow-up at the end of this record.

Removed the always-visible email verification link from the sign-in form. It
suggested verification was a routine step for existing, verified accounts.
The default form now presents sign-in, password recovery, and registration.

An explicit unverified-email rejection shows a **Continue email verification**
action beside its explanation. The submitted email is saved using the same
session-storage convention as registration so the verification page can pre-fill
it. Generic forbidden requests do not show email-verification guidance.

## Release

- Vercel team: `datanerdbytes-4121`.
- Project: `online-portfolio` (`prj_WO8baqdRYXxlA5aayCSvRggsmu53`).
- Deployment: `dpl_8JKVRQa1jd8q7dTfEhiMsDzCdBhi`.
- Production: <https://online-portfolio-datanerdbytes-4121.vercel.app>.
- Built with production configuration using `--skip-domain`, checked on its
  protected deployment URL, then promoted without rebuilding.
- Based on local commit `af66e6a` plus the uncommitted sign-in change. No Git
  commit or push was performed.

## Verification

- TypeScript and focused ESLint passed.
- All 38 existing auth tests passed.
- Hosted Next.js Turbopack production build passed.
- Staged HTML checks confirmed that the default sign-in form omits the
  verification link and retains registration and password recovery. Registration
  and verification forms, including code entry and resend, remain available.
- Existing deployment smoke checks passed for the public homepage, API health,
  public resume, and public projects.
- Live HTTP and browser checks confirmed the published default sign-in form.
- The permanent alternate-domain redirect still returns 308 and preserves the
  sign-in destination query string.

The conditional unverified-account interaction was not exercised using a new
live account. Existing route tests cover provider failures and verification
rejections; they do not exercise the client form interaction.

## Email customization decision

The production branch uses Neon's shared email sender. Its default templates
cannot be edited to add a return-to-verification link. Custom email content
requires an email-delivery webhook and a transactional email provider; the
webhook replaces Neon's default delivery. The account holder confirmed they do
not have a custom provider and requested keeping the verification link on the
sign-in form. Custom email delivery is therefore out of scope. No email delivery
settings were changed. See [Neon's customization guide](https://neon.com/docs/auth/guides/customize-emails).

## Follow-up: retain the visible verification link

Restored **Verify your email or request a new code** below the sign-in button,
as requested. The improved distinction between an unverified-email rejection
and a generic forbidden request remains, along with the email pre-fill when an
unverified account tries to sign in. Existing verified users can sign in normally;
opening the link is optional.

Published deployment `dpl_Goo5DbfSqbQt3wkYo3YQeXtbRnWf` after its production build,
TypeScript, and focused ESLint passed. A staged HTML check confirmed exactly one
verification link, and the four existing public deployment smoke checks passed.
After promotion, live HTTP checks confirmed that the sign-in page contains the
restored link and that its verification destination loads with code entry and
resend controls. No additional account or email mutations were needed for these
checks.
