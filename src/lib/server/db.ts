import { neon } from "@neondatabase/serverless";

// Created on first use, not at import, so `next build` works without DATABASE_URL.
let client: ReturnType<typeof neon> | null = null;

/** Tagged-template SQL against the Neon database. Values are always sent as parameters. */
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}
