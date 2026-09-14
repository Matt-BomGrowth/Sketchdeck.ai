"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { TableRow as Row } from "./rows";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FatiguePill, HealthPill, PlatformBadge } from "@/components/dashboard/status";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtNumber, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

type SortKey = keyof Pick<Row, "name" | "spend" | "ctr" | "leads" | "mqls" | "sqls" | "opportunities" | "pipeline" | "revenue" | "roas" | "pipelineRoas" | "cpl" | "costPerMql" | "costPerSql" | "healthScore" | "fatigueScore" | "qualityRank">;

const COLUMNS: Array<{ key: SortKey; label: string; align?: "right"; compactHidden?: boolean }> = [
  { key: "name", label: "Campaign" },
  { key: "spend", label: "Spend", align: "right" },
  { key: "ctr", label: "CTR", align: "right", compactHidden: true },
  { key: "leads", label: "Leads", align: "right", compactHidden: true },
  { key: "mqls", label: "MQLs", align: "right" },
  { key: "sqls", label: "SQLs", align: "right" },
  { key: "opportunities", label: "Opps", align: "right", compactHidden: true },
  { key: "pipeline", label: "Pipeline", align: "right" },
  { key: "revenue", label: "Revenue", align: "right", compactHidden: true },
  { key: "roas", label: "ROAS", align: "right", compactHidden: true },
  { key: "pipelineRoas", label: "Pipeline ROAS", align: "right" },
  { key: "cpl", label: "CPL", align: "right", compactHidden: true },
  { key: "costPerMql", label: "Cost/MQL", align: "right", compactHidden: true },
  { key: "costPerSql", label: "Cost/SQL", align: "right" },
  { key: "healthScore", label: "Health" },
  { key: "fatigueScore", label: "Fatigue" },
];

function val(r: Row, k: SortKey): number | string | null {
  return r[k] as number | string | null;
}

export function CampaignTable({ rows, compact = false, showFilters = false }: { rows: Row[]; compact?: boolean; showFilters?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: compact ? "qualityRank" : "pipeline", dir: compact ? "asc" : "desc" });
  const [platform, setPlatform] = useState("all");
  const [country, setCountry] = useState("all");
  const [industry, setIndustry] = useState("all");
  const [status, setStatus] = useState("active");
  const [health, setHealth] = useState("all");
  const [performance, setPerformance] = useState("all");
  const [q, setQ] = useState("");

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const industries = useMemo(() => [...new Set(rows.map((r) => r.industry))].sort(), [rows]);

  const filtered = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const count = active.length;
    return rows.filter((r) => {
      if (platform !== "all" && r.platform !== platform) return false;
      if (country !== "all" && r.country !== country) return false;
      if (industry !== "all" && r.industry !== industry) return false;
      if (status !== "all" && r.status !== status) return false;
      if (health !== "all" && r.healthStatus !== health) return false;
      if (performance === "top3" && r.qualityRank > 3) return false;
      if (performance === "bottom30" && r.qualityRank <= count - Math.max(1, Math.floor(count * 0.3))) return false;
      if (performance === "fatiguing" && r.fatigueStatus === "healthy") return false;
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, platform, country, industry, status, health, performance, q]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = val(a, sort.key);
      const bv = val(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [filtered, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "qualityRank" ? "asc" : "desc" }));
  const cols = compact ? COLUMNS.filter((c) => !c.compactHidden) : COLUMNS;

  return (
    <div>
      {showFilters ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns…" className="h-9 w-56 rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Search campaigns" />
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
            <option value="all">All platforms</option>
            <option value="google">Google Ads</option>
            <option value="meta">Meta Ads</option>
            <option value="linkedin">LinkedIn Ads</option>
          </Select>
          <Select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry">
            <option value="all">All industries</option>
            {industries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </Select>
          <Select value={health} onChange={(e) => setHealth(e.target.value)} aria-label="Health">
            <option value="all">Any health</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="at_risk">At risk</option>
            <option value="critical">Critical</option>
          </Select>
          <Select value={performance} onChange={(e) => setPerformance(e.target.value)} aria-label="Performance">
            <option value="all">Any performance</option>
            <option value="top3">Top 3 (quality)</option>
            <option value="bottom30">Bottom 30%</option>
            <option value="fatiguing">Fatiguing</option>
          </Select>
          <span className="ml-auto text-xs text-muted">{sorted.length} of {rows.length}</span>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {cols.map((c) => (
              <TableHead key={c.key} className={cn(c.align === "right" && "text-right")}>
                <button type="button" onClick={() => toggle(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === c.key && "text-foreground")}>
                  {c.label}
                  {sort.key === c.key ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                </button>
              </TableHead>
            ))}
            <TableHead>AI recommendation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[22rem]">
                <div className="flex items-center gap-2">
                  <PlatformBadge platform={r.platform} short />
                  <Link href={`/campaigns/${r.id}`} className="truncate font-medium hover:underline" title={r.name}>
                    {r.name}
                  </Link>
                  {r.status !== "active" ? <Badge variant="outline" className="capitalize">{r.status}</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="tnum text-right">{fmtCompactCurrency(r.spend)}</TableCell>
              {!compact ? <TableCell className="tnum text-right">{fmtPct(r.ctr, 2)}</TableCell> : null}
              {!compact ? <TableCell className="tnum text-right">{fmtNumber(r.leads)}</TableCell> : null}
              <TableCell className="tnum text-right">{fmtNumber(r.mqls)}</TableCell>
              <TableCell className="tnum text-right">{fmtNumber(r.sqls)}</TableCell>
              {!compact ? <TableCell className="tnum text-right">{fmtNumber(r.opportunities)}</TableCell> : null}
              <TableCell className="tnum text-right font-medium">{fmtCompactCurrency(r.pipeline)}</TableCell>
              {!compact ? <TableCell className="tnum text-right">{fmtCompactCurrency(r.revenue)}</TableCell> : null}
              {!compact ? <TableCell className="tnum text-right">{fmtMultiple(r.roas)}</TableCell> : null}
              <TableCell className={cn("tnum text-right font-medium", (r.pipelineRoas ?? 0) >= 10 ? "text-positive" : (r.pipelineRoas ?? 0) < 2 ? "text-negative" : "")}>{fmtMultiple(r.pipelineRoas)}</TableCell>
              {!compact ? <TableCell className="tnum text-right">{fmtCurrency(r.cpl)}</TableCell> : null}
              {!compact ? <TableCell className="tnum text-right">{fmtCurrency(r.costPerMql)}</TableCell> : null}
              <TableCell className="tnum text-right">{fmtCurrency(r.costPerSql)}</TableCell>
              <TableCell>
                <HealthPill score={r.healthScore} status={r.healthStatus} label={r.healthLabel} />
              </TableCell>
              <TableCell>
                <FatiguePill status={r.fatigueStatus} score={r.fatigueScore} />
              </TableCell>
              <TableCell className="max-w-[18rem]">
                {r.recommendation ? (
                  <Link href={`/agent?rec=${r.recommendation.id}`} className="block truncate text-xs text-accent hover:underline" title={r.recommendation.action}>
                    {r.recommendation.title.split(":")[0]}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Hold</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={cols.length + 1} className="py-8 text-center text-xs text-muted">
                No campaigns match these filters.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
