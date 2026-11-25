import { pickWord } from "./words";

// Wordfall's rules, free of React and the DOM. Positions are in board pixels.

export type Kind = "normal" | "wipe" | "ice" | "slow" | "mend";
export type Spell = Exclude<Kind, "normal">;
// Clearing a special card puts its spell on the rack; typing the spell's name casts it.
// Names are kept to 3–4 letters so they're quick to type under pressure.
export const SPECIALS: Record<Spell, { suit: string; label: string; color: string; blurb: string }> = {
  wipe: { suit: "♠", label: "Wipe", color: "#1f1b16", blurb: "clears the board" },
  ice: { suit: "♦", label: "Ice", color: "#2563eb", blurb: "stops time" },
  slow: { suit: "♣", label: "Slow", color: "#15803d", blurb: "eases off" },
  mend: { suit: "♥", label: "Mend", color: "#b3261e", blurb: "shrinks the pile" },
};

export type Word = {
  id: number;
  text: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  speed: number; // px per second
  rushed: boolean; // sped up after a wrong guess aimed at it
  clearedAt: number | null; // game time it was cleared (kept briefly for the pop animation)
  bornAt: number; // game time it spawned
};

/** A missed card, resting where it landed: on the board floor or on top of other cards. */
export type PileCard = { id: number; text: string; kind: Kind; x: number; y: number; w: number; tilt: number };
export type Popup = { id: number; x: number; y: number; text: string; at: number };

export type Event =
  | { type: "clear"; word: Word; streak: number; points: number }
  | { type: "wrong" }
  | { type: "land"; word: Word }
  | { type: "collect"; kind: Spell }
  | { type: "rackFull" }
  | { type: "cast"; kind: Spell }
  | { type: "levelUp"; level: number; perfect: boolean; bonus: number }
  | { type: "danger" }
  | { type: "over" };

export type Status = "playing" | "levelUp" | "over";

export const CARD_H = 34;
// On a desktop the board is always this size, so the window can't change the game.
// Phones use whatever room is left above the keyboard (see resize()).
export const BOARD_W = 560;
export const BOARD_H = 520;
// Shorter than this (a phone on its side) there's no room to play: the game pauses.
export const MIN_BOARD_H = 120;
// The limit line: on a desktop board the pile may stack up to 30% of the height. Missed
// cards spread across the width, so this takes roughly 15 misses on a desktop, 10 on a phone.
export const MAX_PILE = 0.3;
// The limit is really a number of card rows. On a shorter board the pile is drawn flatter,
// so the same misses fill the same share of it whatever the board's height.
const PILE_ROWS = (BOARD_H * MAX_PILE) / CARD_H;
const MIN_PILE_SCALE = 0.4;
export const RACK_SIZE = 4;
const FREEZE_TIME = 4;
const SLOW_TIME = 7;
const LEVEL_PAUSE = 2.4;
const POP_TIME = 0.4;
const POPUP_TIME = 0.9;
// Typing speed only counts time when there's a card you could be typing: one that is
// fully on the board and has been for a moment (time to notice it).
const NOTICE_TIME = 0.6;

export const quotaFor = (level: number) => 8 + 2 * (level - 1);

// Ids stay unique across games, so React never mistakes a new card for an old one.
let nextId = 1;

// Card ranks for the final score, Two up to Ace.
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_NAMES = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
const RANK_AT = [0, 1000, 2500, 4500, 7000, 10000, 14000, 19000, 25000, 32000, 41000, 53000, 70000];
export function rankFor(score: number) {
  let i = 0;
  while (i + 1 < RANK_AT.length && score >= RANK_AT[i + 1]) i++;
  return { short: RANKS[i], name: RANK_NAMES[i], next: RANK_AT[i + 1] ?? null };
}

export class Engine {
  w = BOARD_W;
  h = BOARD_H;
  charW = 9.6;
  /** Height of a card on the pile: full size on a desktop board, flatter on short ones. */
  pileH = CARD_H;

  status: Status = "playing";
  time = 0; // seconds since the start, used for animations
  playTime = 0; // seconds of actual play (level breaks excluded), for typing speed
  level = 1;
  score = 0;
  cleared = 0; // words cleared this level
  streak = 0;
  bestStreak = 0;
  correct = 0;
  wrong = 0;
  chars = 0; // letters in correctly typed words
  activeTime = 0; // seconds with at least one noticeable card on the board (see NOTICE_TIME)
  freezeLeft = 0;
  slowLeft = 0;
  perfect = true; // no misses or wrong guesses this level
  levelPause = 0;
  lastLevelUp: { level: number; perfect: boolean; bonus: number } | null = null;

  words: Word[] = [];
  pileCards: PileCard[] = [];
  rack: Spell[] = [];
  popups: Popup[] = [];
  /** Bumped whenever something the UI shows (other than positions) changes. */
  version = 0;

  private spawnIn = 0.3;
  private spawned = 0;
  private dangerIn = 0;

  /**
   * Fits the game to a board of w × h. Desktop boards never change size; on a phone the
   * board shrinks and grows as the keyboard opens and closes, so everything is rescaled
   * to keep the game the same: the pile stays as full, and a falling card stays as far
   * (and as many seconds) from the limit line.
   */
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    const oldH = this.h;
    const oldRoom = this.h - this.limit;
    const oldPileH = this.pileH;
    this.w = w;
    this.h = h;
    this.pileH = CARD_H * Math.min(1, Math.max(MIN_PILE_SCALE, h / BOARD_H));
    this.charW = w < 360 ? 9 : 9.6; // Geist Mono at 15px / 16px

    // The pile sits on the floor: rescale its height above the floor with its cards.
    const k = this.pileH / oldPileH;
    for (const c of this.pileCards) {
      c.y = h - (oldH - c.y) * k;
      c.x = Math.min(c.x, Math.max(0, w - c.w));
    }
    const s = (h - this.limit) / oldRoom;
    for (const word of this.words) {
      word.y *= s;
      word.speed *= s;
      word.x = Math.min(word.x, Math.max(0, w - word.w));
    }
    this.version++;
  }

  /** How high the pile may stack, in px from the floor. */
  get limit() {
    return Math.min(this.h * 0.5, PILE_ROWS * this.pileH);
  }

  /** Top edge of the highest card on the pile (the floor if there are none). */
  get pileTop() {
    return this.pileCards.reduce((top, c) => Math.min(top, c.y), this.h);
  }
  get pileHeight() {
    return this.h - this.pileTop;
  }
  /** How full the pile is, 0–100, where 100 means it has reached the limit line. */
  get pile() {
    return Math.min(100, (this.pileHeight / this.limit) * 100);
  }
  /** Where a card spanning x..x+w would come to rest: on the floor or on the pile. */
  private floorUnder(x: number, w: number) {
    const inset = 6; // cards may overlap a little at their edges
    let floor = this.h;
    for (const c of this.pileCards) {
      if (x + w - inset > c.x && x + inset < c.x + c.w) floor = Math.min(floor, c.y);
    }
    return floor;
  }
  get quota() {
    return quotaFor(this.level);
  }

  // Difficulty: each level is shorter and noticeably faster than the last, and it also
  // tightens a little within a level as you get through its quota.
  private get progress() {
    return Math.min(1, this.cleared / this.quota);
  }
  private spawnInterval() {
    const base = Math.max(0.6, 2.2 - 0.16 * (this.level - 1)) * (1 - 0.15 * this.progress);
    return base * (0.75 + Math.random() * 0.5);
  }
  private fallSpeed() {
    // Seconds to fall the full board, when the limit line sits at MAX_PILE. What stays
    // the same on every board is the time to reach the limit line.
    const fallTime = Math.max(3.2, 12 - 0.9 * (this.level - 1));
    const room = this.h - this.limit;
    return (room / (fallTime * (1 - MAX_PILE))) * (1 + 0.15 * this.progress) * (0.8 + Math.random() * 0.45);
  }

  private spawn() {
    const falling = this.words.filter((w) => w.clearedAt === null);
    const onScreen = new Set(falling.map((w) => w.text));
    const text = pickWord(this.level, onScreen);

    let kind: Kind = "normal";
    const hasSpecial = falling.some((w) => w.kind !== "normal");
    const chance = this.level === 1 ? 0.06 : 0.09;
    if (this.spawned >= 4 && !hasSpecial && Math.random() < chance) {
      const options: Spell[] = ["wipe", "ice", "slow"];
      if (this.pile > 15) options.push("mend", "mend");
      kind = options[Math.floor(Math.random() * options.length)];
    }

    const w = text.length * this.charW + (kind === "normal" ? 22 : 40);
    // Try a few spots and keep the one furthest from cards still near the top.
    const crowd = falling.filter((f) => f.y < CARD_H * 2.5);
    let best = 0;
    let bestGap = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = 6 + Math.random() * Math.max(0, this.w - w - 12);
      const gap = crowd.length
        ? Math.min(...crowd.map((c) => Math.max(c.x - (x + w), x - (c.x + c.w))))
        : Infinity;
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
      if (gap > 12) break;
    }

    this.words.push({
      id: nextId++,
      text,
      kind,
      x: best,
      y: -CARD_H,
      w,
      speed: this.fallSpeed(),
      rushed: false,
      clearedAt: null,
      bornAt: this.time,
    });
    this.spawned++;
    this.version++;
  }

  /** Advances the game by `dt` seconds. */
  update(dt: number): Event[] {
    const events: Event[] = [];
    if (this.status === "over") return events;

    // Expire pop animations and score popups.
    const before = this.words.length + this.popups.length;
    this.words = this.words.filter((w) => w.clearedAt === null || this.time - w.clearedAt < POP_TIME);
    this.popups = this.popups.filter((p) => this.time - p.at < POPUP_TIME);
    if (this.words.length + this.popups.length !== before) this.version++;

    if (this.status === "levelUp") {
      this.levelPause -= dt;
      this.time += dt; // keeps animations running
      if (this.levelPause <= 0) {
        this.status = "playing";
        this.level++;
        this.cleared = 0;
        this.perfect = true;
        this.spawnIn = 0.4;
        this.version++;
      }
      return events;
    }

    this.time += dt;
    this.playTime += dt;
    if (this.freezeLeft > 0) this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    if (this.slowLeft > 0) this.slowLeft = Math.max(0, this.slowLeft - dt);

    // Spawning pauses while frozen.
    if (this.freezeLeft === 0) {
      this.spawnIn -= dt * (this.slowLeft > 0 ? 0.6 : 1);
      if (this.spawnIn <= 0) {
        this.spawn();
        this.spawnIn = this.spawnInterval();
      }
    }

    if (this.words.some((w) => w.clearedAt === null && w.y >= 0 && this.time - w.bornAt >= NOTICE_TIME)) {
      this.activeTime += dt;
    }

    const factor = this.freezeLeft > 0 ? 0 : this.slowLeft > 0 ? 0.45 : 1;
    for (const word of this.words) {
      if (word.clearedAt !== null) continue;
      word.y += word.speed * (word.rushed ? 1.6 : 1) * factor * dt;
      const floor = this.floorUnder(word.x, word.w);
      if (word.y + CARD_H >= floor) this.land(word, floor, events);
      if ((this.status as Status) === "over") break;
    }
    if ((this.status as Status) === "over") return events; // land() may have ended it

    if (this.pile >= 75) {
      this.dangerIn -= dt;
      if (this.dangerIn <= 0) {
        events.push({ type: "danger" });
        this.dangerIn = 1.6;
      }
    } else this.dangerIn = 0;

    return events;
  }

  private land(word: Word, floor: number, events: Event[]) {
    this.words = this.words.filter((w) => w !== word);
    this.streak = 0;
    this.perfect = false;
    // The card stops exactly where it hit: on the floor, or on top of the cards below it.
    this.pileCards.push({
      id: word.id,
      text: word.text,
      kind: word.kind,
      x: word.x,
      y: floor - this.pileH,
      w: word.w,
      tilt: (Math.random() - 0.5) * 6,
    });
    events.push({ type: "land", word });
    this.version++;
    if (this.pile >= 100) {
      this.status = "over";
      events.push({ type: "over" });
    }
  }

  private popup(x: number, y: number, text: string) {
    this.popups.push({ id: nextId++, x, y, text, at: this.time });
  }

  private clearWord(word: Word, points: number) {
    word.clearedAt = this.time;
    this.score += points;
    this.popup(word.x + word.w / 2, word.y, `+${points}`);
  }

  private pointsFor(word: Word) {
    const base = word.text.length * 10 * (1 + (this.level - 1) * 0.25);
    return Math.round(base * (1 + Math.min(this.streak, 20) * 0.1));
  }

  /** The player sent `typed`. Returns what happened. */
  submit(typed: string): Event[] {
    const events: Event[] = [];
    const text = typed.trim().toLowerCase();
    if (!text || this.status !== "playing") return events;

    const matches = this.words.filter((w) => w.clearedAt === null && w.text === text);
    // Not on the board, but the name of a spell on the rack: cast it.
    const spell = (Object.keys(SPECIALS) as Spell[]).find((k) => k === text);
    if (!matches.length && spell && this.rack.includes(spell)) {
      this.cast(spell, events);
      return events;
    }
    if (!matches.length) {
      this.wrong++;
      this.streak = 0;
      this.perfect = false;
      // The word you were probably going for falls faster.
      let target: Word | null = null;
      let bestLen = 0;
      for (const w of this.words) {
        if (w.clearedAt !== null) continue;
        let n = 0;
        while (n < text.length && n < w.text.length && w.text[n] === text[n]) n++;
        if (n > bestLen || (n === bestLen && target && w.y > target.y)) {
          bestLen = n;
          target = w;
        }
      }
      if (target && bestLen > 0) target.rushed = true;
      events.push({ type: "wrong" });
      this.version++;
      return events;
    }

    // Lowest matching card first: it's the most urgent.
    const word = matches.reduce((a, b) => (b.y > a.y ? b : a));
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.correct++;
    this.chars += word.text.length;
    this.cleared++;
    const points = this.pointsFor(word);
    this.clearWord(word, points);
    events.push({ type: "clear", word, streak: this.streak, points });

    if (word.kind !== "normal") {
      if (this.rack.length < RACK_SIZE) {
        this.rack.push(word.kind);
        events.push({ type: "collect", kind: word.kind });
      } else {
        this.popup(word.x + word.w / 2, word.y + 18, "rack full");
        events.push({ type: "rackFull" });
      }
    }

    if (this.cleared >= this.quota) this.levelUp(events);
    this.version++;
    return events;
  }

  /** Casts a spell from the rack (by typing its name, or tapping it). */
  cast(kind: Spell, events: Event[] = []): Event[] {
    const i = this.rack.indexOf(kind);
    if (i === -1 || this.status !== "playing") return events;
    this.rack.splice(i, 1);
    this.applyPower(kind);
    events.push({ type: "cast", kind });
    this.version++;
    return events;
  }

  private applyPower(kind: Spell) {
    switch (kind) {
      case "wipe":
        for (const w of this.words) {
          if (w.clearedAt !== null) continue;
          this.clearWord(w, Math.round(this.pointsFor(w) / 2));
        }
        break;
      case "ice":
        this.freezeLeft = FREEZE_TIME;
        break;
      case "slow":
        this.slowLeft = SLOW_TIME;
        break;
      case "mend": {
        // Lift the highest third of the pile off (at least three cards). Taking the
        // highest first means no card is ever left floating.
        const n = Math.max(3, Math.ceil(this.pileCards.length / 3));
        const highest = new Set([...this.pileCards].sort((a, b) => a.y - b.y).slice(0, n));
        this.pileCards = this.pileCards.filter((c) => !highest.has(c));
        break;
      }
    }
  }

  private levelUp(events: Event[]) {
    // Whatever is still falling folds away (no points, no penalty).
    for (const w of this.words) if (w.clearedAt === null) w.clearedAt = this.time;
    const bonus = this.perfect ? 400 * this.level : 0;
    this.score += bonus;
    this.lastLevelUp = { level: this.level + 1, perfect: this.perfect, bonus };
    events.push({ type: "levelUp", ...this.lastLevelUp });
    this.status = "levelUp";
    this.levelPause = LEVEL_PAUSE;
    this.freezeLeft = 0;
    this.slowLeft = 0;
  }

  /**
   * Typing speed in words (5 letters) per minute, over the time there was something to
   * type: reading, choosing, typing and fixing mistakes all count; an empty board, a
   * card that has only just appeared, level breaks and pauses don't. Only correctly
   * typed words count towards the letters.
   */
  wpm() {
    return this.activeTime > 3 ? Math.round(this.chars / 5 / (this.activeTime / 60)) : 0;
  }

  accuracy() {
    const total = this.correct + this.wrong;
    return total ? Math.round((this.correct / total) * 100) : 100;
  }
}
