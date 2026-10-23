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

export function validateResponse(kind, path, body) {
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
  if (path.endsWith("/health") || path.endsWith("/ready")) {
    if (data.status !== "ok") throw new Error("Health/readiness check failed.");
  } else if (path.endsWith("/resume")) {
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
          "/api/v1/resume",
          "/api/v1/projects",
        ]
      : ["/", "/api/health", "/api/resume", "/api/projects"];
  if (!["api", "web"].includes(kind)) throw new Error("Expected api or web.");
  for (const path of paths) {
    validateResponse(kind, path, request(path, origin));
    console.log(`${kind} ${path}: passed`);
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
            "--fail",
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
