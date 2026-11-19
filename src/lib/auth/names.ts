// Leaderboard names: lowercase letters, digits, "_" and "-", 3 to 16 characters. The
// narrow alphabet rules out look-alike Unicode impersonation and markup.
export const NAME_PATTERN = /^[a-z0-9_-]{3,16}$/;

const RESERVED = new Set([
  "admin", "administrator", "mod", "moderator", "root", "system", "support", "staff", "official",
  "silvia", "silviatan", "silvia-tan", "silvia_tan", "itslame", "owner", "anonymous", "guest",
  "null", "undefined", "wordfall",
]);

// A short block list; it catches the obvious, and anything else can be hidden by hand.
const BLOCKED = ["fuck", "shit", "cunt", "nigg", "fag", "bitch", "rape", "nazi", "hitler", "slut", "whore", "porn", "cock", "pussy", "retard", "kike", "spic", "chink"];

export function normalizeName(raw: string) {
  return raw.trim().toLowerCase();
}

/** Returns an error message, or null if the name may be claimed. */
export function nameProblem(name: string): string | null {
  if (!NAME_PATTERN.test(name)) return "Use 3–16 characters: letters, numbers, - or _.";
  if (RESERVED.has(name)) return "That name is reserved.";
  const squashed = name.replace(/[-_0-9]/g, "");
  if (BLOCKED.some((w) => squashed.includes(w))) return "Please pick a different name.";
  return null;
}
