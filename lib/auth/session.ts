import { authRequired, supabaseConfigured } from "@/lib/config/data-mode";
import { createSupabaseServerClient } from "@/lib/db/supabase-server";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  organizationId?: string;
  role: string;
}

/**
 * Resolve the current user. In demo mode without Supabase this returns a
 * demo viewer so the public demo works without credentials.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!supabaseConfigured()) {
    if (authRequired()) return null;
    return { id: "demo-user", email: "demo@sketchdeck.ai", name: "Demo Viewer", role: "viewer" };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return authRequired() ? null : { id: "demo-user", email: "demo@sketchdeck.ai", name: "Demo Viewer", role: "viewer" };
    const { data: profile } = await supabase.from("users").select("organization_id, role, full_name").eq("id", data.user.id).maybeSingle();
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      name: profile?.full_name ?? data.user.email ?? "User",
      organizationId: profile?.organization_id ?? undefined,
      role: profile?.role ?? "member",
    };
  } catch {
    return authRequired() ? null : { id: "demo-user", email: "demo@sketchdeck.ai", name: "Demo Viewer", role: "viewer" };
  }
}

export function canApprove(user: SessionUser | null) {
  if (!user) return false;
  // Demo viewers may approve in demo mode (no live account is touched).
  if (user.id === "demo-user") return true;
  return ["owner", "admin", "member"].includes(user.role);
}
