import type { CSSProperties } from "react";

// The Wordfall wordmark: "word" is the card you typed, and f, a, l, l are tiles in the
// spell colours, each falling a little further and tilting a little more. Styles live
// in globals.css (.wfl).
//
// - size: font size, which everything else scales from. Any CSS length; leave it out to
//   set the size with a text-* class instead.
// - on: "light" adds a thin ink rim to the "word" card so it reads on white.
// - intro: the tiles drop in once, `delay` seconds after mount (none with reduced motion).
export function WordfallLogo({
  size,
  on = "felt",
  intro = false,
  delay = 0.15,
  className = "",
}: {
  size?: string;
  on?: "felt" | "light";
  intro?: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Wordfall"
      data-on={on}
      data-intro={intro || undefined}
      className={`wfl ${className}`}
      style={{ fontSize: size, "--wfl-delay": `${delay}s` } as CSSProperties}
    >
      <span className="wfl-chip" aria-hidden>
        word
      </span>
      {["f", "a", "l", "l"].map((ch, i) => (
        <span key={i} className={`wfl-tile wfl-t${i + 1}`} aria-hidden>
          {ch}
        </span>
      ))}
    </span>
  );
}
