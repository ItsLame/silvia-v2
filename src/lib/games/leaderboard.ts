import { db } from "@/lib/server/db";

export type Period = "week" | "all";

/** Monday 00:00 UTC of the current week. */
export function weekStart(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

const since = (period: Period) => (period === "week" ? weekStart() : new Date(0)).toISOString();

export type Entry = { rank: number; name: string; score: number; level: number; wpm: number; at: string };

/** Each player's best score in the period, highest first (earlier scores win ties). */
export async function topScores(game: string, period: Period, limit = 20): Promise<Entry[]> {
  const rows = (await db()`
    with best as (
      select distinct on (player_id) player_id, score, level, wpm, created_at
      from scores
      where game = ${game} and not hidden and created_at >= ${since(period)}
      order by player_id, score desc, created_at asc
    )
    select p.name, b.score, b.level, b.wpm, b.created_at
    from best b join players p on p.id = b.player_id
    order by b.score desc, b.created_at asc
    limit ${limit}
  `) as { name: string; score: number; level: number; wpm: number; created_at: string }[];
  return rows.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, level: r.level, wpm: r.wpm, at: r.created_at }));
}

/** A player's best in the period and its rank, or null if they have no score in it. */
export async function playerStanding(game: string, period: Period, playerId: number) {
  const rows = (await db()`
    with best as (
      select distinct on (player_id) player_id, score, created_at
      from scores
      where game = ${game} and not hidden and created_at >= ${since(period)}
      order by player_id, score desc, created_at asc
    ),
    me as (select score, created_at from best where player_id = ${playerId})
    select me.score,
      (select count(*)::int from best b
        where b.score > me.score or (b.score = me.score and b.created_at < me.created_at)) + 1 as rank
    from me
  `) as { score: number; rank: number }[];
  return rows[0] ?? null;
}
