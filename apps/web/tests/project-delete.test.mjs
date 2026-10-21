import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Harness that loads TS modules with fetch replaced by a controllable upstream.
function harness(options = {}) {
  const env = { ADMIN_WEB_ORIGIN: "http://localhost:3000", NODE_ENV: "development", ...options.env };
  const cache = new Map();
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
        if (id === "@tanstack/react-query") return {
          QueryClient: class {},
          useMutation: () => ({}),
          useQueryClient: () => ({}),
        };
        if (id === "@/lib/project-management") return load("lib/project-management");
        if (id === "@/lib/api") return ({});
        throw new Error(`Unexpected import: ${id}`);
      },
      process: { env }, URL, Headers, Request, Response, Date, TextEncoder, AbortController,
      fetch: (...args) => upstream(...args),
      setTimeout: (callback) => { const id = (Math.random() * 1e9) | 0; globalThis.__timerCallbacks = globalThis.__timerCallbacks || new Map(); globalThis.__timerCallbacks.set(id, callback); return id; },
      clearTimeout: (id) => { globalThis.__timerCallbacks?.delete(id); },
    }, { filename: relative });
    return compiledModule.exports;
  }
  return { load, setFetch: (fn) => { upstream = fn; } };
}

async function runDelete(h, slug) {
  const { deleteProject } = h.load("lib/project-queries");
  let threw = null;
  try { await deleteProject(slug); } catch (err) { threw = err; }
  return threw;
}

test("deleteProject sends DELETE to /api/projects/{slug} with admin headers", async () => {
  const h = harness();
  let captured;
  h.setFetch(async (url, init) => {
    captured = { url, init };
    return new Response(null, { status: 204 });
  });
  await runDelete(h, "resume-site");
  assert.equal(captured.url, "/api/projects/resume-site");
  assert.equal(captured.init.method, "DELETE");
  assert.equal(captured.init.headers["Content-Type"], "application/json");
  assert.equal(captured.init.headers["X-Requested-With"], "online-resume-admin");
  assert.equal(captured.init.cache, "no-store");
});

test("deleteProject resolves on upstream 204", async () => {
  const h = harness();
  h.setFetch(async () => new Response(null, { status: 204 }));
  assert.equal(await runDelete(h, "resume-site"), null);
});

test("deleteProject throws ApiError on non-204 with sanitized message", async () => {
  const h = harness();
  h.setFetch(async () => new Response(JSON.stringify({ detail: "raw backend secret" }), {
    status: 404, headers: new Headers({ "content-type": "application/json" }),
  }));
  const err = await runDelete(h, "gone");
  assert.equal(err.status, 404);
  assert.equal(err.message, "The project was not found. It may have been removed. Your draft is preserved.");
  assert.equal(String(err).includes("raw backend secret"), false);
});

test("deleteProject treats network errors as 502 outages", async () => {
  const h = harness();
  h.setFetch(async () => { throw new Error("raw upstream secret"); });
  const err = await runDelete(h, "resume-site");
  assert.equal(err.status, 502);
  assert.equal(err.message, "The projects service is unavailable. Please try again.");
});

test("deleteProject rejects 503 upstream as 503 outage", async () => {
  const h = harness();
  h.setFetch(async () => new Response(null, { status: 503 }));
  const err = await runDelete(h, "resume-site");
  assert.equal(err.status, 503);
  assert.equal(err.message, "The projects service is unavailable. Please try again.");
});
