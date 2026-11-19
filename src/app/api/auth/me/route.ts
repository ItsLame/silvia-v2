import { json } from "@/lib/server/http";
import { currentPlayer } from "@/lib/auth/session";

export async function GET() {
  const player = await currentPlayer();
  return json({ player: player ? { name: player.name } : null });
}
