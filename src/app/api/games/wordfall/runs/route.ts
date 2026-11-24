import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { clientIp, fail, json, sameOrigin } from "@/lib/server/http";
import { allow } from "@/lib/server/rate-limit";

// A ticket for one game, issued as it starts. Signed out players get one too, so a
// score can still be posted if they sign in at the end.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Bad origin.", 403);
  if (!(await allow(`run:ip:${await clientIp()}`, 120, 3600))) return fail("Slow down.", 429);
  const id = randomUUID();
  const sql = db();
  await sql`insert into runs (id, game) values (${id}, 'wordfall')`;
  if (Math.random() < 0.05) {
    await sql`delete from runs where used_at is null and started_at < now() - interval '1 day'`;
  }
  return json({ runId: id }, 201);
}
