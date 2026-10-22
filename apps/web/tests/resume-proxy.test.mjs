import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

class NextResponse extends Response {
  static json(body, init) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }
}

function loadProxy(fetch) {
  const source = readFileSync(
    new URL("../src/app/api/resume/[...path]/route.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      require: (id) => {
        if (id === "next/server") return { NextResponse };
        if (id === "@/lib/auth") {
          return {
            validateMutation: () => null,
            readAdminToken: async () => "test-bearer-token",
          };
        }
        if (id === "@/lib/api") return { API_BASE_URL: "http://api.test" };
        throw new Error(`Unexpected import: ${id}`);
      },
      fetch,
      setTimeout,
      clearTimeout,
      AbortController,
      Request,
      Response,
      Headers,
    },
    { filename: "resume-proxy" },
  );
  return compiledModule.exports;
}

test("public resume route provides the base path used to refresh resume data", async () => {
  const source = readFileSync(
    new URL("../src/app/api/resume/route.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  let upstreamRequest;
  const compiledModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      require: (id) => {
        if (id === "next/server") return { NextResponse };
        if (id === "@/lib/api") return { API_BASE_URL: "http://api.test" };
        throw new Error(`Unexpected import: ${id}`);
      },
      fetch: async (url, init) => {
        upstreamRequest = { url, init };
        return Response.json({ profile: { name: "Test" }, skills: [] });
      },
      setTimeout,
      clearTimeout,
      AbortController,
      Request,
      Response,
      Headers,
    },
    { filename: "resume-root-proxy" },
  );

  const response = await compiledModule.exports.GET(
    new Request("http://localhost:3000/api/resume"),
  );

  assert.equal(response.status, 200);
  assert.equal(upstreamRequest.url, "http://api.test/api/v1/resume");
  assert.equal(upstreamRequest.init.method, "GET");
  assert.equal(upstreamRequest.init.cache, "no-store");
  assert.deepEqual(await response.json(), {
    profile: { name: "Test" },
    skills: [],
  });
});

test("resume POST proxy forwards the idempotency key to FastAPI", async () => {
  let upstreamRequest;
  const { POST } = loadProxy(async (url, init) => {
    upstreamRequest = { url, init };
    return Response.json(
      { id: 4, item: "Python", display_order: 1 },
      { status: 201 },
    );
  });

  const request = new Request(
    "http://localhost:3000/api/resume/skills/2/items",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "X-Requested-With": "online-resume-admin",
        "Content-Type": "application/json",
        "Idempotency-Key": "a49ca978-f74c-46d9-9462-41ddc513f66c",
      },
      body: JSON.stringify({ item: "Python", display_order: 1 }),
    },
  );

  const response = await POST(request, {
    params: Promise.resolve({ path: ["skills", "2", "items"] }),
  });

  assert.equal(response.status, 201);
  assert.equal(
    upstreamRequest.init.headers["Idempotency-Key"],
    "a49ca978-f74c-46d9-9462-41ddc513f66c",
  );
  assert.equal(
    upstreamRequest.init.headers.Authorization,
    "Bearer test-bearer-token",
  );
});

test("resume DELETE proxy forwards skill-item deletion to FastAPI", async () => {
  let upstreamRequest;
  const { DELETE } = loadProxy(async (url, init) => {
    upstreamRequest = { url, init };
    return new Response(null, { status: 204 });
  });
  assert.equal(typeof DELETE, "function");

  const request = new Request(
    "http://localhost:3000/api/resume/skills/items/47",
    {
      method: "DELETE",
      headers: {
        Origin: "http://localhost:3000",
        "X-Requested-With": "online-resume-admin",
      },
    },
  );

  const response = await DELETE(request, {
    params: Promise.resolve({ path: ["skills", "items", "47"] }),
  });

  assert.equal(response.status, 204);
  assert.equal(upstreamRequest.url, "http://api.test/api/v1/resume/skills/items/47");
  assert.equal(upstreamRequest.init.method, "DELETE");
});
