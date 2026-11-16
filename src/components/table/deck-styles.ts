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

// Card sizes. Pile = inside the starting deck (same size as its cover). Deck = small,
// on the table edge. Dealt = larger, laid out to read. Landscape pile cards lie
// sideways, so their width roughly matches the cover's height.
export const COVER_SIZE = "w-[200px] sm:w-[240px] aspect-[5/7]";
export const SIZE = {
  portrait: {
    pile: COVER_SIZE,
    deck: "w-[76px] sm:w-[104px] aspect-[5/7]",
    dealt: "w-[148px] sm:w-[184px] aspect-[5/7]",
  },
  landscape: {
    pile: "w-[272px] sm:w-[328px] aspect-[7/4]",
    deck: "w-[108px] sm:w-[148px] aspect-[7/4]",
    dealt: "w-[300px] sm:w-[360px] aspect-[7/4]",
  },
} as const;

export const CARD_RADIUS = 10;
