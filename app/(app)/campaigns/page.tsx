import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignTable } from "@/components/campaigns/campaign-table";
import { toTableRows } from "@/components/campaigns/rows";
import { Card, CardContent } from "@/components/ui/card";
import { fmtCompactCurrency } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = windowDaysFrom((await searchParams).window);
  const s = await getPageSnapshot(days);
  const rows = toTableRows(s.campaigns);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Campaigns" subtitle={`${rows.length} campaigns across Google, Meta and LinkedIn · ${fmtCompactCurrency(s.totals.spend)} spend, ${fmtCompactCurrency(s.totals.pipeline)} pipeline, ${s.window.label}.`} windowKey={key} />
      <Card>
        <CardContent className="px-2 pt-4 pb-2">
          <CampaignTable rows={rows} showFilters />
        </CardContent>
      </Card>
    </div>
  );
}
