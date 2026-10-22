# Profile picture upload: one owner-managed portrait

Status: proposed, not implemented. This plan describes how a single profile photo is
uploaded by the owner, stored by the API, and rendered in the two places that currently
show the owner's initials: the public sidebar monogram and the public hero.

Scope: one portrait, one owner, one upload control. Everything below is scoped to that.

Out of scope (deliberately not designed here): multiple photos, galleries, thumbnails
for projects, image cropping or resizing in the browser, CDN hosting, object storage
providers, image moderation, alt-text authoring by the owner, and per-section portraits.

## 1. Selected architecture: local file store behind a storage interface

Decision: the API owns the image bytes. The browser never uploads to a third-party
service and never reads a filesystem path. The Next.js app proxies the API, so the
browser only ever talks to its own origin.

| Concern | Choice | Why |
| --- | --- | --- |
| Where bytes live | Local filesystem under `MEDIA_ROOT`, default `apps/api/media` | Matches the single-server deployment this repo targets today; no new service to provision |
| How the API reaches it | `ProfileImageStore` interface in `apps/api/app/core/storage.py`, with `LocalProfileImageStore` as the only implementation | Keeps route code independent of the storage mechanism, so an object-store implementation is a later swap, not a rewrite |
| Who calls the API | Browser → Next.js route handler → FastAPI | One origin for the browser; the API base URL stays server-only (`API_BASE_URL`), matching the existing catch-all proxy |
| How the browser learns the URL | `ProfileResponse.avatar_url` + `avatar_updated_at` | One source of truth; the UI never guesses a path |
| Cache invalidation | `?v=<avatar_updated_at epoch>` query parameter | Changes the URL only when the bytes change, so `ETag`/`304` still work |

Request flow:

```text
Browser (admin)            Next.js route handler                FastAPI
  |  PUT multipart (Bearer)      |                                  |
  |---------------------------->| validateMutation + readAdminToken  |
  |                             |  POST multipart (Bearer) -------->|
  |                             |                                  | validate type/size/magic bytes
  |                             |                                  | write file, update profile row
  |                             |<----------- 200 ProfileResponse --|
  |<----------- 200 JSON --------|                                  |

Browser (public)           Next.js route handler                FastAPI
  |  GET /api/resume/profile/avatar?v=...                           |
  |---------------------------->|  GET /api/v1/resume/profile/avatar |
  |                             |--------------------------------->| read file, ETag
  |                             |<---------- bytes + ETag ----------|
  |<---------- image bytes ------| (Cache-Control forwarded)
```

## 2. Storage contract

### 2.1 Interface

New module `apps/api/app/core/storage.py`:

```python
class ProfileImageStore(Protocol):
    def save(self, data: bytes, content_type: str) -> str: ...
    def read(self, filename: str) -> bytes: ...
    def delete(self, filename: str) -> None: ...
    def path_for(self, filename: str) -> Path: ...
```

`save` returns the stored filename (not a path). `read` and `delete` raise
`ProfileImageNotFound` when the file is missing; `path_for` never escapes `MEDIA_ROOT`.

### 2.2 `LocalProfileImageStore`

- Root: `settings.MEDIA_ROOT`, created on demand with `mkdir(parents=True, exist_ok=True)`.
- Layout: flat directory, one file per avatar. `MEDIA_ROOT/`.
- Filename: `{uuid4().hex}.{ext}` where `ext` is derived from the *detected* content
  type, never from the client-supplied filename or content-type header.
- Extension mapping: `image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp`.
- Writes are atomic: write to a temporary file in the same directory, then `os.replace`
  into place. A crashed write never leaves a half-written avatar.
- `path_for` resolves the filename and asserts the resolved path is inside `MEDIA_ROOT`
  (`Path.resolve()` + `is_relative_to`), so a poisoned database value cannot be used
  to read or delete arbitrary files.

### 2.3 Replacement and deletion

Replacing an avatar is: write the new file → update the profile row → delete the old
file. If the profile row update fails, the newly written file is removed and the old
avatar stays intact. The old file is only unlinked after the new metadata is committed,
so a crash leaves a stale orphan file rather than a dangling database reference.

Deleting an avatar clears the three profile columns and then removes the file. If the
file is already missing, the operation still succeeds (metadata is the source of truth).

### 2.4 Failure modes

| Situation | Behaviour |
| --- | --- |
| `MEDIA_ROOT` not writable | `PUT` → 503 `Avatar storage unavailable`; `GET` → 503 |
| File referenced by metadata is missing | `GET` → 404 `Avatar not found` |
| File referenced by metadata is unreadable (permissions/corruption) | `GET` → 503 `Avatar storage unavailable` |

No filesystem path, filename, or exception text is ever returned in a response body.
Error details go to the server log only.

## 3. Data model and migration

### 3.1 Profile columns

Add three nullable columns to the existing single-row `profile` table
(`apps/api/app/models/resume.py`):

| Column | Type | Null | Meaning |
| --- | --- | --- | --- |
| `avatar_filename` | `String(255)` | yes | Stored filename inside `MEDIA_ROOT`; never exposed in JSON |
| `avatar_content_type` | `String(100)` | yes | Detected content type, e.g. `image/png` |
| `avatar_updated_at` | `DateTime(timezone=True)` | yes | When the current bytes were written; drives cache busting |

All three are `NULL` when no avatar exists. The absence of an avatar is expressed by
the absence of metadata, never by a sentinel filename.

### 3.2 Migration

- New revision: `a1b2c3d4e5f6_add_profile_avatar.py`
- `revision = "a1b2c3d4e5f6"`, `down_revision = "977ea8ea2a16"` (the current head,
  `977ea8ea2a16_add_resume_content_tables.py`)
- `upgrade()`: `op.add_column` for each of the three columns, all nullable, no server
  default. No table is created or dropped.
- `downgrade()`: `op.drop_column` for the three columns in reverse order.
- No data migration: existing profiles simply have no avatar.

### 3.3 API representation

`ProfileResponse` (`apps/api/app/schemas/resume.py`) gains:

| Field | Type | Notes |
| --- | --- | --- |
| `avatar_url` | `str \| None` | Canonical backend-relative URL `/api/v1/resume/profile/avatar`, or `null` when no avatar exists |
| `avatar_updated_at` | `datetime \| None` | ISO-8601 timestamp, used for cache busting |
| `avatar_content_type` | `str \| None` | Detected type, e.g. `image/png` |

`avatar_filename` is deliberately **not** part of any response schema.

`ProfilePatch` is unchanged: avatar state is changed only through the upload and
delete endpoints, never through a JSON text patch. This keeps "the owner edited the
bio" and "the owner replaced the photo" as separate, separately audited operations.

The `ResumeResponse` embeds `ProfileResponse`, so the full-resume read picks the new
fields up automatically.

## 4. Upload validation and image safety

The endpoint accepts an owner-supplied file. Validation is explicit and ordered; the
first failure wins and no file is written on failure.

### 4.1 Accepted types

| Content type | Extension | Detection |
| --- | --- | --- |
| `image/jpeg` | `.jpg` | First three bytes are `FF D8 FF` |
| `image/png` | `.png` | First eight bytes are `89 50 4E 47 0D 0A 1A 0A` |
| `image/webp` | `.webp` | Bytes 0-3 are `RIFF` and bytes 8-11 are `WEBP` |

Anything else is rejected. The stored content type is the *detected* type, not the
client's `Content-Type` header and not the file extension.

### 4.2 Size limit

- `MAX_AVATAR_BYTES`, default `2097152` (2 MiB).
- Enforced twice: on the declared length when the client provides one, and on the
  bytes actually read.
- Over the limit → 413 `Avatar too large`.

### 4.3 Validation order

1. Owner authentication → 401 (existing bearer behaviour).
2. Multipart body present and the `file` part exists → 400 `Invalid request`.
3. Declared content type is in the allowlist → 400 `Unsupported image type`.
4. Declared size within `MAX_AVATAR_BYTES` → 413 `Avatar too large`.
5. Payload is non-empty → 400 `Invalid request`.
6. Bytes actually read are within `MAX_AVATAR_BYTES` → 413 `Avatar too large`.
7. Magic bytes match one of the three allowed signatures → 400 `Unsupported image type`.

The declared content type is treated as a hint only; step 7 is authoritative, and a
mismatch between the declared type and the detected type is a rejection, not a silent
correction. This stops a caller from storing arbitrary bytes under an image content
type.

### 4.4 Filenames

The client filename is discarded. It is never used for the stored name, never echoed
back, and never used to derive the extension.

### 4.5 EXIF and metadata

The original bytes are stored and served unchanged. Consequence: EXIF, including
GPS coordinates, camera model, and timestamps, remains in the uploaded file and is
served to anyone who can fetch the avatar.

This is accepted for the first version because stripping it requires an image
library (Pillow), which is a new dependency plus a decode step on every upload and on
every serving path. The alternative — re-encoding every image to strip metadata —
also silently changes the owner's file.

Decision: ship with a documented limitation, and record the follow-up below. If the
owner uploads a photo taken on a phone with location tagging on, that location is
public.

Follow-up (separate plan, not this one): add Pillow, re-encode on upload to a
normalized format (and optionally strip EXIF), and keep the stored bytes derived
rather than original.

## 5. FastAPI contract

### 5.1 Router placement

New module `apps/api/app/api/v1/avatar.py` with a plain `APIRouter(tags=["avatar"])`,
registered in `apps/api/app/main.py` under the existing `/api/v1` prefix:

```python
app.include_router(avatar.router, prefix="/api/v1")
```

It deliberately does **not** use `route_class=AuthRoute`. `AuthRoute` (in
`apps/api/app/api/v1/auth.py`) sets `Cache-Control: no-store` on every response it
wraps, which would defeat the public caching of the avatar, and it rewrites
`RequestValidationError` into a generic 400 for the whole router. The avatar router
handles its own errors explicitly so that the public `GET` can be cacheable and the
upload errors can carry precise, non-sensitive messages.

Owner authentication reuses the same dependency as the resume router:
`verify_owner_token(authorization)` via `app.core.auth`.

### 5.2 Routes

| Method | Path | Auth | Success | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/resume/profile/avatar` | public | 200 image bytes | Serve the current avatar |
| `PUT` | `/api/v1/resume/profile/avatar` | owner bearer | 200 `ProfileResponse` | Upload or replace the avatar |
| `DELETE` | `/api/v1/resume/profile/avatar` | owner bearer | 204 | Remove the avatar |

`PUT` accepts `multipart/form-data` with a single part named `file`.

### 5.3 Public GET

- 200 with the raw bytes, `Content-Type` = the stored detected content type.
- `Content-Length` set to the byte length.
- `ETag` = a strong validator derived from the stored bytes (for example the SHA-256
  of the content, formatted as a quoted hex string).
- `Cache-Control: public, max-age=300, must-revalidate`.
- If the request carries a matching `If-None-Match`, respond 304 with the same
  `ETag` and `Cache-Control` and no body.
- 404 `Avatar not found` when the profile has no avatar metadata.
- 503 `Avatar storage unavailable` when metadata exists but the bytes cannot be read.

The endpoint is a process-liveness-style read of a stored file. It does not query
PostgreSQL for readiness beyond the single metadata row.

### 5.4 Authenticated PUT

- Requires `Authorization: Bearer <owner token>`; missing/invalid → 401.
- Reads the multipart body through `UploadFile`. In a synchronous route handler the
  file is read via `file.file.read()`; `await file.read()` is only valid in an
  `async def` handler. The route is synchronous (`def`), consistent with the rest of
  the resume router.
- Applies the validation order in section 4.3.
- Writes the file, updates the three profile columns (`avatar_filename`,
  `avatar_content_type`, `avatar_updated_at`), commits, then removes the previously
  stored file.
- Returns the updated `ProfileResponse`, so the admin UI can refresh from the response
  without a second request.
- `Cache-Control: no-store`.

### 5.5 Authenticated DELETE

- Requires the owner bearer token; missing/invalid → 401.
- Clears the three profile columns, commits, then removes the file.
- 204 with an empty body.
- 404 `Avatar not found` when no avatar is set (deleting nothing is not a success).
- `Cache-Control: no-store`.

### 5.6 Status codes

| Code | Meaning | Used by |
| --- | --- | --- |
| 200 | Success | `GET` (image bytes), `PUT` (profile JSON) |
| 204 | Avatar removed | `DELETE` |
| 304 | Not modified | `GET` with matching `If-None-Match` |
| 400 | Invalid request | Missing part, empty payload, unparseable multipart |
| 401 | Not authenticated | `PUT`/`DELETE` without a valid bearer token |
| 404 | No avatar / no profile | `GET` and `DELETE` when no avatar exists |
| 413 | Too large | Upload over `MAX_AVATAR_BYTES` |
| 503 | Storage unavailable | `MEDIA_ROOT` unreadable/unwritable, or bytes unreadable |

Existing `403` and `429` semantics elsewhere in the API are unchanged.

### 5.7 Dependency

`UploadFile` requires `python-multipart`. Add `python-multipart>=0.0.20` to
`apps/api/pyproject.toml` and regenerate `apps/api/uv.lock`. FastAPI raises at import
time if the package is missing, so the dependency must land in the same change as the
route.

## 6. Next.js proxy and browser contract

### 6.1 Why a dedicated route

The existing `apps/web/src/app/api/resume/[...path]/route.ts` catch-all is JSON-only:
it serialises bodies to JSON and parses responses as JSON. It cannot carry a multipart
body with its boundary, and it cannot return binary image bytes.

A dedicated route at `apps/web/src/app/api/resume/profile/avatar/route.ts` is
statically more specific than the catch-all and therefore takes precedence over it in
the App Router. The catch-all is left untouched and continues to serve the rest of
`/api/resume/*`.

The catch-all cannot be reused for any part of this feature. It reads the request
body with `await req.text()`, forces `Content-Type: application/json` on the upstream
request, and always answers with `Content-Type: application/json`. It also exports
only `GET`, `PATCH`, and `POST`, so `DELETE` is not routed at all. Binary responses,
multipart bodies, and the delete route therefore all require the dedicated handler.

### 6.2 Public GET

- `GET /api/resume/profile/avatar?v=<epoch seconds>`.
- Server-side only: the upstream base URL comes from `API_BASE_URL`, which stays
  server-only and is never exposed through a `NEXT_PUBLIC_` variable.
- Forwards `If-None-Match` upstream and returns 304 when the API answers 304.
- Forwards the upstream `Content-Type`, `Content-Length`, `ETag`, and `Cache-Control`.
- On upstream 404 → 404 with a JSON body (`{"detail":"Avatar not found"}`).
- On upstream 503 → 503 with a JSON body (`{"detail":"Avatar storage unavailable"}`).
- Never caches a failure response.

### 6.3 Authenticated PUT and DELETE

- `validateMutation(req)` then `readAdminToken()` from `apps/web/src/lib/auth.ts`,
  exactly as the other admin mutation routes do.
- Rejects with 403 when the request is not same-origin, when `x-requested-with` is not
  `online-resume-admin`, when `Sec-Fetch-Site` is not same-origin, or when
  `Sec-Fetch-Mode` is not `cors`.
- Forwards the `Authorization: Bearer <admin token>` header to the API. The admin
  token is a different token from the owner bearer token; the proxy exchanges it, so
  the browser never sees the owner token.
- **Forwards the multipart `Content-Type` header verbatim, including the boundary
  parameter.** Rewriting it to `application/json` breaks the multipart parse. The
  JSON-only helper in `apps/web/src/lib/api.ts` forces `Content-Type: application/json`
  and must therefore not be used for this request.
- Accepts a bounded body: reject when `Content-Length` exceeds
  `MAX_AVATAR_BYTES + multipart overhead` (the frontend budget is
  `MAX_AVATAR_BYTES + 64 KiB`), and cap the buffered body at the same limit.
- Buffers the body and forwards it as a `Uint8Array`/`Blob` with an explicit
  `Content-Length`. Streaming with `duplex: "half"` is possible in the Next.js runtime
  but is not used in the first version, because the size guard is simpler and safer
  with a bounded buffer.
- Maps upstream errors to the same status codes the API uses: 400, 401, 404, 413, 503.
- Mutation responses are sent with `Cache-Control: no-store`.

### 6.4 Browser URL and cache busting

- The `<img>` source is `/api/resume/profile/avatar?v=<avatar_updated_at epoch>`.
- `avatar_updated_at` changes on every successful upload, so the URL changes and the
  browser fetches the new bytes.
- `avatar_updated_at` is `null` when no avatar exists; in that case no `<img>` is
  rendered at all and the initials fallback is used.

## 7. Rendering

### 7.1 Shared component

New `apps/web/src/components/profile-avatar.tsx`:

```tsx
type ProfileAvatarProps = {
  src?: string | null;
  alt?: string;
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};
```

- Renders `<img src={src} alt={alt} />` when `src` is present, otherwise the initials
  fallback derived from `name`.
- Initials derivation: first letters of the first two whitespace-separated words of
  the profile name, uppercased. This replaces the current hard-coded monogram logic
  in `apps/web/src/components/header.tsx`.
- Portraits are decorative next to the owner's name, so the production usages render
  `alt=""` and add `aria-hidden="true"`. The admin preview may use a descriptive
  `alt` because it is not adjacent to the name.
- `loading="lazy"` and `decoding="async"` for the hero portrait.

The component is used by both the public UI and the admin preview, so the admin
preview cannot drift from what the public page renders.

### 7.2 Sidebar

`apps/web/src/components/header.tsx` currently renders the monogram in
`.sidebar-profile-top`. It gains a `profile` prop carrying the live profile data, and
renders `ProfileAvatar` instead of the monogram when an avatar exists.

### 7.3 Hero

`apps/web/src/app/page.tsx` renders the right-hand column that contains the
`DATA / WORKFLOW` card (`.data-illustration`). The plan adds a `.hero-visual` wrapper
around that column:

- Above the card, a circular portrait (`.hero-avatar`) rendered with `ProfileAvatar`.
- The portrait sits above the card and is right-aligned on wide layouts.
- Below 960px the hero grid collapses to a single column; the portrait then stacks
  above the card and stays full width.
- The hero keeps its current appearance when no avatar exists: the wrapper renders
  only the card, with no empty space reserved for a portrait.

### 7.4 Live data for the layout

`apps/web/src/app/layout.tsx` currently renders the sidebar from static content. It
becomes `async` and loads the live resume, passing the profile and contact data to
`Header`.

- The load reuses the existing `fetchResume()` from `apps/web/src/lib/api.ts`, which
  already applies a bounded timeout (`RESUME_TIMEOUT_MS = 5000`), sends
  `cache: "no-store"`, and returns `null` when the API is unavailable or slow.
- The result is normalised with the existing `resolveResume()`, which already falls
  back to the static profile and static contact when the API returns nothing.
- The fetch is wrapped in React's `cache()` inside a new server-only module
  `apps/web/src/lib/resume-server.ts`, so the layout and the page share one upstream
  request per render instead of issuing two.
- `apps/web/src/lib/api.ts` is imported by a client component
  (`apps/web/src/components/projects.tsx`) and therefore ends up in the client
  bundle. A `cache()`-wrapped helper cannot live there, because `cache` is a
  server-only React API and `react` in a client bundle would pull in the server
  entry. This is why the helper is a separate module.
- `server-only` is already available in this repo through `apps/web/src/lib/auth.ts`,
  so the new module can import it to enforce the boundary.
- If the API is unavailable, the layout falls back to the static content, so the page
  still renders with the initials monogram. The API outage must never blank the page.
- `apps/web/src/app/page.tsx` is switched to the same cached helper, so the hero and
  the sidebar render from one consistent snapshot.
- `generateMetadata` stays static and does not depend on the fetch.

### 7.5 Fallback content

`apps/web/src/lib/resume.ts` has a module-private `staticProfile()` that returns an
`ApiProfile` built from the generated content. If `ApiProfile` gains the avatar fields
as required properties, `staticProfile()` must supply
`avatar_url: null`, `avatar_updated_at: null`, and `avatar_content_type: null`.

The generated content itself does **not** gain avatar fields. The static
`Profile` type in `apps/web/src/content/resume-types.ts` and the generated
`apps/web/src/content/resume.ts` describe text content, and a portrait cannot be
represented in a generated text snapshot. The fallback must also never point at a
file that does not exist.

Consequence: `apps/web/src/content/resume.ts` stays byte-identical,
`npm run sync:resume-content` produces no diff, and
`npm run sync:resume-content:check` keeps passing without regeneration.

## 8. Admin UX: one upload control, two previews

### 8.1 Placement

`apps/web/src/components/resume-manager.tsx` `ProfileTab` gains a "Profile photo" card
as the **first** element of the tab, above the name/headline/about fields.

The card contains:

1. Two previews side by side:
   - **Sidebar preview** — small circular portrait, matching the sidebar size.
   - **Hero preview** — larger circular portrait, matching the hero size.
2. A single primary action, "Upload photo" (or "Replace photo" when an avatar
   already exists), which opens a native file picker (`<input type="file">` hidden
   behind a label/button).
3. A secondary "Remove photo" action, shown only when an avatar exists, which asks for
   confirmation before deleting.
4. A short status line: format/size help ("JPEG, PNG or WebP, up to 2 MB") and the
   result of the last upload or removal.

There is exactly **one** file input and **one** upload action in the whole admin UI.
Both previews reflect the same uploaded image; the previews are not separate upload
targets.

The file input resets after every attempt so re-selecting the same file still
triggers a change event.

### 8.2 Client-side checks

Before sending, the browser rejects files that are too large or whose type is not in
the allowlist, and shows the reason inline. These checks are a convenience only; the
server re-validates everything and is the authority.

### 8.3 Mutations

`apps/web/src/lib/project-queries.ts` gains:

- `useUploadProfileAvatar()` — builds `FormData` with the `file` part and sends it to
  the Next.js route. The shared JSON helper must not be reused, because it forces
  `Content-Type: application/json`. The request must let the browser set the
  multipart `Content-Type` with its boundary.
- `useRemoveProfileAvatar()` — `DELETE` to the same route.

Both invalidate `RESUME_QUERY_KEY` on success so the admin previews and the resume
data refresh from one place. Error messages reuse the existing
`handleMutationError` pattern so the UI shows the API's `detail` message.

## 9. Configuration

### 9.1 Backend settings

`apps/api/app/core/config.py` `Settings` gains:

| Setting | Default | Meaning |
| --- | --- | --- |
| `MEDIA_ROOT` | `str(Path(__file__).resolve().parents[2] / "media")` | Directory that holds stored avatars; `parents[2]` resolves to `apps/api`, so the default is `apps/api/media` |
| `MAX_AVATAR_BYTES` | `2097152` | Maximum accepted avatar size in bytes (2 MiB) |

Both are read from the environment like the other settings
(`model_config = {"env_file": ".env", ...}`, loaded from `apps/api/`).

`apps/api/.env.example` documents both, marked as development defaults.

`apps/api/media/` is added to `.gitignore` so stored avatars are never committed.

### 9.2 Frontend settings

No new frontend environment variable is required. The avatar is served through the
same-origin Next.js route, and `API_BASE_URL` already points at the API.

## 10. Implementation sequence and ownership

Sequenced so each slice is independently verifiable and no step depends on a later
one. One owner per shared manifest at a time.

### P1 — Backend storage and configuration

Files: `apps/api/app/core/config.py`, `apps/api/app/core/storage.py` (new),
`apps/api/.env.example`, `.gitignore`, `apps/api/pyproject.toml`,
`apps/api/uv.lock`.

- Add `MEDIA_ROOT` and `MAX_AVATAR_BYTES`.
- Add `python-multipart` and regenerate the lockfile.
- Implement `ProfileImageStore` and `LocalProfileImageStore` with atomic writes and
  path containment.

### P2 — Backend model, migration, and API

Files: `apps/api/app/models/resume.py`, `apps/api/app/schemas/resume.py`,
`apps/api/migrations/versions/a1b2c3d4e5f6_add_profile_avatar.py` (new),
`apps/api/app/api/v1/avatar.py` (new), `apps/api/app/main.py`.

- Add the three nullable columns and the migration.
- Add `avatar_url`, `avatar_updated_at`, `avatar_content_type` to `ProfileResponse`.
- Implement the three routes with the status codes in section 5.6.
- Register the router in `main.py`.

### P3 — Frontend proxy

Files: `apps/web/src/app/api/resume/profile/avatar/route.ts` (new).

- Public GET with binary passthrough, `ETag`, `If-None-Match`, 304.
- Authenticated PUT/DELETE with `validateMutation`, bearer forwarding, multipart
  `Content-Type` preservation, and bounded body size.
- Forward upstream error statuses and JSON bodies.

### P4 — Frontend rendering

Files: `apps/web/src/components/profile-avatar.tsx` (new),
`apps/web/src/components/header.tsx`, `apps/web/src/app/page.tsx`,
`apps/web/src/app/layout.tsx`, `apps/web/src/lib/resume-server.ts` (new),
`apps/web/src/app/globals.css`, `apps/web/src/lib/api.ts`,
`apps/web/src/lib/resume.ts`.

- Add the shared avatar component.
- Render the portrait in the sidebar and the hero.
- Load live resume data in the layout through the server-only cached helper, with the
  existing static fallback.
- Extend `ApiProfile` with the avatar fields and update the private `staticProfile()`
  fallback. The generated content files are not touched.

### P5 — Admin control

Files: `apps/web/src/components/resume-manager.tsx`,
`apps/web/src/lib/project-queries.ts`.

- Add the "Profile photo" card with the two previews, one upload action, and one
  remove action.
- Add the upload and remove mutations.

### P6 — Tests and documentation

Files: `apps/api/tests/test_profile_avatar.py` (new),
`apps/web/tests/profile-avatar.test.mjs` (new), `README.md`, and the API's
`.env.example` notes.

- Backend unit tests that do not require PostgreSQL.
- Frontend tests for the fallback/URL construction.
- README section covering the configuration, the migration, and the local-filesystem
  limitation.

## 11. Verification and acceptance

### 11.1 Backend

New `apps/api/tests/test_profile_avatar.py` covers, without PostgreSQL:

- Upload rejects a missing file part → 400.
- Upload rejects an unsupported declared content type → 400.
- Upload rejects an oversized declared size → 413.
- Upload rejects an empty payload → 400.
- Upload rejects bytes whose magic signature does not match the declared type → 400.
- Upload accepts a minimal valid PNG and stores it under a UUID filename with the
  detected extension.
- Upload replaces an existing avatar and leaves exactly one file in `MEDIA_ROOT`.
- Upload does not write a file when validation fails.
- Public GET returns 404 when no avatar is set.
- Public GET returns the stored bytes with the stored content type and an `ETag`.
- Public GET returns 304 for a matching `If-None-Match`.
- DELETE returns 204, clears the metadata, and removes the file.
- DELETE returns 404 when no avatar is set.
- DELETE without a bearer token → 401; with a valid token → 204.
- Public GET returns 503 when the stored file cannot be read.

The storage tests use a temporary `MEDIA_ROOT` (a `tmp_path` fixture), so they never
touch a developer's real media directory and never touch a database.

The existing suite must keep passing, including the database-free default mode and
the opt-in `--run-integration` mode.

### 11.2 Frontend

New `apps/web/tests/profile-avatar.test.mjs` covers the pure logic:

- The avatar URL is `/api/resume/profile/avatar` with no `v` parameter when there is
  no avatar.
- The avatar URL includes `?v=<epoch>` when `avatar_updated_at` is present.
- The initials fallback is derived from the profile name.
- The generated fallback content is unaffected by the feature:
  `npm run sync:resume-content:check` keeps passing with no diff.

### 11.3 Commands

```bash
# Backend
cd apps/api
uv sync
uv run ruff check .
uv run pytest

# Frontend
npm install
npm run lint:web
npm run typecheck:web
npm run build:web
npm run test --workspace=apps/web
npm run sync:resume-content:check
```

### 11.4 Manual acceptance

1. With no avatar: the sidebar shows the initials monogram, the hero shows no
   portrait, and the hero layout is unchanged from today.
2. Uploading a JPEG in the admin Profile tab updates both previews immediately, and
   the public page shows the portrait in the sidebar and above the hero card.
3. The public page still renders when the API is stopped: it falls back to the
   initials monogram and does not error.
4. Uploading a 3 MB file is refused by the UI and by the API.
5. Uploading a `.png` file whose bytes are actually a text file is refused by the
   API.
6. Replacing the photo shows the new image, not the old one, and the old file is
   gone from `MEDIA_ROOT`.
7. Removing the photo restores the initials monogram and removes the file.
8. The browser layout, navigation, focus order, and narrow-screen behaviour are
   unchanged apart from the new portrait.

## 12. Risks, limitations, and non-goals

| Item | Impact | Mitigation |
| --- | --- | --- |
| Local filesystem storage | Avatars are lost on container redeploy or a machine change | Documented in the README; the `ProfileImageStore` interface keeps the swap to object storage contained |
| Two servers or replicas | Each replica would have its own media directory and the API would serve whichever replica answered | Explicitly unsupported in this version; document that the deployment must be single-instance for media, or move to shared storage |
| EXIF is preserved | GPS and camera metadata stay in the public file | Documented; Pillow-based stripping is a documented follow-up |
| The image is served with its original content type | A browser honours the content type; the validation allowlist limits this to three well-known image types | Magic-byte validation at upload time |
| Multipart proxying through Next.js | The request body is buffered in memory | Bounded by `MAX_AVATAR_BYTES + 64 KiB`; 2 MiB default is comfortably small |
| `python-multipart` is a new dependency | FastAPI fails to import the route without it | Added in the same change as the route, with the lockfile regenerated |
| Public caching | A replaced image can be served from a cache for up to 5 minutes | `avatar_updated_at` in the URL busts the cache immediately on the admin side; `must-revalidate` bounds the stale window |
| The API returns the canonical backend-relative URL | The browser must not use it directly | The web layer builds the same-origin URL; `avatar_url` is the canonical API contract only |

Non-goals for this milestone, restated so they are not smuggled in: image editing,
multiple images, project thumbnails, alt-text management, moderation, storage
providers other than the local filesystem, and any change to the owner
authentication model.

## 13. Sources and current limitations

Sources: the existing `docs/plans/project-administration.md` (route and error-contract
precedent), `AGENTS.md` (milestone boundaries and content rules), and the current
implementation in `apps/api/app/api/v1/resume.py`,
`apps/api/app/api/v1/auth.py`, `apps/api/app/core/config.py`,
`apps/api/app/models/resume.py`, `apps/api/app/schemas/resume.py`,
`apps/api/app/main.py`, `apps/api/tests/conftest.py`,
`apps/web/src/app/api/resume/[...path]/route.ts`, `apps/web/src/lib/api.ts`,
`apps/web/src/lib/auth.ts`, `apps/web/src/lib/project-queries.ts`,
`apps/web/src/lib/resume.ts`, `apps/web/src/components/header.tsx`,
`apps/web/src/components/resume-manager.tsx`, `apps/web/src/app/layout.tsx`,
`apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`,
`apps/web/src/content/resume-types.ts`, `apps/web/scripts/sync-resume-content.mjs`.

Current limitations of this plan:

- The plan was written against the current repository state (`feature/CRUD` at
  `c54d064`). It has not been implemented, and no command in section 11.3 has been
  run against the resulting code.
- The FastAPI public avatar route is designed to be served directly by the API for
  non-browser clients, and through the Next.js route for the browser. Both paths
  return the same bytes and the same `ETag` semantics.
- The exact `MEDIA_ROOT` default assumes the API is started from `apps/api/` with
  the package importable as `app`, which is how the repository is structured today.
- No decision has been made about deployment storage for a multi-instance
  deployment; that decision blocks nothing in this plan, because this plan targets the
  single-instance deployment the repository currently supports.
