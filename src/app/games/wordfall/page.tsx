import type { Metadata, Viewport } from "next";
import { Wordfall } from "@/components/games/wordfall/wordfall";

export const metadata: Metadata = {
  title: "Wordfall · Mini Games · Silvia Tan",
  description: "Type the falling words before the stacks reach the top.",
};

// On phones, shrink the page to fit above the on-screen keyboard instead of hiding
// the bottom of the board behind it (supported by Chrome; Safari overlays regardless).
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default function Page() {
  return <Wordfall />;
}
