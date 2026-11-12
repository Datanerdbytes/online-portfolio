import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const {
  HeadManagerContext,
} = require("next/dist/shared/lib/head-manager-context.shared-runtime");

async function themeScript() {
  const source = readFileSync(
    new URL("../src/app/layout.tsx", import.meta.url),
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
      if (id === "next/font/google") {
        const font = () => ({ variable: "font-test" });
        return { Geist: font, Geist_Mono: font, Poppins: font };
      }
      if (id === "@/lib/resume-server") {
        const missing = async () => ({ status: "missing" });
        return { getAboutState: missing, getContactState: missing };
      }
      if (id === "@/lib/resume") return { isAbsoluteHttpUrl: () => true };
      if (id === "@/components/site-frame") return { SiteFrame: "div" };
      if (id === "@/components/header") return { Header: "header" };
      if (id === "@/components/social-links")
        return { SocialLinks: "div", SocialGradientDefs: "svg" };
      if (id === "./globals.css") return {};
      return require(id);
    },
  });
  const layout = await compiledModule.exports.default({ children: null });
  return layout.props.children.props.children.find(
    (child) => child?.props?.id === "theme-init"
  );
}

test("theme initialization does not render an inert script during client layout recovery", async () => {
  const script = await themeScript();
  const html = renderToStaticMarkup(
    React.createElement(
      HeadManagerContext.Provider,
      { value: { appDir: true } },
      script
    )
  );
  assert.equal(html, "");
  assert.equal(script.props.strategy, "afterInteractive");
});

for (const saved of ["light", "dark", null, "unrecognized", "blocked"]) {
  test(`theme initialization synchronizes the toggle with saved preference: ${saved}`, async () => {
    const script = await themeScript();
    let light = false;
    const events = [];
    vm.runInNewContext(script.props.dangerouslySetInnerHTML.__html, {
      document: {
        documentElement: {
          classList: {
            toggle(name, enabled) {
              assert.equal(name, "light");
              light = enabled;
            },
          },
        },
      },
      localStorage: {
        getItem(key) {
          assert.equal(key, "portfolio-theme");
          if (saved === "blocked") throw new Error("Storage unavailable");
          return saved;
        },
      },
      window: {
        dispatchEvent: (event) => events.push({ type: event.type, light }),
      },
      Event,
    });
    assert.equal(light, saved === "light");
    assert.deepEqual(events, [
      { type: "portfolio-theme", light: saved === "light" },
    ]);
  });
}
