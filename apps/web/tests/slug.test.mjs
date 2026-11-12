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

const management = compile("lib/project-management");
const slug = compile("lib/slug", {
  require: (id) => {
    if (id === "@/lib/project-management") return management;
    throw new Error(id);
  },
});

test("slugify produces lowercase single-hyphen slugs", () => {
  assert.equal(slug.slugify("Senior Data Engineer"), "senior-data-engineer");
  assert.equal(slug.slugify("  Hello -- World!!  "), "hello-world");
  assert.equal(slug.slugify("Über Role (2024)"), "uber-role-2024");
  assert.equal(slug.slugify("   "), "");
});

test("slugify truncates to 100 characters without a trailing hyphen", () => {
  const long = "role ".repeat(40).trim();
  const result = slug.slugify(long);
  assert.ok(result.length <= 100);
  assert.ok(!result.endsWith("-"));
});

test("generateSlug is collision-safe with -2, -3 suffixes", () => {
  assert.equal(
    slug.generateSlug(["Backend Engineer"], ["backend-engineer"]),
    "backend-engineer-2"
  );
  assert.equal(
    slug.generateSlug(
      ["Backend Engineer"],
      ["backend-engineer", "backend-engineer-2"]
    ),
    "backend-engineer-3"
  );
  assert.equal(slug.generateSlug(["Acme Corp", "SRE"], []), "acme-corp-sre");
});

test("generateSlug handles empty parts and exhausting suffixes honestly", () => {
  assert.equal(slug.generateSlug([], []), "");
  assert.equal(slug.generateSlug(["   "], []), "");
  const taken = new Set(["x"]);
  for (let n = 2; n < 1000; n += 1) taken.add(`x-${n}`);
  // When every suffix is taken, the base is returned and the caller's
  // isSlug/uniqueness handling decides (backend rejects duplicates).
  assert.equal(slug.generateSlug(["x"], [...taken]), "x");
});
