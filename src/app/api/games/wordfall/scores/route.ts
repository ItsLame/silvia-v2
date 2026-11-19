import { db } from "@/lib/server/db";
import { fail, json, readJson, sameOrigin } from "@/lib/server/http";
import { playerStanding } from "@/lib/games/leaderboard";
import { allow } from "@/lib/server/rate-limit";
import { currentPlayer } from "@/lib/auth/session";
import { implausible, parseSubmission } from "@/lib/games/wordfall-checks";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Bad origin.", 403);
  const player = await currentPlayer();
  if (!player) return fail("Sign in to post a score.", 401);
  if (!(await allow(`score:player:${player.id}`, 60, 3600))) return fail("Slow down.", 429);

  const body = await readJson(request);
  const runId = typeof body?.runId === "string" ? body.runId : "";
  const s = parseSubmission(body);
  if (!s || !/^[0-9a-f-]{36}$/.test(runId)) return fail("That score didn't look right.", 400);

  const sql = db();
  // Use up the ticket atomically: each run can post one score, within 3 hours.
  const runs = (await sql`
    update runs set used_at = now()
    where id = ${runId} and game = 'wordfall' and used_at is null and started_at > now() - interval '3 hours'
    returning extract(epoch from (now() - started_at))::float as elapsed
  `) as { elapsed: number }[];
  if (!runs[0]) return fail("That game can't be posted (already posted or too old).", 409);

  const why = implausible(s, runs[0].elapsed);
  if (why) return fail("That score didn't add up, so it wasn't posted.", 422);

  await sql`
    insert into scores (run_id, player_id, game, score, level, words, wpm, accuracy, duration_ms)
    values (${runId}, ${player.id}, 'wordfall', ${s.score}, ${s.level}, ${s.words}, ${s.wpm}, ${s.accuracy}, ${s.durationMs})
  `;
  const [week, all] = await Promise.all([
    playerStanding("wordfall", "week", player.id),
    playerStanding("wordfall", "all", player.id),
  ]);
  return json({ posted: true, week, all }, 201);
}
