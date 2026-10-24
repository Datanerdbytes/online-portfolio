"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  candidateValid,
  display,
  entries,
  IMPORT_MAX_BYTES,
  required,
  sectionFields,
  suggestedTarget,
  type Candidate,
  type ImportContext,
  type Values,
} from "@/lib/resume-import";

type Review = {
  candidate: Candidate;
  active: boolean;
  target: number | null;
  values: Values;
  selected: Record<string, boolean>;
};
const labels: Record<string, string> = {
  profile: "Profile",
  contact: "Contact details",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  links: "Contact links",
  started: "Start date (YYYY-MM)",
  ended: "End date (YYYY-MM)",
  current: "Current role",
  repository_url: "Repository URL",
  demo_url: "Demo URL",
  items: "Skills (one per line)",
  highlights: "Highlights (one per line)",
  technologies: "Technologies (one per line)",
};
const label = (key: string) =>
  labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
const headers = { "X-Requested-With": "online-resume-admin" };
function makeReview(candidate: Candidate, context: ImportContext): Review {
  const existing = entries(context, candidate.section);
  const target = suggestedTarget(candidate, existing);
  const current = existing.find((x) => x.id === target)?.values ?? {};
  return {
    candidate,
    target,
    active: ["profile", "contact"].includes(candidate.section),
    values: { ...candidate.values },
    selected: Object.fromEntries(
      sectionFields[candidate.section].map((key) => [
        key,
        !display(current[key]) &&
          candidate.values[key] != null &&
          !candidate.generated.includes(key),
      ])
    ),
  };
}
function currentValues(review: Review, context: ImportContext): Values {
  return (
    entries(context, review.candidate.section).find(
      (x) => x.id === review.target
    )?.values ?? {}
  );
}
function selectedValues(review: Review): Values {
  return Object.fromEntries(
    Object.entries(review.values).filter(
      ([k, v]) => review.selected[k] && v !== null && v !== ""
    )
  );
}
function merged(review: Review, context: ImportContext): Values {
  return { ...currentValues(review, context), ...selectedValues(review) };
}
function issues(review: Review, context: ImportContext): string[] {
  if (!review.active || !Object.keys(selectedValues(review)).length) return [];
  const value = merged(review, context);
  const section = review.candidate.section;
  const problems = required[section]
    .filter((k) => !display(value[k]).trim())
    .map((k) => `${label(k)} is required for this entry.`);
  for (const key of ["started", "ended"])
    if (value[key] && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value[key])))
      problems.push(
        `${label(key)} needs a complete YYYY-MM date; do not guess.`
      );
  if (section === "experience" && !value.current && !value.ended)
    problems.push(
      "Supply an end date or explicitly mark this role as current."
    );
  if (
    value.started &&
    value.ended &&
    String(value.ended) < String(value.started)
  )
    problems.push("End date must follow start date.");
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email)))
    problems.push("Check this email address.");
  for (const key of ["url", "repository_url", "demo_url"])
    if (value[key]) {
      try {
        const u = new URL(String(value[key]));
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw new Error();
      } catch {
        problems.push(`${label(key)} needs a valid http or https link.`);
      }
    }
  return problems;
}

export function ResumeImporter({ initial }: { initial: ImportContext }) {
  const router = useRouter();
  const [context, setContext] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [stage, setStage] = useState("");
  const [localText, setLocalText] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [revision, setRevision] = useState(initial.status.revision);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const saveAttempt = useRef<{ payload: string; key: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = !saved && (busy || reviews.length > 0 || !!localText);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const a = (event.target as HTMLElement).closest("a[href]");
      if (
        a &&
        !window.confirm(
          "Leave this import? Your unsaved review will be discarded."
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
  useEffect(
    () => () => {
      abort.current?.abort();
    },
    []
  );
  const sameSession = useCallback(async (): Promise<boolean> => {
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const identity = await response.json();
      if (identity.owner_id === context.status.owner_id) return true;
    } else if (![401, 403].includes(response.status))
      throw new Error(
        "We could not verify your session. Your review is kept; retry before saving."
      );
    abort.current?.abort();
    setReviews([]);
    setNotes([]);
    setLocalText("");
    setFile(null);
    setConsent(false);
    setBusy(false);
    router.replace("/auth/signin?next=%2Fadmin%2Fimport");
    return false;
  }, [context.status.owner_id, router]);
  useEffect(() => {
    if (!dirty) return;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await sameSession();
      } catch {
        /* A temporary outage must not discard the review. */
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void check(), 30000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [dirty, sameSession]);
  function update(index: number, change: Partial<Review>) {
    setReviews((previous) =>
      previous.map((r, i) => (i === index ? { ...r, ...change } : r))
    );
  }
  async function loadContext(): Promise<ImportContext> {
    const response = await fetch("/api/resume-import/context", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        "Could not refresh existing values. Sign in again if your session expired."
      );
    return response.json();
  }
  async function readLocally() {
    if (active.current || !file) return;
    active.current = true;
    setBusy(true);
    setError("");
    setLocalText("");
    setStage("Reading document locally");
    try {
      if (file.size > IMPORT_MAX_BYTES || !/\.(pdf|docx)$/i.test(file.name))
        throw new Error("Choose a PDF or DOCX no larger than 3 MiB.");
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/resume-import/read", {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail ?? "Document reading failed.");
      if (typeof data.text !== "string")
        throw new Error("Document reading did not return text.");
      setLocalText(data.text);
      setStage(
        "Document read locally. Nothing was sent to NVIDIA or saved to your resume."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document reading failed.");
      setStage("");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function analyze() {
    if (active.current || !file || !consent) return;
    active.current = true;
    setBusy(true);
    setError("");
    setReviews([]);
    setNotes([]);
    setSaved(false);
    setStale(false);
    saveAttempt.current = null;
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 105000);
    try {
      if (file.size > IMPORT_MAX_BYTES || !/\.(pdf|docx)$/i.test(file.name))
        throw new Error("Choose a PDF or DOCX no larger than 3 MiB.");
      const latest = await loadContext();
      setContext(latest);
      setStage("Reading document");
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "true");
      const response = await fetch("/api/resume-import/analyze", {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(
          failure.detail ??
            "Import is unavailable. Use the manual editor or retry."
        );
      }
      if (!response.body) throw new Error("Import did not return a review.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ready = false;
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512000)
          throw new Error("The mapping was too large. Try a shorter resume.");
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.stage === "reading") setStage("Reading document");
          else if (event.stage === "mapping") setStage("Mapping details");
          else if (event.stage === "error")
            throw new Error(
              event.detail ?? "Mapping failed. Nothing was saved."
            );
          else if (event.stage === "ready") {
            if (
              !Array.isArray(event.candidates) ||
              !event.candidates.every(candidateValid) ||
              !Array.isArray(event.not_imported) ||
              !event.not_imported.every(
                (x: unknown) => typeof x === "string"
              ) ||
              !Number.isSafeInteger(event.revision)
            )
              throw new Error("The mapping could not be verified.");
            const candidates: Candidate[] = event.candidates;
            if (!candidates.some((c) => c.section === "profile"))
              candidates.unshift({
                section: "profile",
                values: {},
                evidence: {},
                generated: [],
                warnings: [
                  "Profile details were not found. Supply them here or complete them later in the editor.",
                ],
              });
            setReviews(candidates.map((c) => makeReview(c, latest)));
            setNotes(event.not_imported);
            setRevision(latest.status.revision);
            setStale(event.revision !== latest.status.revision);
            setStage("Ready to review");
            ready = true;
          }
        }
      }
      if (!ready)
        throw new Error(
          "The connection ended before review was ready. Retry; nothing was saved."
        );
      setFile(null);
      const input = document.getElementById(
        "resume-file"
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      setTimeout(() => heading.current?.focus(), 0);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "AbortError"
          ? e.message
          : "Import timed out. Retry or use the manual editor; nothing was saved."
      );
      setStage("");
    } finally {
      clearTimeout(timer);
      active.current = false;
      abort.current = null;
      setBusy(false);
    }
  }
  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const latest = await loadContext();
      setContext(latest);
      setRevision(latest.status.revision);
      setReviews((previous) =>
        previous.map((r) => ({
          ...makeReview(r.candidate, latest),
          values: r.values,
          active: r.active,
        }))
      );
      setStale(false);
      saveAttempt.current = null;
      setStage(
        "Existing values refreshed. Reconfirm which imported fields to use."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  const changes = reviews
    .filter((r) => r.active && Object.keys(selectedValues(r)).length)
    .map((r) => ({
      section: r.candidate.section,
      target_id: ["profile", "contact"].includes(r.candidate.section)
        ? null
        : r.target,
      values: selectedValues(r),
    }));
  const problems = reviews.flatMap((r) => issues(r, context));
  const profile = {
    ...(context.resume.profile ?? {}),
    ...Object.assign(
      {},
      ...reviews
        .filter((r) => r.active && r.candidate.section === "profile")
        .map(selectedValues)
    ),
  };
  const missing = ["name", "headline", "introduction"].filter(
    (k) => !display(profile[k]).trim()
  );
  async function save() {
    if (active.current || stale || !changes.length || problems.length) return;
    active.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await sameSession())) return;
      const payload = JSON.stringify({
        expected_owner_id: context.status.owner_id,
        revision,
        changes,
      });
      if (saveAttempt.current?.payload !== payload)
        saveAttempt.current = { payload, key: crypto.randomUUID() };
      const response = await fetch("/api/resume-import/apply", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...JSON.parse(payload),
          idempotency_key: saveAttempt.current.key,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 409) {
        setStale(true);
        throw new Error(
          "Your draft changed. Refresh existing values, then reconfirm your selections."
        );
      }
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.detail ?? "We could not save your changes.");
      }
      const body = await response.json();
      setCounts(body.counts);
      setSaved(true);
      setReviews([]);
      setNotes([]);
      setStage("Selected changes saved as a private draft.");
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "We could not confirm the save. Retry the same selection safely, or check your editor."
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Import your resume</h1>
      <p>
        Upload → review → save a private draft. Your published portfolio stays
        as it is until you publish.
      </p>
      {!context.enabled && (
        <p role="status">
          Resume import is not enabled yet.{" "}
          <Link href="/admin/resume" className="underline">
            Continue in the manual editor
          </Link>
          .
        </p>
      )}
      {!saved && (
        <section
          aria-label="Upload resume"
          className="space-y-4 rounded-xl border bg-card p-5"
        >
          <label className="block font-medium" htmlFor="resume-file">
            Resume file (PDF or DOCX, up to 3 MiB)
          </label>
          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx"
            disabled={busy || reviews.length > 0}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError("");
            }}
            className="block max-w-full"
          />
          <p className="text-sm text-muted-foreground">
            Text-based resumes only; PDFs may contain up to 10 pages. Scans and
            password-protected files are unsupported.
          </p>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              disabled={!context.enabled || busy || reviews.length > 0}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              I agree to send the extracted resume text to NVIDIA for mapping
              and optional headline/introduction suggestions. This app discards
              the uploaded file after processing. NVIDIA’s own data policies
              apply. Nothing is saved to my resume until I confirm.
            </span>
          </label>
          {context.can_read_locally && !reviews.length && (
            <div className="space-y-2">
              <p className="text-sm">
                Local test: read your document without sending it to NVIDIA or
                saving resume fields.
              </p>
              <Button
                disabled={!file || busy}
                variant="outline"
                onClick={() => void readLocally()}
              >
                {busy ? "Reading…" : "Read document locally"}
              </Button>
            </div>
          )}
          {!reviews.length && (
            <Button
              disabled={!context.enabled || !file || !consent || busy}
              onClick={() => void analyze()}
            >
              {busy ? "Processing…" : "Read and map resume"}
            </Button>
          )}
        </section>
      )}
      <p role="status" aria-live="polite">
        {stage}
      </p>
      <p role="alert" className="text-destructive">
        {error}
      </p>
      {localText && (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">
            Extracted text · local preview only
          </h2>
          <p>
            Check the reading order and details below. Nothing has been mapped,
            saved, or sent to NVIDIA.
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border p-3 text-sm">
            {localText}
          </pre>
          <Button variant="outline" onClick={() => setLocalText("")}>
            Clear extracted text
          </Button>
        </section>
      )}
      {reviews.length > 0 && (
        <>
          <section className="space-y-3 rounded-xl border p-5">
            <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
              Review before saving
            </h2>
            <p>
              Existing values are kept by default. Select entries and fields to
              import. Lists add to existing items; no existing records are
              deleted. AI suggestions start unselected.
            </p>
            <p>
              <strong>Required before publishing:</strong>{" "}
              {missing.length
                ? missing.map(label).join(", ")
                : "Your introduction requirements are complete."}{" "}
              You can save a partial draft.
            </p>
            <p>
              <strong>Optional details:</strong>{" "}
              {(
                [
                  "skills",
                  "experience",
                  "education",
                  "projects",
                  "links",
                ] as const
              )
                .filter(
                  (section) =>
                    !reviews.some((r) => r.candidate.section === section)
                )
                .map(label)
                .join(", ") || "All supported sections were detected."}
            </p>
            <Button
              variant="outline"
              disabled={busy || refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? "Refreshing…" : "Refresh existing values"}
            </Button>
            {stale && (
              <p role="alert">
                The draft changed. Refresh existing values before saving.
              </p>
            )}
          </section>
          {reviews.map((review, index) => {
            const c = review.candidate;
            const current = currentValues(review, context);
            const existing = entries(context, c.section);
            const singleton = ["profile", "contact"].includes(c.section);
            return (
              <section
                key={index}
                className="space-y-4 rounded-xl border bg-card p-5"
                aria-labelledby={`entry-${index}`}
              >
                <h2 id={`entry-${index}`} className="text-xl font-semibold">
                  {label(c.section)} · {index + 1}
                </h2>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    disabled={busy}
                    checked={review.active}
                    onChange={(e) =>
                      update(index, { active: e.target.checked })
                    }
                  />
                  Include selected changes from this entry
                </label>
                {!singleton && (
                  <label className="block space-y-2">
                    <span>Apply to</span>
                    <select
                      className="block w-full rounded border bg-background p-3"
                      disabled={busy}
                      value={review.target ?? "new"}
                      onChange={(e) => {
                        const target =
                          e.target.value === "new"
                            ? null
                            : Number(e.target.value);
                        update(index, {
                          target,
                          selected: Object.fromEntries(
                            sectionFields[c.section].map((k) => [k, false])
                          ),
                        });
                      }}
                    >
                      <option value="new">Add as a new entry</option>
                      {existing.map((x) => (
                        <option value={x.id} key={x.id}>
                          Update:{" "}
                          {display(
                            x.values.title ||
                              x.values.role ||
                              x.values.qualification ||
                              x.values.label ||
                              x.values.url
                          )}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm">
                      {review.target
                        ? "A possible existing match is selected. Confirm before saving."
                        : "Review existing entries to avoid duplicates."}
                    </span>
                  </label>
                )}
                {c.warnings.length > 0 && (
                  <div>
                    <h3 className="font-semibold">Needs review</h3>
                    <ul className="list-disc pl-5">
                      {c.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sectionFields[c.section].map((key) => (
                  <div key={key} className="space-y-2 border-t pt-3">
                    <label className="flex items-center gap-3 font-medium">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={!!review.selected[key]}
                        disabled={busy || !review.active}
                        onChange={(e) =>
                          update(index, {
                            selected: {
                              ...review.selected,
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      Use imported {label(key)}
                      {c.generated.includes(key)
                        ? " · AI writing suggestion"
                        : ""}
                      {required[c.section].includes(key)
                        ? " (required for entry)"
                        : ""}
                    </label>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          Existing value (kept unless selected)
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {display(current[key]) || "Not supplied"}
                        </p>
                      </div>
                      <label className="block min-w-0 text-sm">
                        <span>Proposed {label(key)}</span>
                        {key === "current" ? (
                          <select
                            className="mt-1 block w-full rounded border bg-background p-3"
                            disabled={busy || !review.active}
                            value={String(review.values[key] ?? "")}
                            onChange={(e) =>
                              update(index, {
                                values: {
                                  ...review.values,
                                  [key]:
                                    e.target.value === ""
                                      ? null
                                      : e.target.value === "true",
                                },
                              })
                            }
                          >
                            <option value="">Not determined</option>
                            <option value="true">Current role</option>
                            <option value="false">Past role</option>
                          </select>
                        ) : (
                          <textarea
                            className="mt-1 block min-h-20 w-full rounded border bg-background p-3"
                            disabled={busy || !review.active}
                            value={display(review.values[key])}
                            onChange={(e) =>
                              update(index, {
                                values: {
                                  ...review.values,
                                  [key]: [
                                    "items",
                                    "highlights",
                                    "technologies",
                                  ].includes(key)
                                    ? e.target.value.split("\n").filter(Boolean)
                                    : e.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </label>
                    </div>
                    {c.evidence[key] ? (
                      <details className="text-sm">
                        <summary className="min-h-8 cursor-pointer underline">
                          Source excerpt for {label(key)}
                        </summary>
                        <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">
                          {c.evidence[key]}
                        </blockquote>
                      </details>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {c.generated.includes(key)
                          ? "Generated suggestion; check it before accepting."
                          : "Not found in your file. You may supply it yourself."}
                      </p>
                    )}
                  </div>
                ))}
                {issues(review, context).length > 0 && (
                  <div role="status">
                    <h3 className="font-semibold">
                      Needs review before this entry can be saved
                    </h3>
                    <ul className="list-disc pl-5">
                      {issues(review, context).map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
          {notes.length > 0 && (
            <section className="rounded-xl border p-5">
              <h2 className="text-xl font-semibold">Not imported</h2>
              <p>
                These details do not have matching fields. Keep a copy if you
                need them.
              </p>
              <ul className="list-disc pl-5">
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </section>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                busy ||
                refreshing ||
                stale ||
                !changes.length ||
                problems.length > 0
              }
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : `Save selected changes (${changes.length} entries)`}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Discard this review? Your existing draft will be kept."
                  )
                ) {
                  setReviews([]);
                  setNotes([]);
                  setStage("");
                  setFile(null);
                }
              }}
            >
              Discard review
            </Button>
          </div>
        </>
      )}
      {saved && (
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Your draft is saved</h2>
          <ul>
            {Object.entries(counts).map(([section, count]) => (
              <li key={section}>
                {label(section)}: {count} entries applied
              </li>
            ))}
          </ul>
          <p>
            Review your saved draft and complete any missing details before
            publishing.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link className="underline" href="/admin/resume">
              Edit resume
            </Link>
            <Link className="underline" href="/admin/projects">
              Edit projects
            </Link>
            <Link className="underline" href="/admin/preview">
              Preview portfolio
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
