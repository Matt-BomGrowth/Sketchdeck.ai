"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav";

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-6 px-3 py-3" aria-label="Primary">
      <div className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => (
          <Item key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-2">Workspace</p>
        {SECONDARY_NAV.map((item) => (
          <Item key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}
