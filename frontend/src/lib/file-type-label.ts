const LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/tiff": "TIFF",
  "image/webp": "WEBP",
  "message/rfc822": "EML",
  "application/vnd.ms-outlook": "MSG",
};

export function fileTypeLabel(mimetype: string | null | undefined): string {
  if (!mimetype) return "?";
  return LABELS[mimetype] ?? mimetype.split("/").pop()?.toUpperCase().slice(0, 5) ?? "?";
}
