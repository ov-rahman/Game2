/**
 * Browser audio: a small synthesiser plus a 3D panner, over Web Audio.
 *
 * Reads the declarative descriptions in src/data/sounds.js and renders them
 * with oscillators, noise buffers and biquads. Nothing is loaded from disk or
 * network. Positional sounds are placed with a PannerNode so monsters can be
 * heard before they are seen — which, in a game this dark, is most of the time.
 */
import { SOUNDS, MUSIC, AMBIENCE } from '../../data/sounds.js';

const MAX_VOICES = 28;

export function createBrowserAudio(opts = {}) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return createNullAudio();

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let ambienceBus = null;
  let comp = null;
  let noiseBuffer = null;

  let masterVol = opts.master != null ? opts.master : 0.85;
  let sfxVol = opts.sfx != null ? opts.sfx : 1.0;
  let musicVol = opts.music != null ? opts.music : 0.45;

  let voices = 0;
  let started = false;

  let currentTrack = null;
  let trackName = null;
  let nextNoteTime = 0;
  let step = 0;
  let schedulerId = 0;
  let musicSeed = 1;

  let ambience = null;
  let ambienceNodes = null;
  let creakTimer = 0;

  const listener = { x: 0, y: 0, z: 0, yaw: 0 };

  function rnd() {
    musicSeed = (musicSeed * 1664525 + 1013904223) >>> 0;
    return musicSeed / 4294967296;
  }

  function ensureContext() {
    if (ctx) return ctx;
    ctx = new AudioCtx({ latencyHint: 'interactive' });

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 9;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;

    master = ctx.createGain();
    master.gain.value = masterVol;

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxVol;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    ambienceBus = ctx.createGain();
    ambienceBus.gain.value = 0;

    sfxBus.connect(comp);
    musicBus.connect(comp);
    ambienceBus.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    // One second of deterministic white noise, reused by every noise layer.
    const len = Math.floor(ctx.sampleRate);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = s / 0x3fffffff - 1;
    }

    if (ctx.listener && ctx.listener.forwardX) {
      ctx.listener.upX.value = 0;
      ctx.listener.upY.value = 1;
      ctx.listener.upZ.value = 0;
    }
    return ctx;
  }

  function envelope(param, t0, dur, a, d, peak) {
    const attack = Math.max(0.001, a || 0.002);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
  }

  function playLayer(layer, t0, gainMul, dest, rateMul) {
    const dur = layer.dur || 0.15;
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
        if ((layer.curve || 'exp') === 'exp') freqParam.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
        else freqParam.linearRampToValueAtTime(Math.max(1, f1), start + dur);
      }
    }

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
    g.connect(dest);

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

  /** Positional sounds route through a panner; UI sounds go straight to the bus. */
  function destinationFor(opt) {
    if (!opt || opt.x == null) return sfxBus;
    if (!ctx.createPanner) return sfxBus;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.maxDistance = 60;
    p.rolloffFactor = 1.1;
    if (p.positionX) {
      p.positionX.value = opt.x;
      p.positionY.value = opt.y || 0;
      p.positionZ.value = opt.z;
    } else {
      p.setPosition(opt.x, opt.y || 0, opt.z);
    }
    p.connect(sfxBus);
    return p;
  }

  function play(name, options) {
    if (!started) return;
    const def = SOUNDS[name];
    if (!def) return;
    if (voices > MAX_VOICES) return;
    ensureContext();
    if (ctx.state === 'suspended') return;

    const opt = options || {};

    // Cull distant sounds entirely rather than paying for inaudible voices.
    if (opt.x != null) {
      const d = Math.hypot(opt.x - listener.x, (opt.y || 0) - listener.y, opt.z - listener.z);
      if (d > 55) return;
    }

    const dest = destinationFor(opt);
    const t0 = ctx.currentTime + 0.001;
    let rateMul = opt.rate || 1;
    if (def.vary && def.vary.rate) rateMul *= 1 + (Math.random() * 2 - 1) * def.vary.rate;
    const gainMul = (def.gain == null ? 0.3 : def.gain) * (opt.gain == null ? 1 : opt.gain);

    for (const layer of def.layers) {
      if (layer.rep) {
        for (let i = 0; i < layer.rep.times; i++) {
          const l = Object.assign({}, layer, {
            delay: (layer.delay || 0) + i * layer.rep.every,
            f0: layer.f0 ? layer.f0 * (1 + i * (layer.rep.detune || 0)) : layer.f0,
          });
          delete l.rep;
          playLayer(l, t0, gainMul, dest, rateMul);
        }
      } else {
        playLayer(layer, t0, gainMul, dest, rateMul);
      }
    }
  }

  // ---- music ------------------------------------------------------------

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
      osc.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
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
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      g.connect(musicBus);
      o.start(t);
      o.stop(t + 0.22);
      o.onended = () => g.disconnect();
    } else {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7500 : 1700;
      const g = ctx.createGain();
      const dur = kind === 'hat' ? 0.04 : 0.16;
      g.gain.setValueAtTime(gain * (kind === 'hat' ? 0.35 : 0.65), t);
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
    const beat = 60 / track.bpm / 2;

    const bp = track.bass.pattern[s];
    if (bp != null) {
      musicVoice(midiToFreq(degreeToMidi(track, chord[0] + bp, 0)), t, beat * 1.5, track.bass.wave, track.bass.gain, track.bass.filter || 0);
    }
    if (s === 0) {
      for (let k = 0; k < chord.length; k++) {
        musicVoice(midiToFreq(degreeToMidi(track, chord[k], 1)), t, beat * 7.5, track.pad.wave, track.pad.gain, 1600, (k - 1) * track.pad.detune);
      }
    }
    if (rnd() < track.lead.density) {
      const pick = chord[Math.floor(rnd() * chord.length)];
      musicVoice(midiToFreq(degreeToMidi(track, pick, track.lead.octave - 1)), t, beat * (rnd() < 0.3 ? 1.8 : 0.8), track.lead.wave, track.lead.gain, 2800);
    }
    const d = track.drums;
    if (d.kick[s]) drumHit('kick', t, d.gain);
    if (d.snare[s]) drumHit('snare', t, d.gain);
    if (d.hat[s]) drumHit('hat', t, d.gain);
  }

  function scheduler() {
    if (!ctx) return;
    if (currentTrack) {
      const beat = 60 / currentTrack.bpm / 2;
      const horizon = ctx.currentTime + 0.4;
      let guard = 0;
      while (nextNoteTime < horizon && guard++ < 32) {
        scheduleStep(currentTrack, nextNoteTime, step);
        step++;
        nextNoteTime += beat;
      }
    }
    // Ambient one-shots: creaks, distant growls, dripping.
    if (ambience) {
      creakTimer -= 0.12;
      if (creakTimer <= 0) {
        creakTimer = ambience.creakEvery[0] + Math.random() * (ambience.creakEvery[1] - ambience.creakEvery[0]);
        const a = Math.random() * Math.PI * 2;
        const d = 12 + Math.random() * 24;
        play(ambience.creak, {
          gain: 0.35,
          rate: 0.6 + Math.random() * 0.5,
          x: listener.x + Math.cos(a) * d,
          y: listener.y,
          z: listener.z + Math.sin(a) * d,
        });
      }
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

  function stopAmbience() {
    if (!ambienceNodes) return;
    try {
      ambienceNodes.osc.stop();
      ambienceNodes.osc.disconnect();
      ambienceNodes.filter.disconnect();
    } catch {
      /* ignore */
    }
    ambienceNodes = null;
  }

  return {
    name: 'browser-audio',

    play,

    setListener(pos, yaw) {
      listener.x = pos.x;
      listener.y = pos.y;
      listener.z = pos.z;
      listener.yaw = yaw;
      if (!ctx || !ctx.listener) return;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (ctx.listener.positionX) {
        ctx.listener.positionX.value = pos.x;
        ctx.listener.positionY.value = pos.y;
        ctx.listener.positionZ.value = pos.z;
        ctx.listener.forwardX.value = fx;
        ctx.listener.forwardY.value = 0;
        ctx.listener.forwardZ.value = fz;
      } else if (ctx.listener.setPosition) {
        ctx.listener.setPosition(pos.x, pos.y, pos.z);
        ctx.listener.setOrientation(fx, 0, fz, 0, 1, 0);
      }
    },

    setAmbience(id) {
      const def = id ? AMBIENCE[id] : null;
      if (!ctx) {
        ambience = def;
        return;
      }
      stopAmbience();
      ambience = def;
      if (!def) {
        ambienceBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
        return;
      }
      const osc = ctx.createOscillator();
      osc.type = def.droneWave;
      osc.frequency.value = def.droneFreq;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = def.filter;
      filter.Q.value = 2;
      osc.connect(filter);
      filter.connect(ambienceBus);
      osc.start();
      ambienceNodes = { osc, filter };
      const t = ctx.currentTime;
      ambienceBus.gain.cancelScheduledValues(t);
      ambienceBus.gain.setValueAtTime(ambienceBus.gain.value, t);
      ambienceBus.gain.linearRampToValueAtTime(def.gain, t + 1.5);
      creakTimer = 2;
      startScheduler();
    },

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
        musicBus.gain.linearRampToValueAtTime(0, now + 0.8);
        currentTrack = null;
        return;
      }
      musicBus.gain.linearRampToValueAtTime(0.0001, now + 0.35);
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
        musicBus.gain.linearRampToValueAtTime(musicVol, t + 1.2);
      }, 380);
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

    /** Must run from a user gesture; browsers start contexts suspended. */
    resume() {
      ensureContext();
      started = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      startScheduler();
      if (currentTrack) {
        nextNoteTime = ctx.currentTime + 0.05;
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(0.0001, t);
        musicBus.gain.linearRampToValueAtTime(musicVol, t + 1.0);
      }
      if (ambience && !ambienceNodes) this.setAmbience(null);
    },

    dispose() {
      stopScheduler();
      stopAmbience();
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}

export function createNullAudio() {
  return {
    name: 'null-audio',
    play() {},
    setMusic() {},
    setAmbience() {},
    setListener() {},
    setMasterVolume() {},
    setSfxVolume() {},
    setMusicVolume() {},
    getVolumes() {
      return { master: 0, sfx: 0, music: 0 };
    },
    resume() {},
    dispose() {},
  };
}
