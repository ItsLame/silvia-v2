import type { CSSProperties } from "react";
import type { DeckStyle } from "./deck-styles";
import type { CardData } from "./types";

const face = "absolute inset-0 rounded-[10px] backface-hidden";

export function CardBack({ style, label }: { style: DeckStyle; label: string }) {
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

export function CardFace({ card, style, rank }: { card: CardData; style: DeckStyle; rank: string }) {
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
