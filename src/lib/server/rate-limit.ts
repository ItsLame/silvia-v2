import { db } from "./db";

/**
 * Sliding-window limit: records an attempt under `key` and reports whether the number
 * of attempts in the last `windowSeconds` is still within `limit`. Checked before any
 * expensive work (like hashing a password), so floods stay cheap.
 */
export async function allow(key: string, limit: number, windowSeconds: number) {
  const sql = db();
  const rows = (await sql`
    with inserted as (insert into rate_limits (key) values (${key}) returning 1)
    select count(*)::int as n from rate_limits
    where key = ${key} and at > now() - make_interval(secs => ${windowSeconds})
  `) as { n: number }[];
  // The count above doesn't see this request's own row, hence `<`.
  const ok = (rows[0]?.n ?? 0) < limit;
  // Occasionally drop rows older than any window we use.
  if (Math.random() < 0.02) await sql`delete from rate_limits where at < now() - interval '1 day'`;
  return ok;
}
