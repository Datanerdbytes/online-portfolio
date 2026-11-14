import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);

async function themeToggleModule(globals = {}) {
  const source = readFileSync(
    new URL("../src/components/theme-toggle.tsx", import.meta.url),
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
    ...globals,
    module: compiledModule,
    exports: compiledModule.exports,
    require(id) {
      if (id === "lucide-react") return { Moon: "moon", Sun: "sun" };
      return require(id);
    },
  });
  return compiledModule.exports;
}

// A fresh document/localStorage/window pair recording the applied "light"
// class and the dispatched portfolio-theme events.
function themeSandbox(saved, events) {
  let light = false;
  const sandbox = {
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
  };
  return { sandbox, light: () => light };
}

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

test("theme initialization renders an inline script that runs before first paint", async () => {
  const script = await themeScript();
  const html = renderToStaticMarkup(script);
  // Server-rendered markup is what makes the script execute while the HTML is
  // parsed, before first paint. A client-injected script would flash the
  // default dark theme to users with a stored light theme on every load.
  assert.match(html, /^<script\b/);
  assert.ok(
    html.includes("classList.toggle('light'"),
    `unexpected theme script markup: ${html}`
  );
});

test("theme initialization stays consistent when re-executed during client layout recovery", async () => {
  const script = await themeScript();
  const payload = script.props.dangerouslySetInnerHTML.__html;
  for (const saved of ["light", "dark", null]) {
    let light = false;
    const events = [];
    // A client-side recovery re-render can execute the payload a second time;
    // the forced toggle must land on the saved preference again, never flip it.
    for (let run = 0; run < 2; run += 1) {
      vm.runInNewContext(payload, {
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
            return saved;
          },
        },
        window: {
          dispatchEvent: (event) => events.push({ type: event.type, light }),
        },
        Event,
      });
    }
    assert.equal(events.length, 2);
    assert.equal(events.at(-1).light, saved === "light");
  }
});

for (const saved of ["light", "dark", null, "unrecognized", "blocked"]) {
  test(`theme recovery helper matches the inline payload: ${saved}`, async () => {
    const script = await themeScript();
    const payloadEvents = [];
    const payloadBox = themeSandbox(saved, payloadEvents);
    vm.runInNewContext(
      script.props.dangerouslySetInnerHTML.__html,
      payloadBox.sandbox
    );

    const helperEvents = [];
    const helperBox = themeSandbox(saved, helperEvents);
    const toggle = await themeToggleModule(helperBox.sandbox);
    toggle.applyStoredTheme();

    // The mount-time recovery path must apply exactly what the first-paint
    // payload applies, event behavior included.
    assert.equal(payloadBox.light(), saved === "light");
    assert.equal(helperBox.light(), saved === "light");
    assert.deepEqual(helperEvents, payloadEvents);
  });
}

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
