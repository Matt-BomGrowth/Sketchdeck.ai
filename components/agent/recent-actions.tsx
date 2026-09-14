import Link from "next/link";
import type { OptimizationAction, Recommendation } from "@/types/domain";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlatformBadge, PriorityBadge, RecStatusBadge } from "@/components/dashboard/status";
import { fmtRelative } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";

export function RecentAiActivity({ actions, recommendations }: { actions: OptimizationAction[]; recommendations: Recommendation[] }) {
  const pending = recommendations.filter((r) => r.status === "pending").slice(0, 3);
  const recent = actions.slice(0, 4);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>
            <span aria-hidden>🧠</span> Recent AI activity
          </CardTitle>
          <CardDescription>Latest recommendations and approved actions.</CardDescription>
        </div>
        <Link href="/agent">
          <Button size="xs" variant="ghost">
            Open AI Agent →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Awaiting approval</p>
          <ul className="flex flex-col gap-2">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 rounded-md border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={r.priority} />
                  {r.platform ? <PlatformBadge platform={r.platform} short /> : null}
                  <span className="ml-auto text-[10px] text-muted">{Math.round(r.confidence * 100)}% conf.</span>
                </div>
                <p className="text-xs font-medium leading-snug">{r.title}</p>
              </li>
            ))}
            {pending.length === 0 ? <li className="text-xs text-muted">Nothing awaiting approval.</li> : null}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Executed &amp; measured</p>
          <ul className="flex flex-col gap-2">
            {recent.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-md border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={a.platform} short />
                  <RecStatusBadge status={a.status} />
                  <span className="ml-auto text-[10px] text-muted">{fmtRelative(a.createdAt)}</span>
                </div>
                <p className="min-w-0 truncate text-xs font-medium">{a.campaignName}</p>
                <p className="tnum text-[11px] text-muted">
                  {a.before} → {a.after}
                  {a.actualImpact ? <span className="block text-positive">{a.actualImpact}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
