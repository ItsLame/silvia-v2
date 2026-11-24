"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthForm, type Player, auth, call } from "../account";

// Game scores: per-game run tickets, posting results, and the leaderboard. Signing in
// is site-wide (see components/account), so one account covers every game.

export type Standing = { score: number; rank: number } | null;
type Entry = { rank: number; name: string; score: number; level: number; wpm: number; at: string };
type Period = "week" | "all";

export const scores = {
  leaderboard: (game: string, period: Period) =>
    call<{ entries: Entry[]; you: { name: string; standing: Standing } | null }>(
      `/api/games/${game}/leaderboard?period=${period}`,
    ),
  startRun: (game: string) => call<{ runId: string }>(`/api/games/${game}/runs`, { method: "POST" }),
  postScore: (game: string, body: Record<string, unknown>) =>
    call<{ posted: true; week: Standing; all: Standing }>(`/api/games/${game}/scores`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/** Top scores, this week or all time, with sign in and out. */
export function Leaderboard({
  game,
  player,
  onPlayer,
}: {
  game: string;
  player: Player | null | undefined;
  onPlayer: (p: Player | null) => void;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<{ entries: Entry[]; you: { standing: Standing } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const load = useCallback(async () => {
    const r = await scores.leaderboard(game, period);
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
  }, [game, period]);

  useEffect(() => {
    let live = true;
    scores.leaderboard(game, period).then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
        // The session ended on the server (expired, or signed out elsewhere).
        if (!r.data.you && player) onPlayer(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [game, period, player, onPlayer]);

  const you = data?.you?.standing;
  const youListed = !!player && data?.entries.some((e) => e.name === player.name);

  if (signingIn) {
    return (
      <AuthForm
        onDone={(p) => {
          onPlayer(p);
          setSigningIn(false);
        }}
        intro={
          <button type="button" onClick={() => setSigningIn(false)} className="mb-3 cursor-pointer text-ivory/60 hover:text-highlight">
            ← Back to the leaderboard
          </button>
        }
      />
    );
  }

  return (
    <div className="text-sm">
      <div role="tablist" className="grid grid-cols-2 rounded-full bg-ivory/[0.06] p-1">
        {(["week", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`cursor-pointer rounded-full py-1.5 transition-colors ${period === p ? "bg-ivory text-ink" : "text-ivory/70 hover:text-ivory"}`}
          >
            {p === "week" ? "This week" : "All time"}
          </button>
        ))}
      </div>
      {period === "week" && <p className="mt-2 text-center text-xs text-ivory/45">Resets Mondays at 00:00 UTC</p>}

      <div className="mt-4 min-h-40">
        {error ? (
          <p className="py-8 text-center text-red-300">
            {error}{" "}
            <button type="button" onClick={load} className="cursor-pointer underline">
              Retry
            </button>
          </p>
        ) : !data ? (
          <p className="py-8 text-center text-ivory/50">Shuffling the scores…</p>
        ) : data.entries.length === 0 ? (
          <p className="py-8 text-center text-ivory/50">
            No scores {period === "week" ? "this week" : "yet"}. The top spot is yours for the taking.
          </p>
        ) : (
          <table className="w-full tabular-nums">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[0.16em] text-ivory/45">
                <th className="w-8 pb-2 font-normal">#</th>
                <th className="pb-2 font-normal">Name</th>
                <th className="pb-2 text-right font-normal">Score</th>
                <th className="pb-2 text-right font-normal max-[400px]:hidden">Lvl</th>
                <th className="pb-2 text-right font-normal">WPM</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => {
                const mine = player?.name === e.name;
                return (
                  <tr key={e.name} className={`border-t border-ivory/[0.07] ${mine ? "text-highlight" : ""}`}>
                    <td className="py-2 font-mono text-ivory/50">{e.rank}</td>
                    <td className="py-2 font-mono">{e.name}</td>
                    <td className="py-2 text-right">{e.score.toLocaleString()}</td>
                    <td className="py-2 text-right text-ivory/60 max-[400px]:hidden">{e.level}</td>
                    <td className="py-2 text-right text-ivory/60">{e.wpm}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-5 border-t border-ivory/10 pt-4 text-ivory/70">
        {player === undefined ? null : player ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              Signed in as <span className="font-mono text-ivory">{player.name}</span>
              {you && !youListed && (
                <span className="text-ivory/50">
                  {" "}
                  · your best: #{you.rank}, {you.score.toLocaleString()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={async () => {
                await auth.signOut();
                onPlayer(null);
              }}
              className="cursor-pointer text-ivory/60 underline underline-offset-4 hover:text-highlight"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span>Sign in to put your scores on the board.</span>
            <button
              type="button"
              onClick={() => setSigningIn(true)}
              className="cursor-pointer rounded-full bg-ivory px-4 py-1.5 font-medium text-ink hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
