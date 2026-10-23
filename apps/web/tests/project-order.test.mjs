import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(
    new URL("../src/lib/project-management.ts", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(code, {
  module: compiledModule,
  exports: compiledModule.exports,
});
const helpers = compiledModule.exports;
const projects = [
  { id: 16, slug: "portfolio", display_order: 30 },
  { id: 17, slug: "analytics", display_order: 30 },
  { id: 10, slug: "warehouse", display_order: 40 },
];
const saved = (drafts) => {
  const changes = helpers.changedOrders(projects, drafts).orders;
  const items = projects.map((p) => ({
    ...p,
    display_order:
      changes.find((e) => e.slug === p.slug)?.display_order ?? p.display_order,
  }));
  return items
    .sort((a, b) => a.display_order - b.display_order || a.id - b.id)
    .map((p) => p.slug);
};
test("moving a tied-priority project to first survives save and server sorting", () => {
  const drafts = helpers.moveProjectToPosition(projects, {}, "analytics", 0);
  assert.deepEqual(saved(drafts), ["analytics", "portfolio", "warehouse"]);
});
test("position three means third even when stored priority is thirty", () => {
  const drafts = helpers.moveProjectToPosition(projects, {}, "portfolio", 2);
  assert.deepEqual(saved(drafts), ["analytics", "warehouse", "portfolio"]);
});
test("consecutive moves use the pending order and do not mutate source data", () => {
  const original = JSON.stringify(projects);
  let drafts = helpers.moveProjectToPosition(projects, {}, "warehouse", 0);
  drafts = helpers.moveProjectToPosition(projects, drafts, "portfolio", 2);
  assert.deepEqual(saved(drafts), ["warehouse", "analytics", "portfolio"]);
  assert.equal(JSON.stringify(projects), original);
});
test("moving at maximum priorities does not overflow the database integer", () => {
  const items = projects.map((p) => ({
    ...p,
    display_order: helpers.MAX_ORDER,
  }));
  const drafts = helpers.moveProjectToPosition(items, {}, "warehouse", 0);
  const changes = helpers.changedOrders(items, drafts);
  assert.equal(changes.error, null);
  assert.ok(changes.orders.every((p) => p.display_order <= helpers.MAX_ORDER));
});

test("an adjacent move in a large collection only changes the necessary projects", () => {
  const items = Array.from({ length: 101 }, (_, i) => ({
    id: i + 1,
    slug: `p-${i}`,
    display_order: i * 10,
  }));
  const drafts = helpers.moveProjectToPosition(items, {}, "p-1", 0);
  const changes = helpers.changedOrders(items, drafts);
  assert.equal(changes.error, null);
  assert.equal(changes.orders.length, 2);
});
test("invalid and unchanged positions do not create pending changes", () => {
  for (const position of [-1, 3, 1.5, 0]) {
    const drafts = helpers.moveProjectToPosition(
      projects,
      {},
      "portfolio",
      position
    );
    assert.equal(helpers.changedOrders(projects, drafts).orders.length, 0);
  }
});
