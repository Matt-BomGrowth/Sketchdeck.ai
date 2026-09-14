import { cache } from "react";
import { getDataMode, supabaseConfigured } from "@/lib/config/data-mode";
import type { DataRepository } from "./repository";
import { DemoRepository } from "./demo-repository";

/**
 * Resolve the repository for the current request. Demo mode never touches a
 * database; live mode requires Supabase and an authenticated user with an
 * organization.
 */
export const getRepository = cache(async (): Promise<DataRepository> => {
  if (getDataMode() === "demo") return new DemoRepository();
  if (!supabaseConfigured()) throw new Error("DATA_MODE=live requires Supabase configuration.");
  const [{ createSupabaseServerClient }, { LiveRepository }, { getSessionUser }] = await Promise.all([
    import("@/lib/db/supabase-server"),
    import("./live-repository"),
    import("@/lib/auth/session"),
  ]);
  const user = await getSessionUser();
  if (!user?.organizationId) throw new Error("No organization for the current user.");
  const db = await createSupabaseServerClient();
  return new LiveRepository(db, user.organizationId, user.email);
});

/** Repository for background jobs (service role, explicit organization). */
export async function getJobRepository(organizationId?: string): Promise<DataRepository> {
  if (getDataMode() === "demo") return new DemoRepository();
  const [{ createSupabaseAdminClient }, { LiveRepository }] = await Promise.all([import("@/lib/db/supabase-admin"), import("./live-repository")]);
  const db = createSupabaseAdminClient();
  const orgId = organizationId ?? process.env.ADPILOT_ORGANIZATION_ID;
  if (!orgId) throw new Error("ADPILOT_ORGANIZATION_ID is required for jobs in live mode.");
  return new LiveRepository(db, orgId, "hourly-scan");
}

export type { DataRepository };
