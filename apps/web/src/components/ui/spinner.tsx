"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
}

/**
 * Decorative busy indicator.
 *
 * The icon is hidden from assistive technology: the surrounding control always
 * carries a text label that states what is happening, so announcing the graphic
 * as well would only add noise. Animation stops under `prefers-reduced-motion`.
 */
export function Spinner({ className }: SpinnerProps) {
  return (
    <Loader2
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className
      )}
      aria-hidden="true"
      focusable="false"
    />
  );
}
