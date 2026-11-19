import { fail, json, sameOrigin } from "@/lib/server/http";
import { endSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail("Bad origin.", 403);
  await endSession();
  return json({ player: null });
}
