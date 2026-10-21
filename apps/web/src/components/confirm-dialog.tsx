"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      cancelButton.current?.focus();
    } else if (!open && element?.open) {
      element.close();
    }
  }, [open]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
  }, []);

  return (
    <dialog
      ref={dialog}
      open={open}
      onCancel={onCancel}
      onKeyDown={handleKeyDown}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <h3 className="mb-3 text-lg font-semibold [overflow-wrap:anywhere]">{title}</h3>
      <p className="mb-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button ref={cancelButton} size="lg" variant="outline" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button size="lg" variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? "Deleting…" : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
