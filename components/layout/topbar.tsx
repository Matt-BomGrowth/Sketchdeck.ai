import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import type { DataMode } from "@/types/domain";
import { dataModeBadge } from "@/lib/config/data-mode";
import { fmtRelative } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/tooltip";
import { ThemeToggle } from "./theme-toggle";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils/cn";

export interface TopbarProps {
  organizationName: string;
  mode: DataMode;
  lastScanAt?: string;
  nextScanAt?: string;
  notifications: number;
  userName: string;
  userRole: string;
}

export function DataModePill({ mode, className }: { mode: DataMode; className?: string }) {
  const badge = dataModeBadge(mode);
  return (
    <InfoTip
      label={
        mode === "live"
          ? "Live data from connected integrations. Demo and live data are never mixed."
          : "Generated SketchDeck demo data. Nothing here touches a live advertising account."
      }
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
          mode === "live" ? "border-positive/40 bg-positive-soft text-positive" : "border-warning/40 bg-warning-soft text-warning",
          className,
        )}
      >
        <span aria-hidden>{badge.emoji}</span>
        {badge.label}
      </span>
    </InfoTip>
  );
}

export function Topbar(props: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-6">
      <MobileNav />
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5 px-2 font-semibold">
          <span className="flex size-5 items-center justify-center rounded bg-surface-2 text-[10px] font-bold">{props.organizationName.slice(0, 1)}</span>
          <span className="truncate">{props.organizationName}</span>
          <ChevronDown className="size-3.5 text-muted" />
        </Button>
      </div>
      <DataModePill mode={props.mode} />
      <div className="hidden items-center gap-3 text-xs text-muted md:flex">
        <span className="hidden lg:inline">
          Last scan <span className="text-foreground">{props.lastScanAt ? fmtRelative(props.lastScanAt) : "—"}</span>
        </span>
        <span className="hidden xl:inline">
          Next scan <span className="text-foreground">{props.nextScanAt ? fmtRelative(props.nextScanAt) : "—"}</span>
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Link href="/agent">
          <Button variant="ghost" size="icon" aria-label={`${props.notifications} pending recommendations`} className="relative">
            <Bell />
            {props.notifications > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[9px] font-bold text-white">{props.notifications > 99 ? "99+" : props.notifications}</span>
            ) : null}
          </Button>
        </Link>
        <ThemeToggle />
        <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{props.userName.slice(0, 1).toUpperCase()}</span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-xs font-medium">{props.userName}</span>
            <span className="block text-[10px] capitalize text-muted">{props.userRole}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
