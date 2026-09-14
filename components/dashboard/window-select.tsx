"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const PRESETS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

export function WindowSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const custom = /^\d+$/.test(current);
  const set = (value: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("window", value);
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="inline-flex h-auto max-w-full flex-wrap items-center gap-1 rounded-md bg-surface-2 p-1">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => set(p.key)}
          className={cn("rounded-sm px-2.5 py-1 text-xs font-medium transition-colors", current === p.key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}
        >
          {p.label}
        </button>
      ))}
      <label className={cn("flex items-center gap-1 rounded-sm px-2 text-xs", custom ? "bg-surface text-foreground shadow-sm" : "text-muted")}>
        Custom
        <input
          type="number"
          min={2}
          max={180}
          defaultValue={custom ? current : ""}
          placeholder="days"
          className="w-12 bg-transparent text-xs tnum focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = Number((e.target as HTMLInputElement).value);
              if (v >= 2 && v <= 180) set(String(v));
            }
          }}
          aria-label="Custom window in days"
        />
      </label>
    </div>
  );
}
