import type { Metadata } from "next";
import { CardTable } from "@/components/table/card-table";
import { getProfile } from "@/lib/content";
import { getDecks } from "@/lib/decks";

export const metadata: Metadata = {
  title: "Mini Games · Silvia Tan",
  description: "Small games to play in the browser.",
};

// The home table, already opened, with the Mini Games deck dealt.
export default function GamesPage() {
  const { name, headline } = getProfile();
  return <CardTable name={name} headline={headline} decks={getDecks()} initialDeck="games" />;
}
