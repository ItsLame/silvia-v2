"use client";

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

// The site-wide account: who's signed in, signing in and out. One account and one
// session cover the whole site, so every game shares the same sign-in.

export type Player = { name: string };
/** fetch + JSON, with errors as values. */
export async function call<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: (data as { error?: string }).error ?? "Something went wrong." };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection." };
  }
}

export const auth = {
  me: () => call<{ player: Player | null }>("/api/auth/me"),
  signIn: (mode: "login" | "signup", name: string, password: string) =>
    call<{ player: Player }>(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ name, password }) }),
  signOut: () => call<{ player: null }>("/api/auth/logout", { method: "POST" }),
};

/** The signed-in player (null when signed out, undefined while checking). */
export function usePlayer() {
  const [player, setPlayer] = useState<Player | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    auth.me().then((r) => live && setPlayer(r.ok ? r.data.player : null));
    return () => {
      live = false;
    };
  }, []);
  return [player, setPlayer] as const;
}

/** A centred modal on the felt; Esc or a click on the backdrop closes it. */
export function Modal({
  open,
  onClose,
  title,
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className="m-auto max-h-[min(88dvh,820px)] overflow-hidden rounded-2xl border border-ivory/15 bg-felt-deep p-0 text-ivory shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      style={{ width: `min(92vw, ${width}px)` }}
    >
      <div className="flex max-h-[min(88dvh,820px)] flex-col">
        <div className="flex items-center justify-between border-b border-ivory/10 px-5 py-4 sm:px-6">
          <h2 className="font-display text-3xl leading-none">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:bg-ivory/10 hover:text-highlight focus-visible:outline-2 focus-visible:outline-highlight"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </dialog>
  );
}

/** Sign in, or claim a new name. */
export function AuthForm({ onDone, intro }: { onDone: (p: Player) => void; intro?: ReactNode }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await auth.signIn(mode, name, password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPassword("");
    onDone(r.data.player);
  };

  const field =
    "mt-1 w-full rounded-lg border border-ivory/20 bg-ivory/[0.06] px-3 py-2.5 text-ivory outline-none transition-colors placeholder:text-ivory/30 focus:border-highlight/70";
  return (
    <form onSubmit={submit} className="text-sm">
      {intro}
      <div role="tablist" className="mb-4 grid grid-cols-2 rounded-full bg-ivory/[0.06] p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`cursor-pointer rounded-full py-1.5 transition-colors ${mode === m ? "bg-ivory text-ink" : "text-ivory/70 hover:text-ivory"}`}
          >
            {m === "login" ? "Sign in" : "New name"}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-ivory/70">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} font-mono lowercase`}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={16}
          required
          placeholder="3–16 letters, numbers, - or _"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-ivory/70">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          maxLength={128}
          required
          placeholder={mode === "signup" ? "At least 8 characters" : ""}
        />
      </label>
      {mode === "signup" && (
        <p className="mt-3 text-xs leading-relaxed text-ivory/55">
          Your name shows on the leaderboard. There&apos;s no email and no password reset, so keep your password
          somewhere safe, and please don&apos;t reuse one from another site.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full cursor-pointer rounded-full bg-ivory py-2.5 font-medium text-ink transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "One moment…" : mode === "login" ? "Sign in" : "Claim name"}
      </button>
    </form>
  );
}
