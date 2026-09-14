import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getRepository } from "@/lib/data";
import { getSessionUser } from "@/lib/auth/session";
import { getDataMode } from "@/lib/config/data-mode";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const repo = await getRepository();
  const [org, runs, recs] = await Promise.all([repo.getOrganization(), repo.getScanRuns(1), repo.getRecommendations()]);
  const last = runs[0];
  const lastScanAt = last?.finishedAt ?? last?.startedAt;
  const nextScanAt = lastScanAt ? new Date(new Date(lastScanAt).getTime() + 3600_000).toISOString() : undefined;
  return (
    <AppShell
      topbar={{
        organizationName: org.name,
        mode: getDataMode(),
        lastScanAt,
        nextScanAt,
        notifications: recs.filter((r) => r.status === "pending").length,
        userName: user.name,
        userRole: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
