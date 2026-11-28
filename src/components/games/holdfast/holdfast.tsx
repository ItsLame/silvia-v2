"use client";

import Link from "next/link";
import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Engine, HALL, KING } from "./engine";
import { type Notice, STICK_R, type Stick, drawOverlay } from "./overlay";
import type { Renderer3 } from "./render-3d";

// "unsupported": the board is drawn with WebGL, and this browser has none to give.
type Phase = "title" | "playing" | "paused" | "over" | "unsupported";
type Hud = { coins: number; wave: number; nextIn: number; hallHp: number; kingHp: number; down: boolean };
type Result = { seconds: number; wave: number; kills: number };

const IVORY = "245,239,225";

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
  const worldRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
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
      if (p === "unsupported") return;
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
    const world = worldRef.current!;
    const overlay = overlayRef.current!;
    const octx = overlay.getContext("2d")!;
    let renderer: Renderer3 | null = null;
    let stopped = false;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = board.clientWidth;
      h = board.clientHeight;
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer?.resize(w, h, dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(board);
    resize();
    // The renderer brings three.js with it, so it loads after the page itself.
    import("./render-3d")
      .then((m) => {
        if (stopped) return;
        renderer = new m.Renderer3(world);
        resize();
      })
      // Say so, instead of starting a game nobody can see.
      .catch(() => !stopped && setPhase("unsupported"));
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
      if (renderer) {
        renderer.draw(e, now);
        const stick = phaseRef.current === "playing" ? stickRef.current : null;
        drawOverlay(octx, e, w, h, now, renderer.project, stick, noticeRef.current);
      }

      const next = hudOf(e);
      const key = Object.values(next).join("|");
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(next);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
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
        {/* The world in WebGL, with labels and controls drawn over it. */}
        <canvas ref={worldRef} className="absolute inset-0 size-full" aria-label="Holdfast game board" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

        {phase === "unsupported" && (
          <Overlay>
            <p className="font-display text-5xl">Holdfast</p>
            <p className="mt-3 max-w-xs text-sm text-ivory/75">
              This game is drawn in 3D and needs WebGL, which this browser has switched off or doesn&apos;t support.
            </p>
          </Overlay>
        )}
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
