import type { DataMode } from "@/types/domain";

/**
 * DATA_MODE=demo → generated SketchDeck demo data, no credentials required.
 * DATA_MODE=live → real integrations (NotFair MCP, HubSpot, …) + Supabase.
 * The two are never mixed: the active mode is displayed persistently in the UI.
 */
export function getDataMode(): DataMode {
  const raw = (process.env.DATA_MODE ?? "demo").toLowerCase();
  return raw === "live" ? "live" : "demo";
}

export function isLiveMode() {
  return getDataMode() === "live";
}

export function dataModeBadge(mode: DataMode) {
  return mode === "live" ? { emoji: "🟢", label: "LIVE DATA" } : { emoji: "🟡", label: "DEMO DATA" };
}

/** Supabase is optional in demo mode and required in live mode. */
export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Whether routes must be authenticated. Public demo is allowed only in demo mode. */
export function authRequired() {
  if (isLiveMode()) return true;
  return process.env.DEMO_REQUIRE_AUTH === "true";
}
