import { NextResponse } from "next/server";
import { getDataMode, supabaseConfigured } from "@/lib/config/data-mode";
import { notfairConfigured } from "@/integrations/notfair/client";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "adpilot-ai",
    dataMode: getDataMode(),
    supabase: supabaseConfigured(),
    notfair: notfairConfigured(),
    time: new Date().toISOString(),
  });
}
