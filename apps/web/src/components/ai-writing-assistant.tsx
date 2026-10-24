"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Section } from "@/lib/resume-import";

export const writingLimits: Partial<Record<Section, Record<string, number>>> = {
  profile: { headline: 300, introduction: 2000, about: 3000 },
  experience: { description: 2000 },
  projects: { summary: 1000 },
};

export function AiWritingAssistant({
  section,
  field,
  ownerId,
  currentText,
  facts,
  disabled,
  onUse,
}: {
  section: Section;
  field: string;
  ownerId: string;
  currentText: string;
  facts: string;
  disabled: boolean;
  onUse: (text: string) => void;
}) {
  const [guidance, setGuidance] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const id = useId();
  const resultRef = useRef<HTMLTextAreaElement>(null);
  const limit = writingLimits[section]?.[field];
  useEffect(
    () => () => {
      active.current?.abort();
    },
    []
  );
  if (!limit) return null;
  const hasFacts = facts.trim() !== "[]" && !!facts.trim();
  async function generate() {
    if (active.current || disabled || !hasFacts) return;
    if (facts.length > 32000) {
      setError(
        "There are too many details for this request. Use the manual field editor."
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 45000);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/resume-import/write", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "online-resume-admin",
        },
        body: JSON.stringify({
          consent: true,
          expected_owner_id: ownerId,
          section,
          field,
          facts,
          current_text: currentText,
          guidance,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.detail ?? "AI writing could not finish. Your text is unchanged."
        );
      }
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("text" in data) ||
        typeof data.text !== "string" ||
        !data.text.trim() ||
        data.text.length > limit!
      )
        throw new Error(
          "The AI suggestion could not be verified. Your text is unchanged."
        );
      setSuggestion(data.text);
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (e) {
      if (active.current === controller)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "AI writing was cancelled. Your text is unchanged."
        );
    } finally {
      clearTimeout(timer);
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  return (
    <aside
      aria-label={`AI writing for ${field}`}
      className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-3"
    >
      <p className="text-sm">
        AI uses the resume facts for this field and sends them to NVIDIA. Review
        accuracy before using a suggestion. Nothing is saved automatically.
      </p>
      <details>
        <summary className="cursor-pointer text-sm underline">
          Optional tone or focus
        </summary>
        <label className="mt-2 block text-sm" htmlFor={`${id}-guidance`}>
          What should this wording emphasize?
        </label>
        <textarea
          id={`${id}-guidance`}
          value={guidance}
          maxLength={1000}
          disabled={disabled || pending}
          onChange={(e) => setGuidance(e.target.value)}
          className="mt-1 block min-h-16 w-full rounded border bg-background p-2"
          placeholder="For example: concise, first person, emphasize data engineering"
        />
      </details>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || pending || !hasFacts}
        onClick={() => void generate()}
      >
        {pending
          ? "Writing…"
          : currentText.trim()
            ? "Improve with AI"
            : "Write with AI"}
      </Button>
      {!hasFacts && (
        <p className="text-sm">
          Add factual resume details first so AI has something reliable to write
          from.
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm">
          Writing a suggestion. Your proposed text is unchanged.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {suggestion && (
        <div className="space-y-2">
          <label
            htmlFor={`${id}-suggestion`}
            className="block text-sm font-medium"
          >
            AI suggestion · review and edit before using
          </label>
          <textarea
            ref={resultRef}
            id={`${id}-suggestion`}
            value={suggestion}
            maxLength={limit}
            disabled={disabled || pending}
            onChange={(e) => setSuggestion(e.target.value)}
            className="block min-h-28 w-full rounded border bg-background p-3"
          />
          <p className="text-xs text-muted-foreground">
            {suggestion.length}/{limit} characters. Check all claims against
            your experience.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || pending || !suggestion.trim()}
              onClick={() => {
                onUse(suggestion.trim());
                setSuggestion("");
                setError("");
              }}
            >
              Use suggestion
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setSuggestion("");
                setError("");
              }}
            >
              Discard suggestion
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
