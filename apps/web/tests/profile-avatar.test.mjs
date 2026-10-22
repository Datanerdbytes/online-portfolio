import { test } from "node:test";
import assert from "node:assert/strict";

import { profileImageUrl, initialsFromName } from "../src/lib/avatar.ts";

test("profileImageUrl returns null when missing", () => {
  assert.equal(profileImageUrl(null, null), null);
  assert.equal(profileImageUrl(undefined, undefined), null);
});

test("profileImageUrl returns bare path without timestamp", () => {
  assert.equal(profileImageUrl("/api/resume/profile/avatar", null), "/api/resume/profile/avatar");
});

test("profileImageUrl appends a millisecond-precision cache key", () => {
  const url = profileImageUrl(
    "/api/resume/profile/avatar",
    "2025-01-01T00:00:00.123Z",
  );
  assert.equal(url, "/api/resume/profile/avatar?v=1735689600123");
});

test("profileImageUrl builds the independent banner route", () => {
  const url = profileImageUrl(
    "/api/v1/resume/profile/banner",
    "2025-01-01T00:00:00.123Z",
    "/api/resume/profile/banner",
  );
  assert.equal(url, "/api/resume/profile/banner?v=1735689600123");
});

test("initialsFromName returns up to two initials", () => {
  assert.equal(initialsFromName("Roel Somido"), "RS");
  assert.equal(initialsFromName("Single"), "SI");
  assert.equal(initialsFromName(""), "?");
});
