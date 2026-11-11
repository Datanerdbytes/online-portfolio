"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportContext } from "@/lib/resume-import";

const FILE_HINT = "Choose a PDF, DOCX, or TXT resume file (up to 3 MiB)";

type Props = {
  context: ImportContext | null;
  file: File | null;
  onFile: (file: File | null) => void;
  consent: boolean;
  onConsent: (consent: boolean) => void;
  busy: boolean;
  reviewing: boolean;
  analyzing: boolean;
  localText: string;
  onReadLocally: () => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onClearLocalText: () => void;
};

export function ImportIntake({
  context,
  file,
  onFile,
  consent,
  onConsent,
  busy,
  reviewing,
  analyzing,
  localText,
  onReadLocally,
  onAnalyze,
  onCancel,
  onClearLocalText,
}: Props) {
  const disabled = busy || reviewing;

  if (!context)
    return (
      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-semibold">Import a resume</h2>
        <p role="status">
          Resume import is unavailable right now. You can still add details in
          the steps below, or refresh this page to retry.
        </p>
      </section>
    );

  return (
    <>
      <section
        aria-label="Upload resume"
        className="space-y-4 rounded-xl border bg-card p-5"
      >
        <h2 className="text-xl font-semibold">Import a resume</h2>
        <label className="block font-medium" htmlFor="resume-file">
          Resume file (PDF, DOCX, or TXT, up to 3 MiB)
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="resume-file"
            type="file"
            accept=".pdf,.docx,.txt,text/plain"
            disabled={disabled}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            className="peer sr-only"
          />
          <label
            htmlFor="resume-file"
            title={FILE_HINT}
            aria-disabled={disabled}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            Choose file
          </label>
          <span
            className="min-w-0 max-w-full truncate text-sm text-muted-foreground"
            title={file ? file.name : FILE_HINT}
          >
            {file ? file.name : "No file chosen"}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload a text-based PDF, DOCX, or plain-text file (up to 10 PDF
          pages). Scanned/image-only and password-protected PDFs are
          unsupported; export a text-based file to import.
        </p>
        <label
          htmlFor="resume-import-consent"
          className="flex cursor-pointer select-none items-start gap-3"
        >
          <input
            id="resume-import-consent"
            type="checkbox"
            checked={consent}
            disabled={disabled}
            onChange={(e) => onConsent(e.target.checked)}
            className="mt-1 size-5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <span>
            I agree to send the extracted resume text to NVIDIA for mapping and
            optional writing suggestions for narrative fields. This app discards
            the uploaded file after processing. NVIDIA’s own data policies
            apply. Nothing is saved to my resume until I confirm.
          </span>
        </label>
        {context.can_read_locally && !reviewing && (
          <div className="space-y-2">
            <Button
              disabled={!file || busy}
              variant="outline"
              onClick={onReadLocally}
            >
              {busy ? "Reading…" : "Read document locally"}
            </Button>
          </div>
        )}
        {!reviewing && (
          <div className="space-y-2">
            <Button
              disabled={!context.enabled || !file || !consent || busy}
              onClick={onAnalyze}
            >
              {busy ? "Processing…" : "Read and map resume"}
            </Button>
            {!context.enabled && (
              <p className="text-sm text-muted-foreground">
                Resume import is currently disabled. Configure NVIDIA_API_KEY
                and RESUME_IMPORT_ENABLED on the backend to enable AI mapping.
              </p>
            )}
            {analyzing && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Keep this tab open. Large resumes can take a minute or more.
                </p>
                <Button variant="outline" onClick={onCancel}>
                  Cancel import
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
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
          <Button variant="outline" onClick={onClearLocalText}>
            Clear extracted text
          </Button>
        </section>
      )}
    </>
  );
}
