import { execFileSync, spawnSync } from "node:child_process";

const base = process.env.GITHUB_BASE_SHA;
let files;

if (base) {
  files = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`],
    { encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
} else {
  files = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"],
    { encoding: "utf8" }
  )
    .split("\0")
    .filter(Boolean);
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    {
      encoding: "utf8",
    }
  )
    .split("\0")
    .filter(Boolean);
  files = [...new Set([...files, ...untracked])];
}

const supportedExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
]);
const formatFiles = files.filter((file) =>
  supportedExtensions.has(file.slice(file.lastIndexOf(".")))
);
const pythonFiles = files.filter((file) => file.endsWith(".py"));

if (formatFiles.length === 0) {
  console.log("No changed files need Prettier validation.");
} else {
  const result = spawnSync("npx", ["prettier", "--check", ...formatFiles], {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Could not run Prettier: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

if (pythonFiles.length > 0) {
  const result = spawnSync(
    "uv",
    [
      "run",
      "--project",
      "apps/api",
      "ruff",
      "format",
      "--check",
      ...pythonFiles,
    ],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.error(`Could not run Ruff formatter: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
