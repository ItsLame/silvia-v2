export type DeckId = "about" | "work" | "projects" | "contact" | "games";

export type CardData =
  | { kind: "placeholder"; id: string; title: string }
  | { kind: "project"; id: string; title: string; description: string; tags: string[] }
  | { kind: "game"; id: string; title: string; blurb: string; href: string }
  | {
      kind: "contact";
      id: string;
      name: string;
      headline: string;
      email?: string;
      socials: { label: string; url: string }[];
    };

export type DeckData = { id: DeckId; label: string; cards: CardData[] };
