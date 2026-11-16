"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

// Sound effects by oxidvideos (Pixabay). Files live in public/sounds.
const FILES = {
  shuffle: "/sounds/shuffle.mp3",
  place: "/sounds/place.mp3",
  take1: "/sounds/take-1.mp3",
  take2: "/sounds/take-2.mp3",
  take3: "/sounds/take-3.mp3",
} as const;
type FileName = keyof typeof FILES;
export type SoundName = Exclude<FileName, `take${number}`> | "take";
const TAKES: FileName[] = ["take1", "take2", "take3"];

// Mute preference: persisted per browser when storage is available, in memory otherwise.
const MUTE_KEY = "card-sounds-muted";
let mutedInMemory = false;
const listeners = new Set<() => void>();
const readMuted = () => {
  try {
    const stored = localStorage.getItem(MUTE_KEY);
    if (stored !== null) return stored === "1";
  } catch {}
  return mutedInMemory;
};
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

export function useCardSounds() {
  const ctx = useRef<AudioContext | null>(null);
  const buffers = useRef<Partial<Record<FileName, AudioBuffer>>>({});
  const muted = useSyncExternalStore(subscribe, readMuted, () => false);

  // Decode up front with an OfflineAudioContext: no live AudioContext (which browsers
  // block before a user gesture) is needed until the first click.
  useEffect(() => {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    let cancelled = false;
    for (const [name, url] of Object.entries(FILES) as [FileName, string][]) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => decoder.decodeAudioData(data))
        .then((buf) => {
          if (!cancelled) buffers.current[name] = buf;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  /** Call from a click handler: creates/resumes the audio context inside the gesture. */
  const unlock = useCallback(() => {
    ctx.current ??= new AudioContext();
    if (ctx.current.state === "suspended") ctx.current.resume().catch(() => {});
  }, []);

  /** Play a sound `delay` seconds from now. Slight pitch variance keeps repeats natural. */
  const play = useCallback((name: SoundName, delay = 0, volume = 0.7) => {
    const audio = ctx.current;
    if (!audio || readMuted()) return;
    const file = name === "take" ? TAKES[Math.floor(Math.random() * TAKES.length)] : name;
    const buffer = buffers.current[file];
    if (!buffer) return;
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = audio.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(audio.destination);
    src.start(audio.currentTime + Math.max(0, delay));
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !readMuted();
    mutedInMemory = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {}
    listeners.forEach((l) => l());
  }, []);

  return { play, unlock, muted, toggleMuted };
}
