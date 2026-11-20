// スプライトスタッキング: 馬を高さごとの輪切りのドット絵にして、下から少しずつずらして重ね、立体に見せる。
// 馬えらびの回転台 (main.js) と試作 (tools/stack.html) が使う。

// ---------------------------------------------------------------- 馬を立体の点 (ボクセル) で決める
// 向き: x = 前 (頭の方), y = 横幅, z = 高さ。これを高さごとに輪切りにして平たい絵を作る
export const NX = 42, NY = 15, NZ = 33, CY = 7;
export const FRAMES = 8;                                    // 走りのコマ数
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));

function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = L ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L)) : 0;
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
}

// 1 コマぶんの部品 (線分 + 太さ) を、走りの位相から組み立てる
function parts(phase, spec) {
  const T = Math.PI * 2, P = [];
  const bob = Math.sin(phase * T * 2) * 0.8;          // 走ると体が上下する
  const add = (kind, a, b, r, pri = 1) => P.push({ kind, a, b, r, pri });
  const hipZ = 15 + bob;
  // 脚: 前 2 本・後ろ 2 本。少しずつ時間をずらして、ギャロップ (襲歩) の順に動かす
  const legs = [
    { x: 29, y: CY - 2.4, off: 0.0, fore: true }, { x: 29, y: CY + 2.4, off: 0.12, fore: true },
    { x: 11, y: CY - 2.4, off: 0.5, fore: false }, { x: 11, y: CY + 2.4, off: 0.62, fore: false },
  ];
  for (const l of legs) {
    const p = (phase + l.off) % 1, w = p * T;
    const a = Math.sin(w) * 0.62;                     // 振り
    const lift = Math.max(0, Math.cos(w));            // 前へ戻すときは膝を曲げる
    const hip = [l.x, l.y, hipZ];
    const knee = [hip[0] + Math.sin(a) * 7.5, l.y, hip[2] - Math.cos(a) * 7.5];
    const a2 = a + (l.fore ? -1 : 1) * lift * 1.3;
    const hoof = [knee[0] + Math.sin(a2) * 7, l.y, knee[2] - Math.cos(a2) * 7];
    add('leg', hip, knee, l.fore ? 1.7 : 2.1);
    add('leg', knee, hoof, 1.25);
    add('hoof', [hoof[0], l.y, hoof[2] + 0.6], [hoof[0] + 0.6, l.y, hoof[2] + 0.2], 1.25, 2);
  }
  // 胴・首・頭
  P.push({ kind: 'body', ell: [20, CY, 18.5 + bob], rad: [12, 4.6, 5.2], pri: 1 });
  const neckA = [29, CY, 21 + bob], neckB = [34, CY, 28 + bob * 0.5];
  add('neck', neckA, neckB, 3.1);
  add('head', [34, CY, 29 + bob * 0.5], [39.5, CY, 25 + bob * 0.5], 2.3);
  add('nose', [39.2, CY, 25.2 + bob * 0.5], [40.2, CY, 24.6 + bob * 0.5], 1.7, 2);
  add('ear', [33.6, CY - 1, 31.5], [33.2, CY - 1, 33], 0.7, 2);
  add('ear', [33.6, CY + 1, 31.5], [33.2, CY + 1, 33], 0.7, 2);
  add('mane', [29.5, CY, 24 + bob], [33.5, CY, 31 + bob * 0.5], 1.4, 2);
  // しっぽ: なびかせる
  const sw = Math.sin(phase * T) * 1.2;
  add('mane', [8.5, CY, 21 + bob], [3.5, CY + sw, 18 + bob], 1.6, 2);
  add('mane', [3.5, CY + sw, 18 + bob], [1, CY - sw * 0.5, 13 + bob], 1.3, 2);
  // 鞍下の布
  P.push({ kind: 'cloth', box: [16, 23, 0, NY, 15 + bob, 21 + bob], pri: 1.5 });
  // 騎手: 前かがみ
  const jz = 23.5 + bob;
  add('silk', [19, CY, jz], [24.5, CY, jz + 3.6], 2.5, 3);
  add('arm', [24, CY - 2.2, jz + 3], [29.5, CY - 1.5, jz + 1], 0.9, 3);
  add('arm', [24, CY + 2.2, jz + 3], [29.5, CY + 1.5, jz + 1], 0.9, 3);
  add('pants', [19.5, CY - 2.6, jz], [23, CY - 4, jz - 4], 1.3, 3);
  add('pants', [19.5, CY + 2.6, jz], [23, CY + 4, jz - 4], 1.3, 3);
  P.push({ kind: 'cap', ell: [26, CY, jz + 6], rad: [2.3, 2.2, 2.1], pri: 4 });
  return P;
}

function colorOf(kind, spec, z) {
  const coat = rgb(spec.coat), mane = rgb(spec.mane);
  switch (kind) {
    case 'leg': return z < 4 ? mix(coat, [40, 30, 26], 0.35) : coat;
    case 'hoof': return [34, 30, 30];
    case 'nose': return shade(coat, 0.62);
    case 'ear': return shade(coat, 0.8);
    case 'mane': return mane;
    case 'cloth': return [244, 242, 236];
    case 'silk': return rgb(spec.silk);
    case 'arm': return rgb(spec.silk2);
    case 'pants': return [236, 236, 240];
    case 'cap': return rgb(spec.cap ?? spec.silk2);
    default: return coat;
  }
}

// ボクセル → 高さごとの輪切りの絵 (1 枚 = NX × NY ドット)
function buildSlices(spec, phase) {
  const P = parts(phase, spec);
  const grid = new Array(NX * NY * NZ).fill(null);
  for (let z = 0; z < NZ; z++) for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const p = [x + 0.5, y + 0.5, z + 0.5];
    let best = null, pri = -1;
    for (const q of P) {
      let inside = false;
      if (q.ell) { const d = ((p[0] - q.ell[0]) / q.rad[0]) ** 2 + ((p[1] - q.ell[1]) / q.rad[1]) ** 2 + ((p[2] - q.ell[2]) / q.rad[2]) ** 2; inside = d <= 1; }
      else if (q.box) { const b = q.box; inside = p[0] >= b[0] && p[0] < b[1] && p[2] >= b[4] && p[2] < b[5] && best && best.kind === 'body'; }
      else inside = segDist(p, q.a, q.b) <= q.r;
      if (inside && q.pri >= pri) { best = q; pri = q.pri; }
    }
    if (best) grid[(z * NY + y) * NX + x] = best.kind;
  }
  // 目
  const slices = [];
  for (let z = 0; z < NZ; z++) {
    const c = document.createElement('canvas'); c.width = NX; c.height = NY;
    const g = c.getContext('2d'), img = g.createImageData(NX, NY);
    let any = false;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
      const k = grid[(z * NY + y) * NX + x];
      if (!k) continue;
      any = true;
      let col = colorOf(k, spec, z);
      // 下の段ほど暗く (影の代わり)。輪郭のドットも少し暗くして形を読ませる
      const at = (xx, yy) => xx < 0 || yy < 0 || xx >= NX || yy >= NY ? null : grid[(z * NY + yy) * NX + xx];
      const up = z + 1 < NZ ? grid[((z + 1) * NY + y) * NX + x] : null;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      let k2 = 0.62 + 0.38 * (z / NZ);
      if (!up) k2 += 0.12;                             // 上が空いている面 = 光が当たる
      if (edge) k2 *= 0.78;
      col = shade(col, k2);
      const i = (y * NX + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    // 目は頭の横の 1 ドット
    g.putImageData(img, 0, 0);
    if (z === 27) { g.fillStyle = '#0a0a0a'; const hx = 37; g.fillRect(hx, CY - 2, 1, 1); g.fillRect(hx, CY + 2, 1, 1); }
    slices.push(any ? c : null);
  }
  return slices;
}

const cache = new Map();
export function framesOf(spec) {
  if (!cache.has(spec.id)) cache.set(spec.id, Array.from({ length: FRAMES }, (_, f) => buildSlices(spec, f / FRAMES)));
  return cache.get(spec.id);
}


export const PITCH = 0.62;                                   // カメラの傾き: 地面の奥行きの縮み (1 = 真上から)
export const RISE = Math.sqrt(1 - PITCH * PITCH);           // 同じ傾きで、高さはこれだけ縮んで見える
// 輪切りを下から順に、少しずつ上へずらして重ねる。これがスプライトスタッキングの全部
export function drawStack(g, slices, x, y, angle, gap = 1, scale = 1) {
  for (let z = 0; z < slices.length; z++) {
    const s = slices[z]; if (!s) continue;
    // 1 段の高さが 1 ドットより大きいときは、すき間ができないよう同じ絵を 1 ドットずつ重ねる
    const step = gap * RISE * scale, reps = Math.max(1, Math.ceil(step));
    for (let r = 0; r < reps; r++) {
      const off = z * step + r;
      g.save();
      g.translate(Math.round(x), Math.round(y - off));
      g.scale(scale, scale * PITCH);
      g.rotate(angle);
      g.drawImage(s, -NX / 2, -NY / 2);
      g.restore();
    }
  }
}
export function shadow(g, x, y, angle, scale = 1) {
  g.save(); g.translate(x, y); g.scale(scale, scale * PITCH); g.rotate(angle);
  g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(0, 0, NX * 0.46, NY * 0.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
}

// ---------------------------------------------------------------- 馬えらびの回転台
// 小さなキャンバス (ドット絵の解像度) に台と馬を描き、ゆっくり回す。ドラッグで向きを変えられる。
// キャンバスが画面から外れたら自分で止まる。
export const TURN_W = 62, TURN_H = 50;
export function makeTurntable(spec) {
  const c = document.createElement('canvas');
  c.className = 'px turn';
  c.width = TURN_W; c.height = TURN_H;
  c.setAttribute('role', 'img');
  const g = c.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle = -0.5, drag = null, t0 = performance.now(), last = t0, cur = spec;
  const label = () => c.setAttribute('aria-label', `${cur.name} の姿 (ドラッグで回せる)`);
  label();
  c.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: angle, w: c.clientWidth || TURN_W }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => { if (drag) angle = drag.a + (e.clientX - drag.x) / drag.w * Math.PI * 2; });
  const end = () => { drag = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  const draw = (now) => {
    const t = Math.max(0, (now - t0) / 1000), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!drag && !still) angle += dt * 0.7;
    g.clearRect(0, 0, TURN_W, TURN_H);
    const cx = TURN_W / 2, cy = TURN_H - 12;
    // 台: 芝の円と金の縁
    g.save(); g.translate(cx, cy); g.scale(1, PITCH);
    g.fillStyle = '#2a6a30'; g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd860'; g.lineWidth = 1; g.stroke(); g.restore();
    if (cur.id === 'phantom') {                       // 幻影は金の光をまとわせる
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, cy - 14); g.scale(1, 0.8);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 26);
      gr.addColorStop(0, 'rgba(255,216,96,0.55)'); gr.addColorStop(1, 'rgba(255,216,96,0)');
      g.fillStyle = gr; g.fillRect(-26, -26, 52, 52); g.restore();
    }
    const fr = framesOf(cur)[still ? 2 : Math.floor(t * 11) % FRAMES];
    shadow(g, cx, cy, angle);
    drawStack(g, fr, cx, cy, angle);
  };
  // 画面から外れたら止まる。最初の 1 コマはすぐ描く (画面に入る前でも中身がある)
  const loop = (now) => { if (!c.isConnected) return; draw(now); requestAnimationFrame(loop); };
  draw(performance.now());
  requestAnimationFrame(loop);
  return {
    canvas: c,
    set(spec2) { cur = spec2; label(); draw(performance.now()); },
  };
}
