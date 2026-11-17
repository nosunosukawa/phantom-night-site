// ドット絵を作る。馬の走りは元アプリの写真起こし (マイブリッジ・パブリックドメイン)、背景はウェブ版の描き下ろし。
import { GW, GH, FEET_Y, SADDLE, FRAMES } from './gallop-data.js';

export const SIDE_PAD = 14;                 // 尻尾をなびかせるための左右の余白
export const SPR_W = GW + SIDE_PAD * 2;     // 108
export const SPR_H = GH;                    // 52
export const SPR_FEET = FEET_Y;             // 足もとの行
export const FRAME_COUNT = FRAMES.length;

export const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
export function shade(c, k) {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
export function mix(a, b, t) {
  const ch = s => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

// 上が y=0 のドット用キャンバス
export class Px {
  constructor(w, h) {
    this.cv = makeCanvas(w, h);
    this.g = this.cv.getContext('2d');
    this.w = w; this.h = h;
    this.ox = 0;
  }
  rect(x, y, w, h, c, a = 1) {
    if (w <= 0 || h <= 0) return;
    this.g.globalAlpha = a;
    this.g.fillStyle = hex(c);
    this.g.fillRect(x + this.ox, y, w, h);
    this.g.globalAlpha = 1;
  }
  px(x, y, c, a = 1) { this.rect(x, y, 1, 1, c, a); }
  dither(x, y, w, h, a, b) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, (xx + yy) % 2 === 0 ? a : b);
  }
  ellipse(x, y, w, h, c) {
    if (w <= 0 || h <= 0) return;
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    for (let yy = y; yy < y + h; yy++) {
      const dy = (yy + 0.5 - cy) / ry, t = 1 - dy * dy;
      if (t < 0) continue;
      const half = rx * Math.sqrt(t);
      const x0 = Math.ceil(cx - half - 0.5), x1 = Math.floor(cx + half - 0.5);
      if (x1 >= x0) this.rect(x0, yy, x1 - x0 + 1, 1, c);
    }
  }
  line(x0, y0, x1, y1, c, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const off = Math.floor((width - 1) / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      this.rect(x - off, y - off, width, width, c);
    }
  }
}

// 再現できる乱数 (絵の散らし用)
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 馬と騎手

// 尻尾: つけ根から後ろへ流れる、ひとかたまりの毛。波が根元から毛先へ伝わる。幻影は縁と毛すじが金に光る
function drawTail(c, spec, root, f, base) {
  const phantom = spec.tail === 'phantom', fluffy = spec.tail === 'fluffy';
  const maxL = root[0] + SIDE_PAD - 1;
  const L = Math.min(maxL, phantom ? 17 : (fluffy ? 11 : 14));
  const lift = 2, droop = fluffy ? 4 : 6, amp = phantom ? 2.0 : 1.5, w0 = fluffy ? 2.4 : 1.7;
  const ph = 2 * Math.PI * f / FRAME_COUNT;
  const dark = base === 0x1A1A1A || base === 0x111111;
  const col = phantom ? 0x1A1622 : (dark ? 0x26262C : base);
  const edge = phantom ? 0xC89A30 : shade(dark ? 0x2A2A30 : base, 0.45);
  const streak = phantom ? 0x3A2E48 : shade(dark ? 0x2A2A30 : base, 0.72);
  const shine = phantom ? 0xFFE890 : shade(dark ? 0x40404A : base, 1.3);
  const center = t => {
    const u = t / L;
    return root[1] - lift * Math.sin(Math.PI * Math.min(1, u * 1.4)) + droop * u * u + amp * Math.sin(ph - t * 0.32) * u;
  };
  const half = t => {
    const u = t / L;
    return Math.max(0.6, w0 * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.6))) * (1 - u * 0.55));
  };
  const x0 = root[0], n = Math.floor(L);
  for (let t = 0; t <= n; t++) {
    const cy = center(t), hw = half(t), top = Math.round(cy - hw), bot = Math.round(cy + hw);
    c.rect(x0 - t, top - 1, 1, bot - top + 3, edge);
  }
  for (let t = 0; t <= n; t++) {
    const cy = center(t), hw = half(t), top = Math.round(cy - hw), bot = Math.round(cy + hw);
    c.rect(x0 - t, top, 1, bot - top + 1, col);
  }
  [-0.45, 0.1, 0.55].forEach((off, k) => {
    let prev = null;
    for (let t = 2; t <= L - 2; t++) {
      const p = [x0 - t, Math.round(center(t) + off * half(t))];
      if (prev && t % 5 !== (k * 2) % 5) c.line(prev[0], prev[1], p[0], p[1], k === 0 ? shine : streak);
      prev = p;
    }
  });
  for (let k = 0; k < 4; k++) {
    const t = L - k * 1.5;
    const y = Math.round(center(t) + (k - 1.5) * half(t) * 0.8);
    const len = 2 + (k + f) % 3;
    c.line(x0 - Math.floor(t), y, x0 - Math.floor(t) - len, y + (k % 2 === 0 ? 1 : -1) * (fluffy ? 2 : 1), k % 2 === 0 ? col : streak);
  }
  if (phantom && f % 3 === 0) {
    const t = L - 1;
    c.px(x0 - Math.floor(t) - 3, Math.floor(center(t)) - 2, 0xFFFFFF);
    c.px(x0 - Math.floor(t) - 5, Math.floor(center(t)), 0xFFF6C0);
  }
}

// 騎手 (鞍の位置に低く、前かがみ)
function drawJockey(c, spec, face, f, sx, sy, eyeAt, cap) {
  const silk = spec.silk, silk2 = spec.silk2;
  const ox = sx - 2, oy = sy + 2;
  c.rect(ox - 8, oy - 2, 13, 3, 0x3A2214);                      // 鞍
  c.rect(ox - 7, oy - 1, 10, 4, 0xF8F8F8);                      // ゼッケン
  c.rect(ox - 7, oy - 1, 10, 1, cap);
  c.line(ox - 1, oy - 3, ox + 5, oy - 5, 0x101010, 3);          // もも
  c.line(ox - 1, oy - 3, ox + 5, oy - 5, 0xF4F4F4);
  c.line(ox + 5, oy - 5, ox + 4, oy + 1, 0x101010, 3);          // 長靴
  c.line(ox + 5, oy - 4, ox + 4, oy, 0x404040);
  c.ellipse(ox - 4, oy - 10, 11, 7, 0x101010);                  // 胴
  c.ellipse(ox - 3, oy - 9, 9, 5, silk);
  c.rect(ox, oy - 9, 3, 5, silk2);
  if (face === 'whip' && f % 2 === 0) {
    c.line(ox, oy - 9, ox - 5, oy - 15, silk, 2);                // ムチを振り上げる
    c.line(ox - 5, oy - 15, ox - 11, oy - 14, 0x3A2A1A);
  } else {
    c.line(ox + 5, oy - 8, ox + 10, oy - 5, 0x101010, 3);
    c.line(ox + 5, oy - 8, ox + 10, oy - 5, silk);               // 腕
    if (eyeAt) c.line(ox + 10, oy - 5, eyeAt[0] - 3, eyeAt[1] + 4, 0x3A2010);   // 手綱
  }
  c.ellipse(ox + 5, oy - 14, 7, 6, 0x101010);                   // ヘルメット
  c.ellipse(ox + 6, oy - 13, 5, 4, cap);
  c.px(ox + 7, oy - 13, shade(cap, 1.5));
  c.rect(ox + 9, oy - 10, 2, 2, spec.id === 'phantom' ? 0xC8C8D8 : 0xF0C8A0);
  c.rect(ox + 9, oy - 11, 3, 1, spec.id === 'phantom' ? 0xE0B830 : 0x70C0F0);
}

function drawHorse(c, spec, f, face, cap) {
  const coat = spec.coat, mane = spec.mane;
  const ol = shade(coat, 0.36), hi = shade(coat, 1.3), dk = shade(coat, 0.7);
  const maneC = mane === coat ? shade(coat, 0.5) : mane;
  const rows = FRAMES[f];
  let eyeAt = null, root = null;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    if (rows[y][x] === 't' && (!root || x > root[0])) root = [x + 2, y];
  }
  if (root) drawTail(c, spec, root, f, maneC);
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'o') c.px(x, y, ol);
      else if (ch === 'd') c.px(x, y, dk);
      else if (ch === 'm') c.px(x, y, coat);
      else if (ch === 'l') c.px(x, y, hi);
      else if (ch === 'h') c.px(x, y, 0x2A1E16);
      else if (ch === 'e') { c.px(x, y, coat); eyeAt = [x, y]; }
    }
  }
  if (eyeAt) {
    const [ex, ey] = eyeAt;
    c.line(ex - 5, ey, ex - 3, ey + 6, spec.id === 'phantom' ? 0xE0B830 : 0xF0F0F0);      // 頬革
    if (spec.id === 'phantom') {
      c.rect(ex - 2, ey, 2, 2, 0xFFE890);                                                 // 金に光る目
    } else if (face === 'tired') {
      c.rect(ex - 2, ey + 1, 2, 1, 0x101010);
    } else if (face === 'whip') {
      c.rect(ex - 2, ey, 2, 2, 0xFFFFFF); c.px(ex - 1, ey + 1, 0x101010);
    } else {
      c.rect(ex - 2, ey, 2, 2, 0x101010); c.px(ex - 1, ey, 0xF0F0F0); c.px(ex - 2, ey - 1, shade(coat, 0.45));
    }
    if (face === 'tired') c.dither(ex - 14, ey + 4, 6, 3, 0xF8F8F8, coat);                  // 汗
  }
  const [sx, sy] = SADDLE[f];
  drawJockey(c, spec, face, f, sx, sy, eyeAt, cap);
}

const horseCache = new Map();
// 横から見た馬と騎手の 15 コマ。face: 'run' ふつう / 'whip' ムチ / 'tired' バテた
export function horseFrames(spec, face = 'run', cap = null) {
  const cp = cap === null ? (spec.cap !== undefined ? spec.cap : spec.silk2) : cap;
  const key = [spec.id, spec.coat, spec.mane, spec.silk, spec.silk2, cp, face].join(':');
  if (horseCache.has(key)) return horseCache.get(key);
  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const c = new Px(SPR_W, SPR_H);
    c.ox = SIDE_PAD;
    drawHorse(c, spec, i, face, cp);
    frames.push(c.cv);
  }
  horseCache.set(key, frames);
  return frames;
}

// 絵の形だけを 1 色で塗ったもの (幻影の金のふちどり・残像・影に使う)
const tintCache = new Map();
export function tinted(frames, color, key) {
  const k = key + ':' + color;
  if (tintCache.has(k)) return tintCache.get(k);
  const out = frames.map(src => {
    const cv = makeCanvas(src.width, src.height);
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = hex(color);
    g.fillRect(0, 0, cv.width, cv.height);
    return cv;
  });
  tintCache.set(k, out);
  return out;
}

// ---------------------------------------------------------------- 競馬場 (昼・雨・ダート・夜)

export const NIGHT = { turf: 0x0F3B2C, goldDeep: 0xC89A30, skyTop: 0x05061A };

// 場面の色。def = レース、night = 幻影賞
export function themeOf(def, night) {
  const dirt = def.surface === 'dirt', rain = def.rain;
  if (night) return { key: 'night', night: true, rain: false, dirt: false,
    sky: [0x05061A, 0x070920, 0x0B1034, 0x101440, 0x1A1E52, 0x2A2A66], stars: true,
    ground: [0x0F3B2C, 0x0B3024, 0x15493A, 0x1E5A44], hedge: [0x0A2A22, 0x124034], rail: [0xD8DCEC, 0x8088A8],
    city: [0x0A0C26, 0x12163A], lit: true, trees: 0x071A18, crowd: [0x0A0C20, 0x04050E], fog: null };
  if (rain) return { key: 'rain' + (dirt ? 'd' : ''), night: false, rain: true, dirt,
    sky: [0x5A6270, 0x646C7A, 0x6E7684, 0x7A8290, 0x868E9A, 0x929AA4], stars: false,
    ground: dirt ? [0x6A4A30, 0x5A3E28, 0x7A5638, 0x86603E] : [0x2E5E3A, 0x26502F, 0x386A44, 0x427650],
    hedge: [0x2A4A34, 0x36583E], rail: [0xE8EAF0, 0x9AA0B0], city: [0x4A5260, 0x58606C], lit: false, trees: 0x30483A, crowd: [0x3A3E4A, 0x2E323C], fog: 'rgba(170,180,195,0.18)' };
  return { key: 'day' + (dirt ? 'd' : ''), night: false, rain: false, dirt,
    sky: [0x3A7AD8, 0x4A88E0, 0x5A96E8, 0x70A8EE, 0x8ABAF2, 0xA8CEF6], stars: false,
    ground: dirt ? [0xA8784A, 0x96693E, 0xB88856, 0xC4966A] : [0x3E9A44, 0x358A3C, 0x48A84E, 0x58B85A],
    hedge: [0x2A7A34, 0x3A9040], rail: [0xF8F8FA, 0xA8B0C0], city: [0x6A86B0, 0x7A96C0], lit: false, trees: 0x2A6A38, crowd: [0x30344A, 0x252838], fog: null };
}

export function makeSky(w, h, th) {
  const c = new Px(w, h);
  const bands = th.sky;
  const stops = [0, 0.3, 0.52, 0.7, 0.86, 0.96, 1];
  bands.forEach((col, i) => {
    const y0 = Math.round(stops[i] * h), y1 = Math.round(stops[i + 1] * h);
    c.rect(0, y0, w, y1 - y0, col);
    if (i > 0) for (let x = 0; x < w; x += 2) c.px(x + (i % 2), y0, bands[i - 1]);
  });
  const rnd = rngOf(4242);
  if (th.stars) {
    for (let i = 0; i < Math.round(w * h / 700); i++) {
      const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h * 0.8), b = rnd();
      c.px(x, y, b > 0.85 ? 0xFFFFFF : (b > 0.5 ? 0xB8C0F0 : 0x6870B0));
    }
  } else {
    // 雲
    const cl = th.rain ? [0x7C8492, 0x8A92A0] : [0xF4F8FC, 0xDCE8F4];
    for (let i = 0; i < Math.max(3, Math.round(w / 90)); i++) {
      const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h * 0.55), cw = 30 + Math.floor(rnd() * 40);
      c.ellipse(x, y + 4, cw, 10, cl[1]); c.ellipse(x + 6, y, cw - 14, 10, cl[0]); c.ellipse(x + cw * 0.4, y - 3, cw * 0.4, 9, cl[0]);
    }
  }
  return c.cv;
}

export function makeMoon() {
  const c = new Px(30, 30);
  c.ellipse(1, 1, 28, 28, 0x20245C);
  c.ellipse(3, 3, 24, 24, 0xF4E8B8);
  c.ellipse(4, 4, 22, 22, 0xFFF6D0);
  c.ellipse(9, 1, 22, 22, 0x0B1034);
  return c.cv;
}
export function makeSun() {
  const c = new Px(26, 26);
  c.ellipse(0, 0, 26, 26, 0xFFF2B0);
  c.ellipse(3, 3, 20, 20, 0xFFFBE0);
  return c.cv;
}

// 遠くの街 (夜は窓の灯り)
export function makeSkyline(th) {
  const w = 256, h = 44;
  const c = new Px(w, h);
  const rnd = rngOf(77);
  let x = 0;
  while (x < w) {
    const bw = 8 + Math.floor(rnd() * 14), bh = 8 + Math.floor(rnd() * 30);
    c.rect(x, h - bh, bw, bh, th.city[0]);
    c.rect(x, h - bh, 1, bh, th.city[1]);
    if (th.night) for (let wy = h - bh + 2; wy < h - 2; wy += 3) for (let wx = x + 2; wx < x + bw - 1; wx += 3) {
      const r = rnd();
      if (r > 0.72) c.px(wx, wy, r > 0.93 ? 0x9AC0FF : 0xE8C060);
    }
    x += bw + Math.floor(rnd() * 3);
  }
  return c.cv;
}

export function makeTrees(th) {
  const w = 192, h = 26;
  const c = new Px(w, h);
  const rnd = rngOf(21);
  for (let x = 0; x < w; x++) {
    const hh = 10 + Math.round(5 * Math.sin(x / 9) + 3 * Math.sin(x / 3.7) + rnd() * 3);
    c.rect(x, h - hh, 1, hh, th.trees);
    if (x % 3 === 0) c.px(x, h - hh, shade(th.trees, 1.4));
  }
  return c.cv;
}

export function makeTower() {
  const c = new Px(40, 150);
  c.rect(19, 22, 2, 128, 0x1A1E3C);
  c.rect(8, 8, 24, 14, 0x12152E);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) { c.rect(10 + k * 4, 10 + r * 4, 3, 3, 0xFFF4C8); c.px(11 + k * 4, 11 + r * 4, 0xFFFFFF); }
  return c.cv;
}

// 走路の向こうの柵と植え込み (幅 50 でくり返す)
export function makeFarRail(th) {
  const c = new Px(50, 20);
  c.rect(0, 0, 50, 11, th.hedge[0]);
  for (let x = 0; x < 50; x++) { if ((x * 7) % 5 < 2) c.px(x, 0, shade(th.hedge[0], 0.7)); if ((x * 3) % 7 === 0) c.px(x, 3 + (x % 4), th.hedge[1]); }
  c.rect(0, 12, 50, 2, th.rail[0]);
  c.rect(0, 14, 50, 1, th.rail[1]);
  c.rect(24, 14, 2, 6, th.rail[0]);
  return c.cv;
}

export function makeNearRail(th) {
  const c = new Px(75, 16);
  c.rect(0, 0, 75, 3, th.rail[0]);
  c.rect(0, 3, 75, 1, th.rail[1]);
  c.rect(36, 4, 3, 12, th.rail[0]);
  c.rect(38, 4, 1, 12, th.rail[1]);
  return c.cv;
}

export function makeTurf(h, th) {
  const c = new Px(64, h);
  const [base, dark, light, speck] = th.ground;
  c.rect(0, 0, 64, h, base);
  const rnd = rngOf(9);
  for (let i = 0; i < h * 12; i++) {
    const x = Math.floor(rnd() * 64), y = Math.floor(rnd() * h), r = rnd();
    c.px(x, y, r > 0.8 ? speck : (r > 0.45 ? light : dark));
  }
  return c.cv;
}

export function makeCrowd(h, frame, th) {
  const w = 160;
  const c = new Px(w, h);
  const rnd = rngOf(88);
  const shirts = [0xE84040, 0x4070E0, 0xF0F0F0, 0xF0D040, 0x40B060, 0xF08030];
  for (let row = 0; row < 2; row++) {
    let x = row * 4 - 2;
    while (x < w) {
      const hw = 5 + Math.floor(rnd() * 3), up = rnd() > 0.72, tall = Math.floor(rnd() * 4);
      const top = h - 16 - tall + row * 6 - (up && frame === 1 ? 1 : 0);
      const col = th.night ? th.crowd[row] : (row === 0 ? th.crowd[0] : th.crowd[1]);
      const shirt = th.night ? col : shade(shirts[Math.floor(rnd() * shirts.length)], th.rain ? 0.55 : 0.75);
      c.ellipse(x + 1, top, hw, hw, th.night ? col : 0x2A2018);
      c.rect(x - 1, top + hw - 1, hw + 4, h, shirt);
      if (up) { c.rect(x - 2, top - 4 - frame, 2, 6, shirt); c.rect(x + hw + 1, top - 3 - frame, 2, 5, shirt); }
      if (th.night && rnd() > 0.86) c.px(x + hw + 1, top - 5 - frame, frame ? 0xFFFFFF : 0xC0D8FF);
      x += hw + 3 + Math.floor(rnd() * 3);
    }
  }
  return c.cv;
}

export function makeShadow(w = 58, col = 0x041410) {
  const c = new Px(w, 7);
  c.ellipse(0, 0, w, 7, col);
  return c.cv;
}

const DIGITS = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
};
export function drawDigits(c, text, x, y, col, s = 1) {
  for (const ch of String(text)) {
    const d = DIGITS[ch];
    if (d) for (let i = 0; i < 15; i++) if (d[i] === '1') c.rect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s, col);
    x += 4 * s;
  }
}

// 残り距離の標柱 (赤白の柱に数字の板)
export function makeBoard(meters) {
  const c = new Px(34, 34);
  for (let y = 15; y < 34; y += 4) { c.rect(15, y, 3, 2, 0xE03030); c.rect(15, y + 2, 3, 2, 0xF8F8F8); }
  c.rect(0, 0, 34, 15, 0x10142E);
  c.rect(1, 1, 32, 13, 0xF8F8F8);
  drawDigits(c, meters, meters >= 1000 ? 2 : 6, 3, 0x202040, 2);
  return c.cv;
}

// ---------------------------------------------------------------- アイテム (16x16・描き下ろし)
const itemCache = new Map();
export function itemIcon(kind) {
  if (itemCache.has(kind)) return itemCache.get(kind);
  const c = new Px(16, 16);
  const O = 0x14141E;
  switch (kind) {
    case 'herb':   // 青草の束 (ひもで縛った草)
      for (let i = 0; i < 6; i++) c.line(4 + i, 14, 2 + i * 2, 2 + (i % 2) * 2, i % 2 ? 0x58C048 : 0x3E9A34, 2);
      c.rect(4, 10, 8, 2, 0xC8A060); c.rect(4, 11, 8, 1, 0x8A6A3A);
      break;
    case 'wind':   // 追い風 (3 本の風の筋)
      for (const [y, l] of [[4, 12], [8, 10], [12, 13]]) { c.rect(1, y, l, 2, 0xE8F4FF); c.rect(l, y - 1, 2, 2, 0xE8F4FF); c.px(1, y + 1, 0x9AC8F0); }
      break;
    case 'web':    // くもの巣
      c.line(1, 1, 14, 14, 0xE0E0E8); c.line(14, 1, 1, 14, 0xE0E0E8); c.line(8, 0, 8, 15, 0xE0E0E8); c.line(0, 8, 15, 8, 0xE0E0E8);
      for (const r of [3, 6]) { c.line(8 - r, 8, 8, 8 - r, 0xC8C8D4); c.line(8, 8 - r, 8 + r, 8, 0xC8C8D4); c.line(8 + r, 8, 8, 8 + r, 0xC8C8D4); c.line(8, 8 + r, 8 - r, 8, 0xC8C8D4); }
      c.rect(7, 7, 3, 3, 0x2A1A2A);
      break;
    case 'stump':  // 切り株
      c.rect(2, 7, 12, 8, O); c.rect(3, 8, 10, 7, 0x7A4A2A); c.ellipse(2, 4, 12, 6, O); c.ellipse(3, 5, 10, 4, 0xD8A868); c.ellipse(6, 6, 4, 2, 0xB08048);
      c.px(5, 11, 0x5A3418); c.px(9, 12, 0x5A3418);
      break;
    case 'bag':    // 福袋
      c.ellipse(2, 5, 12, 11, O); c.ellipse(3, 6, 10, 9, 0xE03838); c.rect(5, 2, 6, 4, O); c.rect(6, 3, 4, 3, 0xE03838); c.rect(5, 5, 6, 1, 0xF0C020);
      c.rect(7, 9, 2, 4, 0xF8E8A0); c.rect(6, 10, 4, 1, 0xF8E8A0);
      break;
    case 'star':   // ★
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x - 7.5, dy = y - 8.2, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
        const k = Math.cos(5 * (a + Math.PI / 2)) * 0.5 + 0.5, lim = 3.4 + 4.4 * Math.pow(k, 2.2);
        if (r < lim + 0.8) c.px(x, y, r < lim ? (r < lim - 2 ? 0xFFF6B0 : 0xFFD020) : 0x8A6008);
      }
      break;
    case 'sugar':  // 角砂糖
      c.rect(3, 5, 10, 9, O); c.rect(4, 6, 8, 7, 0xF8F8F8); c.rect(4, 6, 8, 2, 0xFFFFFF); c.rect(10, 8, 2, 5, 0xD8DCE8);
      c.px(6, 9, 0xE8ECF4); c.px(8, 11, 0xE8ECF4);
      break;
    case 'bell':   // 金の鈴
      c.ellipse(2, 3, 12, 12, 0x6A4808); c.ellipse(3, 4, 10, 10, 0xF0C020); c.ellipse(4, 5, 5, 4, 0xFFF0A0); c.rect(4, 11, 8, 1, 0x8A6008); c.rect(7, 1, 2, 3, 0x8A6008); c.rect(7, 12, 2, 2, 0x3A2808);
      break;
    case 'charm':  // お守り
      c.rect(4, 3, 8, 12, O); c.rect(5, 4, 6, 10, 0x2A60D0); c.rect(6, 6, 4, 6, 0xE8C040); c.rect(7, 1, 2, 3, 0xE03030);
      c.px(7, 8, 0x2A60D0); c.px(8, 9, 0x2A60D0);
      break;
    case 'mud':    // ぬかるみ
      c.ellipse(0, 7, 16, 8, 0x3A2818); c.ellipse(1, 8, 14, 6, 0x6A4A2A); c.ellipse(4, 9, 6, 2, 0x8A6A44); c.px(10, 11, 0x9AC0E0);
      break;
    case 'crow':   // カラス
      c.ellipse(3, 6, 10, 7, 0x101018); c.ellipse(9, 3, 6, 6, 0x101018); c.rect(14, 5, 2, 2, 0xE0B020); c.px(11, 5, 0xFFFFFF);
      c.line(4, 7, 0, 3, 0x202030, 2); c.line(6, 12, 5, 15, 0xE0B020); c.line(9, 12, 10, 15, 0xE0B020);
      break;
  }
  itemCache.set(kind, c.cv);
  return c.cv;
}

// 調教師の顔 (32x32・鳥打帽に白いひげ)
export function trainerFace() {
  const c = new Px(32, 32);
  const skin = 0xE8B888, skinD = shade(0xE8B888, 0.8);
  c.rect(3, 25, 26, 7, 0x000000); c.rect(4, 26, 24, 6, 0x4A6A3A); c.rect(13, 26, 6, 6, 0xE8E0C8);
  c.rect(13, 22, 6, 4, skinD);
  c.ellipse(7, 7, 18, 18, 0x000000); c.ellipse(8, 8, 16, 16, skin);
  c.rect(7, 12, 3, 6, 0xC8C8C8); c.rect(22, 12, 3, 6, 0xC8C8C8);
  c.ellipse(6, 2, 20, 11, 0x000000); c.ellipse(7, 3, 18, 9, 0x7A5A3A); c.rect(6, 9, 22, 3, 0x000000); c.rect(7, 9, 21, 2, 0x5A4028);
  c.rect(10, 13, 5, 1, 0xD8D8D8); c.rect(18, 13, 5, 1, 0xD8D8D8);
  c.rect(11, 15, 3, 1, 0x1A1010); c.rect(19, 15, 3, 1, 0x1A1010);
  c.rect(15, 16, 2, 3, skinD);
  c.rect(11, 19, 10, 2, 0xF0F0F0); c.rect(10, 20, 2, 2, 0xE0E0E0); c.rect(20, 20, 2, 2, 0xE0E0E0); c.rect(14, 22, 4, 1, 0x8A3030);
  return c.cv;
}

// 騎手の顔 (32x32・勝負服とヘルメット)
export function jockeyFace(silk, silk2, cap, hair = 0x2A1A10, skin = 0xF8D0A8) {
  const c = new Px(32, 32);
  c.rect(3, 24, 26, 8, 0x000000); c.rect(4, 25, 24, 7, silk); c.rect(13, 25, 6, 7, silk2);
  c.rect(13, 21, 6, 4, shade(skin, 0.8));
  c.ellipse(8, 8, 16, 16, 0x000000); c.ellipse(9, 9, 14, 14, skin);
  c.rect(9, 13, 2, 5, hair); c.rect(21, 13, 2, 5, hair);
  c.ellipse(7, 2, 18, 13, 0x000000); c.ellipse(8, 3, 16, 11, cap); c.rect(7, 11, 18, 2, 0x000000); c.px(11, 5, shade(cap, 1.5));
  c.rect(11, 15, 3, 2, 0x1A1010); c.rect(18, 15, 3, 2, 0x1A1010); c.rect(14, 20, 4, 1, 0x8A4030);
  return c.cv;
}

// ゲート (1 頭ぶん)
export function makeGateStall() {
  const c = new Px(20, 58);
  c.rect(0, 0, 20, 4, 0x8A90B0);
  c.rect(0, 0, 2, 58, 0x6A7090);
  c.rect(18, 0, 2, 58, 0x6A7090);
  return c.cv;
}
