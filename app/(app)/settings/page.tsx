import { getRepository } from "@/lib/data";
import { canApprove, getSessionUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForm } from "./settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDataMode, supabaseConfigured } from "@/lib/config/data-mode";
import { DataModePill } from "@/components/layout/topbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [repo, user] = await Promise.all([getRepository(), getSessionUser()]);
  const [org, settings] = await Promise.all([repo.getOrganization(), repo.getSettings()]);
  const mode = getDataMode();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle="Organization, thresholds and action safety." />
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>Organization isolation is enforced by row-level security in live mode.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-[11px] uppercase tracking-wide text-muted">Name</p><p className="font-medium">{org.name}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-muted">Currency · timezone</p><p className="font-medium">{org.currency} · {org.timezone}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-muted">Data mode</p><DataModePill mode={mode} /></div>
          <div><p className="text-[11px] uppercase tracking-wide text-muted">Authentication</p><p className="font-medium">{supabaseConfigured() ? "Supabase" : mode === "demo" ? "Public demo (no auth)" : "Not configured"}</p></div>
        </CardContent>
      </Card>
      <SettingsForm initial={{ ...settings.fatigueThresholds, ...settings.automationPolicy }} canEdit={canApprove(user)} />
    </div>
  );
}
