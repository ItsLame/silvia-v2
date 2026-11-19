import { db } from "@/lib/server/db";
import { clientIp, fail, json, readJson, sameOrigin } from "@/lib/server/http";
import { normalizeName } from "@/lib/auth/names";
import { PASSWORD_MAX, dummyHash, verifyPassword } from "@/lib/auth/password";
import { allow } from "@/lib/server/rate-limit";
import { startSession } from "@/lib/auth/session";

const WRONG = "Wrong name or password.";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Bad origin.", 403);
  const body = await readJson(request);
  const name = normalizeName(String(body?.name ?? ""));
  const password = String(body?.password ?? "");
  if (!name || !password || password.length > PASSWORD_MAX) return fail(WRONG, 401);

  // Limits come before the (deliberately slow) password check.
  const ip = await clientIp();
  if (!(await allow(`login:ip:${ip}`, 20, 900)) || !(await allow(`login:name:${name}`, 10, 900))) {
    return fail("Too many attempts. Wait 15 minutes and try again.", 429);
  }

  const rows = (await db()`select id, password_hash from players where name = ${name}`) as {
    id: number;
    password_hash: string;
  }[];
  const player = rows[0];
  const ok = await verifyPassword(password, player?.password_hash ?? (await dummyHash()));
  if (!player || !ok) return fail(WRONG, 401);

  await startSession(Number(player.id));
  return json({ player: { name } });
}
