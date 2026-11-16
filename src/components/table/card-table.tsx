"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardBack, CardFace } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES, SIZE } from "./deck-styles";
import { BOX_DROP, BOX_TEXT_COLOR, DeckBox, HEADLINE_IDS, OPEN_DURATION, OPEN_SOUNDS, deckLayoutId } from "./deck-box";
import type { DeckData, DeckId } from "./types";
import { useCardSounds } from "./use-card-sounds";

// Start: a deck box with the name on it. Click → it opens, the section cards slide out
// and are laid out as decks; the name settles into the table.
type Stage = "box" | "opening" | "table";
// Then, per deck: idle → dealt → collecting → idle.
type Phase = "idle" | "dealt" | "collecting";
type TableState = { deck: DeckId | null; phase: Phase };

// Timings, in seconds.
const DECK_STAGGER = 0.08; // decks flying out of the box
const DECK_LANDING = 0.35;
const DEAL_STAGGER = 0.09;
const LANDING = 0.4; // roughly when a dealt card settles after it starts flying
const FLIP = 0.45;
const COLLECT_STAGGER = 0.04;
const COLLECT = 0.55;

const spring = (delay = 0) => ({ type: "spring", stiffness: 240, damping: 28, mass: 0.9, delay }) as const;
// Deterministic "tossed onto the table" tilt; random values would break prerendering.
const REST_TILT = [-2.5, 1.8, -1.2, 2.4, -1.8, 1.1, -2.1, 1.5];
const rank = (i: number) => (i === 0 ? "A" : String(i + 1));

// Headline debossed (pressed into) the felt: letters sit darker than the cloth, with
// shadow along their top edges and a faint light rim along the bottom, as if lit from
// above. Animated from the box's print colour so the text visibly sinks into the table.
const INK = { color: BOX_TEXT_COLOR, textShadow: "0px 0px 0px rgba(0,0,0,0), 0px 0px 0px rgba(255,255,255,0)" };
const DEBOSS = {
  color: "#113a2a",
  textShadow: "0px -2px 2px rgba(0,0,0,0.45), 0px 1.5px 1px rgba(255,255,255,0.13)",
};
// Same treatment, scaled down for the small title line.
const DEBOSS_SMALL = {
  color: "#113a2a",
  textShadow: "0px -1px 1px rgba(0,0,0,0.45), 0px 1px 0px rgba(255,255,255,0.12)",
};

const HINT: Record<Stage | Phase, string> = {
  box: "Click the box to open",
  opening: "",
  table: "",
  idle: "Pick a deck",
  dealt: "Click the deck again or press Esc to gather",
  collecting: "Gathering…",
};

const HIGHLIGHT =
  "outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,box-shadow] group-hover:shadow-[0_0_22px_rgba(250,204,21,.35)] group-hover:outline-highlight group-focus-visible:shadow-[0_0_22px_rgba(250,204,21,.35)] group-focus-visible:outline-highlight";

export function CardTable({ name, headline, decks }: { name: string; headline: string; decks: DeckData[] }) {
  const [stage, setStage] = useState<Stage>("box");
  const [boxGone, setBoxGone] = useState(false);
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

  const openTable = () => {
    unlock();
    if (stage !== "box") return;
    setStage("opening");
    // Lid flips open, the cards slide out, then each deck lands on the table.
    play("take", OPEN_SOUNDS.lid, 0.4);
    play("take", OPEN_SOUNDS.cards, 0.5);
    after(OPEN_DURATION, () => {
      setStage("table");
      decks.forEach((_, i) => play("place", i * DECK_STAGGER + DECK_LANDING, 0.5));
    });
    after(OPEN_DURATION + BOX_DROP + 0.05, () => setBoxGone(true));
  };

  const deal = (id: DeckId) => {
    const count = byId.get(id)!.cards.length;
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
  };

  // Cards fly back into their deck. `then` runs once they're back.
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
    if (phase === "collecting") return;
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
        {/* Headline embossed into the middle of the table, like a logo printed on the
            felt. Fixed behind everything, so it takes no layout space; the text arrives
            from the deck box. */}
        {stage === "table" && (
          <div className="pointer-events-none fixed inset-0 grid place-items-center px-4 text-center" aria-hidden>
            <div className="flex flex-col items-center">
              <motion.p
                layoutId={HEADLINE_IDS.name}
                className="font-poppins text-6xl font-extrabold leading-none tracking-tight sm:text-8xl"
                initial={INK}
                animate={DEBOSS}
                transition={{ layout: spring(0), default: { delay: 0.35, duration: 0.6 } }}
              >
                {name}
              </motion.p>
              <motion.p
                layoutId={HEADLINE_IDS.title}
                className="mt-4 font-poppins text-xs font-semibold uppercase tracking-[0.3em] sm:mt-5 sm:text-base"
                initial={INK}
                animate={DEBOSS_SMALL}
                transition={{ layout: spring(0.04), default: { delay: 0.4, duration: 0.6 } }}
              >
                {headline}
              </motion.p>
            </div>
          </div>
        )}

        <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center px-4 pb-20 pt-16 sm:pt-20">
          <MuteToggle muted={muted} onToggle={toggleMuted} />
          <h1 className="sr-only">
            {name}, {headline}
          </h1>

          {/* Deck box, centred in the first screen. Overlaid so the table layout
              underneath never moves. */}
          {!boxGone && (
            <div
              className={`absolute inset-x-0 top-0 flex h-dvh flex-col items-center justify-center gap-14 overflow-hidden ${
                stage === "table" ? "pointer-events-none" : ""
              }`}
            >
              <DeckBox
                name={name}
                headline={headline}
                decks={decks}
                stage={stage === "box" ? "closed" : stage === "opening" ? "opening" : "leaving"}
                onSelect={openTable}
              />
              <p
                className={`h-4 font-mono text-[11px] uppercase tracking-[0.24em] text-ivory/45 transition-opacity ${
                  stage === "box" ? "" : "opacity-0"
                }`}
              >
                {HINT.box}
              </p>
            </div>
          )}

          {stage === "table" ? (
            <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8 perspective-[1200px] sm:gap-x-12">
              {decks.map((deck, i) => (
                <Deck
                  key={deck.id}
                  deck={deck}
                  order={i}
                  phase={state.deck === deck.id ? state.phase : "idle"}
                  onSelect={() => onDeck(deck.id)}
                />
              ))}
            </div>
          ) : (
            // Placeholder keeps the decks row's height so the table doesn't jump.
            <div className="h-[150px] sm:h-[200px]" />
          )}

          <p className="mt-8 min-h-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-ivory/45" aria-live="polite">
            {stage === "table" ? HINT[state.phase] : ""}
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
                    <CardFace card={card} style={style} rank={rank(i)} index={i} />
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

function Deck({
  deck,
  order,
  phase,
  onSelect,
}: {
  deck: DeckData;
  order: number;
  phase: Phase;
  onSelect: () => void;
}) {
  const style = DECK_STYLES[deck.id];
  const count = deck.cards.length;
  const dealt = phase === "dealt";
  const flight = spring(order * DECK_STAGGER);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={dealt}
      aria-label={`${deck.label} deck, ${count} ${count === 1 ? "card" : "cards"}${dealt ? ", dealt" : ""}`}
      className="group flex cursor-pointer flex-col items-center gap-4 outline-none"
    >
      {/* Flies in from the starting pile (shared layoutId), turning upright if it lay sideways. */}
      <motion.div
        layoutId={deckLayoutId(deck.id)}
        // Tipped toward the viewer as it leaves the box, then laid flat on the table.
        initial={{ rotate: style.shape === "landscape" ? 90 : 0, rotateX: 55 }}
        animate={{ rotate: 0, rotateX: 0 }}
        transition={{ layout: flight, rotate: flight, rotateX: flight }}
        style={{ borderRadius: CARD_RADIUS }}
      >
        <div
          className={`relative transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 ${SIZE[style.shape].deck}`}
        >
          {/* Empty slot, visible once the deck is dealt out. */}
          <div className="absolute inset-0 rounded-[10px] border border-dashed border-ivory/20 transition-colors group-hover:border-highlight/70" />
          {!dealt &&
            deck.cards.map((card, i) => {
              const offset = Math.min(i, 7) * 1.5;
              return (
                <motion.div
                  key={card.id}
                  layoutId={card.id}
                  className={`absolute h-full w-full ${i === count - 1 ? HIGHLIGHT : ""}`}
                  style={{ top: -offset, left: offset * 0.4, zIndex: i, borderRadius: CARD_RADIUS }}
                  transition={{ layout: spring(i * COLLECT_STAGGER) }}
                >
                  <CardBack style={style} label={`${deck.label} card`} />
                </motion.div>
              );
            })}
        </div>
      </motion.div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: order * DECK_STAGGER + DECK_LANDING, duration: 0.3 }}
        className="font-mono text-[10px] uppercase tracking-[0.22em] text-ivory/65 transition-colors group-hover:text-highlight group-focus-visible:text-highlight sm:text-[11px]"
      >
        {deck.label}
      </motion.span>
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
