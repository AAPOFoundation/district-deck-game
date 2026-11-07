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
const level = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export class AudioBus {
  constructor({ musicVolume = 0.35, effectsVolume = 0.8 } = {}) {
    this.context = null;
    this.master = null;
    this.enabled = true;
    this.effects = null;
    this.music = null;
    this.musicVolume = level(musicVolume, 0.35);
    this.effectsVolume = level(effectsVolume, 0.8);
    this.activeVoices = new Set();
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
      this.master = this.context.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.context.destination);
      this.effects = this.context.createGain();
      this.music = this.context.createGain();
      this.effects.gain.value = this.effectsVolume;
      this.music.gain.value = this.musicVolume;
      this.effects.connect(this.master);
      this.music.connect(this.master);
      this.unlocked = true;
      document.addEventListener('visibilitychange', this._onVisibility);
      this._syncPlayback();
    } catch {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      document.removeEventListener('visibilitychange', this._onVisibility);
      for (const voice of [...this.activeVoices]) voice.stop();
      this.effects?.disconnect();
      this.music?.disconnect();
      this.master?.disconnect();
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
      const step = this.musicStep++ % 128;
      const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
      const delay = this.nextMusicTime - now;
      const note = chord[MELODY[step % MELODY.length]] + (step >= 64 ? 12 : 0);
      this._tone({ type: 'sine', freq: frequency(note), to: frequency(note), dur: 1.1, gain: 0.065 }, delay, 'music');
      if (step % 4 === 0) {
        this._tone({ type: 'sine', freq: frequency(chord[0]), to: frequency(chord[0]), dur: 2.25, gain: 0.07 }, delay, 'music');
        for (const midi of chord.slice(1, 4)) {
          this._tone({ type: 'triangle', freq: frequency(midi - 12), to: frequency(midi - 12), dur: 2.3, gain: 0.015, attack: 0.3 }, delay, 'music');
        }
      }
      this.nextMusicTime += BEAT_SECONDS;
    }
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
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = cue.type;
    osc.frequency.setValueAtTime(cue.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, cue.to), now + cue.dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(cue.gain, now + (cue.attack ?? 0.012));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cue.dur);
    osc.connect(gain);
    gain.connect(channel === 'music' ? this.music : this.effects);
    let ended = false;
    const voice = { channel, stop: () => { try { osc.stop(); } catch { /* already ended */ } cleanup(); } };
    const cleanup = () => {
      if (ended) return;
      ended = true;
      this.activeVoices.delete(voice);
      osc.disconnect();
      gain.disconnect();
    };
    this.activeVoices.add(voice);
    osc.onended = cleanup;
    osc.start(now);
    osc.stop(now + cue.dur + 0.02);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this._onVisibility);
    clearInterval(this.musicTimer);
    this.musicTimer = null;
    for (const voice of [...this.activeVoices]) voice.stop();
    if (this.context) this.context.close().catch(() => {});
    this.effects?.disconnect();
    this.music?.disconnect();
    this.master?.disconnect();
    this.context = null;
    this.unlocked = false;
  }
}
