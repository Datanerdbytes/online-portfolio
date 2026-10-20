import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");

// Exercise the actual TS helpers/handlers with only the framework request cookie
// store and upstream transport replaced. No new test framework or browser bypass.
function harness(options = {}) {
  const env = { ADMIN_WEB_ORIGIN: "http://localhost:3000", NODE_ENV: "development", ...options.env };
  const jar = new Map();
  const timers = new Map();
  const cache = new Map();
  let nextTimer = 0;
  let upstream = options.fetch ?? (async () => { throw new Error("upstream unavailable"); });
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const source = readFileSync(new URL(`../src/${relative}.ts`, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    } }).outputText;
    const compiledModule = { exports: {} };
    cache.set(relative, compiledModule.exports);
    vm.runInNewContext(code, {
      module: compiledModule, exports: compiledModule.exports,
      require: (id) => {
        if (id === "server-only") return {};
        if (id === "next/headers") return { cookies: async () => ({ get: (name) => jar.get(name) }) };
        if (id === "next/server") return { NextResponse };
        if (id === "@/lib/auth") return load("lib/auth");
        throw new Error(`Unexpected import: ${id}`);
      },
      process: { env }, URL, Headers, Request, Response, Date, TextEncoder, AbortController,
      fetch: (...args) => upstream(...args),
      setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
      clearTimeout: (id) => timers.delete(id),
    }, { filename: relative });
    return compiledModule.exports;
  }
  return { auth: load("lib/auth"), load, jar, timers, env, setFetch: (fn) => { upstream = fn; } };
}
function mutation(body, extraHeaders = {}) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST", headers: {
      Origin: "http://localhost:3000", "X-Requested-With": "online-resume-admin",
      "Content-Type": "application/json", ...extraHeaders,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const expires = () => Math.floor(Date.now() / 1000) + 900;
const token = () => ({ access_token: "header.payload.signature", token_type: "bearer", owner_id: "test-owner", expires_at: expires() });

test("CSRF requires canonical configured origin, custom header and same-origin fetch metadata", () => {
  const h = harness();
  assert.equal(h.auth.validateMutation(mutation()), null);
  for (const headers of [
    { Origin: "null" }, { Origin: "http://evil.example" }, { Origin: "http://localhost:3000/path" },
    { "X-Requested-With": "wrong" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "cross-site" },
  ]) assert.equal(h.auth.validateMutation(mutation(undefined, headers)).status, 403);
  for (const missing of ["origin", "x-requested-with"]) {
    const request = mutation(); request.headers.delete(missing);
    assert.equal(h.auth.validateMutation(request).status, 403);
  }
  h.env.ADMIN_WEB_ORIGIN = "";
  assert.equal(h.auth.validateMutation(mutation()).status, 503);
});

test("cookie names and attributes agree for login and clearing, expiry never slides", () => {
  const h = harness();
  const expiry = expires();
  const dev = h.auth.adminCookieOptions(expiry);
  assert.equal(dev.name, "portfolio-admin");
  assert.equal(dev.httpOnly, true);
  assert.equal(dev.sameSite, "lax");
  assert.equal(dev.path, "/");
  assert.equal(dev.domain, undefined);
  assert.ok(dev.maxAge > 0 && dev.maxAge <= 900);
  assert.equal(dev.expires.getTime(), expiry * 1000);
  h.env.NODE_ENV = "production";
  h.env.ADMIN_WEB_ORIGIN = "https://portfolio.example";
  const prod = h.auth.adminCookieOptions(expiry);
  assert.equal(prod.name, "__Host-portfolio-admin");
  assert.equal(prod.secure, true);
  const cleared = h.auth.clearAdminCookieOptions();
  assert.equal(cleared.name, prod.name);
  assert.equal(cleared.maxAge, 0);
  assert.equal(cleared.expires.getTime(), 0);
  for (const value of [0, -1, Infinity, NaN, expires()+100, String(expiry), true]) {
    assert.equal(h.auth.validExpiration(value), false);
  }
});

test("malformed identity and token response cannot become an authenticated session", async () => {
  const h = harness();
  for (const body of [null, [], {}, { authenticated: false },
    { owner_id: "x", authenticated: true, expires_at: 0 },
    { owner_id: "x", authenticated: true, expires_at: String(expires()) },
  ]) {
    h.setFetch(async () => Response.json(body));
    const result = await h.auth.verifyIdentityViaBackend("test-token");
    assert.equal(result.identity, null);
    assert.equal(result.error.status, 502);
  }
  for (const body of [null, {}, { ...token(), access_token: {} }, { ...token(), token_type: "other" }, { ...token(), expires_at: expires()+50 }]) {
    assert.equal(h.auth.isTokenResponse(body), false);
  }
});

test("upstream network errors, invalid JSON and HTTP 500 remain generic outages", async () => {
  const h = harness();
  for (const fetch of [
    async () => { throw new Error("secret upstream detail"); },
    async () => new Response("not JSON"),
    async () => new Response("private detail", { status: 500 }),
  ]) {
    h.setFetch(fetch);
    const result = await h.auth.verifyIdentityViaBackend("test-token");
    assert.equal(result.error.status, 502);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.equal(h.timers.size, 0);
  }
});

test("upstream deadline stays armed until the JSON body completes", async () => {
  const h = harness();
  let started;
  const parsingStarted = new Promise((resolve) => { started = resolve; });
  h.setFetch(async (_url, init) => ({ ok: true, json: () => {
    started();
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  } }));
  const pending = h.auth.verifyIdentityViaBackend("test-token");
  await parsingStarted;
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  assert.equal((await pending).error.status, 502);
  assert.equal(h.timers.size, 0);
});

test("login rejects invalid bodies and MIME types without touching upstream", async () => {
  const h = harness();
  const { POST } = h.load("app/api/auth/login/route");
  for (const body of [null, [], {}, { username: "x", password: "界".repeat(342) }, { username: "x", password: "p", extra: 1 }]) {
    const response = await POST(mutation(body));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal((await POST(mutation({}, { "Content-Type": "text/application/json-bogus" }))).status, 400);
});

test("login sets a host-only HttpOnly cookie and returns only sanitized identity", async () => {
  const h = harness({ fetch: async (_url, init) => {
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.cache, "no-store");
    return Response.json(token());
  } });
  const response = await h.load("app/api/auth/login/route").POST(mutation({ username: "x", password: "p" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["authenticated", "expires_at", "owner_id"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /portfolio-admin=header.payload.signature/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=lax/);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("logout always clears the same cookie during an outage and is not cached", async () => {
  const h = harness();
  const response = await h.load("app/api/auth/logout/route").POST(mutation());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie"), /portfolio-admin=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("protected check and identity require the cookie, not spoofed identity headers", async () => {
  const h = harness({ fetch: async () => Response.json({ owner_id: "x", authenticated: true, expires_at: expires() }) });
  const check = h.load("app/api/auth/check/route");
  const me = h.load("app/api/auth/me/route");
  assert.equal((await check.POST(mutation(undefined, { Authorization: "Bearer spoofed", "X-Owner-ID": "x" }))).status, 401);
  assert.equal((await me.GET()).status, 401);
  h.jar.set("portfolio-admin", { value: "test-token" });
  assert.equal((await check.POST(mutation())).status, 200);
  assert.equal((await me.GET()).status, 200);
  assert.equal(h.timers.size, 0);
});
