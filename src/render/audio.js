// Original District Deck score and action cues. No recordings or network assets.
// Audio starts only after a gesture, pauses with the page and owns all its voices.

const CUES = {
  select:   { type: 'triangle', freq: 520, to: 560, dur: 0.07, gain: 0.05 },
  reject:   { type: 'square',   freq: 160, to: 110, dur: 0.16, gain: 0.05 },
  acquire:  { type: 'sine',     freq: 392, to: 588, dur: 0.30, gain: 0.10 },
  renovate: { type: 'sine',     freq: 392, to: 494, dur: 0.28, gain: 0.08 },
  redevelop:{ type: 'sine',     freq: 220, to: 440, dur: 0.46, gain: 0.10 },
  divest:   { type: 'sine',     freq: 494, to: 330, dur: 0.28, gain: 0.08 },
  settle:   { type: 'triangle', freq: 262, to: 392, dur: 0.45, gain: 0.09 },
  corridor: { type: 'sine',     freq: 660, to: 880, dur: 0.24, gain: 0.07 },
  win:      { type: 'sine',     freq: 392, to: 784, dur: 0.9,  gain: 0.12 },
  lose:     { type: 'sine',     freq: 330, to: 196, dur: 0.9,  gain: 0.10 },
  ching:    { type: 'triangle', freq: 1318, to: 1760, dur: 0.12, gain: 0.12 },
};

const MAX_VOICES = 6;
const BEAT_SECONDS = 0.625;
const CHORDS = [[45, 60, 64, 67, 71], [41, 60, 64, 65, 69],
  [48, 59, 62, 64, 67], [43, 57, 60, 62, 67]];
const MELODY = [2, 4, 3, 1, 3, 4, 2, 1];
const LOFI_BEAT = 60 / 74;
// Eight bars in F; the final bar splits at beat 3. Rootless extensions keep
// the keys close together, leaving the low register to the bass.
const LOFI_CHORDS = [
  { root: 43, keys: [53, 55, 57, 58, 62] }, // Gm9
  { root: 36, keys: [52, 57, 58, 60, 62] }, // C13
  { root: 41, keys: [53, 55, 57, 60, 64] }, // Fmaj9
  { root: 38, keys: [53, 57, 60, 62, 64] }, // Dm9
  { root: 34, keys: [53, 57, 58, 62] },     // Bbmaj7
  { root: 45, keys: [55, 57, 61, 64, 65] }, // A7(b13)
  { root: 38, keys: [53, 57, 60, 62, 64] }, // Dm9
  { root: 43, keys: [53, 55, 57, 59, 64] }, // G13
  { root: 36, keys: [53, 55, 58, 60] },     // C7sus
];

// Separate seeded streams keep rhythmic details stable across sample rates.
function randomStream(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const selectedScore = () => new URLSearchParams(globalThis.window?.location?.search ?? '').get('music') === 'original' ? 'original' : 'lofi';
const level = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class AudioBus {
  constructor({ musicVolume = 0.35, effectsVolume = 0.8, score = selectedScore() } = {}) {
    this.score = score === 'lofi' ? 'lofi' : 'original';
    this.nodes = new Set();
    this.lofi = null;
    this.texture = null;
    this.wow = null;
    this.random = randomStream(741938);
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.effects = null;
    this.music = null;
    this.musicVolume = level(musicVolume, 0.35);
    this.effectsVolume = level(effectsVolume, 0.8);
    this.activeVoices = new Set();
    // Offline scheduling retires capacity before onended releases ownership.
    this.ownedVoices = new Set();
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextMusicTime = 0;
    this.unlocked = false;
    this.disposed = false;
    this._onVisibility = () => this._syncPlayback();
  }

  get voices() { return [...this.activeVoices].filter(voice => voice.channel === 'effects').length; }

  /** Must be called from a real user gesture. Browsers refuse otherwise. */
  unlock() {
    if (this.disposed) return;
    if (this.unlocked) { this._syncPlayback(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.context = new Ctx();
      this.master = this._node('Gain');
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.context.destination);
      this.effects = this._node('Gain');
      this.music = this._node('Gain');
      this.effects.gain.value = this.effectsVolume;
      this.music.gain.value = this.musicVolume;
      this.effects.connect(this.master);
      this.music.connect(this.master);
      if (this.score === 'lofi') this._createLofiGraph();
      this.unlocked = true;
      document.addEventListener('visibilitychange', this._onVisibility);
      this._syncPlayback();
    } catch {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
      for (const voice of [...this.ownedVoices]) voice.stop();
      this._disconnect([...this.nodes]);
      this.lofi = null;
      this.context?.close().catch(() => {});
      this.context = this.master = this.effects = this.music = null;
      this.unlocked = false;
      this.enabled = false;
    }
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
    this._syncPlayback();
  }

  setMusicVolume(value) {
    this.musicVolume = level(value, this.musicVolume);
    if (this.music) this.music.gain.value = this.musicVolume;
    this._syncPlayback();
  }

  setEffectsVolume(value) {
    this.effectsVolume = level(value, this.effectsVolume);
    if (this.effects) this.effects.gain.value = this.effectsVolume;
  }

  _syncPlayback() {
    if (!this.context || this.disposed) return;
    const audible = this.enabled && !document.hidden;
    if (!audible || !this.musicVolume) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      for (const voice of [...this.activeVoices]) {
        if (voice.channel === 'music' || !audible) voice.stop();
      }
    }
    if (!audible) { this.context.suspend().catch(() => {}); return; }
    this.context.resume().catch(() => {});
    if (this.musicVolume && !this.musicTimer) {
      this.nextMusicTime = this.context.currentTime + 0.04;
      this._scheduleMusic();
      this.musicTimer = setInterval(() => this._scheduleMusic(), 250);
    }
  }

  _scheduleMusic() {
    if (!this.context || !this.enabled || document.hidden || !this.musicVolume) return;
    const now = this.context.currentTime;
    // A throttled tab resumes the composition; it never queues missed beats.
    this.nextMusicTime = Math.max(now + 0.02, this.nextMusicTime);
    while (this.nextMusicTime < now + 0.5) {
      this.nextMusicTime += this._musicStep(this.nextMusicTime, now);
    }
  }

  _musicStep(time, now = this.context.currentTime) {
    if (this.score === 'lofi') {
      const step = this.musicStep++ % 128;
      const duration = LOFI_BEAT * (step % 2 === 0 ? 0.62 : 0.38);
      this._lofiStep(step, time, duration);
      return duration;
    }
    const step = this.musicStep++ % 128;
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const delay = time - now;
    const note = chord[MELODY[step % MELODY.length]] + (step >= 64 ? 12 : 0);
    this._tone({ type: 'sine', freq: frequency(note), to: frequency(note), dur: 1.1, gain: 0.065 }, delay, 'music');
    if (step % 4 === 0) {
      this._tone({ type: 'sine', freq: frequency(chord[0]), to: frequency(chord[0]), dur: 2.25, gain: 0.07 }, delay, 'music');
      for (const midi of chord.slice(1, 4)) {
        this._tone({ type: 'triangle', freq: frequency(midi - 12), to: frequency(midi - 12), dur: 2.3, gain: 0.015, attack: 0.3 }, delay, 'music');
      }
    }
    return BEAT_SECONDS;
  }

  _node(kind) {
    const node = this.context[`create${kind}`]();
    this.nodes.add(node);
    return node;
  }

  _disconnect(nodes) {
    for (const node of nodes) {
      // Also covers a partially constructed voice if allocation/start failed.
      if (node.stop) { try { node.stop(); } catch { /* already ended */ } }
      node.disconnect();
      this.nodes.delete(node);
    }
  }

  _createLofiGraph() {
    const input = this._node('WaveShaper');
    const curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) {
      const x = 2 * i / (curve.length - 1) - 1;
      curve[i] = 1.05 * x - 0.05 * x ** 3; // Mild, symmetric tape compression.
    }
    input.curve = curve;
    const warmth = this._node('BiquadFilter');
    warmth.type = 'lowpass'; warmth.frequency.value = 3500; warmth.Q.value = 0.707;
    const drums = this._node('BiquadFilter');
    drums.type = 'lowpass'; drums.frequency.value = 6000; drums.Q.value = 0.707;
    drums.connect(input); input.connect(warmth); warmth.connect(this.music);
    const noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const samples = noise.getChannelData(0), random = randomStream(193874);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
    const wowDepth = this._node('Gain'); wowDepth.gain.value = 4;
    this.lofi = { input, drums, noise, wowDepth };
  }

  _voice(sources, nodes, end, onCleanup = () => {}) {
    let ended = false;
    const cleanup = () => {
      if (ended) return;
      ended = true;
      this.activeVoices.delete(voice);
      this.ownedVoices.delete(voice);
      this._disconnect(nodes);
      onCleanup();
    };
    const voice = { channel: 'music', end, stop: cleanup };
    this.activeVoices.add(voice);
    this.ownedVoices.add(voice);
    sources[0].onended = cleanup;
    for (const source of sources) if (Number.isFinite(end)) source.stop(end);
    return voice;
  }

  _keys(midi, time) {
    if (this.activeVoices.size >= 32) return;
    const carrier = this._node('Oscillator'), modulator = this._node('Oscillator');
    const index = this._node('Gain'), envelope = this._node('Gain');
    const tremolo = this._node('Oscillator'), tremoloDepth = this._node('Gain');
    const tremoloGain = this._node('Gain');
    const { wowDepth } = this.lofi;
    const hz = frequency(midi), release = time + 0.18, end = release + 1.2;
    carrier.type = modulator.type = tremolo.type = 'sine';
    carrier.frequency.setValueAtTime(hz, time);
    modulator.frequency.setValueAtTime(hz, time);
    index.gain.setValueAtTime(3 * hz, time);
    index.gain.exponentialRampToValueAtTime(0.5 * hz, end);
    modulator.connect(index); index.connect(carrier.frequency);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.024, time + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.024 * 0.8, release);
    envelope.gain.linearRampToValueAtTime(0, end);
    tremolo.frequency.value = 4.5; tremoloDepth.gain.value = 0.1;
    tremoloGain.gain.value = 1;
    tremolo.connect(tremoloDepth); tremoloDepth.connect(tremoloGain.gain);
    wowDepth.connect(carrier.detune); wowDepth.connect(modulator.detune);
    carrier.connect(envelope); envelope.connect(tremoloGain); tremoloGain.connect(this.lofi.input);
    const sources = [carrier, modulator, tremolo];
    for (const source of sources) source.start(time);
    this._voice(sources, [...sources, index, envelope, tremoloDepth, tremoloGain], end + 0.02, () => {
      // Remove incoming modulation edges as each note ends, too.
      wowDepth.disconnect(carrier.detune); wowDepth.disconnect(modulator.detune);
    });
  }

  _lofiTone(midi, time, { kick = false, pickup = false } = {}) {
    if (this.activeVoices.size >= 32) return;
    const osc = this._node('Oscillator'), envelope = this._node('Gain');
    const duration = kick ? 0.18 : pickup ? 0.24 : 0.65;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(kick ? 110 : frequency(midi), time);
    if (kick) osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(kick ? 0.032 : pickup ? 0.025 : 0.046, time + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(envelope); envelope.connect(kick ? this.lofi.drums : this.lofi.input);
    osc.start(time);
    this._voice([osc], [osc, envelope], time + duration + 0.02);
  }

  _noise(time, duration, peak, target, filterType, cutoff, loop = false) {
    if (this.activeVoices.size >= 32) return null;
    const source = this._node('BufferSource'), envelope = this._node('Gain');
    const nodes = [source, envelope];
    source.buffer = this.lofi.noise; source.loop = loop;
    envelope.gain.setValueAtTime(0.00001, time);
    envelope.gain.exponentialRampToValueAtTime(peak, time + (loop ? 0.08 : 0.002));
    if (!loop) envelope.gain.exponentialRampToValueAtTime(0.00001, time + duration);
    if (filterType) {
      const filter = this._node('BiquadFilter'); nodes.push(filter);
      filter.type = filterType; filter.frequency.value = cutoff; filter.Q.value = 0.7;
      source.connect(filter); filter.connect(envelope);
    } else source.connect(envelope);
    envelope.connect(target);
    source.start(time);
    return this._voice([source], nodes, loop ? Infinity : time + duration + 0.005,
      () => { if (loop) this.texture = null; });
  }

  _lofiStep(step, time, duration) {
    if (!this.wow && this.activeVoices.size < 32) {
      // One continuous wow crosses both sides of zero over successive notes.
      const wow = this._node('Oscillator'); wow.type = 'sine'; wow.frequency.value = 0.3;
      wow.connect(this.lofi.wowDepth); wow.start(time);
      this.wow = this._voice([wow], [wow], Infinity, () => { this.wow = null; });
    }
    if (!this.texture) this.texture = this._noise(time, 0, 0.0006, this.lofi.input, 'highpass', 700, true);
    const bar = Math.floor(step / 8) % 8, eighth = step % 8;
    const chord = LOFI_CHORDS[bar === 7 && eighth >= 4 ? 8 : bar];
    if (eighth === 0 || eighth === 4) {
      // Beat 3 walks to the fifth; the split final bar states its new root.
      const fifth = chord.root + 7 <= 48 ? chord.root + 7 : chord.root - 5;
      this._lofiTone(eighth === 0 || bar === 7 ? chord.root : fifth, time);
      this._lofiTone(0, time, { kick: true });
    }
    if (eighth === 7 && bar % 2 === 1) this._lofiTone(chord.root, time, { pickup: true });
    if (eighth === 1 || eighth === 5) {
      const keys = step >= 64 && bar === 2 ? [...chord.keys.slice(1), chord.keys[0] + 12] : chord.keys;
      for (const midi of keys) this._keys(midi, time);
    }
    if (eighth === 2 || eighth === 6) this._noise(time, 0.09, 0.014, this.lofi.drums, 'bandpass', 1800);
    this._noise(time, 0.035, 0.005 + this.random() * 0.004, this.lofi.drums, 'highpass', 7000);
    // Non-metric, seeded crackles: about two per second, between the hat hits.
    if (this.random() < 0.8) this._noise(time + duration * this.random(), 0.004,
      0.0015 + this.random() * 0.0015, this.lofi.input);
  }

  play(name) {
    if (!this.enabled || !this.unlocked || !this.context || document.hidden || !this.effectsVolume) return;
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    const cue = CUES[name];
    if (!cue) return;
    if (this.voices >= MAX_VOICES) return;

    if (name === 'ching') {
      this._tone(cue, 0);
      this._tone({ type: 'sine', freq: 1760, to: 2093, dur: 0.16, gain: 0.13 }, 0.07);
      this._tone({ type: 'square', freq: 196, to: 140, dur: 0.11, gain: 0.06 }, 0.03);
      return;
    }

    this._tone(cue, 0);
    if (['acquire', 'renovate', 'redevelop', 'settle', 'win'].includes(name)) {
      this._tone({ type: 'sine', freq: cue.to * 1.25, to: cue.to * 1.25, dur: cue.dur * 0.8, gain: cue.gain * 0.35 }, 0.07);
      this._tone({ type: 'sine', freq: cue.to * 1.5, to: cue.to * 1.5, dur: cue.dur, gain: cue.gain * 0.25 }, 0.14);
    }
  }

  _tone(cue, delay, channel = 'effects') {
    if (this.disposed || !this.context || this.activeVoices.size >= 32) return;
    if (channel === 'effects' && this.voices >= MAX_VOICES) return;
    const now = this.context.currentTime + delay;
    const osc = this._node('Oscillator');
    const gain = this._node('Gain');
    osc.type = cue.type;
    osc.frequency.setValueAtTime(cue.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to), now + cue.dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(cue.gain, now + (cue.attack ?? 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cue.dur);
    osc.connect(gain);
    gain.connect(channel === 'music' ? this.music : this.effects);
    let ended = false;
    const voice = { channel, end: now + cue.dur + 0.02, stop: () => { try { osc.stop(); } catch { /* already ended */ } cleanup(); } };
    const cleanup = () => {
      if (ended) return;
      ended = true;
      this.activeVoices.delete(voice);
      this.ownedVoices.delete(voice);
      this._disconnect([osc, gain]);
    };
    this.activeVoices.add(voice);
    this.ownedVoices.add(voice);
    osc.onended = cleanup;
    osc.start(now);
    osc.stop(now + cue.dur + 0.02);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    globalThis.document?.removeEventListener('visibilitychange', this._onVisibility);
    clearInterval(this.musicTimer);
    this.musicTimer = null;
    for (const voice of [...this.ownedVoices]) voice.stop();
    if (this.context?.close) this.context.close().catch(() => {});
    this._disconnect([...this.nodes]);
    this.lofi = this.texture = this.wow = null;
    this.master = this.effects = this.music = null;
    this.context = null;
    this.unlocked = false;
  }
}

/** Render at the game's default Music (0.35) and master (0.6) levels.
 * No gesture, live context, timer or page visibility dependency. The output is
 * stereo dual mono, with exactly ceil(seconds * sampleRate) frames (tails crop).
 */
export async function renderMusic(seconds, { score = 'lofi', sampleRate = 48000 } = {}) {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError('seconds must be positive and finite');
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new RangeError('sampleRate must be 8000–96000');
  if (!['lofi', 'original'].includes(score)) throw new RangeError('Unknown score');
  const Offline = globalThis.OfflineAudioContext || globalThis.window?.OfflineAudioContext || globalThis.window?.webkitOfflineAudioContext;
  if (!Offline) throw new Error('OfflineAudioContext is unavailable');
  const bus = new AudioBus({ score });
  try {
    bus.context = new Offline(2, Math.ceil(seconds * sampleRate), sampleRate);
    bus.master = bus._node('Gain'); bus.master.gain.value = 0.6;
    bus.music = bus._node('Gain'); bus.music.gain.value = bus.musicVolume;
    bus.music.connect(bus.master); bus.master.connect(bus.context.destination);
    if (score === 'lofi') bus._createLofiGraph();
    let time = 0.04;
    while (time < seconds) {
      // Offline scheduling runs ahead of the audio clock. Retire the logical
      // voice slots, leaving nodes connected until their actual onended event.
      for (const voice of bus.activeVoices) if (voice.end <= time) bus.activeVoices.delete(voice);
      time += bus._musicStep(time, 0);
    }
    return await bus.context.startRendering();
  } finally {
    bus.dispose();
  }
}

/** Interleaved, little-endian, signed 16-bit PCM in a standard RIFF/WAVE file. */
export function encodeWav(audioBuffer) {
  const { numberOfChannels: channels, length, sampleRate } = audioBuffer;
  const dataLength = length * channels * 2;
  if (!Number.isInteger(channels) || channels < 1 || channels > 32 ||
      !Number.isInteger(length) || length < 0 || dataLength > 0xffffffff - 36 ||
      !Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate * channels * 2 > 0xffffffff) {
    throw new RangeError('AudioBuffer does not fit a PCM WAV');
  }
  const bytes = new Uint8Array(44 + dataLength), view = new DataView(bytes.buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, dataLength, true);
  const samples = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < length; frame++) for (let channel = 0; channel < channels; channel++) {
    const value = samples[channel][frame];
    const clamped = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    view.setInt16(offset, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return bytes;
}
