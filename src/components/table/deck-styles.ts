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

// Card sizes, in px. Dealt = laid out to read, sized for phones and for wider screens
// (Tailwind's `sm`); the classes below must match. A deck is drawn with full dealt-size
// cards scaled down into its slot, so a card flying between a deck and the spread is
// only ever scaled down: it stays sharp and looks the same at both ends. Slot widths:
// on the table (wider screens only) and in the dock of mini decks.
export const SIZE = {
  portrait: { dealt: "w-[158px] sm:w-[236px] aspect-[5/7]" },
  landscape: { dealt: "w-[330px] sm:w-[460px] aspect-[7/4]" },
} as const;
export const DEALT_W = { portrait: { phone: 158, wide: 236 }, landscape: { phone: 330, wide: 460 } } as const;
export const DECK_W = { portrait: 136, landscape: 190 } as const;
export const MINI_W = { portrait: 38, landscape: 54 } as const;
export const ASPECT = { portrait: 7 / 5, landscape: 4 / 7 } as const; // height / width

export const CARD_RADIUS = 10;
