// DUSK STRIKE — every sound is synthesized with WebAudio: filtered noise
// for gunfire, pitched oscillators for beeps and jingles. No audio files,
// no network. The context starts on the first user gesture (browser rule).
export class SoundBank {
  constructor(settings) {
    this.s = settings;
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.s.master * this.s.sfx;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch { return false; }
  }

  setVolume() {
    if (this.master) this.master.gain.value = this.s.master * this.s.sfx;
  }

  // Short burst of filtered noise — the body of every gunshot and blast.
  noise({ dur, freq, q = 1, gain = 0.5, type = 'lowpass', when = 0 }) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // A tone that slides from f0 to f1 — beeps, clicks, jingles.
  tone({ f0, f1 = f0, dur, gain = 0.2, type = 'sine', when = 0 }) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind, distant = false) {
    const g = distant ? 0.12 : 0.5;
    if (kind === 'pistol') { this.noise({ dur: 0.09, freq: 2400, gain: g }); this.tone({ f0: 220, f1: 60, dur: 0.08, gain: g * 0.5, type: 'square' }); }
    else if (kind === 'rifle') { this.noise({ dur: 0.11, freq: 1600, gain: g }); this.tone({ f0: 160, f1: 50, dur: 0.1, gain: g * 0.6, type: 'square' }); }
    else if (kind === 'shotgun') { this.noise({ dur: 0.22, freq: 900, gain: g * 1.2 }); this.tone({ f0: 120, f1: 35, dur: 0.2, gain: g * 0.8, type: 'square' }); }
    else if (kind === 'dmr') { this.noise({ dur: 0.16, freq: 3200, gain: g, type: 'bandpass', q: 0.7 }); this.tone({ f0: 300, f1: 70, dur: 0.14, gain: g * 0.7, type: 'square' }); }
    else { this.noise({ dur: 0.07, freq: 3000, gain: g * 0.8, type: 'bandpass', q: 0.8 }); }
  }

  smokeHiss() { this.noise({ dur: 1.2, freq: 5000, gain: 0.12, type: 'highpass' }); }
  flashRing() {
    this.noise({ dur: 0.12, freq: 4000, gain: 0.7, type: 'bandpass', q: 1 });
    this.tone({ f0: 3200, f1: 2800, dur: 0.9, gain: 0.1, type: 'sine' });
  }

  dryFire() { this.tone({ f0: 1200, dur: 0.03, gain: 0.08, type: 'square' }); }
  reload() {
    this.tone({ f0: 500, f1: 300, dur: 0.06, gain: 0.12, type: 'square' });
    this.tone({ f0: 700, f1: 900, dur: 0.05, gain: 0.12, type: 'square', when: 0.35 });
  }
  explosion() {
    this.noise({ dur: 0.7, freq: 300, gain: 0.9 });
    this.tone({ f0: 90, f1: 30, dur: 0.6, gain: 0.7, type: 'sine' });
  }
  step() { this.noise({ dur: 0.05, freq: 500, gain: 0.05 }); }
  land() { this.noise({ dur: 0.09, freq: 300, gain: 0.2 }); }
  hitmarker(head) { this.tone({ f0: head ? 1600 : 1100, dur: 0.05, gain: 0.15, type: 'sine' }); }
  beep() { this.tone({ f0: 980, dur: 0.12, gain: 0.2, type: 'square' }); }
  plant() { this.beep(); this.tone({ f0: 660, dur: 0.15, gain: 0.2, type: 'square', when: 0.15 }); }
  defuse() { this.tone({ f0: 660, dur: 0.1, gain: 0.2, type: 'square' }); this.tone({ f0: 990, dur: 0.2, gain: 0.2, type: 'square', when: 0.12 }); }
  click() { this.tone({ f0: 800, dur: 0.04, gain: 0.1, type: 'sine' }); }
  buy() { this.tone({ f0: 880, dur: 0.07, gain: 0.15 }); this.tone({ f0: 1320, dur: 0.12, gain: 0.15, when: 0.07 }); }
  denied() { this.tone({ f0: 220, dur: 0.15, gain: 0.15, type: 'square' }); }
  roundWin() { [523, 659, 784].forEach((f, i) => this.tone({ f0: f, dur: 0.18, gain: 0.18, when: i * 0.12 })); }
  roundLose() { [392, 330, 262].forEach((f, i) => this.tone({ f0: f, dur: 0.2, gain: 0.15, when: i * 0.13 })); }
}
