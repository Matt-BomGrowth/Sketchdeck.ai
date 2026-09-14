import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Stack consolidation" };

const ROWS = [
  { tool: "Supermetrics", category: "Data pipelines", replacement: "Live data (NotFair MCP + native connectors)", estimate: "$15K–$40K" },
  { tool: "Looker Studio + analyst time", category: "Reporting", replacement: "Automated dashboards & daily brief", estimate: "$30K–$60K" },
  { tool: "Smartly.io", category: "Paid social optimization", replacement: "AI optimization with approval workflow", estimate: "$60K–$100K" },
  { tool: "AdEspresso", category: "Creative testing", replacement: "Creative → pipeline intelligence", estimate: "$5K–$15K" },
  { tool: "Motion", category: "Creative analytics / orchestration", replacement: "Orchestration + creative intelligence", estimate: "$20K–$40K" },
];

export default function StackPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Marketing Stack Consolidation" subtitle="A supporting business-case view. Illustrative annual software replacement estimate — not verified pricing." />
      <Card className="border-accent/30 bg-accent-soft/30">
        <CardContent className="flex flex-wrap items-end gap-4 py-6">
          <span className="tnum text-4xl font-semibold tracking-tight">$225K+/year</span>
          <span className="pb-1 text-sm text-muted">Illustrative annual software replacement estimate</span>
          <Badge variant="warning" className="mb-1.5">Illustrative</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Replacement categories</CardTitle>
          <CardDescription>Ranges reflect typical mid-market list pricing plus analyst time; confirm against SketchDeck&apos;s actual contracts before using in any decision.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tool</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>AdPilot capability</TableHead>
                <TableHead className="text-right">Illustrative annual cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r) => (
                <TableRow key={r.tool}>
                  <TableCell className="font-medium">{r.tool}</TableCell>
                  <TableCell className="text-muted">{r.category}</TableCell>
                  <TableCell>→ {r.replacement}</TableCell>
                  <TableCell className="tnum text-right">{r.estimate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted">This page supports a business case; it is not the product promise. AdPilot&apos;s core value is profitable B2B pipeline: connecting ad activity to qualified pipeline and revenue, explaining what happened, recommending what to do next, and measuring whether it worked.</p>
    </div>
  );
}
