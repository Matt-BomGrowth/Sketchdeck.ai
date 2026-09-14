import type { OptimizationAction } from "@/types/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformBadge, RecStatusBadge } from "@/components/dashboard/status";
import { fmtDateTime } from "@/lib/utils/format";

export function OptimizationLog({ actions }: { actions: OptimizationAction[] }) {
  return (
    <Card id="log">
      <CardHeader>
        <CardTitle>Optimization log</CardTitle>
        <CardDescription>Full audit trail of every AI action: before, after, reason, expected vs. actual impact, approver.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Platform / campaign</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Before → after</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Expected impact</TableHead>
              <TableHead>Actual impact</TableHead>
              <TableHead>Approver</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="tnum text-xs text-muted">{fmtDateTime(a.createdAt)}</TableCell>
                <TableCell className="max-w-[16rem]">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={a.platform} short />
                    <span className="truncate text-xs font-medium" title={a.campaignName}>{a.campaignName}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs capitalize">{a.actionType.replace("_", " ")}</TableCell>
                <TableCell className="tnum text-xs">{a.before} → {a.after}</TableCell>
                <TableCell className="max-w-[16rem] whitespace-normal text-xs text-muted">{a.reason}</TableCell>
                <TableCell className="max-w-[12rem] whitespace-normal text-xs">{a.expectedImpact}</TableCell>
                <TableCell className="max-w-[14rem] whitespace-normal text-xs">{a.actualImpact ?? <span className="text-muted">Measuring…</span>}</TableCell>
                <TableCell className="text-xs">{a.approver ?? "—"}</TableCell>
                <TableCell><RecStatusBadge status={a.status} /></TableCell>
              </TableRow>
            ))}
            {actions.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-xs text-muted">No actions yet.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
