// Point git at the versioned hooks so the secret guard runs on every commit.
// Runs from the npm `prepare` lifecycle; silently skips outside a git checkout or in CI.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.CI || !existsSync(".git")) process.exit(0);
try {
  execSync("git config core.hooksPath .githooks", { stdio: "ignore" });
} catch {
  /* not a git repo or git unavailable — nothing to do */
}
