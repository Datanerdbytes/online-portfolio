import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Render the real components with only the module loader replaced. React and
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
  const { ProjectSaveButton } = load("components/project-save-button");
  const { createElement } = require("react");
  return renderToStaticMarkup(createElement(ProjectSaveButton, props));
}

test("the edit button keeps its idle label and shows no spinner", () => {
  const html = render({ mode: "edit", saving: false, disabled: false });
  assert.match(html, /Save project details/);
  assert.equal(html.includes("animate-spin"), false);
  assert.equal(html.includes("<svg"), false);
});

test("the create button keeps its idle label and shows no spinner", () => {
  const html = render({ mode: "create", saving: false, disabled: false });
  assert.match(html, /Create project/);
  assert.equal(html.includes("animate-spin"), false);
});

test("saving shows a spinner beside the saving label", () => {
  const html = render({ mode: "edit", saving: true, disabled: true });
  assert.match(html, /Saving…/);
  assert.match(html, /animate-spin/);
  assert.match(html, /<svg/);
});

test("the spinner is decorative so the label carries the state", () => {
  const html = render({ mode: "edit", saving: true, disabled: true });
  assert.match(html, /aria-hidden="true"/);
  assert.equal(/aria-label/.test(html), false);
});

test("reduced motion stops the spinner animation", () => {
  const html = render({ mode: "edit", saving: true, disabled: true });
  assert.match(html, /motion-reduce:animate-none/);
});

test("the button is disabled while saving", () => {
  const html = render({ mode: "edit", saving: true, disabled: true });
  assert.equal(html.includes('disabled=""'), true);
  const enabled = render({ mode: "edit", saving: false, disabled: false });
  assert.equal(enabled.includes('disabled=""'), false);
});
