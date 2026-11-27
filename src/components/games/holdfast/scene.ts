import { type Engine, HALL, type Shot, type Vec, WALL_R } from "./engine";

// The fixed scenery of the board (fence posts, trees, building heights) and the small
// helpers shared by the renderer and the overlay drawn on top of it.

export type Screen = { x: number; y: number };
/** Maps a world point, and a height above the ground, to board pixels. */
export type Project = (x: number, y: number, z?: number) => Screen;

export const HALL_H = 46;
export const ROOF_H = 34;
export const TOWER_H = 48;
export const POST_H = 20;

/** The fence is left open this many radians either side of due south: the gate. */
const GATE_HALF = 0.24;
const POST_COUNT = 44;
export const POSTS: Vec[] = Array.from({ length: POST_COUNT }, (_, i) => (i / POST_COUNT) * Math.PI * 2)
  .filter((a) => Math.abs(a - Math.PI / 2) > GATE_HALF)
  .map((a) => ({ x: HALL.x + Math.cos(a) * WALL_R, y: HALL.y + Math.sin(a) * WALL_R }));

/** Trees, clear of the path, the base and the pads. `s` scales each one. */
export const TREES: (Vec & { s: number })[] = (
  [
    [140, 200], [260, 120], [760, 160], [880, 300], [120, 520], [200, 700],
    [820, 560], [900, 760], [760, 900], [150, 980], [240, 1150], [820, 1120],
    [700, 1260], [380, 1280], [900, 1340], [100, 1320], [700, 420], [60, 820],
  ] as const
).map(([x, y], i) => ({ x, y, s: 0.85 + ((i * 37) % 10) / 20 }));

/** How high a shot starts: from a tower's top, or from the king's hands. */
export const shotFrom = (e: Engine, s: Shot) =>
  e.towers.some((t) => t.x === s.x1 && t.y === s.y1) ? TOWER_H + 10 : 24;

/** Overshoots a little past 1 before settling: for things that pop into place. */
export const easeOutBack = (t: number) => {
  const p = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.7 * p * p * p + 1.7 * p * p;
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, hi), Math.max(lo, v));
