// Creates an account for a name the site won't let anyone sign up with (a reserved name,
// such as "silvia"), or resets that account's password. For the site owner only: it
// writes straight to the database in DATABASE_URL.
//
//   pnpm claim-name silvia        development database (.env.local)
//   pnpm claim-name:prod silvia   production database (.env.vercel-production; get it
//                                 with `pnpm env:pull:prod`)
//
// The password is typed into a hidden prompt (or piped on stdin), never passed as an
// argument, so it doesn't end up in shell history.
import { createInterface } from "node:readline";
import { neon } from "@neondatabase/serverless";
import { NAME_PATTERN, normalizeName } from "../src/lib/auth/names.ts";
import { PASSWORD_MAX, PASSWORD_MIN, hashPassword } from "../src/lib/auth/password.ts";

const name = normalizeName(process.argv[2] ?? "");
if (!NAME_PATTERN.test(name)) {
  console.error("Usage: pnpm claim-name <name>   (3–16 characters: a-z, 0-9, - or _)");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local --yes` first.");
  process.exit(1);
}

/** Reads one line without echoing it when run in a terminal. */
function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      process.stdout.write(prompt);
      // Swallow the echo of each keystroke.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    }
    rl.question(process.stdin.isTTY ? "" : prompt, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await readSecret(`Password for "${name}": `);
if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
  process.exit(1);
}
if (process.stdin.isTTY && (await readSecret("Again: ")) !== password) {
  console.error("The passwords didn't match.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const hash = await hashPassword(password);
const rows = (await sql`
  insert into players (name, password_hash) values (${name}, ${hash})
  on conflict (name) do update set password_hash = excluded.password_hash
  returning (xmax = 0) as created
`) as { created: boolean }[];
if (!rows[0]?.created) {
  // A new password signs out every existing session for this name.
  await sql`delete from sessions where player_id = (select id from players where name = ${name})`;
}
console.log(rows[0]?.created ? `Created "${name}". Sign in on the site with it.` : `Reset the password for "${name}" and signed out its sessions.`);
