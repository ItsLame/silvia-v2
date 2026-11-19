"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CardBack, CardFace } from "./card-faces";
import { ASPECT, CARD_RADIUS, DEALT_W, DECK_STYLES, DECK_W, type DeckStyle, MINI_W, SIZE } from "./deck-styles";
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
// On phones the decks are in the dock below, and there's no Esc key.
const PHONE_HINT: Partial<Record<Phase, string>> = {
  idle: "Pick a deck below",
  dealt: "Tap the deck again to gather",
};

const HIGHLIGHT =
  "outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,box-shadow] group-hover:shadow-[0_0_22px_rgba(250,204,21,.35)] group-hover:outline-highlight group-focus-visible:shadow-[0_0_22px_rgba(250,204,21,.35)] group-focus-visible:outline-highlight";

// Phones (below Tailwind's `sm`) get the decks in a dock along the bottom edge
// instead of on the table. False on the server; the table only appears after a click.
const PHONE = "(max-width: 639.98px)";
function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

// The Mini Games deck has its own address: while it's dealt the URL reads /games, so
// Back from a game (or a reload) returns to the table with the games laid out.
const DECK_PATHS: Partial<Record<DeckId, string>> = { games: "/games" };

export function CardTable({
  name,
  headline,
  decks,
  initialDeck,
}: {
  name: string;
  headline: string;
  decks: DeckData[];
  /** Start with the box already open and this deck dealt (e.g. /games). */
  initialDeck?: DeckId;
}) {
  const [stage, setStage] = useState<Stage>(initialDeck ? "table" : "box");
  const [boxGone, setBoxGone] = useState(!!initialDeck);
  // The box's opening (decks come out from there) and each deck's slot (they land there).
  const boxOpening = useRef<HTMLDivElement>(null);
  const [tossFrom, setTossFrom] = useState<{ x: number; y: number } | null>(null);
  const deckSlots = useRef(new Map<DeckId, HTMLElement>());
  const [landed, setLanded] = useState<Set<DeckId>>(new Set());
  const [tossDone, setTossDone] = useState(!!initialDeck);
  const [state, setState] = useState<TableState>(
    initialDeck ? { deck: initialDeck, phase: "dealt" } : { deck: null, phase: "idle" },
  );
  const stateRef = useRef(state);
  const timers = useRef<number[]>([]);
  const spreadRef = useRef<HTMLElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);
  // The decks row; when it scrolls out of view a dock of mini decks takes its place.
  const decksRef = useRef<HTMLDivElement>(null);
  const [decksInView, setDecksInView] = useState(true);
  const phone = useIsPhone();
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

  // Keep the address bar in step with the dealt deck (see DECK_PATHS). Replaces rather
  // than pushes, so dealing and gathering don't fill the Back history.
  useEffect(() => {
    if (stage !== "table" || state.phase === "collecting") return;
    const path = (state.phase === "dealt" && state.deck && DECK_PATHS[state.deck]) || "/";
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [stage, state]);

  useEffect(() => {
    const row = decksRef.current;
    if (stage !== "table" || !row) return;
    const io = new IntersectionObserver(([entry]) => setDecksInView(entry.intersectionRatio >= 0.4), {
      threshold: [0, 0.4, 1],
    });
    io.observe(row);
    return () => io.disconnect();
  }, [stage, phone]);

  // Phones: the deck menu is fixed to the screen, and layout animations measure in page
  // coordinates. If gathering cards shrank the page and the browser pulled the scroll
  // up in the same render, every deck in the menu would look like it had moved and
  // animate (the "shuffle"), and the gathering cards would aim for the wrong spot. So
  // the page never gets shorter than what's scrolled into view: an invisible strip
  // from the top of the page down to the bottom of the screen holds it open, and
  // shortens as you scroll back up.
  useEffect(() => {
    const spacer = holdRef.current;
    if (!phone || !spacer) return;
    const hold = () => {
      spacer.style.height = `${window.scrollY + window.innerHeight}px`;
    };
    hold();
    window.addEventListener("scroll", hold, { passive: true });
    window.addEventListener("resize", hold);
    return () => {
      window.removeEventListener("scroll", hold);
      window.removeEventListener("resize", hold);
      spacer.style.height = "";
    };
  }, [phone]);

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
    after(OPEN_DELAY, () => setStage("table"));
    after(OPEN_DELAY + BOX_DROP + 0.05, () => setBoxGone(true));
  };

  const deal = (id: DeckId) => {
    const count = byId.get(id)!.cards.length;
    set({ deck: id, phase: "dealt" });
    for (let i = 0; i < count; i++) play("place", i * DEAL_STAGGER + LANDING, 0.55);
    // If the spread starts low in the window (or above it), follow the cards as they fly.
    requestAnimationFrame(() => {
      const top = spreadRef.current?.getBoundingClientRect().top ?? 0;
      const target = window.innerHeight * 0.38;
      if (top > target + 40 || top < 0) {
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
      if (then) return then();
      // Phones: nothing is left down the page once the cards are back, so return to
      // the top (after this render, so no layout animation sees the scroll move).
      if (phone && window.scrollY > 0) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }));
      }
    });
  };

  const onDeck = (id: DeckId) => {
    unlock();
    const { deck, phase } = stateRef.current;
    if (phase === "collecting") return;
    if (phase === "dealt") return deck === id ? collect() : collect(() => deal(id));
    deal(id);
  };

  // From the dock on wider screens: back up to the decks first, so the cards visibly
  // gather into and deal out of them, then behave exactly as if that deck was clicked.
  const onDock = (id: DeckId) => {
    // On phones the dock *is* the decks, so there's nowhere to go back to.
    if (phone) return onDeck(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    onDeck(id);
  };

  const slotRef = (id: DeckId) => (el: HTMLElement | null) => {
    if (el) deckSlots.current.set(id, el);
    else deckSlots.current.delete(id);
  };
  const inAir = (id: DeckId) => !!tossFrom && !tossDone && !landed.has(id);
  const phaseOf = (id: DeckId) => (state.deck === id ? state.phase : "idle");

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
        {/* Headline embossed into the table, like a logo printed on the felt. It sits
            in the middle of the first screen and scrolls with the table, behind
            everything, so it takes no layout space; the text arrives from the deck box. */}
        {stage === "table" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 grid h-dvh place-items-center px-4 text-center" aria-hidden>
            <div className="flex flex-col items-center">
              <motion.p
                layoutId={HEADLINE_IDS.name}
                className="whitespace-nowrap font-poppins text-[clamp(3rem,14vw,8rem)] font-extrabold leading-none tracking-tight"
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

        <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center px-4 pb-36 pt-16 sm:pb-20 sm:pt-20">
          <MuteToggle muted={muted} onToggle={toggleMuted} />
          {/* Phones: the deck menu, always there once the box is open; the decks are
              tossed into it and deal from it. Wider screens: a shortcut that appears
              once the decks on the table have scrolled away. */}
          <DeckDock
            decks={decks}
            phone={phone}
            phaseOf={phaseOf}
            shown={stage === "table" && (phone || !decksInView)}
            inAir={phone ? inAir : () => false}
            slotRef={phone ? slotRef : undefined}
            onSelect={onDock}
          />
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

          {stage === "table" && !phone ? (
            <div
              ref={decksRef}
              className="flex flex-wrap items-end justify-center gap-x-6 gap-y-8 perspective-[1400px] sm:gap-x-14"
            >
              {decks.map((deck) => (
                <Deck
                  key={deck.id}
                  deck={deck}
                  phase={phaseOf(deck.id)}
                  hidden={inAir(deck.id)}
                  slotRef={slotRef(deck.id)}
                  onSelect={() => onDeck(deck.id)}
                  phone={phone}
                />
              ))}
            </div>
          ) : (
            // Placeholder keeps the decks row's height so the table doesn't jump.
            <div className="h-[180px] max-sm:hidden sm:h-[250px]" />
          )}

          {stage === "table" && tossFrom && !tossDone && (
            <DeckToss
              decks={decks}
              phone={phone}
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
            {stage === "table" ? ((phone && PHONE_HINT[state.phase]) || HINT[state.phase]) : ""}
          </p>

          <section
            ref={spreadRef}
            aria-label={open ? `${open.label} cards` : undefined}
            // Centred in the space left on the first screen when it fits (a single
            // card sits in the middle), starting from the top when it doesn't.
            className="my-auto flex w-full max-w-[1120px] flex-wrap items-start justify-center gap-5 pt-10 sm:gap-9 sm:pt-14"
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
        <div ref={holdRef} className="pointer-events-none absolute left-0 top-0 w-px" aria-hidden />
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
  phone,
  from,
  slots,
  onLand,
  onDone,
}: {
  decks: DeckData[];
  phone: boolean;
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
        const mini = to.width < 80; // landing in the phone dock
        const fit = deckFit(style.shape, mini, phone);
        return (
          <motion.div
            key={deck.id}
            className="absolute"
            style={{
              left: to.left,
              top: to.top,
              width: to.width,
              height: to.height,
            }}
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
              const i = deck.cards.length - layers.length + j;
              return (
                <div
                  key={card.id}
                  className="absolute"
                  style={{
                    ...cardPlacement(fit, i, deck.cards.length, mini),
                    borderRadius: CARD_RADIUS,
                    transform: `scale(${fit.scale})`,
                  }}
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

// How a deck draws its cards: full dealt-size cards, scaled down and centred on the
// deck's slot (see SIZE in deck-styles), so cards never scale up in flight.
function deckFit(shape: DeckStyle["shape"], mini: boolean, phone: boolean) {
  const slotW = mini ? MINI_W[shape] : DECK_W[shape];
  const cardW = DEALT_W[shape][phone ? "phone" : "wide"];
  const scale = slotW / cardW;
  return { slotW, slotH: slotW * ASPECT[shape], cardW, cardH: cardW * ASPECT[shape], scale, radius: CARD_RADIUS * scale };
}
type Fit = ReturnType<typeof deckFit>;

// Each card sits a little up and to the right of the one below it. Mini decks stay
// level: at most two steps, so a big deck's top card sits no higher than a small one's.
function stackOffset(i: number, count: number, mini: boolean) {
  const o = mini ? Math.min(count - 1, 2) - Math.min(count - 1 - i, 2) : Math.min(i, 7) * 1.5;
  return { x: o * 0.4, y: -o };
}
function cardPlacement(fit: Fit, i: number, count: number, mini: boolean): CSSProperties {
  const { x, y } = stackOffset(i, count, mini);
  return {
    width: fit.cardW,
    height: fit.cardH,
    left: (fit.slotW - fit.cardW) / 2 + x,
    top: (fit.slotH - fit.cardH) / 2 + y,
  };
}

function Deck({
  deck,
  phase,
  hidden,
  slotRef,
  onSelect,
  mini = false,
  layout = true,
  phone,
}: {
  deck: DeckData;
  phase: Phase;
  hidden: boolean; // still in the air (see DeckToss)
  slotRef?: (el: HTMLDivElement | null) => void;
  onSelect: () => void;
  mini?: boolean; // dock size
  layout?: boolean; // cards deal from / gather into this deck (shared layoutIds)
  phone: boolean;
}) {
  const style = DECK_STYLES[deck.id];
  const count = deck.cards.length;
  const dealt = phase === "dealt";
  const fit = deckFit(style.shape, mini, phone);
  const lift = stackOffset(count - 1, count, mini);
  // In the phone dock, cards gathering back slide in *under* the dock's frosted
  // background (see DeckDock); every other deck, and all labels, sit above it.
  const under = mini && layout && phase === "collecting";
  // A deck that doesn't deal only needs to look like a deck: its top three cards.
  const stack = layout ? deck.cards : deck.cards.slice(-3);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={dealt}
      aria-label={`${deck.label} deck, ${count} ${count === 1 ? "card" : "cards"}${dealt ? ", dealt" : ""}`}
      className={`group flex cursor-pointer flex-col items-center outline-none ${mini ? "gap-1.5" : "gap-4"}`}
    >
      <div
        className={mini && !under ? "relative z-20" : undefined}
        style={{ borderRadius: fit.radius, visibility: hidden ? "hidden" : undefined }}
      >
        <div
          ref={slotRef}
          data-slot={deck.id}
          className="relative transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1"
          style={{ width: fit.slotW, height: fit.slotH }}
        >
          {/* Empty slot, visible once the deck is dealt out. */}
          <div
            className={`absolute inset-0 border border-dashed transition-colors group-hover:border-highlight/70 ${
              dealt && mini ? "border-highlight/80" : "border-ivory/20"
            }`}
            style={{ borderRadius: fit.radius }}
          />
          {!dealt &&
            stack.map((card, j) => {
              const i = count - stack.length + j;
              return (
                <motion.div
                  key={card.id}
                  layoutId={layout ? card.id : undefined}
                  className="absolute"
                  style={{ ...cardPlacement(fit, i, count, mini), zIndex: i, borderRadius: CARD_RADIUS, scale: fit.scale }}
                  transition={{ layout: spring(i * COLLECT_STAGGER) }}
                >
                  <CardBack style={style} label={`${deck.label} card`} />
                </motion.div>
              );
            })}
          {/* Hover/focus ring around the top card, drawn at its on-screen size. */}
          {!dealt && (
            <div
              className={`pointer-events-none absolute inset-0 ${mini ? MINI_HIGHLIGHT : HIGHLIGHT}`}
              style={{ translate: `${lift.x}px ${lift.y}px`, borderRadius: fit.radius, zIndex: count }}
            />
          )}
        </div>
      </div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.3 }}
        className={`whitespace-nowrap font-mono uppercase transition-colors group-hover:text-highlight group-focus-visible:text-highlight ${
          mini
            ? `relative z-20 text-[9px] tracking-[0.14em] ${dealt ? "text-highlight" : "text-ivory/70"}`
            : "text-xs tracking-[0.22em] text-ivory/70 sm:text-sm"
        }`}
      >
        {deck.label}
      </motion.span>
    </button>
  );
}

const MINI_HIGHLIGHT =
  "outline-2 outline-offset-2 outline-transparent transition-[outline-color] group-hover:outline-highlight group-focus-visible:outline-highlight";

/**
 * The decks as a compact strip. On phones it is the deck menu: pinned to the bottom
 * edge (where thumbs are), holding the real decks, so cards deal out of and gather
 * back into it. On wider screens it's a shortcut along the top that appears once the
 * decks on the table have scrolled away; there it only shows the decks.
 */
function DeckDock({
  decks,
  phone,
  phaseOf,
  shown,
  inAir,
  slotRef,
  onSelect,
}: {
  decks: DeckData[];
  phone: boolean;
  phaseOf: (id: DeckId) => Phase;
  shown: boolean;
  inAir: (id: DeckId) => boolean;
  slotRef?: (id: DeckId) => (el: HTMLElement | null) => void;
  onSelect: (id: DeckId) => void;
}) {
  // While a deck gathers under the frosted background, cut a window over its slot so
  // each card shows as it drops in, instead of the whole deck popping up at the end.
  const panel = useRef<HTMLDivElement>(null);
  const gathering = phone ? decks.find((d) => phaseOf(d.id) === "collecting")?.id : undefined;
  const [hole, setHole] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const box = panel.current;
    const slot = gathering && box?.querySelector<HTMLElement>(`[data-slot="${gathering}"]`);
    if (!box || !slot) return setHole(null);
    const b = box.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    // A little extra above and to the right for the stacked cards' offsets.
    setHole({ x: r.left - b.left - 1, y: r.top - b.top - 7, w: r.width + 4, h: r.height + 8 });
  }, [gathering]);
  const mask: CSSProperties | undefined = hole
    ? {
        maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
        maskSize: `100% 100%, ${hole.w}px ${hole.h}px`,
        maskPosition: `0 0, ${hole.x}px ${hole.y}px`,
        maskRepeat: "no-repeat",
        maskComposite: "exclude",
      }
    : undefined;

  return (
    <nav
      aria-label="Decks"
      inert={!shown}
      className={`fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 flex justify-center px-4 transition-[translate,opacity] duration-300 ease-out sm:top-4 sm:bottom-auto ${
        // Fades only on phones: the decks are measured to land in it as it appears.
        shown ? "translate-y-0 opacity-100" : "pointer-events-none opacity-0 sm:-translate-y-6"
      }`}
    >
      {/* The background is its own layer (z-10) so cards can pass under it. */}
      <div ref={panel} className="relative isolate">
        <div
          style={mask}
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl border border-ivory/10 bg-felt-deep/85 shadow-[0_8px_24px_rgba(0,0,0,.45)] backdrop-blur-md"
          aria-hidden
        />
        <ul className="flex items-end gap-3 px-4 pb-2 pt-3 sm:gap-5 sm:px-5">
          {decks.map((deck) => (
            <li key={deck.id}>
              <Deck
                deck={deck}
                phase={phaseOf(deck.id)}
                hidden={inAir(deck.id)}
                slotRef={slotRef?.(deck.id)}
                onSelect={() => onSelect(deck.id)}
                mini
                layout={phone}
                phone={phone}
              />
            </li>
          ))}
        </ul>
      </div>
    </nav>
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
