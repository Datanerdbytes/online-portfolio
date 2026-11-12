import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_ACCEPT,
  SCREENSHOT_ACCEPT,
  validateAvatarFile,
  validateScreenshotFile,
} from "../src/lib/avatar.ts";

function file(type, size) {
  return { type, size };
}

test("SCREENSHOT_ACCEPT extends the avatar types with GIF", () => {
  assert.equal(SCREENSHOT_ACCEPT, `${AVATAR_ACCEPT},image/gif`);
});

test("validateScreenshotFile accepts raster and GIF images", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    assert.equal(validateScreenshotFile(file(type, 1024)), null);
  }
});

test("validateScreenshotFile rejects unsupported types", () => {
  assert.equal(
    validateScreenshotFile(file("image/bmp", 1024)),
    "Upload a JPEG, PNG, WebP, or GIF image."
  );
  assert.equal(
    validateScreenshotFile(file("", 1024)),
    "Upload a JPEG, PNG, WebP, or GIF image."
  );
});

test("validateScreenshotFile enforces the 2 MB limit", () => {
  assert.equal(
    validateScreenshotFile(file("image/gif", 2 * 1024 * 1024 + 1)),
    "Image must be 2 MB or smaller."
  );
  assert.equal(
    validateScreenshotFile(file("image/gif", 2 * 1024 * 1024)),
    null
  );
});

test("validateAvatarFile still rejects GIF uploads for portraits", () => {
  assert.equal(
    validateAvatarFile(file("image/gif", 1024)),
    "Upload a JPEG, PNG, or WebP image."
  );
});
