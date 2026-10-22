#!/usr/bin/env node
/**
 * Regenerates `src/content/resume.ts` from the live API.
 *
 * Usage:
 *   node scripts/sync-resume-content.mjs          # write the file
 *   node scripts/sync-resume-content.mjs --check  # fail when the file is stale
 *
 * Environment:
 *   API_BASE_URL  Base URL of the FastAPI service (default http://localhost:8000)
 *
 * The API must be running and the database migrated. Run the API sync first
 * (`python -m app.scripts.seed_resume` in apps/api) so the database matches the
 * canonical resume content.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const API_BASE_URL = (
  process.env.API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/content/resume.ts",
);
const REQUEST_TIMEOUT_MS = 8000;

const TYPE_EXPORTS = [
  "Contact",
  "ContactLink",
  "Education",
  "Experience",
  "Profile",
  "ResumeContent",
  "ResumeProject",
  "SkillGroup",
];

async function fetchJson(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`GET ${path} failed with HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildContent(resume, projects) {
  const profile = resume.profile;
  if (!profile) {
    throw new Error(
      "The API returned no profile. Seed the database before syncing.",
    );
  }

  return {
    isSample: false,
    profile: {
      name: profile.name,
      headline: profile.headline,
      introduction: profile.introduction,
      about: profile.about,
      location: profile.location ?? undefined,
    },
    skills: (resume.skills ?? []).map((group) => ({
      label: group.label,
      items: (group.items ?? []).map((item) => item.item),
    })),
    experience: (resume.experience ?? []).map((job) => ({
      isSample: false,
      id: job.slug,
      role: job.role,
      organization: job.organization,
      started: job.started,
      ended: job.ended ?? undefined,
      current: job.current,
      description: job.description,
      highlights: (job.highlights ?? []).map((highlight) => highlight.text),
    })),
    education: (resume.education ?? []).map((entry) => ({
      isSample: false,
      id: entry.slug,
      qualification: entry.qualification,
      institution: entry.institution,
      started: entry.started ?? undefined,
      ended: entry.ended ?? undefined,
    })),
    contact: {
      phone: resume.contact?.phone ?? undefined,
      email: resume.contact?.email ?? undefined,
      links: (resume.contact?.links ?? []).map((link) => ({
        label: link.label,
        url: link.url,
      })),
    },
    projects: (projects?.items ?? []).map((project) => ({
      isSample: project.is_sample,
      id: project.slug,
      title: project.title,
      summary: project.summary,
      technologies: project.technologies,
      repositoryUrl: project.repository_url ?? undefined,
      demoUrl: project.demo_url ?? undefined,
    })),
  };
}

function render(content) {
  return `// AUTO-GENERATED FILE — do not edit by hand.
//
// Regenerate with:
//   npm run sync:resume-content
//
// Source: GET /api/v1/resume and GET /api/v1/projects from the API base URL
// configured in API_BASE_URL.

import type { ResumeContent } from "@/content/resume-types";

export const resume: ResumeContent = ${JSON.stringify(content, null, 2)};

export type {
${TYPE_EXPORTS.map((name) => `  ${name},`).join("\n")}
} from "@/content/resume-types";
`;
}

/**
 * Formats the generated file with the repository Prettier configuration so the
 * output stays diff-friendly and `npm run format:check` passes.
 */
async function format(source) {
  return prettier.format(source, { filepath: OUTPUT_PATH });
}

async function main() {
  const check = process.argv.includes("--check");
  const [resume, projects] = await Promise.all([
    fetchJson("/api/v1/resume"),
    fetchJson("/api/v1/projects"),
  ]);

  const next = await format(render(buildContent(resume, projects)));

  if (check) {
    const current = await readFile(OUTPUT_PATH, "utf8").catch(() => null);
    if (current !== next) {
      console.error(
        `${OUTPUT_PATH} is out of date. Run "npm run sync:resume-content".`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${OUTPUT_PATH} is up to date.`);
    return;
  }

  await writeFile(OUTPUT_PATH, next, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
