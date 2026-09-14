import { getRepository } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GenerateBriefButton, ScanNowButton } from "@/components/agent/scan-button";
import { fmtDateTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automation" };

export default async function AutomationPage() {
  const repo = await getRepository();
  const [settings, runs, briefs] = await Promise.all([repo.getSettings(), repo.getScanRuns(24), repo.getDailyBriefs(7)]);
  const p = settings.automationPolicy;
  const latestBrief = briefs[0];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Automation" subtitle="Hourly scanner, daily brief and the action-safety policy." right={<div className="flex gap-2"><ScanNowButton /><GenerateBriefButton /></div>} />
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Action safety</CardTitle>
            <CardDescription>OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-[11px] uppercase tracking-wide text-muted">Max budget change</p><p className="tnum font-medium">{Math.round(p.maxBudgetChangePct * 100)}%</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted">Max daily exposure</p><p className="tnum font-medium">${p.maxDailyExposure.toLocaleString()}</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted">Approval above</p><p className="tnum font-medium">${p.approvalRequiredAbove.toLocaleString()}/mo</p></div>
            <div><p className="text-[11px] uppercase tracking-wide text-muted">Auto-execute</p><Badge variant={p.autoExecuteEnabled ? "warning" : "positive"}>{p.autoExecuteEnabled ? "Enabled within limits" : "Off — approval required"}</Badge></div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Schedules</CardTitle>
            <CardDescription>Vercel Cron in production (see vercel.json); GitHub Actions or any scheduler can call the same endpoints with CRON_SECRET.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-md border border-border p-3">
              <p className="font-medium">Hourly scan</p>
              <code className="font-mono text-[11px] text-muted">GET /api/cron/hourly-scan · 0 * * * *</code>
              <p className="mt-1 text-muted">Fetch → normalize → store → KPIs → anomalies → fatigue → campaigns → audiences → creatives → recommendations → record.</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="font-medium">Daily brief</p>
              <code className="font-mono text-[11px] text-muted">GET /api/cron/daily-brief · 0 13 * * *</code>
              <p className="mt-1 text-muted">Pipeline, revenue, ROAS, MQLs, SQLs, wins, problems, recommendations, actions. Email via EMAIL_PROVIDER (console in demo).</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Scan runs</CardTitle>
          <CardDescription>Each run records platforms, campaigns, issues, recommendations, actions, errors and status.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead className="text-right">Campaigns</TableHead>
                <TableHead className="text-right">Issues</TableHead>
                <TableHead className="text-right">Recs</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                <TableHead>Errors</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tnum text-xs">{fmtDateTime(r.startedAt)}</TableCell>
                  <TableCell className="tnum text-xs text-muted">{r.finishedAt ? `${Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s` : "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{r.platformsScanned.join(", ")}</TableCell>
                  <TableCell className="tnum text-right text-xs">{r.campaignsScanned}</TableCell>
                  <TableCell className="tnum text-right text-xs">{r.issuesDetected}</TableCell>
                  <TableCell className="tnum text-right text-xs">{r.recommendationsCreated}</TableCell>
                  <TableCell className="tnum text-right text-xs">{r.actionsExecuted}</TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs text-muted" title={r.errors.join("; ")}>{r.errors.length ? r.errors.join("; ") : "—"}</TableCell>
                  <TableCell><Badge variant={r.status === "completed" ? "positive" : r.status === "partial" ? "warning" : r.status === "failed" ? "negative" : "info"} className="capitalize">{r.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest daily brief</CardTitle>
          <CardDescription>{latestBrief ? latestBrief.subject : "No brief generated yet."}</CardDescription>
        </CardHeader>
        <CardContent>
          {latestBrief ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-4 font-sans text-xs leading-relaxed">{latestBrief.summaryMarkdown}</pre> : <p className="text-xs text-muted">Click “Generate today’s brief”.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
