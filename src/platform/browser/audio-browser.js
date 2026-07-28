/**
 * Browser audio adapter — a small synthesiser over the Web Audio API.
 *
 * Reads the declarative sound/music descriptions in src/data/sounds.js and
 * renders them with oscillators, noise buffers and biquads. Nothing is loaded
 * from disk or network. A desktop build can reuse this file unchanged (Electron
 * and Tauri's webview both ship Web Audio) or swap in a native mixer that
 * implements the same five methods.
 */
import { SOUNDS, MUSIC } from '../../data/sounds.js';

const MAX_VOICES = 24; // hard cap so a bullet-hell frame cannot stall audio

export function createBrowserAudio(opts = {}) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return createNullAudio();

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let comp = null;
  let noiseBuffer = null;

  let masterVol = opts.master != null ? opts.master : 0.8;
  let sfxVol = opts.sfx != null ? opts.sfx : 0.9;
  let musicVol = opts.music != null ? opts.music : 0.5;

  let voices = 0;
  let started = false;

  // ---- music scheduler state -------------------------------------------
  let currentTrack = null;
  let trackName = null;
  let nextNoteTime = 0;
  let step = 0;
  let schedulerId = 0;
  let musicSeed = 1;

  function rnd() {
    musicSeed = (musicSeed * 1664525 + 1013904223) >>> 0;
    return musicSeed / 4294967296;
  }

  function ensureContext() {
    if (ctx) return ctx;
    ctx = new AudioCtx({ latencyHint: 'interactive' });

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master = ctx.createGain();
    master.gain.value = masterVol;

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0; // faded in by setMusic

    sfxBus.connect(comp);
    musicBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    // One second of white noise, reused by every noise layer.
    const len = Math.floor(ctx.sampleRate);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x3fffffff) - 1;
    }
    return ctx;
  }

  function envelope(param, t0, dur, a, d, peak) {
    const attack = Math.max(0.001, a || 0.002);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
  }

  function playLayer(layer, t0, gainMul, busNode, rateMul) {
    const dur = (layer.dur || 0.15);
    const start = t0 + (layer.delay || 0);
    let src;
    let freqParam = null;

    if (layer.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
    } else {
      src = ctx.createOscillator();
      src.type = layer.wave || 'square';
      freqParam = src.frequency;
      const f0 = (layer.f0 || 440) * rateMul;
      const f1 = (layer.f1 != null ? layer.f1 : layer.f0 || 440) * rateMul;
      freqParam.setValueAtTime(f0, start);
      if (f1 !== f0) {
        if ((layer.curve || 'exp') === 'exp') {
          freqParam.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
        } else {
          freqParam.linearRampToValueAtTime(Math.max(1, f1), start + dur);
        }
      }
      if (layer.detune) src.detune.value = layer.detune;
    }

    // Optional FM operator for metallic / growling timbres.
    let modOsc = null;
    if (layer.fm && freqParam) {
      modOsc = ctx.createOscillator();
      modOsc.type = 'sine';
      modOsc.frequency.value = (layer.f0 || 440) * rateMul * layer.fm.ratio;
      const modGain = ctx.createGain();
      modGain.gain.value = layer.fm.index;
      modOsc.connect(modGain);
      modGain.connect(freqParam);
      modOsc.start(start);
      modOsc.stop(start + dur + 0.05);
    }

    let node = src;
    if (layer.filter) {
      const biq = ctx.createBiquadFilter();
      biq.type = layer.filter.type || 'lowpass';
      const ff0 = layer.filter.f || 1000;
      biq.frequency.setValueAtTime(ff0, start);
      if (layer.filter.f1 != null && layer.filter.f1 !== ff0) {
        biq.frequency.exponentialRampToValueAtTime(Math.max(20, layer.filter.f1), start + dur);
      }
      if (layer.filter.q != null) biq.Q.value = layer.filter.q;
      node.connect(biq);
      node = biq;
    }

    const g = ctx.createGain();
    envelope(g.gain, start, dur, layer.a, layer.d, Math.max(0.0002, (layer.gain == null ? 1 : layer.gain) * gainMul));
    node.connect(g);

    if (layer.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, layer.pan));
      g.connect(p);
      p.connect(busNode);
    } else {
      g.connect(busNode);
    }

    src.start(start);
    src.stop(start + dur + 0.05);
    voices++;
    src.onended = () => {
      voices--;
      try {
        g.disconnect();
        node.disconnect();
      } catch {
        /* already torn down */
      }
    };
  }

  function play(name, options) {
    if (!started) return;
    const def = SOUNDS[name];
    if (!def) return;
    if (voices > MAX_VOICES) return;
    ensureContext();
    if (ctx.state === 'suspended') return;

    const t0 = ctx.currentTime + 0.001;
    const opt = options || {};
    let rateMul = opt.rate || 1;
    if (def.vary && def.vary.rate) {
      rateMul *= 1 + (Math.random() * 2 - 1) * def.vary.rate;
    }
    const gainMul = (def.gain == null ? 0.3 : def.gain) * (opt.gain == null ? 1 : opt.gain);

    for (const layer of def.layers) {
      const rep = layer.rep;
      if (rep) {
        for (let i = 0; i < rep.times; i++) {
          const l = Object.assign({}, layer, {
            delay: (layer.delay || 0) + i * rep.every,
            f0: layer.f0 ? layer.f0 * (1 + i * (rep.detune || 0)) : layer.f0,
          });
          delete l.rep;
          playLayer(l, t0, gainMul, sfxBus, rateMul);
        }
      } else {
        playLayer(layer, t0, gainMul, sfxBus, rateMul);
      }
    }
  }

  // ---- music -------------------------------------------------------------
  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function degreeToMidi(track, degree, octave = 0) {
    const scale = track.scale;
    const len = scale.length;
    let d = degree;
    let oct = octave;
    while (d < 0) {
      d += len;
      oct--;
    }
    while (d >= len) {
      d -= len;
      oct++;
    }
    return track.root + scale[d] + oct * 12;
  }

  function musicVoice(freq, t, dur, wave, gain, filterHz, detune) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    if (detune) osc.detune.value = detune;
    let node = osc;
    if (filterHz) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      f.Q.value = 1;
      osc.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    osc.onended = () => {
      try {
        g.disconnect();
        node.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  function drumHit(kind, t, gain) {
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      g.connect(musicBus);
      o.start(t);
      o.stop(t + 0.2);
      o.onended = () => g.disconnect();
    } else {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1600;
      f.Q.value = kind === 'hat' ? 0.7 : 1.2;
      const g = ctx.createGain();
      const dur = kind === 'hat' ? 0.045 : 0.16;
      g.gain.setValueAtTime(gain * (kind === 'hat' ? 0.4 : 0.7), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(musicBus);
      s.start(t);
      s.stop(t + dur + 0.02);
      s.onended = () => {
        try {
          g.disconnect();
          f.disconnect();
        } catch {
          /* ignore */
        }
      };
    }
  }

  function scheduleStep(track, t, i) {
    const bar = Math.floor(i / 8) % track.chords.length;
    const chord = track.chords[bar];
    const s = i % 8;
    const beat = (60 / track.bpm) / 2; // eighth notes

    // Bass
    const bp = track.bass.pattern[s];
    if (bp != null) {
      musicVoice(
        midiToFreq(degreeToMidi(track, chord[0] + bp, 0)),
        t,
        beat * 1.4,
        track.bass.wave,
        track.bass.gain,
        track.bass.filter || 0,
      );
    }

    // Pad — one sustained chord per bar.
    if (s === 0) {
      for (let k = 0; k < chord.length; k++) {
        const m = degreeToMidi(track, chord[k], 1);
        musicVoice(midiToFreq(m), t, beat * 7.5, track.pad.wave, track.pad.gain, 1800, (k - 1) * track.pad.detune);
      }
    }

    // Lead — sparse improvisation over the chord.
    if (rnd() < track.lead.density) {
      const pick = chord[Math.floor(rnd() * chord.length)] + (rnd() < 0.3 ? 1 : 0);
      const m = degreeToMidi(track, pick, track.lead.octave - 1);
      musicVoice(midiToFreq(m), t, beat * (rnd() < 0.25 ? 1.8 : 0.8), track.lead.wave, track.lead.gain, 3200);
    }

    // Drums
    const d = track.drums;
    if (d.kick[s]) drumHit('kick', t, d.gain);
    if (d.snare[s]) drumHit('snare', t, d.gain);
    if (d.hat[s]) drumHit('hat', t, d.gain);
  }

  function scheduler() {
    if (!currentTrack || !ctx) return;
    const beat = (60 / currentTrack.bpm) / 2;
    const horizon = ctx.currentTime + 0.35;
    let guard = 0;
    while (nextNoteTime < horizon && guard++ < 32) {
      scheduleStep(currentTrack, nextNoteTime, step);
      step++;
      nextNoteTime += beat;
    }
  }

  function startScheduler() {
    if (schedulerId) return;
    schedulerId = setInterval(scheduler, 120);
  }

  function stopScheduler() {
    if (schedulerId) clearInterval(schedulerId);
    schedulerId = 0;
  }

  return {
    name: 'browser-audio',

    play,

    setMusic(name) {
      if (name === trackName) return;
      trackName = name;
      if (!ctx) {
        currentTrack = name ? MUSIC[name] : null;
        return;
      }
      const now = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(now);
      musicBus.gain.setValueAtTime(musicBus.gain.value, now);
      if (!name || !MUSIC[name]) {
        musicBus.gain.linearRampToValueAtTime(0, now + 0.5);
        currentTrack = null;
        stopScheduler();
        return;
      }
      // Quick duck, then swap patterns and fade back in.
      musicBus.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      setTimeout(() => {
        if (trackName !== name || !ctx) return;
        currentTrack = MUSIC[name];
        musicSeed = 1;
        step = 0;
        nextNoteTime = ctx.currentTime + 0.05;
        startScheduler();
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(0.0001, t);
        musicBus.gain.linearRampToValueAtTime(musicVol, t + 0.8);
      }, 260);
    },

    setMasterVolume(v) {
      masterVol = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = masterVol;
    },
    setSfxVolume(v) {
      sfxVol = Math.max(0, Math.min(1, v));
      if (sfxBus) sfxBus.gain.value = sfxVol;
    },
    setMusicVolume(v) {
      musicVol = Math.max(0, Math.min(1, v));
      if (musicBus && currentTrack) musicBus.gain.value = musicVol;
    },
    getVolumes() {
      return { master: masterVol, sfx: sfxVol, music: musicVol };
    },

    /** Must be called from a user gesture; browsers start contexts suspended. */
    resume() {
      ensureContext();
      started = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (currentTrack) {
        nextNoteTime = ctx.currentTime + 0.05;
        startScheduler();
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(0.0001, t);
        musicBus.gain.linearRampToValueAtTime(musicVol, t + 0.8);
      }
    },

    suspend() {
      stopScheduler();
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },

    dispose() {
      stopScheduler();
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}

/** No-op implementation for hosts without Web Audio. */
export function createNullAudio() {
  return {
    name: 'null-audio',
    play() {},
    setMusic() {},
    setMasterVolume() {},
    setSfxVolume() {},
    setMusicVolume() {},
    getVolumes() {
      return { master: 0, sfx: 0, music: 0 };
    },
    resume() {},
    suspend() {},
    dispose() {},
  };
}
