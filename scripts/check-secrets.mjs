// CI guard: fail if an env file (other than .env.example) is tracked or a
// credential-looking string is committed anywhere in the tree.
import { execSync } from "node:child_process";

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const envFiles = tracked.filter((f) => /(^|\/)\.env(\..*)?$/.test(f) && !/(^|\/)\.env\.example$/.test(f));
if (envFiles.length) {
  console.error("✖ Environment files are tracked in git:", envFiles.join(", "));
  process.exit(1);
}
const pattern = "pat-(na|eu)[0-9]+-[0-9a-f]{8}-|SUPABASE_SERVICE_ROLE_KEY=ey|\"refresh_token\":\"|sk_live_|AIza[0-9A-Za-z_-]{30,}";
let hits = "";
try {
  hits = execSync(`git grep -n -E '${pattern}' -- . ':!scripts/check-secrets.mjs' ':!.githooks/pre-commit'`, { encoding: "utf8" });
} catch {
  /* git grep exits 1 when nothing matches */
}
if (hits.trim()) {
  console.error("✖ Credential-looking strings found in tracked files:\n" + hits);
  process.exit(1);
}
console.log("✓ No env files or credentials tracked.");
