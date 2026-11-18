"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CardBack, CardFace } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES, SIZE } from "./deck-styles";
import { BOX_DROP, BOX_TEXT_COLOR, DeckBox, HEADLINE_IDS, OPEN_DELAY } from "./deck-box";
import type { DeckData, DeckId } from "./types";
import { useCardSounds } from "./use-card-sounds";

// Start: a deck box with the name on it. Click → it opens, the section cards slide out
// and are laid out as decks; the name settles into the table.
type Stage = "box" | "opening" | "table";
// Then, per deck: idle → dealt → collecting → idle.
type Phase = "idle" | "dealt" | "collecting";
type TableState = { deck: DeckId | null; phase: Phase };

// Timings, in seconds.
// Decks tossed out of the box onto the table, one after another.
const TOSS_STEP = 0.07; // between one deck leaving the box and the next
const TOSS = 0.5;
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
  // The box's opening (decks come out from there) and each deck's slot (they land there).
  const boxOpening = useRef<HTMLDivElement>(null);
  const [tossFrom, setTossFrom] = useState<{ x: number; y: number } | null>(null);
  const deckSlots = useRef(new Map<DeckId, HTMLElement>());
  const [landed, setLanded] = useState<Set<DeckId>>(new Set());
  const [tossDone, setTossDone] = useState(false);
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
    // Lid flips open, then each deck is tossed out onto the table.
    play("take", 0, 0.45);
    // Measured now, before the box moves: the decks keep coming from where it was.
    const r = boxOpening.current?.getBoundingClientRect();
    if (r) setTossFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    // Then straight away: the box drops off the table and the decks come out.
    after(OPEN_DELAY, () => {
      setStage("table");
      play("shuffle", 0.05, 0.6);
    });
    after(OPEN_DELAY + BOX_DROP + 0.05, () => setBoxGone(true));
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
                className="font-poppins text-6xl font-extrabold leading-none tracking-tight sm:text-9xl"
                initial={INK}
                animate={DEBOSS}
                transition={{ layout: spring(0), default: { delay: 0.35, duration: 0.6 } }}
              >
                {name}
              </motion.p>
              <motion.p
                layoutId={HEADLINE_IDS.title}
                className="mt-4 font-poppins text-sm font-semibold uppercase tracking-[0.3em] sm:mt-6 sm:text-lg"
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
                stage={stage === "box" ? "closed" : stage === "opening" ? "opening" : "leaving"}
                onSelect={openTable}
                openingRef={boxOpening}
              />
              <p
                className={`h-4 font-mono text-xs uppercase tracking-[0.24em] text-ivory/50 transition-opacity sm:text-sm ${
                  stage === "box" ? "" : "opacity-0"
                }`}
              >
                {HINT.box}
              </p>
            </div>
          )}

          {stage === "table" ? (
            <div className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8 perspective-[1400px] sm:gap-x-14">
              {decks.map((deck) => (
                <Deck
                  key={deck.id}
                  deck={deck}
                  phase={state.deck === deck.id ? state.phase : "idle"}
                  hidden={!!tossFrom && !tossDone && !landed.has(deck.id)}
                  slotRef={(el) => {
                    if (el) deckSlots.current.set(deck.id, el);
                    else deckSlots.current.delete(deck.id);
                  }}
                  onSelect={() => onDeck(deck.id)}
                />
              ))}
            </div>
          ) : (
            // Placeholder keeps the decks row's height so the table doesn't jump.
            <div className="h-[180px] sm:h-[250px]" />
          )}

          {stage === "table" && tossFrom && !tossDone && (
            <DeckToss
              decks={decks}
              from={tossFrom}
              slots={deckSlots}
              onLand={(id) => {
                play("place", 0, 0.4);
                setLanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
              }}
              onDone={() => setTossDone(true)}
            />
          )}

          <p className="mt-8 min-h-4 text-center font-mono text-xs uppercase tracking-[0.24em] text-ivory/50 sm:text-sm" aria-live="polite">
            {stage === "table" ? HINT[state.phase] : ""}
          </p>

          <section
            ref={spreadRef}
            aria-label={open ? `${open.label} cards` : undefined}
            className="mt-10 flex w-full max-w-[1120px] flex-wrap items-start justify-center gap-5 sm:mt-14 sm:gap-9"
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

/**
 * The hand-off from the box to the table: each deck is tossed out of the box opening
 * in a quick arc, staggered left to right, and settles onto its slot. A deck appears
 * when it lands. These are stand-ins; the real decks never move (moving them would
 * fight the layout animations their cards use for dealing).
 */
function DeckToss({
  decks,
  from,
  slots,
  onLand,
  onDone,
}: {
  decks: DeckData[];
  from: { x: number; y: number };
  slots: RefObject<Map<DeckId, HTMLElement>>;
  onLand: (id: DeckId) => void;
  onDone: () => void;
}) {
  const [targets, setTargets] = useState<Map<DeckId, DOMRect> | null>(null);
  const landedCount = useRef(0);
  // Slots exist by now (rendered in the same commit). Measuring layout and re-rendering
  // before paint is exactly what useLayoutEffect is for, so no frame shows the decks
  // in the wrong place.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargets(new Map([...slots.current].map(([id, el]) => [id, el.getBoundingClientRect()])));
  }, [slots]);
  if (!targets) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden>
      {decks.map((deck, i) => {
        const to = targets.get(deck.id);
        if (!to) return null;
        const style = DECK_STYLES[deck.id];
        // Start offset (box opening relative to the slot's centre), and an arc that
        // bulges upward, perpendicular to the straight line.
        const sx = from.x - (to.left + to.width / 2);
        const sy = from.y - (to.top + to.height / 2);
        const len = Math.hypot(sx, sy) || 1;
        let px = (-sy / len) * Math.min(90, len * 0.25);
        let py = (sx / len) * Math.min(90, len * 0.25);
        if (py > 0) [px, py] = [-px, -py];
        const tilt = (i % 2 ? 1 : -1) * (8 + ((i * 5) % 7)); // deterministic variety
        // Same stack the real deck shows, so the swap on landing is seamless.
        const layers = deck.cards.slice(-3);
        return (
          <motion.div
            key={deck.id}
            className="absolute"
            style={{ left: to.left, top: to.top, width: to.width, height: to.height }}
            initial={{ x: sx, y: sy, scale: 0.4, rotate: tilt, opacity: 0 }}
            animate={{
              x: [sx, sx / 2 + px, 0],
              y: [sy, sy / 2 + py, 0],
              scale: [0.4, 0.85, 1],
              rotate: [tilt, tilt * 0.4, 0],
              opacity: [0, 1, 1],
            }}
            transition={{ duration: TOSS, delay: i * TOSS_STEP, times: [0, 0.55, 1], ease: "easeOut" }}
            onAnimationComplete={() => {
              onLand(deck.id);
              landedCount.current += 1;
              if (landedCount.current === decks.length) onDone();
            }}
          >
            {layers.map((card, j) => {
              const offset = Math.min(deck.cards.length - layers.length + j, 7) * 1.5;
              return (
                <div
                  key={card.id}
                  className="absolute h-full w-full"
                  style={{ top: -offset, left: offset * 0.4, borderRadius: CARD_RADIUS }}
                >
                  <CardBack style={style} label={`${deck.label} card`} />
                </div>
              );
            })}
          </motion.div>
        );
      })}
    </div>
  );
}

function Deck({
  deck,
  phase,
  hidden,
  slotRef,
  onSelect,
}: {
  deck: DeckData;
  phase: Phase;
  hidden: boolean; // still in the air (see DeckToss)
  slotRef: (el: HTMLDivElement | null) => void;
  onSelect: () => void;
}) {
  const style = DECK_STYLES[deck.id];
  const count = deck.cards.length;
  const dealt = phase === "dealt";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={dealt}
      aria-label={`${deck.label} deck, ${count} ${count === 1 ? "card" : "cards"}${dealt ? ", dealt" : ""}`}
      className="group flex cursor-pointer flex-col items-center gap-4 outline-none"
    >
      <div style={{ borderRadius: CARD_RADIUS, visibility: hidden ? "hidden" : undefined }}>
        <div
          ref={slotRef}
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
      </div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.3 }}
        className="font-mono text-xs uppercase tracking-[0.22em] text-ivory/70 transition-colors group-hover:text-highlight group-focus-visible:text-highlight sm:text-sm"
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
      className="fixed right-4 top-4 z-50 grid size-12 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:text-highlight focus-visible:text-highlight focus-visible:outline-2 focus-visible:outline-highlight"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
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
