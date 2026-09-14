"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompactCurrency, fmtDate } from "@/lib/utils/format";

export interface TrendPoint {
  date: string;
  pipeline: number;
  spend: number;
  sqls: number;
}

export function PipelineTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis yAxisId="money" tickFormatter={(v: number) => fmtCompactCurrency(v)} tickLine={false} axisLine={false} width={52} />
          <YAxis yAxisId="spend" orientation="right" tickFormatter={(v: number) => fmtCompactCurrency(v)} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => fmtDate(String(d), { month: "short", day: "numeric", year: "numeric" })}
            formatter={(value, name) => [name === "SQLs" ? String(value) : fmtCompactCurrency(Number(value)), String(name)]}
          />
          <Area yAxisId="money" type="monotone" dataKey="pipeline" name="Pipeline" stroke="var(--chart-1)" strokeWidth={2} fill="url(#pipelineFill)" />
          <Area yAxisId="spend" type="monotone" dataKey="spend" name="Spend (right axis)" stroke="var(--chart-3)" strokeWidth={1.5} fill="transparent" strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
