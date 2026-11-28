// Holdfast's rules, free of React and the DOM. Positions are in world units: one CSS
// pixel at the default zoom. This is the grey-box: one path, grunts, coins and four
// tower pads. Every number here is a starting value to tune by playing.

export type Vec = { x: number; y: number };

export const WORLD = { w: 1000, h: 1400 };
// The rules advance in fixed steps so a run plays out the same on any frame rate.
export const STEP = 1 / 60;

export const HALL = { x: 500, y: 380, r: 34, maxHp: 20 };
/** The fence ring around the hall. It stops nothing yet; the king heals inside it. */
export const WALL_R = 150;
/** Enemies walk this from the south edge, through the gate, to the hall's door. */
export const PATH: Vec[] = [
  { x: 620, y: 1400 },
  { x: 560, y: 1100 },
  { x: 380, y: 900 },
  { x: 470, y: 650 },
  { x: 500, y: 530 },
  { x: 500, y: 414 },
];

export const KING = {
  r: 12,
  speed: 150,
  range: 140,
  fireEvery: 0.5,
  damage: 1,
  maxHp: 5,
  pickup: 40,
  regenEvery: 1, // one hit back per second inside the walls
  respawn: 3,
};
export const GRUNT = { r: 9, hp: 2, speed: 40, reach: 24, hitEvery: 1 };
export const TOWER = { r: 14, range: 180, fireEvery: 1, damage: 1 };
export const PAD_R = 30;
export const COIN_LIFE = 20;
const PAY_RATE = 10; // coins per second while standing on a pad
const WAVE_GAP = 30;
const FIRST_WAVE = 3;
const SPAWN_GAP = 0.6; // single file: one enemy every 0.6 s...
const WAVE_SPREAD = 18; // ...or faster, so a big wave is all out before the next is due
const SHOT_TIME = 0.09;
const ALARM_TIME = 1.5;

export const gruntsIn = (wave: number) => 6 + 2 * wave;

// Paying off every pad in a tier reveals the next tier, further from the hall.
const PADS = [
  { tier: 1, label: "Tower", x: 420, y: 470, cost: 10 },
  { tier: 2, label: "Tower", x: 585, y: 570, cost: 15 },
  { tier: 3, label: "Tower", x: 565, y: 720, cost: 45 },
  { tier: 3, label: "Tower", x: 320, y: 800, cost: 45 },
];

export type Enemy = { id: number; x: number; y: number; hp: number; seg: number; cooldown: number };
export type Coin = { id: number; x: number; y: number; bornAt: number };
export type Pad = {
  id: number;
  tier: number;
  label: string;
  x: number;
  y: number;
  cost: number;
  paid: number;
  open: boolean;
  built: boolean;
};
export type Tower = { x: number; y: number; cooldown: number };
export type Shot = { x1: number; y1: number; x2: number; y2: number; at: number };

export type Event =
  | { type: "wave"; wave: number }
  | { type: "built"; pad: Pad }
  | { type: "kingDown"; dropped: number }
  | { type: "over" };

export type Status = "playing" | "over";

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

// Small seeded generator (mulberry32), so coin scatter repeats for a given seed.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Engine {
  status: Status = "playing";
  time = 0;
  /** Waves sent so far; 0 before the first. */
  wave = 0;
  nextWaveAt = FIRST_WAVE;
  kills = 0;
  hallHp = HALL.maxHp;
  king = { x: HALL.x, y: HALL.y + 80, hp: KING.maxHp, coins: 0, downFor: 0, cooldown: 0, regenIn: KING.regenEvery };
  enemies: Enemy[] = [];
  coins: Coin[] = [];
  pads: Pad[] = PADS.map((p, i) => ({ ...p, id: i, paid: 0, open: p.tier === 1, built: false }));
  towers: Tower[] = [];
  shots: Shot[] = [];

  private move: Vec = { x: 0, y: 0 };
  private acc = 0;
  private nextId = 1;
  private toSpawn = 0;
  private spawnIn = 0;
  private spawnGap = SPAWN_GAP;
  private payAcc = 0;
  private hallHitAt = -Infinity;
  private events: Event[] = [];
  private rand: () => number;

  constructor(seed = 1) {
    this.rand = seeded(seed);
  }

  /** Steer the king. Any length over 1 is treated as full speed. */
  setMove(x: number, y: number) {
    const len = Math.hypot(x, y);
    this.move = len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  get kingDown() {
    return this.king.downFor > 0;
  }

  get hallUnderAttack() {
    return this.time - this.hallHitAt < ALARM_TIME;
  }

  /** The pad the king is standing on, if it still wants coins. */
  get activePad(): Pad | null {
    if (this.kingDown) return null;
    return this.pads.find((p) => p.open && !p.built && dist(p, this.king) < PAD_R) ?? null;
  }

  /**
   * Where the guide trail points: the cheapest open pad once the king can pay it
   * off, otherwise the nearest enemy, then the nearest loose coin.
   */
  get guide(): Vec | null {
    if (this.kingDown) return null;
    const k = this.king;
    const owed = (p: Pad) => p.cost - p.paid;
    const pad = this.pads
      .filter((p) => p.open && !p.built)
      .reduce<Pad | null>((best, p) => (!best || owed(p) < owed(best) ? p : best), null);
    if (pad && k.coins >= owed(pad)) return pad;
    const nearest = <T extends Vec>(list: T[]) =>
      list.reduce<T | null>((best, v) => (!best || dist(v, k) < dist(best, k) ? v : best), null);
    return nearest(this.enemies) ?? nearest(this.coins) ?? (pad && k.coins > 0 ? pad : null);
  }

  /** Advance by `dt` seconds of real time. Returns what happened. */
  update(dt: number): Event[] {
    this.events = [];
    if (this.status !== "playing") return this.events;
    this.acc += dt;
    while (this.acc >= STEP && this.status === "playing") {
      this.acc -= STEP;
      this.step();
    }
    return this.events;
  }

  private step() {
    this.time += STEP;
    this.spawn();
    if (this.kingDown) {
      this.king.downFor -= STEP;
      if (!this.kingDown) Object.assign(this.king, { x: HALL.x, y: HALL.y + 80, hp: KING.maxHp, downFor: 0 });
    } else {
      this.stepKing();
    }
    this.stepTowers();
    this.stepEnemies();
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.coins = this.coins.filter((c) => this.time - c.bornAt < COIN_LIFE);
    this.shots = this.shots.filter((s) => this.time - s.at < SHOT_TIME);
    if (this.hallHp <= 0) {
      this.hallHp = 0;
      this.status = "over";
      this.events.push({ type: "over" });
    }
  }

  private spawn() {
    if (this.time >= this.nextWaveAt) {
      this.wave++;
      this.toSpawn += gruntsIn(this.wave);
      this.spawnGap = Math.min(SPAWN_GAP, WAVE_SPREAD / gruntsIn(this.wave));
      this.nextWaveAt += WAVE_GAP;
      this.events.push({ type: "wave", wave: this.wave });
    }
    if (this.toSpawn === 0) return;
    this.spawnIn -= STEP;
    if (this.spawnIn > 0) return;
    this.spawnIn = this.spawnGap;
    this.toSpawn--;
    this.enemies.push({ id: this.nextId++, x: PATH[0].x, y: PATH[0].y, hp: GRUNT.hp, seg: 1, cooldown: 0 });
  }

  private stepKing() {
    const k = this.king;
    k.x = Math.min(WORLD.w - KING.r, Math.max(KING.r, k.x + this.move.x * KING.speed * STEP));
    k.y = Math.min(WORLD.h - KING.r, Math.max(KING.r, k.y + this.move.y * KING.speed * STEP));

    if (dist(k, HALL) < WALL_R && k.hp < KING.maxHp) {
      k.regenIn -= STEP;
      if (k.regenIn <= 0) {
        k.hp++;
        k.regenIn = KING.regenEvery;
      }
    } else {
      k.regenIn = KING.regenEvery;
    }

    k.cooldown = Math.max(0, k.cooldown - STEP);
    if (k.cooldown === 0 && this.fire(k, KING.range, KING.damage)) k.cooldown = KING.fireEvery;

    this.coins = this.coins.filter((c) => {
      if (dist(c, k) >= KING.pickup) return true;
      k.coins++;
      return false;
    });

    const pad = this.activePad;
    if (!pad || k.coins === 0) {
      this.payAcc = 0;
      return;
    }
    this.payAcc += PAY_RATE * STEP;
    while (this.payAcc >= 1 && k.coins > 0 && pad.paid < pad.cost) {
      this.payAcc--;
      k.coins--;
      pad.paid++;
    }
    if (pad.paid < pad.cost) return;
    pad.built = true;
    this.payAcc = 0;
    this.towers.push({ x: pad.x, y: pad.y, cooldown: 0 });
    if (this.pads.every((p) => p.tier !== pad.tier || p.built)) {
      for (const p of this.pads) if (p.tier === pad.tier + 1) p.open = true;
    }
    this.events.push({ type: "built", pad });
  }

  private stepTowers() {
    for (const t of this.towers) {
      t.cooldown = Math.max(0, t.cooldown - STEP);
      if (t.cooldown === 0 && this.fire(t, TOWER.range, TOWER.damage)) t.cooldown = TOWER.fireEvery;
    }
  }

  /** Shoot the nearest living enemy in range. Returns whether there was one. */
  private fire(from: Vec, range: number, damage: number) {
    let target: Enemy | null = null;
    let best = range;
    for (const e of this.enemies) {
      const d = dist(e, from);
      if (e.hp > 0 && d <= best) {
        best = d;
        target = e;
      }
    }
    if (!target) return false;
    target.hp -= damage;
    this.shots.push({ x1: from.x, y1: from.y, x2: target.x, y2: target.y, at: this.time });
    if (target.hp <= 0) {
      this.kills++;
      this.dropCoin(target, 6);
    }
    return true;
  }

  private dropCoin(at: Vec, spread: number) {
    const angle = this.rand() * Math.PI * 2;
    const r = this.rand() * spread;
    this.coins.push({ id: this.nextId++, x: at.x + Math.cos(angle) * r, y: at.y + Math.sin(angle) * r, bornAt: this.time });
  }

  private stepEnemies() {
    const k = this.king;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.cooldown = Math.max(0, e.cooldown - STEP);
      // Enemies only swing at the king when he stands in their way.
      if (!this.kingDown && dist(e, k) < GRUNT.reach) {
        if (e.cooldown === 0) {
          e.cooldown = GRUNT.hitEvery;
          this.hurtKing();
        }
        continue;
      }
      if (e.seg >= PATH.length) {
        if (e.cooldown === 0) {
          e.cooldown = GRUNT.hitEvery;
          this.hallHp--;
          this.hallHitAt = this.time;
        }
        continue;
      }
      const to = PATH[e.seg];
      const d = dist(e, to);
      const stride = GRUNT.speed * STEP;
      if (d > stride) {
        e.x += ((to.x - e.x) / d) * stride;
        e.y += ((to.y - e.y) / d) * stride;
        continue;
      }
      e.seg++;
      if (e.seg < PATH.length) {
        e.x = to.x;
        e.y = to.y;
        continue;
      }
      // Arrived: take a place around the hall instead of stacking on its door.
      const angle = e.id * 2.4;
      e.x = HALL.x + Math.cos(angle) * (HALL.r + GRUNT.r);
      e.y = HALL.y + Math.sin(angle) * (HALL.r + GRUNT.r);
    }
  }

  private hurtKing() {
    const k = this.king;
    k.hp--;
    if (k.hp > 0) return;
    // Knocked out: every carried coin spills where he fell.
    const dropped = k.coins;
    for (let i = 0; i < dropped; i++) this.dropCoin(k, 34);
    k.coins = 0;
    k.downFor = KING.respawn;
    this.payAcc = 0;
    this.events.push({ type: "kingDown", dropped });
  }
}
