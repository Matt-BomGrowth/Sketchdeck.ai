/**
 * Verify the HubSpot Service Key for AdPilot without storing or printing it.
 *
 *   # .env.local (git-ignored):  HUBSPOT_ACCESS_TOKEN=<HubSpot Service Key>
 *   npm run hubspot:verify
 *
 * The same report is available after deployment at
 *   GET /api/integrations/hubspot/verify  (see docs/deployment.md)
 */
import "@/lib/config/load-env";
import { verifyHubSpot } from "@/integrations/hubspot/verify";

verifyHubSpot()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
