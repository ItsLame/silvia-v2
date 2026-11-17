"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode, RefObject } from "react";

export type BoxStage = "closed" | "opening" | "leaving";

export const HEADLINE_IDS = { name: "headline-name", title: "headline-title" } as const;

// Timeline, in seconds: the lid starts flipping back; after a beat the box drops off
// the table while the cards stream out of where it was (see CardStream in card-table).
const LID = 0.4;
export const OPEN_DELAY = 0.18;
export const BOX_DROP = 0.6;

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

// Geometry, in px. A flip-top case seen straight on: the body is open at the top, the
// lid is a cap (front, top, sides) hinged along the back of the top edge.
const W = 240;
const H = 336;
const D = 72; // depth, front to back
const LID_H = 128; // lid covers the top of the front…
const BODY_TOP = 112; // …overlapping the body, whose open top sits a little lower
const LID_OPEN = 155; // degrees

/**
 * One flat panel of the box, positioned with a CSS 3D transform (origin top-left).
 * With `inner`, the back of the panel gets its own colour (seen as the lid opens).
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
 * The starting screen: a flip-top deck box, front-on, with the name printed on it.
 * Clicking it flips the lid back and the box drops away; `openingRef` marks the box's
 * opening so the table can stream the cards out from there.
 */
export function DeckBox({
  name,
  headline,
  stage,
  onSelect,
  openingRef,
}: {
  name: string;
  headline: string;
  stage: BoxStage;
  onSelect: () => void;
  openingRef: RefObject<HTMLDivElement | null>;
}) {
  const p = PALETTE;
  const open = stage !== "closed";
  const leaving = stage === "leaving";

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
      <div className="deck-box relative max-sm:scale-[0.8]" style={{ width: W, height: H, perspective: 1100 }}>
        <div className="absolute inset-0 transform-3d" style={{ transformOrigin: `50% 50% ${-D / 2}px` }}>
          {/* Inside back wall: what shows above the body once the lid is open. */}
          <Panel w={W} h={H} color={p.inside} transform={`translate3d(0, 0, ${-D}px)`} />

          {/* Where the cards come out. */}
          <div ref={openingRef} className="absolute inset-x-0" style={{ top: BODY_TOP - 8, height: 16 }} />

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
              w={W}
              h={LID_H}
              color={p.front}
              inner={p.lidInside}
              transform="translate3d(0, 0, 1px)"
              style={{ boxShadow: `inset 0 -3px 0 ${p.seam}` }}
            />
            <Panel w={W} h={D + 1} color={p.top} inner={p.lidInside} transform="translate3d(0, 0, 1px) rotateX(-90deg)" />
            <Panel w={D + 1} h={LID_H} color={p.side} transform={`translate3d(${W}px, 0, 1px) rotateY(90deg)`} />
            <Panel w={D + 1} h={LID_H} color={p.side} transform="translate3d(0, 0, 1px) rotateY(90deg)" />
          </motion.div>
        </div>
      </div>
    </motion.button>
  );
}
