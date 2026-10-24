const TEST_PASSWORD = "fixture-password"; // pragma: allowlist secret
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
  const env = {
    ADMIN_WEB_ORIGIN: "http://localhost:3000",
    NODE_ENV: "development",
    NEON_AUTH_BASE_URL:
      "https://test.neonauth.us-east-1.aws.neon.tech/neondb/auth",
    NEON_AUTH_COOKIE_SECRET:
      "test-cookie-signing-secret-longer-than-32-characters",
    ...options.env,
  };
  const jar = new Map();
  const timers = new Map();
  const cache = new Map();
  let nextTimer = 0;
  let upstream =
    options.fetch ??
    (async () => {
      throw new Error("upstream unavailable");
    });
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const source = readFileSync(
      new URL(`../src/${relative}.ts`, import.meta.url),
      "utf8"
    );
    const code = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const compiledModule = { exports: {} };
    cache.set(relative, compiledModule.exports);
    vm.runInNewContext(
      code,
      {
        module: compiledModule,
        exports: compiledModule.exports,
        require: (id) => {
          if (id === "server-only") return {};
          if (id === "next/headers")
            return { cookies: async () => ({ get: (name) => jar.get(name) }) };
          if (id === "next/server") return { NextResponse };
          if (id === "react") return { cache: (callback) => callback };
          if (id === "next/navigation")
            return {
              redirect: (path) => {
                throw new Error(`redirect:${path}`);
              },
            };
          if (id === "@/app/api/projects/[slug]/route")
            return load("app/api/projects/[slug]/route");
          if (id === "@/lib/auth/server")
            return {
              getNeonAuth: () =>
                options.neon ?? {
                  token: async () => ({
                    data: { token: jar.get("portfolio-admin")?.value },
                    error: null,
                  }),
                  signIn: {
                    email: async () => ({
                      data: { user: { id: "provider-user" } },
                      error: null,
                    }),
                  },
                  signUp: {
                    email: async () => ({
                      data: { user: { id: "provider-user" } },
                      error: null,
                    }),
                  },
                  signOut: async () => {
                    jar.clear();
                    return { data: null, error: null };
                  },
                },
            };
          if (id === "@/lib/auth") return load("lib/auth");
          if (id === "@/lib/portfolio") return load("lib/portfolio");
          if (id === "@/lib/auth/recovery") return load("lib/auth/recovery");
          if (id === "@/lib/projects") return load("lib/projects");
          if (id === "@/lib/project-management")
            return load("lib/project-management");
          if (id === "@/lib/api")
            return {
              API_BASE_URL: "http://api.test",
              fetchProjects: async () => {
                throw new Error("fetchProjects not used by handler tests");
              },
            };
          throw new Error(`Unexpected import: ${id}`);
        },
        process: { env },
        URL,
        Headers,
        Request,
        Response,
        Date,
        TextEncoder,
        TextDecoder,
        AbortController,
        fetch: (...args) => upstream(...args),
        setTimeout: (callback) => {
          const id = ++nextTimer;
          timers.set(id, callback);
          return id;
        },
        clearTimeout: (id) => timers.delete(id),
      },
      { filename: relative }
    );
    return compiledModule.exports;
  }
  return {
    auth: load("lib/auth"),
    load,
    jar,
    timers,
    env,
    setFetch: (fn) => {
      upstream = fn;
    },
  };
}
function mutation(body, extraHeaders = {}) {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "X-Requested-With": "online-resume-admin",
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const expires = () => Math.floor(Date.now() / 1000) + 900;

test("CSRF requires canonical configured origin, custom header and same-origin fetch metadata", () => {
  const h = harness();
  assert.equal(h.auth.validateMutation(mutation()), null);
  for (const headers of [
    { Origin: "null" },
    { Origin: "http://evil.example" },
    { Origin: "http://localhost:3000/path" },
    { "X-Requested-With": "wrong" },
    { "Sec-Fetch-Site": "same-site" },
    { "Sec-Fetch-Site": "cross-site" },
  ])
    assert.equal(
      h.auth.validateMutation(mutation(undefined, headers)).status,
      403
    );
  for (const missing of ["origin", "x-requested-with"]) {
    const request = mutation();
    request.headers.delete(missing);
    assert.equal(h.auth.validateMutation(request).status, 403);
  }
  h.env.ADMIN_WEB_ORIGIN = "";
  assert.equal(h.auth.validateMutation(mutation()).status, 503);
});

test("upstream network errors, invalid JSON and HTTP 500 remain generic outages", async () => {
  const h = harness();
  for (const fetch of [
    async () => {
      throw new Error("secret upstream detail");
    },
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
  const parsingStarted = new Promise((resolve) => {
    started = resolve;
  });
  h.setFetch(async (_url, init) => ({
    ok: true,
    json: () => {
      started();
      return new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () =>
          reject(new Error("aborted"))
        )
      );
    },
  }));
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
  for (const body of [
    null,
    [],
    {},
    { username: "x", password: "界".repeat(342) },
    { username: "x", password: "p", extra: 1 },
  ]) {
    const response = await POST(mutation(body));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal(
    (
      await POST(
        mutation({}, { "Content-Type": "text/application/json-bogus" })
      )
    ).status,
    400
  );
});

test("protected check and identity require the cookie, not spoofed identity headers", async () => {
  const h = harness({
    fetch: async () =>
      Response.json({
        owner_id: "x",
        authenticated: true,
        expires_at: expires(),
      }),
  });
  const check = h.load("app/api/auth/check/route");
  const me = h.load("app/api/auth/me/route");
  assert.equal(
    (
      await check.POST(
        mutation(undefined, {
          Authorization: "Bearer spoofed",
          "X-Owner-ID": "x",
        })
      )
    ).status,
    401
  );
  assert.equal((await me.GET()).status, 401);
  h.jar.set("portfolio-admin", { value: "test-token" });
  assert.equal((await check.POST(mutation())).status, 200);
  assert.equal((await me.GET()).status, 200);
  assert.equal(h.timers.size, 0);
});

function project() {
  return {
    id: 1,
    slug: "resume-site",
    title: "Resume site",
    summary: "Portfolio application.",
    technologies: ["Next.js", "FastAPI"],
    repository_url: null,
    demo_url: null,
    display_order: 0,
    is_sample: false,
    screenshot_url: null,
    screenshot_updated_at: null,
  };
}

function projectRequest(path, method = "POST", body, extraHeaders = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "X-Requested-With": "online-resume-admin",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function headersOf(init) {
  return new Headers(init.headers);
}

const detailFor = {
  400: "Invalid request",
  401: "Not authenticated",
  403: "Not authorized",
  404: "Project not found",
  409: "Project already exists",
  429: "Too many requests",
  503: "Administration unavailable",
};

test("editor reads reject missing or unavailable sessions without fetching default content", async () => {
  for (const neon of [
    undefined,
    {
      token: async () => {
        throw new Error("provider unavailable");
      },
    },
  ]) {
    let upstreamCalls = 0;
    const h = harness({
      neon,
      fetch: async () => {
        upstreamCalls++;
        throw new Error("must not fetch");
      },
    });
    for (const route of ["app/api/projects/route", "app/api/resume/route"]) {
      const response = await h.load(route).GET();
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { detail: "Not authenticated" });
    }
    assert.equal(upstreamCalls, 0);
  }
});

test("authenticated GET /api/projects keeps its outage contract", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-bearer-token" });
  const { GET } = h.load("app/api/projects/route");
  h.setFetch(async () => {
    throw new Error("raw upstream secret");
  });
  const response = await GET();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.status, "unavailable");
});

test("project create requires admin configuration, authentication, CSRF and JSON", async () => {
  const h = harness();
  const { POST } = h.load("app/api/projects/route");
  const base = {
    slug: "resume-site",
    title: "Resume site",
    summary: "Portfolio application.",
    technologies: ["Next.js"],
  };

  assert.equal(
    (await POST(projectRequest("/api/projects", "POST", base))).status,
    401
  );
  h.jar.set("portfolio-admin", { value: "test-token" });
  assert.equal(
    (
      await POST(
        projectRequest("/api/projects", "POST", base, { Origin: "null" })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await POST(
        projectRequest("/api/projects", "POST", base, {
          "X-Requested-With": "wrong",
        })
      )
    ).status,
    403
  );
  assert.equal(
    (
      await POST(
        projectRequest("/api/projects", "POST", base, {
          "Content-Type": "text/plain",
        })
      )
    ).status,
    400
  );
  h.env.ADMIN_WEB_ORIGIN = "";
  assert.equal(
    (await POST(projectRequest("/api/projects", "POST", base))).status,
    503
  );
  h.env.ADMIN_WEB_ORIGIN = "http://localhost:3000";
});

test("project create authenticates via cookie and forwards the exact payload", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  let upstreamAuth;
  let upstreamBody;
  h.setFetch(async (_url, init) => {
    const headers = headersOf(init);
    upstreamAuth = headers.get("authorization");
    upstreamBody = JSON.parse(init.body || "null");
    assert.equal(headers.get("x-owner-id"), null);
    return Response.json(project(), { status: 201 });
  });
  const response = await POST(
    projectRequest("/api/projects", "POST", {
      slug: "resume-site",
      title: "Resume site",
      summary: "Portfolio application.",
      technologies: ["Next.js", "FastAPI"],
      display_order: 0,
    })
  );
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), project());
  assert.equal(upstreamAuth, "Bearer test-token");
  assert.deepEqual(upstreamBody, {
    slug: "resume-site",
    title: "Resume site",
    summary: "Portfolio application.",
    technologies: ["Next.js", "FastAPI"],
    display_order: 0,
  });
});

test("project create never sends read-only or unknown fields", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  let upstreamCalled = false;
  h.setFetch(async () => {
    upstreamCalled = true;
    return Response.json(project(), { status: 201 });
  });
  const base = {
    slug: "resume-site",
    title: "Resume site",
    summary: "Portfolio application.",
    technologies: ["Next.js"],
  };
  for (const body of [
    { ...base, id: 9 },
    { ...base, is_sample: true },
    { ...base, bogus: 1 },
  ]) {
    assert.equal(
      (await POST(projectRequest("/api/projects", "POST", body))).status,
      400
    );
  }
  assert.equal(upstreamCalled, false);
});

test("project create maps upstream statuses to sanitized proxy errors", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  const base = { slug: "x", title: "t", summary: "s", technologies: ["a"] };
  for (const [status, expected] of [
    [400, 400],
    [401, 401],
    [403, 403],
    [404, 404],
    [409, 409],
    [429, 429],
    [503, 503],
    [500, 502],
  ]) {
    h.setFetch(
      async () =>
        new Response(JSON.stringify({ detail: "raw backend detail" }), {
          status,
          headers: new Headers({ "content-type": "application/json" }),
        })
    );
    const response = await POST(projectRequest("/api/projects", "POST", base));
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ["detail"]);
    assert.equal(
      body.detail,
      detailFor[expected] ?? "Projects service unavailable"
    );
  }
});

test("project create treats network errors, malformed payloads and stalls as outages", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  const base = { slug: "x", title: "t", summary: "s", technologies: ["a"] };
  for (const fetch of [
    async () => {
      throw new Error("raw upstream secret");
    },
    async () => new Response("not JSON", { status: 200 }),
    async () =>
      new Response(JSON.stringify({ id: "not-a-number" }), {
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
      }),
  ]) {
    h.setFetch(fetch);
    const response = await POST(projectRequest("/api/projects", "POST", base));
    assert.equal(response.status, 502);
    assert.equal(
      (await response.json()).detail,
      "Projects service unavailable"
    );
    assert.equal(h.timers.size, 0);
  }
});

test("project create deadline stays armed during body parsing", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  let parsingStarted;
  const started = new Promise((resolve) => {
    parsingStarted = resolve;
  });
  h.setFetch(async (_url, init) => ({
    ok: true,
    status: 201,
    json: () =>
      new Promise((_resolve, reject) => {
        parsingStarted();
        init.signal.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      }),
  }));
  const pending = POST(
    projectRequest("/api/projects", "POST", {
      slug: "x",
      title: "t",
      summary: "s",
      technologies: ["a"],
    })
  );
  await Promise.race([
    started,
    pending.then(() => {
      throw new Error("Request returned before reading the body");
    }),
  ]);
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0]();
  assert.equal((await pending).status, 502);
  assert.equal(h.timers.size, 0);
});

test("project PUT requires all writable fields and rejects immutable fields", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { PUT } = h.load("app/api/projects/[slug]/route");
  const full = {
    title: "T",
    summary: "S",
    technologies: [],
    repository_url: null,
    demo_url: null,
    display_order: 3,
  };
  let upstreamBody;
  h.setFetch(async (_url, init) => {
    upstreamBody = JSON.parse(init.body || "null");
    return new Response(JSON.stringify(project()), {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });
  });
  assert.equal(
    (
      await PUT(
        projectRequest("/api/projects/keep", "PUT", {
          ...full,
          slug: "changed",
        }),
        { params: { slug: "keep" } }
      )
    ).status,
    400
  );
  assert.equal(
    (
      await PUT(
        projectRequest("/api/projects/keep", "PUT", { ...full, bogus: 1 }),
        { params: { slug: "keep" } }
      )
    ).status,
    400
  );
  h.setFetch(
    async () =>
      new Response(JSON.stringify({ detail: "raw" }), {
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
      })
  );
  assert.equal(
    (
      await PUT(projectRequest("/api/projects/keep", "PUT", full), {
        params: { slug: "keep" },
      })
    ).status,
    400
  );
  h.setFetch(
    async () =>
      new Response(JSON.stringify(project()), {
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
      })
  );
  const missing = await PUT(projectRequest("/api/projects/gone", "PUT", full), {
    params: { slug: "gone" },
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).detail, "Project not found");
  h.setFetch(async (_url, init) => {
    upstreamBody = JSON.parse(init.body || "null");
    return new Response(JSON.stringify(project()), {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });
  });
  const ok = await PUT(projectRequest("/api/projects/keep", "PUT", full), {
    params: { slug: "keep" },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), project());
  assert.deepEqual(upstreamBody, full);
});

test("project PATCH sends only changed fields, clears URLs with null, and rejects empty bodies", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { PATCH } = h.load("app/api/projects/[slug]/route");
  assert.equal(
    (
      await PATCH(projectRequest("/api/projects/keep", "PATCH", {}), {
        params: { slug: "keep" },
      })
    ).status,
    400
  );
  let upstreamBody;
  h.setFetch(async (_url, init) => {
    upstreamBody = JSON.parse(init.body || "null");
    return new Response(JSON.stringify(project()), {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });
  });
  assert.equal(
    (
      await PATCH(
        projectRequest("/api/projects/keep", "PATCH", { title: "Revised" }),
        { params: { slug: "keep" } }
      )
    ).status,
    200
  );
  assert.deepEqual(upstreamBody, { title: "Revised" });
  assert.equal(
    (
      await PATCH(
        projectRequest("/api/projects/keep", "PATCH", { repository_url: null }),
        { params: { slug: "keep" } }
      )
    ).status,
    200
  );
  assert.deepEqual(upstreamBody, { repository_url: null });
});

test("project DELETE returns empty 204 and maps 404", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { DELETE } = h.load("app/api/projects/[slug]/route");
  h.setFetch(async () => new Response(null, { status: 204 }));
  const response = await DELETE(
    projectRequest("/api/projects/keep", "DELETE", undefined),
    { params: { slug: "keep" } }
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
  h.setFetch(
    async () =>
      new Response(JSON.stringify({ detail: "raw" }), {
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
      })
  );
  const missing = await DELETE(
    projectRequest("/api/projects/gone", "DELETE", undefined),
    { params: { slug: "gone" } }
  );
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).detail, "Project not found");
});

test("project reorder validates the batch and returns the updated count", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/reorder/route");
  let upstreamBody;
  h.setFetch(async (_url, init) => {
    upstreamBody = JSON.parse(init.body || "null");
    return new Response(JSON.stringify({ updated: 2 }), {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
    });
  });
  const response = await POST(
    projectRequest("/api/projects/reorder", "POST", {
      orders: [
        { slug: "resume-site", display_order: 1 },
        { slug: "another-project", display_order: 2 },
      ],
    })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { updated: 2 });
  assert.deepEqual(upstreamBody, {
    orders: [
      { slug: "resume-site", display_order: 1 },
      { slug: "another-project", display_order: 2 },
    ],
  });
  for (const body of [
    { orders: [] },
    {},
    {
      orders: Array.from({ length: 101 }, (_, i) => ({
        slug: `s-${i}`,
        display_order: i,
      })),
    },
    {
      orders: [
        { slug: "a", display_order: 1 },
        { slug: "a", display_order: 2 },
      ],
    },
    { orders: [{ slug: "a", display_order: 1.5 }] },
    { orders: [{ slug: "a", display_order: true }] },
    { orders: [{ slug: "Bad Slug", display_order: 0 }] },
    { commands: [] },
  ]) {
    assert.equal(
      (await POST(projectRequest("/api/projects/reorder", "POST", body)))
        .status,
      400
    );
  }
  h.setFetch(
    async () =>
      new Response(JSON.stringify({ updated: "two" }), {
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
      })
  );
  const malformed = await POST(
    projectRequest("/api/projects/reorder", "POST", {
      orders: [{ slug: "a", display_order: 0 }],
    })
  );
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.json()).detail, "Projects service unavailable");
});

test("management supports empty technologies and validates actual entries", () => {
  const helpers = harness().load("lib/project-management");
  assert.deepEqual(Array.from(helpers.parseTechnologies("")), []);
  assert.deepEqual(Array.from(helpers.parseTechnologies("  ")), []);
  assert.deepEqual(
    Array.from(helpers.parseTechnologies(" Next.js, FastAPI ")),
    ["Next.js", "FastAPI"]
  );
  for (const input of [
    "a, a",
    "a,,b",
    "x".repeat(51),
    Array.from({ length: 21 }, (_, i) => `t${i}`).join(","),
  ]) {
    assert.equal(helpers.parseTechnologies(input), null);
  }
});

test("reorder submits only changed targets in collections larger than 100", () => {
  const { changedOrders } = harness().load("lib/project-management");
  const projects = Array.from({ length: 101 }, (_, i) => ({
    ...project(),
    id: i + 1,
    slug: `p-${i}`,
    display_order: i,
  }));
  const result = changedOrders(projects, { "p-0": "7" });
  assert.deepEqual(JSON.parse(JSON.stringify(result.orders)), [
    { slug: "p-0", display_order: 7 },
  ]);
  assert.equal(
    changedOrders(
      projects,
      Object.fromEntries(projects.map((p) => [p.slug, "200"]))
    ).orders,
    null
  );
  assert.equal(changedOrders(projects, { "p-0": "" }).orders, null);
  assert.equal(changedOrders(projects, { "p-0": "1.5" }).orders, null);
});

test("unchanged project details produce helpful feedback without a mutation", () => {
  const { projectUpdateBody, PROJECT_NO_CHANGES_MESSAGE } = harness().load(
    "lib/project-management"
  );
  const original = project();
  const unchanged = {
    title: original.title,
    summary: original.summary,
    technologies: [...original.technologies],
    repository_url: original.repository_url,
    demo_url: original.demo_url,
    display_order: original.display_order,
  };

  assert.equal(projectUpdateBody(unchanged, original), null);
  assert.equal(
    PROJECT_NO_CHANGES_MESSAGE,
    "Project details are unchanged. Screenshot uploads save immediately."
  );
});

test("admin links omit unsafe or malformed URLs", () => {
  const { safeProjectLink } = harness().load("lib/project-management");
  for (const value of [
    null,
    "javascript:alert(1)",
    "data:text/plain,x",
    "/relative",
    "https://exa mple.com",
    "http:/example.com",
  ])
    assert.equal(safeProjectLink(value), false);
  assert.equal(safeProjectLink("https://example.com/repo"), true);
});

test("dynamic proxy slugs cannot alter upstream path or query", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  let called = false;
  h.setFetch(async () => {
    called = true;
    return Response.json(project());
  });
  const routes = h.load("app/api/projects/[slug]/route");
  for (const slug of [
    "../auth/logout",
    "project/other",
    "project?query=1",
    "Upper",
    "",
    "x".repeat(101),
  ]) {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const body =
        method === "PUT"
          ? {
              title: "t",
              summary: "s",
              technologies: [],
              repository_url: null,
              demo_url: null,
              display_order: 0,
            }
          : { title: "t" };
      const response = await routes[method](
        projectRequest("/api/projects/x", method, body),
        { params: Promise.resolve({ slug }) }
      );
      assert.equal(response.status, 400);
    }
  }
  assert.equal(called, false);
});

test("mutation proxies require exact success status instead of accepting arbitrary 2xx", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  h.setFetch(async () => Response.json(project(), { status: 200 }));
  const created = await h.load("app/api/projects/route").POST(
    projectRequest("/api/projects", "POST", {
      slug: "x",
      title: "t",
      summary: "s",
      technologies: [],
    })
  );
  assert.equal(created.status, 502);
  const removed = await h
    .load("app/api/projects/[slug]/route")
    .DELETE(projectRequest("/api/projects/x", "DELETE"), {
      params: Promise.resolve({ slug: "x" }),
    });
  assert.equal(removed.status, 502);
});

test("reorder rejects unknown entry fields and impossible or mismatched success counts", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/reorder/route");
  const input = {
    orders: [
      { slug: "a", display_order: 1 },
      { slug: "b", display_order: 2 },
    ],
  };
  assert.equal(
    (
      await POST(
        projectRequest("/api/projects/reorder", "POST", {
          orders: [{ slug: "a", display_order: 1, extra: true }],
        })
      )
    ).status,
    400
  );
  for (const count of [-1, 0, 0.5, 101, 1]) {
    h.setFetch(async () => Response.json({ updated: count }));
    assert.equal(
      (await POST(projectRequest("/api/projects/reorder", "POST", input)))
        .status,
      502
    );
  }
});

test("project mutation responses omit upstream-only fields and reject invalid numeric fields", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const { POST } = h.load("app/api/projects/route");
  const input = {
    slug: "resume-site",
    title: "t",
    summary: "s",
    technologies: [],
  };
  h.setFetch(async () =>
    Response.json(
      { ...project(), access_token: "private-upstream-token" },
      { status: 201 }
    )
  );
  const response = await POST(projectRequest("/api/projects", "POST", input));
  assert.equal(response.status, 201);
  assert.equal(
    (await response.text()).includes("private-upstream-token"),
    false
  );
  for (const value of [
    { ...project(), id: 0 },
    { ...project(), display_order: -1 },
  ]) {
    h.setFetch(async () => Response.json(value, { status: 201 }));
    assert.equal(
      (await POST(projectRequest("/api/projects", "POST", input))).status,
      502
    );
  }
});

test("unmodified technology labels containing commas are preserved during partial edits", () => {
  const { formTechnologies } = harness().load("lib/project-management");
  const original = ["Node, platform", "FastAPI"];
  assert.deepEqual(
    Array.from(formTechnologies("Node, platform, FastAPI", original)),
    original
  );
  assert.deepEqual(Array.from(formTechnologies("Next.js", original)), [
    "Next.js",
  ]);
  assert.deepEqual(Array.from(formTechnologies("", original)), []);
});

test("the legal reorder slug supports project CRUD alongside batch POST", async () => {
  const h = harness();
  h.jar.set("portfolio-admin", { value: "test-token" });
  const route = h.load("app/api/projects/reorder/route");
  const project = {
    id: 1,
    slug: "reorder",
    title: "t",
    summary: "s",
    technologies: [],
    repository_url: null,
    demo_url: null,
    display_order: 0,
    is_sample: false,
  };
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    h.setFetch(async (url, init) => {
      assert.equal(new URL(url).pathname, "/api/v1/projects/reorder");
      assert.equal(init.method, method);
      return method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json(project);
    });
    const body =
      method === "DELETE"
        ? undefined
        : method === "PATCH"
          ? { title: "t" }
          : {
              title: "t",
              summary: "s",
              technologies: [],
              repository_url: null,
              demo_url: null,
              display_order: 0,
            };
    const response = await route[method](
      projectRequest("/api/projects/reorder", method, body)
    );
    assert.equal(response.status, method === "DELETE" ? 204 : 200);
  }
});

test("login delegates credentials to Neon and never returns provider tokens", async () => {
  let seen;
  const h = harness({
    neon: {
      signIn: {
        email: async (body) => {
          seen = body;
          return {
            data: { token: "must-not-leak", user: { id: "user" } },
            error: null,
          };
        },
      },
    },
  });
  const response = await h.load("app/api/auth/login/route").POST(
    mutation({ username: " User@Example.com ", password: TEST_PASSWORD }) // pragma: allowlist secret
  );
  assert.equal(response.status, 200);
  assert.equal(seen.email, "user@example.com");
  assert.deepEqual(await response.json(), { authenticated: true });
  assert.equal(response.headers.get("set-cookie"), null);
});

test("registration uses Neon and does not publish login email as profile data", async () => {
  let called = 0;
  const h = harness({
    neon: {
      signUp: {
        email: async (body) => {
          called++;
          assert.equal(body.email, "new@example.com");
          return { data: { token: "must-not-leak" }, error: null };
        },
      },
    },
  });
  const handler = h.load("app/api/auth/register/route");
  const body = {
    name: "Example",
    email: "new@example.com",
    password: TEST_PASSWORD,
  };
  assert.equal(
    (await handler.POST(mutation(body, { Origin: "https://evil.example" })))
      .status,
    403
  );
  assert.equal(called, 0);
  const response = await handler.POST(mutation(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { registered: true });
});

test("logout delegates to Neon's managed session revocation", async () => {
  let signedOut = false;
  const h = harness({
    neon: {
      signOut: async () => {
        signedOut = true;
        return { data: null, error: null };
      },
    },
  });
  const response = await h.load("app/api/auth/logout/route").POST(mutation());
  assert.equal(response.status, 204);
  assert.equal(signedOut, true);
});

test("provider outages never become successful login or logout", async () => {
  const fail = async () => {
    throw new Error("private provider detail");
  };
  const h = harness({ neon: { signIn: { email: fail }, signOut: fail } });
  assert.equal(
    (
      await h
        .load("app/api/auth/login/route")
        .POST(
          mutation({ username: "user@example.com", password: TEST_PASSWORD })
        )
    ).status,
    503
  );
  assert.equal(
    (await h.load("app/api/auth/logout/route").POST(mutation())).status,
    503
  );
});

test("provider credential failures and email verification are distinguished", async () => {
  for (const status of [401, 403, 429]) {
    const h = harness({
      neon: {
        signIn: { email: async () => ({ data: null, error: { status } }) },
      },
    });
    const result = await h
      .load("app/api/auth/login/route")
      .POST(
        mutation({ username: "user@example.com", password: TEST_PASSWORD })
      );
    assert.equal(result.status, status);
  }
});

test("provider HTTP failures return service unavailable for login and registration", async () => {
  const fail = async () => ({ data: null, error: { status: 502 } });
  const h = harness({
    neon: { signIn: { email: fail }, signUp: { email: fail } },
  });
  assert.equal(
    (
      await h
        .load("app/api/auth/login/route")
        .POST(
          mutation({ username: "user@example.com", password: TEST_PASSWORD })
        )
    ).status,
    503
  );
  assert.equal(
    (
      await h.load("app/api/auth/register/route").POST(
        mutation({
          name: "Test",
          email: "user@example.com",
          password: TEST_PASSWORD,
        })
      )
    ).status,
    503
  );
});

test("reset requests use a fixed trusted callback and do not reveal accounts", async () => {
  let seen;
  const h = harness({
    neon: {
      requestPasswordReset: async (body) => {
        seen = body;
        return { data: null, error: null };
      },
    },
  });
  const handler = h.load("app/api/auth/forgot-password/route");
  assert.equal(
    (
      await handler.POST(
        mutation({
          email: "someone@example.com",
          redirectTo: "https://evil.example",
        })
      )
    ).status,
    400
  );
  const ok = await handler.POST(mutation({ email: " User@Example.com " }));
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), {
    email: "user@example.com",
    redirectTo: "http://localhost:3000/auth/reset-password",
  });
  const unknown = harness({
    neon: {
      requestPasswordReset: async () => ({
        data: null,
        error: { status: 400, message: "no such account" },
      }),
    },
  });
  const absent = await unknown
    .load("app/api/auth/forgot-password/route")
    .POST(mutation({ email: "none@example.com" }));
  assert.equal(absent.status, 200);
  assert.deepEqual(await absent.json(), await ok.json());
});

test("recovery enforces CSRF, bounded JSON and provider throttling", async () => {
  let called = 0;
  const h = harness({
    neon: {
      requestPasswordReset: async () => {
        called++;
        return { data: null, error: { status: 429 } };
      },
    },
  });
  const handler = h.load("app/api/auth/forgot-password/route");
  assert.equal(
    (
      await handler.POST(
        mutation(
          { email: "user@example.com" },
          { Origin: "https://evil.example" }
        )
      )
    ).status,
    403
  );
  assert.equal(
    (await handler.POST(mutation({ email: "x".repeat(9000) }))).status,
    400
  );
  assert.equal(called, 0);
  assert.equal(
    (await handler.POST(mutation({ email: "user@example.com" }))).status,
    429
  );
});

test("password reset delegates the token and password without echoing either", async () => {
  let seen;
  const h = harness({
    neon: {
      resetPassword: async (body) => {
        seen = body;
        return { data: { token: "private-provider-value" }, error: null };
      },
    },
  });
  const handler = h.load("app/api/auth/reset-password/route");
  const token = "fixture-reset-token-123456789";
  const response = await handler.POST(
    mutation({ token, password: TEST_PASSWORD })
  );
  assert.equal(response.status, 200);
  assert.equal(seen.token, token);
  assert.equal(seen.newPassword, TEST_PASSWORD);
  assert.deepEqual(await response.json(), { reset: true });
  assert.equal(
    (await handler.POST(mutation({ token, password: "short" }))).status, // pragma: allowlist secret (invalid fixture)
    400
  );
  const expired = harness({
    neon: {
      resetPassword: async () => ({
        data: null,
        error: { status: 400, message: "private reset detail" },
      }),
    },
  });
  const failed = await expired
    .load("app/api/auth/reset-password/route")
    .POST(mutation({ token, password: TEST_PASSWORD }));
  assert.equal(failed.status, 400);
  assert.ok(!(await failed.text()).includes("private reset detail"));
});

test("verification uses provider codes and never accepts a client verified flag", async () => {
  let seen;
  const h = harness({
    neon: {
      emailOtp: {
        verifyEmail: async (body) => {
          seen = body;
          return { data: { token: "private-session" }, error: null };
        },
        sendVerificationOtp: async () => ({ data: null, error: null }),
      },
    },
  });
  const handler = h.load("app/api/auth/verify-email/route");
  assert.equal(
    (
      await handler.POST(
        mutation({ email: "user@example.com", otp: "123456", verified: true })
      )
    ).status,
    400
  );
  assert.equal(
    (await handler.POST(mutation({ email: "user@example.com", otp: "bad" })))
      .status,
    400
  );
  const response = await handler.POST(
    mutation({ email: "User@Example.com", otp: "123456" })
  );
  assert.equal(response.status, 200);
  assert.equal(seen.email, "user@example.com");
  assert.equal(seen.otp, "123456");
  assert.deepEqual(await response.json(), { verified: true });
  const sent = await h
    .load("app/api/auth/send-verification/route")
    .POST(mutation({ email: "user@example.com" }));
  assert.deepEqual(await sent.json(), { accepted: true });
});

test("recovery provider outages remain generic service failures", async () => {
  const h = harness({
    neon: {
      requestPasswordReset: async () => {
        throw new Error("private upstream detail");
      },
    },
  });
  const response = await h
    .load("app/api/auth/forgot-password/route")
    .POST(mutation({ email: "user@example.com" }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes("private upstream detail"));
});

const publicationState = {
  owner_id: "account-a",
  is_published: true,
  has_unpublished_changes: false,
  revision: 3,
  published_at: "2026-10-24T00:00:00Z",
  profile_complete: true,
  has_work: false,
};

test("publication proxy requires a session and never trusts supplied owner fields", async () => {
  let called = 0;
  const h = harness({
    fetch: async () => {
      called++;
      return Response.json(publicationState);
    },
  });
  assert.equal((await h.load("app/api/portfolio/route").GET()).status, 401);
  assert.equal(called, 0);
  h.jar.set("portfolio-admin", { value: "account-token" });
  const handler = h.load("app/api/portfolio/[action]/route");
  const context = { params: Promise.resolve({ action: "publish" }) };
  assert.equal(
    (
      await handler.POST(
        mutation({ revision: 3, owner_id: "another-account" }),
        context
      )
    ).status,
    400
  );
  assert.equal(
    (
      await handler.POST(
        mutation({ revision: 3 }, { Origin: "https://evil.example" }),
        context
      )
    ).status,
    403
  );
  assert.equal(
    (await handler.POST(mutation({ revision: -1 }), context)).status,
    400
  );
  assert.equal(
    (
      await handler.POST(mutation({ revision: 3 }), {
        params: Promise.resolve({ action: "../auth" }),
      })
    ).status,
    404
  );
  assert.equal(called, 0);
});

test("publication forwards only the saved revision with the managed bearer token", async () => {
  const h = harness({
    fetch: async (url, init) => {
      assert.equal(url, "http://localhost:8000/api/v1/portfolio/publish");
      assert.equal(init.headers.Authorization, "Bearer account-token");
      assert.deepEqual(JSON.parse(init.body), { revision: 3 });
      return Response.json(publicationState);
    },
  });
  h.jar.set("portfolio-admin", { value: "account-token" });
  const result = await h
    .load("app/api/portfolio/[action]/route")
    .POST(mutation({ revision: 3 }), {
      params: Promise.resolve({ action: "publish" }),
    });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), publicationState);
  assert.equal(result.headers.get("cache-control"), "no-store");
});

test("stale publication conflicts preserve their retryable status and hide upstream details", async () => {
  const h = harness({
    fetch: async () =>
      Response.json({ detail: "private upstream message" }, { status: 409 }),
  });
  h.jar.set("portfolio-admin", { value: "account-token" });
  const result = await h
    .load("app/api/portfolio/[action]/route")
    .POST(mutation({ revision: 3 }), {
      params: Promise.resolve({ action: "publish" }),
    });
  assert.equal(result.status, 409);
  const body = await result.text();
  assert.ok(body.includes("Refresh the preview"));
  assert.ok(!body.includes("private upstream"));
});

test("workspace distinguishes provider outages from missing and expired sessions", async () => {
  for (const token of [
    async () => {
      throw new Error("private provider detail");
    },
    async () => ({ data: null, error: { status: 503 } }),
  ]) {
    const h = harness({ neon: { token } });
    assert.equal(await h.load("lib/workspace").workspaceSession(), null);
  }
  const absent = harness({
    neon: { token: async () => ({ data: null, error: null }) },
  });
  await assert.rejects(
    absent.load("lib/workspace").workspaceSession(),
    /redirect:\/auth\/signin/
  );
  const expired = harness({
    neon: { token: async () => ({ data: null, error: { status: 401 } }) },
  });
  await assert.rejects(
    expired.load("lib/workspace").workspaceSession(),
    /redirect:\/auth\/signin/
  );
});

test("workspace backend outages retain the service state while rejected tokens request sign-in", async () => {
  for (const status of [502, 503, 401]) {
    const h = harness({
      neon: {
        token: async () => ({ data: { token: "managed-token" }, error: null }),
      },
      fetch: async () => new Response("{}", { status }),
    });
    const pending = h.load("lib/workspace").workspaceSession();
    if (status === 401)
      await assert.rejects(pending, /redirect:\/auth\/signin/);
    else assert.equal(await pending, null);
  }
});
