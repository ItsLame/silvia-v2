import type { CardData, DeckData } from "@/components/table/types";
import { getProfile, getProjects } from "./content";
import { GAMES } from "./games";

const placeholders = (deck: string, label: string, count: number): CardData[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: "placeholder",
    id: `${deck}-${i + 1}`,
    title: `${label} ${i + 1}`,
  }));

// Order here is the order decks sit on the table.
export function getDecks(): DeckData[] {
  const profile = getProfile();
  return [
    { id: "about", label: "About", cards: placeholders("about", "About", 3) },
    { id: "work", label: "Work", cards: placeholders("work", "Work", 3) },
    {
      id: "projects",
      label: "Projects",
      cards: getProjects().map((p) => ({
        kind: "project",
        id: `project-${p.slug}`,
        title: p.title,
        description: p.description,
        tags: p.tags,
      })),
    },
    {
      id: "contact",
      label: "Contact",
      cards: [
        {
          kind: "contact",
          id: "contact-card",
          name: profile.name,
          headline: profile.headline,
          email: profile.email,
          socials: profile.socials,
        },
      ],
    },
    {
      id: "games",
      label: "Mini Games",
      // Real games first, then "coming soon" cards so the deck never looks thin.
      cards: [
        ...GAMES.map((g): CardData => ({
          kind: "game",
          id: `game-${g.slug}`,
          title: g.title,
          blurb: g.blurb,
          href: `/games/${g.slug}`,
        })),
        ...placeholders("games", "Coming soon", Math.max(0, 3 - GAMES.length)).map((c) => ({ ...c, title: "Coming soon" })),
      ],
    },
  ];
}
