"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { canApprove, getSessionUser } from "@/lib/auth/session";

const SettingsInput = z.object({
  criticalCtr: z.number().min(0.001).max(0.2),
  warningCtrBand: z.number().min(0).max(0.1),
  deteriorationPct: z.number().min(0.01).max(1),
  lookbackDays: z.number().int().min(1).max(14),
  baselineDays: z.number().int().min(3).max(60),
  maxFrequency: z.number().min(1).max(20),
  minRecentImpressions: z.number().int().min(0).max(100000),
  minRecentClicks: z.number().int().min(0).max(10000),
  maxBudgetChangePct: z.number().min(0.01).max(1),
  maxDailyExposure: z.number().min(0).max(1_000_000),
  approvalRequiredAbove: z.number().min(0).max(10_000_000),
  autoExecuteEnabled: z.boolean(),
});

export type SettingsInput = z.infer<typeof SettingsInput>;

export async function saveSettings(input: SettingsInput): Promise<{ ok: boolean; message: string }> {
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in required" };
  if (!canApprove(user)) return { ok: false, message: "Viewers cannot change settings" };
  const d = parsed.data;
  const repo = await getRepository();
  await repo.saveSettings({
    fatigueThresholds: { criticalCtr: d.criticalCtr, warningCtrBand: d.warningCtrBand, deteriorationPct: d.deteriorationPct, lookbackDays: d.lookbackDays, baselineDays: d.baselineDays, maxFrequency: d.maxFrequency, minRecentImpressions: d.minRecentImpressions, minRecentClicks: d.minRecentClicks },
    automationPolicy: { maxBudgetChangePct: d.maxBudgetChangePct, maxDailyExposure: d.maxDailyExposure, approvalRequiredAbove: d.approvalRequiredAbove, autoExecuteEnabled: d.autoExecuteEnabled },
  });
  await repo.audit(user.name, "settings.update", "org_settings", undefined, d);
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved. Thresholds apply to the next analysis." };
}
