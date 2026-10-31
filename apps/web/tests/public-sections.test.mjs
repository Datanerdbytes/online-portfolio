import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const PROFILE = {
  id: 1,
  name: "Ada Lovelace",
  headline: "Data engineer",
  introduction: "An introduction.",
  about: "A background.",
  location: null,
  avatar_url: null,
  avatar_updated_at: null,
  avatar_content_type: null,
  banner_url: null,
  banner_updated_at: null,
  banner_content_type: null,
};

const CONTACT = { id: 1, phone: null, email: "ada@example.com", links: [] };

function loadResumeServer(fetch) {
  const source = readFileSync(
    new URL("../src/lib/resume-server.ts", import.meta.url),
    "utf8"
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      require: (id) => {
        if (id === "server-only") return {};
        if (id === "react") return { cache: (fn) => fn };
        if (id === "@/lib/api") return { API_BASE_URL: "http://api.test" };
        throw new Error(`Unexpected import: ${id}`);
      },
      fetch,
      Response,
      Headers,
      AbortSignal,
      Promise,
      JSON,
      URL,
    },
    { filename: "resume-server" }
  );
  return compiledModule.exports;
}

test("section reads use the default and per-user public mounts", async () => {
  const calls = [];
  const { getAboutState } = loadResumeServer(async (url, init) => {
    calls.push({ url, init });
    return Response.json(PROFILE);
  });

  await getAboutState(null);
  await getAboutState("owner-1");

  assert.equal(calls[0].url, "http://api.test/api/v1/public/about");
  assert.equal(
    calls[1].url,
    "http://api.test/api/v1/public/users/owner-1/about"
  );
  assert.equal(calls[0].init.cache, "no-store");
});

test("a 404 section is reported as missing", async () => {
  const { getSkillsState } = loadResumeServer(async () =>
    Response.json({ detail: "Portfolio not published" }, { status: 404 })
  );

  assert.equal((await getSkillsState(null)).status, "missing");
});

test("upstream errors and malformed payloads are unavailable", async () => {
  const failing = loadResumeServer(async () =>
    Response.json({ detail: "boom" }, { status: 500 })
  );
  assert.equal((await failing.getExperienceState(null)).status, "unavailable");

  const malformed = loadResumeServer(async () =>
    Response.json({ items: "not-a-list" })
  );
  assert.equal((await malformed.getEducationState(null)).status, "unavailable");

  const badProfile = loadResumeServer(async () => Response.json({ id: 1 }));
  assert.equal((await badProfile.getAboutState(null)).status, "unavailable");
});

test("network failures are unavailable", async () => {
  const { getContactState } = loadResumeServer(async () => {
    throw new Error("connection refused");
  });

  assert.equal((await getContactState(null)).status, "unavailable");
});

test("loadPublicResumeSections assembles the five section payloads", async () => {
  const payloads = {
    "/api/v1/public/about": PROFILE,
    "/api/v1/public/skills": {
      items: [
        {
          id: 7,
          label: "Languages",
          display_order: 0,
          items: [{ id: 9, item: "Python", display_order: 0 }],
        },
      ],
    },
    "/api/v1/public/experience": { items: [] },
    "/api/v1/public/education": { items: [] },
    "/api/v1/public/contact": CONTACT,
  };
  const { loadPublicResumeSections } = loadResumeServer(async (url) => {
    const payload = payloads[new URL(url).pathname];
    return Response.json(payload ?? { detail: "unexpected path" }, {
      status: payload ? 200 : 404,
    });
  });

  const state = await loadPublicResumeSections(null);
  assert.equal(state.status, "ok");
  assert.equal(state.data.profile.name, "Ada Lovelace");
  assert.equal(state.data.skills[0].items[0].item, "Python");
  assert.deepEqual(state.data.experience, []);
  assert.deepEqual(state.data.education, []);
  assert.equal(state.data.contact.email, "ada@example.com");
});

test("a missing section misses the whole portfolio; missing contact is allowed", async () => {
  const base = {
    "/api/v1/public/about": PROFILE,
    "/api/v1/public/skills": { items: [] },
    "/api/v1/public/experience": { items: [] },
    "/api/v1/public/education": { items: [] },
  };

  const missingEducation = loadResumeServer(async (url) => {
    const path = new URL(url).pathname;
    return path.endsWith("/education")
      ? Response.json({ detail: "Portfolio not published" }, { status: 404 })
      : Response.json(base[path]);
  });
  assert.equal(
    (await missingEducation.loadPublicResumeSections(null)).status,
    "missing"
  );

  const withoutContact = loadResumeServer(async (url) => {
    const path = new URL(url).pathname;
    return path.endsWith("/contact")
      ? Response.json({ detail: "Portfolio not published" }, { status: 404 })
      : Response.json(base[path]);
  });
  const state = await withoutContact.loadPublicResumeSections(null);
  assert.equal(state.status, "ok");
  assert.equal(state.data.contact, null);
});

test("an unavailable section makes the portfolio unavailable", async () => {
  const { loadPublicResumeSections } = loadResumeServer(async (url) =>
    url.endsWith("/skills")
      ? Response.json({ detail: "boom" }, { status: 503 })
      : Response.json(PROFILE)
  );

  assert.equal((await loadPublicResumeSections(null)).status, "unavailable");
});

test("project reads use the default and per-user public mounts", async () => {
  const calls = [];
  const { getProjectsState } = loadResumeServer(async (url) => {
    calls.push(url);
    return Response.json({ items: [] });
  });

  await getProjectsState(null);
  await getProjectsState("owner-1");

  assert.equal(calls[0], "http://api.test/api/v1/public/projects");
  assert.equal(
    calls[1],
    "http://api.test/api/v1/public/users/owner-1/projects"
  );
});

test("the projects section reports ok, missing and unavailable states", async () => {
  const project = {
    id: 1,
    slug: "pipeline",
    title: "Pipeline",
    summary: "A pipeline.",
    technologies: [],
    repository_url: null,
    demo_url: null,
    display_order: 0,
    is_sample: false,
  };

  const ok = loadResumeServer(async () => Response.json({ items: [project] }));
  const state = await ok.getProjectsState(null);
  assert.equal(state.status, "ok");
  assert.equal(state.data[0].slug, "pipeline");

  const missing = loadResumeServer(async () =>
    Response.json({ detail: "Portfolio not published" }, { status: 404 })
  );
  assert.equal((await missing.getProjectsState(null)).status, "missing");

  const malformed = loadResumeServer(async () =>
    Response.json({ items: null })
  );
  assert.equal((await malformed.getProjectsState(null)).status, "unavailable");
});
