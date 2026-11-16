import type { CSSProperties, ReactNode } from "react";
import type { DeckStyle } from "./deck-styles";
import type { CardData } from "./types";

const face = "absolute inset-0 rounded-[10px] backface-hidden";

// --- UNO-style deck (Mini Games) -------------------------------------------------
const UNO_RED = "#d72600";
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
  flipped,
  children,
}: {
  color: string;
  oval: string;
  flipped?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`${face} ${flipped ? "rotate-y-180" : ""} @container bg-white p-[5%] shadow-[0_2px_6px_rgba(0,0,0,.35)]`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[7px]" style={{ background: color }}>
        <div
          className="absolute left-1/2 top-1/2 h-[86%] w-[60%] -translate-x-1/2 -translate-y-1/2 rotate-[30deg] rounded-[50%]"
          style={{ background: oval }}
        />
        {children}
      </div>
    </div>
  );
}

function UnoBack({ label }: { label: string }) {
  return (
    <UnoShell color="#111" oval={UNO_RED}>
      <div className="absolute inset-0 grid -rotate-[22deg] place-items-center" aria-hidden>
        <div className="flex flex-col items-center font-sans font-black italic leading-[0.9] tracking-tight">
          <span style={unoType("12cqw", "#fbd800")}>MINI</span>
          <span style={unoType("21cqw", "#fbd800")}>GAMES</span>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </UnoShell>
  );
}

function UnoFace({ card, index }: { card: CardData; index: number }) {
  const color = UNO_FACE_COLORS[index % UNO_FACE_COLORS.length];
  const n = String(index + 1);
  const corner = "absolute font-sans font-black italic leading-none";
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
    <div
      className={`${face} p-[6%] shadow-[0_1px_0_rgba(255,255,255,.12)_inset,0_2px_6px_rgba(0,0,0,.35)]`}
      style={{ background: style.back }}
    >
      <div className="grid h-full w-full place-items-center rounded-[6px] border" style={lattice}>
        <span
          className={`grid aspect-square w-[42%] max-w-12 place-items-center rounded-full border font-display text-[clamp(14px,3.2vw,26px)] leading-none ${
            isLight ? "text-ink/70" : "text-ivory/85"
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

function Index({ style, rank, flip }: { style: DeckStyle; rank: string; flip?: boolean }) {
  return (
    <div
      className={`absolute flex flex-col items-center font-mono text-[10px] leading-none sm:text-[11px] ${
        style.red ? "text-suit-red" : "text-ink"
      } ${flip ? "bottom-2 right-2 rotate-180" : "left-2 top-2"}`}
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
}: {
  card: CardData;
  style: DeckStyle;
  rank: string;
  index: number;
}) {
  if (style.variant === "uno") return <UnoFace card={card} index={index} />;
  const base = `${face} rotate-y-180 overflow-hidden bg-ivory text-ink shadow-[0_2px_8px_rgba(0,0,0,.35)]`;

  if (card.kind === "contact") {
    return (
      <div className={`${base} flex flex-col justify-between p-5 sm:p-6`}>
        <div>
          <p className="font-display text-3xl leading-none sm:text-4xl">{card.name}</p>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/60">{card.headline}</p>
        </div>
        <ul className="space-y-1 font-mono text-[11px] text-ink/80">
          {card.socials.map((s) => (
            <li key={s.url} className="flex gap-3">
              <span className="w-16 text-ink/45">{s.label}</span>
              <span className="truncate">{s.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
            </li>
          ))}
        </ul>
        <span className="absolute right-5 top-5 font-display text-2xl text-ink/25 sm:right-6 sm:top-6" aria-hidden>
          ✦
        </span>
      </div>
    );
  }

  if (card.kind === "project") {
    return (
      <div className={`${base} flex flex-col px-4 pb-4 pt-9 sm:px-5`}>
        <Index style={style} rank={rank} />
        <p className="font-display text-xl leading-tight sm:text-2xl">{card.title}</p>
        <p className="mt-2 line-clamp-4 text-[11px] leading-snug text-ink/70 sm:line-clamp-5 sm:text-xs">
          {card.description}
        </p>
        <ul className="mt-auto flex flex-wrap gap-1">
          {card.tags.slice(0, 4).map((t) => (
            <li key={t} className="rounded-full border border-ink/15 px-1.5 py-0.5 font-mono text-[9px] text-ink/60">
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
        <p className={`text-4xl ${style.red ? "text-suit-red" : "text-ink"}`} aria-hidden>
          {style.suit}
        </p>
        <p className="mt-2 font-display text-xl sm:text-2xl">{card.title}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">Placeholder</p>
      </div>
      <Index style={style} rank={rank} flip />
    </div>
  );
}
