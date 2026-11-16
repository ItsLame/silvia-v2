import { CardTable } from "@/components/table/card-table";
import { getDecks } from "@/lib/decks";
import { getProfile } from "@/lib/content";

export default function Home() {
  const { name, headline } = getProfile();
  return <CardTable name={name} headline={headline} decks={getDecks()} />;
}
