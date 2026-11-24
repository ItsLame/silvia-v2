import { db } from "@/lib/server/db";
import { clientIp, fail, json, readJson, sameOrigin } from "@/lib/server/http";
import { nameProblem, normalizeName } from "@/lib/auth/names";
import { PASSWORD_MAX, PASSWORD_MIN, hashPassword } from "@/lib/auth/password";
import { allow } from "@/lib/server/rate-limit";
import { startSession } from "@/lib/auth/session";

// Claim a name with a password. Names are unique; only this password signs in as it.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Bad origin.", 403);
  const body = await readJson(request);
  const name = normalizeName(String(body?.name ?? ""));
  const password = String(body?.password ?? "");

  const problem = nameProblem(name);
  if (problem) return fail(problem, 400);
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(`Use a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, 400);
  }
  if (!(await allow(`signup:ip:${await clientIp()}`, 5, 3600))) {
    return fail("Too many new names from here. Try again in an hour.", 429);
  }

  const sql = db();
  const taken = (await sql`select 1 from players where name = ${name}`) as unknown[];
  if (taken.length) return fail("That name is taken.", 409);

  const hash = await hashPassword(password);
  const rows = (await sql`
    insert into players (name, password_hash) values (${name}, ${hash})
    on conflict (name) do nothing returning id
  `) as { id: number }[];
  if (!rows[0]) return fail("That name is taken.", 409); // lost a race for it

  await startSession(Number(rows[0].id));
  return json({ player: { name } }, 201);
}
