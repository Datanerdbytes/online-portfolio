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

const mapping = compile("lib/resume-import");
const wizard = compile("lib/resume-wizard", {
  require: (id) => {
    if (id === "@/lib/resume-import") return mapping;
    throw new Error(id);
  },
});
const review = compile("lib/resume-review", {
  require: (id) => {
    if (id === "@/lib/resume-import") return mapping;
    if (id === "@/lib/resume-wizard") return wizard;
    throw new Error(id);
  },
  URL,
});

function context({
  profile = null,
  contact = null,
  skills = [],
  experience = [],
  education = [],
  projects = [],
} = {}) {
  return {
    resume: { profile, contact, skills, experience, education },
    projects: { items: projects },
    status: { revision: 5, profile_complete: false, owner_id: "owner" },
    enabled: true,
    can_read_locally: true,
  };
}

function candidate(section, values, extra = {}) {
  return {
    section,
    values,
    evidence: {},
    generated: [],
    warnings: [],
    ...extra,
  };
}

function active(section, values, ctx = context(), extra = {}) {
  return {
    ...review.makeReview(candidate(section, values, extra), ctx),
    active: true,
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("makeReview keeps profile and contact active and preselects empty fields", () => {
  const profile = review.makeReview(
    candidate(
      "profile",
      { name: "Ada", introduction: "Hello" },
      { generated: ["introduction"] }
    ),
    context()
  );
  assert.equal(profile.active, true);
  assert.equal(profile.target, null);
  assert.equal(profile.selected.name, true);
  assert.equal(profile.selected.introduction, false);
});

test("makeReview matches one existing entry and keeps populated fields unselected", () => {
  const ctx = context({
    skills: [{ id: 4, label: "Languages", items: [] }],
  });
  const skills = review.makeReview(
    candidate("skills", { label: "Languages", items: ["TypeScript"] }),
    ctx
  );
  assert.equal(skills.active, true);
  assert.equal(skills.target, 4);
  assert.equal(skills.selected.label, false);
  assert.equal(skills.selected.items, true);
});

test("makeReview includes only entries whose required values are present", () => {
  const ctx = context();
  assert.equal(
    review.makeReview(candidate("skills", { label: "Tools" }), ctx).active,
    true
  );
  assert.equal(
    review.makeReview(candidate("skills", { label: "" }), ctx).active,
    false
  );
  assert.equal(
    review.makeReview(
      candidate("projects", { title: "Pipeline", summary: "ETL" }),
      ctx
    ).active,
    true
  );
  assert.equal(
    review.makeReview(candidate("projects", { title: "Pipeline" }), ctx).active,
    false
  );
  assert.equal(
    review.makeReview(
      candidate("education", {
        qualification: "BSc",
        institution: "University",
      }),
      ctx
    ).active,
    true
  );
  assert.equal(
    review.makeReview(
      candidate("experience", { role: "Engineer", organization: "Acme" }),
      ctx
    ).active,
    false
  );
  assert.equal(
    review.makeReview(
      candidate("links", { label: "Portfolio", url: "https://example.com" }),
      ctx
    ).active,
    true
  );
});

test("includeReadyReview fills only unpopulated values and leaves AI fields unselected", () => {
  const ctx = context({
    skills: [{ id: 4, label: "Languages", items: [] }],
  });
  const base = review.makeReview(
    candidate(
      "skills",
      { label: "Languages", items: ["TypeScript"] },
      { generated: ["items"] }
    ),
    ctx
  );
  const inactive = {
    ...base,
    active: false,
    selected: { label: false, items: false },
  };
  const included = review.includeReadyReview(inactive, ctx);
  assert.equal(included.active, true);
  assert.equal(included.selected.label, false);
  assert.equal(included.selected.items, false);

  const plainItems = review.includeReadyReview(
    { ...inactive, candidate: { ...inactive.candidate, generated: [] } },
    ctx
  );
  assert.equal(plainItems.selected.items, true);

  const incomplete = review.includeReadyReview(
    {
      ...inactive,
      values: { label: "", items: [] },
      candidate: { ...inactive.candidate, values: { label: "", items: [] } },
    },
    ctx
  );
  assert.equal(incomplete.active, false);
});

test("excludeReview and skipMatchedReview deactivate the right entries", () => {
  const ctx = context({
    skills: [{ id: 4, label: "Languages", items: [] }],
  });
  const matched = review.makeReview(
    candidate("skills", { label: "Languages", items: [] }),
    ctx
  );
  assert.equal(review.skipMatchedReview(matched).active, false);
  const unmatched = review.makeReview(
    candidate("skills", { label: "Tools", items: [] }),
    ctx
  );
  assert.equal(review.skipMatchedReview(unmatched).active, true);
  assert.equal(review.excludeReview(matched).active, false);
});

test("issues report required, date, current-role, email, and URL problems", () => {
  const ctx = context();
  const missing = active(
    "experience",
    {
      role: "",
      organization: "Acme",
      started: "2024-01",
      ended: "2024-06",
      current: false,
    },
    ctx
  );
  assert.ok(
    review.issues(missing, ctx).includes("Role is required for this entry.")
  );

  const badDate = active(
    "experience",
    { role: "Engineer", organization: "Acme", started: "2024" },
    ctx
  );
  assert.ok(
    review
      .issues(badDate, ctx)
      .some((issue) => issue.includes("complete YYYY-MM"))
  );

  const openEnded = active(
    "experience",
    {
      role: "Engineer",
      organization: "Acme",
      started: "2024-01",
      current: false,
    },
    ctx
  );
  assert.ok(
    review
      .issues(openEnded, ctx)
      .some((issue) => issue.includes("end date or explicitly mark"))
  );

  const reversed = active(
    "experience",
    {
      role: "Engineer",
      organization: "Acme",
      started: "2024-06",
      ended: "2023-01",
    },
    ctx
  );
  assert.ok(
    review.issues(reversed, ctx).includes("End date must follow start date.")
  );

  const email = active("contact", { email: "not-an-email" }, ctx);
  assert.ok(review.issues(email, ctx).includes("Check this email address."));

  const url = active(
    "projects",
    {
      title: "Portfolio",
      summary: "A site",
      repository_url: "javascript:alert(1)",
    },
    ctx
  );
  assert.ok(
    review
      .issues(url, ctx)
      .includes("Repository URL needs a valid http or https link.")
  );
});

test("inactive or empty reviews never block saving", () => {
  const ctx = context();
  const inactive = {
    ...active("experience", { role: "", organization: "", started: "" }, ctx),
    active: false,
  };
  assert.deepEqual(plain(review.issues(inactive, ctx)), []);
});

test("changesForSave keeps only active selections and nulls singleton targets", () => {
  const ctx = context({
    contact: { id: 9, email: null, phone: null, links: [] },
  });
  const profile = active("profile", { name: "Ada" }, ctx);
  const contact = {
    ...review.makeReview(
      candidate("contact", { email: "ada@example.com" }),
      ctx
    ),
    active: true,
  };
  const skills = {
    ...review.makeReview(candidate("skills", { label: "Tools" }), ctx),
    active: true,
    target: 5,
  };
  const excluded = {
    ...review.makeReview(candidate("skills", { label: "Unused" }), ctx),
    active: false,
  };
  const changes = review.changesForSave([profile, contact, skills, excluded]);
  assert.deepEqual(
    plain(changes.map((change) => [change.section, change.target_id])),
    [
      ["profile", null],
      ["contact", null],
      ["skills", 5],
    ]
  );
  assert.deepEqual(plain(changes[0].values), { name: "Ada" });
});

test("missingProfileFields tracks publish-critical fields and proposals", () => {
  const empty = context();
  assert.deepEqual(plain(review.missingProfileFields(empty, [])), [
    "name",
    "headline",
    "introduction",
  ]);

  const complete = context({
    profile: {
      id: 1,
      name: "Ada",
      headline: "Engineer",
      introduction: "Hello",
      about: "",
      location: null,
    },
  });
  assert.deepEqual(plain(review.missingProfileFields(complete, [])), []);

  const partial = context({
    profile: {
      id: 1,
      name: "Ada",
      headline: "",
      introduction: "",
      about: "",
      location: null,
    },
  });
  const proposal = active("profile", { headline: "Engineer" }, partial);
  assert.deepEqual(plain(review.missingProfileFields(partial, [proposal])), [
    "introduction",
  ]);
});

test("effectiveEntries merges accepted values and appends proposed entries", () => {
  const ctx = context({
    skills: [{ id: 7, label: "Languages", items: [] }],
  });
  const update = active(
    "skills",
    { label: "Languages", items: ["TypeScript"] },
    ctx
  );
  const addition = active("skills", { label: "Tools", items: ["Git"] }, ctx);
  const entries = review.effectiveEntries(ctx, "skills", [update, addition]);
  assert.equal(entries.length, 2);
  assert.deepEqual(plain(entries[0].values.items), ["TypeScript"]);
  assert.equal(entries[0].proposed, undefined);
  assert.equal(entries[1].proposed, true);
  assert.ok(entries[1].id < 0);
  assert.deepEqual(plain(entries[1].values), {
    label: "Tools",
    items: ["Git"],
  });
});

test("effectiveEntries ignores inactive reviews", () => {
  const ctx = context({
    skills: [{ id: 7, label: "Languages", items: [] }],
  });
  const update = {
    ...active("skills", { label: "Languages", items: ["TypeScript"] }, ctx),
    active: false,
  };
  const entries = review.effectiveEntries(ctx, "skills", [update]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].values.items, []);
});

test("sectionSummary distinguishes empty, optional, complete, and needs-details", () => {
  const empty = context();
  assert.equal(review.sectionSummary(empty, "skills", []).status, "empty");
  assert.equal(
    review.sectionSummary(empty, "profile", []).status,
    "needs-details"
  );
  assert.equal(review.sectionSummary(empty, "profile", []).missingRequired, 3);
  assert.equal(
    review.sectionSummary(empty, "review", []).status,
    "needs-details"
  );

  const proposed = active("skills", { label: "Tools" }, empty);
  const optional = review.sectionSummary(empty, "skills", [
    { ...proposed, active: false },
  ]);
  assert.equal(optional.status, "optional");
  assert.equal(optional.detected, 1);
  assert.equal(optional.accepted, 0);

  const completeContext = context({
    profile: {
      id: 1,
      name: "Ada",
      headline: "Engineer",
      introduction: "Hello",
      about: "",
      location: null,
    },
    skills: [{ id: 2, label: "Languages", items: [] }],
  });
  const complete = review.sectionSummary(completeContext, "profile", []);
  assert.equal(complete.status, "complete");
  assert.equal(complete.missingRequired, 0);
  assert.equal(
    review.sectionSummary(completeContext, "skills", []).status,
    "complete"
  );
});

test("sectionSummary reports blocking issues only from active reviews", () => {
  const ctx = context();
  const blocking = active(
    "experience",
    { role: "Engineer", organization: "", started: "2024-01" },
    ctx
  );
  const summary = review.sectionSummary(ctx, "experience", [blocking]);
  assert.equal(summary.status, "needs-details");
  assert.ok(summary.blocking.length > 0);
  assert.ok(summary.missingRequired >= 1);
});

test("saved gaps stay advisory without blocking issues", () => {
  const ctx = context({
    experience: [
      {
        id: 2,
        role: "Engineer",
        organization: "",
        started: "2024-01",
        ended: "2024-06",
        current: false,
        description: "",
        highlights: [],
      },
    ],
  });
  const summary = review.sectionSummary(ctx, "experience", []);
  assert.equal(summary.status, "needs-details");
  assert.equal(summary.blocking.length, 0);
  assert.ok(summary.missingRequired >= 1);
});
