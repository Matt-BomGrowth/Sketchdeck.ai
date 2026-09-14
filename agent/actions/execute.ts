import type { OptimizationAction, Recommendation } from "@/types/domain";
import type { DataRepository } from "@/lib/data/repository";
import { executeAction, type ExecutionAdapter } from "./approval-workflow";
import { NotFairExecutor } from "@/integrations/notfair/executor";
import { notfairConfigured } from "@/integrations/notfair/client";

/**
 * Demo executor: records the change without touching any advertising
 * account. Used whenever DATA_MODE=demo.
 */
class DemoExecutor implements ExecutionAdapter {
  async execute(action: OptimizationAction, rec: Recommendation) {
    return { after: rec.budgetChange ? `$${rec.budgetChange.to}/day (demo — no live change)` : `${action.actionType} (demo — no live change)` };
  }
}

/**
 * Execute an approved action through the right adapter and persist the
 * outcome. In live mode without NotFair configured, the action stays
 * "approved" and is reported as awaiting a connected executor.
 */
export async function executeApprovedAction(repo: DataRepository, action: OptimizationAction, rec: Recommendation) {
  let adapter: ExecutionAdapter;
  if (repo.mode === "demo") adapter = new DemoExecutor();
  else if (rec.platform === "google" && notfairConfigured()) adapter = new NotFairExecutor();
  else {
    await repo.audit(action.approver ?? "system", "action.awaiting_executor", "optimization_action", action.id, { platform: rec.platform });
    return { action, recommendation: rec, pending: true as const };
  }
  const result = await executeAction(action, rec, adapter);
  await repo.saveAction(result.action);
  await repo.audit(action.approver ?? "system", `action.${result.action.status}`, "optimization_action", action.id, { after: result.action.after });
  return result;
}
