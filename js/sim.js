// レースの中身 (画面に依存しない計算)。時間はすべて「レース内の秒」。
// 元: mobile/turfrush の RaceSim.swift をそのまま移した (釣り合いを変えないため、数値は同じ)。
// 変えたのはアイテムの種類と見た目だけ (効き目の強さは元と同じ)。
import { STYLE, GAIT, RIVAL_NAMES, RIVAL_COATS, RIVAL_SILKS, COAT, JOCKEY, rivalsFor, STORY_NAMES } from './data.js';

// アイテム (ウェブ版の描き下ろし)
export const ITEM = {
  herb:  { name: '青草の束', good: true,  text: '体力が回復' },
  wind:  { name: '追い風',   good: true,  text: 'しばらく加速' },
  web:   { name: 'くもの巣', good: false, text: '進路を変えられない' },
  stump: { name: '切り株',   good: false, text: '大きく減速' },
  bag:   { name: '福袋',     good: true,  text: '何が出るかな' },
  star:  { name: '★',        good: true,  text: '3つで流星ダッシュ' },
  sugar: { name: '角砂糖',   good: true,  text: '少し回復' },
  bell:  { name: '金の鈴',   good: true,  text: '体力が満タン' },
  charm: { name: 'お守り',   good: true,  text: '坂と馬群割りに強くなる' },
  mud:   { name: 'ぬかるみ', good: false, text: '足を取られた' },
  crow:  { name: 'カラス',   good: false, text: '驚いて暴走' },
};

// 競馬場の形 (直線の長さ・1 周・左回りか)
export function courseShape(venue) {
  const S = {
    '北嶺': [266, 1640, false], '東湾': [310, 1667, false], '府中台': [525, 2083, true],
    '古都': [404, 1894, false], '大井沢': [386, 1600, false], 'パリジャン': [533, 2400, false],
  }[venue] || [400, 1600, false];
  const shape = { straight: S[0], lap: S[1], leftHanded: S[2] };
  shape.innerR = (shape.lap - 2 * shape.straight) / (2 * Math.PI);
  return shape;
}

const HILLS = {
  '東湾': [[0, 230, 2.4], [950, 260, -1.6]],
  '府中台': [[280, 200, 2.0], [1000, 220, -1.4]],
  '古都': [[680, 170, 3.6]],
  'パリジャン': [[1150, 330, 4.2], [150, 120, 0.8]],
  '北嶺': [[900, 160, 0.9]],
};

export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.shuffle = arr => { const b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  return f;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TIMERS = ['balk', 'wind', 'web', 'stump', 'hyper', 'happy', 'charm', 'mud', 'crow', 'whipPowerTimer', 'rein', 'railTimer', 'bump'];
const gaitOf = r => GAIT[r.spec.gait || 'normal'];

function makeRunner(index, spec, isPlayer, lane) {
  const r = {
    index, spec, isPlayer, lane,
    dist: 0, v: 0, laneInput: 0, stamina: 100, pressure: 0,
    railPush: 0, whipPower: 0, holdRein: false, paceOffset: 0,
    staminaK: 1, topBonus: 0, pressureK: 1, jockey: JOCKEY.player,
    passTimes: {}, stars: 0, exhausted: false, blocked: false, draft: false, finished: false, finishTime: 0,
    lastWhipTime: -10, lastWhipCost: 0, drive: 0, lastWhipShown: true, lastShowTime: -10,
    aiCooldown: 0, aiLaneTarget: lane, aiSkill: 1, aiReserve: 10, hidden: false,
  };
  for (const t of TIMERS) r[t] = 0;
  return r;
}

export class RaceSim {
  // def: レース / playerSpec: 自分の馬 (育った能力込み) / extra: 幻影賞 (幻影は途中から現れる)
  constructor({ def, playerSpec, playerGate, seed, extra = false }) {
    this.def = def;
    this.shape = courseShape(def.venue);
    this.distance = def.distance;
    this.time = 0;
    this.started = false;
    this.events = [];
    this.finishOrder = [];
    this.extra = extra;
    this.phantomOut = false;
    const rng = makeRng(seed);
    const names = rng.shuffle(RIVAL_NAMES);
    const styleBag = rng.shuffle(['nige', 'senko', 'senko', 'sashi', 'sashi', 'oikomi', 'senko', 'sashi']);
    const jockeyBag = rng.shuffle(JOCKEY.pool);
    const rivalHere = rivalsFor(def.name);
    const list = [];
    for (let gate = 0; gate < 8; gate++) {
      const lane = 0.06 + gate * 0.115;
      const lv = def.level, base = 2.2 + lv * 0.44;
      const stat = () => clamp(Math.round(base + rng.range(-1.2, 1.4)), 2, 9);
      const coat = rng.pick(RIVAL_COATS);
      const silk = rng.pick(RIVAL_SILKS);
      let spec = {
        id: 'r' + gate, name: names.shift(), female: rng() < 0.5, speed: stat(), stamina: stat(), guts: stat(), style: styleBag.shift(),
        coat, mane: coat === COAT.gray ? COAT.gray : 0x1A1A1A, silk, silk2: 0xFFFFFF, gait: 'normal', tail: 'normal',
      };
      let jockey = null;
      // 物語のライバル: 主役は 3 つ隣、集結の回はほかの枠にも
      const k = [3, 5, 1, 6, 2].slice(0, rivalHere.length).findIndex(o => gate === (playerGate + o) % 8);
      if (k >= 0) {
        spec = Object.assign({}, rivalHere[k].spec);
        jockey = rivalHere[k].jockey;
        if (spec.id === 'goldrush') { spec.speed += Math.floor(lv); spec.stamina += Math.floor(lv / 2); }
      }
      if (gate === playerGate) { list.push(makeRunner(gate, playerSpec, true, lane)); continue; }
      const r = makeRunner(gate, spec, false, lane);
      r.paceOffset = STYLE[spec.style].pace;
      r.jockey = jockey || jockeyBag.shift();
      r.aiSkill = 0.75 + Math.min(0.35, lv * 0.07) + rng.range(-0.08, 0.08);
      r.aiReserve = rng.range(4, 14);
      r.aiLaneTarget = rng.range(0.05, 0.35);
      list.push(r);
    }
    for (const r of list) if (r.isPlayer) r.paceOffset = STYLE[r.spec.style].pace;
    this.runners = list;
    this.player = list.find(r => r.isPlayer);
    this.items = RaceSim.makeItems(def.distance, def.rain, rng);
    this.hills = HILLS[def.venue] || [];
    this.avgSpeed = list.reduce((a, r) => a + r.spec.speed, 0) / list.length;
    this.rng = rng;
    this.phantom = list.find(r => r.spec.id === 'phantom') || null;
    if (this.phantom && extra) this.phantom.hidden = true;
  }

  // このレースのライバル (物語のライバルがいればその馬、いなければいちばん強い馬)
  get rival() {
    const main = rivalsFor(this.def.name)[0];
    if (main) { const r = this.runners.find(o => o.spec.id === main.spec.id); if (r) return r; }
    const s = this.runners.find(o => STORY_NAMES.has(o.spec.name) && !o.isPlayer);
    if (s) return s;
    const sum = r => r.spec.speed + r.spec.stamina + r.spec.guts;
    return this.runners.filter(o => !o.isPlayer).reduce((a, b) => sum(a) >= sum(b) ? a : b);
  }

  static makeItems(distance, rain, rng) {
    const out = [];
    let d = 150;
    const weights = [['herb', 18], ['wind', 14], ['web', 9], ['stump', 11], ['bag', 11], ['star', 16],
      ['sugar', 14], ['bell', 3], ['charm', 8], ['mud', rain ? 18 : 6], ['crow', 7]];
    const total = weights.reduce((a, w) => a + w[1], 0);
    while (d < distance - 120) {
      const count = rng.int(1, 2);
      for (let i = 0; i < count; i++) {
        let roll = Math.floor(rng() * total), kind = 'herb';
        for (const [k, w] of weights) { if (roll < w) { kind = k; break; } roll -= w; }
        out.push({ dist: d + rng.range(-10, 10), lane: rng.range(0.05, 0.95), kind, taken: false });
      }
      d += rng.range(90, 150);
    }
    return out;
  }

  // ---- コース
  remaining(r) { return Math.max(0, this.distance - r.dist); }
  get lapLength() { return this.shape.lap; }
  get homeStraight() { return this.shape.straight; }
  lapPos(rem) { return ((rem % this.lapLength) + this.lapLength) % this.lapLength; }
  isCorner(rem) {
    const m = this.lapPos(rem), S = this.shape.straight, C = Math.PI * this.shape.innerR;
    return (m >= S && m < S + C) || m >= 2 * S + C;
  }
  cornerName(rem) {
    const m = this.lapPos(rem), S = this.shape.straight, C = Math.PI * this.shape.innerR;
    if (m >= S && m < S + C / 2) return '第4コーナー';
    if (m >= S + C / 2 && m < S + C) return '第3コーナー';
    if (m >= 2 * S + C && m < 2 * S + 1.5 * C) return '第2コーナー';
    if (m >= 2 * S + 1.5 * C) return '第1コーナー';
    return null;
  }
  elevationAt(m) {
    let h = 0;
    for (const [center, half, height] of this.hills) {
      const k = this.lapLength / 1600;
      let d = Math.abs(m - center * k);
      d = Math.min(d, this.lapLength - d);
      if (d < half) h += height * 0.5 * (1 + Math.cos(Math.PI * d / half));
    }
    return h;
  }
  elevation(rem) { return this.elevationAt(this.lapPos(Math.max(0, rem))); }
  grade(rem) { return (this.elevation(rem - 1) - this.elevation(rem + 1)) / 2 * 100; }
  slopeEffect(r) {
    const g = this.grade(this.remaining(r));
    if (g > 0) return -g * 0.34 * (r.charm > 0 ? 0.5 : 1.25 - r.spec.guts * 0.07);
    return -g * 0.22;
  }

  // ---- 能力から決まる速さ
  cruise(r) {
    const sp = r.spec.speed;
    const mid = this.remaining(r) > STYLE[r.spec.style].spurtFrom;
    let c = 16 + (mid ? this.avgSpeed * 0.1 + (sp - this.avgSpeed) * 0.03 : sp * 0.1);
    if (this.def.rain || this.def.surface === 'dirt') c -= 0.3;
    if (r.exhausted) return 12.5;
    if (r.balk > 0) c -= 2.2;
    if (r.stump > 0) c -= 4.0;
    if (r.mud > 0) c -= 2.0;
    c -= (1 - Math.max(0, r.stamina) / 100) * 0.6;
    c += this.slopeEffect(r);
    return c;
  }
  top(r) {
    if (r.exhausted) return 13.0;
    let t = 17.4 + r.spec.speed * 0.22 + gaitOf(r).topDelta;
    if (this.remaining(r) < this.homeStraight) t += r.spec.guts * 0.2 * STYLE[r.spec.style].gutsFactor;
    if (r.wind > 0) t += 2.0;
    if (r.hyper > 0) t += 3.6;
    if (r.charm > 0) t += 0.8;
    t += r.topBonus;
    if (r.crow > 0) t += 1.6;
    t += this.slopeEffect(r);
    t -= (1 - Math.max(0, r.stamina) / 100) * 1.6;
    if (r.stump > 0) t = this.cruise(r);
    return t;
  }
  staminaUse(r) {
    let u = 1.3 - r.spec.stamina * 0.085;
    if (this.def.rain) u *= 1.12;
    if (this.def.surface === 'dirt') u *= 1.08;
    return Math.max(0.45, u) * r.staminaK;
  }

  // ---- 操作
  canAct(r) { return this.started && !r.finished && r.web <= 0 && !r.hidden; }

  // 手綱: 小さく加速。ムチのあと ちょうどよい間で入れると「見せムチ」(ムチで使った体力が戻る)
  rein(r) {
    if (!this.canAct(r) || r.exhausted) return;
    const since = this.time - r.lastWhipTime;
    if (since > 0.19 && since < 0.45 && !r.lastWhipShown && this.time - r.lastShowTime > 1.9) {
      r.stamina = Math.min(100, r.stamina + r.lastWhipCost);
      r.lastWhipShown = true;
      r.lastShowTime = this.time;
      this.events.push({ t: 'show', i: r.index });
      r.rein = Math.max(r.rein, 2.0);
      return;
    }
    r.rein = 2.0;
    const c = this.cruise(r);
    if (r.v < c) r.v = Math.min(c, r.v + 0.45);
    r.stamina -= 0.12 * this.staminaUse(r);
  }

  // ムチ: power 1=軽く 2=ふつう 3=強く
  whip(r, power = 2) {
    if (!this.canAct(r) || r.exhausted) return false;
    const p = clamp(power, 1, 3);
    const gain = [0, 0.55, 0.9, 1.35][p] * gaitOf(r).whipK;
    const costK = [0, 0.4, 0.75, 1.6][p];
    const pressK = [0, 0.5, 0.8, 1.5][p];
    if (r.balk > 0) {
      r.balk = Math.min(4.5, r.balk + 0.4);
      r.stamina -= 1.2 * this.staminaUse(r);
      return false;
    }
    if (this.remaining(r) > 300) {
      if (r.pressure > 5.5) {
        r.balk = 3.0;
        r.pressure = 1.5;
        this.events.push({ t: 'balk', i: r.index });
        return false;
      }
      r.pressure += pressK * r.pressureK;
    }
    r.whipPower = p;
    r.whipPowerTimer = 1.0;
    r.drive = Math.min(1, r.drive + [0, 0.25, 0.4, 0.6][p]);
    r.rein = Math.max(r.rein, 0.6);
    r.v = Math.min(this.top(r) + (p === 3 ? 0.6 : 0), r.v + gain);
    const cost = 0.95 * costK * this.staminaUse(r);
    r.stamina -= cost;
    r.lastWhipTime = this.time;
    r.lastWhipCost = cost;
    r.lastWhipShown = false;
    this.events.push({ t: 'whip', i: r.index, power: p });
    return true;
  }

  aheadBlocker(r, range = 3.2) {
    let best = null;
    for (const o of this.runners) {
      if (o === r || o.hidden) continue;
      const dd = o.dist - r.dist;
      if (dd > 0 && dd < range && Math.abs(o.lane - r.lane) < 0.13 && (!best || dd < best.dist - r.dist)) best = o;
    }
    return best;
  }

  // 馬群割り: 前の馬を押しのける
  push(r) {
    if (!this.canAct(r) || r.exhausted) return;
    r.stamina -= 2.5 * this.staminaUse(r);
    const a = this.aheadBlocker(r, 6);
    if (!a) { r.v = Math.min(this.top(r), r.v + 0.3); this.events.push({ t: 'pushAir', i: r.index }); return; }
    const chance = 0.6 + (r.spec.guts - a.spec.guts) * 0.08 + (r.charm > 0 ? 0.3 : 0);
    const ok = this.rng() < chance;
    if (ok) {
      const dir = a.lane <= r.lane ? -1 : 1;
      a.lane = clamp(a.lane + dir * 0.3, 0, 1);
      if (a.lane <= 0.001 || a.lane >= 0.999) r.lane = clamp(r.lane - dir * 0.15, 0, 1);
      a.v = Math.max(9, a.v - 1.3);
      a.stamina -= 3 * this.staminaUse(a);
      r.v = Math.min(this.top(r) + 0.3, r.v + 0.7);
    } else r.v = Math.max(9, r.v - 0.6);
    this.events.push({ t: 'push', i: r.index, target: a.index, ok });
  }

  // ブレーキ (控える): 体力温存。真後ろの馬をつかえさせる
  brake(r) {
    if (!this.canAct(r)) return;
    r.v = Math.max(9, r.v - 1.6);
    r.stamina = Math.min(100, r.stamina + 2.5);
    r.pressure = Math.max(0, r.pressure - 1);
    for (const o of this.runners) {
      const dd = r.dist - o.dist;
      if (o !== r && dd > 0 && dd < 3.5 && Math.abs(o.lane - r.lane) < 0.14) o.v -= 0.9;
    }
    this.events.push({ t: 'brake', i: r.index });
  }

  get dashReady() { return this.player.stars >= 3 && this.player.hyper <= 0; }

  // 流星ダッシュ (★ 3 つ)
  dash(r) {
    if (!this.canAct(r) || r.stars < 3) return;
    r.stars = 0;
    r.hyper = 5.0;
    r.exhausted = false;
    r.balk = 0;
    r.v = this.top(r);
    this.events.push({ t: 'dash', i: r.index });
  }

  // ---- 進行
  start() { this.started = true; }

  step(dt) {
    if (!this.started) return;
    this.holdPhantom();
    this.time += dt;
    for (const r of this.runners) if (!r.isPlayer && !r.finished && !r.hidden) this.think(r, dt);
    for (const r of this.runners) if (!r.hidden) this.advance(r, dt);
    this.resolveBlocking();
    this.pickItems();
    for (const r of this.runners) for (const mark of [800, 600]) {
      if (r.passTimes[mark] === undefined && this.distance - r.dist <= mark) r.passTimes[mark] = this.time;
    }
    for (const r of this.runners) {
      if (!r.finished && !r.hidden && r.dist >= this.distance) {
        r.finished = true;
        r.finishTime = this.time - (r.dist - this.distance) / Math.max(1, r.v);
        this.finishOrder.push(r.index);
        this.events.push({ t: 'finish', i: r.index });
      }
    }
    this.finishOrder.sort((a, b) => this.runners[a].finishTime - this.runners[b].finishTime);
  }

  // 幻影賞: 幻影はゲートに入らず、自分の馬がレースの半分を過ぎたころ、すぐ後ろに現れて外から超速で抜いていく
  holdPhantom() {
    const ph = this.phantom;
    if (!this.extra || !ph || this.phantomOut) return;
    ph.dist = 0; ph.v = 0;
    if (this.started && this.player.dist > this.distance * 0.55) {
      const p = this.player;
      this.phantomOut = true;
      ph.hidden = false;
      ph.dist = Math.max(0, p.dist - 14);
      ph.v = p.v + 3;
      ph.lane = Math.min(0.95, p.lane + 0.18);
      ph.aiLaneTarget = 0.95;
      ph.topBonus = 0.3;
      ph.paceOffset = 0.25;
      ph.stamina = 100;
      ph.drive = 1;
      ph.aiSkill = 1.4;
      this.events.push({ t: 'reveal', i: ph.index });
    }
  }

  advance(r, dt) {
    if (r.finished) { r.v = Math.max(8, r.v - 2.5 * dt); r.dist += r.v * dt; return; }
    for (const t of TIMERS) r[t] = Math.max(0, r[t] - dt);
    if (r.holdRein && !r.exhausted) r.rein = Math.max(r.rein, 0.3);
    const c = this.cruise(r), t = this.top(r);
    let target = (r.rein > 0 || r.exhausted) ? c + r.paceOffset : c - 1.2;
    r.drive = Math.max(0, r.drive - 0.28 * dt);
    if (r.drive > 0 && !r.exhausted) target = Math.max(target, c + (t - c) * r.drive);
    if (r.lane < 0.13) target -= 0.7 * (1 - r.lane / 0.13);           // 内ラチ沿いは荒れている
    if (!r.isPlayer && !r.exhausted && this.remaining(r) > STYLE[r.spec.style].spurtFrom && this.time > 8) {
      let ahead = Infinity, behind = Infinity;
      for (const o of this.runners) {
        if (o === r || o.hidden) continue;
        if (o.dist > r.dist) ahead = Math.min(ahead, o.dist - r.dist); else behind = Math.min(behind, r.dist - o.dist);
      }
      if (ahead < Infinity && ahead > 4) target += Math.min(0.9, (ahead - 4) * 0.12);
      if (ahead === Infinity && behind > 6) target -= Math.min(0.6, (behind - 6) * 0.08);
      const lead = r.dist - this.player.dist;
      if (lead > 12) target -= Math.min(0.6, (lead - 12) * 0.05);
    }
    if (r.v < target - 0.2 && this.time < 8) {
      r.v = Math.min(target, r.v + (2.6 + STYLE[r.spec.style].startBonus + gaitOf(r).startDelta) * dt);
    } else r.v += (target - r.v) * (r.v > target ? 0.9 : 0.6) * dt;
    if (r.hyper > 0) r.v = Math.max(r.v, t - 0.2);
    if (r.wind > 0) r.v = Math.max(r.v, c + 1.5);
    r.v = Math.min(r.v, t + (r.whipPowerTimer > 0.7 && r.whipPower === 3 ? 0.6 : 0));
    if (r.stump > 0) r.v = Math.min(r.v, c);

    if (r.hyper <= 0) {
      const use = this.staminaUse(r);
      if (r.v > c + 0.2) r.stamina -= (r.v - c) * 0.42 * use * dt;
      else if (r.v < c - 0.3) r.stamina = Math.min(100, r.stamina + 1.6 * dt);
      r.stamina -= 0.05 * use * dt * (this.distance / 1600);
      if (r.paceOffset > 0 && r.rein > 0) r.stamina -= r.paceOffset * 2.6 * use * dt;
      if (r.paceOffset < 0 && r.rein > 0) r.stamina = Math.min(100, r.stamina - r.paceOffset * 1.6 * dt);
      if (this.aheadBlocker(r, 4.5) && r.v > c - 0.5) {
        r.stamina = Math.min(100, r.stamina + 0.35 * dt);
        r.draft = true;
      } else {
        r.draft = false;
        if (this.remaining(r) > this.homeStraight && !this.runners.some(o => o !== r && !o.hidden && o.dist > r.dist && o.dist - r.dist < 10)) {
          r.stamina -= 0.15 * use * dt;
        }
      }
      const g = this.grade(this.remaining(r));
      if (g > 0) r.stamina -= g * 0.16 * use * dt * (r.charm > 0 ? 0.5 : 1);
      if (r.crow > 0) r.stamina -= 2.0 * dt;
    }
    if (r.stamina <= 0 && !r.exhausted) {
      r.stamina = 0;
      r.exhausted = true;
      this.events.push({ t: 'exhausted', i: r.index });
    }
    r.pressure = Math.max(0, r.pressure - 0.45 * dt);

    if (r.crow > 0) r.lane = clamp(r.lane + Math.sin(this.time * 9 + r.index) * 0.5 * dt, 0, 1);
    if (r.web <= 0) {
      const to = clamp(r.lane + r.laneInput * 0.42 * dt, 0, 1);
      const o = this.sideNeighbor(r, to);
      if (!o) r.lane = to;
      else if (r.isPlayer && Math.abs(r.laneInput) > 0.3 && r.bump <= 0) {
        // 体当たり: 横に並んだ馬へ寄せると、ガッツの勝負で押しのける
        r.bump = 0.7;
        const dir = r.laneInput > 0 ? 1 : -1;
        const win = (r.spec.guts - o.spec.guts) * 0.1 + 0.6 > ((Math.floor(this.time * 1000) + o.index * 37) % 100) / 100;
        if (win) {
          o.lane = clamp(o.lane + dir * 0.14, 0, 1); o.v = Math.max(9, o.v - 0.9); o.stamina -= 2 * this.staminaUse(o);
          r.lane = clamp(r.lane + dir * 0.05, 0, 1); r.stamina -= 1 * this.staminaUse(r);
        } else {
          r.lane = clamp(r.lane - dir * 0.06, 0, 1); r.v = Math.max(9, r.v - 0.5); r.stamina -= 1.5 * this.staminaUse(r);
        }
        this.events.push({ t: 'push', i: r.index, target: o.index, ok: win, bump: true });
      }
      const intoInner = r.lane <= 0.001 && r.laneInput < -0.3;
      const intoOuter = r.lane >= 0.999 && r.laneInput > 0.3;
      if (intoInner || intoOuter) {
        r.railPush += dt;
        if (r.railPush > 0.1 && r.railTimer <= 0) {
          r.v = Math.max(8, r.v - 2.2);
          r.stamina = Math.max(0, r.stamina - 1.5);
          r.pressure += 0.6;
          r.railTimer = 0.7;
          r.railPush = 0;
          r.lane = intoInner ? 0.04 : 0.96;
          this.events.push({ t: 'rail', i: r.index, inner: intoInner });
        }
      } else r.railPush = 0;
    }
    let gain = r.v * dt;
    if (this.isCorner(this.remaining(r))) gain *= 1 - 0.06 * r.lane;  // コーナーは外を回るほど損
    r.dist += gain;
  }

  sideNeighbor(r, toLane) {
    return this.runners.find(o => o !== r && !o.finished && !o.hidden && Math.abs(o.dist - r.dist) < 2.0 &&
      Math.abs(o.lane - toLane) < 0.1 && Math.abs(o.lane - r.lane) >= Math.abs(o.lane - toLane)) || null;
  }

  resolveBlocking() {
    for (const r of this.runners) {
      if (r.finished || r.hidden) continue;
      r.blocked = false;
      const a = this.aheadBlocker(r);
      if (a && a.v < r.v) { r.v = Math.max(a.v - 0.05, 8); r.blocked = true; }
    }
  }

  pickItems() {
    this.items.forEach((it, i) => {
      if (it.taken) return;
      for (const r of this.runners) {
        if (r.finished || r.hidden) continue;
        if (r.dist >= it.dist && r.dist - it.dist < 5 && Math.abs(r.lane - it.lane) < 0.15) {
          if (!r.isPlayer && (r.index * 7 + i * 13) % 4 !== 0) continue;   // 相手馬はたまたま踏むだけ
          it.taken = true;
          this.apply(it.kind, r);
          break;
        }
      }
    });
  }

  apply(kind, r) {
    let k = kind;
    if (k === 'bag') k = ['herb', 'wind', 'web', 'stump', 'sugar', 'mud', 'crow', 'charm'][Math.floor(this.rng() * 8)];
    switch (k) {
      case 'herb': r.stamina = Math.min(100, r.stamina + 25); r.pressure = Math.max(0, r.pressure - 2); r.happy = 1.5; break;
      case 'wind': r.wind = 4.0; r.happy = 1.5; break;
      case 'web': r.web = 3.5; r.laneInput = 0; break;
      case 'stump': r.stump = 2.4; r.v *= 0.72; break;
      case 'star': if (r.isPlayer) r.stars = Math.min(3, r.stars + 1); r.happy = 1.0; break;
      case 'sugar': r.stamina = Math.min(100, r.stamina + 14); r.happy = 1.2; break;
      case 'bell': r.stamina = 100; r.pressure = 0; r.exhausted = false; r.happy = 2.5; break;
      case 'charm': r.charm = 6.0; r.happy = 1.0; break;
      case 'mud': r.mud = 1.6; r.v *= 0.86; break;
      case 'crow': r.crow = 2.6; break;
    }
    this.events.push({ t: 'item', i: r.index, kind: k, from: kind });
  }

  // ---- 相手馬の考え
  think(r, dt) {
    const rem = this.remaining(r), rng = this.rng, st = STYLE[r.spec.style];
    const ranked = this.runners.filter(o => !o.hidden).sort((a, b) => b.dist - a.dist);
    const myRank = ranked.indexOf(r) / 7;
    const blk = this.aheadBlocker(r, 5);
    if (r.blocked || blk) {
      r.aiLaneTarget = Math.min(0.95, r.lane + 0.2);
      if (blk && blk.lane > r.lane) r.aiLaneTarget = Math.max(0.15, r.lane - 0.2);
    } else if (rem > 450 && rng() < 0.25 * dt) r.aiLaneTarget = Math.max(0.15, r.aiLaneTarget - 0.1);
    const dl = r.aiLaneTarget - r.lane;
    r.laneInput = Math.abs(dl) < 0.02 ? 0 : (dl > 0 ? 0.8 : -0.8);

    r.aiCooldown -= dt;
    if (r.aiCooldown > 0) return;
    r.aiCooldown = rng.range(0.28, 0.5) / r.aiSkill;
    if (rem < st.spurtFrom) r.aiCooldown *= 1.9;
    const spurt = rem < st.spurtFrom;
    const earlyNige = r.spec.style === 'nige' && r.dist < 250;
    const wantForward = myRank > st.preferredRank + 0.2;
    if (r.exhausted) return;
    if (spurt || earlyNige) {
      if ((r.stamina > r.aiReserve || rem < 200) && (rem <= 300 || r.pressure < 3)) this.whip(r, rem < 250 ? 3 : 2);
      else this.rein(r);
    } else if (wantForward && r.stamina > 60 && r.pressure < 2 && rng() < 0.3) this.whip(r, 1);
    else if (r.rein < 0.5) this.rein(r);
  }

  // ---- 出馬表の予想
  forecast() {
    if (this._fc) return this._fc;
    const rng = makeRng(this.def.distance * 31 + Math.round(this.def.level * 10));
    const longK = this.distance / 2000;
    const vis = this.runners.filter(r => !r.hidden);
    const score = new Map(vis.map(r => [r, r.spec.speed * 1.3 + r.spec.stamina * longK + r.spec.guts * 0.8 + rng() * 1.5]));
    const ranked = vis.slice().sort((a, b) => score.get(b) - score.get(a));
    const marks = ['◎', '○', '▲', '△', '△', '', '', ''];
    const f = { pop: {}, marks: {} };
    ranked.forEach((r, i) => { f.pop[r.index] = i + 1; f.marks[r.index] = marks[i] || ''; });
    const fav = ranked[0].spec.name, pr = ranked.indexOf(this.player) + 1;
    f.comment = pr === 1 ? `本命は${fav}。今日は負けられない一戦だ！` : (pr <= 3 ? `◎${fav}が有力。あなたの馬も十分チャンスあり！` : `${fav}で堅い。あなたの馬は${pr}番人気…一発あるか？`);
    this._fc = f;
    return f;
  }

  // ---- 結果
  standing(r) {
    const k = this.finishOrder.indexOf(r.index);
    if (k >= 0) return k + 1;
    return this.finishOrder.length + this.runners.filter(o => !o.finished && !o.hidden && o.dist > r.dist).length + 1;
  }
  get allFinished() { return this.runners.every(r => r.finished || r.hidden); }
  finalOrder() {
    return this.finishOrder.map(i => this.runners[i]).concat(this.runners.filter(r => !r.finished && !r.hidden).sort((a, b) => b.dist - a.dist));
  }
  static margin(gap, speed = 17) {
    const b = gap * speed / 2.4;
    if (b < 0.08) return 'ハナ';
    if (b < 0.2) return 'アタマ';
    if (b < 0.35) return 'クビ';
    if (b < 0.65) return '1/2';
    if (b < 0.9) return '3/4';
    if (b >= 10) return '大差';
    const whole = Math.floor(b), frac = b - whole;
    if (frac < 0.25) return `${whole}`;
    if (frac < 0.75) return `${whole} 1/2`;
    return `${whole + 1}`;
  }
  static formatTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  }
}
