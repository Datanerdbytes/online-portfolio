"use client";

/**
 * One transient message surface for editor forms: `role="status"` for
 * success and neutral feedback, `role="alert"` for errors, so screen readers
 * announce every save result the same way. Optional `details` render the
 * per-record failures from a batched step save.
 */
export function FormMessage({
  message,
  isError = false,
  details,
}: {
  message: string;
  isError?: boolean;
  details?: string[];
}) {
  if (!message) return null;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-1 text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`}
    >
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
