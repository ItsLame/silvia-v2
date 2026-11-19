// Applies db/schema.sql to the database in DATABASE_URL.
// Run with: pnpm db:migrate  (loads .env.local; pull it first with `vercel env pull`)
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local --yes` first.");
  process.exit(1);
}

const sql = neon(url);
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
// Statements end with ";" at the end of a line; comments are dropped first.
const statements = schema
  .replace(/--.*$/gm, "")
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
console.log(`Applied ${statements.length} statements.`);
