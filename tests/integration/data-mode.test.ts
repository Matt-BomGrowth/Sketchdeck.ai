import { describe, it, expect, afterEach, vi } from "vitest";
import { getDataMode, isLiveMode, dataModeBadge, authRequired, supabaseConfigured } from "@/lib/config/data-mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getDataMode", () => {
  it("defaults to demo when DATA_MODE is unset", () => {
    vi.stubEnv("DATA_MODE", "");
    delete process.env.DATA_MODE;
    expect(getDataMode()).toBe("demo");
    expect(isLiveMode()).toBe(false);
  });

  it("returns live only when DATA_MODE=live (case-insensitive)", () => {
    vi.stubEnv("DATA_MODE", "live");
    expect(getDataMode()).toBe("live");
    expect(isLiveMode()).toBe(true);
    vi.stubEnv("DATA_MODE", "LIVE");
    expect(getDataMode()).toBe("live");
  });

  it("never mixes: anything other than live is demo", () => {
    for (const v of ["demo", "DEMO", "production", "hybrid", "true", "1"]) {
      vi.stubEnv("DATA_MODE", v);
      expect(getDataMode()).toBe("demo");
    }
  });
});

describe("dataModeBadge", () => {
  it("labels demo and live distinctly", () => {
    expect(dataModeBadge("demo")).toEqual({ emoji: "🟡", label: "DEMO DATA" });
    expect(dataModeBadge("live")).toEqual({ emoji: "🟢", label: "LIVE DATA" });
  });
});

describe("authRequired", () => {
  it("is always true in live mode", () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("DEMO_REQUIRE_AUTH", "false");
    expect(authRequired()).toBe(true);
  });

  it("is opt-in via DEMO_REQUIRE_AUTH in demo mode", () => {
    vi.stubEnv("DATA_MODE", "demo");
    vi.stubEnv("DEMO_REQUIRE_AUTH", "false");
    expect(authRequired()).toBe(false);
    vi.stubEnv("DEMO_REQUIRE_AUTH", "true");
    expect(authRequired()).toBe(true);
  });
});

describe("supabaseConfigured", () => {
  it("requires both URL and anon key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(supabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(supabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabaseConfigured()).toBe(true);
  });
});
