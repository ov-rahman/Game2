/**
 * Sound design as pure data — there is not a single audio file in the project.
 *
 * The core emits sound ids; the platform audio adapter turns these descriptions
 * into oscillators, noise and envelopes at runtime.
 *
 * Layer schema:
 *   type    'osc' | 'noise'
 *   wave    sine | square | sawtooth | triangle   (osc only)
 *   f0,f1   start/end frequency in Hz
 *   curve   'exp' | 'lin' frequency glide
 *   dur     length in seconds, delay = start offset
 *   a,d     attack / decay seconds
 *   gain    layer gain
 *   filter  { type, f, f1, q } biquad with optional sweep
 *   fm      { ratio, index } frequency modulation for metallic / growling timbres
 *   rep     { times, every, detune } cheap rattle / arpeggio
 */

export const SOUNDS = {
  // ---- weapon ----------------------------------------------------------
  shoot: {
    gain: 0.24,
    vary: { rate: 0.06 },
    layers: [
      { type: 'noise', dur: 0.09, a: 0.001, d: 0.08, gain: 0.6, filter: { type: 'bandpass', f: 2400, f1: 700, q: 1.1 } },
      { type: 'osc', wave: 'square', f0: 420, f1: 120, curve: 'exp', dur: 0.1, a: 0.001, d: 0.09, gain: 0.35 },
    ],
  },
  shootHeavy: {
    gain: 0.32,
    vary: { rate: 0.05 },
    layers: [
      { type: 'noise', dur: 0.22, a: 0.001, d: 0.2, gain: 0.7, filter: { type: 'lowpass', f: 2600, f1: 400 } },
      { type: 'osc', wave: 'sawtooth', f0: 190, f1: 55, curve: 'exp', dur: 0.24, a: 0.002, d: 0.22, gain: 0.55 },
    ],
  },
  shootBeam: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 1500, f1: 260, curve: 'exp', dur: 0.3, a: 0.002, d: 0.28, gain: 0.4, filter: { type: 'bandpass', f: 2000, f1: 400, q: 4 } },
      { type: 'osc', wave: 'sine', f0: 3000, f1: 700, curve: 'exp', dur: 0.2, a: 0.001, d: 0.19, gain: 0.2 },
    ],
  },
  reloadTorch: {
    gain: 0.22,
    layers: [
      { type: 'noise', dur: 0.12, a: 0.001, d: 0.11, gain: 0.4, filter: { type: 'highpass', f: 3000 } },
      { type: 'osc', wave: 'square', f0: 220, f1: 340, curve: 'lin', dur: 0.1, a: 0.002, d: 0.09, gain: 0.2 },
    ],
  },

  // ---- impacts ---------------------------------------------------------
  hit: {
    gain: 0.26,
    vary: { rate: 0.12 },
    layers: [
      { type: 'noise', dur: 0.07, a: 0.001, d: 0.06, gain: 0.55, filter: { type: 'bandpass', f: 1500, f1: 500, q: 1.3 } },
      { type: 'osc', wave: 'triangle', f0: 280, f1: 110, curve: 'exp', dur: 0.08, a: 0.001, d: 0.07, gain: 0.4 },
    ],
  },
  crit: {
    gain: 0.32,
    layers: [
      { type: 'osc', wave: 'square', f0: 900, f1: 1600, curve: 'exp', dur: 0.07, a: 0.001, d: 0.06, gain: 0.32 },
      { type: 'noise', dur: 0.13, a: 0.001, d: 0.12, gain: 0.5, filter: { type: 'highpass', f: 2200 } },
    ],
  },
  wallHit: {
    gain: 0.18,
    vary: { rate: 0.2 },
    layers: [{ type: 'noise', dur: 0.06, a: 0.001, d: 0.055, gain: 0.5, filter: { type: 'bandpass', f: 900, q: 0.9 } }],
  },
  hurt: {
    gain: 0.4,
    layers: [
      { type: 'osc', wave: 'square', f0: 180, f1: 60, curve: 'exp', dur: 0.3, a: 0.002, d: 0.28, gain: 0.65, filter: { type: 'lowpass', f: 1200 } },
      { type: 'noise', dur: 0.16, a: 0.001, d: 0.15, gain: 0.45, filter: { type: 'lowpass', f: 800 } },
    ],
  },
  death: {
    gain: 0.5,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 260, f1: 30, curve: 'exp', dur: 1.6, a: 0.01, d: 1.55, gain: 0.6, filter: { type: 'lowpass', f: 1600, f1: 150 } },
      { type: 'noise', dur: 1.1, a: 0.02, d: 1.05, gain: 0.35, filter: { type: 'lowpass', f: 600 } },
    ],
  },
  enemyDie: {
    gain: 0.3,
    vary: { rate: 0.14 },
    layers: [
      { type: 'noise', dur: 0.28, a: 0.001, d: 0.26, gain: 0.55, filter: { type: 'lowpass', f: 1500, f1: 250 } },
      { type: 'osc', wave: 'triangle', f0: 200, f1: 45, curve: 'exp', dur: 0.3, a: 0.002, d: 0.28, gain: 0.45, fm: { ratio: 1.7, index: 60 } },
    ],
  },
  enemyShoot: {
    gain: 0.2,
    vary: { rate: 0.1 },
    layers: [
      { type: 'osc', wave: 'triangle', f0: 320, f1: 560, curve: 'exp', dur: 0.14, a: 0.002, d: 0.13, gain: 0.55, fm: { ratio: 2.3, index: 90 } },
    ],
  },
  explode: {
    gain: 0.55,
    layers: [
      { type: 'noise', dur: 0.6, a: 0.002, d: 0.55, gain: 0.8, filter: { type: 'lowpass', f: 2400, f1: 140 } },
      { type: 'osc', wave: 'sine', f0: 140, f1: 28, curve: 'exp', dur: 0.55, a: 0.002, d: 0.53, gain: 0.7 },
    ],
  },

  // ---- monsters --------------------------------------------------------
  growl: {
    gain: 0.3,
    vary: { rate: 0.2 },
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 90, f1: 130, curve: 'exp', dur: 0.7, a: 0.08, d: 0.6, gain: 0.5, filter: { type: 'lowpass', f: 700, f1: 1400 }, fm: { ratio: 0.5, index: 30 } },
    ],
  },
  screech: {
    gain: 0.3,
    vary: { rate: 0.15 },
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 1200, f1: 2400, curve: 'exp', dur: 0.4, a: 0.01, d: 0.38, gain: 0.3, filter: { type: 'bandpass', f: 2600, q: 3 }, fm: { ratio: 1.4, index: 400 } },
    ],
  },
  step: {
    gain: 0.12,
    vary: { rate: 0.25 },
    layers: [{ type: 'noise', dur: 0.08, a: 0.002, d: 0.07, gain: 0.45, filter: { type: 'lowpass', f: 700 } }],
  },
  stepEnemy: {
    gain: 0.16,
    vary: { rate: 0.3 },
    layers: [{ type: 'noise', dur: 0.1, a: 0.002, d: 0.09, gain: 0.5, filter: { type: 'lowpass', f: 450 } }],
  },
  spawn: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 80, f1: 300, curve: 'exp', dur: 0.35, a: 0.01, d: 0.33, gain: 0.4 },
      { type: 'noise', dur: 0.3, a: 0.02, d: 0.27, gain: 0.25, filter: { type: 'lowpass', f: 1400 } },
    ],
  },

  // ---- pickups / progression ------------------------------------------
  coin: {
    gain: 0.22,
    layers: [
      { type: 'osc', wave: 'square', f0: 1050, dur: 0.05, a: 0.001, d: 0.045, gain: 0.35 },
      { type: 'osc', wave: 'square', f0: 1560, delay: 0.045, dur: 0.13, a: 0.001, d: 0.12, gain: 0.3 },
    ],
  },
  pickup: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 520, f1: 1040, curve: 'exp', dur: 0.14, a: 0.002, d: 0.13, gain: 0.5 },
      { type: 'osc', wave: 'sine', f0: 1560, delay: 0.06, dur: 0.18, a: 0.002, d: 0.17, gain: 0.22 },
    ],
  },
  heal: {
    gain: 0.28,
    layers: [
      { type: 'osc', wave: 'sine', f0: 620, f1: 880, curve: 'exp', dur: 0.2, a: 0.006, d: 0.19, gain: 0.45 },
      { type: 'osc', wave: 'sine', f0: 1320, delay: 0.09, dur: 0.24, a: 0.006, d: 0.23, gain: 0.24 },
    ],
  },
  item: {
    gain: 0.34,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 523, dur: 0.5, a: 0.005, d: 0.45, gain: 0.38 },
      { type: 'osc', wave: 'triangle', f0: 659, delay: 0.1, dur: 0.5, a: 0.005, d: 0.45, gain: 0.33 },
      { type: 'osc', wave: 'triangle', f0: 784, delay: 0.2, dur: 0.7, a: 0.005, d: 0.62, gain: 0.3 },
    ],
  },
  synergy: {
    gain: 0.4,
    layers: [
      { type: 'osc', wave: 'square', f0: 392, dur: 0.7, a: 0.01, d: 0.65, gain: 0.26, filter: { type: 'lowpass', f: 2600 } },
      { type: 'osc', wave: 'square', f0: 587, delay: 0.08, dur: 0.7, a: 0.01, d: 0.62, gain: 0.24 },
      { type: 'osc', wave: 'sine', f0: 1568, delay: 0.18, dur: 1.0, a: 0.02, d: 0.95, gain: 0.18 },
    ],
  },
  deny: {
    gain: 0.24,
    layers: [{ type: 'osc', wave: 'square', f0: 240, f1: 130, curve: 'exp', dur: 0.17, a: 0.002, d: 0.16, gain: 0.35 }],
  },
  confirm: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'square', f0: 620, dur: 0.06, a: 0.001, d: 0.055, gain: 0.28 },
      { type: 'osc', wave: 'square', f0: 930, delay: 0.05, dur: 0.12, a: 0.001, d: 0.11, gain: 0.26 },
    ],
  },
  select: {
    gain: 0.16,
    layers: [{ type: 'osc', wave: 'square', f0: 760, dur: 0.05, a: 0.001, d: 0.045, gain: 0.3 }],
  },
  stairs: {
    gain: 0.42,
    layers: [
      { type: 'osc', wave: 'sine', f0: 300, f1: 90, curve: 'exp', dur: 1.6, a: 0.02, d: 1.55, gain: 0.5 },
      { type: 'noise', dur: 1.3, a: 0.35, d: 1.0, gain: 0.22, filter: { type: 'lowpass', f: 500, f1: 110 } },
    ],
  },
  doorOpen: {
    gain: 0.3,
    layers: [
      { type: 'noise', dur: 0.6, a: 0.03, d: 0.55, gain: 0.45, filter: { type: 'lowpass', f: 650, f1: 200 } },
      { type: 'osc', wave: 'sine', f0: 85, f1: 50, curve: 'exp', dur: 0.45, a: 0.01, d: 0.43, gain: 0.45 },
    ],
  },

  // ---- elemental -------------------------------------------------------
  fire: { gain: 0.2, layers: [{ type: 'noise', dur: 0.4, a: 0.03, d: 0.36, gain: 0.5, filter: { type: 'bandpass', f: 850, f1: 280, q: 0.8 } }] },
  ice: {
    gain: 0.24,
    layers: [
      { type: 'osc', wave: 'sine', f0: 2600, f1: 1400, curve: 'exp', dur: 0.3, a: 0.002, d: 0.28, gain: 0.26 },
      { type: 'noise', dur: 0.18, a: 0.001, d: 0.17, gain: 0.28, filter: { type: 'highpass', f: 3600 } },
    ],
  },
  shock: {
    gain: 0.26,
    layers: [
      { type: 'noise', dur: 0.14, a: 0.001, d: 0.13, gain: 0.55, filter: { type: 'highpass', f: 2400 }, rep: { times: 3, every: 0.035 } },
    ],
  },
  charge: {
    gain: 0.22,
    layers: [{ type: 'osc', wave: 'sawtooth', f0: 110, f1: 900, curve: 'exp', dur: 0.75, a: 0.1, d: 0.65, gain: 0.28, filter: { type: 'lowpass', f: 400, f1: 3200 } }],
  },
  teleport: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'sine', f0: 1200, f1: 200, curve: 'exp', dur: 0.26, a: 0.002, d: 0.25, gain: 0.32, fm: { ratio: 1.5, index: 300 } },
    ],
  },
  block: {
    gain: 0.26,
    layers: [
      { type: 'osc', wave: 'square', f0: 420, f1: 300, curve: 'exp', dur: 0.09, a: 0.001, d: 0.08, gain: 0.32, fm: { ratio: 2.7, index: 200 } },
    ],
  },
  rubble: {
    gain: 0.3,
    layers: [{ type: 'noise', dur: 0.3, a: 0.001, d: 0.28, gain: 0.6, filter: { type: 'lowpass', f: 1600, f1: 300 } }],
  },

  // ---- bosses ----------------------------------------------------------
  bossRoar: {
    gain: 0.55,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 62, f1: 120, curve: 'exp', dur: 1.8, a: 0.15, d: 1.6, gain: 0.55, filter: { type: 'lowpass', f: 800, f1: 2000 }, fm: { ratio: 0.5, index: 45 } },
      { type: 'noise', dur: 1.6, a: 0.2, d: 1.4, gain: 0.3, filter: { type: 'bandpass', f: 450, f1: 1300, q: 0.7 } },
    ],
  },
  bossSlam: {
    gain: 0.5,
    layers: [
      { type: 'osc', wave: 'sine', f0: 105, f1: 28, curve: 'exp', dur: 0.65, a: 0.002, d: 0.63, gain: 0.8 },
      { type: 'noise', dur: 0.4, a: 0.001, d: 0.38, gain: 0.5, filter: { type: 'lowpass', f: 1300, f1: 180 } },
    ],
  },
  bossDie: {
    gain: 0.6,
    layers: [
      { type: 'osc', wave: 'sawtooth', f0: 190, f1: 26, curve: 'exp', dur: 2.6, a: 0.05, d: 2.5, gain: 0.6, filter: { type: 'lowpass', f: 1500, f1: 110 } },
      { type: 'noise', dur: 2.2, a: 0.1, d: 2.1, gain: 0.4, filter: { type: 'lowpass', f: 900, f1: 90 } },
    ],
  },
  win: {
    gain: 0.45,
    layers: [
      { type: 'osc', wave: 'triangle', f0: 523, dur: 0.3, a: 0.005, d: 0.28, gain: 0.38 },
      { type: 'osc', wave: 'triangle', f0: 659, delay: 0.17, dur: 0.3, a: 0.005, d: 0.28, gain: 0.38 },
      { type: 'osc', wave: 'triangle', f0: 784, delay: 0.34, dur: 0.3, a: 0.005, d: 0.28, gain: 0.38 },
      { type: 'osc', wave: 'triangle', f0: 1046, delay: 0.51, dur: 1.3, a: 0.01, d: 1.2, gain: 0.42 },
    ],
  },
};

/**
 * Procedural music. The adapter walks these patterns bar by bar and schedules
 * notes ahead of the clock — no streaming, no files, negligible memory.
 * Notes are scale degrees.
 */
export const MUSIC = {
  title: {
    bpm: 76,
    root: 43,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]],
    bass: { wave: 'triangle', gain: 0.3, pattern: [0, null, null, 0, null, null, 4, null] },
    pad: { wave: 'sine', gain: 0.14, detune: 7 },
    lead: { wave: 'triangle', gain: 0.1, density: 0.25, octave: 2 },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], gain: 0.1 },
  },
  floor1: {
    bpm: 82,
    root: 45,
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 2, 4], [3, 5, 0], [5, 0, 2], [0, 2, 4]],
    bass: { wave: 'triangle', gain: 0.24, pattern: [0, null, null, null, 3, null, null, null] },
    pad: { wave: 'sine', gain: 0.11, detune: 5 },
    lead: { wave: 'sine', gain: 0.07, density: 0.16, octave: 2 },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], gain: 0.08 },
  },
  floor2: {
    bpm: 74,
    root: 41,
    scale: [0, 1, 3, 5, 7, 8, 10],
    chords: [[0, 2, 4], [0, 3, 5], [1, 3, 6], [0, 2, 4]],
    bass: { wave: 'sawtooth', gain: 0.22, pattern: [0, null, null, null, null, null, 0, null], filter: 380 },
    pad: { wave: 'sine', gain: 0.15, detune: 11 },
    lead: { wave: 'triangle', gain: 0.07, density: 0.18, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 0, 0, 1, 0], hat: [0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], gain: 0.09 },
  },
  floor3: {
    bpm: 96,
    root: 40,
    scale: [0, 1, 4, 5, 7, 8, 11],
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 6], [4, 6, 1]],
    bass: { wave: 'sawtooth', gain: 0.28, pattern: [0, 0, null, 0, 0, null, 0, 2], filter: 600 },
    pad: { wave: 'sawtooth', gain: 0.08, detune: 13 },
    lead: { wave: 'square', gain: 0.08, density: 0.3, octave: 3 },
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.14 },
  },
  floor4: {
    bpm: 108,
    root: 38,
    scale: [0, 1, 4, 5, 7, 8, 11],
    chords: [[0, 2, 4], [0, 2, 6], [3, 5, 0], [1, 3, 5]],
    bass: { wave: 'sawtooth', gain: 0.3, pattern: [0, 0, 0, 0, 0, 0, 0, 0], filter: 700 },
    pad: { wave: 'sawtooth', gain: 0.09, detune: 15 },
    lead: { wave: 'square', gain: 0.1, density: 0.35, octave: 3 },
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 1], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.16 },
  },
  floor5: {
    bpm: 88,
    root: 46,
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [[0, 2, 4], [1, 3, 5], [4, 6, 1], [2, 4, 6]],
    bass: { wave: 'triangle', gain: 0.24, pattern: [0, null, 4, null, 2, null, 4, null] },
    pad: { wave: 'sine', gain: 0.17, detune: 6 },
    lead: { wave: 'triangle', gain: 0.11, density: 0.4, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 1, 1, 0, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.12 },
  },
  boss: {
    bpm: 126,
    root: 36,
    scale: [0, 1, 3, 5, 6, 8, 10],
    chords: [[0, 2, 4], [0, 3, 5], [1, 3, 6], [0, 2, 5]],
    bass: { wave: 'sawtooth', gain: 0.32, pattern: [0, 0, 0, 0, 0, 0, 0, 0], filter: 800 },
    pad: { wave: 'sawtooth', gain: 0.1, detune: 17 },
    lead: { wave: 'square', gain: 0.12, density: 0.5, octave: 3 },
    drums: { kick: [1, 0, 1, 1, 1, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], gain: 0.2 },
  },
  shop: {
    bpm: 70,
    root: 48,
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4]],
    bass: { wave: 'triangle', gain: 0.2, pattern: [0, null, 2, null, 4, null, 2, null] },
    pad: { wave: 'sine', gain: 0.12, detune: 4 },
    lead: { wave: 'sine', gain: 0.08, density: 0.24, octave: 3 },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], gain: 0.07 },
  },
};

/** Ambient beds: a slow drone plus random one-shot creaks per floor. */
export const AMBIENCE = {
  grove: { droneFreq: 68, droneWave: 'sawtooth', filter: 340, gain: 0.05, creakEvery: [5, 13], creak: 'growl' },
  hollow: { droneFreq: 52, droneWave: 'sine', filter: 240, gain: 0.07, creakEvery: [4, 11], creak: 'screech' },
  forge: { droneFreq: 84, droneWave: 'sawtooth', filter: 420, gain: 0.06, creakEvery: [3, 9], creak: 'fire' },
  lavalake: { droneFreq: 44, droneWave: 'sawtooth', filter: 300, gain: 0.08, creakEvery: [3, 8], creak: 'fire' },
  hoard: { droneFreq: 96, droneWave: 'sine', filter: 520, gain: 0.05, creakEvery: [5, 12], creak: 'ice' },
};
