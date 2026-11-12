"use client";

import { useEffect, useRef } from "react";
import type { StepEditControls } from "@/lib/resume-wizard";

/**
 * Wiring between a step editor and the wizard's sticky footer: reports the
 * editor's semantic dirty state and registers stable save/discard controls
 * without re-registering on every keystroke (the wrappers delegate to the
 * latest closures).
 */
export function useStepEdits({
  dirty,
  unavailable = false,
  save,
  discard,
  onDirtyChange,
  onControls,
}: {
  dirty: boolean;
  unavailable?: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onControls?: (controls: StepEditControls | null) => void;
}) {
  const latest = useRef({ save, discard });
  useEffect(() => {
    latest.current = { save, discard };
  });

  useEffect(() => {
    if (unavailable) {
      onControls?.(null);
      return () => onControls?.(null);
    }
    onControls?.({
      save: () => latest.current.save(),
      discard: () => latest.current.discard(),
    });
    return () => onControls?.(null);
  }, [unavailable, onControls]);

  useEffect(() => {
    onDirtyChange?.(unavailable ? false : dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, unavailable, onDirtyChange]);
}
