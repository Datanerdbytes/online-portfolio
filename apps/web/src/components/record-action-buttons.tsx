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
  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon"
        variant="outline"
        disabled={disabled}
        onClick={onEdit}
        aria-label={`Edit ${recordTitle}`}
        title="Edit project"
      >
        <Pencil className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="destructive"
        disabled={disabled}
        onClick={onDelete}
        aria-label={`Delete ${recordTitle}`}
        title="Delete project"
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  );
}
