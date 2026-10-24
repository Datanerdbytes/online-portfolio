import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function compile(path, globals = {}) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }
  ).outputText;
  vm.runInNewContext(code, {
    module: compiled,
    exports: compiled.exports,
    console,
    ...globals,
  });
  return compiled.exports;
}
const mapping = compile("lib/resume-import");
test("duplicate suggestions require unique normalized identities", () => {
  const candidate = {
    section: "experience",
    values: { role: "Engineer", organization: "Example", started: "2024-01" },
  };
  const match = {
    id: 1,
    values: { role: " engineer ", organization: "Example", started: "2024-01" },
  };
  assert.equal(mapping.suggestedTarget(candidate, [match]), 1);
  assert.equal(
    mapping.suggestedTarget(candidate, [match, { ...match, id: 2 }]),
    null
  );
  assert.equal(
    mapping.suggestedTarget(
      { ...candidate, values: { ...candidate.values, started: "2024" } },
      [match]
    ),
    null
  );
});
function harness(options = {}) {
  let calls = [];
  let cancelled = false;
  const route = compile("app/api/resume-import/[action]/route", {
    require: (id) => {
      if (id === "@/lib/resume-import")
        return { IMPORT_MAX_BYTES: 3 * 1024 * 1024 };
      if (id === "@/lib/auth")
        return {
          validateMutation: () => options.csrf ?? null,
          readAdminToken: async () =>
            options.token === false ? null : "owner-token",
          authErrorResponse: (status, detail) =>
            Response.json({ detail }, { status }),
        };
      throw new Error(id);
    },
    process: { env: { API_BASE_URL: "http://api.test" } },
    setTimeout,
    clearTimeout,
    AbortController,
    Response,
    Request,
    Headers,
    Uint8Array,
    ReadableStream,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return (
        options.response ??
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  '{"stage":"reading"}\n{"stage":"ready"}\n'
                )
              );
              controller.close();
            },
            cancel() {
              cancelled = true;
            },
          })
        )
      );
    },
  });
  return { route, calls, cancelled: () => cancelled };
}
const context = (action) => ({ params: Promise.resolve({ action }) });
test("import proxy rejects absent sessions and CSRF before forwarding uploads", async () => {
  for (const options of [
    { token: false },
    { csrf: { status: 403, detail: "Request not permitted" } },
  ]) {
    const h = harness(options);
    const result = await h.route.POST(
      new Request("http://web.test/api/resume-import/analyze", {
        method: "POST",
        body: "data",
      }),
      context("analyze")
    );
    assert.equal(result.status, options.token === false ? 401 : 403);
    assert.equal(h.calls.length, 0);
  }
});
test("import proxy bounds upload streams and preserves server progress", async () => {
  const h = harness();
  const data = new FormData();
  data.set("consent", "true");
  data.set("file", new Blob(["synthetic"]), "resume.pdf");
  const result = await h.route.POST(
    new Request("http://web.test/api/resume-import/analyze", {
      method: "POST",
      body: data,
    }),
    context("analyze")
  );
  assert.equal(result.status, 200);
  assert.match(await result.text(), /"stage":"reading"/);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(h.calls[0].init.headers.Authorization, "Bearer owner-token");
  const tooLarge = await h.route.POST(
    new Request("http://web.test/api/resume-import/analyze", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: new Uint8Array(3 * 1024 * 1024 + 65537),
    }),
    context("analyze")
  );
  assert.equal(tooLarge.status, 413);
  assert.equal(h.calls.length, 1);
});
test("context is authenticated and provider errors are sanitized", async () => {
  const h = harness({
    response: Response.json(
      { detail: "upstream private contents" },
      { status: 503 }
    ),
  });
  const result = await h.route.GET(
    new Request("http://web.test/api/resume-import/context"),
    context("context")
  );
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /private contents/);
  assert.equal(
    (
      await h.route.GET(
        new Request("http://web.test/api/resume-import/apply"),
        context("apply")
      )
    ).status,
    404
  );
});
