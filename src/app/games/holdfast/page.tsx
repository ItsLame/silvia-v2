import type { Metadata } from "next";
import { Holdfast } from "@/components/games/holdfast/holdfast";

// Grey-box prototype: reachable by address, not yet dealt from the Mini Games deck
// (that happens by adding it to GAMES in src/lib/games.ts).
export const metadata: Metadata = {
  title: "Holdfast · Mini Games · Silvia Tan",
  description: "Hold the gate: carry the coins home and build before the hall falls.",
  robots: { index: false },
};

export default function Page() {
  return <Holdfast />;
}
