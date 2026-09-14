/**
 * Minimal SQL migration runner (no ORM). Applies database/migrations/*.sql in
 * order and records them in schema_migrations. Requires DATABASE_URL.
 *
 *   npm run db:migrate
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (see .env.example)");
  const client = new Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const dir = join(process.cwd(), "database", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const { rowCount } = await client.query("select 1 from schema_migrations where name = $1", [f]);
    if (rowCount) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    process.stdout.write(`applying ${f}… `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log("ok");
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  }
  await client.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
