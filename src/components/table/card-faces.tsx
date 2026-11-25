import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { WordfallLogo } from "../games/wordfall/logo";
import type { DeckStyle } from "./deck-styles";
import type { CardData } from "./types";

const face = "absolute inset-0 rounded-[10px] backface-hidden";

// --- UNO-style deck (Mini Games) -------------------------------------------------
const UNO_RED = "#d6121c"; // back oval; faces use their own palette below
const UNO_FACE_COLORS = ["#d72600", "#0956bf", "#379711", "#ecd407"];
// Sizes use container-query units (cqw) so lettering scales with the card.
const unoType = (size: string, color: string) => ({
  fontSize: size,
  color,
  WebkitTextStroke: "0.07em #111",
  paintOrder: "stroke fill",
  textShadow: "0.05em 0.06em 0 #111",
});

// White border, coloured field, tilted oval: the shared UNO card layout.
function UnoShell({
  color,
  oval,
  ovalSize = "h-[88%] w-[66%]",
  flipped,
  passive,
  children,
}: {
  color: string;
  oval: string;
  ovalSize?: string;
  flipped?: boolean;
  passive?: boolean; // a back: must not swallow clicks meant for the face in the same plane
  children: ReactNode;
}) {
  return (
    <div
      className={`${face} ${flipped ? "rotate-y-180" : ""} ${passive ? "pointer-events-none" : ""} @container bg-white p-[5%] shadow-[0_2px_6px_rgba(0,0,0,.35)]`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[7px]" style={{ background: color }}>
        <div
          className={`absolute left-1/2 top-1/2 ${ovalSize} -translate-x-1/2 -translate-y-1/2 rotate-[28deg] rounded-[50%]`}
          style={{ background: oval }}
        />
        {children}
      </div>
    </div>
  );
}

// The UNO logo treatment: yellow fill, heavy black outline, a black extrusion
// stepping down-left, and a thin white rim around the whole thing.
const unoLogo = (size: string): CSSProperties => ({
  fontSize: size,
  color: "#ffe100",
  WebkitTextStroke: "0.09em #0b0b0b",
  paintOrder: "stroke fill",
  textShadow: [1, 2, 3, 4, 5, 6].map((s) => `${-s * 0.014}em ${s * 0.014}em 0 #0b0b0b`).join(","),
  filter: "drop-shadow(0 0 0.6px rgba(255,255,255,.9))",
});

function UnoBack({ label }: { label: string }) {
  return (
    // Oval nearly fills the field, as on a real UNO card.
    <UnoShell color="#0b0b0b" oval={UNO_RED} ovalSize="h-[100%] w-[74%]" passive>
      {/* Two lines, staggered along the oval (MINI up-right, GAMES down-left) so the
          lettering fills it, spilling slightly past the edges like the UNO logo. */}
      <div className="absolute inset-0 grid -rotate-[20deg] place-items-center" aria-hidden>
        <div className="flex flex-col font-sans font-black italic leading-[0.82] tracking-[-0.02em]">
          <span className="translate-x-[22%] self-start" style={unoLogo("21cqw")}>
            MINI
          </span>
          <span className="-translate-x-[4%]" style={unoLogo("26cqw")}>
            GAMES
          </span>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </UnoShell>
  );
}

function UnoFace({ card, index, revealDelay }: { card: CardData; index: number; revealDelay: number }) {
  const color = UNO_FACE_COLORS[index % UNO_FACE_COLORS.length];
  const n = String(index + 1);
  const corner = "absolute font-sans font-black italic leading-none";
  if (card.kind === "game")
    return <UnoGameFace card={card} color={color} n={n} corner={corner} revealDelay={revealDelay} />;
  return (
    <UnoShell color={color} oval="#fff" flipped>
      <span className={`${corner} left-[7%] top-[5%]`} style={unoType("15cqw", "#fff")} aria-hidden>
        {n}
      </span>
      <span className={`${corner} bottom-[5%] right-[7%] rotate-180`} style={unoType("15cqw", "#fff")} aria-hidden>
        {n}
      </span>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          <span className="font-sans font-black italic leading-none" style={unoType("40cqw", color)} aria-hidden>
            {n}
          </span>
          <span className="mt-[3cqw] font-mono uppercase tracking-[0.18em] text-ink/55" style={{ fontSize: "6.5cqw" }}>
            {card.kind === "placeholder" ? card.title : ""}
          </span>
        </div>
      </div>
    </UnoShell>
  );
}

// A playable game. The whole card is the link: the game's logo on a white "wild card"
// plate, and a little board below it that plays a round on hover or keyboard focus
// (board styles and animations: .wfc in globals.css). Only Wordfall exists so far, so
// the plate and board are Wordfall's.
function UnoGameFace({
  card,
  color,
  n,
  corner,
  revealDelay,
}: {
  card: Extract<CardData, { kind: "game" }>;
  color: string;
  n: string;
  corner: string;
  revealDelay: number;
}) {
  return (
    <Link
      href={card.href}
      aria-label={`Play ${card.title}: ${card.blurb}`}
      // Hover and focus: lift 4px with the decks' yellow outline and glow. Tailwind's
      // hover: only applies on devices that can hover, so phones skip it.
      className={`${face} wfc group/game rotate-y-180 @container block bg-white p-[5%] shadow-[0_2px_6px_rgba(0,0,0,.35)] outline-2 outline-offset-3 outline-transparent transition-[translate,outline-color,box-shadow] duration-200 hover:shadow-[0_2px_6px_rgba(0,0,0,.35),0_0_22px_rgba(250,204,21,.35)] hover:outline-highlight focus-visible:shadow-[0_2px_6px_rgba(0,0,0,.35),0_0_22px_rgba(250,204,21,.35)] focus-visible:outline-highlight motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[7px]" style={{ background: color }}>
        <div className="absolute left-1/2 top-1/2 h-[88%] w-[66%] -translate-x-1/2 -translate-y-1/2 rotate-[28deg] rounded-[50%] bg-white" />
        <span className={`${corner} left-[7%] top-[5%]`} style={unoType("15cqw", "#fff")} aria-hidden>
          {n}
        </span>
        <span className={`${corner} bottom-[5%] right-[7%] rotate-180`} style={unoType("15cqw", "#fff")} aria-hidden>
          {n}
        </span>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[6cqw] px-[9%]" aria-hidden>
          <div className="flex -rotate-5 flex-col items-center rounded-[3cqw] bg-white px-[4.5cqw] pb-[3.4cqw] pt-[4cqw] text-center shadow-[0_1.2cqw_3cqw_rgba(0,0,0,.4)] transition-transform duration-300 ease-[cubic-bezier(.3,.7,.2,1)] group-hover/game:-translate-y-[1cqw] group-hover/game:-rotate-2 group-focus-visible/game:-translate-y-[1cqw] group-focus-visible/game:-rotate-2 motion-reduce:transition-none">
            {/* The tiles drop in once the card has turned face up. */}
            <WordfallLogo size="10.6cqw" on="light" intro delay={revealDelay} className="rotate-[-3deg]" />
            <p className="font-sans leading-[1.35] text-ink/72" style={{ fontSize: "5cqw" }}>
              {card.blurb}
            </p>
          </div>
          <div className="wfc-board">
            <span className="wfc-word wfc-fall" style={{ left: "7%", top: "9%" }}>
              lantern
            </span>
            <span className="wfc-word wfc-ice wfc-fall wfc-f2" style={{ left: "52%", top: "20%" }}>
              ♦ pebble
            </span>
            <span className="wfc-word wfc-typing" style={{ left: "18%", top: "42%" }}>
              <span className="text-suit-red">gla</span>
              {["c", "i", "e", "r"].map((ch, i) => (
                <span key={i} className="wfc-letter" style={{ animationDelay: `${i * 0.12}s` }}>
                  {ch}
                </span>
              ))}
            </span>
            <span className="wfc-pts" style={{ left: "34%", top: "30%" }}>
              +90
            </span>
            <div className="wfc-limit" />
            <span className="wfc-word wfc-ghost" style={{ left: "5%", bottom: "6%" }}>
              orbit
            </span>
            <span className="wfc-word wfc-ghost" style={{ left: "48%", bottom: "6%" }}>
              commit
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// --- Playing-card decks ----------------------------------------------------------
export function CardBack({ style, label }: { style: DeckStyle; label: string }) {
  if (style.variant === "uno") return <UnoBack label={label} />;
  const lattice: CSSProperties = {
    backgroundImage: `repeating-linear-gradient(45deg, ${style.trim} 0 1px, transparent 1px 9px),
      repeating-linear-gradient(-45deg, ${style.trim} 0 1px, transparent 1px 9px)`,
    borderColor: style.trim,
  };
  const isLight = style.shape === "landscape";
  return (
    // pointer-events-none: on a dealt card the back sits in the same plane as the face,
    // and must not swallow clicks meant for links on the face.
    <div
      className={`${face} pointer-events-none p-[6%] shadow-[0_1px_0_rgba(255,255,255,.12)_inset,0_2px_6px_rgba(0,0,0,.35)]`}
      style={{ background: style.back }}
    >
      <div className="grid h-full w-full place-items-center rounded-[6px] border" style={lattice}>
        <span
          className={`grid aspect-square w-[42%] max-w-16 place-items-center rounded-full border leading-none ${
            isLight
              ? "font-poppins text-[clamp(14px,3vw,24px)] font-extrabold text-v1-red"
              : "font-display text-[clamp(18px,3.8vw,32px)] text-ivory/85"
          }`}
          style={{ background: style.back, borderColor: style.trim }}
          aria-hidden
        >
          {isLight ? "ST" : style.suit}
        </span>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

// --- Business card: v1 (silviatan.com) look — Poppins, cream, red name ------------
// Tabler icons (MIT), as used on v1's contact page.
const ICON_PATHS: Record<string, ReactNode> = {
  mail: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  linkedin: (
    <>
      <path d="M8 11v5M8 8v.01M12 16v-5M16 16v-3a2 2 0 1 0-4 0" />
      <path d="M3 7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7z" />
    </>
  ),
  github: (
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  ),
  external: (
    <>
      <path d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      <path d="M11 13l9-9M15 4h5v5" />
    </>
  ),
};

function Icon({ name, className = "size-4 text-v1-red sm:size-5" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// "https://github.com/ItsLame" → "itslame", like v1 shows its handles.
const handle = (url: string) => url.replace(/\/+$/, "").split("/").pop()!.toLowerCase();

// One contact line: icon, handle, and an external-link mark. Opens in a new tab.
function ContactLink({ href, icon, label, text }: { href: string; icon: string; label: string; text: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label}: ${text} (opens in a new tab)`}
        className="group/link inline-flex items-center gap-2.5 rounded-sm transition-colors hover:text-v1-red focus-visible:text-v1-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v1-red"
      >
        <Icon name={icon} />
        <span className="underline-offset-2 group-hover/link:underline">{text}</span>
        <Icon name="external" className="size-3 text-v1-ink/40 group-hover/link:text-v1-red sm:size-4" />
      </a>
    </li>
  );
}

function BusinessCard({ card }: { card: Extract<CardData, { kind: "contact" }> }) {
  return (
    <div
      className={`${face} rotate-y-180 flex flex-col justify-between overflow-hidden bg-v1-cream p-5 font-poppins text-v1-ink shadow-[0_2px_8px_rgba(0,0,0,.35)] sm:p-8`}
    >
      <div>
        <p className="text-[28px] font-extrabold leading-none text-v1-red sm:text-[40px]">{card.name}</p>
        <p className="mt-2.5 text-sm font-semibold text-v1-red-deep sm:mt-3 sm:text-lg">{card.headline}</p>
      </div>
      <ul className="space-y-1.5 text-xs sm:space-y-2 sm:text-base">
        {card.email && <ContactLink href={`mailto:${card.email}`} icon="mail" label="Email" text={card.email} />}
        {card.socials.map((s) => (
          <ContactLink key={s.url} href={s.url} icon={s.label.toLowerCase()} label={s.label} text={handle(s.url)} />
        ))}
      </ul>
    </div>
  );
}

function Index({ style, rank, flip }: { style: DeckStyle; rank: string; flip?: boolean }) {
  return (
    <div
      className={`absolute flex flex-col items-center font-mono text-[11px] leading-none sm:text-sm ${
        style.red ? "text-suit-red" : "text-ink"
      } ${flip ? "bottom-2.5 right-2.5 rotate-180" : "left-2.5 top-2.5"}`}
      aria-hidden
    >
      <span className="font-semibold">{rank}</span>
      <span className="mt-0.5">{style.suit}</span>
    </div>
  );
}

export function CardFace({
  card,
  style,
  rank,
  index,
  revealDelay = 0,
}: {
  card: CardData;
  style: DeckStyle;
  rank: string;
  index: number;
  /** Seconds until this card has turned face up, for intro animations on the face. */
  revealDelay?: number;
}) {
  if (style.variant === "uno") return <UnoFace card={card} index={index} revealDelay={revealDelay} />;
  const base = `${face} rotate-y-180 overflow-hidden bg-ivory text-ink shadow-[0_2px_8px_rgba(0,0,0,.35)]`;

  if (card.kind === "contact") return <BusinessCard card={card} />;

  if (card.kind === "project") {
    return (
      <div className={`${base} flex flex-col px-4 pb-4 pt-10 sm:px-6 sm:pb-5 sm:pt-12`}>
        <Index style={style} rank={rank} />
        <p className="font-display text-[22px] leading-tight sm:text-3xl">{card.title}</p>
        <p className="mt-2 line-clamp-3 text-xs leading-snug text-ink/70 sm:mt-3 sm:line-clamp-5 sm:text-sm">
          {card.description}
        </p>
        <ul className="mt-auto flex max-h-[24px] flex-wrap gap-1 overflow-hidden pt-0.5 sm:max-h-none sm:gap-1.5">
          {card.tags.slice(0, 4).map((t) => (
            <li key={t} className="rounded-full border border-ink/15 px-1.5 py-0.5 font-mono text-[10px] text-ink/60 sm:px-2 sm:text-xs">
              {t}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`${base} grid place-items-center`}>
      <Index style={style} rank={rank} />
      <div className="text-center">
        <p className={`text-4xl sm:text-6xl ${style.red ? "text-suit-red" : "text-ink"}`} aria-hidden>
          {style.suit}
        </p>
        <p className="mt-2 font-display text-2xl sm:mt-3 sm:text-4xl">{card.title}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40 sm:text-xs">Placeholder</p>
      </div>
      <Index style={style} rank={rank} flip />
    </div>
  );
}
