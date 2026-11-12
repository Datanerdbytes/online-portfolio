import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Render the real component with only the module loader replaced. React and
// react-dom are the real packages, so the markup is what a browser receives.
function load(relative) {
  const base = new URL("../src/", import.meta.url);
  const source = readFileSync(
    existsSync(new URL(`${relative}.tsx`, base))
      ? new URL(`${relative}.tsx`, base)
      : new URL(`${relative}.ts`, base),
    "utf8"
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, {
    module: compiledModule,
    exports: compiledModule.exports,
    require(id) {
      if (id === "@/components/ui/button") return load("components/ui/button");
      if (id === "@/components/ui/spinner")
        return load("components/ui/spinner");
      if (id === "@/lib/utils") return load("lib/utils");
      return require(id);
    },
  });
  return compiledModule.exports;
}

function render(props) {
  const { PublishChangesButton } = load("components/publish-changes-button");
  const { createElement } = require("react");
  return renderToStaticMarkup(createElement(PublishChangesButton, props));
}

const liveStatus = {
  owner_id: "owner-1",
  is_published: true,
  has_unpublished_changes: true,
  revision: 3,
  published_at: "2026-01-01T00:00:00.000Z",
  profile_complete: true,
  has_work: true,
};

const props = (overrides = {}) => ({
  status: liveStatus,
  publishing: false,
  disabled: false,
  onPublish: () => {},
  ...overrides,
});

test("nothing renders until the loaded status reports unpublished changes on a live portfolio", () => {
  assert.equal(render(props({ status: null })), "");
  assert.equal(
    render(
      props({
        status: { ...liveStatus, is_published: false },
      })
    ),
    ""
  );
  assert.equal(
    render(
      props({
        status: { ...liveStatus, has_unpublished_changes: false },
      })
    ),
    ""
  );
  assert.equal(
    render(
      props({
        status: { ...liveStatus, profile_complete: false },
      })
    ),
    ""
  );
});

test("a live portfolio with unpublished changes gets a one-click publish button", () => {
  const html = render(props());
  assert.match(html, /Publish changes/);
  assert.equal(html.includes("animate-spin"), false);
  assert.equal(html.includes('disabled=""'), false);
});

test("publishing shows a spinner beside the publishing label and locks the button", () => {
  const html = render(props({ publishing: true }));
  assert.match(html, /Publishing…/);
  assert.match(html, /animate-spin/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal(html.includes('disabled=""'), true);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(/aria-label/.test(html), false);
});

test("other in-flight writes disable the button without changing its label", () => {
  const html = render(props({ disabled: true }));
  assert.match(html, /Publish changes/);
  assert.equal(html.includes('disabled=""'), true);
  assert.equal(html.includes("animate-spin"), false);
});
