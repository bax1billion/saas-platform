import {
  FileText,
  FileClock,
  Users,
  ClipboardCheck,
  Paperclip,
  GraduationCap,
  Award,
  ScrollText,
  LayoutDashboard,
  CheckCircle,
  PackageCheck,
  Building2,
  FileCog,
  FolderOpen,
  UserX,
} from "lucide-react";
import {
  BuildingLibraryIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

/**
 * Canonical icon mapping for every in-app construct.
 * Import from here so icons stay consistent across the site.
 * Mixes Lucide and Heroicons — both are stroke-based 24x24.
 *
 * Usage:
 *   import { constructIcons } from "./icons";
 *   const Icon = constructIcons.documents;
 *   <Icon className="h-5 w-5 text-primary" />
 */
export const constructIcons = {
  library: BuildingLibraryIcon,
  documents: FileText,
  documentVersions: FileClock,
  workflows: FileCog,
  members: Users,
  access: ShieldCheckIcon,
  tasks: ClipboardCheck,
  attachments: Paperclip,
  onboarding: GraduationCap,
  achievements: Award,
  auditTrail: ScrollText,
  dashboards: LayoutDashboard,
  approvals: CheckCircle,
  billing: PackageCheck,
  workspaces: Building2,
} as const;

/** Pain-point icons (negative states) */
export const painPointIcons = {
  scatteredTools: FolderOpen,
  manualBusywork: FileClock,
  noVisibility: UserX,
} as const;

/** Re-export individual icons for direct imports */
export {
  FileText,
  FileClock,
  Users,
  ClipboardCheck,
  Paperclip,
  GraduationCap,
  Award,
  ScrollText,
  LayoutDashboard,
  CheckCircle,
  PackageCheck,
  Building2,
  FileCog,
  FolderOpen,
  UserX,
  BuildingLibraryIcon,
  ShieldCheckIcon,
};
