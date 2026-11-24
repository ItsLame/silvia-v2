// Games dealt from the Mini Games deck, in deck order. Each lives at /games/<slug>.
export type Game = {
  slug: string;
  title: string;
  blurb: string;
};

export const GAMES: Game[] = [
  {
    slug: "wordfall",
    title: "Wordfall",
    blurb: "Type the falling words before the stacks reach the top.",
  },
];
