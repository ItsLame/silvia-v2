import { json } from "@/lib/server/http";
import { type Period, playerStanding, topScores } from "@/lib/games/leaderboard";
import { currentPlayer } from "@/lib/auth/session";

export async function GET(request: Request) {
  const period: Period = new URL(request.url).searchParams.get("period") === "all" ? "all" : "week";
  const [entries, player] = await Promise.all([topScores("wordfall", period), currentPlayer()]);
  const you = player
    ? { name: player.name, standing: await playerStanding("wordfall", period, player.id) }
    : null;
  return json({ period, entries, you });
}
