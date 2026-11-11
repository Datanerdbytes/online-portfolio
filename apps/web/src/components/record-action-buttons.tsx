"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";

export interface RecordActionButtonsProps {
  recordTitle: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}

export function RecordActionButtons({
  recordTitle,
  onEdit,
  onDelete,
  disabled,
}: RecordActionButtonsProps) {
  const editLabel = `Edit ${recordTitle}`;
  const deleteLabel = `Delete ${recordTitle}`;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={onEdit}
        aria-label={editLabel}
        title={editLabel}
      >
        <Pencil className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        onClick={onDelete}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
