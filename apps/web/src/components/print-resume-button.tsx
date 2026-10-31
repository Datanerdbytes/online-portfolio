"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintResumeButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="resume-toolbar-button"
      onClick={() => window.print()}
      aria-label="Print this resume or save it as a PDF"
    >
      <Printer size={14} aria-hidden="true" />
      Print / Save as PDF
    </Button>
  );
}
