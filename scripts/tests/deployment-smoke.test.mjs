import assert from "node:assert/strict";
import test from "node:test";
import {
  deploymentUrl,
  smoke,
  validateResponse,
} from "../deployment-smoke.mjs";

const deployment = (url, readyState = "READY") =>
  JSON.stringify({ status: "ok", deployment: { url, readyState } });

test("accept the CLI's plain CI JSON deployment format", () => {
  assert.equal(
    deploymentUrl(
      JSON.stringify({
        url: "https://portfolio-123.vercel.app",
        readyState: "READY",
      })
    ),
    "https://portfolio-123.vercel.app"
  );
  assert.throws(() =>
    deploymentUrl(
      JSON.stringify({
        url: "https://portfolio-123.vercel.app",
        readyState: "ERROR",
      })
    )
  );
});

test("only ready HTTPS Vercel origins can be promoted", () => {
  assert.equal(
    deploymentUrl(deployment("https://portfolio-123.vercel.app")),
    "https://portfolio-123.vercel.app"
  );
  for (const value of [
    deployment("https://portfolio-123.vercel.app", "ERROR"),
    deployment("http://portfolio-123.vercel.app"),
    deployment("https://vercel.app.evil.example"),
    deployment("https://portfolio-123.vercel.app/path"),
    JSON.stringify({ status: "error" }),
  ])
    assert.throws(() => deploymentUrl(value));
});

test("reject unavailable services, broken data contracts, and auth HTML", () => {
  for (const [path, body] of [
    ["/api/health", '{"status":"unavailable"}'],
    ["/api/v1/ready", '{"status":"unavailable"}'],
    ["/api/resume", '{"profile":null,"skills":[]}'],
    [
      "/api/projects",
      '{"items":[{"slug":"test","title":"Test","technologies":null}]}',
    ],
    ["/api/health", "<html>Sign in</html>"],
    ["/", "<html>Sign in</html>"],
  ])
    assert.throws(() => validateResponse("web", path, body));
});

test("check both the database-backed API and frontend proxy routes", () => {
  for (const kind of ["api", "web"]) {
    const calls = [];
    smoke(kind, "https://portfolio.vercel.app", (path) => {
      calls.push(path);
      if (path === "/")
        return '<main id="main-content"><section id="projects"></section></main>';
      if (path.endsWith("/resume"))
        return '{"profile":{"name":"Owner"},"skills":[]}';
      if (path.endsWith("/projects")) return '{"items":[]}';
      return '{"status":"ok"}';
    });
    assert.deepEqual(
      calls,
      kind === "api"
        ? [
            "/api/v1/health",
            "/api/v1/ready",
            "/api/v1/public/resume",
            "/api/v1/public/projects",
          ]
        : ["/", "/api/health", "/api/public/resume", "/api/public/projects"]
    );
  }
});

test("stop immediately if a request fails", () => {
  let calls = 0;
  assert.throws(() =>
    smoke("api", "https://portfolio.vercel.app", () => {
      calls++;
      throw new Error("HTTP 503");
    })
  );
  assert.equal(calls, 1);
});
