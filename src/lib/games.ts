export type Game = {
  slug: string;
  title: string;
  blurb: string;
  /** Suit shown on the game's card in the index. */
  suit: "♠" | "♥" | "♦" | "♣";
};

export const GAMES: Game[] = [];
