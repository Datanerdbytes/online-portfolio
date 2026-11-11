"use client";

import {
  AiWritingAssistant,
  writingLimits,
} from "@/components/ai-writing-assistant";
import {
  display,
  entries,
  factsForWriting,
  required,
  sectionFields,
  type Candidate,
  type ImportContext,
} from "@/lib/resume-import";
import { currentValues, issues, label, type Review } from "@/lib/resume-review";

type Props = {
  review: Review;
  index: number;
  context: ImportContext;
  candidates: Candidate[];
  busy: boolean;
  duplicate?: boolean;
  onChange: (index: number, change: Partial<Review>) => void;
};

export function ReviewPanel({
  review,
  index,
  context,
  candidates,
  busy,
  duplicate,
  onChange,
}: Props) {
  const c = review.candidate;
  const current = currentValues(review, context);
  const existing = entries(context, c.section);
  const singleton = ["profile", "contact"].includes(c.section);
  const problems = issues(review, context);

  return (
    <section
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
          onChange={(e) => onChange(index, { active: e.target.checked })}
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
                e.target.value === "new" ? null : Number(e.target.value);
              onChange(index, {
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
      {duplicate && (
        <p role="status" className="text-sm text-destructive">
          Another imported entry also targets this record. Only one set of
          changes will be applied; keep the other as a new entry or exclude it.
        </p>
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
                onChange(index, {
                  selected: {
                    ...review.selected,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            Use imported {label(key)}
            {c.generated.includes(key) ? " · AI writing suggestion" : ""}
            {required[c.section].includes(key) ? " (required for entry)" : ""}
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
                    onChange(index, {
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
                    onChange(index, {
                      values: {
                        ...review.values,
                        [key]: ["items", "highlights", "technologies"].includes(
                          key
                        )
                          ? e.target.value.split("\n").filter(Boolean)
                          : e.target.value,
                      },
                    })
                  }
                />
              )}
            </label>
          </div>
          {writingLimits[c.section]?.[key] && (
            <AiWritingAssistant
              section={c.section}
              field={key}
              ownerId={context.status.owner_id}
              currentText={display(review.values[key])}
              disabled={busy || !review.active}
              facts={factsForWriting(candidates, c)}
              onUse={(text) =>
                onChange(index, {
                  values: { ...review.values, [key]: text },
                  selected: { ...review.selected, [key]: true },
                  candidate: {
                    ...c,
                    generated: [...new Set([...c.generated, key])],
                  },
                })
              }
            />
          )}
          {c.evidence[key] ? (
            <details className="text-sm">
              <summary className="min-h-8 cursor-pointer underline">
                Source excerpt for {label(key)}
              </summary>
              <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">
                {Array.isArray(c.evidence[key])
                  ? c.evidence[key].join("\n\n")
                  : c.evidence[key]}
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
      {problems.length > 0 && (
        <div role="status">
          <h3 className="font-semibold">
            Needs review before this entry can be saved
          </h3>
          <ul className="list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
