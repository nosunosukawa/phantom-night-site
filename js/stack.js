// スプライトスタッキング: 馬を高さごとの輪切りのドット絵にして、下から少しずつずらして重ね、立体に見せる。
// 馬えらびの回転台 (main.js) と試作 (tools/stack.html) が使う。
//
// 立体の馬は、レースで走っている横向きの絵 (art.js の drawHorse が描くもの) を、奥行きの方向へ押し出して作る:
//   1. 横向きの絵の 1 ドットごとに、体のどこかを見分ける (胴・首と頭・4 本の脚・尻尾・騎手の部品)
//   2. 部品ごとに決めた幅で、奥行きの方向にドットを並べる (胴は太く丸く、首と頭は細く、脚は左右に分ける)
//   3. それを高さごとに輪切りにする
// 色は横向きの絵のまま。黒いふちどりだけは立体に持たせず、描くたびに輪郭へ引き直す (どの向きから見ても 1 ドットの線になる)。
// 真横から見ると、レースの絵とほぼ同じ形・同じ色・同じ走りのコマになる。
import { GH, FEET_Y, FRAMES as GRID } from './gallop-data.js';
import { SIDE_PAD, SPR_W, SPR_H, FRAME_COUNT, Px, drawHorse } from './art.js';
import { GAIT } from './data.js';

// ---------------------------------------------------------------- 大きさと向き
// 向き: x = 前 (頭の方), y = 横幅 (大きいほど手前), z = 高さ (足もとが 0)。x と z は横向きの絵のドットそのまま
export const NX = 88, NY = 19, NZ = GH, CY = 9;
export const FRAMES = FRAME_COUNT;                         // 走りのコマ数 (レースの絵と同じ 15)
export const PITCH = 0.5;                                  // カメラの傾き: 地面の奥行きの縮み (1 = 真上から)
export const RISE = 1;                                     // 輪切り 1 枚ぶんの高さ。縮めない (真横から見た形が、レースの絵と同じ縦横比になる)
const SW = SPR_W, SH = SPR_H, SN = SW * SH;                // 横向きの絵の大きさ
const abgr = c => (0xFF000000 | ((c & 255) << 16) | (c & 0xFF00) | ((c >> 16) & 255)) >>> 0;   // 0xRRGGBB → キャンバスの 1 画素

// 部品の番号。輪郭の線を引くとき、どの部品とどの部品の境目かを見分ける
const P_TORSO = 1, P_HEAD = 2, P_LEG = 3 /* 3 後ろ手前・4 後ろ奥・5 前手前・6 前奥 */, P_HOOF = 7, P_TAIL = 8, P_SPARK = 9,
  P_SADDLE = 10, P_CLOTH = 11, P_JLEG = 12 /* 12 手前・13 奥 */, P_JBODY = 14, P_ARM = 15 /* 15 手前・16 奥 */, P_REIN = 17, P_JHEAD = 18, P_FACE = 19;
// 組。同じ組 (馬の体どうし) は奥行きに段差があるところだけ線を引き、違う組は番号の大きい方のふちに必ず線を引く
const GRP = [0, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 11];

// ---------------------------------------------------------------- 形を調べる道具 (横向きの絵の上で)
// 形の中の各ドットから、形の外までの距離 (ふちのドットが 0.5)
function distIn(mask) {
  const g = new Float32Array(SN), d = new Float32Array(SN);
  for (let x = 0; x < SW; x++) {
    let run = 0;
    for (let y = 0; y < SH; y++) { run = mask[y * SW + x] ? run + 1 : 0; g[y * SW + x] = run; }
    run = 0;
    for (let y = SH - 1; y >= 0; y--) { run = mask[y * SW + x] ? run + 1 : 0; if (run < g[y * SW + x]) g[y * SW + x] = run; }
  }
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (!mask[i]) continue;
    let best = g[i] * g[i];
    for (let k = 1; k * k < best; k++) {
      const a = x - k >= 0 ? g[i - k] : 0, b = x + k < SW ? g[i + k] : 0;
      best = Math.min(best, k * k + a * a, k * k + b * b);
    }
    d[i] = Math.sqrt(best) - 0.5;
  }
  return d;
}
// そのドットを含んで形の中に収まる、一番大きな円の半径 = そのあたりの太さの半分
function thickness(mask, d) {
  const R = new Float32Array(SN);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (!mask[i]) continue;
    const r = d[i], rr = (r + 0.45) * (r + 0.45), k = Math.floor(r + 0.45);
    for (let yy = Math.max(0, y - k); yy <= Math.min(SH - 1, y + k); yy++) for (let xx = Math.max(0, x - k); xx <= Math.min(SW - 1, x + k); xx++) {
      const j = yy * SW + xx;
      if (mask[j] && R[j] < r && (xx - x) * (xx - x) + (yy - y) * (yy - y) <= rr) R[j] = r;
    }
  }
  return R;
}
// まわり 8 ドット (絵の外は飛ばす)
function around(i, fn) {
  const x = i % SW;
  for (let dy = -SW; dy <= SW; dy += SW) for (let dx = -1; dx <= 1; dx++) {
    const j = i + dy + dx;
    if ((dx || dy) && x + dx >= 0 && x + dx < SW && j >= 0 && j < SN) fn(j);
  }
}
// need のドットへ、いちばん近い「need でないドット」の値を写す (mem の中だけ・kind が同じものどうしだけを伝う)
function spread(val, need, mem, kind) {
  const q = [], seen = new Uint8Array(SN);
  for (let i = 0; i < SN; i++) if (mem[i] && !need[i]) { q.push(i); seen[i] = 1; }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    around(i, j => { if (seen[j] || !mem[j] || (kind && kind[j] !== kind[i])) return; seen[j] = 1; val[j] = val[i]; q.push(j); });
  }
}
const round = t => Math.sqrt(1 - (1 - Math.min(1, t)) * (1 - Math.min(1, t)));     // 丸い断面: ふち (0) で細く、芯 (1) で一番太い

// ---------------------------------------------------------------- 馬の体の形 (コマごと・どの馬でも同じ)
// どの蹄がどの脚か (横向きの絵の座標)。絵の記号には左右の区別がない (d = 暗い は陰の色で、胴にも使われている) ので、
// 元の連続写真 15 コマを 1 コマずつ追って決めた。
// 着地の順は 後ろ A → 後ろ B → 前 X → 前 Y。A と X を奥側、B と Y を手前側の脚として左右に分ける
const HOOF = [ //  A          B          X          Y
  [[31, 41], [22, 38], [48, 43], [37, 45]],
  [[39, 46], [25, 39], [47, 46], [41, 44]],
  [[40, 49], [28, 40], [53, 46], [39, 41]],
  [[34, 51], [40, 44], [57, 44], [43, 42]],
  [[25, 51], [40, 47], [62, 47], [47, 44]],
  [[17, 51], [36, 51], [64, 47], [51, 46]],
  [[10, 51], [26, 51], [62, 50], [55, 46]],
  [[5, 48], [18, 51], [58, 51], [61, 43]],
  [[4, 44], [11, 51], [49, 51], [64, 45]],
  [[2, 42], [4, 49], [41, 51], [66, 48]],
  [[9, 42], [5, 43], [34, 49], [62, 50]],
  [[13, 44], [5, 41], [30, 47], [52, 51]],
  [[19, 45], [11, 42], [31, 43], [45, 51]],
  [[24, 46], [16, 45], [33, 42], [39, 51]],
  [[30, 45], [23, 45], [44, 44], [32, 51]],
];
const SYM = { o: 1, d: 2, m: 3, l: 4, e: 5, h: 6 };       // 記号 → 番号 (o 輪郭 d 暗い m 中間 l 明るい e 目 h 蹄)
const CORE = 4;                                            // 太さの半分がこれ以上なら胴 (脚ではない)
const NECK = 6.2;                                          // 頭から首をたどって、太さの半分がこれ以上になったら胴
const LEG_Y = 3;                                           // 脚を左右へずらす幅
// 横から見た太さ (半分) → 奥行きの幅 (半分)。胴は丸く太く、首・頭は横から見たより薄い
const WID = [[0, 1], [3, 1.6], [4.5, 2.4], [5.5, 3.2], [7, 5.2], [8.5, 7], [12, 7.4]];
function widthOf(r) {
  for (let i = 1; i < WID.length; i++) if (r <= WID[i][0]) { const [a, b] = WID[i - 1], [c, d] = WID[i]; return b + (d - b) * (r - a) / (c - a); }
  return WID[WID.length - 1][1];
}

const GEO = [];
function geoOf(f) {
  if (GEO[f]) return GEO[f];
  const rows = GRID[f], sym = new Uint8Array(SN);
  let eye = null;
  for (let y = 0; y < SH; y++) for (let x = 0; x < rows[y].length; x++) {
    const s = SYM[rows[y][x]];
    if (!s) continue;
    sym[y * SW + x + SIDE_PAD] = s;
    if (s === 5) eye = [x, y];
  }
  const d = distIn(sym), R = thickness(sym, d);
  // 輪郭のドットか (上下左右のどこかが空)。輪郭の o は中身の色に戻しておき、線は描くときに引き直す
  const rim = new Uint8Array(SN), fill = new Uint8Array(sym), isO = new Uint8Array(SN);
  for (let i = 0; i < SN; i++) {
    if (!sym[i]) continue;
    const x = i % SW;
    rim[i] = (x === 0 || !sym[i - 1] || x === SW - 1 || !sym[i + 1] || i < SW || !sym[i - SW] || i >= SN - SW || !sym[i + SW]) ? 1 : 0;
    isO[i] = sym[i] === 1 ? 1 : 0;
  }
  spread(fill, isO, sym);
  for (let i = 0; i < SN; i++) if (fill[i] === 1) fill[i] = 3;

  // 脚: 蹄から胴の芯まで体の中をたどり、その道すじのまわりを「その脚」とする。2 本が重なって見えるところは両側に置く
  let cx = 0, cn = 0;
  for (let i = 0; i < SN; i++) if (sym[i] && R[i] >= CORE) { cx += i % SW; cn++; }
  cx /= cn;
  const side = new Uint8Array(SN), fore = new Uint8Array(SN);   // side: 1 手前 2 奥 (3 両方) / fore: 1 後ろ脚 2 前脚
  HOOF[f].forEach(([hx, hy], k) => {
    const hind = k < 2, bit = k % 2 ? 1 : 2;
    let start = hy * SW + hx + SIDE_PAD;
    if (!sym[start]) { let found = -1; around(start, j => { if (found < 0 && sym[j]) found = j; }); start = found; }
    if (start < 0 || R[start] >= CORE) return;
    const prev = new Int32Array(SN).fill(-2), q = [start];
    prev[start] = -1;
    let end = -1;
    for (let n = 0; n < q.length && end < 0; n++) {
      const p = q[n];
      around(p, j => {
        if (end >= 0 || !sym[j] || prev[j] !== -2) return;
        if (R[j] >= CORE) { if ((j % SW < cx) === hind) end = p; return; }      // 胴の芯に着いた (後ろ脚は後ろ半分・前脚は前半分でだけ)
        prev[j] = p; q.push(j);
      });
    }
    if (end < 0) return;
    let ring = [];
    for (let p = end; p >= 0; p = prev[p]) ring.push(p);
    const mark = new Uint8Array(SN);
    for (const p of ring) mark[p] = 1;
    for (let step = 0; ; step++) {
      for (const p of ring) { side[p] |= bit; if (!fore[p]) fore[p] = hind ? 1 : 2; }
      if (step === 2) break;
      const next = [];
      for (const p of ring) around(p, j => { if (sym[j] && !mark[j] && R[j] < CORE) { mark[j] = 1; next.push(j); } });
      ring = next;
    }
  });
  // 道すじから少し離れた脚のドットは、いちばん近い道すじと同じ側にする
  let ring = [];
  for (let i = 0; i < SN; i++) if (side[i]) ring.push(i);
  for (let step = 0; step < 5; step++) {
    const next = [];
    for (const p of ring) around(p, j => { if (sym[j] && !side[j] && R[j] < CORE) { side[j] = side[p]; fore[j] = fore[p]; next.push(j); } });
    ring = next;
  }

  // 頭と首: 目のドットから、細いところだけを伝って塗り広げる
  const head = new Uint8Array(SN);
  if (eye) {
    ring = [eye[1] * SW + eye[0] + SIDE_PAD];
    head[ring[0]] = 1;
    while (ring.length) {
      const next = [];
      for (const p of ring) around(p, j => { if (sym[j] && !head[j] && !side[j] && R[j] < NECK) { head[j] = 1; next.push(j); } });
      ring = next;
    }
  }

  // 奥行き: 1 ドットごとに「中心からのずれ lc」と「幅の半分 lw」を決める。out は体の表面までの距離 (騎手を外側に置くのに使う)
  const wid = new Float32Array(SN), lc = new Float32Array(SN), lw = new Float32Array(SN), part = new Uint8Array(SN), out = new Float32Array(SN);
  for (let i = 0; i < SN; i++) if (sym[i]) wid[i] = widthOf(R[i]);
  for (let i = 0; i < SN; i++) {
    if (!sym[i]) continue;
    const x = i % SW, y = (i / SW) | 0;
    if (side[i]) {                                           // 脚: 細いところほど左右に離す。太もものあたりは胴へなだらかにつなぐ
      // 2 本が重なって見えるところは、左右をくっつけて置く (離すと、斜め上から見たとき同じ形が 2 段にずれて見える)
      lc[i] = LEG_Y * (side[i] === 3 ? 0.5 : 1) * Math.max(0, Math.min(1, (CORE - R[i]) / (CORE - 2)));
      lw[i] = Math.max(1, Math.min(2.6, 0.35 + 0.42 * R[i]));
      part[i] = fore[i] === 1 ? P_LEG : P_LEG + 2;
      out[i] = lc[i] + lw[i];
      continue;
    }
    let sum = 0, n = 0;                                      // 幅をまわりとならして、首のつけ根などの段をなだらかに
    for (let yy = Math.max(0, y - 2); yy <= Math.min(SH - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(SW - 1, x + 2); xx++) {
      const j = yy * SW + xx;
      if (sym[j] && !side[j]) { sum += wid[j]; n++; }
    }
    lw[i] = Math.max(1, sum / n * round(d[i] / R[i]));
    part[i] = head[i] ? P_HEAD : P_TORSO;
    out[i] = lw[i];
    // 耳: 目の上に 1〜2 ドットだけ出ているところは、左右に 1 つずつ
    if (head[i] && y < eye[1] && Math.abs(x - SIDE_PAD - eye[0]) <= 5) {
      let a = x, b = x;
      while (sym[y * SW + a - 1]) a--;
      while (sym[y * SW + b + 1]) b++;
      if (b - a < 2) { side[i] = 3; lc[i] = 1.5; lw[i] = 0.5; out[i] = 2; }
    }
  }
  return (GEO[f] = { sym, rim, fill, eye, side, lc, lw, part, out });
}

// ---------------------------------------------------------------- レースの絵を、部品ごとに取り出す
// art.js の絵描き (Px) のかわりに drawHorse へ渡して、どの描画命令がどのドットを何色で塗ったかを覚える。
// キャンバスには描かない。レースの絵とまったく同じ命令をたどるので、色も形もレースの絵と同じになる
class Rec {
  constructor() { this.ox = SIDE_PAD; this.busy = false; this.prims = []; this.ink = []; }
  open() { if (this.busy) return false; this.busy = true; this.prims.push([]); return true; }
  rect(x, y, w, h, c) {
    const top = this.open(), n = this.prims.length - 1, list = this.prims[n];
    if (this.ink[n] === undefined) this.ink[n] = abgr(c);   // その命令の色
    const x1 = Math.min(SW, x + this.ox + w), y1 = Math.min(SH, y + h);
    for (let yy = Math.max(0, y); yy < y1; yy++) for (let xx = Math.max(0, x + this.ox); xx < x1; xx++) list.push(yy * SW + xx);
    if (top) this.busy = false;
  }
}
for (const k of ['px', 'line', 'ellipse', 'dither']) {
  Rec.prototype[k] = function (...a) { const top = this.open(); Px.prototype[k].apply(this, a); if (top) this.busy = false; };
}
// drawHorse は最後に騎手を描く。その描く順 (art.js の drawJockey) → 部品: 0 鞍 1 ゼッケン 2 脚 3 胴 4 腕 5 手綱 6 頭。
// あちらの描く順を変えたら、ここも直す
const J_KIND = [0, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6, 6, 6, 6, 6];
const J_RING = [3, 5, 7, 10, 13];                          // 黒いふちどりを描いている命令
const J_BODY = 7, J_HEAD = 13, J_FACE = 16;                // 胴のふちどり・ヘルメットのふちどり・顔 (これ以降はふちどりなし)
const J_SIGN = [39, 40, 10];                               // 騎手のはじめの 3 命令が塗るドット数 (鞍 13×3・ゼッケン 10×4・その上の線 10×1)。順が変わっていないかの目印
const J_PART = [P_SADDLE, P_CLOTH, P_JLEG, P_JBODY, P_ARM, P_REIN, P_JHEAD];

// ---------------------------------------------------------------- 立体を組み立てる (馬ごと・コマごと)
const VC = new Uint32Array(NX * NY * NZ), VP = new Uint8Array(NX * NY * NZ);   // 組み立て用の箱 (使い回す)
// 横向きの絵の 1 ドット (x, z) を、奥行き c ± w の範囲に並べる
function slab(x, z, c, w, col, pid) {
  if (x >= NX || z < 0 || z >= NZ) return;
  const a = Math.max(0, Math.ceil(CY + c - w)), b = Math.min(NY - 1, Math.floor(CY + c + w));
  for (let y = a, k = (z * NY + a) * NX + x; y <= b; y++, k += NX) { VC[k] = col; VP[k] = pid; }
}
// いちばん多い色
function commonest(list) {
  const m = new Map();
  let best = 0, n = 0;
  for (const c of list) { const k = (m.get(c) || 0) + 1; m.set(c, k); if (k > n) { n = k; best = c; } }
  return best;
}
const half = (a, b) => (0xFF000000 | ((((a >> 16 & 255) + (b >> 16 & 255)) >> 1) << 16) | ((((a >> 8 & 255) + (b >> 8 & 255)) >> 1) << 8) | (((a & 255) + (b & 255)) >> 1)) >>> 0;
let warned = false;

function build(M, f) {
  const G = geoOf(f), spec = M.spec, rec = new Rec();
  drawHorse(rec, spec, f, 'run', M.cap);
  // 騎手の命令は最後の J_KIND.length 個。目印が合わなければ描き方が変わっているので、騎手を部品に分けるのはあきらめる
  // (そのときは騎手も馬の絵の一部として、体の幅のまま押し出される。真横からの見た目は変わらない)
  const n = rec.prims.length, j0 = n - J_KIND.length;
  const known = j0 > 0 && J_SIGN.every((len, k) => rec.prims[j0 + k].length === len), base = known ? j0 : n;
  if (!known && !warned) { warned = true; console.warn('stack.js: 騎手の描き方が変わったようです (J_KIND を見直してください)'); }
  const px = new Uint32Array(SN), tag = new Int8Array(SN).fill(-1), jcol = new Uint32Array(SN);   // px = 馬と尻尾の絵 / tag・jcol = その上に描かれた騎手
  for (let k = 0; k < n; k++) {
    const c = rec.ink[k];
    if (k < base) for (const i of rec.prims[k]) px[i] = c;
    else for (const i of rec.prims[k]) { tag[i] = k - base; jcol[i] = c; }
  }
  const zOf = i => FEET_Y - ((i / SW) | 0);

  // 記号ごとの色 (いちばん多い色。目や頬革で上描きされたドットに引きずられない)
  const lists = [[], [], [], [], [], [], []];
  for (let i = 0; i < SN; i++) if (G.sym[i]) lists[G.sym[i]].push(px[i]);
  const symCol = lists.map(commonest);
  symCol[5] = symCol[3];
  const inkHorse = symCol[1], topCol = half(symCol[4], symCol[3]);

  // 尻尾: 馬と尻尾の絵のうち、体でないところ (後ろ半分)。ふちの色は中身の色に戻す
  const tail = new Uint8Array(SN), tcol = new Uint32Array(SN), tEdge = new Uint8Array(SN), tops = [];
  for (let i = 0; i < SN; i++) {
    if (!px[i] || G.sym[i]) continue;
    if (i % SW < SW / 2) { tail[i] = 1; tcol[i] = px[i]; continue; }
    let w = 1;                                              // 前半分で体からはみ出しているのは頬革の先。となりの体と同じ幅で置く
    around(i, j => { if (G.out[j] > w) w = G.out[j]; });
    slab(i % SW, zOf(i), 0, w, px[i], P_SPARK);
  }
  for (let i = SW; i < SN; i++) if (tail[i] && !px[i - SW]) tops.push(px[i]);
  const inkTail = commonest(tops);
  for (let i = 0; i < SN; i++) if (tail[i] && px[i] === inkTail) tEdge[i] = 1;
  spread(tcol, tEdge, tail);
  const td = distIn(tail);
  for (let i = 0; i < SN; i++) {
    if (!tail[i]) continue;
    let alone = true;                                       // ぽつんと離れた 1 ドットは、幻影の尻尾のきらめき
    around(i, j => { if (tail[j]) alone = false; });
    slab(i % SW, zOf(i), 0, td[i] < 2 ? 1 : 2, alone ? px[i] : tcol[i], alone ? P_SPARK : P_TAIL);
  }

  // 馬の体
  for (let i = 0; i < SN; i++) {
    const s = G.sym[i];
    if (!s) continue;
    const edge = s === 1 && G.rim[i], col = edge ? symCol[G.fill[i]] : px[i];
    const x = i % SW, z = zOf(i), pid = s === 6 ? P_HOOF : G.part[i];
    if (!G.side[i]) {
      // 明るい色 (背中の照り) は、絵で明るく塗ってあるドットの表面 1 列だけ。輪郭だったドットと内側 (上から見える面) は毛色と半々にして、
      // 照りの帯が太くなりすぎないように・上から見ても毛色が変わらないようにする
      const lit = col === symCol[4];
      slab(x, z, 0, G.lw[i], lit && edge ? topCol : col, pid);
      if (lit && !edge && G.lw[i] >= 2) slab(x, z, 0, G.lw[i] - 1, topCol, pid);
      continue;
    }
    if (G.side[i] & 2) slab(x, z, -G.lc[i], G.lw[i], col, s === 6 || pid < P_LEG ? pid : pid + 1);
    if (G.side[i] & 1) slab(x, z, G.lc[i], G.lw[i], col, pid);
  }

  // 騎手。黒いふちどりは、同じ部品のいちばん近い中身の色に戻す
  const jm = new Uint8Array(SN), kind = new Uint8Array(SN), ring = new Uint8Array(SN);
  for (let i = 0; i < SN; i++) if (tag[i] >= 0) { jm[i] = 1; kind[i] = J_KIND[tag[i]]; ring[i] = J_RING.includes(tag[i]) ? 1 : 0; }
  spread(jcol, ring, jm, kind);
  // 胴と頭は、ふちどりの命令が塗った全体の形から丸みをつける
  const bulge = (ids, wmax) => {
    const m = new Uint8Array(SN);
    for (const t of ids) for (const i of rec.prims[base + t]) m[i] = 1;
    const dd = distIn(m);
    let top = 0;
    for (let i = 0; i < SN; i++) if (dd[i] > top) top = dd[i];
    return i => m[i] ? Math.max(1, wmax * round(dd[i] / top)) : 1;
  };
  const bodyW = known && bulge([J_BODY], 3.5), headW = known && bulge([J_HEAD, J_FACE, J_FACE + 1], 3.3);
  const box = J_PART.map(() => [SW, SH, -1]);              // 部品ごとの 左端・上端・右端
  for (let i = 0; i < SN; i++) if (jm[i]) { const b = box[kind[i]], x = i % SW, y = (i / SW) | 0; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; }
  for (let k = 0; k < J_PART.length; k++) for (let i = 0; i < SN; i++) {
    if (!jm[i] || kind[i] !== k) continue;
    const x = i % SW, y = (i / SW) | 0, z = zOf(i), col = jcol[i], o = G.out[i], pid = J_PART[k];
    if (k === 0) slab(x, z, 0, y === box[0][1] ? 2 : Math.max(3 + 0.5 * (y - box[0][1]), o + 1), col, pid);   // 鞍: いちばん上は細い背すじ
    else if (k === 1) slab(x, z, 0, Math.max(3.5 + 0.5 * (y - box[1][1]), o + 1), col, pid);                 // ゼッケン: 背中にかぶせる
    else if (k === 2) { const c = Math.max(4.25, o + 1.5); slab(x, z, -c, 1, col, pid + 1); slab(x, z, c, 1, col, pid); }   // 脚: 馬をまたぐ
    else if (k === 3) slab(x, z, 0, bodyW(i), col, pid);
    else if (k === 4) { const c = 3.5 - (x - box[4][0]) / Math.max(1, box[4][2] - box[4][0]); slab(x, z, -c, 0.75, col, pid + 1); slab(x, z, c, 0.75, col, pid); }   // 腕: 手もとへ寄せる
    else if (k === 5) { slab(x, z, -3.5, 1, col, pid); slab(x, z, 3.5, 1, col, pid); }                      // 手綱: 首の両側にまっすぐ
    else if (tag[i] >= J_FACE) slab(x, z, 0, Math.max(2, headW(i)), col, P_FACE);                              // 顔とゴーグル
    else slab(x, z, 0, headW(i), col, pid);
  }

  // 輪切りごとに、中身のあるところだけ切り出して持つ
  const sl = new Array(NZ).fill(null);
  for (let z = 0; z < NZ; z++) {
    const b = z * NY * NX;
    let x0 = NX, x1 = -1, y0 = NY, y1 = -1;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if (VP[b + y * NX + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) continue;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, col = new Uint32Array(w * h), pid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const o = b + (y + y0) * NX + x0; col.set(VC.subarray(o, o + w), y * w); pid.set(VP.subarray(o, o + w), y * w); }
    sl[z] = { x0, y0, w, h, col, pid };
  }
  VC.fill(0); VP.fill(0);

  // 輪郭の線の色 (部品ごと)。sil = 背景との境目, edge = ほかの部品との境目。0 は線を引かない
  const sil = new Uint32Array(GRP.length), edge = new Uint32Array(GRP.length);
  const phantom = spec.id === 'phantom', inkJockey = known ? rec.ink[base + J_RING[0]] : abgr(0x101010);
  for (let p = P_TORSO; p < P_HOOF; p++) sil[p] = edge[p] = inkHorse;
  sil[P_TAIL] = edge[P_TAIL] = inkTail || inkHorse;
  sil[P_SADDLE] = sil[P_CLOTH] = known ? rec.ink[base] : 0;
  for (const p of [P_JLEG, P_JLEG + 1, P_JBODY, P_ARM, P_ARM + 1, P_JHEAD]) sil[p] = edge[p] = inkJockey;
  // 幻影は黒い馬に黒い騎手。部品の境目を鈍い金で引いて、形が読めるようにする
  if (phantom) for (let p = P_TORSO; p < GRP.length; p++) if (edge[p] && p !== P_TAIL) edge[p] = abgr(0x8A6A22);
  return { sl, sil, edge, glow: phantom };
}

// 作った立体は馬ごとに覚えておく (コマは使うときに 1 枚ずつ作る)。覚えておくのは最近の 3 頭まで
const MODELS = new Map(), SOLID = new WeakMap();
function modelOf(spec) {
  const key = [spec.id, spec.coat, spec.mane, spec.silk, spec.silk2, spec.tail].join(':');
  let M = MODELS.get(key);
  if (M) { MODELS.delete(key); MODELS.set(key, M); return M; }
  // 帽子はレースで自分が乗るときと同じ色 (勝負服の 2 色目)
  M = { spec, cap: spec.silk2, vox: [], frames: [] };
  for (let f = 0; f < FRAMES; f++) Object.defineProperty(M.frames, f, {
    configurable: true, enumerable: true,
    get() { const s = slicesOf(voxOf(M, f)); Object.defineProperty(M.frames, f, { value: s, enumerable: true }); return s; },
  });
  MODELS.set(key, M);
  if (MODELS.size > 3) MODELS.delete(MODELS.keys().next().value);
  return M;
}
const voxOf = (M, f) => M.vox[f] || (M.vox[f] = build(M, f));

// 輪切りを 1 枚ずつのキャンバスにする (下から上へ)。ふちのドットは少し暗くして、ばらして見せたときに形が読めるように
function slicesOf(v) {
  const out = [];
  for (let z = 0; z < NZ; z++) {
    const s = v.sl[z];
    if (!s) { out.push(null); continue; }
    const c = document.createElement('canvas');
    c.width = NX; c.height = NY;
    const g = c.getContext('2d'), img = g.createImageData(s.w, s.h), d = new Uint32Array(img.data.buffer);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const k = y * s.w + x;
      if (!s.pid[k]) continue;
      const rim = x === 0 || !s.pid[k - 1] || x === s.w - 1 || !s.pid[k + 1] || y === 0 || !s.pid[k - s.w] || y === s.h - 1 || !s.pid[k + s.w];
      const c0 = s.col[k];
      d[k] = rim ? (0xFF000000 | (((c0 >> 16 & 255) * 0.78) << 16) | (((c0 >> 8 & 255) * 0.78) << 8) | ((c0 & 255) * 0.78)) >>> 0 : c0;
    }
    g.putImageData(img, s.x0, s.y0);
    out.push(c);
  }
  SOLID.set(out, v);
  return out;
}
// 馬の走りの全コマ。コマ → 輪切りのキャンバスの並び (下から上へ・空の段は null)
export function framesOf(spec) { return modelOf(spec).frames; }

// ---------------------------------------------------------------- 描く
// 輪切りを下から順に、1 ドットずつ上へずらして重ねる。これがスプライトスタッキングの全部。
// キャンバスの回転に任せず自分で 1 ドットずつ写すのは、どの部品のドットかを覚えておいて、あとで輪郭に線を引くため
const OW = 96, OH = 104, OX = 48, OY = 80;                // 作業用の絵の大きさと、その中の足もとの位置
const oCol = new Uint32Array(OW * OH), oPid = new Uint8Array(OW * OH), oDep = new Float32Array(OW * OH);
let oCv = null, oG = null, oImg = null, oPix = null;
const STEP = 3.5;                                          // 同じ組の部品どうしで、これ以上の奥行きの段差があれば線を引く

let rx0 = 0, rx1 = 0, ry0 = 0, ry1 = 0;                    // 手綱が描かれた範囲
function paint(v, angle) {
  oPid.fill(0);
  rx0 = OW; rx1 = 0; ry0 = OH; ry1 = 0;
  const co = Math.cos(angle), si = Math.sin(angle), ip = 1 / PITCH;
  for (let z = 0; z < NZ; z++) {
    const s = v.sl[z];
    if (!s) continue;
    // この輪切りが画面で占める範囲 (中身の四隅を写して囲む)
    const u0 = s.x0 - NX / 2, u1 = u0 + s.w, v0 = s.y0 - NY / 2, v1 = v0 + s.h, cy = OY - z * RISE;
    const ax = Math.min(u0 * co, u1 * co) - Math.max(v0 * si, v1 * si), bx = Math.max(u0 * co, u1 * co) - Math.min(v0 * si, v1 * si);
    const ay = (Math.min(u0 * si, u1 * si) + Math.min(v0 * co, v1 * co)) * PITCH, by = (Math.max(u0 * si, u1 * si) + Math.max(v0 * co, v1 * co)) * PITCH;
    const px0 = Math.max(1, Math.floor(OX + ax)), px1 = Math.min(OW - 2, Math.ceil(OX + bx));
    const py0 = Math.max(1, Math.floor(cy + ay)), py1 = Math.min(OH - 2, Math.ceil(cy + by));
    for (let py = py0; py <= py1; py++) {
      const dy = (py + 0.5 - cy) * ip, dx = px0 + 0.5 - OX, dep = dy + PITCH * z;
      let u = dx * co + dy * si + NX / 2 - s.x0, w = -dx * si + dy * co + NY / 2 - s.y0;
      for (let px = px0, o = py * OW + px0; px <= px1; px++, o++, u += co, w -= si) {
        if (u < 0 || w < 0 || u >= s.w || w >= s.h) continue;
        const k = (w | 0) * s.w + (u | 0), p = s.pid[k];
        if (!p) continue;
        oCol[o] = s.col[k]; oPid[o] = p; oDep[o] = dep;
        if (p === P_REIN) { if (px < rx0) rx0 = px; if (px > rx1) rx1 = px; if (py < ry0) ry0 = py; if (py > ry1) ry1 = py; }
      }
    }
  }
  // 手綱は 1 ドットの細い線なので、向きによっては 1 ドットおきに切れて写る。上下 (斜めも) にはさまれた切れ目をつなぐ
  for (let y = Math.max(1, ry0); y <= Math.min(OH - 2, ry1); y++) for (let x = Math.max(1, rx0 - 1), i = y * OW + x; x <= Math.min(OW - 2, rx1 + 1); x++, i++) {
    if (oPid[i] === P_REIN) continue;
    const a = oPid[i - OW] === P_REIN && oPid[i + OW] === P_REIN ? i - OW
      : oPid[i - OW - 1] === P_REIN && oPid[i + OW + 1] === P_REIN ? i - OW - 1
      : oPid[i - OW + 1] === P_REIN && oPid[i + OW - 1] === P_REIN ? i - OW + 1 : -1;
    if (a >= 0 && (!oPid[i] || oDep[i] < oDep[a])) { oPid[i] = P_REIN; oCol[i] = oCol[a]; oDep[i] = oDep[a]; }
  }
}
// 輪郭に線を引く。halo は、まわりを 1 ドット光らせる色 (幻影の金のふちどり・0 なら引かない)
function ink(v, halo) {
  const { sil, edge } = v;
  for (let y = 1; y < OH - 1; y++) for (let x = 1, i = y * OW + 1; x < OW - 1; x++, i++) {
    const p = oPid[i];
    if (!p) { oPix[i] = halo && (oPid[i - 1] || oPid[i + 1] || oPid[i - OW] || oPid[i + OW]) ? halo : 0; continue; }
    let c = oCol[i];
    for (let n = 0; n < 4; n++) {
      const j = n === 0 ? i - 1 : n === 1 ? i + 1 : n === 2 ? i - OW : i + OW, q = oPid[j];
      if (q === p) continue;
      if (!q) { if (sil[p]) c = sil[p]; }
      else if (GRP[q] !== GRP[p]) { if (p > q && edge[p]) c = edge[p]; }
      else if (edge[p] && oDep[i] - oDep[j] > STEP) c = edge[p];
    }
    oPix[i] = c;
  }
}
// 立体を 1 枚の絵にして、(x, y) を足もとの中心として置く
function drawSolid(g, v, x, y, angle, scale = 1, halo = v.glow ? 0xD960D8FF : 0) {
  if (!oCv) {
    oCv = document.createElement('canvas'); oCv.width = OW; oCv.height = OH;
    oG = oCv.getContext('2d'); oImg = oG.createImageData(OW, OH); oPix = new Uint32Array(oImg.data.buffer);
  }
  paint(v, angle); ink(v, halo);
  oG.putImageData(oImg, 0, 0);
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(oCv, Math.round(x) - OX * scale, Math.round(y) - OY * scale, OW * scale, OH * scale);
  g.imageSmoothingEnabled = smooth;
}

// framesOf の輪切りは、すき間なし (gap = 1) なら輪郭つきの立体として描く。
// すき間をあけるとき・ほかで作った輪切りのときは、キャンバスの回転で 1 枚ずつ重ねる
export function drawStack(g, slices, x, y, angle, gap = 1, scale = 1) {
  const v = SOLID.get(slices);
  if (v && gap === 1) { drawSolid(g, v, x, y, angle, scale); return; }
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
  g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(6, 0, 31, 7, 0, 0, Math.PI * 2); g.fill(); g.restore();
}

// ---------------------------------------------------------------- 馬えらびの回転台
// 小さなキャンバス (ドット絵の解像度) に台と馬を描き、ゆっくり回す。ドラッグで向きを変えられる。
// キャンバスが画面から外れたら自分で止まる。
export const TURN_W = 93, TURN_H = 75;
export function makeTurntable(spec) {
  const c = document.createElement('canvas');
  c.className = 'px turn';
  c.width = TURN_W; c.height = TURN_H;
  c.setAttribute('role', 'img');
  const g = c.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle = still ? 0.3 : -0.5, drag = null, t0 = performance.now(), last = t0, cur = spec, shown = '';   // 止め絵のときは、少しこちらを向いた斜め
  const label = () => c.setAttribute('aria-label', `${cur.name} の姿 (ドラッグで回せる)`);
  label();
  c.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: angle, w: c.clientWidth || TURN_W }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => { if (drag) angle = drag.a + (e.clientX - drag.x) / drag.w * Math.PI * 2; });
  const end = () => { drag = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  const draw = (now) => {
    const t = Math.max(0, (now - t0) / 1000), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    // 真横 (レースの絵と同じ向き) のあたりはゆっくり、前後ろ向きのあたりは速く回す
    if (!drag && !still) angle += dt * (0.45 + 0.75 * Math.sin(angle) ** 2);
    // 脚の回転は、レースで走っているときと同じ速さ (歩幅の広い馬はゆったり、ピッチ走法の馬は細かく)
    const f = still ? 9 : Math.floor(t * 16.5 / GAIT[cur.gait || 'normal'].stride) % FRAMES;
    const phantom = cur.id === 'phantom', pulse = phantom && !still ? 0.75 + 0.25 * Math.sin(t * 9) : 1;
    const key = [cur.id, f, angle, pulse].join();
    if (key === shown) return;                         // 何も変わっていなければ描き直さない
    shown = key;
    g.clearRect(0, 0, TURN_W, TURN_H);
    const cx = TURN_W / 2, cy = 52;
    // 台: 芝の円と金の縁
    g.save(); g.translate(cx, cy); g.scale(1, PITCH);
    g.fillStyle = '#2a6a30'; g.beginPath(); g.arc(0, 0, 43, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd860'; g.lineWidth = 1.5; g.stroke(); g.restore();
    if (phantom) {                                     // 幻影は金の光をまとわせる
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, cy - 22); g.scale(1, 0.75);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 46);
      gr.addColorStop(0, `rgba(255,216,96,${0.4 * pulse})`); gr.addColorStop(1, 'rgba(255,216,96,0)');
      g.fillStyle = gr; g.fillRect(-46, -46, 92, 92); g.restore();
    }
    shadow(g, cx, cy, angle);
    drawSolid(g, voxOf(modelOf(cur), f), cx, cy, angle, 1, phantom ? (((0.85 * pulse * 255) << 24) | 0x60D8FF) >>> 0 : 0);
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
