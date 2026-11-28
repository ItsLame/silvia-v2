import { COIN_LIFE, type Engine, type Vec } from "./engine";

// Short-lived visual effects, worked out by comparing the rules' state from one frame
// to the next. The engine knows nothing about them. Times are in game seconds, so
// effects freeze when the game is paused.

export const PUFF_TIME = 0.35;
export const FLIGHT_TIME = 0.22;
export const RISE_TIME = 0.5;
export const FLASH_TIME = 0.12;

/** An enemy fell here. */
export type Puff = { x: number; y: number; at: number };
/** A coin in the air: scooped up by the king, or paid from him into a pad. */
export type Flight = { from: Vec; to: "king" | Vec; at: number };

export class Fx {
  puffs: Puff[] = [];
  flights: Flight[] = [];
  /** Enemy id → when it was last hit. */
  hitAt = new Map<number, number>();
  /** Tower index → when it was built. */
  builtAt: number[] = [];

  private engine: Engine | null = null;
  private enemies = new Map<number, { x: number; y: number; hp: number }>();
  private coins = new Map<number, { x: number; y: number; bornAt: number }>();
  private paid: number[] = [];

  sync(e: Engine) {
    const t = e.time;
    if (e !== this.engine) {
      // A new run, or the first frame of this view: take the state as it is, quietly.
      this.engine = e;
      this.puffs = [];
      this.flights = [];
      this.hitAt.clear();
      this.enemies = new Map(e.enemies.map((en) => [en.id, { x: en.x, y: en.y, hp: en.hp }]));
      this.coins = new Map(e.coins.map((c) => [c.id, c]));
      this.paid = e.pads.map((p) => p.paid);
      this.builtAt = e.towers.map(() => -Infinity);
      return;
    }

    const alive = new Set<number>();
    for (const en of e.enemies) {
      alive.add(en.id);
      const was = this.enemies.get(en.id);
      if (was && en.hp < was.hp) this.hitAt.set(en.id, t);
      this.enemies.set(en.id, { x: en.x, y: en.y, hp: en.hp });
    }
    for (const [id, was] of this.enemies) {
      if (alive.has(id)) continue;
      this.puffs.push({ x: was.x, y: was.y, at: t });
      this.enemies.delete(id);
      this.hitAt.delete(id);
    }

    const loose = new Set<number>();
    for (const c of e.coins) {
      loose.add(c.id);
      this.coins.set(c.id, c);
    }
    for (const [id, c] of this.coins) {
      if (loose.has(id)) continue;
      // Gone before its time is up: the king scooped it.
      if (t - c.bornAt < COIN_LIFE - 0.05) this.flights.push({ from: { x: c.x, y: c.y }, to: "king", at: t });
      this.coins.delete(id);
    }

    e.pads.forEach((p, i) => {
      if (p.paid > (this.paid[i] ?? 0)) {
        this.flights.push({ from: { x: e.king.x, y: e.king.y }, to: { x: p.x, y: p.y }, at: t });
      }
      this.paid[i] = p.paid;
    });
    while (this.builtAt.length < e.towers.length) this.builtAt.push(t);

    this.puffs = this.puffs.filter((p) => t - p.at < PUFF_TIME);
    this.flights = this.flights.filter((f) => t - f.at < FLIGHT_TIME);
  }
}
