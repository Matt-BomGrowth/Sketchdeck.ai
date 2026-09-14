import type { LucideIcon } from "lucide-react";
import { Bot, Building2, Cable, Gauge, Image as ImageIcon, Lightbulb, Megaphone, Settings, TrendingUp, Users, Workflow } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Command Center", icon: Gauge },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/pipeline", label: "Pipeline", icon: TrendingUp },
  { href: "/creatives", label: "Creatives", icon: ImageIcon },
  { href: "/audiences", label: "Audiences", icon: Users },
  { href: "/agent", label: "AI Agent", icon: Bot },
  { href: "/insights", label: "Insights", icon: Lightbulb },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/integrations", label: "Integrations", icon: Cable },
  { href: "/automation", label: "Automation", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const STACK_NAV: NavItem = { href: "/insights/stack", label: "Stack Consolidation", icon: Building2 };
