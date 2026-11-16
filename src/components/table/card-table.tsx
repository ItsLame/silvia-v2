"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardBack, CardFace } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES, SIZE } from "./deck-styles";
import type { DeckData, DeckId } from "./types";
import { useCardSounds } from "./use-card-sounds";

// idle → shuffling → dealt → collecting → idle
type Phase = "idle" | "shuffling" | "dealt" | "collecting";
type TableState = { deck: DeckId | null; phase: Phase };

// Timings, in seconds.
const SHUFFLE = 0.75;
const DEAL_STAGGER = 0.09;
const LANDING = 0.4; // roughly when a dealt card settles after it starts flying
const FLIP = 0.45;
const COLLECT_STAGGER = 0.04;
const COLLECT = 0.55;

const spring = (delay = 0) => ({ type: "spring", stiffness: 240, damping: 28, mass: 0.9, delay }) as const;
// Deterministic "tossed onto the table" tilt; random values would break prerendering.
const REST_TILT = [-2.5, 1.8, -1.2, 2.4, -1.8, 1.1, -2.1, 1.5];
const rank = (i: number) => (i === 0 ? "A" : String(i + 1));

const HINT: Record<Phase, string> = {
  idle: "Pick a deck",
  shuffling: "Shuffling…",
  dealt: "Click the deck again or press Esc to gather",
  collecting: "Gathering…",
};

export function CardTable({ name, headline, decks }: { name: string; headline: string; decks: DeckData[] }) {
  const [state, setState] = useState<TableState>({ deck: null, phase: "idle" });
  const stateRef = useRef(state);
  const timers = useRef<number[]>([]);
  const spreadRef = useRef<HTMLElement>(null);
  const { play, unlock, muted, toggleMuted } = useCardSounds();
  const byId = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);

  const set = (next: TableState) => {
    stateRef.current = next;
    setState(next);
  };
  const after = (seconds: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, seconds * 1000));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const deal = (id: DeckId) => {
    const count = byId.get(id)!.cards.length;
    set({ deck: id, phase: "shuffling" });
    play("shuffle");
    after(SHUFFLE, () => {
      set({ deck: id, phase: "dealt" });
      for (let i = 0; i < count; i++) play("place", i * DEAL_STAGGER + LANDING, 0.55);
      // If the spread starts low in the window, follow the cards down as they fly.
      requestAnimationFrame(() => {
        const top = spreadRef.current?.getBoundingClientRect().top ?? 0;
        const target = window.innerHeight * 0.38;
        if (top > target + 40) {
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollBy({ top: top - target, behavior: reduce ? "auto" : "smooth" });
        }
      });
    });
  };

  const collect = (then?: () => void) => {
    const { deck, phase } = stateRef.current;
    if (phase !== "dealt" || !deck) return;
    const count = byId.get(deck)!.cards.length;
    set({ deck, phase: "collecting" });
    for (let i = 0; i < count; i++) play("take", i * COLLECT_STAGGER, 0.45);
    after(count * COLLECT_STAGGER + COLLECT, () => {
      set({ deck: null, phase: "idle" });
      then?.();
    });
  };

  const onDeck = (id: DeckId) => {
    unlock();
    const { deck, phase } = stateRef.current;
    if (phase === "shuffling" || phase === "collecting") return;
    if (phase === "dealt") return deck === id ? collect() : collect(() => deal(id));
    deal(id);
  };

  // Re-subscribes each render so the handler always sees the current `collect`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && collect();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const open = state.phase === "dealt" && state.deck ? byId.get(state.deck)! : null;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center px-4 pb-20 pt-16 sm:pt-24">
          <MuteToggle muted={muted} onToggle={toggleMuted} />

          <header className="text-center">
            <h1 className="font-display text-6xl leading-none tracking-tight sm:text-8xl">{name}</h1>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.32em] text-ivory/60 sm:text-sm">{headline}</p>
          </header>

          <div className="mt-14 flex flex-wrap items-end justify-center gap-x-6 gap-y-8 sm:mt-20 sm:gap-x-12">
            {decks.map((deck) => (
              <Deck
                key={deck.id}
                deck={deck}
                phase={state.deck === deck.id ? state.phase : "idle"}
                onSelect={() => onDeck(deck.id)}
              />
            ))}
          </div>

          <p className="mt-8 h-4 font-mono text-[11px] uppercase tracking-[0.24em] text-ivory/45" aria-live="polite">
            {HINT[state.phase]}
          </p>

          <section
            ref={spreadRef}
            aria-label={open ? `${open.label} cards` : undefined}
            className="mt-10 flex w-full max-w-[900px] flex-wrap items-start justify-center gap-5 sm:mt-14 sm:gap-8"
          >
            {open?.cards.map((card, i) => {
              const style = DECK_STYLES[open.id];
              const delay = i * DEAL_STAGGER;
              return (
                <motion.div
                  key={card.id}
                  layoutId={card.id}
                  className={`relative perspective-[1200px] ${SIZE[style.shape].dealt}`}
                  style={{ borderRadius: CARD_RADIUS }}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: REST_TILT[i % REST_TILT.length] }}
                  transition={{ layout: spring(delay), rotate: spring(delay) }}
                >
                  <motion.div
                    className="relative h-full w-full transform-3d"
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: 180 }}
                    transition={{ delay: delay + LANDING, duration: FLIP, ease: [0.3, 0.7, 0.2, 1] }}
                  >
                    <CardBack style={style} label={`${open.label} card`} />
                    <CardFace card={card} style={style} rank={rank(i)} />
                  </motion.div>
                </motion.div>
              );
            })}
          </section>
        </main>
      </LayoutGroup>
    </MotionConfig>
  );
}

function Deck({ deck, phase, onSelect }: { deck: DeckData; phase: Phase; onSelect: () => void }) {
  const style = DECK_STYLES[deck.id];
  const count = deck.cards.length;
  const dealt = phase === "dealt";
  const shuffling = phase === "shuffling";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={dealt}
      aria-label={`${deck.label} deck, ${count} ${count === 1 ? "card" : "cards"}${dealt ? ", dealt" : ""}`}
      className="group flex cursor-pointer flex-col items-center gap-4 outline-none"
    >
      <div
        className={`relative transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 ${SIZE[style.shape].deck}`}
      >
        {/* Empty slot, visible once the deck is dealt out. */}
        <div className="absolute inset-0 rounded-[10px] border border-dashed border-ivory/20 transition-colors group-hover:border-highlight/70" />
        {!dealt &&
          deck.cards.map((card, i) => {
            const offset = Math.min(i, 7) * 1.5;
            const top = i === count - 1;
            const side = i < count / 2 ? -1 : 1;
            return (
              <motion.div
                key={card.id}
                layoutId={card.id}
                className={`absolute h-full w-full ${
                  top
                    ? "outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,box-shadow] group-hover:shadow-[0_0_22px_rgba(250,204,21,.35)] group-hover:outline-highlight group-focus-visible:shadow-[0_0_22px_rgba(250,204,21,.35)] group-focus-visible:outline-highlight"
                    : ""
                }`}
                style={{ top: -offset, left: offset * 0.4, zIndex: i, borderRadius: CARD_RADIUS }}
                animate={
                  shuffling
                    ? { x: [0, side * 26, side * 26, 0], y: [0, -5, -5, 0], rotate: [0, side * 5, side * 5, 0] }
                    : { x: 0, y: 0, rotate: 0 }
                }
                transition={{
                  default: { duration: SHUFFLE * 0.9, times: [0, 0.3, 0.62, 1], ease: "easeInOut", delay: Math.min(i, 7) * 0.018 },
                  layout: spring(i * COLLECT_STAGGER),
                }}
              >
                <CardBack style={style} label={`${deck.label} card`} />
              </motion.div>
            );
          })}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ivory/65 transition-colors group-hover:text-highlight group-focus-visible:text-highlight sm:text-[11px]">
        {deck.label}
      </span>
    </button>
  );
}

function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
      className="fixed right-4 top-4 z-50 grid size-10 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:text-highlight focus-visible:text-highlight focus-visible:outline-2 focus-visible:outline-highlight"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
        {muted ? (
          <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
        ) : (
          <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" strokeLinecap="round" />
        )}
      </svg>
    </button>
  );
}
