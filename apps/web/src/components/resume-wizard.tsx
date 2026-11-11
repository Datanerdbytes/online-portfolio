"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ImportIntake } from "@/components/import-intake";
import { ProjectManager } from "@/components/project-manager";
import { ReviewPanel } from "@/components/review-panel";
import { StepNav } from "@/components/step-nav";
import {
  ContactTab,
  EducationTab,
  ExperienceTab,
  ProfileTab,
  SkillsTab,
} from "@/components/resume-sections";
import type { ApiResume, Project } from "@/lib/api";
import { display, type ImportContext } from "@/lib/resume-import";
import {
  label,
  sectionSummary,
  type Review,
  type SectionSummary,
} from "@/lib/resume-review";
import {
  PROJECTS_QUERY_KEY,
  RESUME_QUERY_KEY,
  useResume,
} from "@/lib/project-queries";
import {
  STEP_LABELS,
  STEPS,
  parseStep,
  sectionsForStep,
  stepHref,
  type Step,
} from "@/lib/resume-wizard";
import { useImportFlow } from "@/lib/use-import-flow";

const PUBLISH_FIELDS = ["name", "headline", "introduction"] as const;

const descriptions: Record<Step, string> = {
  profile:
    "Start with your name, headline, and introduction. These are required before publishing.",
  skills: "Group the tools and strengths you want people to see.",
  projects: "Show what you have built and how it works.",
  experience: "Add the roles that shaped your work.",
  education: "Add the qualifications you want to show.",
  contact: "Add the best way for people to reach you.",
  review: "Check each section, save your draft, then publish when ready.",
};

type Props = {
  initialResume: ApiResume | null;
  initialProjects: Project[];
  initialListStatus: "ok" | "unavailable";
  initialContext: ImportContext | null;
  initialStep: Step;
  initialImport: boolean;
};

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl border bg-card p-5">
      {children}
    </p>
  );
}

function snapshotOf(element: HTMLElement | null): string {
  if (!element) return "";
  return JSON.stringify(
    Array.from(
      element.querySelectorAll("input:not([type=file]),textarea,select")
    ).map((e) => {
      const input = e as HTMLInputElement;
      return [input.type, input.value, input.checked];
    })
  );
}

export function ResumeWizard({
  initialResume,
  initialProjects,
  initialListStatus,
  initialContext,
  initialStep,
  initialImport,
}: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(initialStep);
  const [intakeOpen, setIntakeOpen] = useState(
    initialImport || !initialResume?.profile
  );
  const handleSaved = useCallback(() => {
    setIntakeOpen(false);
    void queryClient.invalidateQueries({ queryKey: RESUME_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
  }, [queryClient]);
  const flow = useImportFlow(initialContext, handleSaved);
  const resume = useResume(
    initialResume ? { initialData: initialResume } : undefined
  );
  const data = resume.data ?? initialResume;
  const reviewing = flow.reviews.length > 0;
  const context = flow.context;
  const liveContext = useMemo<ImportContext | null>(() => {
    if (!context || !data) return context;
    return {
      ...context,
      resume: {
        profile: (data.profile
          ? {
              id: data.profile.id,
              name: data.profile.name,
              headline: data.profile.headline,
              introduction: data.profile.introduction,
              about: data.profile.about,
              location: data.profile.location,
            }
          : null) as ImportContext["resume"]["profile"],
        contact: data.contact,
        skills: data.skills,
        experience: data.experience,
        education: data.education,
      },
    };
  }, [context, data]);
  const container = useRef<HTMLDivElement>(null);
  const baseline = useRef("");
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousReviews = useRef(0);

  const summaries = useMemo(
    () =>
      Object.fromEntries(
        STEPS.map((value) => [
          value,
          sectionSummary(liveContext, value, flow.reviews),
        ])
      ) as Record<Step, SectionSummary>,
    [liveContext, flow.reviews]
  );

  const publishMissing = reviewing
    ? flow.missing
    : PUBLISH_FIELDS.filter((key) => !display(data?.profile?.[key]).trim());

  const formDirty = () => snapshotOf(container.current) !== baseline.current;

  useEffect(() => {
    baseline.current = snapshotOf(container.current);
  }, [step, flow.saved, resume.dataUpdatedAt]);

  useEffect(() => {
    if (flow.reviews.length > 0 && previousReviews.current === 0) {
      stepHeading.current?.focus();
      baseline.current = snapshotOf(container.current);
    }
    previousReviews.current = flow.reviews.length;
  }, [flow.reviews.length]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.get("step")) {
      url.searchParams.set("step", initialStep);
      window.history.replaceState(null, "", url);
    }
  }, [initialStep]);

  useEffect(() => {
    const onPop = () => {
      setStep(
        parseStep(new URLSearchParams(window.location.search).get("step"))
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!flow.dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (
        anchor &&
        !window.confirm(
          "Leave this page? Your unsaved import review will be discarded."
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
  }, [flow.dirty]);

  function go(next: Step) {
    if (next === step) return;
    if (
      !reviewing &&
      formDirty() &&
      !window.confirm(
        "You have unsaved edits on this step. Leave and discard them?"
      )
    )
      return;
    setStep(next);
    window.history.pushState(null, "", stepHref(next));
    setTimeout(() => stepHeading.current?.focus(), 0);
  }

  function stepReviews(value: Step) {
    const sections = sectionsForStep(value);
    return flow.reviews
      .map((review, index) => ({ review, index }))
      .filter(({ review }) => sections.includes(review.candidate.section));
  }

  function duplicateTargets(list: { review: Review; index: number }[]) {
    const counts = new Map<number, number>();
    for (const { review } of list)
      if (review.active && review.target != null)
        counts.set(review.target, (counts.get(review.target) ?? 0) + 1);
    return new Set(
      list
        .filter(
          ({ review }) =>
            review.active &&
            review.target != null &&
            (counts.get(review.target) ?? 0) > 1
        )
        .map(({ index }) => index)
    );
  }

  function gapNotice(value: Step, summary: SectionSummary) {
    if (summary.status !== "needs-details") return null;
    return (
      <p
        role="status"
        className="rounded-xl border border-destructive/40 bg-card p-4 text-sm"
      >
        {summary.missingRequired > 0
          ? `${summary.missingRequired} required field${
              summary.missingRequired === 1 ? "" : "s"
            } still need${summary.missingRequired === 1 ? "s" : ""} attention.`
          : "Some imported values need review before saving."}{" "}
        {value === "profile" && publishMissing.length > 0
          ? `Publishing also needs: ${publishMissing.map(label).join(", ")}.`
          : ""}{" "}
        You can still save a partial draft.
      </p>
    );
  }

  function reviewPanels(value: Step) {
    if (!context) return null;
    const list = stepReviews(value);
    const duplicates = duplicateTargets(list);
    return list.map(({ review, index }) => (
      <ReviewPanel
        key={index}
        review={review}
        index={index}
        context={context}
        candidates={flow.reviews.map((r) => r.candidate)}
        busy={flow.busy}
        duplicate={duplicates.has(index)}
        onChange={flow.update}
      />
    ));
  }

  function profileStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("profile", summaries.profile)}
          <p className="rounded-xl border bg-card p-4 text-sm">
            <strong>Required before publishing:</strong>{" "}
            {publishMissing.length
              ? publishMissing.map(label).join(", ")
              : "your name, headline, and introduction are complete."}{" "}
            You can save a partial draft.
          </p>
          {stepReviews("profile").length ? (
            reviewPanels("profile")
          ) : (
            <EmptyState>
              No profile details were detected. Save whatever was found, then
              complete your name, headline, and introduction in this step.
            </EmptyState>
          )}
        </>
      );
    if (intakeOpen)
      return (
        <>
          <ImportIntake
            context={context}
            file={flow.file}
            onFile={flow.setFile}
            consent={flow.consent}
            onConsent={flow.setConsent}
            busy={flow.busy}
            reviewing={reviewing}
            localText={flow.localText}
            onReadLocally={() => void flow.readLocally()}
            onAnalyze={() => void flow.analyze()}
            onClearLocalText={flow.clearLocalText}
          />
          <div>
            <Button
              variant="outline"
              disabled={flow.busy}
              onClick={() => setIntakeOpen(false)}
            >
              Enter details manually instead
            </Button>
          </div>
        </>
      );
    return (
      <>
        <p className="rounded-xl border bg-card p-4 text-sm">
          <strong>Required before publishing:</strong>{" "}
          {publishMissing.length
            ? publishMissing.map(label).join(", ")
            : "your name, headline, and introduction are complete."}{" "}
          You can save a partial draft.
        </p>
        <div>
          <Button
            variant="outline"
            disabled={!context}
            onClick={() => setIntakeOpen(true)}
          >
            Import a resume
          </Button>
        </div>
        <ProfileTab profile={data?.profile ?? null} />
      </>
    );
  }

  function skillsStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("skills", summaries.skills)}
          {stepReviews("skills").length ? (
            reviewPanels("skills")
          ) : (
            <EmptyState>
              No skills were detected in this file. Add them in the Skills step
              after saving, or try another file.
            </EmptyState>
          )}
        </>
      );
    return <SkillsTab skills={data?.skills ?? []} />;
  }

  function projectsStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("projects", summaries.projects)}
          {stepReviews("projects").length ? (
            reviewPanels("projects")
          ) : (
            <EmptyState>
              No projects were detected in this file. Add them in the Projects
              step after saving, or try another file.
            </EmptyState>
          )}
        </>
      );
    return (
      <ProjectManager
        initialProjects={initialProjects}
        initialListStatus={initialListStatus}
        headingLevel="h3"
      />
    );
  }

  function experienceStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("experience", summaries.experience)}
          {stepReviews("experience").length ? (
            reviewPanels("experience")
          ) : (
            <EmptyState>
              No experience was detected in this file. Add it in the Experience
              step after saving, or try another file.
            </EmptyState>
          )}
        </>
      );
    return <ExperienceTab experience={data?.experience ?? []} />;
  }

  function educationStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("education", summaries.education)}
          {stepReviews("education").length ? (
            reviewPanels("education")
          ) : (
            <EmptyState>
              No education was detected in this file. Add it in the Education
              step after saving, or try another file.
            </EmptyState>
          )}
        </>
      );
    return <EducationTab education={data?.education ?? []} />;
  }

  function contactStep() {
    if (reviewing)
      return (
        <>
          {gapNotice("contact", summaries.contact)}
          {stepReviews("contact").length ? (
            reviewPanels("contact")
          ) : (
            <EmptyState>
              No contact details were detected in this file. Add email and phone
              in the Contact step after saving.
            </EmptyState>
          )}
        </>
      );
    return <ContactTab contact={data?.contact ?? null} />;
  }

  function reviewStep() {
    if (reviewing)
      return (
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-semibold">Review before saving</h2>
          <p>
            Existing values are kept by default. Select entries and fields to
            import. Lists add to existing items; no existing records are
            deleted. AI suggestions start unselected.
          </p>
          <p>
            <strong>Required before publishing:</strong>{" "}
            {publishMissing.length
              ? `${publishMissing.map(label).join(", ")} still missing.`
              : "your name, headline, and introduction are complete."}{" "}
            You can save a partial draft.
          </p>
          <ul className="list-disc pl-5 text-sm">
            {STEPS.filter((value) => value !== "review").map((value) => {
              const summary = summaries[value];
              return (
                <li key={value}>
                  {STEP_LABELS[value]}: {summary.saved} saved,{" "}
                  {summary.accepted} selected from this file
                  {summary.missingRequired
                    ? `, ${summary.missingRequired} required field${
                        summary.missingRequired === 1 ? "" : "s"
                      } need attention`
                    : ""}
                  {summary.blocking.length
                    ? `, ${summary.blocking.length} blocking issue${
                        summary.blocking.length === 1 ? "" : "s"
                      }`
                    : ""}
                  .
                </li>
              );
            })}
          </ul>
          <Button
            variant="outline"
            disabled={flow.busy || flow.refreshing}
            onClick={() => void flow.refresh()}
          >
            {flow.refreshing ? "Refreshing…" : "Refresh existing values"}
          </Button>
          {flow.stale && (
            <p role="alert">
              The draft changed. Refresh existing values before saving.
            </p>
          )}
          {flow.notes.length > 0 && (
            <div>
              <h3 className="font-semibold">Not imported</h3>
              <p>
                These details do not have matching fields. Keep a copy if you
                need them.
              </p>
              <ul className="list-disc pl-5">
                {flow.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            This review lives in this browser tab only. Reloading discards
            pending selections; nothing is saved until you save below.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={
                flow.busy ||
                flow.refreshing ||
                flow.stale ||
                !flow.changes.length ||
                flow.problems.length > 0
              }
              onClick={() => void flow.save()}
            >
              {flow.busy
                ? "Saving…"
                : `Save selected changes (${flow.changes.length} entries)`}
            </Button>
            <Button
              variant="outline"
              disabled={flow.busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Discard this review? Your existing draft will be kept."
                  )
                )
                  flow.discard();
              }}
            >
              Discard review
            </Button>
          </div>
        </section>
      );
    const savedProfile =
      publishMissing.length === 0
        ? "Your name, headline, and introduction are complete."
        : publishMissing.map(label).join(", ");
    return (
      <section className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Review and publish</h2>
        {flow.saved && (
          <div role="status" className="space-y-2">
            <h3 className="font-semibold">Saved to your private draft</h3>
            <ul>
              {Object.entries(flow.counts).map(([section, count]) => (
                <li key={section}>
                  {label(section)}: {count} entries applied
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <strong>Required before publishing:</strong> {savedProfile}{" "}
          {publishMissing.length > 0
            ? "You can keep a partial draft and complete these later."
            : "Your draft is ready to preview."}
        </p>
        <ul className="list-disc pl-5 text-sm">
          {STEPS.filter((value) => value !== "review").map((value) => {
            const summary = summaries[value];
            return (
              <li key={value}>
                {STEP_LABELS[value]}: {summary.saved} saved
                {summary.missingRequired
                  ? `, ${summary.missingRequired} required field${
                      summary.missingRequired === 1 ? "" : "s"
                    } need attention`
                  : ""}
                .
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          Saving keeps your work private. Publishing from the preview makes it
          visible to visitors.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/admin/preview">Preview portfolio</Link>
          </Button>
          <Button variant="outline" onClick={() => go("profile")}>
            Edit profile
          </Button>
          <Button
            variant="outline"
            disabled={!context}
            onClick={() => {
              setIntakeOpen(true);
              go("profile");
            }}
          >
            Import a resume
          </Button>
        </div>
        {!context && (
          <p role="status">
            Resume import is unavailable right now. You can keep editing
            manually.
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Resume</h1>
        <p className="mt-2 text-muted-foreground">
          Work through one section at a time, then save your private draft.
          Nothing is published until you choose to publish.
        </p>
      </div>
      <StepNav step={step} summaries={summaries} onSelect={go} />
      <p role="status" aria-live="polite">
        {flow.stage}
      </p>
      <p role="alert" className="text-destructive">
        {flow.error}
      </p>
      <div ref={container} className="space-y-6">
        <section aria-labelledby="step-heading" className="space-y-6">
          <div>
            <h2
              id="step-heading"
              ref={stepHeading}
              tabIndex={-1}
              className="rounded text-2xl font-bold focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {STEP_LABELS[step]}
            </h2>
            <p className="text-muted-foreground">{descriptions[step]}</p>
          </div>
          {step === "profile" && profileStep()}
          {step === "skills" && skillsStep()}
          {step === "projects" && projectsStep()}
          {step === "experience" && experienceStep()}
          {step === "education" && educationStep()}
          {step === "contact" && contactStep()}
          {step === "review" && reviewStep()}
        </section>
      </div>
    </div>
  );
}
