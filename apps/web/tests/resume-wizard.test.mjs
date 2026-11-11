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

const wizard = compile("lib/resume-wizard");

test("steps keep the agreed seven-page order", () => {
  assert.deepEqual(
    [...wizard.STEPS],
    [
      "profile",
      "skills",
      "projects",
      "experience",
      "education",
      "contact",
      "review",
    ]
  );
  assert.equal(wizard.STEPS.length, 7);
  assert.equal(wizard.stepIndex("review"), 6);
});

test("parseStep accepts known values and falls back to profile", () => {
  assert.equal(wizard.parseStep("skills"), "skills");
  assert.equal(wizard.parseStep(["contact", "skills"]), "contact");
  assert.equal(wizard.parseStep("unknown"), "profile");
  assert.equal(wizard.parseStep(undefined), "profile");
  assert.equal(wizard.parseStep(null), "profile");
});

test("stepHref links back to the wizard step", () => {
  assert.equal(wizard.stepHref("projects"), "/admin/resume?step=projects");
});

test("nextReviewStep prefers sections missing details, then detected entries", () => {
  const summary = (status, detected = 0) => ({ status, detected });
  const summaries = {
    profile: summary("needs-details"),
    skills: summary("complete"),
    projects: summary("optional", 2),
    experience: summary("needs-details"),
    education: summary("empty"),
    contact: summary("empty"),
    review: summary("needs-details"),
  };
  assert.equal(wizard.nextReviewStep(summaries), "experience");
  summaries.experience = summary("complete");
  assert.equal(wizard.nextReviewStep(summaries), "projects");
  summaries.projects = summary("complete");
  assert.equal(wizard.nextReviewStep(summaries), "review");
});

test("sectionsForStep maps contact to contact and links", () => {
  assert.deepEqual(
    [...wizard.sectionsForStep("contact")],
    ["contact", "links"]
  );
  assert.deepEqual([...wizard.sectionsForStep("profile")], ["profile"]);
  assert.ok(wizard.sectionsForStep("review").includes("projects"));
  assert.ok(wizard.sectionsForStep("review").includes("links"));
});
