"use client";

import Image, { type StaticImageData } from "next/image";
import { type ReactNode, useEffect, useRef } from "react";
import { SPECIALS } from "./engine";
import pileShot from "./help/pile.png";
import rackShot from "./help/rack.png";
import rushedShot from "./help/rushed.png";
import specialsShot from "./help/specials.png";
import typingShot from "./help/typing.png";

const POWERS: Record<keyof typeof SPECIALS, string> = {
  wipe: "clears every falling card (at half points)",
  ice: "stops everything for 4 seconds",
  slow: "halves the falling speed for 7 seconds",
  mend: "lifts the top third of the pile away",
};

/** How to play, as a modal dialog. Screenshots are real captures of the game. */
export function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Click on the dimmed backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby="wordfall-help-title"
      className="m-auto max-h-[min(88dvh,900px)] w-[min(92vw,620px)] overflow-hidden rounded-2xl border border-ivory/15 bg-felt-deep p-0 text-ivory shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(88dvh,900px)] flex-col">
        <div className="flex items-center justify-between border-b border-ivory/10 px-5 py-4 sm:px-7">
          <h2 id="wordfall-help-title" className="font-display text-3xl leading-none">
            How to play
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:bg-ivory/10 hover:text-highlight focus-visible:outline-2 focus-visible:outline-highlight"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-9 overflow-y-auto px-5 py-6 text-[15px] leading-relaxed text-ivory/80 sm:px-7">
          <Section title="Clear the words" shot={typingShot} alt="Typing “lant”: the lantern card lights up, with the typed letters in red and a gold outline.">
            <p>
              Type any word you can see and press <Kbd>Space</Kbd> or <Kbd>Enter</Kbd>. You don&apos;t need to click
              anything first. As you type, the letters light up on every card that matches so far. If the same word
              is on the board twice, the lower one goes first.
            </p>
          </Section>

          <Section
            title="The pile and the limit"
            shot={pileShot}
            alt="Missed cards stacked in rows at the bottom of the board, one card away from the dashed limit line. The Pile meter is red at 84%."
          >
            <p>
              A card you miss stays where it lands: on the floor, or on top of the cards below it. Cards that keep
              landing in the same spot stack into a tower, and cards above it have less room to fall.
            </p>
            <p className="mt-3">
              The dashed red line is the <strong className="text-ivory">limit</strong>. If any card on the pile
              reaches it, the game is over. The <strong className="text-ivory">Pile</strong> meter at the top shows how
              close the highest card is, where 100% means it touches the line. Past 75% the meter and the board turn
              red and you&apos;ll hear a warning.
            </p>
          </Section>

          <Section
            title="Special cards"
            shot={specialsShot}
            alt="Four coloured special cards falling: a black spade, a blue diamond, a green club and a red heart, on a board tinted blue by Ice."
          >
            <p>
              Coloured cards with a suit carry a spell. Type them like any other word, and the spell goes onto your
              rack below the board to use whenever you like.
            </p>
            <ul className="mt-3 space-y-2">
              {Object.entries(SPECIALS).map(([key, p]) => (
                <li key={key} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded text-ivory" style={{ background: p.color }}>
                    {p.suit}
                  </span>
                  <span>
                    <strong className="text-ivory">{p.label}</strong> {POWERS[key as keyof typeof SPECIALS]}.
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Casting spells"
            shot={rackShot}
            alt="The spell rack holding wipe, ice and mend. “ic” is typed, so the ice spell is outlined in gold."
          >
            <p>
              To cast a spell, type its name (<Code>wipe</Code>, <Code>ice</Code>, <Code>slow</Code> or{" "}
              <Code>mend</Code>) and press <Kbd>Space</Kbd>. You can also tap it on the rack. The rack holds four spells,
              and they carry over between levels, so it pays to save Mend for when the pile gets high.
            </p>
            <p className="mt-3 text-ivory/60">
              The board turns blue while Ice is on, and green while Slow is on. If the rack is full, a cleared
              special card scores but its spell is lost.
            </p>
          </Section>

          <Section title="Wrong words" shot={rushedShot} alt="The giraffe card with a red ring after a wrong guess aimed at it.">
            <p>
              Sending a word that isn&apos;t on the board breaks your streak. The card you were probably going for gets a
              red ring and falls faster.
            </p>
          </Section>

          <section>
            <h3 className="font-display text-2xl text-ivory">Levels and score</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                Each level has a quota of words (the yellow bar). Fill it to move up. Every level is a lot faster than
                the last, with longer words, and it speeds up as you work through the quota.
              </li>
              <li>Longer words, higher levels and a running streak all score more.</li>
              <li>
                Finish a level without missing a card or sending a wrong word for a <strong className="text-ivory">clean hand</strong> bonus.
              </li>
              <li>When the game ends, your score becomes a card rank, from Two of Hearts up to Ace.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-display text-2xl text-ivory">Controls</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt><Kbd>Space</Kbd> / <Kbd>Enter</Kbd></dt>
              <dd>send the word</dd>
              <dt><Kbd>Esc</Kbd> or <PauseGlyph /></dt>
              <dd>pause and resume (the game also pauses when you switch tabs)</dd>
              <dt><Kbd>?</Kbd></dt>
              <dd>open this help</dd>
              <dt>Speaker / note</dt>
              <dd>turn sound effects and music on or off</dd>
            </dl>
          </section>
        </div>
      </div>
    </dialog>
  );
}

function Section({ title, shot, alt, children }: { title: string; shot: StaticImageData; alt: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-2xl text-ivory">{title}</h3>
      <div className="mt-2">{children}</div>
      <Image
        src={shot}
        alt={alt}
        sizes="(max-width: 680px) 86vw, 560px"
        className="mt-4 w-full rounded-xl border border-ivory/10 shadow-[0_6px_20px_rgba(0,0,0,.35)]"
      />
    </section>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-ivory/10 px-1 py-0.5 font-mono text-[13px] text-ivory">{children}</code>;
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ivory/30 bg-ivory/10 px-1.5 py-0.5 font-mono text-xs text-ivory">{children}</kbd>;
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="inline size-4 align-[-2px]" fill="currentColor" aria-label="the pause button">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
