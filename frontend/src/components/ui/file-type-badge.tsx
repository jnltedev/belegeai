import { fileTypeLabel } from "@/lib/file-type-label";

export function FileTypeBadge({ mimetype, className = "" }: { mimetype: string | null | undefined; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted ${className}`}
    >
      {fileTypeLabel(mimetype)}
    </span>
  );
}
