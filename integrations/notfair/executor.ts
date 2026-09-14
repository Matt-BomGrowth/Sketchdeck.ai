import type { OptimizationAction, Recommendation } from "@/types/domain";
import type { ExecutionAdapter } from "@/agent/actions/approval-workflow";
import { NotFairClient, NotFairError, getNotFairClient } from "./client";
import { WRITE } from "./capabilities";

/**
 * Executes APPROVED actions on Google Ads through NotFair's write
 * capabilities. This adapter is only ever invoked by the approval workflow;
 * it refuses anything that has not been approved by a named approver.
 */
export class NotFairExecutor implements ExecutionAdapter {
  constructor(private readonly client: NotFairClient = getNotFairClient(), private readonly accountId = process.env.NOTFAIR_GOOGLE_ADS_ACCOUNT_ID) {}

  async execute(action: OptimizationAction, rec: Recommendation): Promise<{ after: string; externalChangeId?: string }> {
    if (action.status !== "executing" && action.status !== "approved") throw new NotFairError("Action is not approved.", "approval_required");
    if (!action.approver) throw new NotFairError("Action has no approver.", "approval_required");
    if (rec.platform !== "google") throw new NotFairError(`NotFair executor only supports Google Ads in this workspace (got ${rec.platform}).`, "unsupported_platform");
    const campaignId = await this.resolveExternalCampaignId(action.campaignId);
    const approval = { approved: true, approver: action.approver };
    const account = this.accountId ? { accountId: this.accountId } : {};

    switch (action.actionType) {
      case "budget_increase":
      case "budget_decrease": {
        if (!rec.budgetChange) throw new NotFairError("Budget recommendation has no budget change.", "invalid");
        const res = await this.client.execute<{ changeId?: string }>(WRITE.updateCampaignBudget, { ...account, campaignId, newDailyBudgetDollars: rec.budgetChange.to }, approval);
        return { after: `$${rec.budgetChange.to}/day`, externalChangeId: res?.changeId };
      }
      case "rotate_creative": {
        // Creative rotation itself is a human task; when a critical fatigue rec
        // includes a 10% budget reduction we apply just that.
        if (!rec.budgetChange) return { after: "Creative rotation queued (manual)" };
        const res = await this.client.execute<{ changeId?: string }>(WRITE.updateCampaignBudget, { ...account, campaignId, newDailyBudgetDollars: rec.budgetChange.to }, approval);
        return { after: `$${rec.budgetChange.to}/day (creative rotation queued)`, externalChangeId: res?.changeId };
      }
      case "pause_campaign": {
        const res = await this.client.execute<{ changeId?: string }>(WRITE.pauseCampaign, { ...account, campaignId }, approval);
        return { after: "Paused", externalChangeId: res?.changeId };
      }
      default:
        return { after: `${action.actionType} recorded (no platform write)` };
    }
  }

  /** In live mode campaign ids are AdPilot UUIDs; the external id is resolved by the caller via the repository. */
  private async resolveExternalCampaignId(id: string) {
    return id;
  }
}
