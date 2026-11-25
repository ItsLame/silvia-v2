"use client";

import Link from "next/link";
import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { COIN_LIFE, Engine, GRUNT, HALL, KING, PAD_R, PATH, TOWER, WALL_R, WORLD } from "./engine";

type Phase = "title" | "playing" | "paused" | "over";
type Hud = { coins: number; wave: number; nextIn: number; hallHp: number; kingHp: number; down: boolean };
type Result = { seconds: number; wave: number; kills: number };
/** A drag on the board: where it started and where the finger is now, in board pixels. */
type Stick = { id: number; ox: number; oy: number; x: number; y: number };
type Notice = { text: string; at: number };

const STICK_R = 44;
const NOTICE_MS = 1800;
const IVORY = "245,239,225";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const hudOf = (e: Engine): Hud => ({
  coins: e.king.coins,
  wave: e.wave,
  nextIn: Math.max(0, Math.ceil(e.nextWaveAt - e.time)),
  hallHp: e.hallHp,
  kingHp: e.king.hp,
  down: e.kingDown,
});
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

export function Holdfast() {
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const phaseRef = useRef<Phase>("title");
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef<Stick | null>(null);
  const noticeRef = useRef<Notice | null>(null);
  const hudKey = useRef("");

  const [phase, setPhaseState] = useState<Phase>("title");
  const [hud, setHud] = useState<Hud>({ coins: 0, wave: 0, nextIn: 3, hallHp: HALL.maxHp, kingHp: KING.maxHp, down: false });
  const [result, setResult] = useState<Result | null>(null);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const start = useCallback(() => {
    engineRef.current = new Engine(Date.now());
    keysRef.current.clear();
    stickRef.current = null;
    noticeRef.current = null;
    setResult(null);
    setPhase("playing");
  }, [setPhase]);
  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    keysRef.current.clear();
    stickRef.current = null;
    setPhase("paused");
  }, [setPhase]);
  const resume = useCallback(() => {
    if (phaseRef.current === "paused") setPhase("playing");
  }, [setPhase]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const p = phaseRef.current;
      if (ev.key === "Enter" && p !== "playing") {
        ev.preventDefault();
        if (p === "paused") resume();
        else start();
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (p === "paused") resume();
        else pause();
        return;
      }
      const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (p !== "playing" || !(key in KEYS)) return;
      ev.preventDefault(); // arrow keys would scroll the page
      keysRef.current.add(key);
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      keysRef.current.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key);
    };
    const onVisibility = () => document.hidden && pause();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, pause, resume]);

  // The game loop: step the rules, draw the board, refresh the HUD when it changes.
  useEffect(() => {
    const board = boardRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = board.clientWidth;
      h = board.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(board);
    resize();
    engineRef.current ??= new Engine();

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const e = engineRef.current!;
      if (phaseRef.current === "playing") {
        const stick = stickRef.current;
        let mx = 0;
        let my = 0;
        if (stick) {
          mx = (stick.x - stick.ox) / STICK_R;
          my = (stick.y - stick.oy) / STICK_R;
        } else {
          for (const key of keysRef.current) {
            mx += KEYS[key][0];
            my += KEYS[key][1];
          }
        }
        e.setMove(mx, my);
        for (const ev of e.update(dt)) {
          if (ev.type === "wave") noticeRef.current = { text: `Wave ${ev.wave}`, at: now };
          else if (ev.type === "built") noticeRef.current = { text: `${ev.pad.label} built`, at: now };
          else if (ev.type === "kingDown") {
            noticeRef.current = { text: ev.dropped ? `Knocked out: ${ev.dropped} coins dropped` : "Knocked out", at: now };
          } else {
            setResult({ seconds: e.time, wave: e.wave, kills: e.kills });
            setPhase("over");
          }
        }
      }
      draw(ctx, e, w, h, now, phaseRef.current === "playing" ? stickRef.current : null, noticeRef.current);

      const next = hudOf(e);
      const key = Object.values(next).join("|");
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(next);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // Leaving the page (Next keeps it around hidden): pause the game.
      if (phaseRef.current === "playing") setPhase("paused");
    };
  }, [setPhase]);

  // One finger or the mouse: press anywhere on the board and drag to steer.
  const boardPoint = (ev: PointerEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  const onPointerDown = (ev: PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "playing" || stickRef.current) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = boardPoint(ev);
    stickRef.current = { id: ev.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
  };
  const onPointerMove = (ev: PointerEvent<HTMLDivElement>) => {
    const stick = stickRef.current;
    if (!stick || stick.id !== ev.pointerId) return;
    const p = boardPoint(ev);
    stick.x = p.x;
    stick.y = p.y;
  };
  const onPointerUp = (ev: PointerEvent<HTMLDivElement>) => {
    if (stickRef.current?.id === ev.pointerId) stickRef.current = null;
  };

  const hallLow = hud.hallHp <= HALL.maxHp / 4 && phase === "playing";

  return (
    <main className="flex h-dvh flex-col items-center overflow-hidden px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-5">
      <header className="flex w-full max-w-[560px] items-center justify-between gap-3">
        <Link
          href="/games"
          className="font-mono text-xs uppercase tracking-[0.18em] text-ivory/60 transition-colors hover:text-highlight"
        >
          ← Mini Games
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/40">Holdfast · grey-box</span>
        <button
          type="button"
          onClick={phase === "paused" ? resume : pause}
          disabled={phase !== "playing" && phase !== "paused"}
          className="cursor-pointer font-mono text-xs uppercase tracking-[0.18em] text-ivory/60 transition-colors hover:text-highlight disabled:cursor-default disabled:opacity-30 disabled:hover:text-ivory/60"
        >
          {phase === "paused" ? "Resume" : "Pause"}
        </button>
      </header>

      <div className="mt-3 grid w-full max-w-[560px] grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 font-mono text-xs uppercase tracking-[0.14em] text-ivory/60">
        <span className={hallLow ? "text-suit-red" : undefined}>Hall</span>
        <Meter value={hud.hallHp / HALL.maxHp} color={hallLow ? "#ef4444" : `rgba(${IVORY},.55)`} label="Hall health" />
        <span className="text-right tabular-nums text-ivory">
          <span className="text-highlight">●</span> {hud.coins}
        </span>
        <span>King</span>
        <Meter value={hud.down ? 0 : hud.kingHp / KING.maxHp} color="var(--color-highlight)" label="King health" />
        <span className="text-right tabular-nums">
          {hud.wave === 0 ? `First wave ${hud.nextIn}s` : `Wave ${hud.wave} · next ${hud.nextIn}s`}
        </span>
      </div>

      <div
        ref={boardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative mt-3 min-h-0 w-full max-w-[560px] flex-1 touch-none select-none overflow-hidden rounded-2xl border bg-felt-deep/40 shadow-[inset_0_2px_30px_rgba(0,0,0,.45)] transition-colors sm:max-h-[720px] ${
          hallLow ? "border-red-500/60" : "border-ivory/10"
        }`}
      >
        <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label="Holdfast game board" />

        {phase === "title" && (
          <Overlay>
            <p className="font-display text-6xl">Holdfast</p>
            <p className="mt-3 max-w-xs text-sm text-ivory/75">
              Enemies march on your hall. The king fires on his own: you only steer. Carry the coins they drop to a
              build pad and stand on it.
            </p>
            <p className="mt-3 max-w-xs text-sm text-ivory/55">
              Get knocked out and you drop every coin you were carrying. The run ends when the hall falls.
            </p>
            <StartButton onClick={start}>Hold the gate</StartButton>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/45 max-sm:hidden">
              WASD or arrows · or drag · Esc pauses
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/45 sm:hidden">
              Touch and drag to move
            </p>
          </Overlay>
        )}
        {phase === "paused" && (
          <Overlay>
            <p className="font-display text-5xl">Paused</p>
            <StartButton onClick={resume}>Resume</StartButton>
            <TextButton onClick={start}>Start over</TextButton>
          </Overlay>
        )}
        {phase === "over" && result && (
          <Overlay>
            <p className="font-display text-5xl">The hall fell</p>
            <p className="mt-3 text-sm text-ivory/75">
              You held for {clock(result.seconds)}, into wave {result.wave}, with {result.kills} kills.
            </p>
            <StartButton onClick={start}>Hold it again</StartButton>
          </Overlay>
        )}
      </div>
    </main>
  );
}

function Meter({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 overflow-hidden rounded-full bg-ivory/10"
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, background: color }} />
    </div>
  );
}
function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-felt-deep/75 px-6 text-center backdrop-blur-[3px]">
      {children}
    </div>
  );
}
function StartButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 cursor-pointer rounded-full bg-ivory px-6 py-2.5 font-medium text-ink transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
    >
      {children}
    </button>
  );
}
function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 cursor-pointer text-sm text-ivory/70 underline decoration-ivory/30 underline-offset-4 transition-colors hover:text-highlight hover:decoration-highlight"
    >
      {children}
    </button>
  );
}

/** Paint one frame. Everything is plain shapes: this is the grey-box. */
function draw(
  ctx: CanvasRenderingContext2D,
  e: Engine,
  w: number,
  h: number,
  now: number,
  stick: Stick | null,
  notice: Notice | null,
) {
  const k = e.king;
  // The camera follows the king and stops at the edges of the world.
  const camX = w >= WORLD.w ? (WORLD.w - w) / 2 : Math.min(WORLD.w - w, Math.max(0, k.x - w / 2));
  const camY = h >= WORLD.h ? (WORLD.h - h) / 2 : Math.min(WORLD.h - h, Math.max(0, k.y - h / 2));
  const circle = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(-camX, -camY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Ground and the enemies' path.
  ctx.fillStyle = "rgba(21,64,47,.6)";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.strokeStyle = `rgba(${IVORY},.12)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WORLD.w - 2, WORLD.h - 2);
  ctx.strokeStyle = "rgba(214,196,160,.2)";
  ctx.lineWidth = 46;
  ctx.beginPath();
  PATH.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  // The fence ring, open at the gate to the south.
  ctx.strokeStyle = `rgba(${IVORY},.35)`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(HALL.x, HALL.y, WALL_R, Math.PI / 2 + 0.24, Math.PI / 2 - 0.24 + Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Build pads: what is still owed, filling from the bottom as coins go in.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of e.pads) {
    if (!p.open || p.built) continue;
    const size = PAD_R * 2;
    const filled = (p.paid / p.cost) * size;
    ctx.fillStyle = "rgba(250,204,21,.28)";
    ctx.fillRect(p.x - PAD_R, p.y + PAD_R - filled, size, filled);
    ctx.strokeStyle = `rgba(${IVORY},.85)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.strokeRect(p.x - PAD_R, p.y - PAD_R, size, size);
    ctx.setLineDash([]);
    // The king would cover the number while he pays, so it moves above the pad.
    const paying = e.activePad === p;
    ctx.fillStyle = `rgb(${IVORY})`;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillText(String(p.cost - p.paid), p.x, paying ? p.y - PAD_R - 14 : p.y - 4);
    if (paying) continue;
    ctx.fillStyle = `rgba(${IVORY},.6)`;
    ctx.font = `9px ${MONO}`;
    ctx.fillText(p.label.toUpperCase(), p.x, p.y + 14);
  }

  // Coins on the ground; they blink through their last three seconds.
  for (const c of e.coins) {
    const left = COIN_LIFE - (e.time - c.bornAt);
    if (left < 3 && Math.floor(left * 6) % 2 === 0) continue;
    circle(c.x, c.y, 4.5);
    ctx.fillStyle = "#facc15";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,80,0,.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The hall, with its health above it.
  const struck = e.hallUnderAttack && Math.floor(now / 120) % 2 === 0;
  ctx.fillStyle = struck ? "#ef4444" : `rgba(${IVORY},.85)`;
  ctx.fillRect(HALL.x - HALL.r, HALL.y - HALL.r, HALL.r * 2, HALL.r * 2);
  ctx.fillStyle = "rgba(10,34,25,.9)";
  ctx.font = `600 11px ${MONO}`;
  ctx.fillText("HALL", HALL.x, HALL.y);
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(HALL.x - 32, HALL.y - HALL.r - 12, 64, 5);
  ctx.fillStyle = e.hallHp <= HALL.maxHp / 4 ? "#ef4444" : "#86efac";
  ctx.fillRect(HALL.x - 32, HALL.y - HALL.r - 12, 64 * (e.hallHp / HALL.maxHp), 5);

  for (const t of e.towers) {
    circle(t.x, t.y, TOWER.range);
    ctx.strokeStyle = "rgba(147,197,253,.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    circle(t.x, t.y, TOWER.r);
    ctx.fillStyle = "#93c5fd";
    ctx.fill();
    ctx.strokeStyle = "rgba(10,34,25,.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const en of e.enemies) {
    circle(en.x, en.y, GRUNT.r);
    ctx.fillStyle = en.hp < GRUNT.hp ? "#b91c1c" : "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(250,204,21,.9)";
  ctx.lineWidth = 2;
  for (const s of e.shots) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  if (e.kingDown) {
    // Where he fell, and how long until he is back at the hall.
    ctx.strokeStyle = `rgba(${IVORY},.5)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(k.x - 8, k.y - 8);
    ctx.lineTo(k.x + 8, k.y + 8);
    ctx.moveTo(k.x + 8, k.y - 8);
    ctx.lineTo(k.x - 8, k.y + 8);
    ctx.stroke();
    ctx.fillStyle = `rgb(${IVORY})`;
    ctx.font = `600 14px ${MONO}`;
    ctx.fillText(String(Math.ceil(k.downFor)), k.x, k.y - 22);
  } else {
    // Guide trail: chevrons marching from the king towards the next useful thing.
    const g = e.guide;
    if (g) {
      const d = Math.hypot(g.x - k.x, g.y - k.y);
      const count = Math.min(6, Math.floor((d - 34) / 20));
      const angle = Math.atan2(g.y - k.y, g.x - k.x);
      const march = ((now / 500) % 1) * 20;
      ctx.fillStyle = "rgba(56,189,248,.9)";
      for (let i = 0; i < count; i++) {
        const at = 24 + i * 20 + march;
        ctx.save();
        ctx.translate(k.x + Math.cos(angle) * at, k.y + Math.sin(angle) * at);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-4, -6);
        ctx.lineTo(6, 0);
        ctx.lineTo(-4, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    circle(k.x, k.y, KING.range);
    ctx.strokeStyle = `rgba(${IVORY},.08)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    circle(k.x, k.y, KING.r);
    ctx.fillStyle = `rgb(${IVORY})`;
    ctx.fill();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Carried coins stack on his back.
    const shown = Math.min(k.coins, 16);
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      ctx.ellipse(k.x + 9, k.y - 10 - i * 3, 6, 2.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.strokeStyle = "rgba(120,80,0,.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();

  // From here on, board pixels: markers and controls that sit over the world.
  const hallX = HALL.x - camX;
  const hallY = HALL.y - camY;
  if (e.hallUnderAttack && (hallX < 0 || hallX > w || hallY < 0 || hallY > h)) {
    // The hall is being hit off-screen: point back to it from the edge.
    const x = Math.min(w - 22, Math.max(22, hallX));
    const y = Math.min(h - 22, Math.max(22, hallY));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(hallY - y, hallX - x));
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 90);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (notice && now - notice.at < NOTICE_MS) {
    ctx.globalAlpha = Math.min(1, (NOTICE_MS - (now - notice.at)) / 400);
    ctx.font = `600 13px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(notice.text).width + 24;
    ctx.fillStyle = "rgba(10,34,25,.8)";
    ctx.beginPath();
    ctx.roundRect(w / 2 - width / 2, 14, width, 26, 13);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.fillText(notice.text, w / 2, 27.5);
    ctx.globalAlpha = 1;
  }
  if (stick) {
    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const len = Math.max(1, Math.hypot(dx, dy) / STICK_R);
    circle(stick.ox, stick.oy, STICK_R);
    ctx.fillStyle = `rgba(${IVORY},.1)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${IVORY},.35)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    circle(stick.ox + dx / len, stick.oy + dy / len, 18);
    ctx.fillStyle = `rgba(${IVORY},.7)`;
    ctx.fill();
  }
}
