import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function deploymentUrl(value) {
  const result = JSON.parse(value);
  // The CLI wraps JSON in agent mode and returns the deployment directly in CI.
  const deployment = result.deployment ?? result;
  if (
    (result.status !== undefined && result.status !== "ok") ||
    deployment.readyState !== "READY"
  ) {
    throw new Error("Deployment is not ready; refusing promotion.");
  }
  const url = new URL(deployment.url);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.origin !== deployment.url
  ) {
    throw new Error("Unexpected deployment origin; refusing promotion.");
  }
  return url.origin;
}

export function parseResponse(raw) {
  if (typeof raw === "object" && raw !== null && "body" in raw) {
    return raw;
  }
  const str = String(raw);
  const match = str.match(/\n__STATUS__:(\d{3})$/);
  if (match) {
    return {
      status: parseInt(match[1], 10),
      body: str.slice(0, match.index),
    };
  }
  return { status: 200, body: str };
}

export function validateResponse(kind, path, rawResponse) {
  const { status, body } = parseResponse(rawResponse);

  if (body.includes("Sign in")) {
    throw new Error("Authentication or sign-in screen detected.");
  }

  if (path.endsWith("/health") || path.endsWith("/ready")) {
    if (status !== 200) {
      throw new Error(`${kind} ${path} returned HTTP ${status}`);
    }
    const data = JSON.parse(body);
    if (data.status !== "ok") throw new Error("Health/readiness check failed.");
    return;
  }

  // When no portfolio has been published in a clean database:
  if (status === 404) {
    if (path === "/") {
      return;
    }
    const data = JSON.parse(body);
    if (data.detail !== "Portfolio not published") {
      throw new Error(`Unexpected 404 response on ${path}: ${body}`);
    }
    return;
  }

  if (status !== 200) {
    throw new Error(`${kind} ${path} returned unexpected HTTP ${status}`);
  }

  if (path === "/") {
    if (
      !body.includes('id="main-content"') ||
      !body.includes('id="projects"')
    ) {
      throw new Error("Portfolio homepage did not render.");
    }
    return;
  }
  const data = JSON.parse(body);
  if (path.endsWith("/resume")) {
    if (!data.profile?.name || !Array.isArray(data.skills)) {
      throw new Error("Resume read did not return stored profile data.");
    }
  } else if (path.endsWith("/projects")) {
    if (
      !Array.isArray(data.items) ||
      !data.items.every(
        (item) =>
          item &&
          typeof item.slug === "string" &&
          typeof item.title === "string" &&
          Array.isArray(item.technologies)
      )
    ) {
      throw new Error(`${kind} project read returned an invalid response.`);
    }
  } else {
    throw new Error("Unknown smoke check.");
  }
}

export function smoke(kind, origin, request) {
  const paths =
    kind === "api"
      ? [
          "/api/v1/health",
          "/api/v1/ready",
          "/api/v1/public/resume",
          "/api/v1/public/projects",
        ]
      : ["/", "/api/health", "/api/public/resume", "/api/public/projects"];
  if (!["api", "web"].includes(kind)) throw new Error("Expected api or web.");
  for (const path of paths) {
    const response = parseResponse(request(path, origin));
    validateResponse(kind, path, response);
    const detail = response.status === 404 ? " (clean database: 404)" : "";
    console.log(`${kind} ${path}: passed${detail}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [kind, target] = process.argv.slice(2);
  try {
    const origin = target?.startsWith("https://")
      ? target
      : deploymentUrl(readFileSync(target, "utf8"));
    if (kind === "url") {
      console.log(origin);
    } else {
      smoke(kind, origin, (path, url) =>
        execFileSync(
          "vercel",
          [
            "--scope",
            "datanerdbytes-4121",
            "curl",
            path,
            "--deployment",
            url,
            "--",
            "-w",
            "\n__STATUS__:%{http_code}",
            "--silent",
            "--show-error",
            "--max-time",
            "30",
            "--retry",
            "2",
            "--retry-delay",
            "1",
            "--retry-all-errors",
          ],
          {
            cwd: kind === "api" ? "apps/api" : ".",
            encoding: "utf8",
            timeout: 120_000,
            maxBuffer: 4 * 1024 * 1024,
          }
        )
      );
    }
  } catch {
    // Keep credential-bearing response bodies and CLI errors out of CI logs.
    console.error(
      "Deployment smoke check failed; inspect the deployment's health and data routes."
    );
    process.exitCode = 1;
  }
}
