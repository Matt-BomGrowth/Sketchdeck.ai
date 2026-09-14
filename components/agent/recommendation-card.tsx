"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { Recommendation } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlatformBadge, PriorityBadge, RecStatusBadge } from "@/components/dashboard/status";
import { Estimated } from "@/components/ui/misc";
import { fmtCompactCurrency, fmtCurrency } from "@/lib/utils/format";
import { decideRecommendation } from "@/app/(app)/agent/actions";
import { cn } from "@/lib/utils/cn";

export function RecommendationCard({ rec, canDecide, highlight = false }: { rec: Recommendation; canDecide: boolean; highlight?: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState(rec.status);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [budget, setBudget] = useState(rec.budgetChange?.to ?? 0);

  const decide = (decision: "approve" | "modify" | "reject", modifiedBudgetTo?: number) =>
    start(async () => {
      const res = await decideRecommendation({ id: rec.id, decision, modifiedBudgetTo });
      setMessage({ ok: res.ok, text: res.message });
      if (res.ok) setStatus(decision === "reject" ? "rejected" : decision === "modify" ? "modified" : "approved");
      setModifyOpen(false);
    });

  const impact = rec.expectedImpact;
  const decided = status !== "pending";

  return (
    <Card className={cn("flex flex-col gap-3 p-4", highlight && "ring-2 ring-ring")} id={rec.id}>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={rec.priority} />
        {rec.platform ? <PlatformBadge platform={rec.platform} short /> : null}
        <Badge variant="outline" className="capitalize">{rec.type.replace("_", " ")}</Badge>
        {rec.requiresApproval ? <Badge variant="accent">Requires approval</Badge> : <Badge variant="outline">Informational</Badge>}
        <span className="ml-auto"><RecStatusBadge status={status} /></span>
      </div>
      <h3 className="text-sm font-semibold leading-snug">{rec.title}</h3>
      <dl className="grid gap-2 text-xs">
        <div>
          <dt className="font-medium text-muted">What happened?</dt>
          <dd>{rec.whatHappened}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Why?</dt>
          <dd>{rec.why}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Recommended action</dt>
          <dd className="font-medium text-foreground">{rec.recommendedAction}</dd>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div>
            <dt className="inline font-medium text-muted">Expected impact: </dt>
            <dd className="tnum inline">
              {impact.pipelineHigh > 0 ? `${fmtCompactCurrency(impact.pipelineLow)}–${fmtCompactCurrency(impact.pipelineHigh)} pipeline/mo` : null}
              {impact.pipelineHigh > 0 && impact.wasteAvoided ? " · " : null}
              {impact.wasteAvoided ? `${fmtCurrency(impact.wasteAvoided)}/mo waste avoided` : null}
              {impact.pipelineHigh === 0 && !impact.wasteAvoided ? "Not quantified" : null} <Estimated />
            </dd>
          </div>
          <div>
            <dt className="inline font-medium text-muted">Confidence: </dt>
            <dd className="tnum inline">{Math.round(rec.confidence * 100)}%</dd>
          </div>
          {rec.budgetChange ? (
            <div>
              <dt className="inline font-medium text-muted">Budget: </dt>
              <dd className="tnum inline">
                {fmtCurrency(rec.budgetChange.from)} → {fmtCurrency(rec.budgetChange.to)}/day
              </dd>
            </div>
          ) : null}
        </div>
      </dl>
      {message ? <p className={cn("text-xs", message.ok ? "text-positive" : "text-negative")}>{message.text}</p> : null}
      {!decided && rec.requiresApproval ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" variant="positive" disabled={!canDecide || pending} onClick={() => decide("approve")}>
            <Check /> Approve
          </Button>
          {rec.budgetChange ? (
            <Button size="sm" variant="secondary" disabled={!canDecide || pending} onClick={() => setModifyOpen(true)}>
              <Pencil /> Modify
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={!canDecide || pending} onClick={() => decide("reject")}>
            <X /> Reject
          </Button>
          {!canDecide ? <span className="self-center text-[11px] text-muted">Viewer role — approvals disabled.</span> : null}
        </div>
      ) : null}
      {rec.budgetChange ? (
        <Dialog open={modifyOpen} onOpenChange={setModifyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modify budget change</DialogTitle>
              <DialogDescription>Current {fmtCurrency(rec.budgetChange.from)}/day · proposed {fmtCurrency(rec.budgetChange.to)}/day. Enter the daily budget you want to approve instead.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`budget-${rec.id}`}>New daily budget (USD)</Label>
              <Input id={`budget-${rec.id}`} type="number" min={1} step={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setModifyOpen(false)}>Cancel</Button>
              <Button disabled={pending || budget <= 0} onClick={() => decide("modify", budget)}>
                Approve modified
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}
