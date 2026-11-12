"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  candidateValid,
  display,
  IMPORT_MAX_BYTES,
  type Candidate,
  type ImportContext,
  type Section,
} from "@/lib/resume-import";
import {
  changesForSave,
  currentValues,
  issues,
  makeReview,
  missingProfileFields,
  type Review,
} from "@/lib/resume-review";

export const IMPORT_HEADERS = { "X-Requested-With": "online-resume-admin" };
const SIGN_IN_PATH = "/auth/signin?next=%2Fadmin%2Fresume%3Fstep%3Dprofile";

export function useImportFlow(
  initial: ImportContext | null,
  onSaved?: (counts: Record<string, number>) => void
) {
  const router = useRouter();
  const [context, setContext] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [stage, setStage] = useState("");
  const [localText, setLocalText] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [revision, setRevision] = useState(initial?.status.revision ?? 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const active = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const saveAttempt = useRef<{ payload: string; key: string } | null>(null);
  const dirty = !saved && (busy || reviews.length > 0 || !!localText);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!analyzing) return;
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [analyzing]);

  const sameSession = useCallback(async (): Promise<boolean> => {
    const owner = context?.status.owner_id;
    if (!owner) return true;
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const identity = await response.json();
      if (identity.owner_id === owner) return true;
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
    router.replace(SIGN_IN_PATH);
    return false;
  }, [context?.status.owner_id, router]);

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

  function bulkUpdate(
    sections: Section[],
    transform: (review: Review, latest: ImportContext) => Review
  ) {
    if (!context) return;
    setReviews((previous) =>
      previous.map((r) =>
        sections.includes(r.candidate.section) ? transform(r, context) : r
      )
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
      if (file.size > IMPORT_MAX_BYTES || !/\.(pdf|docx|txt)$/i.test(file.name))
        throw new Error(
          "Choose a PDF, DOCX, or text file no larger than 3 MiB."
        );
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/resume-import/read", {
        method: "POST",
        headers: IMPORT_HEADERS,
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
    if (!context) {
      setError("Resume import is unavailable right now. Retry in a moment.");
      return;
    }
    active.current = true;
    cancelled.current = false;
    setBusy(true);
    setAnalyzing(true);
    setElapsed(0);
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
      if (file.size > IMPORT_MAX_BYTES || !/\.(pdf|docx|txt)$/i.test(file.name))
        throw new Error(
          "Choose a PDF, DOCX, or text file no larger than 3 MiB."
        );
      const latest = await loadContext();
      setContext(latest);
      setStage("Reading document");
      const body = new FormData();
      body.set("file", file);
      body.set("consent", "true");
      const response = await fetch("/api/resume-import/analyze", {
        method: "POST",
        headers: IMPORT_HEADERS,
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
    } catch (e) {
      setError(
        cancelled.current
          ? "Import cancelled. Nothing was saved."
          : e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Import timed out. Retry or use the manual editor; nothing was saved."
      );
      setStage("");
    } finally {
      clearTimeout(timer);
      active.current = false;
      abort.current = null;
      setAnalyzing(false);
      setBusy(false);
    }
  }

  function cancel() {
    if (!abort.current) return;
    cancelled.current = true;
    abort.current.abort();
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const latest = await loadContext();
      const previousContext = context;
      setContext(latest);
      setRevision(latest.status.revision);
      setReviews((previous) =>
        previous.map((r) => {
          const fresh = makeReview(r.candidate, latest);
          const selected = { ...fresh.selected };
          // Selections on fields whose saved value did not change survive the
          // refresh; anything that changed falls back to the safe default.
          if (fresh.target === r.target && previousContext) {
            const before = currentValues(r, previousContext);
            const after = currentValues(fresh, latest);
            for (const key of Object.keys(selected)) {
              if (display(before[key]) === display(after[key]))
                selected[key] = r.selected[key] ?? selected[key];
            }
          }
          return { ...fresh, values: r.values, active: r.active, selected };
        })
      );
      setStale(false);
      saveAttempt.current = null;
      setStage(
        "Existing values refreshed. Selections on unchanged fields were kept; reconfirm any field whose saved value changed."
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const changes = changesForSave(reviews);
  const problems = context ? reviews.flatMap((r) => issues(r, context)) : [];
  const missing = context ? missingProfileFields(context, reviews) : [];

  async function save() {
    if (active.current || stale || !changes.length || problems.length) return;
    if (!context) return;
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
        headers: { ...IMPORT_HEADERS, "Content-Type": "application/json" },
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
      onSaved?.(body.counts);
      try {
        const latest = await loadContext();
        setContext(latest);
        setRevision(latest.status.revision);
      } catch {
        /* The save succeeded; React Query still refreshes the editor. */
      }
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

  function discard() {
    setReviews([]);
    setNotes([]);
    setStage("");
    setFile(null);
    const input = document.getElementById(
      "resume-file"
    ) as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function clearLocalText() {
    setLocalText("");
  }

  return {
    context,
    file,
    setFile,
    consent,
    setConsent,
    stage,
    localText,
    clearLocalText,
    reviews,
    notes,
    revision,
    error,
    setError,
    busy,
    saved,
    stale,
    counts,
    refreshing,
    analyzing,
    elapsed,
    dirty,
    changes,
    problems,
    missing,
    update,
    bulkUpdate,
    readLocally,
    analyze,
    cancel,
    refresh,
    save,
    discard,
  };
}
