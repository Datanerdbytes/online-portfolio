import { execFileSync, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

const allFiles = process.argv.includes("--all");
const files = execFileSync(
  "git",
  allFiles
    ? ["ls-files", "-z"]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean);
const filesToCheck = files.filter((file) => file !== ".secrets.baseline");

const maximumBytes = 5 * 1024 * 1024;
const largeFiles = [];
for (const file of filesToCheck) {
  try {
    if (statSync(file).size > maximumBytes) {
      largeFiles.push(file);
    }
  } catch (error) {
    console.error(
      `Could not inspect ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

if (largeFiles.length > 0) {
  console.error(
    `${allFiles ? "Tracked files" : "Staged files"} must be no larger than 5 MiB:`
  );
  for (const file of largeFiles) {
    console.error(
      `  ${file} (${(statSync(file).size / 1024 / 1024).toFixed(2)} MiB)`
    );
  }
  process.exitCode = 1;
}

const tomlFiles = filesToCheck.filter(
  (file) => path.extname(file).toLowerCase() === ".toml"
);
if (tomlFiles.length > 0) {
  const result = spawnSync(
    "uv",
    [
      "run",
      "--project",
      "apps/api",
      "--no-sync",
      "python",
      "-c",
      "import sys, tomllib; [tomllib.loads(open(path, 'rb').read().decode()) for path in sys.argv[1:]]",
      ...tomlFiles,
    ],
    { stdio: "inherit" }
  );

  if (result.error) {
    console.error(`Could not validate TOML files: ${result.error.message}`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
