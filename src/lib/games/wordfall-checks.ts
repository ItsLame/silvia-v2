import { quotaFor } from "@/components/games/wordfall/engine";

export type Submission = {
  score: number;
  level: number;
  words: number;
  wpm: number;
  accuracy: number;
  durationMs: number;
};

const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

export function parseSubmission(body: Record<string, unknown> | null): Submission | null {
  if (!body) return null;
  const s = {
    score: int(body.score, 0, 10_000_000),
    level: int(body.level, 1, 500),
    words: int(body.words, 0, 20_000),
    wpm: int(body.wpm, 0, 300),
    accuracy: int(body.accuracy, 0, 100),
    durationMs: int(body.durationMs, 0, 6 * 3600_000),
  };
  return Object.values(s).every((v) => v !== null) ? (s as Submission) : null;
}

/**
 * Could this result have come from a real game that started `elapsedSeconds` ago?
 * Returns why not, or null. The bounds follow the game's own rules with generous
 * headroom: they stop made-up scores, not unusually good players.
 */
export function implausible(s: Submission, elapsedSeconds: number): string | null {
  if (s.durationMs > (elapsedSeconds + 10) * 1000) return "longer than the run";
  // Reaching level L means clearing every earlier level's quota.
  let needed = 0;
  for (let l = 1; l < s.level; l++) needed += quotaFor(l);
  if (s.words < needed) return "too few words for that level";
  if (s.words > elapsedSeconds * 4 + 10) return "too many words for the time";
  if (s.level > 1 + elapsedSeconds / 5) return "levels came too fast";
  // Best case per word: 11 letters × 10 × the level multiplier × the streak cap (3×),
  // plus a clean-hand bonus every level; doubled for half-point Wipe clears.
  const perWord = 11 * 10 * (1 + 0.25 * (s.level - 1)) * 3;
  let bonuses = 0;
  for (let l = 1; l <= s.level; l++) bonuses += 400 * l;
  if (s.score > 2 * (s.words * perWord + bonuses)) return "score too high for the words typed";
  return null;
}
