import { getRepository } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IntegrationHealthDot } from "@/components/dashboard/status";
import { NOTFAIR_CONNECTED_AT_VERIFICATION, NOTFAIR_LIMITATIONS, NOTFAIR_VERIFIED_AT, READ, WRITE } from "@/integrations/notfair/capabilities";
import { checkAllIntegrations } from "@/integrations/registry";
import { fmtRelative } from "@/lib/utils/format";
import type { IntegrationStatus } from "@/types/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations" };

const REQUIREMENTS: Record<string, string> = {
  notfair: "NOTFAIR_MCP_URL + OAuth material from `npm run notfair:auth` (NOTFAIR_OAUTH_CLIENT / NOTFAIR_OAUTH_TOKENS)",
  google_ads: "Via NotFair. Direct API optional: GOOGLE_ADS_DEVELOPER_TOKEN, CLIENT_ID/SECRET, REFRESH_TOKEN, CUSTOMER_ID",
  meta: "META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (Marketing API)",
  linkedin: "LINKEDIN_ACCESS_TOKEN, LINKEDIN_AD_ACCOUNT_ID (Marketing Developer Platform)",
  hubspot: "HUBSPOT_ACCESS_TOKEN (HubSpot Service Key) for SketchDeck's own portal — verify at /api/integrations/hubspot/verify",
  ga4: "Via NotFair. GA4_PROPERTY_ID optional (defaults to the active property)",
  search_console: "Via NotFair — connect Search Console in the NotFair workspace",
};

export default async function IntegrationsPage() {
  const repo = await getRepository();
  let statuses: IntegrationStatus[];
  if (repo.mode === "demo") statuses = await repo.getIntegrationStatuses();
  else {
    // Live: independent health checks; one failing integration never hides the others.
    statuses = await checkAllIntegrations();
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Integrations" subtitle="Each integration is an independent module with its own health. A connection issue in one never affects the dashboard for the others." />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {statuses.map((s) => (
          <Card key={s.key} className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{s.name}</h3>
              <IntegrationHealthDot health={s.health} />
            </div>
            <p className="text-xs text-muted">{s.detail}</p>
            <p className="text-[11px] text-muted-2">
              {s.lastSyncAt ? `Last sync ${fmtRelative(s.lastSyncAt)} · ` : ""}Requires: {REQUIREMENTS[s.key]}
            </p>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>NotFair MCP — verified capability inventory</CardTitle>
          <CardDescription>
            Inspected against the live MCP connection on {NOTFAIR_VERIFIED_AT}. Connected in the SketchDeck workspace: {NOTFAIR_CONNECTED_AT_VERIFICATION.map((p) => `${p.platform} (${p.primaryAccountId})`).join(", ")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Read capabilities used</p>
            <ul className="flex flex-col gap-1.5">
              {Object.values(READ).map((c) => (
                <li key={c.id} className="text-xs">
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">{c.id}</code> <span className="text-muted">— {c.purpose}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Write capabilities (gated by approval)</p>
            <ul className="flex flex-col gap-1.5">
              {Object.values(WRITE).map((c) => (
                <li key={c.id} className="text-xs">
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">{c.id}</code> <Badge variant="warning">approval</Badge> <span className="text-muted">— {c.purpose}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Limitations</p>
            <ul className="flex flex-col gap-1 text-xs text-muted">
              {NOTFAIR_LIMITATIONS.map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
