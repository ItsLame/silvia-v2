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
  contact: { suit: "✦", red: false, back: "#ece4d2", trim: "rgba(31,27,22,.22)", shape: "landscape" },
  games: { suit: "♣", red: false, back: "#111111", trim: "#ffffff", shape: "portrait", variant: "uno" },
};

// Card sizes. Deck = small, on the table edge. Dealt = larger, laid out to read.
export const SIZE = {
  portrait: { deck: "w-[76px] sm:w-[104px] aspect-[5/7]", dealt: "w-[148px] sm:w-[184px] aspect-[5/7]" },
  landscape: { deck: "w-[108px] sm:w-[148px] aspect-[7/4]", dealt: "w-[300px] sm:w-[360px] aspect-[7/4]" },
} as const;

export const CARD_RADIUS = 10;
