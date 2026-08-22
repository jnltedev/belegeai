import { PdfViewer } from "./pdf-viewer";
import { ImageViewer } from "./image-viewer";
import { EmailViewer } from "./email-viewer";
import { UnsupportedPreview } from "./unsupported-preview";

// Browsers render PNG/JPEG/WebP inline via <img>, but not TIFF - it needs
// the same "download to view" fallback as a genuinely unsupported type.
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EMAIL_MIMETYPES = new Set(["message/rfc822", "application/vnd.ms-outlook"]);

interface DocumentPreviewProps {
  documentId: string;
  fileUrl: string;
  downloadUrl: string;
  mimetype: string | null;
  title: string;
}

export function DocumentPreview({ documentId, fileUrl, downloadUrl, mimetype, title }: DocumentPreviewProps) {
  if (mimetype === "application/pdf") {
    return <PdfViewer fileUrl={fileUrl} downloadUrl={downloadUrl} title={title} />;
  }
  if (mimetype && INLINE_IMAGE_TYPES.has(mimetype)) {
    return <ImageViewer fileUrl={fileUrl} downloadUrl={downloadUrl} title={title} />;
  }
  if (mimetype && EMAIL_MIMETYPES.has(mimetype)) {
    return <EmailViewer documentId={documentId} subject={title} downloadUrl={downloadUrl} />;
  }
  return <UnsupportedPreview downloadUrl={downloadUrl} />;
}
