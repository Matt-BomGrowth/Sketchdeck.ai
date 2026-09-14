/* eslint-disable @typescript-eslint/no-explicit-any -- raw GAQL fixture rows */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const normalizePath = path.join(root, "integrations", "notfair", "normalize.ts");
const fixturesDir = path.join(root, "integrations", "notfair", "fixtures");
const exists = fs.existsSync(normalizePath);

type Fixture = {
  campaigns: Array<Record<string, any>>;
  daily: Array<Record<string, any>>;
  ads: Array<Record<string, any>>;
  imageAssets?: Array<Record<string, any>>;
};

function loadFixtures(): Array<[string, Fixture]> {
  if (!fs.existsSync(fixturesDir)) return [];
  return fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f, JSON.parse(fs.readFileSync(path.join(fixturesDir, f), "utf8")) as Fixture]);
}

describe.skipIf(!exists)("NotFair normalization", async () => {
  const mod = await import("@/integrations/notfair/normalize");
  const fixtures = loadFixtures();

  it("has at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("micros converts cost_micros to dollars with cent precision", () => {
    expect(mod.micros(209_385_000)).toBe(209.39);
    expect(mod.micros("120000000")).toBe(120);
    expect(mod.micros(undefined)).toBe(0);
    expect(mod.micros("nope")).toBe(0);
  });

  it("maps Google statuses to domain statuses", () => {
    expect(mod.mapStatus("ENABLED")).toBe("active");
    expect(mod.mapStatus("PAUSED")).toBe("paused");
    expect(mod.mapStatus("REMOVED")).toBe("ended");
    expect(mod.mapStatus(undefined)).toBe("draft");
    expect(mod.mapStatus("enabled")).toBe("active");
  });

  for (const [name, fx] of fixtures) {
    describe(name, () => {
      it("normalizes campaigns to platform google with numeric budgets", () => {
        const campaigns = mod.normalizeCampaigns(fx.campaigns, "USD");
        expect(campaigns).toHaveLength(fx.campaigns.length);
        for (const c of campaigns) {
          expect(c.platform).toBe("google");
          expect(typeof c.externalId).toBe("string");
          expect(c.currency).toBe("USD");
          expect(Number.isFinite(c.dailyBudget)).toBe(true);
          expect(c.dailyBudget).toBeGreaterThan(0);
          expect(["active", "paused", "ended", "draft"]).toContain(c.status);
          expect(c.raw).toBeDefined();
        }
        const core = campaigns.find((c) => c.externalId === "23545358793")!;
        expect(core.name).toBe("USA,CA | Core Phrases | Search | [tCPA $600]");
        expect(core.status).toBe("active");
        expect(core.channelType).toBe("Search");
        expect(core.dailyBudget).toBe(120);
        expect(core.objective).toBe("demo_requests");
        const brand = campaigns.find((c) => c.externalId === "23584905281")!;
        expect(brand.objective).toBe("brand");
        const pilot = campaigns.find((c) => c.externalId === "22663521071")!;
        expect(pilot.status).toBe("paused");
      });

      it("falls back to cost_micros/1e6 when amount_value / cost_value are absent", () => {
        const stripped = fx.campaigns.map((r) => ({ ...r, campaign_budget: { amount_micros: r.campaign_budget.amount_micros } }));
        const campaigns = mod.normalizeCampaigns(stripped);
        for (let i = 0; i < stripped.length; i++) {
          expect(campaigns[i].dailyBudget).toBeCloseTo(stripped[i].campaign_budget.amount_micros / 1e6, 2);
        }
        const dailyStripped = fx.daily.map((r) => ({ ...r, metrics: { ...r.metrics, cost_value: undefined } }));
        const daily = mod.normalizeDailyMetrics(dailyStripped);
        for (let i = 0; i < dailyStripped.length; i++) {
          expect(daily[i].spend).toBeCloseTo(dailyStripped[i].metrics.cost_micros / 1e6, 2);
        }
      });

      it("normalizes daily metrics with spend, clicks, impressions and platform conversions as leads", () => {
        const daily = mod.normalizeDailyMetrics(fx.daily);
        expect(daily).toHaveLength(fx.daily.length);
        for (const d of daily) {
          expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(Number.isFinite(d.spend)).toBe(true);
          expect(Number.isInteger(d.impressions)).toBe(true);
          expect(Number.isInteger(d.clicks)).toBe(true);
          expect(Number.isInteger(d.leads)).toBe(true);
          // CRM stages are left for attribution.
          expect(d.mqls).toBe(0);
          expect(d.sqls).toBe(0);
          expect(d.pipeline).toBe(0);
        }
        const core = daily.find((d) => d.externalCampaignId === "23545358793" && d.date === "2026-09-02")!;
        expect(core.spend).toBeCloseTo(209.385, 3);
        expect(core.clicks).toBe(9);
        expect(core.impressions).toBe(274);
        expect(core.leads).toBe(0);
        const brand = daily.find((d) => d.externalCampaignId === "23584905281")!;
        expect(brand.leads).toBe(1);
        expect(brand.platformConversions).toBe(1);
      });

      it("skips rows without a campaign id or date", () => {
        expect(mod.normalizeCampaigns([{ campaign: {} }, { metrics: {} }])).toEqual([]);
        expect(mod.normalizeDailyMetrics([{ campaign: { id: 1 }, metrics: {} }])).toEqual([]);
      });

      it("normalizes responsive search ads as text creatives with no fabricated asset", () => {
        const creatives = mod.normalizeCreatives({ ads: fx.ads, imageAssets: fx.imageAssets });
        expect(creatives).toHaveLength(fx.ads.length);
        const rsa = creatives.find((c) => c.externalId === "796862002210")!;
        expect(rsa.platform).toBe("google");
        expect(rsa.type).toBe("text");
        expect(rsa.assetStatus).toBe("unavailable");
        expect(rsa.assetUrl).toBeUndefined();
        expect(rsa.externalCampaignId).toBe("23545358793");
        expect(rsa.externalAdGroupId).toBe("196820796887");
        expect(rsa.status).toBe("active");
        expect(rsa.landingUrl).toBe("https://sketchdeck.ai/");
        // Best-performing headline wins (GOOD > LEARNING > PENDING).
        expect(rsa.headline).toBe("Steel Quantities in Minutes");
        expect(rsa.primaryText.length).toBeGreaterThan(0);
        expect(rsa.name).toMatch(/Steel Takeoff Software · RSA 796862002210/);
      });

      it("derives assetStatus from available media for image, display and video ads", () => {
        const base = (id: number, ad: Record<string, unknown>) => ({
          campaign: { id: 23545358793 },
          ad_group: { id: 1, name: "AG" },
          ad_group_ad: { status_name: "ENABLED", ad: { id, final_urls: ["https://sketchdeck.ai/"], ...ad } },
        });
        const imageAsset = fx.imageAssets![0];
        const ads = [
          base(1, { type_name: "IMAGE_AD", name: "Full image", image_ad: { image_url: "https://cdn/x.png", preview_image_url: "https://cdn/x-preview.png" } }),
          base(2, { type_name: "IMAGE_AD", name: "Preview only", image_ad: { preview_image_url: "https://cdn/y-preview.png" } }),
          base(3, { type_name: "IMAGE_AD", name: "No media", image_ad: {} }),
          base(4, {
            type_name: "RESPONSIVE_DISPLAY_AD",
            name: "Display",
            responsive_display_ad: { long_headline: { text: "Long headline" }, descriptions: [{ text: "Desc" }], marketing_images: [{ asset: `customers/1/assets/${imageAsset.asset.id}` }] },
          }),
          base(5, { type_name: "RESPONSIVE_DISPLAY_AD", name: "Display missing asset", responsive_display_ad: { headlines: [{ text: "H" }], marketing_images: [{ asset: "customers/1/assets/999" }] } }),
          base(6, { type_name: "VIDEO_AD", name: "Video", video_ad: { video: { asset: "customers/1/assets/777" } } }),
          base(7, { type_name: "VIDEO_AD", name: "Video without asset", video_ad: { video: { asset: "customers/1/assets/888" } } }),
          base(8, { type_name: "SOMETHING_NEW", name: "Unknown" }),
        ];
        const videoAssets = [{ asset: { id: 777, youtube_video_asset: { youtube_video_id: "abc123", youtube_video_title: "LIFT demo" } } }];
        const out = mod.normalizeCreatives({ ads, imageAssets: fx.imageAssets, videoAssets });
        const byId = Object.fromEntries(out.map((c) => [c.externalId, c]));

        expect(byId["1"].assetStatus).toBe("asset");
        expect(byId["1"].assetUrl).toBe("https://cdn/x.png");
        expect(byId["1"].previewUrl).toBe("https://cdn/x-preview.png");
        expect(byId["1"].type).toBe("image");

        expect(byId["2"].assetStatus).toBe("preview");
        expect(byId["2"].assetUrl).toBeUndefined();
        expect(byId["2"].previewUrl).toBe("https://cdn/y-preview.png");

        expect(byId["3"].assetStatus).toBe("unavailable");
        expect(byId["3"].assetUrl).toBeUndefined();

        expect(byId["4"].assetStatus).toBe("asset");
        expect(byId["4"].assetUrl).toBe(imageAsset.asset.image_asset.full_size.url);
        expect(byId["4"].width).toBe(imageAsset.asset.image_asset.full_size.width_pixels);
        expect(byId["4"].height).toBe(imageAsset.asset.image_asset.full_size.height_pixels);
        expect(byId["4"].headline).toBe("Long headline");
        expect(byId["4"].assetId).toBe(String(imageAsset.asset.id));

        expect(byId["5"].assetStatus).toBe("unavailable");
        expect(byId["5"].headline).toBe("H");

        expect(byId["6"].assetStatus).toBe("preview");
        expect(byId["6"].type).toBe("video");
        expect(byId["6"].previewUrl).toBe("https://www.youtube.com/watch?v=abc123");
        expect(byId["6"].headline).toBe("LIFT demo");

        expect(byId["7"].assetStatus).toBe("unavailable");
        expect(byId["7"].previewUrl).toBeUndefined();

        expect(byId["8"].assetStatus).toBe("unavailable");
        expect(byId["8"].type).toBe("text");

        // Never a fabricated asset: every "asset" status carries a real URL.
        for (const c of out) if (c.assetStatus === "asset") expect(c.assetUrl).toMatch(/^https?:\/\//);
      });

      it("normalizes image assets from the asset library", () => {
        const assets = mod.normalizeImageAssets(fx.imageAssets ?? []);
        expect(assets).toHaveLength((fx.imageAssets ?? []).length);
        for (const a of assets) {
          expect(a.platform).toBe("google");
          expect(a.url).toMatch(/^https:\/\//);
          expect(a.width).toBeGreaterThan(0);
          expect(a.height).toBeGreaterThan(0);
        }
        expect(mod.normalizeImageAssets([{ asset: { id: 1 } }])).toEqual([]);
      });

      it("normalizes per-ad daily metrics", () => {
        const rows = fx.ads.map((a) => ({ ...a, segments: { date: "2026-09-02" } }));
        const out = mod.normalizeAdDailyMetrics(rows);
        expect(out).toHaveLength(rows.length);
        expect(out[0].externalCreativeId).toBe("796862002210");
        expect(out[0].date).toBe("2026-09-02");
        expect(out[0].spend).toBeCloseTo(667.567961, 3);
        expect(out[0].clicks).toBe(24);
        expect(out[0].leads).toBe(0);
      });
    });
  }
});

describe.skipIf(exists)("NotFair normalization (pending)", () => {
  it("is skipped until integrations/notfair/normalize.ts exists", () => {
    expect(exists).toBe(false);
  });
});
