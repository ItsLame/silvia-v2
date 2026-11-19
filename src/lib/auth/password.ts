import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt with N = 2^15, r = 8, p = 1 (OWASP's minimum is 2^17 with p = 1, or
// equivalent cost; 2^15 keeps a login under ~100 ms on a serverless function, and
// rate limiting caps guesses far below what that cost difference would matter for).
const N_LOG2 = 15;
const R = 8;
const P = 1;
const KEY_LEN = 32;
const maxmem = (n: number, r: number) => 256 * n * r; // comfortably above 128·N·r

/** Stored as `scrypt$<log2 N>$<r>$<p>$<salt>$<hash>`, base64url. Never store or log the password. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const n = 2 ** N_LOG2;
  const hash = await scrypt(password, salt, KEY_LEN, { N: n, r: R, p: P, maxmem: maxmem(n, R) });
  return ["scrypt", N_LOG2, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, nLog2, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const n = 2 ** Number(nLog2);
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, {
    N: n,
    r: Number(r),
    p: Number(p),
    maxmem: maxmem(n, Number(r)),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Checked against when a name doesn't exist, so a wrong name costs the same time as a
// wrong password.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(16).toString("hex")));

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
