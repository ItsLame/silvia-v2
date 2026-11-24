// Every sound in Wordfall is synthesised with the Web Audio API: no files to load and
// nothing to license. One AudioContext, with separate buses for effects and music so
// each can be muted on its own.

export type Sfx =
  | "key"
  | "clear"
  | "wrong"
  | "land"
  | "power"
  | "collect"
  | "rackFull"
  | "wipe"
  | "ice"
  | "slow"
  | "mend"
  | "levelUp"
  | "danger"
  | "gameOver"
  | "start";

const PREFS = { sfx: "wordfall:sfx-muted", music: "wordfall:music-muted" } as const;
export type Channel = keyof typeof PREFS;

export function readMuted(channel: Channel) {
  try {
    return localStorage.getItem(PREFS[channel]) === "1";
  } catch {
    return false;
  }
}

// Lets React read the mute switches with useSyncExternalStore.
const listeners = new Set<() => void>();
export function subscribeMuted(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function writeMuted(channel: Channel, muted: boolean) {
  try {
    localStorage.setItem(PREFS[channel], muted ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

// A minor pentatonic, used for word clears: each clear in a streak steps up the scale.
const PENTATONIC = [0, 3, 5, 7, 10];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// Music: an eight-bar lounge progression in A minor, one chord per bar.
// [root note (MIDI), chord tones as semitones above the root]
const CHORDS: [number, number[]][] = [
  [45, [0, 3, 7, 10]], // Am7
  [50, [0, 4, 7, 10, 14]], // D9
  [43, [0, 4, 7, 11]], // Gmaj7
  [48, [0, 4, 7, 11]], // Cmaj7
  [41, [0, 4, 7, 11]], // Fmaj7
  [47, [0, 3, 6, 10]], // Bm7b5
  [40, [0, 4, 7, 10, 13]], // E7b9
  [45, [0, 3, 7, 10]], // Am7
];
// Walking bass per bar, as semitones from the chord root (four beats).
const WALK = [
  [0, 7, 10, 7],
  [0, 4, 7, 4],
  [0, 7, 4, 2],
  [0, 4, 7, 9],
  [0, 7, 4, 7],
  [0, 3, 6, 3],
  [0, 4, 7, 8],
  [0, 7, 3, 2],
];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private muted = { sfx: false, music: false };

  private musicOn = false;
  private tempo = 100;
  private nextBeat = 0; // AudioContext time of the next eighth note
  private step = 0; // eighth notes since the music started
  private scheduler: number | null = null;

  constructor() {
    this.muted = { sfx: readMuted("sfx"), music: readMuted("music") };
  }

  /** Must run inside a user gesture (key press or click) the first time. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      // A gentle limiter so stacked effects never clip.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.gain.value = this.muted.sfx ? 0 : 0.8;
      this.musicBus.gain.value = this.muted.music ? 0 : 0.32;
      this.sfxBus.connect(master);
      this.musicBus.connect(master);
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  isMuted(channel: Channel) {
    return this.muted[channel];
  }

  setMuted(channel: Channel, muted: boolean) {
    this.muted[channel] = muted;
    writeMuted(channel, muted);
    if (!this.ctx) return;
    const bus = channel === "sfx" ? this.sfxBus : this.musicBus;
    bus.gain.setTargetAtTime(muted ? 0 : channel === "sfx" ? 0.8 : 0.32, this.ctx.currentTime, 0.05);
  }

  // ——— Building blocks ———

  private tone(
    freq: number,
    at: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; glide?: number; attack?: number; bus?: GainNode; detune?: number } = {},
  ) {
    const ctx = this.ctx!;
    const { type = "triangle", gain = 0.2, glide, attack = 0.005, bus = this.sfxBus, detune = 0 } = opts;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    osc.detune.value = detune;
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noise(
    at: number,
    dur: number,
    opts: { gain?: number; type?: BiquadFilterType; freq?: number; sweepTo?: number; q?: number; bus?: GainNode } = {},
  ) {
    const ctx = this.ctx!;
    const { gain = 0.2, type = "lowpass", freq = 1000, sweepTo, q = 1, bus = this.sfxBus } = opts;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, at);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(env).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  // ——— Effects ———

  /** `streak` raises the pitch of word clears so a run of hits climbs a scale. */
  play(name: Sfx, streak = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted.sfx) return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case "key":
        this.noise(t, 0.025, { gain: 0.06, type: "highpass", freq: 3500 });
        this.tone(1400 + Math.random() * 300, t, 0.02, { type: "sine", gain: 0.025 });
        break;
      case "clear": {
        const n = Math.min(streak, 14);
        const note = 72 + 12 * Math.floor(n / 5) + PENTATONIC[n % 5];
        this.tone(midi(note), t, 0.18, { gain: 0.16 });
        this.tone(midi(note + 7), t + 0.06, 0.22, { gain: 0.12 });
        this.noise(t, 0.05, { gain: 0.05, type: "bandpass", freq: 5000, q: 2 }); // card snap
        break;
      }
      case "wrong":
        this.tone(150, t, 0.2, { type: "sawtooth", gain: 0.09, glide: 85 });
        this.tone(155, t, 0.2, { type: "square", gain: 0.04, glide: 90 });
        break;
      case "land":
        this.tone(130, t, 0.14, { type: "sine", gain: 0.3, glide: 55 });
        this.noise(t, 0.07, { gain: 0.12, freq: 900 });
        break;
      case "power":
        [0, 4, 7, 12].forEach((s, i) => this.tone(midi(76 + s), t + i * 0.05, 0.14, { type: "square", gain: 0.05 }));
        break;
      case "collect":
        // A card flicked onto the rack: a quick whoosh and a bright two-note pickup.
        this.noise(t, 0.12, { gain: 0.08, type: "bandpass", freq: 1200, sweepTo: 4000, q: 2 });
        this.tone(midi(84), t + 0.04, 0.12, { type: "square", gain: 0.05 });
        this.tone(midi(91), t + 0.1, 0.18, { type: "square", gain: 0.05 });
        break;
      case "rackFull":
        this.tone(midi(64), t, 0.12, { type: "triangle", gain: 0.1 });
        this.tone(midi(60), t + 0.1, 0.16, { type: "triangle", gain: 0.1 });
        break;
      case "wipe":
        this.noise(t, 0.5, { gain: 0.25, type: "bandpass", freq: 300, sweepTo: 5000, q: 1.5 });
        this.tone(90, t, 0.35, { type: "sine", gain: 0.3, glide: 40 });
        break;
      case "ice":
        for (let i = 0; i < 6; i++) {
          this.tone(midi(88 + PENTATONIC[i % 5]), t + i * 0.04, 0.5, { type: "sine", gain: 0.05, detune: Math.random() * 20 });
        }
        this.noise(t, 0.6, { gain: 0.05, type: "highpass", freq: 6000 });
        break;
      case "slow":
        this.tone(midi(79), t, 0.6, { type: "triangle", gain: 0.12, glide: midi(67) });
        this.tone(midi(72), t, 0.6, { type: "sine", gain: 0.08, glide: midi(60) });
        break;
      case "mend":
        [0, 4, 7, 11, 14].forEach((s, i) => this.tone(midi(67 + s), t + i * 0.06, 0.5, { type: "sine", gain: 0.08 }));
        break;
      case "levelUp":
        [0, 4, 7, 12].forEach((s, i) => this.tone(midi(72 + s), t + i * 0.09, 0.22, { gain: 0.14 }));
        [0, 4, 7, 12].forEach((s) => this.tone(midi(72 + s), t + 0.4, 0.7, { type: "sine", gain: 0.07 }));
        break;
      case "danger":
        this.tone(880, t, 0.07, { type: "square", gain: 0.04 });
        this.tone(880, t + 0.12, 0.07, { type: "square", gain: 0.04 });
        break;
      case "gameOver":
        [67, 64, 60, 55].forEach((n, i) => this.tone(midi(n), t + i * 0.22, 0.5, { gain: 0.14 }));
        this.tone(midi(43), t + 0.9, 1.2, { type: "sine", gain: 0.12 });
        break;
      case "start":
        this.tone(midi(69), t, 0.12, { gain: 0.12 });
        this.tone(midi(76), t + 0.1, 0.25, { gain: 0.12 });
        break;
    }
  }

  // ——— Music ———

  /** Faster as the levels go up. */
  setTempo(bpm: number) {
    this.tempo = Math.min(150, Math.max(70, bpm));
  }

  startMusic() {
    const ctx = this.ctx;
    if (!ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextBeat = ctx.currentTime + 0.1;
    // Look-ahead scheduling: every 25 ms, queue whatever falls in the next 120 ms.
    this.scheduler = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.scheduler !== null) clearInterval(this.scheduler);
    this.scheduler = null;
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextBeat < ctx.currentTime + 0.12) {
      this.playEighth(this.step, this.nextBeat);
      // Swing: long-short eighths.
      const beat = 60 / this.tempo;
      this.nextBeat += this.step % 2 === 0 ? beat * 0.6 : beat * 0.4;
      this.step++;
    }
  }

  private playEighth(step: number, at: number) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 8) % CHORDS.length;
    const eighth = step % 8;
    const beat = Math.floor(eighth / 2);
    const [root, tones] = CHORDS[bar];
    const beatLen = 60 / this.tempo;

    // Brushed hats on every eighth, accent on the off-beats.
    this.noise(at, 0.04, { gain: eighth % 2 ? 0.07 : 0.035, type: "highpass", freq: 7000, bus });
    // Soft kick on 1 and 3, a rim on 2 and 4.
    if (eighth === 0 || eighth === 4) this.tone(95, at, 0.18, { type: "sine", gain: 0.35, glide: 45, bus });
    if (eighth === 2 || eighth === 6) this.noise(at, 0.06, { gain: 0.08, type: "bandpass", freq: 1800, q: 3, bus });

    // Walking bass on the beat.
    if (eighth % 2 === 0) {
      this.tone(midi(root - 12 + WALK[bar][beat]), at, beatLen * 0.9, { type: "triangle", gain: 0.32, bus, attack: 0.01 });
    }

    // Electric-piano stabs: "and" of 2 and the "and" of 4, plus a longer chord on 1
    // every other bar.
    const stab = (len: number, gain: number) =>
      tones.slice(1).forEach((s, i) =>
        this.tone(midi(root + 12 + s), at + i * 0.008, len, { type: "sine", gain, bus, attack: 0.008, detune: (i - 1) * 4 }),
      );
    if (eighth === 3 || eighth === 7) stab(beatLen * 0.45, 0.05);
    if (eighth === 0 && bar % 2 === 0) stab(beatLen * 1.8, 0.035);
  }
}
