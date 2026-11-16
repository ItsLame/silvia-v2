"use client";

import { motion } from "motion/react";
import { CardBack } from "./card-faces";
import { CARD_RADIUS, DECK_STYLES, SIZE } from "./deck-styles";
import type { DeckData, DeckId } from "./types";

export type BoxStage = "closed" | "opening" | "leaving";

export const deckLayoutId = (id: DeckId) => `deck-${id}`;
export const HEADLINE_IDS = { name: "headline-name", title: "headline-title" } as const;

// Opening timeline, in seconds: the lid swings back, then the section cards slide up
// out of the box. After that the table takes over and flies them to their decks.
const LID = 0.45;
const RISE_START = 0.3;
const RISE = 0.4;
const RISE_STAGGER = 0.05;
export const OPEN_DURATION = RISE_START + RISE + RISE_STAGGER * 4 + 0.1;
export const OPEN_SOUNDS = { lid: 0, cards: RISE_START };

// Box palette: navy board with gold foil.
const BOARD = "#1b2a44";
const BOARD_EDGE = "#0f182a";
const INSIDE = "#0b1220";
const FOIL = "#dcc07a";
export const BOX_TEXT_COLOR = FOIL;

const BOX_SIZE = "w-[216px] sm:w-[256px] aspect-[18/25]";

/**
 * The starting screen: a tuck box with the name printed on it. Clicking it opens the
 * lid and slides out the top card of every section deck; those cards then fly to the
 * table as the decks (shared layoutId), and the name moves to the table headline.
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
  const open = stage !== "closed";
  const leaving = stage === "leaving";
  const stack = [...decks].reverse(); // About ends up at the front

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={stage !== "closed"}
      aria-label={`${name}, ${headline}. Open the deck box`}
      className="group cursor-pointer outline-none disabled:cursor-default"
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.45 }}
    >
      {/* Outline + shadow are one filter over the whole box (see globals.css). */}
      <div className={`deck-box relative perspective-[900px] ${BOX_SIZE}`}>
        {/* Inside of the box, seen once the lid is open. */}
        <div className="absolute inset-x-[3%] top-0 h-[20%] rounded-t-[6px]" style={{ background: INSIDE }} />

        {/* Section cards, tucked inside. They slide up when the box opens. */}
        {!leaving &&
          stack.map((deck, i) => {
            const style = DECK_STYLES[deck.id];
            const order = stack.length - 1 - i; // front card rises first
            return (
              <motion.div
                key={deck.id}
                layoutId={deckLayoutId(deck.id)}
                className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 ${SIZE[style.shape].pile}`}
                style={{ zIndex: 10 + i, rotate: style.shape === "landscape" ? 90 : 0, borderRadius: CARD_RADIUS }}
                initial={false}
                animate={{ top: open ? `${18 - order * 3}%` : "53%" }}
                transition={{ delay: open ? RISE_START + order * RISE_STAGGER : 0, duration: RISE, ease: [0.3, 0.7, 0.3, 1] }}
              >
                <CardBack style={style} label={`${deck.label} card`} />
              </motion.div>
            );
          })}

        {/* Front panel, below the lid line; covers the cards still in the box. */}
        <div
          className="absolute inset-x-0 bottom-0 top-[15%] z-20 rounded-b-[8px] p-[7%] pt-[10%]"
          style={{ background: BOARD, boxShadow: `6px 6px 0 ${BOARD_EDGE}` }}
        >
          <div className="relative grid h-full w-full place-items-center rounded-[4px] border" style={{ borderColor: `${FOIL}99` }}>
            <div className="absolute inset-[5px] rounded-[2px] border" style={{ borderColor: `${FOIL}40` }} />
            {(["♥", "♠", "♦", "♣"] as const).map((pip, i) => (
              <span
                key={pip}
                aria-hidden
                className={`absolute text-[12px] leading-none ${
                  ["left-3 top-3", "right-3 top-3", "bottom-3 right-3", "bottom-3 left-3"][i]
                }`}
                style={{ color: FOIL }}
              >
                {pip}
              </span>
            ))}
            {!leaving && (
              <div className="flex flex-col items-center px-3 text-center" aria-hidden>
                <motion.span
                  layoutId={HEADLINE_IDS.name}
                  className="font-display text-[36px] leading-none tracking-tight sm:text-[42px]"
                  style={{ color: FOIL }}
                >
                  {name}
                </motion.span>
                <motion.span
                  layoutId={HEADLINE_IDS.title}
                  className="mt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.32em] sm:text-[10px]"
                  style={{ color: FOIL }}
                >
                  {headline}
                </motion.span>
              </div>
            )}
          </div>
        </div>

        {/* Lid: hinged at its bottom edge, swings back and away when opened. Drawn
            behind the rising cards once open. */}
        <motion.div
          className="absolute inset-x-0 top-0 h-[16%] origin-bottom transform-3d"
          style={{ zIndex: open ? 5 : 30 }}
          initial={false}
          animate={{ rotateX: open ? 155 : 0 }}
          transition={{ duration: LID, ease: [0.4, 0, 0.2, 1] }}
        >
          <div
            className="absolute inset-0 rounded-t-[8px] border-b backface-hidden"
            // Same side edge as the front panel, so the box reads as one block.
            style={{ background: BOARD, borderColor: BOARD_EDGE, boxShadow: `6px 0 0 ${BOARD_EDGE}` }}
          >
            <div className="absolute inset-x-[30%] bottom-[22%] h-px" style={{ background: `${FOIL}80` }} />
          </div>
          {/* Inside of the lid. */}
          <div className="absolute inset-0 rotate-x-180 rounded-t-[8px] backface-hidden" style={{ background: "#26385a" }} />
        </motion.div>
      </div>
    </motion.button>
  );
}
