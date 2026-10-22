import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";

// The canonical skill list from the resume PDF. It is also encoded in
// apps/api/app/scripts/seed_resume.py, which is what writes the database the
// live API serves. The generated fallback must match it exactly.
const CANONICAL_SKILL_GROUPS = [
  [
    "Data Engineering & Cloud Warehousing",
    [
      "Medallion Architecture (Bronze/Silver/Gold)",
      "Google BigQuery",
      "Snowflake",
      "dbt Core",
      "Microsoft SQL Server",
      "PostgreSQL",
      "Star Schema Design",
      "ETL/ELT Pipelines",
      "Watermarking",
      "Cryptographic Hashing (SHA-256)",
    ],
  ],
  [
    "Programming & Tools",
    [
      "Python (Pandas, SQLAlchemy)",
      "T-SQL",
      "Docker",
      "Google Cloud Run",
      "GitHub Actions (CI/CD)",
      "uv",
      "Git/GitHub",
    ],
  ],
  [
    "Data Visualization & Analytics",
    [
      "Tableau (Desktop & Public)",
      "Plotly Dash",
      "Executive Dashboard Design",
      "Data Storytelling",
      "Advanced Excel (Power Query, Pivot Tables)",
    ],
  ],
  [
    "Core Strengths",
    [
      "Analytical Troubleshooting",
      "Pipeline Observability",
      "Cross-Functional Communication",
    ],
  ],
];

function loadStaticResume() {
  const source = readFileSync(
    new URL("../src/content/resume.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, {
    module: compiledModule,
    exports: compiledModule.exports,
    require: () => ({}),
  });
  return compiledModule.exports.resume;
}

const resume = loadStaticResume();

test("the fallback keeps every canonical skill group and item", () => {
  for (const [label, items] of CANONICAL_SKILL_GROUPS) {
    const group = resume.skills.find((entry) => entry.label === label);
    assert.ok(group, `missing skill group: ${label}`);
    assert.deepStrictEqual(
      Array.from(group.items).slice(0, items.length),
      items,
      `canonical order changed in "${label}"`,
    );
  }
});

test("no skill is listed twice inside a group", () => {
  for (const group of resume.skills) {
    const seen = new Set();
    for (const item of group.items) {
      assert.ok(
        !seen.has(item),
        `duplicate skill "${item}" in "${group.label}"`,
      );
      seen.add(item);
    }
  }
});

test("the collapsed Python and uv names are used", () => {
  const tools = resume.skills.find(
    (group) => group.label === "Programming & Tools",
  );
  const names = tools.items.map((item) => item.toLowerCase());
  assert.ok(names.includes("python (pandas, sqlalchemy)"));
  assert.ok(names.includes("uv"));
  assert.ok(!names.includes("python"), "bare Python must not be listed");
  assert.ok(!names.includes("uv "), "UV must be normalised to uv");
});

test("the fallback carries the published projects", () => {
  assert.ok(Array.isArray(resume.projects));
  assert.ok(resume.projects.length > 0, "expected at least one project");
  for (const project of resume.projects) {
    assert.ok(project.title, "project is missing a title");
    assert.ok(
      project.summary,
      `project "${project.title}" is missing a summary`,
    );
    assert.ok(Array.isArray(project.technologies));
  }
});
