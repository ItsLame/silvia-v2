import type { Metadata } from "next";
import { JackSprint } from "@/components/games/jack-sprint/jack-sprint";

export const metadata: Metadata = {
  title: "Jack Sprint · Games · Silvia Tan",
  description: "Steer each thigh and knee of a wobbly playing card down a 100 m track.",
};

export default function Page() {
  return <JackSprint />;
}
