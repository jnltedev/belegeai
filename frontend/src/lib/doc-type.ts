import { getIcon } from "@/lib/icon-registry";
import type { LucideIcon } from "lucide-react";

interface DocTypeStyle {
  icon: LucideIcon;
  color: string;
}

const FALLBACK_COLOR = "#64748b";

export function getDocTypeStyle(documentType: { icon: string; color: string } | null | undefined): DocTypeStyle {
  if (!documentType) return { icon: getIcon(null), color: FALLBACK_COLOR };
  return { icon: getIcon(documentType.icon), color: documentType.color };
}
