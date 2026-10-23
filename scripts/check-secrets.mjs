import { execFileSync, spawnSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => file && file !== ".secrets.baseline");

const result = spawnSync(
  "uv",
  [
    "run",
    "--project",
    "apps/api",
    "detect-secrets-hook",
    "--baseline",
    ".secrets.baseline",
    ...files,
  ],
  { stdio: "inherit" }
);

if (result.error) {
  console.error(`Could not run the secrets scanner: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
