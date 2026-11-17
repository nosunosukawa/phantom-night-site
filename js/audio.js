// 音はすべてその場で合成する (音源ファイルなし)。曲と効果音はウェブ版の描き下ろし。
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// 道中: 静かな夜。低いベースと、ときどき鳴る鐘
const CALM = {
  bpm: 126,
  bass: [38, 0, 0, 0, 38, 0, 0, 45, 38, 0, 0, 0, 36, 0, 33, 0],
  lead: [0, 0, 74, 0, 0, 0, 0, 0, 0, 0, 77, 0, 0, 0, 72, 0],
  kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
};
// 幻影が現れてから: 追い立てる 8 分のベースと、上がっていく分散和音 (Dm → B♭ → C → A)
const CHASE = {
  bpm: 164,
  roots: [38, 34, 36, 33],
  bass: [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 7, 0, 12, 10],
  arp: [[12, 15, 19, 24], [12, 16, 19, 24], [12, 16, 19, 24], [12, 16, 19, 22]],
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'off';
    this.step = 0;
    this.nextTime = 0;
    this.crowdLevel = 0;
  }

  // 最初のタップで呼ぶ (ブラウザは操作のあとでないと音を出せない)
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(ctx.destination);
      this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
      this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(this.master);
      // 白い雑音 (ムチ・蹄・歓声のもと)
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // 歓声: 雑音を帯域で絞って鳴らしっぱなしにし、音量だけ動かす
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
      this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
      src.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master);
      src.start();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  tone(freq, dur, { type = 'square', vol = 0.2, when = 0, to = null, out = null, attack = 0.005 } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  burst(dur, { vol = 0.3, type = 'lowpass', freq = 800, q = 0.7, when = 0, out = null } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfxGain);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  // 効果音
  hoof(v = 1) { this.burst(0.07, { vol: 0.2 * v, freq: 170, q: 1.2 }); }
  whip(power = 2) { if (!this.ctx) return; this.burst(0.05 + power * 0.015, { vol: [0, 0.2, 0.3, 0.42][power], type: 'highpass', freq: 2600 }); this.tone(1900, 0.03, { vol: 0.06, to: 700 }); }
  rein() { this.tone(1800, 0.025, { vol: 0.08, type: 'square' }); }
  push() { this.burst(0.16, { vol: 0.45, freq: 500 }); }
  dash() { if (!this.ctx) return; [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => this.tone(midi(n), 0.1, { vol: 0.1, when: this.ctx.currentTime + i * 0.045 })); }
  blip() { this.tone(1400, 0.02, { vol: 0.04, type: 'square' }); }
  bell() { if (!this.ctx) return; this.tone(880, 1.4, { type: 'sine', vol: 0.12 }); this.tone(1320, 1.0, { type: 'sine', vol: 0.06 }); }
  dull() { this.tone(110, 0.12, { type: 'sawtooth', vol: 0.14, to: 70 }); }
  good() { if (!this.ctx) return; [76, 79, 83, 88].forEach((n, i) => this.tone(midi(n), 0.12, { vol: 0.12, when: this.ctx.currentTime + i * 0.055 })); }
  bad() { if (!this.ctx) return; [58, 54, 51].forEach((n, i) => this.tone(midi(n), 0.16, { type: 'sawtooth', vol: 0.12, when: this.ctx.currentTime + i * 0.09 })); }
  gate() { if (!this.ctx) return; this.burst(0.18, { vol: 0.5, freq: 1800, type: 'bandpass', q: 0.8 }); this.tone(1320, 0.5, { type: 'sine', vol: 0.18 }); this.tone(1760, 0.6, { type: 'sine', vol: 0.12 }); }
  tick() { this.tone(880, 0.08, { type: 'sine', vol: 0.14 }); }
  // 幻影が現れる: 低いうなりと、2 音の警報
  warning() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(55, 1.6, { type: 'sawtooth', vol: 0.2, to: 38 });
    for (let i = 0; i < 3; i++) {
      this.tone(740, 0.16, { type: 'square', vol: 0.12, when: t + i * 0.36 });
      this.tone(554, 0.16, { type: 'square', vol: 0.12, when: t + i * 0.36 + 0.18 });
    }
  }
  duel() { if (!this.ctx) return; [62, 69, 74, 81].forEach((n, i) => this.tone(midi(n), 0.14, { type: 'sawtooth', vol: 0.1, when: this.ctx.currentTime + i * 0.05 })); }
  passed() { this.tone(330, 0.3, { type: 'square', vol: 0.12, to: 165 }); }
  repass() { this.tone(330, 0.25, { type: 'square', vol: 0.12, to: 660 }); }
  goal() { if (!this.ctx) return; this.burst(0.5, { vol: 0.3, freq: 1200, type: 'bandpass', q: 0.4 }); }
  // 勝ったとき: 短いファンファーレ (描き下ろし)
  win() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.1;
    const seq = [[62, 0, 0.14], [66, 0.14, 0.14], [69, 0.28, 0.14], [74, 0.42, 0.3], [72, 0.74, 0.14], [74, 0.9, 0.7]];
    for (const [n, at, d] of seq) {
      this.tone(midi(n), d + 0.1, { type: 'square', vol: 0.13, when: t + at });
      this.tone(midi(n - 12), d + 0.1, { type: 'triangle', vol: 0.16, when: t + at });
    }
  }
  lose() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.1;
    [[65, 0, 0.3], [62, 0.3, 0.3], [58, 0.6, 0.3], [57, 0.9, 0.8]].forEach(([n, at, d]) => this.tone(midi(n), d + 0.1, { type: 'triangle', vol: 0.18, when: t + at }));
  }

  // 結果の画面で、歓声を少し残してから静かに消す
  fadeCrowd(after = 1.5) {
    if (!this.ctx) return;
    const g = this.crowdGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(0, t + after, 0.6);
  }
  setCrowd(level) {
    if (!this.ctx) return;
    this.crowdGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.16, this.ctx.currentTime, 0.25);
  }

  // 曲: 'calm' 道中 / 'chase' 幻影が出てから / 'off'
  setMusic(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.05;
  }

  // 毎フレーム呼ぶ。少し先までの音を予約する
  update() {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    const P = this.mode === 'chase' ? CHASE : CALM;
    const stepDur = 60 / P.bpm / 4;
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.14) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, t = this.nextTime;
      const out = this.musicGain;
      if (P === CALM) {
        if (P.bass[s]) this.tone(midi(P.bass[s]), stepDur * 2.6, { type: 'triangle', vol: 0.3, when: t, out });
        if (P.lead[s] && bar % 2 === 1) this.tone(midi(P.lead[s]), 0.5, { type: 'sine', vol: 0.09, when: t, out });
        if (P.kick[s]) this.tone(120, 0.14, { type: 'sine', vol: 0.3, to: 42, when: t, out });
        if (P.hat[s]) this.burst(0.025, { vol: 0.05, type: 'highpass', freq: 7000, when: t, out });
      } else {
        const root = P.roots[bar];
        this.tone(midi(root + P.bass[s]), stepDur * 0.9, { type: 'sawtooth', vol: 0.16, when: t, out });
        if (s % 2 === 0) this.tone(midi(root + 24 + P.arp[bar][(s / 2) % 4]), stepDur * 1.6, { type: 'square', vol: 0.07, when: t, out });
        if (P.kick[s]) this.tone(140, 0.12, { type: 'sine', vol: 0.34, to: 45, when: t, out });
        if (P.snare[s]) this.burst(0.09, { vol: 0.16, type: 'bandpass', freq: 1900, q: 0.6, when: t, out });
        this.burst(0.02, { vol: s % 4 === 2 ? 0.07 : 0.035, type: 'highpass', freq: 8000, when: t, out });
      }
      this.step++;
      this.nextTime += stepDur;
    }
  }
}
