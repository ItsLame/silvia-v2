"use client";

import type { Body } from "planck";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Controls, NO_CONTROLS, type Runner, SHAPES, STEP, TRACK_LENGTH, createRunner, distance, step } from "./physics";

type Status = "ready" | "running" | "fallen" | "finished";
type Control = keyof Controls;
type Best = { distance: number; time: number | null };

const KEY_TO_CONTROL: Record<string, Control> = { a: "thighsA", s: "thighsB", k: "calvesA", l: "calvesB" };
const PADS: { control: Control; key: string; part: string }[] = [
  { control: "thighsA", key: "A", part: "Thighs" },
  { control: "thighsB", key: "S", part: "Thighs" },
  { control: "calvesA", key: "K", part: "Calves" },
  { control: "calvesB", key: "L", part: "Calves" },
];

// Palette, mirroring the theme tokens in globals.css.
const C = {
  ivory: "#f5efe1",
  ink: "#1f1b16",
  inkFar: "#4a4238",
  red: "#b3261e",
  redFar: "#7d1d17",
  gold: "#facc15",
  track: "#0f3123",
  trackEdge: "rgba(245,239,225,0.55)",
  deboss: "#113a2a",
};

const BEST_KEY = "jack-sprint:best";
const loadBest = (): Best => {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) return JSON.parse(raw) as Best;
  } catch {}
  return { distance: 0, time: null };
};
/** Merges a finished run into the stored best and returns the new best. */
const recordBest = (reached: number, time: number | null): Best => {
  const b = loadBest();
  const next: Best = {
    distance: Math.max(b.distance, reached),
    time: time === null ? b.time : b.time === null ? time : Math.min(b.time, time),
  };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch {}
  return next;
};

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return m > 0 ? `${m}:${s}` : `${(t % 60).toFixed(1)}s`;
};

export function JackSprint() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  const runnerRef = useRef<Runner | null>(null);
  const controlsRef = useRef<Controls>({ ...NO_CONTROLS });
  const statusRef = useRef<Status>("ready");
  const startRef = useRef(0); // runner.time when the clock started
  const endRef = useRef<{ distance: number; time: number } | null>(null); // frozen HUD once a run ends

  const [status, setStatusState] = useState<Status>("ready");
  const [pressed, setPressed] = useState<Controls>({ ...NO_CONTROLS });
  const [result, setResult] = useState<{ distance: number; time: number } | null>(null);
  const [best, setBest] = useState<Best>({ distance: 0, time: null });

  const setStatus = useCallback((s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const restart = useCallback(() => {
    // Restarting mid-run still counts towards the best distance.
    if (statusRef.current === "running" && runnerRef.current) {
      setBest(recordBest(Math.max(0, distance(runnerRef.current)), null));
    }
    runnerRef.current = createRunner();
    controlsRef.current = { ...NO_CONTROLS };
    setPressed({ ...NO_CONTROLS });
    endRef.current = null;
    setResult(null);
    setStatus("ready");
  }, [setStatus]);

  const press = useCallback(
    (control: Control, down: boolean) => {
      const st = statusRef.current;
      // Once the run is over, keys can still be let go but not pressed.
      if (down && (st === "fallen" || st === "finished")) return;
      if (down && st === "ready") {
        startRef.current = runnerRef.current?.time ?? 0;
        setStatus("running");
      }
      if (controlsRef.current[control] === down) return;
      controlsRef.current = { ...controlsRef.current, [control]: down };
      setPressed(controlsRef.current);
    },
    [setStatus],
  );

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const control = KEY_TO_CONTROL[key];
      if (control) {
        e.preventDefault();
        if (!e.repeat || e.type === "keyup") press(control, e.type === "keydown");
        return;
      }
      if (e.type !== "keydown" || e.repeat) return;
      const over = statusRef.current === "fallen" || statusRef.current === "finished";
      if (key === "r" || (over && (key === " " || key === "enter"))) {
        e.preventDefault();
        restart();
      }
    };
    const releaseAll = () => {
      controlsRef.current = { ...NO_CONTROLS };
      setPressed({ ...NO_CONTROLS });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", releaseAll);
      // Also runs when Next hides this page on navigation; don't come back with keys held.
      releaseAll();
    };
  }, [press, restart]);

  // Simulation and drawing.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    if (!runnerRef.current) runnerRef.current = createRunner();

    const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono") || "monospace";
    const serif = getComputedStyle(document.documentElement).getPropertyValue("--font-instrument-serif") || "serif";

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let camX = 0;
    let acc = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const r = runnerRef.current!;
      const st = statusRef.current;
      const controls = st === "running" || st === "ready" ? controlsRef.current : NO_CONTROLS;

      acc += dt;
      while (acc >= STEP) {
        step(r, controls);
        acc -= STEP;
      }

      const d = distance(r);
      if (st === "running") {
        const time = r.time - startRef.current;
        if (r.fallen) {
          endRef.current = { distance: Math.max(0, d), time };
          setStatus("fallen");
          setBest(recordBest(endRef.current.distance, null));
        } else if (d >= TRACK_LENGTH) {
          endRef.current = { distance: TRACK_LENGTH, time };
          setStatus("finished");
          setBest(recordBest(TRACK_LENGTH, time));
        }
        if (endRef.current) setResult(endRef.current);
      }

      // HUD, written straight to the DOM so React doesn't re-render every frame.
      const end = endRef.current;
      const shownDist = end ? end.distance : Math.min(Math.max(0, d), TRACK_LENGTH);
      const shownTime = end ? end.time : statusRef.current === "running" ? r.time - startRef.current : 0;
      if (distRef.current) distRef.current.textContent = `${shownDist.toFixed(1)} m`;
      if (timeRef.current) timeRef.current.textContent = formatTime(shownTime);

      // Camera eases after the card.
      camX += (d - camX) * (1 - Math.exp(-dt * 5));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, r, camX, w, h, { mono, serif });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [setStatus]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden select-none">
      <header className="flex items-center justify-between gap-4 px-4 pt-4 pb-2 sm:px-6">
        <Link
          href="/games"
          className="rounded-full px-3 py-1.5 text-sm text-ivory/70 transition-colors hover:bg-ivory/10 hover:text-ivory"
        >
          ← Games
        </Link>
        <h1 className="font-display text-3xl leading-none sm:text-4xl">Jack Sprint</h1>
        <div className="flex items-baseline gap-3 font-mono text-sm tabular-nums sm:gap-5">
          <span ref={distRef} className="min-w-[4.5rem] text-right text-ivory">
            0.0 m
          </span>
          <span ref={timeRef} className="hidden min-w-[3.5rem] text-right text-ivory/60 sm:inline">
            0.0s
          </span>
        </div>
      </header>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="The Jack of Hearts, a playing card with legs, standing at the start of a 100 metre track"
        />
        {status === "ready" && (
          <Overlay>
            <p className="font-display text-2xl sm:text-3xl">Get the Jack to 100 m.</p>
            <p className="mt-2 text-sm text-ivory/70">
              <Kbd>A</Kbd> <Kbd>S</Kbd> swing the thighs · <Kbd>K</Kbd> <Kbd>L</Kbd> bend the knees
            </p>
            <p className="mt-1 text-xs text-ivory/50">Don&apos;t let the card touch the track.</p>
          </Overlay>
        )}
        {(status === "fallen" || status === "finished") && result && (
          <Overlay>
            <p className="font-display text-3xl sm:text-4xl">
              {status === "finished" ? `100 m in ${formatTime(result.time)}` : `Down at ${result.distance.toFixed(1)} m`}
            </p>
            <p className="mt-2 text-sm text-ivory/70">
              Best: {best.time !== null ? `100 m in ${formatTime(best.time)}` : `${best.distance.toFixed(1)} m`}
            </p>
            <button
              type="button"
              onClick={restart}
              className="pointer-events-auto mt-4 rounded-full bg-ivory px-5 py-2 text-sm font-medium text-ink transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Run again <span className="hidden text-ink/50 sm:inline">(Space)</span>
            </button>
          </Overlay>
        )}
      </div>

      <div className="flex items-stretch justify-between gap-3 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-center sm:gap-10">
        {[PADS.slice(0, 2), PADS.slice(2)].map((group) => (
          <div key={group[0].part} className="flex gap-2">
            {group.map((pad) => (
              <button
                key={pad.control}
                type="button"
                aria-label={`${pad.part} (${pad.key})`}
                aria-pressed={pressed[pad.control]}
                onPointerDown={(e) => {
                  // Keep the pad held even if the finger drifts off it.
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                  press(pad.control, true);
                }}
                onPointerUp={() => press(pad.control, false)}
                onPointerCancel={() => press(pad.control, false)}
                onLostPointerCapture={() => press(pad.control, false)}
                onContextMenu={(e) => e.preventDefault()}
                className={`flex h-16 w-16 touch-none flex-col items-center justify-center rounded-xl border-2 transition-colors sm:h-14 sm:w-14 ${
                  pressed[pad.control]
                    ? "border-highlight bg-ivory text-ink"
                    : "border-ivory/25 bg-felt-deep/60 text-ivory hover:border-ivory/50"
                }`}
              >
                <span className="font-mono text-lg leading-none font-semibold">{pad.key}</span>
                <span className="mt-1 text-[10px] tracking-wide uppercase opacity-60">{pad.part}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[5%] flex flex-col items-center px-4 text-center">
      {children}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-ivory/30 bg-ivory/10 px-1.5 py-0.5 font-mono text-xs text-ivory">{children}</kbd>
  );
}

// ——— Drawing ———

const SUITS = ["♠", "♥", "♦", "♣"];

function draw(
  ctx: CanvasRenderingContext2D,
  r: Runner,
  camX: number,
  w: number,
  h: number,
  fonts: { mono: string; serif: string },
) {
  // Fit roughly 4.2 m of height (room above the Jack for messages) and 4–5.5 m of width.
  // On tall phone screens the width sets the scale and the scene sits mid-screen.
  const ppm = Math.min(h / 4.2, w / (w < h ? 4 : 5.5));
  const groundY = Math.min(h * 0.78, h * 0.55 + ppm);
  const originX = w * 0.38;
  const sx = (x: number) => (x - camX) * ppm + originX;
  const sy = (y: number) => groundY - y * ppm;
  const leftM = camX - originX / ppm;
  const rightM = camX + (w - originX) / ppm;

  ctx.clearRect(0, 0, w, h);

  // Faint suits drifting past behind the track, for a sense of speed.
  const par = 0.35;
  const gap = 1.4;
  ctx.font = `${Math.round(ppm * 0.32)}px ${fonts.serif}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(245,239,225,0.05)";
  for (let row = 0; row < 3; row++) {
    const y = groundY - ppm * (0.9 + row * 0.85);
    if (y < 0) continue;
    const offset = row % 2 ? gap / 2 : 0;
    const startI = Math.floor((leftM * par - offset) / gap) - 1;
    const endI = Math.ceil((rightM * par - offset) / gap) + 1;
    for (let i = startI; i <= endI; i++) {
      const wx = i * gap + offset;
      const x = (wx - camX * par) * ppm + originX;
      ctx.fillText(SUITS[(((i + row) % 4) + 4) % 4], x, y);
    }
  }

  // Track.
  ctx.fillStyle = C.track;
  ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = C.trackEdge;
  ctx.fillRect(0, groundY, w, 1.5);

  // Distance markers.
  ctx.textBaseline = "top";
  ctx.font = `600 ${Math.max(11, Math.round(ppm * 0.14))}px ${fonts.mono}`;
  for (let m = Math.max(0, Math.floor(leftM)); m <= Math.min(TRACK_LENGTH, Math.ceil(rightM)); m++) {
    const x = sx(m);
    if (m % 10 === 0) {
      ctx.fillStyle = "rgba(245,239,225,0.35)";
      ctx.fillRect(x - 1, groundY, 2, ppm * 0.12);
      ctx.fillStyle = "rgba(245,239,225,0.4)";
      ctx.fillText(`${m}m`, x, groundY + ppm * 0.18);
    } else if (m % 5 === 0) {
      ctx.fillStyle = "rgba(245,239,225,0.25)";
      ctx.fillRect(x - 1, groundY, 2, ppm * 0.07);
    }
  }

  // Start line.
  if (leftM < 1 && rightM > -1) {
    ctx.fillStyle = "rgba(245,239,225,0.7)";
    ctx.fillRect(sx(0) - 2, groundY, 4, h - groundY);
  }

  // Finish: checkered band and a banner.
  if (rightM > TRACK_LENGTH - 2 && leftM < TRACK_LENGTH + 2) {
    const x = sx(TRACK_LENGTH);
    const sq = Math.max(6, ppm * 0.08);
    for (let row = 0; row * sq < h - groundY; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 ? C.ink : C.ivory;
        ctx.fillRect(x - sq + col * sq, groundY + row * sq, sq, sq);
      }
    }
    const top = sy(2.5);
    ctx.fillStyle = C.ivory;
    ctx.fillRect(x - 2, top, 4, groundY - top);
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.roundRect(x - ppm * 0.6, top - ppm * 0.08, ppm * 1.2, ppm * 0.3, 4);
    ctx.fill();
    ctx.fillStyle = C.ivory;
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.round(ppm * 0.14)}px ${fonts.mono}`;
    ctx.fillText("FINISH", x, top + ppm * 0.07);
  }

  // Shadow under the runner.
  const tp = r.torso.getPosition();
  const shadowW = Math.max(0.15, 0.45 - tp.y * 0.08) * ppm;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(sx(tp.x), groundY + 2, shadowW, ppm * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // Runner, back to front.
  const body = (b: Body, fn: () => void) => {
    const p = b.getPosition();
    ctx.save();
    ctx.translate(sx(p.x), sy(p.y));
    ctx.rotate(-b.getAngle());
    fn();
    ctx.restore();
  };
  const limb = (hw: number, hh: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(-hw * ppm, -hh * ppm, hw * 2 * ppm, hh * 2 * ppm, hw * ppm);
    ctx.fill();
  };
  const { FOOT, CALF, THIGH, TORSO, HEAD_R, ARM } = SHAPES;

  for (const part of r.parts) {
    const far = part.side === "far";
    body(part.body, () => {
      switch (part.kind) {
        case "thigh":
          return limb(THIGH.hw, THIGH.len / 2, far ? C.inkFar : C.ink);
        case "calf":
          return limb(CALF.hw, CALF.len / 2, far ? C.inkFar : C.ink);
        case "arm":
          return limb(ARM.hw, ARM.len / 2, far ? C.inkFar : C.ink);
        case "foot": {
          ctx.fillStyle = far ? C.redFar : C.red;
          ctx.beginPath();
          ctx.roundRect(-FOOT.hw * ppm, -FOOT.hh * ppm, FOOT.hw * 2 * ppm, FOOT.hh * 2 * ppm, [
            FOOT.hh * ppm * 0.6,
            FOOT.hh * ppm * 1.6,
            FOOT.hh * ppm * 0.6,
            FOOT.hh * ppm * 0.6,
          ]);
          ctx.fill();
          return;
        }
        case "torso":
          return drawCard(ctx, ppm, TORSO, HEAD_R, fonts.serif);
      }
    });
  }
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  ppm: number,
  TORSO: { hw: number; hh: number },
  HEAD_R: number,
  serif: string,
) {
  const cw = TORSO.hw * ppm;
  const ch = TORSO.hh * ppm;

  // Head (behind the card's top edge) with a little crown.
  const hy = -(TORSO.hh + HEAD_R * 0.85) * ppm;
  const hr = HEAD_R * ppm;
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = Math.max(1, ppm * 0.012);
  ctx.beginPath();
  const crown = [
    [-0.12, 0.08],
    [-0.13, 0.22],
    [-0.065, 0.14],
    [0, 0.24],
    [0.065, 0.14],
    [0.13, 0.22],
    [0.12, 0.08],
  ];
  crown.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * ppm, hy - y * ppm));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ivory;
  ctx.beginPath();
  ctx.arc(0, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(hr * 0.45, hy - hr * 0.1, Math.max(1.2, hr * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.red;
  ctx.lineWidth = Math.max(1, ppm * 0.01);
  ctx.beginPath();
  ctx.arc(hr * 0.35, hy + hr * 0.25, hr * 0.25, 0.2, Math.PI * 0.7);
  ctx.stroke();

  // The card.
  ctx.fillStyle = C.ivory;
  ctx.strokeStyle = "rgba(31,27,22,0.55)";
  ctx.lineWidth = Math.max(1, ppm * 0.008);
  ctx.beginPath();
  ctx.roundRect(-cw, -ch, cw * 2, ch * 2, ppm * 0.04);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = C.red;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const index = (sign: 1 | -1) => {
    ctx.save();
    ctx.rotate(sign === 1 ? 0 : Math.PI);
    ctx.font = `${Math.round(ppm * 0.12)}px ${serif}`;
    ctx.fillText("J", -cw + ppm * 0.065, -ch + ppm * 0.08);
    ctx.font = `${Math.round(ppm * 0.09)}px ${serif}`;
    ctx.fillText("♥", -cw + ppm * 0.065, -ch + ppm * 0.18);
    ctx.restore();
  };
  index(1);
  index(-1);
  ctx.font = `${Math.round(ppm * 0.32)}px ${serif}`;
  ctx.fillText("♥", 0, ppm * 0.01);
}
