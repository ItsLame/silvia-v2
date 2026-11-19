import { headers } from "next/headers";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (message: string, status: number) => json({ error: message }, status);

/** The visitor's IP as Vercel reports it (used only as a rate-limit key, never stored long). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * State-changing requests must come from this site. The session cookie is SameSite=Lax,
 * which already stops cross-site form posts; checking Origin closes the rest.
 */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Parses a JSON body of at most a few KB; returns null if it's missing or malformed. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
