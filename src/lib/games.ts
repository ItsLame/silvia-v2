export type Game = {
  slug: string;
  title: string;
  blurb: string;
  /** Suit shown on the game's card in the index. */
  suit: "♠" | "♥" | "♦" | "♣";
};

export const GAMES: Game[] = [
  {
    slug: "jack-sprint",
    title: "Jack Sprint",
    blurb: "Steer each thigh and knee of a wobbly playing card down a 100 m track.",
    suit: "♥",
  },
];
