import {
  Receipt,
  Landmark,
  ShieldCheck,
  Building2,
  Mail,
  FileQuestion,
  FileText,
  Home,
  Car,
  Heart,
  Briefcase,
  GraduationCap,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Receipt,
  Landmark,
  ShieldCheck,
  Building2,
  Mail,
  FileQuestion,
  FileText,
  Home,
  Car,
  Heart,
  Briefcase,
  GraduationCap,
  Stethoscope,
  Wrench,
};

export const ICON_NAMES = Object.keys(ICON_REGISTRY);

export function getIcon(name: string | null | undefined): LucideIcon {
  if (!name) return FileQuestion;
  return ICON_REGISTRY[name] ?? FileQuestion;
}
