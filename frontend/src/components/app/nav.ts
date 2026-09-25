import {
  Bot,
  BarChart3,
  Briefcase,
  Building2,
  CalendarClock,
  FileText,
  Kanban,
  LayoutDashboard,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Additional path prefixes that should mark this item active */
  match?: string[];
  children?: { label: string; href: string; exact?: boolean }[];
}

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Career Agent", href: "/agent", icon: Bot },
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    children: [
      { label: "Discover", href: "/jobs", exact: true },
      { label: "Recommended", href: "/jobs/recommended" },
      { label: "Saved", href: "/jobs/saved" },
      { label: "Search", href: "/jobs/search" },
    ],
  },
  {
    label: "Applications",
    href: "/applications",
    icon: Kanban,
    children: [
      { label: "Pipeline", href: "/applications", exact: true },
      { label: "History", href: "/applications/history" },
    ],
  },
  { label: "Interviews", href: "/interviews", icon: CalendarClock },
  {
    label: "Resume Center",
    href: "/resumes",
    icon: FileText,
    match: ["/cover-letters"],
    children: [
      { label: "Resumes", href: "/resumes" },
      { label: "Cover Letters", href: "/cover-letters" },
    ],
  },
  { label: "Networking", href: "/networking", icon: Users },
  { label: "Profile", href: "/profile", icon: UserRound },
  { label: "Company Research", href: "/companies", icon: Building2 },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function isActive(pathname: string, href: string, exact = false) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
