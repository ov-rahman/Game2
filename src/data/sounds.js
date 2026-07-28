/**
 * Sound design as pure data.
 *
 * Every sound in the game is synthesised at runtime from these descriptions —
 * there is not a single audio file in the project. The core emits sound ids;
 * the platform audio adapter turns a description into oscillators and envelopes.
 *
 * Layer schema:
 *   type    'osc' | 'noise'
 *   wave    'sine' | 'square' | 'sawtooth' | 'triangle'   (osc only)
 *   f0,f1   start/end frequency in Hz (f1 defaults to f0)
 *   curve   'exp' | 'lin'  frequency glide shape
 *   dur     layer length in seconds
 *   delay   start offset in seconds
 *   a,d     attack / decay seconds (a+d may exceed dur; dur wins)
 *   gain    layer gain multiplier
 *   filter  { type, f, f1, q }  biquad with optional frequency sweep
 *   fm      { ratio, index } simple frequency-modulation for metallic timbres
 *   rep     { times, every, detune } repeat the layer (cheap arpeggio/rattle)
 */

export const SOUNDS = {
  // ---- player ----------------------------------------------------------
  shoot: {
    gain: 0.2,
    vary: { rate: 0.06 },
    layers: [
      { type: 'osc', wave: 'square', f0: 660, f1: 210, curve: 'exp', dur: 0.1, a: 0.001, d: 0.09, gain: 0.7 },
      { type: 'noise', dur: 0.035, a: 0.001, d: 0.03, gain: 0.22, filter: { type: 'highpass', f: 1500 } },
    ],
  },
  shootHeavy: {
    gain: 0.28,
    vary: { rate: 0.05 },
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 320, f1: 90, curve: 'exp', dur: 0.18, a: 0.002, d: 0.16, gain: 0.8, filter: { type: 'lowpass', f: 2200, f1: 500 } },
      { type: 'noise', dur: 0.06, a: 0.001, d: 0.05, gain: 0.3, filter: { type: 'bandpass', f: 900, q: 1.2 } },
    ],
  },
  shootLaser: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 1400, f1: 300, curve: 'exp', dur: 0.22, a: 0.001, d: 0.2, gain: 0.5, filter: { type: 'bandpass', f: 1800, f1: 400, q: 4 } },
      { type: 'osc', wave: 'sine', f0: 2600, f1: 700, curve: 'exp', dur: 0.16, a: 0.001, d: 0.15, gain: 0.25 },
    ],
  },
  hit: {
    gain: 0.24,
    vary: { rate: 0.1 },
    layers: [
      { type: 'noise', dur: 0.07, a: 0.001, d: 0.06, gain: 0.5, filter: { type: 'bandpass', f: 1400, f1: 500, q: 1.4 } },
      { type: 'osc', wave: 'triangle', f0: 260, f1: 120, curve: 'exp', dur: 0.08, a: 0.001, d: 0.07, gain: 0.4 },
    ],
  },
  crit: {
    gain: 0.3,
    layers: [
      { type: 'osc', wave: 'square', f0: 900, f1: 1500, curve: 'exp', dur: 0.07, a: 0.001, d: 0.06, gain: 0.35 },
      { type: 'noise', dur: 0.11, a: 0.001, d: 0.1, gain: 0.5, filter: { type: 'highpass', f: 2000 } },
    ],
  },
  hurt: {
    gain: 0.36,
    layers: [
      { type: 'osc', wave: 'square', f0: 190, f1: 70, curve: 'exp', dur: 0.26, a: 0.002, d: 0.24, gain: 0.7, filter: { type: 'lowpass', f: 1400 } },
      { type: 'noise', dur: 0.12, a: 0.001, d: 0.11, gain: 0.4, filter: { type: 'lowpass', f: 900 } },
    ],
  },
  death: {
    gain: 0.42,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 300, f1: 40, curve: 'exp', dur: 1.1, a: 0.01, d: 1.05, gain: 0.6, filter: { type: 'lowpass', f: 1800, f1: 200 } },
      { type: 'noise', dur: 0.7, a: 0.02, d: 0.65, gain: 0.35, filter: { type: 'lowpass', f: 700 } },
    ],
  },
  enemyDie: {
    gain: 0.26,
    vary: { rate: 0.12 },
    layers: [
      { type: 'noise', dur: 0.2, a: 0.001, d: 0.19, gain: 0.55, filter: { type: 'lowpass', f: 1600, f1: 300 } },
      { type: 'osc', wave: 'triangle', f0: 220, f1: 60, curve: 'exp', dur: 0.22, a: 0.001, d: 0.2, gain: 0.4 },
    ],
  },
  enemyShoot: {
    gain: 0.16,
    vary: { rate: 0.08 },
    layers: [
      { type: 'osc', wave: 'triangle', f0: 300, f1: 520, curve: 'exp', dur: 0.12, a: 0.002, d: 0.11, gain: 0.6 },
      { type: 'noise', dur: 0.03, a: 0.001, d: 0.028, gain: 0.16, filter: { type: 'bandpass', f: 800, q: 2 } },
    ],
  },
  explode: {
    gain: 0.5,
    layers: [
      { type: 'noise', dur: 0.55, a: 0.002, d: 0.5, gain: 0.8, filter: { type: 'lowpass', f: 2400, f1: 160 } },
      { type: 'osc', wave: 'sine', f0: 150, f1: 32, curve: 'exp', dur: 0.5, a: 0.002, d: 0.48, gain: 0.7 },
      { type: 'noise', delay: 0.02, dur: 0.14, a: 0.001, d: 0.13, gain: 0.35, filter: { type: 'highpass', f: 2600 } },
    ],
  },
  fuse: {
    gain: 0.12,
    layers: [{ type: 'noise', dur: 0.05, a: 0.001, d: 0.045, gain: 0.4, filter: { type: 'bandpass', f: 4200, q: 3 } }],
  },
  dash: {
    gain: 0.22,
    layers: [
      { type: 'noise', dur: 0.22, a: 0.005, d: 0.2, gain: 0.5, filter: { type: 'bandpass', f: 700, f1: 2600, q: 0.9 } },
    ],
  },

  // ---- pickups & progression -------------------------------------------
  coin: {
    gain: 0.22,
    layers: [
      { type: 'osc', wave: 'square', f0: 990, dur: 0.05, a: 0.001, d: 0.045, gain: 0.4 },
      { type: 'osc', wave: 'square', f0: 1480, delay: 0.045, dur: 0.13, a: 0.001, d: 0.12, gain: 0.35 },
    ],
  },
  pickup: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 520, f1: 1040, curve: 'exp', dur: 0.14, a: 0.002, d: 0.13, gain: 0.5 },
      { type: 'osc', wave: 'sine', f0: 1560, delay: 0.06, dur: 0.18, a: 0.002, d: 0.17, gain: 0.25 },
    ],
  },
  heart: {
    gain: 0.28,
    layers: [
      { type: 'osc', wave: 'sine', f0: 660, f1: 880, curve: 'exp', dur: 0.16, a: 0.005, d: 0.15, gain: 0.5 },
      { type: 'osc', wave: 'sine', f0: 1320, delay: 0.08, dur: 0.2, a: 0.005, d: 0.19, gain: 0.28 },
    ],
  },
  item: {
    gain: 0.34,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 523, dur: 0.5, a: 0.005, d: 0.45, gain: 0.4 },
      { type: 'osc', wave: 'triangle', f0: 659, delay: 0.09, dur: 0.5, a: 0.005, d: 0.45, gain: 0.35 },
      { type: 'osc', wave: 'triangle', f0: 784, delay: 0.18, dur: 0.6, a: 0.005, d: 0.55, gain: 0.32 },
      { type: 'osc', wave: 'sine', f0: 1046, delay: 0.27, dur: 0.8, a: 0.01, d: 0.75, gain: 0.28 },
    ],
  },
  synergy: {
    gain: 0.4,
    layers: [
      { type: 'osc', wave: 'square', f0: 392, dur: 0.7, a: 0.01, d: 0.65, gain: 0.3, filter: { type: 'lowpass', f: 3000 } },
      { type: 'osc', wave: 'square', f0: 587, delay: 0.07, dur: 0.7, a: 0.01, d: 0.62, gain: 0.28 },
      { type: 'osc', wave: 'square', f0: 784, delay: 0.14, dur: 0.8, a: 0.01, d: 0.7, gain: 0.26 },
      { type: 'osc', wave: 'sine', f0: 1568, delay: 0.2, dur: 1.0, a: 0.02, d: 0.95, gain: 0.2 },
    ],
  },
  doorOpen: {
    gain: 0.3,
    layers: [
      { type: 'noise', dur: 0.5, a: 0.02, d: 0.46, gain: 0.5, filter: { type: 'lowpass', f: 700, f1: 220 } },
      { type: 'osc', wave: 'sine', f0: 90, f1: 55, curve: 'exp', dur: 0.4, a: 0.01, d: 0.38, gain: 0.5 },
    ],
  },
  doorLocked: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'square', f0: 150, f1: 110, curve: 'exp', dur: 0.1, a: 0.001, d: 0.09, gain: 0.4 },
      { type: 'noise', dur: 0.06, a: 0.001, d: 0.05, gain: 0.3, filter: { type: 'bandpass', f: 2200, q: 3 } },
    ],
  },
  unlock: {
    gain: 0.3,
    layers: [
      { type: 'noise', dur: 0.09, a: 0.001, d: 0.08, gain: 0.4, filter: { type: 'bandpass', f: 3000, q: 4 } },
      { type: 'osc', wave: 'square', f0: 740, f1: 1180, curve: 'exp', dur: 0.14, a: 0.002, d: 0.13, gain: 0.3 },
    ],
  },
  stairs: {
    gain: 0.4,
    layers: [
      { type: 'osc', wave: 'sine', f0: 330, f1: 110, curve: 'exp', dur: 1.4, a: 0.02, d: 1.35, gain: 0.5 },
      { type: 'osc', wave: 'triangle', f0: 165, f1: 55, curve: 'exp', dur: 1.6, a: 0.05, d: 1.5, gain: 0.4 },
      { type: 'noise', dur: 1.2, a: 0.3, d: 0.9, gain: 0.2, filter: { type: 'lowpass', f: 600, f1: 120 } },
    ],
  },
  roomClear: {
    gain: 0.3,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 440, dur: 0.2, a: 0.004, d: 0.18, gain: 0.35 },
      { type: 'osc', wave: 'triangle', f0: 660, delay: 0.1, dur: 0.3, a: 0.004, d: 0.28, gain: 0.3 },
    ],
  },
  select: {
    gain: 0.18,
    layers: [{ type: 'osc', wave: 'square', f0: 780, dur: 0.05, a: 0.001, d: 0.045, gain: 0.3 }],
  },
  confirm: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'square', f0: 620, dur: 0.06, a: 0.001, d: 0.055, gain: 0.3 },
      { type: 'osc', wave: 'square', f0: 930, delay: 0.05, dur: 0.12, a: 0.001, d: 0.11, gain: 0.28 },
    ],
  },
  deny: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'square', f0: 260, f1: 150, curve: 'exp', dur: 0.16, a: 0.002, d: 0.15, gain: 0.35 },
    ],
  },

  // ---- elemental / status ----------------------------------------------
  fire: {
    gain: 0.2,
    layers: [{ type: 'noise', dur: 0.35, a: 0.02, d: 0.32, gain: 0.5, filter: { type: 'bandpass', f: 900, f1: 300, q: 0.8 } }],
  },
  ice: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'sine', f0: 2400, f1: 1400, curve: 'exp', dur: 0.3, a: 0.002, d: 0.28, gain: 0.3 },
      { type: 'noise', dur: 0.18, a: 0.001, d: 0.17, gain: 0.3, filter: { type: 'highpass', f: 3400 } },
    ],
  },
  shock: {
    gain: 0.24,
    layers: [
      { type: 'noise', dur: 0.14, a: 0.001, d: 0.13, gain: 0.6, filter: { type: 'highpass', f: 2200 }, rep: { times: 3, every: 0.035 } },
      { type: 'osc', wave: 'square', f0: 1800, f1: 400, curve: 'exp', dur: 0.1, a: 0.001, d: 0.09, gain: 0.2 },
    ],
  },
  poison: {
    gain: 0.18,
    layers: [
      { type: 'osc', wave: 'sine', f0: 180, f1: 120, curve: 'exp', dur: 0.3, a: 0.02, d: 0.28, gain: 0.4, fm: { ratio: 3.1, index: 60 } },
    ],
  },
  charge: {
    gain: 0.2,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 120, f1: 900, curve: 'exp', dur: 0.7, a: 0.1, d: 0.6, gain: 0.3, filter: { type: 'lowpass', f: 400, f1: 3000 } },
    ],
  },
  teleport: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'sine', f0: 1200, f1: 200, curve: 'exp', dur: 0.25, a: 0.002, d: 0.24, gain: 0.35, fm: { ratio: 1.5, index: 300 } },
      { type: 'noise', dur: 0.2, a: 0.002, d: 0.19, gain: 0.25, filter: { type: 'bandpass', f: 2000, f1: 400, q: 2 } },
    ],
  },
  spawn: {
    gain: 0.22,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 90, f1: 300, curve: 'exp', dur: 0.3, a: 0.01, d: 0.28, gain: 0.4 },
      { type: 'noise', dur: 0.25, a: 0.02, d: 0.22, gain: 0.25, filter: { type: 'lowpass', f: 1200 } },
    ],
  },
  block: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'square', f0: 420, f1: 300, curve: 'exp', dur: 0.09, a: 0.001, d: 0.08, gain: 0.35, fm: { ratio: 2.7, index: 200 } },
      { type: 'noise', dur: 0.07, a: 0.001, d: 0.06, gain: 0.3, filter: { type: 'bandpass', f: 3200, q: 2 } },
    ],
  },
  rockBreak: {
    gain: 0.3,
    layers: [
      { type: 'noise', dur: 0.22, a: 0.001, d: 0.2, gain: 0.6, filter: { type: 'lowpass', f: 1800, f1: 400 } },
    ],
  },

  // ---- bosses -----------------------------------------------------------
  bossRoar: {
    gain: 0.5,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 70, f1: 130, curve: 'exp', dur: 1.5, a: 0.15, d: 1.3, gain: 0.55, filter: { type: 'lowpass', f: 900, f1: 2200 }, fm: { ratio: 0.5, index: 40 } },
      { type: 'noise', dur: 1.4, a: 0.2, d: 1.2, gain: 0.3, filter: { type: 'bandpass', f: 500, f1: 1400, q: 0.7 } },
    ],
  },
  bossHurt: {
    gain: 0.3,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 160, f1: 90, curve: 'exp', dur: 0.3, a: 0.005, d: 0.28, gain: 0.4, filter: { type: 'lowpass', f: 1200 } },
      { type: 'noise', dur: 0.12, a: 0.001, d: 0.11, gain: 0.3, filter: { type: 'bandpass', f: 700, q: 1 } },
    ],
  },
  bossDie: {
    gain: 0.6,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 200, f1: 28, curve: 'exp', dur: 2.4, a: 0.05, d: 2.3, gain: 0.6, filter: { type: 'lowpass', f: 1600, f1: 120 } },
      { type: 'noise', dur: 2.0, a: 0.1, d: 1.9, gain: 0.4, filter: { type: 'lowpass', f: 900, f1: 100 } },
      { type: 'noise', delay: 0.4, dur: 0.8, a: 0.01, d: 0.75, gain: 0.3, filter: { type: 'highpass', f: 1800 } },
    ],
  },
  bossSlam: {
    gain: 0.5,
    layers: [
      { type: 'osc', wave: 'sine', f0: 110, f1: 30, curve: 'exp', dur: 0.6, a: 0.002, d: 0.58, gain: 0.8 },
      { type: 'noise', dur: 0.35, a: 0.001, d: 0.33, gain: 0.5, filter: { type: 'lowpass', f: 1400, f1: 200 } },
    ],
  },
  bossBeam: {
    gain: 0.34,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 200, f1: 260, curve: 'lin', dur: 0.9, a: 0.05, d: 0.8, gain: 0.4, filter: { type: 'bandpass', f: 1200, f1: 2600, q: 3 }, fm: { ratio: 2.01, index: 120 } },
    ],
  },
  win: {
    gain: 0.45,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 523, dur: 0.3, a: 0.005, d: 0.28, gain: 0.4 },
      { type: 'osc', wave: 'triangle', f0: 659, delay: 0.16, dur: 0.3, a: 0.005, d: 0.28, gain: 0.4 },
      { type: 'osc', wave: 'triangle', f0: 784, delay: 0.32, dur: 0.3, a: 0.005, d: 0.28, gain: 0.4 },
      { type: 'osc', wave: 'triangle', f0: 1046, delay: 0.48, dur: 1.2, a: 0.01, d: 1.1, gain: 0.45 },
      { type: 'osc', wave: 'sine', f0: 1568, delay: 0.48, dur: 1.4, a: 0.02, d: 1.3, gain: 0.25 },
    ],
  },
};

/**
 * Procedural music tracks. The adapter walks these patterns bar by bar and
 * schedules notes ahead of the clock — no streaming, no files, ~0 memory.
 * Notes are scale degrees; `null` is a rest.
 */
export const MUSIC = {
  title: {
    bpm: 84,
    root: 55, // MIDI G1
    scale: [0, 2, 3, 5, 7, 8, 10], // natural minor
    chords: [
      [0, 2, 4],
      [5, 0, 2],
      [3, 5, 0],
      [4, 6, 1],
    ],
    bass: { wave: 'triangle', gain: 0.3, pattern: [0, null, 0, null, 4, null, 0, null] },
    pad: { wave: 'sine', gain: 0.12, detune: 6 },
    lead: { wave: 'triangle', gain: 0.16, density: 0.4, octave: 2 },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0], gain: 0.18 },
  },
  floor1: {
    bpm: 104,
    root: 57, // A1 — bright, airy woodland
    scale: [0, 2, 4, 7, 9], // major pentatonic
    chords: [
      [0, 2, 4],
      [3, 0, 2],
      [4, 1, 3],
      [2, 4, 0],
    ],
    bass: { wave: 'triangle', gain: 0.26, pattern: [0, null, 0, 2, 0, null, 4, null] },
    pad: { wave: 'sine', gain: 0.1, detune: 5 },
    lead: { wave: 'square', gain: 0.1, density: 0.55, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.15 },
  },
  floor2: {
    bpm: 96,
    root: 50,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [
      [0, 2, 4],
      [0, 3, 5],
      [5, 0, 2],
      [4, 6, 1],
    ],
    bass: { wave: 'sawtooth', gain: 0.22, pattern: [0, null, null, 0, 3, null, 0, null], filter: 500 },
    pad: { wave: 'sine', gain: 0.14, detune: 9 },
    lead: { wave: 'triangle', gain: 0.12, density: 0.35, octave: 3 },
    drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0], gain: 0.16 },
  },
  floor3: {
    bpm: 120,
    root: 45,
    scale: [0, 1, 4, 5, 7, 8, 11], // phrygian dominant — hot and tense
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [0, 2, 6],
      [4, 6, 1],
    ],
    bass: { wave: 'sawtooth', gain: 0.28, pattern: [0, 0, null, 0, 0, null, 0, 2], filter: 700 },
    pad: { wave: 'sawtooth', gain: 0.08, detune: 12 },
    lead: { wave: 'square', gain: 0.11, density: 0.5, octave: 3 },
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.2 },
  },
  floor4: {
    bpm: 132,
    root: 43,
    scale: [0, 1, 4, 5, 7, 8, 11],
    chords: [
      [0, 2, 4],
      [0, 2, 6],
      [3, 5, 0],
      [1, 3, 5],
    ],
    bass: { wave: 'sawtooth', gain: 0.3, pattern: [0, 0, 0, 0, 0, 0, 0, 0], filter: 800 },
    pad: { wave: 'sawtooth', gain: 0.09, detune: 14 },
    lead: { wave: 'square', gain: 0.13, density: 0.6, octave: 3 },
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 1], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.22 },
  },
  floor5: {
    bpm: 112,
    root: 48,
    scale: [0, 2, 4, 6, 7, 9, 11], // lydian — shimmering, prismatic
    chords: [
      [0, 2, 4],
      [1, 3, 5],
      [4, 6, 1],
      [2, 4, 6],
    ],
    bass: { wave: 'triangle', gain: 0.26, pattern: [0, null, 4, null, 2, null, 4, null] },
    pad: { wave: 'sine', gain: 0.16, detune: 7 },
    lead: { wave: 'triangle', gain: 0.14, density: 0.65, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 1, 1, 0, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.18 },
  },
  boss: {
    bpm: 140,
    root: 41,
    scale: [0, 1, 3, 5, 6, 8, 10], // locrian-ish, unstable
    chords: [
      [0, 2, 4],
      [0, 3, 5],
      [1, 3, 6],
      [0, 2, 5],
    ],
    bass: { wave: 'sawtooth', gain: 0.32, pattern: [0, 0, 0, 0, 0, 0, 0, 0], filter: 900 },
    pad: { wave: 'sawtooth', gain: 0.1, detune: 16 },
    lead: { wave: 'square', gain: 0.14, density: 0.7, octave: 3 },
    drums: { kick: [1, 0, 1, 1, 1, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.24 },
  },
  shop: {
    bpm: 88,
    root: 52,
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [
      [0, 2, 4],
      [3, 5, 0],
      [4, 6, 1],
      [0, 2, 4],
    ],
    bass: { wave: 'triangle', gain: 0.22, pattern: [0, null, 2, null, 4, null, 2, null] },
    pad: { wave: 'sine', gain: 0.12, detune: 4 },
    lead: { wave: 'sine', gain: 0.1, density: 0.3, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], gain: 0.1 },
  },
};
