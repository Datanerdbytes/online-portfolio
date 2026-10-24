import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");

function imageProxy(path, fetch, token = "test-owner-token") {
  const source = readFileSync(
    new URL("../src/lib/profile-image-proxy.ts", import.meta.url),
    "utf8"
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(code, {
    module: compiled,
    exports: compiled.exports,
    require: (id) => {
      if (id === "next/server") return { NextResponse };
      if (id === "@/lib/auth") return { readAdminToken: async () => token };
      if (id === "@/lib/api") return { API_BASE_URL: "https://api.test" };
      if (id === "@/lib/avatar") return { AVATAR_UPLOAD_MAX_BYTES: 2162688 };
      throw new Error(`Unexpected import: ${id}`);
    },
    URL,
    Headers,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch,
  });
  return compiled.exports.createProfileImageHandlers(path, "Image");
}

for (const path of [
  "/api/v1/resume/profile/avatar",
  "/api/v1/resume/profile/banner",
  "/api/v1/projects/example/screenshot",
]) {
  test(`${path} bypasses the old image cache using the upload version`, async () => {
    const proxy = imageProxy(path, async (url, init) => {
      const upstream = new URL(url);
      assert.equal(
        upstream.origin + upstream.pathname,
        `https://api.test${path}`
      );
      assert.equal(upstream.searchParams.has("unrelated"), false);
      assert.equal(init.headers.get("if-none-match"), '"old-image"');
      return new Response(
        upstream.searchParams.get("v") === "123" ? "fresh" : "stale",
        {
          headers: { "Content-Type": "image/webp", ETag: '"new-image"' },
        }
      );
    });
    const response = await proxy.GET(
      new Request("https://site.test/image?v=123&unrelated=ignore", {
        headers: { "If-None-Match": '"old-image"' },
      })
    );
    assert.equal(await response.text(), "fresh");
    assert.equal(response.headers.get("etag"), '"new-image"');
  });
}

test("unversioned image URLs retain the original upstream path", async () => {
  const proxy = imageProxy("/api/v1/resume/profile/avatar", async (url) => {
    assert.equal(String(url), "https://api.test/api/v1/resume/profile/avatar");
    return new Response("image", { headers: { "Content-Type": "image/webp" } });
  });
  assert.equal(
    (await proxy.GET(new Request("https://site.test/image"))).status,
    200
  );
});

test("draft image reads require a session instead of falling back to public content", async () => {
  const proxy = imageProxy(
    "/api/v1/resume/profile/avatar",
    async () => {
      assert.fail("An absent session must not fetch another portfolio's image");
    },
    null
  );
  const response = await proxy.GET(new Request("https://site.test/image"));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
