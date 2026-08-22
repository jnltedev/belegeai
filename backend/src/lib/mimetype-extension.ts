const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/tiff": "tiff",
  "image/webp": "webp",
  "message/rfc822": "eml",
  "application/vnd.ms-outlook": "msg",
};

export function extensionForMimetype(mimetype: string): string {
  return EXTENSION_BY_MIMETYPE[mimetype] ?? "bin";
}

const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|\x00-\x1f]/g;

export function sanitizeFilename(name: string): string {
  return name.replace(UNSAFE_FILENAME_CHARS, "_").trim() || "download";
}
