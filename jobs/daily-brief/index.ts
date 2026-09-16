/**
 * Daily B2B marketing brief — markdown + email-ready HTML, generated from the
 * analysis snapshot. Uses "Estimated" for every projection.
 */

import type { DataRepository } from "@/lib/data/repository";
import type { DailyBrief } from "@/types/domain";
import { loadSnapshot } from "@/lib/analytics/load-snapshot";
import type { AnalysisSnapshot } from "@/lib/analytics/snapshot";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtSignedPct, PLATFORM_LABEL } from "@/lib/utils/format";
import { pctChange } from "@/lib/calculations/metrics";
import { newId } from "@/lib/utils/id";
import { sendEmail } from "@/lib/email";

export function composeBrief(s: AnalysisSnapshot, date: string, monthly: AnalysisSnapshot = s): { subject: string; markdown: string; html: string } {
  const t = s.totals;
  const p = s.previousTotals;
  const line = (label: string, cur: string, change: number | null) => `- **${label}:** ${cur}${change === null ? "" : ` (${fmtSignedPct(change)} vs. prior period)`}`;

  const wins = [...monthly.campaigns]
    .filter((c) => c.campaign.status === "active" && c.totals.pipeline > 0)
    .sort((a, b) => b.totals.pipeline - a.totals.pipeline)
    .slice(0, 3);
  const problems = [...monthly.campaigns]
    .filter((c) => c.campaign.status === "active" && (c.fatigue.status !== "healthy" || c.health.status === "critical" || c.health.status === "at_risk"))
    .sort((a, b) => (100 - b.health.score) * b.totals.spend - (100 - a.health.score) * a.totals.spend)
    .slice(0, 3);
  const recs = monthly.recommendations.slice(0, 5);
  const actions = monthly.plan.increases.length;

  const md = [
    `# AdPilot Daily Brief — ${date}`,
    ``,
    `_${s.organization.name} · KPIs for ${s.window.label}; wins, problems and recommendations from ${monthly.window.label} · all figures are estimates unless labeled measured._`,
    ``,
    `## Headline`,
    ...s.summary.sentences.map((x) => `- ${x}`),
    ``,
    `## Pipeline & revenue`,
    line("Pipeline", fmtCompactCurrency(t.pipeline), pctChange(t.pipeline, p.pipeline)),
    line("Revenue", fmtCompactCurrency(t.revenue), pctChange(t.revenue, p.revenue)),
    line("Pipeline ROAS", fmtMultiple(s.derived.pipelineRoas), pctChange(s.derived.pipelineRoas ?? 0, s.previousDerived.pipelineRoas ?? 0)),
    line("Revenue ROAS", fmtMultiple(s.derived.roas), pctChange(s.derived.roas ?? 0, s.previousDerived.roas ?? 0)),
    line("Spend", fmtCompactCurrency(t.spend), pctChange(t.spend, p.spend)),
    line("MQLs", String(t.mqls), pctChange(t.mqls, p.mqls)),
    line("SQLs", String(t.sqls), pctChange(t.sqls, p.sqls)),
    ``,
    `## Biggest wins`,
    ...(wins.length ? wins.map((w) => `- **${w.campaign.name}** (${PLATFORM_LABEL[w.campaign.platform]}): ${fmtCompactCurrency(w.totals.pipeline)} pipeline, ${w.totals.sqls} SQLs, ${fmtMultiple(w.metrics.pipelineRoas)} pipeline ROAS`) : ["- No pipeline recorded in this window."]),
    ``,
    `## Biggest problems`,
    ...(problems.length ? problems.map((c) => `- **${c.campaign.name}**: health ${c.health.score}/100 (${c.health.label}), fatigue ${c.fatigue.status} — ${c.fatigue.reasons[0]}`) : ["- No critical issues detected."]),
    ``,
    `## AI recommendations (top ${recs.length})`,
    ...recs.map((r) => `- [${r.priority.toUpperCase()}] ${r.title} — ${r.recommendedAction} _(confidence ${Math.round(r.confidence * 100)}%, ${r.requiresApproval ? "requires approval" : "informational"})_`),
    ``,
    `## AI actions`,
    `- ${actions} budget reallocation${actions === 1 ? "" : "s"} proposed (${fmtCurrency(monthly.plan.totalMovePeriod)} over ${monthly.plan.horizonDays} days) — awaiting approval.`,
    `- Why did performance change? ${monthly.whyChanged.headline}`,
  ].join("\n");

  const html = renderEmailHtml(md, s, date);
  return { subject: `AdPilot Daily Brief — ${date}: ${fmtCompactCurrency(t.pipeline)} pipeline, ${t.sqls} SQLs`, markdown: md, html };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tiny markdown → HTML for headings, bullets, bold, italics. */
function renderEmailHtml(md: string, s: AnalysisSnapshot, date: string) {
  const inline = (x: string) => esc(x).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>");
  const parts: string[] = [];
  let inList = false;
  for (const raw of md.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("- ")) {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (inList) { parts.push("</ul>"); inList = false; }
    if (l.startsWith("# ")) parts.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith("## ")) parts.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (l) parts.push(`<p>${inline(l)}</p>`);
  }
  if (inList) parts.push("</ul>");
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px;line-height:1.5">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#666">AdPilot AI · ${esc(s.organization.name)} · ${esc(date)}</div>
${parts.join("\n")}
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0"/>
<p style="font-size:12px;color:#666">Projections are estimates based on trailing performance and are not guarantees. Actions require approval in AdPilot before any live advertising change.</p>
</body></html>`;
}

export async function runDailyBrief(repo: DataRepository, options: { windowDays?: number; now?: Date; recipients?: string[] } = {}): Promise<DailyBrief & { delivery?: { delivered: boolean; detail?: string } }> {
  const now = options.now ?? new Date();
  const [snapshot, monthly] = await Promise.all([loadSnapshot(repo, options.windowDays ?? 7, now), loadSnapshot(repo, 30, now)]);
  const date = snapshot.endDate;
  const composed = composeBrief(snapshot, date, monthly);
  const brief: DailyBrief = {
    id: newId(),
    organizationId: snapshot.organization.id,
    date,
    subject: composed.subject,
    summaryMarkdown: composed.markdown,
    emailHtml: composed.html,
    createdAt: now.toISOString(),
  };
  await repo.saveDailyBrief(brief);
  const recipients = options.recipients ?? (process.env.DAILY_BRIEF_RECIPIENTS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  let delivery: { delivered: boolean; detail?: string } | undefined;
  if (recipients.length) {
    delivery = await sendEmail({ to: recipients, subject: brief.subject, html: brief.emailHtml, text: brief.summaryMarkdown }).catch((err) => ({ delivered: false, detail: err instanceof Error ? err.message : String(err) }));
  }
  await repo.audit("daily-brief", "brief.generated", "daily_brief", brief.id, { recipients: recipients.length, delivered: delivery?.delivered ?? false });
  return { ...brief, delivery };
}
