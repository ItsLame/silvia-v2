"use client";

import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type Channel, GameAudio, readMuted, subscribeMuted } from "./audio";
import { AuthForm, Modal, type Player, usePlayer } from "../../account";
import { Leaderboard, type Standing, scores } from "../leaderboard";
import { Help } from "./help";
import {
  BOARD_H,
  BOARD_W,
  CARD_H,
  Engine,
  type Event,
  type Kind,
  MIN_BOARD_H,
  type PileCard,
  type Popup,
  RACK_SIZE,
  SPECIALS,
  type Spell,
  rankFor,
} from "./engine";

type Phase = "title" | "playing" | "paused" | "over";
// Whether the board fits the window. A desktop board has a fixed size and needs room for
// all of it; a phone's board fits whatever room there is, unless that's next to nothing.
type Room = { ok: true } | { ok: false; reason: "short" | "narrow"; by: number; phone: boolean };
const isPhone = () => window.matchMedia("(pointer: coarse)").matches;

// What React renders. Positions of falling words are written straight to the DOM each
// frame; this only changes when words appear or go, or the HUD changes.
type Snap = {
  status: Engine["status"];
  level: number;
  score: number;
  cleared: number;
  quota: number;
  pile: number;
  pileHeight: number;
  pileH: number;
  limitTop: number;
  streak: number;
  frozen: boolean;
  slowed: boolean;
  words: { id: number; text: string; kind: Kind; x: number; y: number; w: number; cleared: boolean; rushed: boolean }[];
  pileCards: PileCard[];
  rack: Spell[];
  popups: Popup[];
  levelUp: Engine["lastLevelUp"];
};

const snapshot = (e: Engine): Snap => ({
  status: e.status,
  level: e.level,
  score: e.score,
  cleared: e.cleared,
  quota: e.quota,
  pile: e.pile,
  pileHeight: e.pileHeight,
  pileH: e.pileH,
  limitTop: e.h - e.limit,
  streak: e.streak,
  frozen: e.freezeLeft > 0,
  slowed: e.slowLeft > 0,
  words: e.words.map((w) => ({
    id: w.id,
    text: w.text,
    kind: w.kind,
    x: w.x,
    y: w.y,
    w: w.w,
    cleared: w.clearedAt !== null,
    rushed: w.rushed,
  })),
  pileCards: e.pileCards.map((c) => ({ ...c })),
  rack: [...e.rack],
  popups: [...e.popups],
  levelUp: e.lastLevelUp,
});

type Result = { score: number; level: number; words: number; accuracy: number; wpm: number; bestStreak: number };
type PostState =
  | { kind: "idle" }
  | { kind: "signedOut" }
  | { kind: "posting" }
  | { kind: "posted"; week: Standing; all: Standing }
  | { kind: "error"; message: string };
type Best = { score: number; level: number; wpm: number };
const BEST_KEY = "wordfall:best";
function recordBest(r: Result): { best: Best; isNew: boolean } {
  let best: Best = { score: 0, level: 0, wpm: 0 };
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) best = JSON.parse(raw) as Best;
  } catch {}
  const isNew = r.score > best.score;
  const next = { score: Math.max(best.score, r.score), level: Math.max(best.level, r.level), wpm: Math.max(best.wpm, r.wpm) };
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(next));
  } catch {}
  return { best: next, isNew };
}

const tempoFor = (level: number) => 92 + level * 5;

function useMuted(channel: Channel) {
  return useSyncExternalStore(
    subscribeMuted,
    () => readMuted(channel),
    () => false,
  );
}

export function Wordfall() {
  const frameRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [room, setRoomState] = useState<Room>({ ok: true });
  const roomOk = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const wordEls = useRef(new Map<number, HTMLDivElement>());
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const phaseRef = useRef<Phase>("title");
  const snapKey = useRef("");

  const [phase, setPhaseState] = useState<Phase>("title");
  const [snap, setSnap] = useState<Snap | null>(null);
  const [typed, setTypedState] = useState("");
  const typedRef = useRef(""); // mirror for key handlers outside React's render cycle
  const setTyped = useCallback((t: string) => {
    typedRef.current = t;
    setTypedState(t);
  }, []);
  const shakeRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ result: Result; best: Best; isNew: boolean } | null>(null);
  const [helpOpen, setHelpOpenState] = useState(false);
  const helpOpenRef = useRef(false);
  const setHelpOpen = useCallback((open: boolean) => {
    helpOpenRef.current = open;
    setHelpOpenState(open);
  }, []);
  // Leaderboard: who's signed in, this game's ticket, and posting the final score.
  const [player, setPlayerState] = usePlayer();
  const playerRef = useRef<Player | null | undefined>(undefined);
  const setPlayer = useCallback(
    (p: Player | null) => {
      playerRef.current = p;
      setPlayerState(p);
    },
    [setPlayerState],
  );
  useEffect(() => {
    playerRef.current = player;
  }, [player]);
  const runRef = useRef<Promise<string | null> | null>(null);
  const finalRef = useRef<Record<string, number> | null>(null);
  const [post, setPost] = useState<PostState>({ kind: "idle" });
  const [modal, setModalState] = useState<null | "leaderboard" | "auth">(null);
  const modalRef = useRef(false);
  const setModal = useCallback((m: null | "leaderboard" | "auth") => {
    modalRef.current = m !== null;
    setModalState(m);
  }, []);

  const postScore = useCallback(async () => {
    const final = finalRef.current;
    const runId = await runRef.current;
    if (!final || !runId) return setPost({ kind: "error", message: "This game can't be posted. Try the next one." });
    setPost({ kind: "posting" });
    const r = await scores.postScore("wordfall", { ...final, runId });
    if (!r.ok && r.status === 401) {
      // Signed out on the server since the page loaded: offer to sign in again.
      setPlayer(null);
      return setPost({ kind: "signedOut" });
    }
    if (!r.ok) return setPost({ kind: "error", message: r.error });
    setPost({ kind: "posted", week: r.data.week, all: r.data.all });
  }, [setPlayer]);

  const sfxMuted = useMuted("sfx");
  const musicMuted = useMuted("music");

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const audio = () => (audioRef.current ??= new GameAudio());

  const handle = useCallback(
    (events: Event[]) => {
      const a = audioRef.current;
      const e = engineRef.current!;
      for (const ev of events) {
        switch (ev.type) {
          case "clear":
            a?.play("clear", ev.streak - 1);
            break;
          case "wrong":
            a?.play("wrong");
            // Animated in place: re-mounting the input would drop its focus (and close a
            // phone's keyboard) after every wrong word.
            shakeRef.current?.animate(
              [0, -7, 6, -4, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
              { duration: 300, easing: "ease-in-out" },
            );
            break;
          case "land":
            a?.play("land");
            break;
          case "collect":
            a?.play("collect");
            break;
          case "rackFull":
            a?.play("rackFull");
            break;
          case "cast":
            a?.play("power");
            a?.play(ev.kind);
            break;
          case "levelUp":
            a?.play("levelUp");
            a?.setTempo(tempoFor(ev.level));
            setTyped("");
            break;
          case "danger":
            a?.play("danger");
            break;
          case "over": {
            a?.stopMusic();
            a?.play("gameOver");
            const r: Result = {
              score: e.score,
              level: e.level,
              words: e.correct,
              accuracy: e.accuracy(),
              wpm: e.wpm(),
              bestStreak: e.bestStreak,
            };
            setResult({ result: r, ...recordBest(r) });
            setTyped("");
            setPhase("over");
            finalRef.current = {
              score: r.score,
              level: r.level,
              words: r.words,
              wpm: Math.min(300, r.wpm),
              accuracy: r.accuracy,
              durationMs: Math.round(e.playTime * 1000),
            };
            if (playerRef.current) void postScore();
            else setPost({ kind: "signedOut" });
            break;
          }
        }
      }
    },
    [setPhase, setTyped, postScore],
  );

  // A fresh game: new engine, and nothing carried over from the last one (typed text,
  // highlights, card elements, the result screen).
  const start = useCallback(() => {
    const a = audio();
    a.unlock();
    const e = new Engine();
    const board = boardRef.current;
    if (board && roomOk.current) e.resize(board.clientWidth, board.clientHeight);
    engineRef.current = e;
    wordEls.current.clear();
    shakeRef.current?.getAnimations().forEach((an) => an.cancel());
    snapKey.current = "";
    setSnap(snapshot(e));
    setResult(null);
    setTyped("");
    setPost({ kind: "idle" });
    finalRef.current = null;
    // The server's ticket for this game; it bounds what the final score can be.
    runRef.current = scores.startRun("wordfall").then((r) => (r.ok ? r.data.runId : null));
    setPhase("playing");
    a.play("start");
    a.setTempo(tempoFor(1));
    a.startMusic();
    inputRef.current?.focus();
  }, [setPhase, setTyped]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    audioRef.current?.stopMusic();
    setPhase("paused");
  }, [setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused" || !roomOk.current) return;
    const a = audio();
    a.unlock();
    a.startMusic();
    setPhase("playing");
    inputRef.current?.focus();
  }, [setPhase]);

  // Help pauses the game; it stays paused after closing so nothing drops unseen.
  const openHelp = useCallback(() => {
    pause();
    setHelpOpen(true);
  }, [pause, setHelpOpen]);

  const openLeaderboard = useCallback(() => {
    pause();
    setModal("leaderboard");
  }, [pause, setModal]);

  const togglePause = () => (phaseRef.current === "paused" ? resume() : pause());

  const submit = useCallback(
    (text: string) => {
      const e = engineRef.current;
      if (!e || phaseRef.current !== "playing") return;
      handle(e.submit(text));
      setTyped("");
    },
    [handle, setTyped],
  );

  const castSpell = (kind: Spell) => {
    const e = engineRef.current;
    if (!e || phaseRef.current !== "playing") return;
    handle(e.cast(kind));
    inputRef.current?.focus();
  };

  const toggle = (channel: Channel) => {
    const a = audio();
    a.unlock();
    a.setMuted(channel, !a.isMuted(channel));
  };

  // Keys anywhere on the page: start, pause, and typing even if the input lost focus.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (helpOpenRef.current || modalRef.current) return; // a dialog has the keyboard (Esc closes it)
      if (ev.key === "?") {
        ev.preventDefault();
        openHelp();
        return;
      }
      const p = phaseRef.current;
      const inInput = ev.target === inputRef.current;
      const onButton = ev.target instanceof HTMLElement && ev.target.closest("button, a");
      if (!roomOk.current) return; // the "make room" notice is up
      if (p === "title" || p === "over") {
        if (ev.key === "Enter" && !onButton) {
          ev.preventDefault();
          start();
        }
        return;
      }
      if (p === "paused") {
        if ((ev.key === "Enter" || ev.key === "Escape") && !onButton) {
          ev.preventDefault();
          resume();
        }
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        pause();
        return;
      }
      if (inInput || onButton) return; // the input handles its own typing
      if (/^[a-zA-Z]$/.test(ev.key)) {
        ev.preventDefault();
        audioRef.current?.play("key");
        setTyped((typedRef.current + ev.key.toLowerCase()).slice(0, 16));
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        setTyped(typedRef.current.slice(0, -1));
      } else if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        submit(typedRef.current);
      }
    };
    const onHide = () => pause();
    const onVisibility = () => document.hidden && pause();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, pause, resume, submit, setTyped, openHelp]);

  // The game loop.
  useEffect(() => {
    const frameEl = frameRef.current!;
    const board = boardRef.current!;
    const measure = () => {
      const phone = isPhone();
      let next: Room = { ok: true };
      if (phone) {
        if (board.clientHeight < MIN_BOARD_H) next = { ok: false, reason: "short", by: 0, phone };
      } else if (frameEl.clientHeight < BOARD_H - 0.5) {
        next = { ok: false, reason: "short", by: Math.ceil(BOARD_H - frameEl.clientHeight), phone };
      } else if (frameEl.clientWidth < BOARD_W - 0.5) {
        next = { ok: false, reason: "narrow", by: Math.ceil(BOARD_W - frameEl.clientWidth), phone };
      }
      roomOk.current = next.ok;
      setRoomState((prev) =>
        prev.ok === next.ok && (next.ok || (!prev.ok && prev.reason === next.reason && prev.by === next.by))
          ? prev
          : next,
      );
      if (!next.ok) {
        pause();
        return;
      }
      // Fixed on a desktop, so this only ever changes anything on a phone.
      engineRef.current?.resize(board.clientWidth, board.clientHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(frameEl);
    ro.observe(board);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const e = engineRef.current;
      if (!e) return;
      if (phaseRef.current === "playing") handle(e.update(dt));

      for (const w of e.words) {
        const el = wordEls.current.get(w.id);
        if (el) el.style.transform = `translate(${w.x}px, ${w.y}px)`;
      }
      const key = `${e.version}|${e.freezeLeft > 0}|${e.slowLeft > 0}|${e.status}`;
      if (key !== snapKey.current) {
        snapKey.current = key;
        setSnap(snapshot(e));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      // Leaving the page (Next keeps it around hidden): stop the music, pause the game.
      audioRef.current?.stopMusic();
      if (phaseRef.current === "playing") setPhase("paused");
    };
  }, [handle, setPhase, pause]);

  const onChange = (ev: ChangeEvent<HTMLInputElement>) => {
    if (phaseRef.current !== "playing") return;
    const raw = ev.target.value.toLowerCase();
    // Phone keyboards don't always send a Space key event; a space in the text submits.
    if (/\s/.test(raw)) {
      submit(raw.split(/\s/)[0].replace(/[^a-z]/g, ""));
      return;
    }
    const next = raw.replace(/[^a-z]/g, "").slice(0, 16);
    if (next.length > typed.length) audioRef.current?.play("key");
    setTyped(next);
  };
  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    submit(typedRef.current);
  };

  const s = snap;
  const danger = !!s && s.pile >= 75 && phase === "playing";
  const matching = typed.length > 0;

  return (
    <main
      className="flex h-dvh flex-col items-center justify-center overflow-hidden px-3 pt-3 sm:px-6 sm:pt-5 pointer-coarse:justify-start"
      style={{ "--board-w": `${BOARD_W}px`, "--board-h": `${BOARD_H}px` } as CSSProperties}
    >
      <header className="flex w-full max-w-[560px] items-center justify-between gap-3">
        <Link
          href="/games"
          className="-ml-2 rounded-full px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.18em] text-ivory/60 transition-colors hover:bg-ivory/10 hover:text-highlight"
        >
          ← <span className="max-sm:hidden">Mini </span>Games
        </Link>
        <h1 className="font-display text-3xl leading-none sm:text-4xl">Wordfall</h1>
        <div className="flex">
          <span className="max-sm:hidden">
            <IconButton label="Leaderboard" onClick={openLeaderboard}>
              <path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z" strokeLinejoin="round" strokeLinecap="round" />
            </IconButton>
          </span>
          <IconButton label="How to play" onClick={openHelp}>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.6 9.4a2.5 2.5 0 114.2 1.8c-.9.7-1.8 1.2-1.8 2.5" strokeLinecap="round" />
            <circle cx="12" cy="16.9" r=".6" fill="currentColor" />
          </IconButton>
          <IconButton
            label={phase === "paused" ? "Resume" : "Pause"}
            onClick={togglePause}
            disabled={phase !== "playing" && phase !== "paused"}
          >
            {phase === "paused" ? (
              <path d="M8 5.5v13l10-6.5-10-6.5z" fill="currentColor" strokeLinejoin="round" />
            ) : (
              <>
                <rect x="6.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
                <rect x="14" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
              </>
            )}
          </IconButton>
          <SoundToggle label="Sound effects" muted={sfxMuted} onClick={() => toggle("sfx")}>
            <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
            {sfxMuted ? (
              <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
            ) : (
              <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" strokeLinecap="round" />
            )}
          </SoundToggle>
          <SoundToggle label="Music" muted={musicMuted} onClick={() => toggle("music")}>
            <path d="M9 18V6l11-2v12" strokeLinejoin="round" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="17.5" cy="16" r="2.5" />
            {musicMuted && <path d="M3 3l18 18" strokeLinecap="round" />}
          </SoundToggle>
        </div>
      </header>

      {/* HUD */}
      <div className="mt-3 grid w-full max-w-[560px] grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 font-mono text-xs uppercase tracking-[0.14em] text-ivory/60">
        <span>Level {s?.level ?? 1}</span>
        <Meter value={s ? s.cleared / s.quota : 0} color="var(--color-highlight)" label="Words this level" />
        <span className="text-right tabular-nums text-ivory">{(s?.score ?? 0).toLocaleString()}</span>
        <span className={danger ? "text-suit-red" : undefined}>Pile</span>
        <Meter value={s ? s.pile / 100 : 0} color={danger ? "#ef4444" : "rgba(245,239,225,.55)"} label="Pile" pulse={danger} />
        <span className="text-right tabular-nums">
          {s && s.streak > 1 ? <span className="text-highlight">×{s.streak} streak</span> : `${Math.round(s?.pile ?? 0)}%`}
        </span>
      </div>

      {/* Board. On a desktop it's a fixed size inside a frame that shrinks with the window
          (so we can tell when it no longer fits); on a phone it fills the frame. */}
      <div
        ref={frameRef}
        className="relative mt-3 min-h-0 w-full max-w-[560px] flex-1 overflow-hidden rounded-2xl max-h-(--board-h) pointer-coarse:max-h-[720px]"
      >
        <div
          ref={boardRef}
          onPointerDown={() => phase === "playing" && setTimeout(() => inputRef.current?.focus())}
          className={`relative h-(--board-h) w-(--board-w) overflow-hidden rounded-2xl border bg-felt-deep/40 shadow-[inset_0_2px_30px_rgba(0,0,0,.45)] transition-colors pointer-coarse:h-full pointer-coarse:w-full ${
            danger ? "border-red-500/60" : "border-ivory/10"
          }`}
        >
          {/* Freeze / slow tints. */}
          <div
            className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${s?.frozen ? "opacity-100" : "opacity-0"}`}
            style={{ background: "linear-gradient(180deg, rgba(147,197,253,.18), rgba(147,197,253,.05))" }}
          />
          <div
            className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${s?.slowed ? "opacity-100" : "opacity-0"}`}
            style={{ background: "linear-gradient(180deg, rgba(134,239,172,.12), rgba(134,239,172,.03))" }}
          />
          {/* The highest the pile can reach. */}
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-suit-red/40"
            style={{ top: s ? s.limitTop : `${(1 - 0.3) * 100}%` }}
          >
            <span className="absolute right-2 top-1 font-mono text-[10px] uppercase tracking-[0.18em] text-suit-red/60">
              limit
            </span>
          </div>

          {/* The pile: each missed card rests exactly where it landed. */}
          {s?.pileCards.map((c) => (
            <div
              key={c.id}
              className="pointer-events-none absolute left-0 top-0"
              style={{ transform: `translate(${c.x}px, ${c.y}px) rotate(${c.tilt}deg)` }}
            >
              <WordCard text={c.text} kind={c.kind} typed="" dim height={s.pileH} width={c.w} />
            </div>
          ))}

          {/* Falling words. */}
          {s?.words.map((w) => {
            const hit = !w.cleared && matching && w.text.startsWith(typed);
            return (
              <div
                key={w.id}
                ref={(el) => {
                  if (el) wordEls.current.set(w.id, el);
                  else wordEls.current.delete(w.id);
                }}
                className="absolute left-0 top-0 will-change-transform"
                style={{ transform: `translate(${w.x}px, ${w.y}px)`, zIndex: hit ? 2 : 1 }}
              >
                <div className={w.cleared ? "animate-wf-pop" : undefined}>
                  <WordCard text={w.text} kind={w.kind} typed={hit ? typed : ""} rushed={w.rushed} />
                </div>
              </div>
            );
          })}

          {s?.popups.map((p) => (
            <span
              key={p.id}
              className="pointer-events-none absolute animate-wf-float font-mono text-sm font-semibold text-highlight [text-shadow:0_1px_2px_rgba(0,0,0,.6)]"
              style={{ left: p.x, top: p.y }}
            >
              {p.text}
            </span>
          ))}

          {s?.status === "levelUp" && s.levelUp && (
            <div key={s.levelUp.level} className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="animate-wf-banner text-center">
                <p className="font-display text-6xl">Level {s.levelUp.level}</p>
                {s.levelUp.perfect && (
                  <p className="mt-2 font-mono text-sm uppercase tracking-[0.2em] text-highlight">
                    Clean hand · +{s.levelUp.bonus.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {phase === "title" && (
            <Overlay>
              <p className="font-display text-5xl sm:text-6xl">Wordfall</p>
              <p className="mt-3 max-w-xs text-sm text-ivory/75">
                Type a falling word and press <Kbd>Space</Kbd> to clear it. Missed cards stack up at the bottom. If
                the pile reaches the limit line, the game is over.
              </p>
              <p className="mt-3 max-w-xs text-sm text-ivory/75">
                Clear a coloured card to put its spell on your rack. Type the spell&apos;s name to cast it.
              </p>
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-left text-sm">
                {Object.values(SPECIALS).map((p) => (
                  <li key={p.label} className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded text-ivory" style={{ background: p.color }}>
                      {p.suit}
                    </span>
                    <span>
                      <span className="font-mono font-medium lowercase">{p.label}</span>
                      <span className="text-ivory/55"> {p.blurb}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <StartButton onClick={start}>Deal me in</StartButton>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/45 max-sm:hidden">
                or press Enter · Esc pauses
              </p>
              <div className="mt-4 flex gap-5">
                <TextButton onClick={openHelp}>How to play</TextButton>
                <TextButton onClick={openLeaderboard}>Leaderboard</TextButton>
              </div>
            </Overlay>
          )}

          {phase === "paused" && (
            <Overlay>
              <p className="font-display text-5xl">Paused</p>
              <StartButton onClick={resume}>Resume</StartButton>
              <button
                type="button"
                onClick={start}
                className="mt-4 cursor-pointer text-sm text-ivory/70 underline decoration-ivory/30 underline-offset-4 transition-colors hover:text-highlight hover:decoration-highlight"
              >
                Start over
              </button>
              <button
                type="button"
                onClick={openHelp}
                className="mt-4 cursor-pointer text-sm text-ivory/70 underline decoration-ivory/30 underline-offset-4 transition-colors hover:text-highlight hover:decoration-highlight"
              >
                How to play
              </button>
            </Overlay>
          )}

          {phase === "over" && result && (
            <GameOver
              {...result}
              post={post}
              onAgain={start}
              onLeaderboard={() => setModal("leaderboard")}
              onSignIn={() => setModal("auth")}
            />
          )}
        </div>
        {!room.ok && <NoRoom room={room} />}
      </div>

      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Modal open={modal === "leaderboard"} onClose={() => setModal(null)} title="Leaderboard">
        {modal === "leaderboard" && <Leaderboard game="wordfall" player={player} onPlayer={setPlayer} />}
      </Modal>
      <Modal open={modal === "auth"} onClose={() => setModal(null)} title="Post your score" width={420}>
        {modal === "auth" && (
          <AuthForm
            onDone={(p) => {
              setPlayer(p);
              setModal(null);
              void postScore();
            }}
            intro={<p className="mb-4 text-ivory/70">Sign in, or pick a name, to put this game on the leaderboard.</p>}
          />
        )}
      </Modal>

      <SpellRack rack={s?.rack ?? []} typed={phase === "playing" ? typed : ""} onCast={castSpell} />

      {/* Typing line. */}
      <form onSubmit={onSubmit} className="w-full max-w-[560px] pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div ref={shakeRef}>
          <input
            ref={inputRef}
            value={typed}
            onChange={onChange}
            onKeyDown={(ev) => {
              if (ev.key === " ") {
                ev.preventDefault();
                submit(typedRef.current);
              }
            }}
            // Never disabled: Start focuses it within the tap, which is what opens a
            // phone's keyboard. Typing outside play is ignored in onChange.
            aria-disabled={phase !== "playing"}
            aria-label="Type a word"
            placeholder={phase === "playing" ? "type a word, then Space" : ""}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
            className="w-full rounded-xl border-2 border-ivory/20 bg-ivory/[0.06] px-4 py-3 text-center font-mono text-xl tracking-[0.12em] text-ivory outline-none transition-colors placeholder:text-sm placeholder:tracking-normal placeholder:text-ivory/30 focus:border-highlight/70 aria-disabled:opacity-40"
          />
        </div>
      </form>
    </main>
  );
}

/** Collected spells. Type a spell's name (or tap it) to cast it. */
function SpellRack({ rack, typed, onCast }: { rack: Spell[]; typed: string; onCast: (k: Spell) => void }) {
  return (
    <div className="mt-2 flex w-full max-w-[560px] items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ivory/50">Spells</span>
      <ul className="grid flex-1 grid-cols-4 gap-1.5" aria-label="Spell rack">
        {Array.from({ length: RACK_SIZE }, (_, i) => {
          const kind = rack[i];
          if (!kind) {
            return <li key={i} className="h-9 rounded-md border border-dashed border-ivory/15" aria-label="Empty slot" />;
          }
          const p = SPECIALS[kind];
          const name = kind;
          const hit = typed.length > 0 && name.startsWith(typed);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onCast(kind)}
                aria-label={`Cast ${p.label}`}
                className={`flex h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-md font-mono text-[13px] text-ivory shadow-[0_2px_6px_rgba(0,0,0,.35)] transition-transform hover:-translate-y-0.5 sm:text-sm ${
                  hit ? "outline-2 outline-offset-1 outline-highlight" : ""
                }`}
                style={{ background: p.color }}
              >
                <span aria-hidden>{p.suit}</span>
                <span>
                  <span className="text-highlight">{hit ? typed : ""}</span>
                  {name.slice(hit ? typed.length : 0)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WordCard({
  text,
  kind,
  typed,
  rushed,
  dim,
  height = CARD_H,
  width,
}: {
  text: string;
  kind: Kind;
  typed: string;
  rushed?: boolean;
  dim?: boolean;
  height?: number;
  width?: number;
}) {
  const special = kind !== "normal" ? SPECIALS[kind] : null;
  // A missed card on the pile is a faded ghost of itself, so it never reads as typeable.
  if (dim) {
    return (
      <div
        className={`flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border border-ivory/10 bg-ivory/[0.13] font-mono leading-none text-ivory/35 line-through decoration-ivory/25 ${
          height < CARD_H ? "" : "text-[15px] min-[360px]:text-base"
        }`}
        // Flatter on a short phone board (see Engine.pileH).
        style={{ height, width, fontSize: height < CARD_H ? Math.max(9, Math.round(height * 0.55)) : undefined }}
      >
        {special && <span aria-hidden>{special.suit}</span>}
        <span>{text}</span>
      </div>
    );
  }
  return (
    <div
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 font-mono text-[15px] leading-none shadow-[0_3px_8px_rgba(0,0,0,.4)] min-[360px]:text-base ${
        special ? "text-ivory" : "bg-ivory text-ink"
      } ${typed ? "outline-2 outline-offset-1 outline-highlight" : ""} ${rushed ? "ring-[3px] ring-red-500" : ""}`}
      style={{ height: CARD_H, background: special?.color }}
    >
      {special && <span aria-hidden>{special.suit}</span>}
      <span>
        <span className={special ? "text-highlight" : "text-suit-red"}>{typed}</span>
        {text.slice(typed.length)}
      </span>
    </div>
  );
}

function Meter({ value, color, label, pulse }: { value: number; color: string; label: string; pulse?: boolean }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 overflow-hidden rounded-full bg-ivory/10 ${pulse ? "animate-pulse" : ""}`}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(1, value) * 100}%`, background: color }} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:text-highlight focus-visible:outline-2 focus-visible:outline-highlight disabled:cursor-default disabled:opacity-30 disabled:hover:text-ivory/60 sm:size-9"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function SoundToggle({ label, muted, onClick, children }: { label: string; muted: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!muted}
      aria-label={`${label} ${muted ? "off" : "on"}`}
      title={label}
      className="grid size-8 cursor-pointer place-items-center rounded-full text-ivory/60 transition-colors hover:text-highlight focus-visible:outline-2 focus-visible:outline-highlight sm:size-9"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** Shown over the board when the window can't fit it. The game stays paused meanwhile. */
function NoRoom({ room }: { room: Extract<Room, { ok: false }> }) {
  const [title, body] = room.phone
    ? ["Not enough room", "Turn your phone upright to keep playing."]
    : room.reason === "short"
      ? ["Window too short", `Make the window ${room.by}px taller, or zoom out, to keep playing.`]
      : ["Window too narrow", `Make the window ${room.by}px wider, or zoom out, to keep playing.`];
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-felt-deep/90 px-6 text-center backdrop-blur-[3px]">
      <p className="font-display text-3xl sm:text-4xl">{title}</p>
      <p className="mt-2 max-w-xs text-sm text-ivory/75">{body}</p>
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-felt-deep/75 px-6 py-4 text-center backdrop-blur-[3px]">
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

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ivory/30 bg-ivory/10 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-sm text-ivory/70 underline decoration-ivory/30 underline-offset-4 transition-colors hover:text-highlight hover:decoration-highlight"
    >
      {children}
    </button>
  );
}

function PostStatus({ post, score, onSignIn }: { post: PostState; score: number; onSignIn: () => void }) {
  const line = "mt-3 text-sm";
  switch (post.kind) {
    case "idle":
      return null;
    case "signedOut":
      return (
        <button
          type="button"
          onClick={onSignIn}
          className="mt-3 cursor-pointer rounded-full border border-ivory/30 px-4 py-1.5 text-sm text-ivory transition-colors hover:border-highlight hover:text-highlight"
        >
          Sign in to post this score
        </button>
      );
    case "posting":
      return <p className={`${line} text-ivory/60`}>Posting to the leaderboard…</p>;
    case "error":
      return <p className={`${line} text-red-300`}>{post.message}</p>;
    case "posted": {
      const place = (s: Standing, label: string) =>
        s ? (s.score === score ? `#${s.rank} ${label}` : `best ${label} still #${s.rank}`) : null;
      const parts = [place(post.week, "this week"), place(post.all, "all time")].filter(Boolean);
      return <p className={`${line} text-highlight`}>Posted · {parts.join(" · ")}</p>;
    }
  }
}

function GameOver({
  result,
  best,
  isNew,
  post,
  onAgain,
  onLeaderboard,
  onSignIn,
}: {
  result: Result;
  best: Best;
  isNew: boolean;
  post: PostState;
  onAgain: () => void;
  onLeaderboard: () => void;
  onSignIn: () => void;
}) {
  const rank = rankFor(result.score);
  const stats: [string, string][] = [
    ["Level", String(result.level)],
    ["Words", String(result.words)],
    ["Accuracy", `${result.accuracy}%`],
    ["Speed", `${result.wpm} wpm`],
    ["Best streak", String(result.bestStreak)],
    ["Best score", best.score.toLocaleString()],
  ];
  return (
    <Overlay>
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-ivory/55">Game over</p>
      {/* The rank, as a playing card. */}
      <div className="relative mt-3 flex aspect-[5/7] w-20 -rotate-3 flex-col items-center justify-center rounded-lg bg-ivory text-suit-red shadow-[4px_10px_20px_rgba(0,0,0,.45)]">
        <span className="absolute left-1.5 top-1 font-mono text-xs font-semibold">{rank.short}</span>
        <span className="font-display text-4xl leading-none">{rank.short}</span>
        <span className="text-xl">♥</span>
        <span className="absolute bottom-1 right-1.5 rotate-180 font-mono text-xs font-semibold">{rank.short}</span>
      </div>
      <p className="mt-3 font-display text-3xl">
        {rank.name} of Hearts{isNew && <span className="ml-2 align-middle font-mono text-xs uppercase tracking-[0.2em] text-highlight">new best</span>}
      </p>
      <p className="mt-1 font-mono text-2xl tabular-nums">{result.score.toLocaleString()}</p>
      <dl className="mt-4 grid grid-cols-3 gap-x-5 gap-y-2 text-sm">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ivory/50">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {rank.next && (
        <p className="mt-3 text-xs text-ivory/50">{(rank.next - result.score).toLocaleString()} more for the next rank</p>
      )}
      <PostStatus post={post} score={result.score} onSignIn={onSignIn} />
      <StartButton onClick={onAgain}>Deal again</StartButton>
      <div className="mt-3">
        <TextButton onClick={onLeaderboard}>Leaderboard</TextButton>
      </div>
    </Overlay>
  );
}
