"use client";

import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { CardBack } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES, SIZE } from "./deck-styles";
import type { DeckData, DeckId } from "./types";

export type BoxStage = "closed" | "opening" | "leaving";

export const deckLayoutId = (id: DeckId) => `deck-${id}`;
export const HEADLINE_IDS = { name: "headline-name", title: "headline-title" } as const;

// Opening timeline, in seconds: the lid flips up and back, then the section cards are
// pulled up out of the box. After that the table takes over: the cards spread out to
// their decks and the box drops out of view.
const LID = 0.5;
const RISE_START = 0.35;
const RISE = 0.45;
const RISE_STAGGER = 0.06;
export const OPEN_DURATION = RISE_START + RISE + RISE_STAGGER * 4 + 0.05;
export const OPEN_SOUNDS = { lid: 0, cards: RISE_START };
export const BOX_DROP = 0.7;

// v1 (silviatan.com) palette, inverted from the business card: red box, cream type.
const PALETTE = {
  front: "#991b1b",
  lid: "#a11f1f",
  top: "#b52a2a",
  side: "#6e1414",
  inside: "#2b0909",
  lip: "rgb(0 0 0 / 0.35)",
  name: "#fdfae5",
  title: "#fecaca",
} as const;
export const BOX_TEXT_COLOR = PALETTE.name;

const BOX_SIZE = "w-[216px] sm:w-[256px] aspect-[18/25]";
const DEPTH = 46; // px, front to back
const LID_HEIGHT = "34%";
const BODY_TOP = "30%"; // the lid overlaps the body down to LID_HEIGHT

/**
 * The starting screen: a flip-top deck box with the name printed on it. Seen front-on
 * from slightly above and to the right, so its top and side show. Clicking it flips
 * the lid open and pulls out the top card of every section deck; those cards then
 * spread to the table as the decks (shared layoutId) and the box drops out of view.
 */
export function DeckBox({
  name,
  headline,
  decks,
  stage,
  onSelect,
}: {
  name: string;
  headline: string;
  decks: DeckData[];
  stage: BoxStage;
  onSelect: () => void;
}) {
  const t = PALETTE;
  const open = stage !== "closed";
  const leaving = stage === "leaving";
  const stack = [...decks].reverse(); // About ends up at the front

  const face = (style: CSSProperties): CSSProperties => ({ position: "absolute", ...style });

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
      {/* Outline + shadow are one filter over the whole box (see globals.css). */}
      <div
        className={`deck-box relative ${BOX_SIZE}`}
        style={{ perspective: "900px", perspectiveOrigin: "260% -60%" }}
      >
        <div className="absolute inset-0 transform-3d">
          {/* Body: front, right side, and the open top (inside, seen once the lid lifts). */}
          <div
            className="inset-x-0 bottom-0 rounded-b-[6px]"
            style={face({ top: BODY_TOP, background: t.front })}
          />
          <div
            className="bottom-0 right-0 origin-right"
            style={face({ top: BODY_TOP, width: DEPTH, background: t.side, transform: "rotateY(-90deg)" })}
          />
          <div
            className="inset-x-0 origin-top"
            style={face({ top: BODY_TOP, height: DEPTH, background: t.inside, transform: "rotateX(-90deg)" })}
          />

          {/* Section cards inside the box, pulled up out of the top when it opens. */}
          {!leaving &&
            stack.map((deck, i) => {
              const style = DECK_STYLES[deck.id];
              const order = stack.length - 1 - i; // front card comes out first
              return (
                <motion.div
                  key={deck.id}
                  layoutId={deckLayoutId(deck.id)}
                  className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 ${SIZE[style.shape].pile}`}
                  style={{
                    z: -8 - (stack.length - 1 - i) * 3,
                    rotate: style.shape === "landscape" ? 90 : 0,
                    borderRadius: CARD_RADIUS,
                  }}
                  initial={false}
                  animate={{ top: open ? `${10 - order * 3}%` : "52%" }}
                  transition={{ delay: open ? RISE_START + order * RISE_STAGGER : 0, duration: RISE, ease: [0.3, 0.7, 0.3, 1] }}
                >
                  <CardBack style={style} label={`${deck.label} card`} />
                </motion.div>
              );
            })}

          {/* Printed name, on the body below the lid. */}
          <div
            className="pointer-events-none inset-x-0 bottom-0 flex flex-col items-center justify-center px-3 pb-[6%] text-center font-poppins"
            style={face({ top: LID_HEIGHT, transform: "translateZ(0.5px)" })}
            aria-hidden
          >
            {!leaving && (
              <>
                <motion.span
                  layoutId={HEADLINE_IDS.name}
                  className="text-[28px] font-extrabold leading-none tracking-tight sm:text-[34px]"
                  style={{ color: t.name }}
                >
                  {name}
                </motion.span>
                <motion.span
                  layoutId={HEADLINE_IDS.title}
                  className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.24em] sm:text-[11px]"
                  style={{ color: t.title }}
                >
                  {headline}
                </motion.span>
              </>
            )}
          </div>

          {/* Lid: a cap (front, top, side) hinged along the back of the top edge. It
              sits slightly proud of the body, like the reference box, and flips up and
              back to open. */}
          <motion.div
            className="absolute -inset-x-[1.5px] top-0 transform-3d"
            style={{ height: LID_HEIGHT, transformOrigin: `50% 0 -${DEPTH}px` }}
            initial={false}
            animate={{ rotateX: open ? -115 : 0 }}
            transition={{ duration: LID, ease: [0.4, 0, 0.2, 1] }}
          >
            <div
              className="inset-0 rounded-t-[6px]"
              style={face({
                background: t.lid,
                boxShadow: `inset 0 -3px 0 ${t.lip}`,
                transform: "translateZ(1.5px)",
              })}
            />
            <div
              className="inset-x-0 top-0 origin-top rounded-t-[6px]"
              style={face({ height: DEPTH + 1.5, background: t.top, transform: "translateZ(1.5px) rotateX(-90deg)" })}
            />
            <div
              className="bottom-0 right-0 top-0 origin-right"
              style={face({ width: DEPTH + 1.5, background: t.side, transform: "translateZ(1.5px) rotateY(-90deg)" })}
            />
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}
