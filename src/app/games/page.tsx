import type { Metadata } from "next";
import Link from "next/link";
import { GAMES } from "@/lib/games";

export const metadata: Metadata = {
  title: "Games · Silvia Tan",
  description: "Small games to play in the browser.",
};

export default function GamesPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="-ml-3 self-start rounded-full px-3 py-1.5 text-sm text-ivory/70 transition-colors hover:bg-ivory/10 hover:text-ivory"
      >
        ← Back to the table
      </Link>
      <h1 className="mt-6 font-display text-5xl sm:text-6xl">Games</h1>
      <p className="mt-2 text-ivory/70">Small things to play when you should be doing something else.</p>

      <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        {GAMES.map((game, i) => (
          <li key={game.slug}>
            <Link
              href={`/games/${game.slug}`}
              style={{ rotate: `${i % 2 ? 1.5 : -1.5}deg` }}
              className="group relative flex aspect-[5/7] flex-col rounded-2xl bg-ivory p-4 text-ink shadow-[6px_14px_24px_rgb(0_0_0/0.45)] transition-transform duration-200 hover:-translate-y-1 hover:rotate-0 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-highlight"
            >
              <span aria-hidden className="font-display text-2xl leading-none text-suit-red">
                {game.suit}
              </span>
              <span aria-hidden className="m-auto font-display text-7xl text-suit-red transition-transform group-hover:scale-110">
                {game.suit}
              </span>
              <span className="font-display text-2xl leading-tight sm:text-3xl">{game.title}</span>
              <span className="mt-1 text-xs leading-snug text-ink/65 sm:text-sm">{game.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
