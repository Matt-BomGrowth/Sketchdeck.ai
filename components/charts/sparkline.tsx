"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

export function Sparkline({ data, dataKey = "v", tone = "accent", height = 28 }: { data: Array<Record<string, number | string>>; dataKey?: string; tone?: "accent" | "positive" | "negative" | "muted"; height?: number }) {
  const stroke = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : tone === "muted" ? "var(--muted-2)" : "var(--accent)";
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
