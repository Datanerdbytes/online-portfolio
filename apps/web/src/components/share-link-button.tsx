"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareLinkButton({
  path,
  label = "Share portfolio",
  compact = false,
}: {
  path: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualLink, setManualLink] = useState("");

  async function copyLink() {
    const url = new URL(path, window.location.origin).href;
    setBusy(true);
    setCopied(false);
    setManualLink("");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setManualLink(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-link">
      <Button
        type="button"
        variant="outline"
        size={compact ? "default" : "lg"}
        className={compact ? "h-11 gap-2 px-2 text-xs sm:h-8" : "gap-2"}
        disabled={busy}
        onClick={() => void copyLink()}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Link2 size={16} aria-hidden="true" />
        )}
        {busy ? "Copying…" : copied ? "Link copied" : label}
      </Button>
      <span role="status" className="sr-only">
        {copied ? "Public link copied to clipboard." : ""}
      </span>
      {manualLink ? (
        <label className="share-link-fallback">
          <span role="status">Copy this public link:</span>
          <input
            type="text"
            readOnly
            value={manualLink}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </div>
  );
}
