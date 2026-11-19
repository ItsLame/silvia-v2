import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/server/db";

// One session for the whole site: every game (and anything else) shares this sign-in.
const COOKIE = "session";
const DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type Player = { id: number; name: string };

/** Starts a session for the player and sets its cookie. Only a hash of the token is stored. */
export async function startSession(playerId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + DAYS * 86400_000);
  await db()`insert into sessions (token_hash, player_id, expires_at) values (${hashToken(token)}, ${playerId}, ${expires.toISOString()})`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // page scripts can't read it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function currentPlayer(): Promise<Player | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = (await db()`
    select p.id, p.name from sessions s join players p on p.id = s.player_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()
  `) as { id: number; name: string }[];
  return rows[0] ? { id: Number(rows[0].id), name: rows[0].name } : null;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db()`delete from sessions where token_hash = ${hashToken(token)}`;
  jar.delete(COOKIE);
}
