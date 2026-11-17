"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { CardBack } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES } from "./deck-styles";
import type { DeckData, DeckId } from "./types";

export type BoxStage = "closed" | "opening" | "leaving";

export const HEADLINE_IDS = { name: "headline-name", title: "headline-title" } as const;

// Opening timeline, in seconds: the lid flips up and back on its rear hinge, then the
// section cards are pulled up out of the box. The table then takes the cards from
// where they are on screen and spreads them to their decks; the box drops away.
const LID = 0.55;
const RISE_START = 0.4;
const RISE = 0.5;
const RISE_STAGGER = 0.07;
export const OPEN_DURATION = RISE_START + RISE + RISE_STAGGER * 4 + 0.05;
export const OPEN_SOUNDS = { lid: 0, cards: RISE_START };
export const BOX_DROP = 0.7;

/** The box's 3D view, so decks leaving it can start at the same angle. */
export const BOX_VIEW = { rotateX: -14, rotateY: -26 };

// v1 (silviatan.com) palette, inverted from the business card: red box, cream type.
const PALETTE = {
  front: "#991b1b",
  side: "#6e1414",
  top: "#b32626",
  inside: "#2b0909",
  lidInside: "#5c1010",
  seam: "rgb(0 0 0 / 0.3)",
  name: "#fdfae5",
  title: "#fecaca",
} as const;
export const BOX_TEXT_COLOR = PALETTE.name;

// Geometry, in px. A flip-top case: the body is open at the top, the lid is a cap
// (front, top, sides) hinged along the back of the top edge. Cards are 5:7.
const W = 240;
const H = 336;
const D = 72; // depth, front to back
const LID_H = 128; // lid covers the top of the front…
const BODY_TOP = 112; // …overlapping the body, whose open top sits a little lower
const CARD_W = 224;
const CARD_H = CARD_W * 1.4;
const LID_OPEN = 155; // degrees; far enough back that the cards clear it

/**
 * One flat panel of the box, positioned with a CSS 3D transform (origin top-left).
 * With `inner`, the back of the panel gets its own colour (seen once the lid opens).
 */
function Panel({
  w,
  h,
  transform,
  color,
  inner,
  style,
  children,
}: {
  w: number;
  h: number;
  transform: string;
  color: string;
  inner?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const base: CSSProperties = { position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0" };
  if (!inner) return <div style={{ ...base, transform, background: color, ...style }}>{children}</div>;
  return (
    <>
      <div className="backface-hidden" style={{ ...base, transform, background: color, ...style }}>
        {children}
      </div>
      {/* Same plane, flipped to face the other way. */}
      <div
        className="backface-hidden"
        style={{ ...base, transform: `${transform} translateX(${w}px) rotateY(180deg)`, background: inner }}
      />
    </>
  );
}

/**
 * The starting screen: a flip-top deck box with the name printed on it, turned a
 * little so its top and right side show. Clicking it flips the lid back and pulls
 * out the top card of every section deck. `cardRefs` exposes those cards so the table
 * can start each deck exactly where its card is on screen.
 */
export function DeckBox({
  name,
  headline,
  decks,
  stage,
  onSelect,
  cardRefs,
}: {
  name: string;
  headline: string;
  decks: DeckData[];
  stage: BoxStage;
  onSelect: () => void;
  cardRefs: RefObject<Map<DeckId, HTMLElement>>;
}) {
  const p = PALETTE;
  const open = stage !== "closed";
  const leaving = stage === "leaving";
  const back = [...decks].reverse(); // drawn back to front; About is the front card

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={stage !== "closed"}
      aria-label={`${name}, ${headline}. Open the deck box`}
      className="group cursor-pointer outline-none disabled:cursor-default"
      initial={false}
      animate={{ y: leaving ? "110vh" : 0 }}
      transition={{ duration: BOX_DROP, ease: [0.55, 0, 0.8, 0.2] }}
    >
      {/* Outline + shadow are one filter over the whole box (see globals.css). Square
          corners and one continuous block keep that outline clean. */}
      <div
        className="deck-box relative max-sm:scale-[0.8]"
        style={{ width: W, height: H, perspective: 1400 }}
      >
        <div
          className="absolute inset-0 transform-3d"
          style={{
            transform: `rotateX(${BOX_VIEW.rotateX}deg) rotateY(${BOX_VIEW.rotateY}deg)`,
            transformOrigin: `50% 50% ${-D / 2}px`,
          }}
        >
          {/* Body, open at the top. Back and left walls are only ever seen from inside. */}
          <Panel w={W} h={H} color={p.inside} transform={`translate3d(0, 0, ${-D}px)`} />
          <Panel w={D} h={H - BODY_TOP} color={p.inside} transform={`translate3d(0, ${BODY_TOP}px, 0) rotateY(90deg)`} />
          <Panel w={W} h={D} color={p.inside} transform={`translate3d(0, ${H}px, 0) rotateX(-90deg)`} />

          {/* Section cards inside, pulled up when the box opens (front card first). */}
          {!leaving &&
            back.map((deck, i) => {
              const style = DECK_STYLES[deck.id];
              const order = back.length - 1 - i;
              const landscape = style.shape === "landscape";
              const [w, h] = landscape ? [CARD_H * 0.98, CARD_H * 0.98 * (4 / 7)] : [CARD_W, CARD_H];
              const cx = W / 2;
              const cy = H - 8 - CARD_H / 2;
              return (
                <motion.div
                  key={deck.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(deck.id, el);
                    else cardRefs.current.delete(deck.id);
                  }}
                  className="absolute"
                  style={{
                    left: cx - w / 2,
                    top: cy - h / 2,
                    width: w,
                    height: h,
                    z: -10 - order * 11,
                    rotate: landscape ? 90 : 0,
                    borderRadius: CARD_RADIUS,
                  }}
                  initial={false}
                  animate={{ y: open ? -(150 + order * 10) : 0 }}
                  transition={{
                    delay: open ? RISE_START + order * RISE_STAGGER : 0,
                    duration: RISE,
                    ease: [0.3, 0.7, 0.3, 1],
                  }}
                >
                  <CardBack style={style} label={`${deck.label} card`} />
                </motion.div>
              );
            })}

          <Panel w={D} h={H - BODY_TOP} color={p.side} transform={`translate3d(${W}px, ${BODY_TOP}px, 0) rotateY(90deg)`} />
          <Panel w={W} h={H - BODY_TOP} color={p.front} transform={`translate3d(0, ${BODY_TOP}px, 0)`}>
            {/* Printed name, below the lid. */}
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center px-4 pb-6 text-center font-poppins"
              style={{ top: LID_H - BODY_TOP }}
              aria-hidden
            >
              {!leaving && (
                <>
                  <motion.span
                    layoutId={HEADLINE_IDS.name}
                    className="text-[34px] font-extrabold leading-none tracking-tight"
                    style={{ color: p.name }}
                  >
                    {name}
                  </motion.span>
                  <motion.span
                    layoutId={HEADLINE_IDS.title}
                    className="mt-3 text-xs font-semibold uppercase tracking-[0.24em]"
                    style={{ color: p.title }}
                  >
                    {headline}
                  </motion.span>
                </>
              )}
            </div>
          </Panel>

          {/* Lid: hinged on the back top edge; flips up and back when opened. Sits 1px
              proud of the body so the overlapping panels never z-fight. */}
          <motion.div
            className="absolute inset-0 transform-3d"
            style={{ transformOrigin: `50% 0 ${-D}px` }}
            initial={false}
            animate={{ rotateX: open ? LID_OPEN : 0 }}
            transition={{ duration: LID, ease: [0.4, 0, 0.2, 1] }}
          >
            <Panel
              w={W + 2}
              h={LID_H}
              color={p.front}
              inner={p.lidInside}
              transform="translate3d(-1px, 0, 1px)"
              style={{ boxShadow: `inset 0 -3px 0 ${p.seam}` }}
            />
            <Panel w={W + 2} h={D + 1} color={p.top} inner={p.lidInside} transform="translate3d(-1px, 0, 1px) rotateX(-90deg)" />
            <Panel w={D + 1} h={LID_H} color={p.side} transform={`translate3d(${W + 1}px, 0, 1px) rotateY(90deg)`} />
            <Panel w={D + 1} h={LID_H} color={p.side} transform="translate3d(-1px, 0, 1px) rotateY(90deg)" />
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}
