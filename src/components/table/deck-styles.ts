import type { DeckId } from "./types";

// Visual identity of each deck. Content lives in lib/decks.ts; this is purely look.
export type DeckStyle = {
  suit: string;
  red: boolean; // suit printed in red on the card face
  back: string; // card back base colour
  trim: string; // lattice + border colour on the back
  shape: "portrait" | "landscape";
  variant?: "uno"; // UNO-style back and faces instead of the playing-card look
};

export const DECK_STYLES: Record<DeckId, DeckStyle> = {
  about: { suit: "♥", red: true, back: "#7d2130", trim: "rgba(245,226,190,.38)", shape: "portrait" },
  work: { suit: "♠", red: false, back: "#1d3557", trim: "rgba(214,228,245,.34)", shape: "portrait" },
  projects: { suit: "♦", red: true, back: "#4a2c5e", trim: "rgba(236,214,245,.34)", shape: "portrait" },
  // v1 palette: cream card, red lattice and monogram.
  contact: { suit: "✦", red: false, back: "#fdfae5", trim: "rgba(220,38,38,.3)", shape: "landscape" },
  games: { suit: "♣", red: false, back: "#111111", trim: "#ffffff", shape: "portrait", variant: "uno" },
};

// Card sizes. Deck = on the table edge. Dealt = laid out to read. (Cards inside the
// deck box are sized in deck-box.tsx.) Phone widths fit three decks / two dealt
// cards per row in a 375px screen.
export const SIZE = {
  portrait: {
    deck: "w-[96px] sm:w-[136px] aspect-[5/7]",
    dealt: "w-[158px] sm:w-[236px] aspect-[5/7]",
  },
  landscape: {
    deck: "w-[134px] sm:w-[190px] aspect-[7/4]",
    dealt: "w-[330px] sm:w-[460px] aspect-[7/4]",
  },
} as const;

export const CARD_RADIUS = 10;
