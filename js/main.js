// ターフの幻影 — 画面・操作・物語の進行。
// レースの計算は sim.js (アプリの RaceSim をそのまま)。ドットは低い解像度のキャンバスに描いて拡大し、文字は端末の解像度で重ねる。
import { RaceSim, ITEM } from './sim.js';
import * as D from './data.js';
import * as A from './art.js';
import { Sound } from './audio.js';
import { makeTurntable } from './stack.js';

const PPM = 25;                            // 1m = 25 ドット
const NOSE = A.SIDE_PAD + 67;              // 絵の中の鼻先の x
const STEP = 1 / 60;
const TIME_SCALE = 1.6;                    // アプリと同じ: レースの時間は実時間の 1.6 倍
const qs = new URLSearchParams(location.search);
const AUTO = qs.has('auto');               // 確認用: 自動で乗る
const $ = s => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hex = A.hex;
const GOLD = 0xFFD860, WHITE = 0xEEF0FA, DIM = 0x9AA0C8, INK = 0x05061A;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cv = $('#cv');
const ctx = cv.getContext('2d');
const pix = A.makeCanvas(8, 8);
const pg = pix.getContext('2d');
const shadeCv = A.makeCanvas(8, 8);
const bendCv = A.makeCanvas(8, 8);          // コーナーで走路を曲げて見せるための下書き
const sg = shadeCv.getContext('2d');
const sound = new Sound();
const ui = $('#ui');
let L = null, K = 1;
let T = {};

// ---------------------------------------------------------------- 保存 (この端末の中だけ)
const KEY = 'turfPhantom.v1';
const save = { cleared: false, phantomBeaten: false, champion: null, career: null, muted: false, plays: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 使えない環境ではそのまま */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 同上 */ } };
sound.muted = !!save.muted;

function newCareer() {
  return { horseIndex: 0, raceIndex: 0, credits: 4, totalPrize: 0, money: 0, bonus: { speed: 0, stamina: 0, guts: 0 },
    boost: { staminaK: 1, topBonus: 0, pressureK: 1, names: [] }, trainedThisTurn: false,
    starts: 0, wins: 0, lastPlace: 0, lastRace: '', duels: {}, finishes: [], extraOnly: false, atStable: false };
}
let C = save.career || newCareer();
const isExtra = () => C.raceIndex >= D.MAIN_COUNT;
const raceDef = () => D.RACES[Math.min(C.raceIndex, D.RACES.length - 1)];
function horseSpec() {
  const h = Object.assign({}, D.ROSTER[C.horseIndex]);
  h.speed += C.bonus.speed; h.stamina += C.bonus.stamina; h.guts += C.bonus.guts;
  return h;
}
const unlocked = i => i === D.PHANTOM_INDEX ? save.phantomBeaten : (!D.SPECIAL.includes(i) || save.cleared);
function saveCareer() { save.career = C; persist(); }

// ---------------------------------------------------------------- 状態
const G = {
  mode: 'title',                 // title | gate | race | finish | train | still
  clock: 0, t: 0, acc: 0, slow: 1, flash: 0, flashColor: '255,255,255',
  sim: null, theme: null, rival: null,
  camX: 0, camPx: 0.45, titleShift: 0, bend: 0, heading: 0, lastDist: null,
  banner: null,
  parts: [], ghosts: [],
  input: { up: false, down: false }, pointers: new Map(), keys: { up: false, down: false, rein: false },
  pressed: {}, whipTimes: [], lastFrame: -1, ghostAt: 0, sparkAt: 0,
  attract: { index: 0, dist: 0, lane: 0.5, spec: D.PHANTOM, hidden: false },
  straightSaid: false, cornerSaid: '', lastShout: -10,
  train: null,
};

// ---------------------------------------------------------------- 画面の寸法 (縦長)
function safeInset(side) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;left:0;${side}:0;width:0;height:env(safe-area-inset-${side},0px);visibility:hidden`;
  document.body.appendChild(d);
  const h = d.offsetHeight;
  d.remove();
  return h;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // 横長の画面では CSS が縦長の枠に絞るので、窓ではなくキャンバスの実寸で測る
  const devW = Math.max(1, Math.round((cv.clientWidth || window.innerWidth) * dpr)), devH = Math.max(1, Math.round((cv.clientHeight || window.innerHeight) * dpr));
  cv.width = devW; cv.height = devH;
  K = Math.max(1, Math.floor(Math.min(devW / 300, devH / 470)));
  if (devW / K > 360 || devW / K < 270) K = Math.max(1, Math.round(devW / 310 * 4) / 4);
  const W = Math.ceil(devW / K), H = Math.ceil(devH / K);
  const safeB = Math.round(safeInset('bottom') * dpr / K), safeT = Math.round(safeInset('top') * dpr / K);
  // 下から: ボタン・レーダー・計器。残りをレース画面に
  const rW = clamp(Math.round(W * 0.15), 30, 50);        // ムチの半径
  const btnBlock = 2 * rW + 46;
  const radarH = H > 560 ? 40 : 0;
  const deckH = 12 + 40 + (radarH ? radarH + 10 : 0) + 16 + btnBlock + 12 + safeB;
  const raceH = clamp(H - deckH, 200, 440);
  const crowdH = 26;
  const trackBottom = raceH - crowdH;
  const laneGap = clamp(Math.round(raceH * 0.3), 66, 110);
  const laneNearY = trackBottom - 8, laneFarY = laneNearY - laneGap;
  const farRailY = laneFarY - 16;
  L = { W, H, K, dpr, safeB, safeT, raceH, crowdH, trackBottom, laneNearY, laneFarY, farRailY, top: safeT, bandY: farRailY - 22 };
  const by = H - safeB - 10;                             // ボタンの下端
  L.whip = { cx: W - rW - 12, cy: by - rW, r: rW };
  L.up = { x: 10, y: by - 2 * rW - 4, w: 62, h: rW - 2 };
  L.down = { x: 10, y: by - rW + 4, w: 62, h: rW - 4 };
  const mx0 = L.up.x + L.up.w + 8, mx1 = L.whip.cx - rW - 10;
  const rA = clamp(Math.round((mx1 - mx0) / 2) - 4, 22, 34);
  L.rein = { cx: Math.round((mx0 + mx1) / 2), cy: by - rA, r: rA };
  const sw = Math.floor((mx1 - mx0 - 6) / 2);
  L.push = { x: mx0, y: L.rein.cy - rA - 34, w: sw, h: 26 };
  L.brake = { x: mx0 + sw + 6, y: L.rein.cy - rA - 34, w: sw, h: 26 };
  L.dash = { cx: L.whip.cx, cy: L.whip.cy - rW - 22, r: 15 };
  L.gauge = { x: 10, y: raceH + 10, w: W - 20 };
  L.radar = radarH ? { x: 10, y: raceH + 54, w: W - 20, h: radarH } : null;
  L.hintY = (L.radar ? L.radar.y + L.radar.h : raceH + 50) + 5;
  L.bannerY = safeT + 76;
  pix.width = W; pix.height = H;
  pg.imageSmoothingEnabled = false;
  shadeCv.width = W; shadeCv.height = raceH - L.bandY;
  bendCv.width = W; bendCv.height = raceH;
  buildBackdrop();
}

function buildBackdrop() {
  if (!L) return;
  const th = G.theme || A.themeOf(D.RACES[9], true);
  T = {
    sky: A.makeSky(L.W, L.farRailY - 8, th), turf: A.makeTurf(L.raceH - L.farRailY, th),
    crowd: [A.makeCrowd(L.crowdH + 12, 0, th), A.makeCrowd(L.crowdH + 12, 1, th)],
    moon: th.night ? A.makeMoon() : A.makeSun(), skyline: A.makeSkyline(th), trees: A.makeTrees(th), tower: A.makeTower(),
    farRail: A.makeFarRail(th), nearRail: A.makeNearRail(th), shadow: A.makeShadow(58, th.night ? 0x041410 : A.shade(th.ground[0], 0.55)),
    boards: {}, th,
  };
}
function board(m) { if (!T.boards[m]) T.boards[m] = A.makeBoard(m); return T.boards[m]; }

const laneY = lane => L.laneFarY + lane * (L.laneNearY - L.laneFarY);
const strideOf = spec => D.GAIT[spec.gait || 'normal'].stride;
const frameOf = r => (Math.floor(r.dist / strideOf(r.spec)) + r.index * 4) % A.FRAME_COUNT;
const capOf = r => r.isPlayer ? r.spec.silk2 : D.FRAME_COLORS[r.index];

// ---------------------------------------------------------------- 描画の道具
function tile(g, img, offX, y) {
  const w = img.width;
  for (let x = -(((offX % w) + w) % w); x < L.W; x += w) g.drawImage(img, Math.round(x), y);
}
function pxCircle(g, cx, cy, r, col) {
  g.fillStyle = hex(col);
  for (let yy = -r; yy < r; yy++) {
    const half = Math.round(Math.sqrt(r * r - (yy + 0.5) * (yy + 0.5)));
    g.fillRect(cx - half, cy + yy, half * 2, 1);
  }
}
function glow(g, x, y, rx, ry, rgb, a) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.4, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}
function hole(x, y, rx, ry, a) {
  sg.save();
  sg.translate(x, y); sg.scale(1, ry / rx);
  const gr = sg.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gr; sg.fillRect(-rx, -rx, rx * 2, rx * 2);
  sg.restore();
}
function spawn(wx, y, vx, vy, life, col, size = 1, add = false) {
  if (G.parts.length < 260) G.parts.push({ wx, y, vx, vy, life, max: life, col, size, add });
}

// ---------------------------------------------------------------- 場面を描く
// v = { camX, runners, player, phantom, items, goal, gate, gateOpen, still, shift }
function drawScene(v) {
  const g = pg, W = L.W, camX = v.camX, th = T.th;
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = hex(th.sky[0]); g.fillRect(0, 0, W, L.H);
  g.save();
  g.translate(0, -(v.shift || 0));
  g.drawImage(T.sky, 0, 0);
  g.drawImage(T.moon, Math.round(W * 0.76), Math.max(L.top + 30, L.farRailY - 120));
  const turn = v.heading || 0;                          // コーナーで向きが変わった分だけ、遠くの景色が流れる
  tile(g, T.skyline, camX * 0.05 + turn * 260, L.farRailY - 70);
  if (th.night) {
    const sp = 320, off = (((camX * 0.4 + turn * 420) % sp) + sp) % sp, top = Math.max(L.top + 90, L.farRailY - 172);
    for (let x = -off - 60; x < W + 60; x += sp) { const tx = Math.round(x + 120); g.drawImage(T.tower, tx - 20, top); glow(g, tx, top + 15, 46, 30, '255,244,200', 0.5); }
  }
  tile(g, T.trees, camX * 0.3 + turn * 420, L.farRailY - 40);
  // 走路
  g.fillStyle = hex(th.ground[0]); g.fillRect(0, L.farRailY - 8, W, L.raceH - L.farRailY + 8);
  tile(g, T.turf, camX, L.farRailY);
  const stripe = 12 * PPM;
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = -(((camX % (stripe * 2)) + stripe * 2) % (stripe * 2)); x < W; x += stripe * 2) g.fillRect(Math.round(x), L.farRailY, stripe, L.raceH - L.farRailY);
  // 内ラチ沿いの荒れた所
  const roughY = Math.round(laneY(0.13));
  g.fillStyle = th.dirt ? 'rgba(60,30,10,0.18)' : 'rgba(110,80,40,0.28)';
  g.fillRect(0, L.farRailY, W, roughY - L.farRailY);
  const midY = (L.farRailY + L.trackBottom) / 2;
  const pools = [];
  if (th.night) {
    const poolGap = 40 * PPM;
    for (let x = -(((camX % poolGap) + poolGap) % poolGap) + poolGap / 2 - poolGap; x < W + 200; x += poolGap) { pools.push(x); glow(g, Math.round(x), midY, 190, 60, '255,240,190', 0.1); }
  }
  tile(g, T.farRail, camX, L.farRailY - 18);
  // 標柱 (200m ごと)
  if (v.goal) {
    for (let m = 200; m <= v.goal; m += 200) {
      const bx = Math.round((v.goal - m) * PPM - camX) - 17;
      if (bx > -40 && bx < W + 10) g.drawImage(board(m), bx, L.farRailY - 42);
    }
  }
  // ゴール
  const fx = v.goal ? Math.round(v.goal * PPM - camX) : -999;
  const goalOn = fx > -30 && fx < W + 30;
  if (goalOn) {
    if (th.night) glow(g, fx, midY, 26, 70, '255,216,96', 0.55);
    for (let y = L.farRailY + 2; y < L.trackBottom; y += 3) { g.fillStyle = ((y - L.farRailY) / 3 | 0) % 2 ? '#ffffff' : '#e03030'; g.fillRect(fx - 1, y, 3, 3); }
    g.fillStyle = '#f8f8f8'; g.fillRect(fx - 1, L.farRailY - 40, 3, 42);
    g.fillStyle = '#e03030'; g.fillRect(fx - 8, L.farRailY - 46, 17, 8);
    g.fillStyle = '#ffffff'; g.fillRect(fx - 6, L.farRailY - 44, 13, 4);
  }
  // ゲート
  const gx = Math.round(-camX);
  const vis = v.runners.filter(r => !r.hidden);
  const gateOn = v.gate && gx > -120 && gx < W + 100 && vis.length;
  if (gateOn) {
    const lanes = vis.map(r => Math.round(laneY(r.lane)));
    const y0 = Math.min(...lanes) - 56, y1 = Math.max(...lanes);
    g.fillStyle = '#3a4066'; g.fillRect(gx - 88, y0, 3, y1 - y0); g.fillRect(gx + 3, y0, 3, y1 - y0);
    g.fillStyle = '#8a90b0'; g.fillRect(gx - 90, y0 - 4, 98, 5);
    g.fillStyle = '#c8cce4'; g.fillRect(gx - 90, y0 - 4, 98, 1);
  }
  // アイテム
  if (v.items) for (const it of v.items) {
    if (it.taken) continue;
    const x = Math.round(it.dist * PPM - camX), y = Math.round(laneY(it.lane));
    if (x < -20 || x > W + 20) continue;
    const bob = Math.round(Math.sin(G.clock * 5 + it.dist) * 1.5);
    g.globalAlpha = 0.35; g.fillStyle = '#000'; g.fillRect(x - 6, y - 1, 12, 2); g.globalAlpha = 1;
    g.drawImage(A.itemIcon(it.kind), x - 8, y - 18 + bob);
  }
  // 画面の右の外にあるアイテム (60m 先まで) を右端に予告する。見えてから寄せても間に合うように
  if (v.items && v.player && !v.player.finished) {
    for (const it of v.items) {
      if (it.taken) continue;
      const x = it.dist * PPM - camX, ahead = it.dist - v.player.dist;
      if (x <= W - 6 || ahead > 60) continue;
      const y = Math.round(laneY(it.lane)), a = 0.7 + 0.3 * (1 - ahead / 60);
      g.globalAlpha = a * (0.75 + 0.25 * Math.sin(G.clock * 8));
      g.fillStyle = ITEM[it.kind].good ? '#60e0a0' : '#ff6060';
      g.fillRect(W - 4, y - 14, 3, 12);
      for (let k = 0; k < 4; k++) g.fillRect(W - 9 + k, y - 8 - (3 - k), 1, 2 * (3 - k) + 1);   // ▶
      g.drawImage(A.itemIcon(it.kind), W - 26, y - 18);
      g.globalAlpha = 1;
    }
  }
  // 馬 (奥から手前へ)
  const list = vis.slice().sort((a, b) => a.lane - b.lane);
  for (const r of list) if (!(th.night && r === v.phantom)) drawRunner(g, r, v);
  if (gateOn && !v.gateOpen) for (const r of vis) {
    const fy = Math.round(laneY(r.lane));
    g.fillStyle = '#b8bcd8'; g.fillRect(gx + 3, fy - 44, 3, 40);
  }
  // 夜: 闇をかぶせ、照明のたまりと自分の馬のまわりだけ明るく。幻影は闇の上に光らせる
  if (th.night) {
    const bh = shadeCv.height;
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, W, bh);
    sg.fillStyle = 'rgba(2,4,22,0.5)'; sg.fillRect(0, 0, W, bh);
    sg.globalCompositeOperation = 'destination-out';
    for (const x of pools) hole(Math.round(x), midY - L.bandY, 210, 70, 0.6);
    if (v.player) hole(Math.round(v.player.dist * PPM - camX) - 30, laneY(v.player.lane) - 22 - L.bandY, 110, 52, 0.85);
    if (goalOn) hole(fx, midY - L.bandY, 90, 80, 0.8);
    g.drawImage(shadeCv, 0, L.bandY);
    if (v.phantom && !v.phantom.hidden) {
      drawPhantom(g, v.phantom, v);
      for (const r of list) if (r !== v.phantom && r.lane > v.phantom.lane + 0.02 && Math.abs(r.dist - v.phantom.dist) < 5) drawRunner(g, r, v, true);
    }
  }
  // 粒
  for (const p of G.parts) {
    const x = Math.round(p.wx - camX);
    if (x < -4 || x > W + 4) continue;
    g.globalAlpha = clamp(p.life / p.max, 0, 1); g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    g.fillStyle = hex(p.col); g.fillRect(x, Math.round(p.y), p.size, p.size);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // 雨
  if (th.rain) {
    g.fillStyle = 'rgba(200,215,235,0.55)';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97 + G.clock * 260 + camX * 0.2) % (W + 40)) - 20, y = ((i * 53 + G.clock * 520) % (L.raceH + 20)) - 10;
      g.fillRect(Math.round(x), Math.round(y), 1, 6);
    }
    if (th.fog) { g.fillStyle = th.fog; g.fillRect(0, 0, W, L.raceH); }
  }
  tile(g, T.nearRail, camX, L.trackBottom - 12);
  const excited = v.player && v.goal && v.goal - v.player.dist < 320;
  tile(g, T.crowd[Math.floor(G.clock * (excited ? 7 : 2)) % 2], camX * 1.3, L.raceH - T.crowd[0].height);
  if (v.bend > 0.01) bendTrack(g, v);
  g.restore();
}

// コーナー: 走路を弓なりに曲げる。自分の馬の所がいちばん手前で、前後は内ラチの方 (上) へ曲がって見える
function bendTrack(g, v) {
  const W = L.W, y0 = Math.max(0, L.farRailY - 60), h = L.raceH - y0;
  const bc = bendCv.getContext('2d');
  bc.clearRect(0, 0, W, L.raceH);
  bc.drawImage(pix, 0, y0, W, h, 0, 0, W, h);
  const cx = v.player ? v.player.dist * PPM - v.camX - 20 : W * 0.45;
  const amp = (L.laneNearY - L.laneFarY) * 0.55 * v.bend;
  for (let x = 0; x < W; x += 2) {
    const u = (x - cx) / W, b = Math.round(amp * u * u * 2.2);
    if (b <= 0) continue;
    g.drawImage(bendCv, x, 0, 2, h, x, y0 - b, 2, h + b);
  }
}

function faceOf(r) {
  if (r.exhausted) return 'tired';
  if (r.whipPowerTimer > 0.75) return 'whip';
  return 'run';
}

let txtQueue = [];
function drawRunner(g, r, v, again = false) {
  const x = Math.round(r.dist * PPM - v.camX) - NOSE, fy = Math.round(laneY(r.lane));
  if (x > L.W + 10 || x < -A.SPR_W - 10) return;
  const y = fy - A.SPR_FEET - 1;
  const fr = v.still ? 5 : frameOf(r);
  if (!again) { g.globalAlpha = 0.5; g.drawImage(T.shadow, x + 21, fy - 4); g.globalAlpha = 1; }
  const cap = capOf(r);
  if (r.hyper > 0 || r.wind > 0) {
    const tint = A.tinted(A.horseFrames(r.spec, 'run', cap), r.hyper > 0 ? 0xFFE060 : 0xC8E8FF, r.spec.id + ':' + r.spec.coat + ':' + cap);
    g.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 3; k++) { g.globalAlpha = 0.28 / k; g.drawImage(tint[fr], x - k * 7, y); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  g.drawImage(A.horseFrames(r.spec, faceOf(r), cap)[fr], x, y);
  if (again) return;
  if (r.web > 0) { g.globalAlpha = 0.75; g.drawImage(A.itemIcon('web'), x + 52, y + 4); g.globalAlpha = 1; }
  if (r.crow > 0) g.drawImage(A.itemIcon('crow'), x + 56 + Math.round(Math.sin(G.clock * 18) * 3), y - 8);
  if (r.balk > 0 && r.isPlayer && Math.floor(G.clock * 6) % 2) txtQueue.push(['イヤイヤ', x + 54, y - 8, 8, 0xD090FF]);
  if (r.isPlayer) {
    const mx = x + A.SIDE_PAD + 41, my = y + 1 - (Math.floor(G.clock * 4) % 2);
    g.fillStyle = hex(INK); g.fillRect(mx - 5, my - 7, 11, 2); g.fillRect(mx - 4, my - 5, 9, 2); g.fillRect(mx - 2, my - 3, 5, 2);
    g.fillStyle = hex(GOLD); g.fillRect(mx - 4, my - 7, 9, 1); g.fillRect(mx - 3, my - 6, 7, 2); g.fillRect(mx - 2, my - 4, 5, 1); g.fillRect(mx - 1, my - 3, 3, 2);
  } else if (r === G.rival && !r.finished) {
    const mx = x + A.SIDE_PAD + 41;
    g.fillStyle = '#ff6090'; g.fillRect(mx - 1, y - 8, 3, 5);
  }
}

function drawPhantom(g, ph, v) {
  const x = Math.round(ph.dist * PPM - v.camX) - NOSE, fy = Math.round(laneY(ph.lane));
  if (x > L.W + 60 || x < -A.SPR_W - 60) return;
  const y = fy - A.SPR_FEET - 1, fr = frameOf(ph);
  const body = A.horseFrames(D.PHANTOM, 'run', 0x101018);
  const gold = A.tinted(body, GOLD, 'phantom');
  const pulse = 0.75 + 0.25 * Math.sin(G.clock * 9);
  glow(g, x + 54, fy - 22, 86, 44, '255,216,96', 0.34 * pulse);
  g.globalCompositeOperation = 'lighter';
  for (const gh of G.ghosts) { g.globalAlpha = clamp(gh.life / 0.3, 0, 1) * 0.3; g.drawImage(gold[gh.frame], Math.round(gh.wx - v.camX) - NOSE, gh.y); }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.5; g.drawImage(T.shadow, x + 21, fy - 4);
  g.globalAlpha = 0.85 * pulse;
  g.drawImage(gold[fr], x - 1, y); g.drawImage(gold[fr], x + 1, y); g.drawImage(gold[fr], x, y - 1); g.drawImage(gold[fr], x, y + 1);
  g.globalAlpha = 1;
  g.drawImage(body[fr], x, y);
}

// ---------------------------------------------------------------- 文字
const OUT = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]];
const FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
function txt(s, x, y, size, color = WHITE, align = 'left', outline = INK) {
  ctx.font = `${size * K}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  const X = Math.round(x * K), Y = Math.round(y * K);
  if (outline !== null) { ctx.fillStyle = hex(outline); for (const [ox, oy] of OUT) ctx.fillText(s, X + ox * K, Y + oy * K); }
  ctx.fillStyle = hex(color);
  ctx.fillText(s, X, Y);
}
function measure(s, size) { ctx.font = `${size * K}px ${FONT}`; return ctx.measureText(s).width / K; }
function banner(text, sub = '', color = WHITE, dur = 1.4, big = false) { G.banner = { text, sub, color, dur, big, t0: G.clock }; }

// ---------------------------------------------------------------- 計器とボタン
function bar(g, x, y, w, h, frac, col) {
  g.fillStyle = '#2a2e66'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = '#0a0c24'; g.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp(frac, 0, 1));
  g.fillStyle = hex(col); g.fillRect(x, y, fw, h);
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, fw, 1);
}
function rectBtn(g, b, on, face = 0x15183A, edge = 0x4A50A0) {
  g.fillStyle = '#05061a'; g.fillRect(b.x, b.y + 3, b.w, b.h);
  g.fillStyle = hex(edge); g.fillRect(b.x, b.y + (on ? 2 : 0), b.w, b.h);
  g.fillStyle = hex(on ? A.shade(face, 1.6) : face); g.fillRect(b.x + 2, b.y + 2 + (on ? 2 : 0), b.w - 4, b.h - 4);
}
function roundBtn(g, b, face, on) {
  pxCircle(g, b.cx, b.cy + 3, b.r, 0x05061A);
  pxCircle(g, b.cx, b.cy + (on ? 2 : 0), b.r, A.shade(face, 0.6));
  pxCircle(g, b.cx, b.cy + (on ? 2 : 0), b.r - 3, on ? A.shade(face, 1.2) : face);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(b.cx - Math.round(b.r * 0.45), b.cy - Math.round(b.r * 0.6) + (on ? 2 : 0), Math.round(b.r * 0.55), 2);
}
function arrow(g, b, dir, on) {
  const cx = b.x + Math.round(b.w / 2), cy = b.y + Math.round(b.h / 2) + (on ? 2 : 0), s = Math.max(4, Math.round(b.h * 0.22));
  g.fillStyle = '#eef0fa';
  for (let i = 0; i < s; i++) g.fillRect(cx - i, dir < 0 ? cy - Math.round(s / 2) + i : cy + Math.round(s / 2) - i, 1 + i * 2, 1);
}

function drawDeck(g, shift = 0) {
  const W = L.W, y0 = L.raceH - shift;
  g.fillStyle = '#070818'; g.fillRect(0, y0, W, L.H - y0);
  g.fillStyle = '#2a2e66'; g.fillRect(0, y0, W, 2);
  g.fillStyle = '#0c0e2a'; for (let y = y0 + 6; y < L.H; y += 4) g.fillRect(0, y, W, 1);
}

function drawControls(g) {
  const s = G.sim, P = G.pressed;
  if (G.mode === 'train') {
    rectBtn(g, L.up, G.input.up); arrow(g, L.up, -1, G.input.up);
    rectBtn(g, L.down, G.input.down); arrow(g, L.down, 1, G.input.down);
    roundBtn(g, L.whip, 0xE0A020, P.whip > 0);
    return;
  }
  if (!s) return;
  const p = s.player, ga = L.gauge, bx = ga.x + 30, bw = ga.w - 30 - 74;
  const st = clamp(p.stamina / 100, 0, 1);
  bar(g, bx, ga.y + 1, bw, 7, st, st > 0.5 ? 0x40D890 : (st > 0.25 ? 0xF0C840 : 0xF05040));
  bar(g, bx, ga.y + 14, bw, 7, clamp((p.v - 12) / 9, 0, 1), 0x58A8F0);
  const free = s.remaining(p) <= 300;
  bar(g, bx, ga.y + 27, bw, 7, free ? 0 : (p.balk > 0 ? 1 : p.pressure / 5.5), p.balk > 0 ? (Math.floor(G.clock * 8) % 2 ? 0xF05040 : 0x802030) : 0xB060F0);
  // ムチの強さ (3 マス) と ★
  const sx = ga.x + ga.w - 62;
  for (let k = 0; k < 3; k++) { g.fillStyle = k < (p.whipPowerTimer > 0 ? p.whipPower : 0) ? ['#ffffff', '#ffd860', '#ff6040'][k] : '#1a1e44'; g.fillRect(sx + k * 20, ga.y + 1, 16, 7); }
  for (let k = 0; k < 3; k++) { g.globalAlpha = k < p.stars ? 1 : 0.22; g.drawImage(A.itemIcon('star'), sx + k * 20, ga.y + 15); }
  g.globalAlpha = 1;
  rectBtn(g, L.up, G.input.up); arrow(g, L.up, -1, G.input.up);
  rectBtn(g, L.down, G.input.down); arrow(g, L.down, 1, G.input.down);
  rectBtn(g, L.push, P.push > 0, 0x6A2A1A, 0xC86040);
  rectBtn(g, L.brake, P.brake > 0, 0x1A3A5A, 0x4A80B0);
  roundBtn(g, L.rein, 0xD83A2A, p.holdRein || P.rein > 0);
  roundBtn(g, L.whip, p.balk > 0 ? 0x5A4A80 : (free ? (Math.floor(G.clock * 6) % 2 ? 0xFFE890 : GOLD) : 0xE0A020), P.whip > 0);
  if (s.dashReady) roundBtn(g, L.dash, Math.floor(G.clock * 8) % 2 ? 0x40E080 : 0x20A050, P.dash > 0);
  else { g.globalAlpha = 0.35; roundBtn(g, L.dash, 0x204030, false); g.globalAlpha = 1; }
}

function drawControlLabels() {
  const s = G.sim;
  if (G.mode === 'train') { txt('連打', L.whip.cx, L.whip.cy - 9 + (G.pressed.whip > 0 ? 2 : 0), 16, 0x17120A, 'center', null); return; }
  if (!s) return;
  const p = s.player, ga = L.gauge, free = s.remaining(p) <= 300;
  txt('体力', ga.x, ga.y - 1, 9); txt('速さ', ga.x, ga.y + 12, 9);
  if (free) txt('ムチ使い放題！', ga.x + 30, ga.y + 25, 9, GOLD); else txt('嫌気', ga.x, ga.y + 25, 9, p.balk > 0 ? 0xFF7060 : WHITE);
  txt('ムチ', L.whip.cx, L.whip.cy - 8 + (G.pressed.whip > 0 ? 2 : 0), 16, 0x17120A, 'center', null);
  txt('手綱', L.rein.cx, L.rein.cy - 7 + (p.holdRein ? 2 : 0), 12, WHITE, 'center', null);
  txt('押しっぱなし可', L.rein.cx, L.rein.cy + 7, 7, 0xFFD0C0, 'center', null);
  txt('馬群割り', L.push.x + L.push.w / 2, L.push.y + 8, 10, WHITE, 'center', null);
  txt('控える', L.brake.x + L.brake.w / 2, L.brake.y + 8, 10, WHITE, 'center', null);
  txt('★流星', L.dash.cx, L.dash.cy - 5, 8, s.dashReady ? 0x082010 : 0x80A090, 'center', null);
}

// レーダー: 上から見た図 (左が後ろ・右が前、上が内)
function drawRadar(g) {
  const R = L.radar, s = G.sim;
  if (!R || !s) return;
  const p = s.player, back = 8, ahead = 60, span = back + ahead;   // 先のアイテムが早めに見えるよう、前を広く
  const X = d => R.x + Math.round((d - p.dist + back) / span * R.w);
  const Y = lane => R.y + 3 + Math.round(lane * (R.h - 7));
  const len = Math.max(5, Math.round(2.4 / span * R.w));
  g.fillStyle = '#2a2e66'; g.fillRect(R.x - 1, R.y - 1, R.w + 2, R.h + 2);
  g.fillStyle = '#0a0c24'; g.fillRect(R.x, R.y, R.w, R.h);
  g.save(); g.beginPath(); g.rect(R.x, R.y, R.w, R.h); g.clip();
  g.fillStyle = 'rgba(140,100,50,0.35)'; g.fillRect(R.x, R.y, R.w, Y(0.13) - R.y);
  g.fillStyle = '#161a40';
  for (let m = Math.ceil((p.dist - back) / 10) * 10; m < p.dist + ahead; m += 10) g.fillRect(X(m), R.y, 1, R.h);
  if (s.distance < p.dist + ahead) { g.fillStyle = '#e03030'; g.fillRect(X(s.distance), R.y, 2, R.h); }
  for (const it of s.items) if (!it.taken && it.dist > p.dist - back && it.dist < p.dist + ahead) {
    g.fillStyle = ITEM[it.kind].good ? '#60e0a0' : '#ff6060';
    g.fillRect(X(it.dist) - 1, Y(it.lane) - 1, 3, 3);
  }
  for (const r of s.runners) {
    if (r.hidden) continue;
    const x = X(r.dist) - len, y = Y(r.lane) - 2;
    if (r.spec.id === 'phantom') { g.fillStyle = hex(GOLD); g.fillRect(x - 1, y - 1, len + 2, 7); g.fillStyle = '#0c0a14'; g.fillRect(x, y, len, 5); }
    else if (r.isPlayer) { g.fillStyle = '#eef0fa'; g.fillRect(x - 1, y - 1, len + 2, 7); g.fillStyle = hex(r.spec.silk); g.fillRect(x, y, len, 5); }
    else { g.fillStyle = r === G.rival ? '#ff6090' : '#6a7298'; g.fillRect(x, y, len, 5); g.fillStyle = hex(D.FRAME_COLORS[r.index]); g.fillRect(x + len - 2, y, 2, 5); }
  }
  g.restore();
}

// コース図 (右上): 楕円のコースと全馬の点
function courseXY(shape, u, lane) {
  const S = shape.straight, R = shape.innerR + 1.6 + lane * 20.8, C = Math.PI * shape.innerR, Lp = shape.lap, half = S / 2;
  u = ((u % Lp) + Lp) % Lp;
  let x, y;
  if (u < C) { const a = -Math.PI / 2 - Math.PI * (u / C); x = -half + R * Math.cos(a); y = R * Math.sin(a); }
  else if (u < C + S) { x = -half + (u - C); y = R; }
  else if (u < 2 * C + S) { const a = Math.PI / 2 - Math.PI * ((u - C - S) / C); x = half + R * Math.cos(a); y = R * Math.sin(a); }
  else { x = half - (u - 2 * C - S); y = -R; }
  if (shape.leftHanded) x = -x;
  return [x, y];
}
function drawMap(g) {
  const s = G.sim; if (!s) return;
  const sh = s.shape, bw = 84, bh = 44, x0 = L.W - bw - 8, y0 = L.top + 26;
  const ext = sh.straight / 2 + sh.innerR + 24, eyt = sh.innerR + 24;
  const k = Math.min((bw - 8) / (ext * 2), (bh - 8) / (eyt * 2));
  const P = (u, lane) => { const [x, y] = courseXY(sh, u, lane); return [Math.round(x0 + bw / 2 + x * k), Math.round(y0 + bh / 2 - y * k)]; };
  g.fillStyle = 'rgba(5,6,26,0.6)'; g.fillRect(x0, y0, bw, bh);
  g.fillStyle = '#58c060';
  for (let u = 0; u < sh.lap; u += sh.lap / 140) { const [x, y] = P(u, 0.5); g.fillRect(x, y, 1, 1); }
  const [gxp, gyp] = P(0, 0.5); g.fillStyle = '#ff4040'; g.fillRect(gxp - 1, gyp - 2, 2, 5);
  const uOf = r => sh.lap - s.lapPos(s.remaining(r));
  for (const r of s.runners) {
    if (r.hidden || r.isPlayer) continue;
    const [x, y] = P(uOf(r), r.lane); g.fillStyle = r.spec.id === 'phantom' ? hex(GOLD) : '#a0a8c8'; g.fillRect(x, y, 2, 2);
  }
  const [px, py] = P(uOf(s.player), s.player.lane);
  g.fillStyle = '#ffffff'; g.fillRect(px - 2, py - 2, 4, 4); g.fillStyle = hex(s.player.spec.silk); g.fillRect(px - 1, py - 1, 2, 2);
}

function drawHud() {
  const s = G.sim; if (!s) return;
  const p = s.player, top = L.top;
  const rem = Math.ceil(s.remaining(p));
  txt('残り', 8, top + 10, 10, DIM);
  txt(String(rem), 8, top + 20, 22, rem <= 300 ? GOLD : WHITE);
  txt('m', 10 + measure(String(rem), 22), top + 31, 11, rem <= 300 ? GOLD : WHITE);
  const rank = s.standing(p);
  txt(`${rank}位`, L.W - 100, top + 8, 13, rank <= 3 ? GOLD : WHITE, 'right');
  txt(s.def.venue, L.W - 50, top + 9, 10, WHITE, 'center');
  const cn = s.cornerName(s.remaining(p)), gr = s.grade(s.remaining(p));
  const info = (rem < s.homeStraight ? '最後の直線' : (cn || '直線')) + (Math.abs(gr) > 0.25 ? `　${gr > 0 ? '上り坂' : '下り坂'}` : '');
  txt(info, 8, top + 46, 10, cn && rem >= s.homeStraight ? 0xA0E0FF : WHITE);
  const rv = G.rival;
  if (rv && !rv.hidden) {
    const gap = rv.dist - p.dist, b = Math.abs(gap) / 2.4;
    const t = b < 0.5 ? '並んだ！' : (b >= 10 ? `はるか${gap > 0 ? '前' : '後ろ'}` : `${Math.round(b)}馬身${gap > 0 ? '前' : '後ろ'}`);
    txt(`${rv.spec.name.slice(0, 8)} ${t}`, 8, top + 59, 10, gap > 0 ? 0xFF90C0 : 0xA0E0FF);
  }
  if (G.mode === 'race' || G.mode === 'gate') {
    const h = G.mode === 'gate' ? 'ゲートが開いたら手綱で出よう' : hint(s);
    if (h) txt(h, L.W / 2, L.hintY, 10, 0xC8CDEE, 'center');
  }
  if (s.time < 4 && G.mode !== 'finish') {
    const x = p.dist * PPM - G.camX - NOSE + A.SIDE_PAD + 41, y = laneY(p.lane) - A.SPR_FEET - 20;
    txt('あなた', x, y, 9, GOLD, 'center');
  }
}

// いま何をすればいいかの一言 (はじめての人向け)
function hint(s) {
  const p = s.player, rem = s.remaining(p);
  if (p.finished) return '';
  if (p.exhausted) return 'バテた… もう伸びない';
  if (p.web > 0) return 'くもの巣！ 進路が変えられない';
  if (p.balk > 0) return '嫌がっている。ムチを止めて手綱で';
  if (p.lane < 0.13) return '内ラチ沿いは荒れている。▼で少し外へ';
  if (p.blocked) return '前が壁！ ▲▼で避けるか「馬群割り」';
  if (s.dashReady && rem < 500) return '★3つ！ 流星ダッシュでまくれ';
  if (rem <= 300) return '残り300m、ムチ連打！';
  if (rem < D.STYLE[p.spec.style].spurtFrom) return '仕掛けどころ。ムチは「嫌気」を見ながら';
  if (p.rein <= 0) return '手綱を押して巡航を保とう (押しっぱなし可)';
  if (p.draft) return '前の馬の後ろ。風よけで体力が減りにくい';
  return 'アイテムを拾いながら、脚をためよう';
}

function drawBanner() {
  const bn = G.banner;
  if (!bn) return;
  const age = G.clock - bn.t0;
  if (age > bn.dur) { G.banner = null; return; }
  if (age < 0.25 && Math.floor(age * 20) % 2) return;
  const size = bn.big ? 22 : 17;
  txt(bn.text, L.W / 2, L.bannerY, size, bn.color, 'center');
  if (bn.sub) txt(bn.sub, L.W / 2, L.bannerY + size + 5, 11, WHITE, 'center');
}

// ---------------------------------------------------------------- レースの進行
function startRace() {
  sound.init();
  const def = raceDef();
  const gate = AUTO ? 3 : Math.floor(Math.random() * 8);
  const seed = Number(qs.get('seed')) || (C.raceIndex * 1000 + Math.floor(Math.random() * 1000) + 1);
  G.sim = new RaceSim({ def, playerSpec: horseSpec(), playerGate: gate, seed, extra: isExtra() });
  const b = C.boost, p = G.sim.player;
  p.staminaK = b.staminaK; p.topBonus = b.topBonus; p.pressureK = b.pressureK;
  G.rival = G.sim.rival;
  G.theme = A.themeOf(def, isExtra());
  buildBackdrop();
  G.parts.length = 0; G.ghosts.length = 0;
  G.straightSaid = false; G.cornerSaid = ''; G.bend = 0; G.heading = 0; G.lastDist = null; G.lastShout = -10; G.slow = 1; G.acc = 0;
  G.whipTimes = [];
  G.camPx = 0.45;
  G.mode = 'still';
  updateCamera(0);
  return G.sim;
}

function goGate() {
  showScreen(null);
  G.mode = 'gate'; G.t = 0;
  G.gateOpenAt = 2.2 + Math.random() * 0.5; G.ticks = 0;
  sound.setMusic('calm'); sound.setCrowd(0.12);
  const def = raceDef();
  banner(def.name, `${def.venue}・${def.surface === 'dirt' ? 'ダート' : '芝'}${def.distance}m${def.rain ? '・重馬場' : ''}`, GOLD, 1.8, true);
}

// 振動 (操作したあとだけ。対応していない端末では何もしない)
function buzz(ms) {
  if (!ms || !navigator.vibrate || !(navigator.userActivation && navigator.userActivation.hasBeenActive)) return;
  try { navigator.vibrate(ms); } catch (e) { /* 何もしない */ }
}

function playerWhip() {
  G.pressed.whip = 0.1;
  if (G.mode === 'train') { trainMash(); return; }
  if (G.mode !== 'race') return;
  const now = performance.now() / 1000;
  G.whipTimes = G.whipTimes.filter(t => now - t < 1).concat(now);
  const n = G.whipTimes.length, power = n >= 5 ? 3 : (n >= 3 ? 2 : 1);   // 連打の速さで強さが決まる (アプリと同じ)
  const p = G.sim.player;
  if (G.sim.whip(p, power)) {
    sound.whip(power);
    buzz(12 * (power === 3));
    const wx = p.dist * PPM - NOSE + A.SIDE_PAD + 30, y = laneY(p.lane) - A.SPR_FEET + 12;
    for (let i = 0; i < 2 + power; i++) spawn(wx - i * 3, y + i * 2, -30 - i * 20, -30 + i * 10, 0.18, 0xFFFFFF, 1, true);
  } else sound.dull();
}
function playerRein(down) {
  if (G.mode !== 'race') return;
  const p = G.sim.player;
  if (down) { G.pressed.rein = 0.1; G.sim.rein(p); sound.rein(); }
  p.holdRein = down;
}
function playerPush() { if (G.mode !== 'race') return; G.pressed.push = 0.12; G.sim.push(G.sim.player); }
function playerBrake() { if (G.mode !== 'race') return; G.pressed.brake = 0.12; G.sim.brake(G.sim.player); }
function playerDash() {
  if (G.mode !== 'race') return;
  G.pressed.dash = 0.12;
  if (G.sim.dashReady) G.sim.dash(G.sim.player); else banner('★が足りない', '3つ集めると使える', DIM, 0.8);
}

function handleEvents() {
  const s = G.sim, pi = s.player.index;
  for (const e of s.events.splice(0)) {
    switch (e.t) {
      case 'show': if (e.i === pi) { banner('見せムチ！', '体力を使わずに加速', 0x80F0FF, 0.8); sound.good(); } break;
      case 'item': {
        if (e.i !== pi) break;
        const it = ITEM[e.kind];
        banner((e.from === 'bag' ? '福袋 → ' : '') + it.name, it.text, it.good ? 0x80F090 : 0xFF8070, 1.1);
        if (it.good) sound.good(); else sound.bad();
        const p = s.player;
        for (let k = 0; k < 8; k++) spawn(p.dist * PPM - NOSE + 60, laneY(p.lane) - 30, Math.cos(k) * 60, -40 - k * 6, 0.5, it.good ? 0xFFF0A0 : 0xFF8080, 2, true);
        break;
      }
      case 'push':
        if (e.i === pi || e.target === pi) {
          sound.push();
          buzz(20);
          if (e.i === pi) banner(e.ok ? 'どけっ！' : 'かたい！', '', e.ok ? 0xFFE040 : 0xA0A0A0, 0.5);
          else banner('ぶつけられた！', '', 0xFF8070, 0.6);
        }
        break;
      case 'pushAir': if (e.i === pi) banner('前に馬がいない', '馬群割りは前がふさがったときに', DIM, 0.8); break;
      case 'brake': if (e.i === pi) banner('控えた', '体力を温存', 0x80C0FF, 0.5); break;
      case 'rail': if (e.i === pi) { banner('ラチに接触！', '', 0xFF8060, 0.6); sound.push(); } break;
      case 'balk': if (e.i === pi) { banner('嫌がった！', '道中のムチの入れすぎ', 0xD090FF, 1.6); sound.bad(); } break;
      case 'exhausted': if (e.i === pi) { banner('バテた…', '体力を使い切った', 0xFF7060, 1.6); sound.bad(); } break;
      case 'dash': if (e.i === pi) { banner('流星ダッシュ！', '', 0xFFE040, 1.0, true); sound.dash(); G.flash = 0.25; G.flashColor = '255,240,160'; } break;
      case 'reveal':
        banner('WARNING!! 後ろから幻影が来る', '', GOLD, 2.4, true);
        G.flash = 0.5; G.flashColor = '255,244,208';
        sound.warning(); sound.setMusic('chase'); sound.setCrowd(0.45);
        break;
      case 'finish': if (e.i === pi) { G.flash = 0.5; G.flashColor = '255,255,255'; sound.goal(); } break;
    }
  }
}

// 最後の直線の盛り上げ・コーナーの知らせ
function stretch(s) {
  const p = s.player, rem = s.remaining(p);
  if (!G.straightSaid && rem < s.homeStraight) {
    G.straightSaid = true;
    banner('最後の直線！', '', 0xFFE040, 1.0, true);
    sound.setMusic('chase'); sound.setCrowd(0.5);
  }
  const cn = s.cornerName(rem);
  if (cn && cn !== G.cornerSaid && rem > s.homeStraight && (!G.banner || G.clock - G.banner.t0 > 1)) { G.cornerSaid = cn; banner(cn, '外を回るほど遠回り', 0xA0E0FF, 0.9); }
  if (rem >= s.homeStraight || s.time - G.lastShout < 2.6 || p.finished) return;
  const others = s.runners.filter(r => !r.isPlayer && !r.finished && !r.hidden);
  const all = s.runners.filter(r => !r.finished && !r.hidden);
  const leader = all.reduce((a, b) => a.dist >= b.dist ? a : b);
  let t = null;
  if (leader !== p && leader.dist - p.dist < 9) t = '差せ！';
  else if (leader === p && others.length) { const second = others.reduce((a, b) => b.dist > a.dist ? b : a); if (p.dist - second.dist < 4) t = '粘れ！'; }
  if (!t && others.some(o => Math.abs(o.dist - p.dist) < 2.5)) t = '競り合い！';
  if (t && (!G.banner || G.clock - G.banner.t0 > 0.6)) { G.lastShout = s.time; banner(t, '', t === '粘れ！' ? 0x80E0FF : 0xFF7050, 0.8, true); }
}

let autoF = 0;
function autoPlay(s) {
  const p = s.player, rem = s.remaining(p);
  autoF++;
  const blk = s.aheadBlocker(p, 5);
  G.input.up = false; G.input.down = false;
  if (blk) { if (p.lane < 0.85) G.input.down = true; else G.input.up = true; }
  else if (p.lane < 0.17) G.input.down = true;
  else if (p.lane > 0.3) G.input.up = true;
  if (autoF % 40 === 0) s.rein(p);
  if (rem < 300 && autoF % 12 === 0) playerWhip();
  if (s.dashReady && rem < 350) s.dash(p);
}

function stepRace(dtReal) {
  const s = G.sim, p = s.player;
  const remP = s.remaining(p);
  const want = remP < 70 && remP > 0 && !p.finished ? 0.45 : 1;       // ゴール前 70m はスロー (アプリと同じ)
  G.slow += (want - G.slow) * 0.1;
  G.acc += dtReal * G.slow;
  let guard = 0;
  while (G.acc >= STEP && guard++ < 8) {
    G.acc -= STEP;
    if (AUTO && G.mode === 'race') autoPlay(s);
    if (G.mode === 'race') p.laneInput = (G.input.down ? 1 : 0) - (G.input.up ? 1 : 0);
    s.step(TIME_SCALE * STEP / 2);
    s.step(TIME_SCALE * STEP / 2);
    handleEvents();
    if (G.mode === 'race') stretch(s);
  }
  if (G.mode === 'race' && p.finished) {
    G.mode = 'finish'; G.t = 0;
    const fo = s.finishOrder, place = s.standing(p);
    if (fo.length >= 2 && Math.abs(s.runners[fo[1]].finishTime - s.runners[fo[0]].finishTime) < 0.12 && (fo[0] === p.index || fo[1] === p.index)) banner('写真判定', '', WHITE, 1.6, true);
    else banner(place === 1 ? 'ゴール！ 1着！' : `ゴール ${place}着`, '', place <= 3 ? 0xFFE040 : WHITE, 1.6, true);
    sound.setMusic('off'); sound.setCrowd(0.7);
    p.laneInput = 0; p.holdRein = false;
  }
  if (G.mode === 'finish') {
    const done5 = s.finishOrder.length >= 5;
    if ((done5 && G.t > 2.6) || G.t > 7 || s.allFinished) { G.mode = 'still'; showResult(); }
  }
}

function effects(dtReal) {
  for (const q of G.parts) { q.wx += q.vx * dtReal; q.y += q.vy * dtReal; q.life -= dtReal; }
  G.parts = G.parts.filter(q => q.life > 0);
  for (const gh of G.ghosts) gh.life -= dtReal;
  G.ghosts = G.ghosts.filter(gh => gh.life > 0);
  const ph = G.sim ? G.sim.phantom : (G.mode === 'title' ? G.attract : null);
  if (ph && !ph.hidden && T.th && T.th.night) {
    const wx = ph.dist * PPM, y = Math.round(laneY(ph.lane)) - A.SPR_FEET - 1;
    if (G.clock - G.ghostAt > 0.085) { G.ghostAt = G.clock; G.ghosts.push({ wx, y, frame: frameOf(ph), life: 0.3 }); }
    if (G.clock - G.sparkAt > 0.03) { G.sparkAt = G.clock; spawn(wx - NOSE + 20 + Math.random() * 70, y + 6 + Math.random() * 38, 380, -20 - Math.random() * 20, 0.5, [0xFFF4C0, 0xFFFFFF, GOLD][Math.floor(Math.random() * 3)], 1, true); }
  }
  const s = G.sim;
  if (s && s.started && !s.player.finished) {
    const p = s.player, f = frameOf(p);
    if (f !== G.lastFrame) {
      G.lastFrame = f;
      if (f === 3 || f === 7 || f === 11) {
        sound.hoof(f === 3 ? 1 : 0.7);
        const dust = T.th.dirt ? 0xD8AA70 : T.th.ground[3];
        for (const r of s.runners) if (!r.hidden && Math.random() < 0.6) spawn(r.dist * PPM - NOSE + 30 + Math.random() * 30, laneY(r.lane) - 2, 250, -30 - Math.random() * 30, 0.25, dust, 1);
      }
    }
  }
}

function updateCamera(dtReal) {
  const W = L.W;
  if (!G.sim) {
    G.attract.dist += 28 * dtReal;
    G.camX = G.attract.dist * PPM - W * 0.62;
    return;
  }
  const s = G.sim, p = s.player, ph = s.phantom;
  let target = 0.45;
  if (ph && !ph.hidden && !p.finished && s.extra) {
    const d = p.dist - ph.dist;
    const lo = d > 0 ? (8 + (d + 2.7) * PPM) / W : 0, hi = d < 0 ? (W - 8 + d * PPM) / W : 1;
    target = clamp(clamp(0.45, lo, 1), 0, hi);
  }
  target = clamp(target, 0.3, 0.84);
  G.camPx += (target - G.camPx) * Math.min(1, dtReal * 2.5);
  G.camX = p.dist * PPM - W * G.camPx;
  // コーナーの曲がり具合 (見た目だけ。計算はアプリのまま)
  const inCorner = s.started && !p.finished && s.isCorner(s.remaining(p));
  G.bend += ((inCorner ? 1 : 0) - G.bend) * Math.min(1, dtReal * 1.5);
  if (G.lastDist != null && inCorner) G.heading += (p.dist - G.lastDist) / s.shape.innerR;
  G.lastDist = p.dist;
}

// ---------------------------------------------------------------- 調教のミニゲーム (連打で走り、▲▼で丸太をよける)
function startTraining(kind) {
  G.theme = A.themeOf({ surface: kind === 'turf' ? 'turf' : 'dirt', rain: false }, false);
  buildBackdrop();
  const logs = [];
  let d = 40, seed = C.raceIndex * 7 + 3;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  while (d < 280) {
    const l = Math.floor(rnd() * 3);
    logs.push({ d, lane: l, hit: false });
    if (rnd() < 0.33) logs.push({ d, lane: (l + 1 + Math.floor(rnd() * 2)) % 3, hit: false });
    d += 18 + rnd() * 12;
  }
  G.train = { kind, dist: 0, v: 0, time: 0, lane: 1, laneY: 1, stun: 0, logs, phase: 0, limit: 28, course: 300, t0: G.clock, held: false };
  G.sim = null;
  G.mode = 'train';
  showScreen(null);
  banner('よーい…', '', WHITE, 1.4, true);
  sound.setMusic('off');
}
function trainMash() {
  const t = G.train;
  if (!t || t.phase !== 1 || t.stun > 0) return;
  t.v = Math.min(16, t.v + 1.25);
  sound.whip(1);
}
function stepTrain(dt) {
  const t = G.train;
  if (t.phase === 0 && G.clock - t.t0 > 1.4) { t.phase = 1; banner('スタート！', '連打で走る・▲▼で丸太をよける', WHITE, 1.4); sound.gate(); sound.setMusic('calm'); }
  if (t.phase === 1) {
    t.time += dt;
    t.v = Math.max(0, t.v - (t.kind === 'slope' ? 3.2 : (t.kind === 'dirt' ? 2.6 : 2.2)) * dt);
    if (t.stun > 0) { t.stun -= dt; t.v = Math.min(t.v, 3); }
    t.dist += t.v * dt * 1.6;
    if (G.input.up && !t.held) { t.lane = Math.max(0, t.lane - 1); t.held = true; }
    else if (G.input.down && !t.held) { t.lane = Math.min(2, t.lane + 1); t.held = true; }
    if (!G.input.up && !G.input.down) t.held = false;
    for (const lg of t.logs) if (!lg.hit && Math.abs(lg.d - t.dist) < 1.2 && lg.lane === t.lane) { lg.hit = true; t.stun = 0.9; t.v *= 0.3; sound.bad(); }
    if (AUTO) {
      if (Math.floor(G.clock * 60) % 5 === 0) trainMash();
      const nx = t.logs.find(l => !l.hit && l.d > t.dist && l.d - t.dist < 6 && l.lane === t.lane);
      if (nx) t.lane = [0, 1, 2].find(l => !t.logs.some(o => !o.hit && o.lane === l && Math.abs(o.d - nx.d) < 1)) ?? t.lane;
    }
    if (t.dist >= t.course || t.time >= t.limit) endTraining(t.dist >= t.course);
  }
  t.laneY += (t.lane - t.laneY) * Math.min(1, dt * 12);
}
function endTraining(ok) {
  const t = G.train;
  t.phase = 2;
  C.trainedThisTurn = true;
  const gain = ok ? (t.time < t.limit * 0.55 ? 2 : 1) : 0;
  const key = { turf: 'speed', dirt: 'stamina', slope: 'guts' }[t.kind];
  C.bonus[key] = Math.min(4, C.bonus[key] + gain);
  saveCareer();
  sound.setMusic('off');
  if (ok) sound.win(); else sound.bad();
  const what = { speed: 'スピード', stamina: 'スタミナ', guts: 'ガッツ' }[key];
  setTimeout(() => showMessage(ok ? 'GOAL' : 'TIME UP', gain > 0 ? `${what}が ${gain} 上がった！` : '能力は上がらなかった…', '厩舎へ', showStable), 900);
}
function drawTrain() {
  const t = G.train, g = pg, W = L.W;
  const camX = t.dist * PPM - W * 0.3;
  const rows = [0.2, 0.5, 0.8];
  const lane = rows[0] + (rows[2] - rows[0]) * (t.laneY / 2);
  drawScene({ camX, runners: [], player: null, goal: t.course, items: null });
  for (const lg of t.logs) {
    if (lg.hit) continue;
    const x = Math.round(lg.d * PPM - camX), y = Math.round(laneY(rows[lg.lane]));
    if (x < -30 || x > W + 30) continue;
    g.fillStyle = '#3a2410'; g.fillRect(x - 10, y - 12, 20, 12);
    g.fillStyle = '#8a5a30'; g.fillRect(x - 9, y - 11, 18, 10);
    g.fillStyle = '#c89a60'; g.fillRect(x + 5, y - 11, 4, 10);
  }
  const fake = { index: 0, dist: t.dist, spec: D.ROSTER[C.horseIndex] };
  const x = Math.round(t.dist * PPM - camX) - NOSE, fy = Math.round(laneY(lane));
  g.globalAlpha = 0.5; g.drawImage(T.shadow, x + 21, fy - 4); g.globalAlpha = 1;
  g.drawImage(A.horseFrames(fake.spec, t.stun > 0 ? 'tired' : 'run')[t.v > 0.5 ? frameOf(fake) : 5], x, fy - A.SPR_FEET - 1 - (t.stun > 0 ? 3 : 0));
}

// ---------------------------------------------------------------- 毎フレーム
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  advance(dt);
}
function advance(dtReal) {
  if (!L) return;
  G.clock += dtReal; G.t += dtReal;
  for (const k in G.pressed) G.pressed[k] = Math.max(0, G.pressed[k] - dtReal);
  G.flash = Math.max(0, G.flash - dtReal);
  const s = G.sim;
  if (G.mode === 'gate') {
    const marks = [0.9, 1.3, 1.7];
    if (G.ticks < 3 && G.t >= marks[G.ticks]) { G.ticks++; sound.tick(); }
    if (G.t >= G.gateOpenAt) { s.start(); G.mode = 'race'; G.t = 0; sound.gate(); banner('スタート！', '', WHITE, 0.9); }
  } else if (G.mode === 'race' || G.mode === 'finish') stepRace(dtReal);
  else if (G.mode === 'train') stepTrain(dtReal);
  else if (G.mode === 'still' && s && s.started) { G.acc += dtReal; while (G.acc >= STEP) { G.acc -= STEP; s.step(TIME_SCALE * STEP); s.events.length = 0; } }
  if (G.mode !== 'train') updateCamera(dtReal);
  effects(dtReal);
  sound.update();

  txtQueue = [];
  const racing = ['gate', 'race', 'finish', 'still'].includes(G.mode) && s;
  if (G.mode === 'train') drawTrain();
  else if (s) drawScene({ camX: G.camX, runners: s.runners, player: s.player, phantom: s.phantom, items: s.items, goal: s.distance, gate: s.time < 8, gateOpen: s.started, still: !s.started, bend: G.bend, heading: G.heading });
  else drawScene({ camX: G.camX, runners: [G.attract], player: null, phantom: G.attract, items: null, goal: 0, shift: G.titleShift || 0 });
  if (racing || G.mode === 'train') { drawDeck(pg); drawControls(pg); if (racing) { drawRadar(pg); drawMap(pg); } }
  else drawDeck(pg, G.titleShift || 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pix, 0, 0, L.W * K, L.H * K);
  if (G.flash > 0) { ctx.fillStyle = `rgba(${G.flashColor},${Math.min(0.7, G.flash * 1.4)})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  for (const q of txtQueue) txt(...q);
  if (racing || G.mode === 'train') drawControlLabels();
  if (racing) drawHud();
  if (G.mode === 'train') {
    const t = G.train;
    txt(String(Math.max(0, Math.ceil(t.limit - t.time))), L.W / 2, L.top + 14, 34, 0xF0D060, 'center');
    txt(`のこり ${Math.max(0, Math.round(t.course - t.dist))}m`, 10, L.top + 20, 11);
    txt(`調教：${{ turf: '芝コース', dirt: 'ダート', slope: '坂路' }[t.kind]}`, L.W - 10, L.top + 20, 11, WHITE, 'right');
  }
  if (['gate', 'race', 'finish', 'train'].includes(G.mode)) drawBanner();
}

// ---------------------------------------------------------------- 操作
const inRect = (b, x, y, pad = 4) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
const inCircle = (b, x, y, pad = 6) => Math.hypot(x - b.cx, y - b.cy) <= b.r + pad;
function zoneAt(e) {
  const rect = cv.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (cv.width / rect.width) / K, y = (e.clientY - rect.top) * (cv.height / rect.height) / K;
  if (inCircle(L.whip, x, y, 10)) return 'whip';
  if (x < L.up.x + L.up.w + 8 && y > L.up.y - 12) return y < L.down.y - 2 ? 'up' : 'down';
  if (G.mode === 'train') return null;
  if (inCircle(L.dash, x, y)) return 'dash';
  if (inCircle(L.rein, x, y, 8)) return 'rein';
  if (inRect(L.push, x, y)) return 'push';
  if (inRect(L.brake, x, y)) return 'brake';
  return null;
}
function syncLane() {
  let up = false, down = false, rein = false;
  for (const z of G.pointers.values()) { if (z === 'up') up = true; if (z === 'down') down = true; if (z === 'rein') rein = true; }
  G.input.up = up || G.keys.up; G.input.down = down || G.keys.down;
  if (G.sim && G.mode === 'race') G.sim.player.holdRein = rein || G.keys.rein;
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!['race', 'gate', 'train'].includes(G.mode)) return;
  const z = zoneAt(e);
  if (!z) return;
  G.pointers.set(e.pointerId, z);
  if (z === 'whip') playerWhip();
  else if (z === 'rein') playerRein(true);
  else if (z === 'push') playerPush();
  else if (z === 'brake') playerBrake();
  else if (z === 'dash') playerDash();
  syncLane();
}, { passive: false });
cv.addEventListener('pointermove', e => {
  const z0 = G.pointers.get(e.pointerId);
  if (z0 !== 'up' && z0 !== 'down') return;
  const z = zoneAt(e);
  if (z === 'up' || z === 'down') { G.pointers.set(e.pointerId, z); syncLane(); }
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, e => { if (G.pointers.delete(e.pointerId)) syncLane(); });
cv.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (!['race', 'gate', 'train'].includes(G.mode)) return;
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w') { G.keys.up = true; syncLane(); }
  else if (k === 'ArrowDown' || k === 's') { G.keys.down = true; syncLane(); }
  else if (k === 'x' || k === ' ') { if (!e.repeat) playerWhip(); }
  else if (k === 'z') { if (!e.repeat) { G.keys.rein = true; playerRein(true); } }
  else if (k === 'ArrowRight') { if (!e.repeat) playerPush(); }
  else if (k === 'ArrowLeft') { if (!e.repeat) playerBrake(); }
  else if (k === 'c') { if (!e.repeat) playerDash(); }
  else return;
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (e.key === 'ArrowUp' || e.key === 'w') G.keys.up = false;
  if (e.key === 'ArrowDown' || e.key === 's') G.keys.down = false;
  if (e.key === 'z') G.keys.rein = false;
  syncLane();
});
window.addEventListener('blur', () => { G.keys = { up: false, down: false, rein: false }; G.pointers.clear(); syncLane(); });

// ---------------------------------------------------------------- 画面 (DOM)
function showScreen(html, id = 'screen', cls = '') {
  ui.textContent = '';
  if (html !== null && id !== 'result') sound.setCrowd(0);   // レースの外では歓声を止める
  if (html === null) return null;
  const el = document.createElement('section');
  el.className = 'screen ' + cls;
  el.id = id;
  el.innerHTML = html;
  ui.appendChild(el);
  return el;
}
const on = (el, sel, fn) => { const n = el.querySelector(sel); if (n) n.addEventListener('click', fn); return n; };

function spriteCanvas(spec, frame = 9, crop = true) {
  const c = document.createElement('canvas');
  c.className = 'px';
  c.width = crop ? A.SPR_W - 16 : A.SPR_W; c.height = crop ? A.SPR_H - 10 : A.SPR_H;
  c.getContext('2d').drawImage(A.horseFrames(spec, 'run')[frame], crop ? -10 : 0, crop ? -10 : 0);
  return c;
}
function headCanvas(spec) {
  const c = document.createElement('canvas');
  c.className = 'px'; c.width = 32; c.height = 32;
  c.getContext('2d').drawImage(A.horseFrames(spec, 'run')[2], -(A.SIDE_PAD + 44), -4);
  return c;
}

// ---- タイトル
function showTitle() {
  G.mode = 'title'; G.sim = null; G.banner = null;
  G.theme = A.themeOf(D.RACES[9], true); buildBackdrop();
  sound.setMusic('off'); sound.setCrowd(0);
  const sc = save.career;
  const cont = sc && (sc.raceIndex > 0 || sc.starts > 0) && !sc.extraOnly;
  const el = showScreen(`
    <div class="title-top">
      <p class="kicker">北嶺の小さな厩舎から、世界へ</p>
      <h1><span class="jp">ターフの幻影</span><span class="en">PHANTOM OF THE TURF</span></h1>
      <p class="catch">9つのレースの先に、漆黒の馬が待つ。</p>
    </div>
    <div class="wrap">
      ${cont ? `<button class="btn primary" id="cont">つづきから（第${sc.raceIndex + 1}話）</button>` : ''}
      <button class="btn ${cont ? '' : 'primary'}" id="new">はじめから</button>
      ${save.cleared ? `<button class="btn" id="extra" style="border-color:#c89a30;color:#ffd860">EXTRA　幻影賞に挑む</button>`
        : `<button class="btn" id="trial" style="border-color:#c89a30;color:#ffd860">体験版　いきなり幻影賞</button>
           <p class="note center">体験版は、育てていない馬で挑む。物語で育てた馬ほど、幻影に届きやすい</p>`}
      <p class="record">${save.plays ? `これまで ${save.plays}レース${save.cleared ? '・全クリ済み' : ''}${save.phantomBeaten ? '・幻影に勝利' : ''}` : ''}</p>
      <p class="foot"><button class="link" id="howto">あそびかた</button><button class="link" id="mute">${sound.muted ? '音 OFF' : '音 ON'}</button><span>のす工房</span></p>
    </div>`, 'title');
  if (cont) on(el, '#cont', () => { sound.init(); C = save.career; if (C.atStable) showStable(); else showStory(); });
  on(el, '#new', () => { sound.init(); if (cont && !confirm('いまの物語を消して、はじめからにしますか？')) return; C = newCareer(); showSelect(); });
  on(el, '#extra', () => {
    sound.init();
    C = newCareer();
    C.extraOnly = true;
    if (save.champion) { C.horseIndex = save.champion.horse; C.bonus = Object.assign({}, save.champion.bonus); }
    C.raceIndex = D.EXTRA_INDEX;
    showStory();
  });
  on(el, '#trial', () => {
    sound.init();
    C = newCareer();
    C.extraOnly = true; C.trial = true; C.credits = 3;
    C.raceIndex = D.EXTRA_INDEX;
    showStory();
  });
  on(el, '#howto', showHowTo);
  on(el, '#mute', e => { sound.init(); sound.setMuted(!sound.muted); save.muted = sound.muted; persist(); e.target.textContent = sound.muted ? '音 OFF' : '音 ON'; });
  requestAnimationFrame(measureTitle);
}
function measureTitle() {
  G.titleShift = 0;
  const t = $('#title');
  if (!t || !L) return;
  const a = t.querySelector('.title-top').getBoundingClientRect(), b = t.querySelector('.wrap').getBoundingClientRect();
  const freeMid = (a.bottom + b.top) / 2 * L.dpr / K;
  G.titleShift = Math.round((L.farRailY - 34 + L.trackBottom) / 2 - freeMid);
}

function showHowTo() {
  const el = showScreen(`<div class="wrap">
    <div class="panel"><h2>あそびかた</h2>
    <p class="note" style="color:#eef0fa;line-height:1.9">
    <b class="gold">▲▼</b> 進路（上が内）。内ラチ沿いは荒れていて遅い<br>
    <b class="gold">手綱</b> 押している間は巡航を保つ。離すと流して遅くなる<br>
    <b class="gold">ムチ</b> 連打の速さで強さが変わる。体力を使い、道中で入れすぎると嫌がる。残り300mは使い放題<br>
    <b class="gold">見せムチ</b> ムチのすぐあとに手綱。体力を使わずに加速<br>
    <b class="gold">馬群割り</b> 前の馬を押しのける ／ <b class="gold">控える</b> 体力を温存し、後ろの馬をつかえさせる<br>
    <b class="gold">★</b> 3つ集めて流星ダッシュ<br>
    3着以内で次の話へ。負けてもクレジットが残っていればやり直せる。</p></div>
    <div class="panel"><h2>アイテム</h2><div id="itemlist" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div></div>
    <p class="note">キーボード: ↑↓ 進路・Z 手綱・X ムチ・→ 馬群割り・← 控える・C 流星ダッシュ</p>
    <button class="btn primary" id="ok">もどる</button></div>`, 'howto', 'dim-bg');
  const box = el.querySelector('#itemlist');
  for (const [k, it] of Object.entries(ITEM)) {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:11px';
    const img = document.createElement('canvas'); img.className = 'px'; img.width = 16; img.height = 16; img.style.width = '24px'; img.style.height = '24px';
    img.getContext('2d').drawImage(A.itemIcon(k), 0, 0);
    const s = document.createElement('span');
    s.innerHTML = `<span style="color:${it.good ? '#80f090' : '#ff8070'}">${esc(it.name)}</span><br><span style="color:#9aa0c8">${esc(it.text)}</span>`;
    d.append(img, s); box.appendChild(d);
  }
  on(el, '#ok', showTitle);
}

// ---- 馬えらび
function showSelect(change = false) {
  G.mode = 'still';
  let sel = C.horseIndex;
  const el = showScreen(`<div class="wrap">
    <div class="panel"><h2>${change ? '馬を乗りかえる' : '相棒をえらぶ'}</h2><div class="grid" id="grid" role="radiogroup"></div></div>
    <div class="panel"><div class="card" id="card"></div></div>
    <button class="btn primary" id="go">この馬で行く</button>
    <button class="link" id="back">もどる</button></div>`, 'select', 'dim-bg');
  const grid = el.querySelector('#grid');
  // 選んだ馬は、輪切りのドット絵を重ねた立体で回して見せる (js/stack.js)
  const turn = makeTurntable(D.ROSTER[sel]);
  const draw = () => {
    const h = D.ROSTER[sel];
    const bonus = change ? C.bonus : { speed: 0, stamina: 0, guts: 0 };
    const bars = (n, b) => Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : (i < n + b ? 'plus' : '')}"></i>`).join('');
    const card = el.querySelector('#card');
    card.innerHTML = `<div class="info"><div class="name">${esc(h.name)}</div><div class="ttl">${esc(h.persona.title)}</div>
      <div class="stat">スピード<div class="bars">${bars(h.speed, bonus.speed)}</div></div>
      <div class="stat">スタミナ<div class="bars">${bars(h.stamina, bonus.stamina)}</div></div>
      <div class="stat">ガッツ<div class="bars">${bars(h.guts, bonus.guts)}</div></div>
      <p class="note">脚質 ${D.STYLE[h.style].name}${h.gait !== 'normal' ? `・${h.gait === 'pitch' ? 'ピッチ' : 'ストライド'}走法` : ''}<br>${esc(h.blurb)}</p></div>`;
    turn.set(h);
    card.prepend(turn.canvas);
    const go = el.querySelector('#go');
    go.disabled = !unlocked(sel);
    go.textContent = unlocked(sel) ? 'この馬で行く' : (sel === D.PHANTOM_INDEX ? '幻影賞で勝つと選べる' : '物語を全クリすると選べる');
    grid.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-checked', String(Number(t.dataset.i) === sel)));
  };
  D.ROSTER.forEach((h, i) => {
    if (i === D.PHANTOM_INDEX && !save.cleared) return;
    const b = document.createElement('button');
    b.className = 'tile' + (unlocked(i) ? '' : ' locked');
    b.dataset.i = i;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', h.name);
    b.append(spriteCanvas(h, 9));
    const n = document.createElement('span'); n.className = 'nm'; n.textContent = h.name; b.append(n);
    b.addEventListener('click', () => { sel = i; draw(); });
    grid.appendChild(b);
  });
  draw();
  on(el, '#go', () => {
    if (!unlocked(sel)) return;
    C.horseIndex = sel;
    saveCareer();
    if (change) goEntries(); else showStory();
  });
  on(el, '#back', () => change ? renderResult() : showTitle());
}

// ---- 物語 (出走前の紙芝居)
function showStory() {
  G.mode = 'still'; G.sim = null;
  C.atStable = false; saveCareer();
  G.theme = A.themeOf(raceDef(), isExtra()); buildBackdrop();
  const i = C.raceIndex, def = raceDef();
  const rivals = D.rivalsFor(def.name);
  const ctxS = { raceIndex: i, horse: D.ROSTER[C.horseIndex], rival: rivals[0] || null, guests: rivals.slice(1), lastPlace: C.lastPlace, duels: C.duels, trial: !!C.trial };
  const lines = D.storyLines(ctxS);
  const el = showScreen(`
    <div class="stage" id="stage"></div>
    <div class="dialog" id="dlg"><div class="face" id="face"></div><div style="flex:1;min-width:0"><div class="who" id="who"></div><div class="txt" id="txt"></div><div class="caret">▼</div></div></div>
    <button class="btn small skip" id="skip" style="width:auto">SKIP ▶▶</button>
    <div class="door" id="door"><div class="ep">${i >= D.MAIN_COUNT ? 'EXTRA EPISODE' : `第${i + 1}話`}</div>
      <div class="tt">${esc(D.TITLES[i])}</div><div class="sub">― ${esc(def.name)}（${esc(def.grade)}）${esc(def.venue)}・${def.surface === 'dirt' ? 'ダート' : '芝'}${def.distance}m ―</div>
      <div class="sub">${esc(D.TAGLINES[i])}</div><div class="sub" style="margin-top:20px">TOUCH</div></div>`, 'story');
  if (i >= D.MAIN_COUNT) el.style.background = 'linear-gradient(180deg,#05061a 0%,#0b1034 45%,#1a1e52 60%,#0f3b2c 60%,#0b3024 100%)';
  const stage = el.querySelector('#stage');
  const me = D.ROSTER[C.horseIndex];
  const right = spriteCanvas(me, 2, false); right.classList.add('right');
  stage.append(right);
  let leftC = null, leftKey = '';
  const showLeft = spec => {
    if (leftKey === spec.id) return;
    leftKey = spec.id;
    if (leftC) leftC.remove();
    leftC = spriteCanvas(spec, 2, false); leftC.classList.add('left');
    stage.append(leftC);
  };
  let k = -1, typing = null, full = '';
  const faceBox = el.querySelector('#face'), who = el.querySelector('#who'), txtEl = el.querySelector('#txt');
  const setFace = cnv => {
    faceBox.textContent = '';
    if (cnv) { const c = document.createElement('canvas'); c.className = 'px'; c.width = cnv.width; c.height = cnv.height; c.getContext('2d').drawImage(cnv, 0, 0); faceBox.append(c); }
    faceBox.style.visibility = cnv ? 'visible' : 'hidden';
  };
  let finished = false;
  const finish = () => { if (finished) return; finished = true; if (typing) clearInterval(typing); goEntries(); };
  const next = () => {
    if (typing) { clearInterval(typing); typing = null; txtEl.textContent = full; return; }
    k++;
    if (k >= lines.length) { finish(); return; }
    const ln = lines[k];
    let name = '', face = null, theirs = false, spec = null;
    if (ln.who === 'trainer') { name = `調教師 ${D.TRAINER}`; face = A.trainerFace(); }
    else if (ln.who === 'me') { name = `${D.JOCKEY.player}（騎手）`; face = A.jockeyFace(me.silk, me.silk2, me.silk2); }
    else if (ln.who === 'horse') { name = me.name; face = headCanvas(me); }
    else if (ln.who === 'rival') { spec = ctxS.rival.spec; name = spec.name; face = headCanvas(spec); theirs = true; }
    else if (ln.who === 'rivalJockey') { spec = ctxS.rival.spec; name = `${ctxS.rival.jockey}（${spec.name}の騎手）`; face = A.jockeyFace(spec.silk, spec.silk2, spec.silk2, 0x3A2A1A); theirs = true; }
    else if (ln.who.startsWith('guest:')) { const g = ctxS.guests.find(x => x.spec.id === ln.who.slice(6)); spec = g.spec; name = `${g.jockey}（${spec.name}の騎手）`; face = A.jockeyFace(spec.silk, spec.silk2, spec.silk2, 0x3A2A1A); theirs = true; }
    if (spec) showLeft(spec);
    who.textContent = name;
    setFace(face);
    faceBox.classList.toggle('theirs', theirs);
    if (leftC) leftC.classList.toggle('shade', !theirs && ln.who !== 'narration');
    right.classList.toggle('shade', theirs);
    full = (ln.who === 'narration' || ln.who === 'horse' || ln.who === 'rival') ? ln.text : `「${ln.text}」`;
    let n = 0; txtEl.textContent = '';
    typing = setInterval(() => { n++; txtEl.textContent = full.slice(0, n); if (n % 3 === 0) sound.blip(); if (n >= full.length) { clearInterval(typing); typing = null; } }, 32);
  };
  const door = el.querySelector('#door');
  const openDoor = () => { if (!door.isConnected) return; door.remove(); next(); };
  door.addEventListener('click', openDoor);
  setTimeout(openDoor, AUTO ? 200 : 2600);
  sound.bell();
  el.querySelector('#dlg').addEventListener('click', next);
  on(el, '#skip', finish);
  if (AUTO) { const iv = setInterval(() => { if (!el.isConnected || finished) { clearInterval(iv); return; } if (!door.isConnected) next(); }, 60); }
}

// ---- 出馬表
function goEntries() {
  const s = startRace();
  const f = s.forecast();
  const def = s.def;
  const rows = s.runners.filter(r => !r.hidden).map(r => `<tr class="${r.isPlayer ? 'me' : (r === G.rival ? 'rival' : '')}">
    <td><span class="cap" style="background:${hex(D.FRAME_COLORS[r.index])};color:${[1, 3].includes(r.index) ? '#fff' : '#000'}">${r.index + 1}</span></td>
    <td class="nm">${esc(r.spec.name)}</td><td>${esc(r.isPlayer ? D.JOCKEY.player : r.jockey)}</td><td>${D.STYLE[r.spec.style].name}</td>
    <td class="mark">${f.marks[r.index] || ''}</td><td>${f.pop[r.index]}</td></tr>`).join('');
  const el = showScreen(`<div class="wrap">
    <div class="panel"><h2>${esc(def.name)}　<span style="color:#eef0fa;font-size:12px">${esc(def.venue)}・${def.surface === 'dirt' ? 'ダート' : '芝'}${def.distance}m${def.rain ? '・重' : ''}　1着 ${D.formatYen(def.prize)}</span></h2>
    <table class="entries"><tr><th>枠</th><th>馬名</th><th>騎手</th><th>脚質</th><th>印</th><th>人気</th></tr>${rows}</table>
    <p class="note" style="margin-top:8px">予想　${esc(f.comment)}</p>
    ${s.extra ? '<p class="note" style="color:#ffd860">……出走表は 8 頭。だが、ゲートの裏に冷たい気配がある。</p>' : ''}
    ${C.boost.names.length ? `<p class="note" style="color:#80e0ff">持っていく道具: ${esc(C.boost.names.join('・'))}</p>` : ''}</div>
    <p class="note center">${isExtra() ? '幻影より先に、1着でゴールすれば勝ち' : '3着以内で次の話へ'}　のこりクレジット ${C.credits}</p>
    <button class="btn primary" id="go">ゲートへ</button>
    <button class="link" id="howto">あそびかた</button></div>`, 'entries', 'dim-bg');
  on(el, '#go', goGate);
  on(el, '#howto', () => { showHowTo(); $('#ok').onclick = () => goEntriesAgain(); });
  if (AUTO) setTimeout(goGate, 200);
}
function goEntriesAgain() { goEntries(); }

// ---- 結果
let lastResult = null;
function showResult() {
  const s = G.sim, order = s.finalOrder(), p = s.player;
  const place = order.indexOf(p) + 1;
  const extra = isExtra();
  const win = extra ? place === 1 : place <= 3;
  const prize = win ? Math.floor(s.def.prize * ([1, 0.4, 0.25, 0.15, 0.1][place - 1] || 0)) : 0;
  C.starts++; if (place === 1) C.wins++;
  C.lastPlace = place; C.lastRace = s.def.name;
  order.forEach((r, ri) => {
    if (r.isPlayer || !D.STORY_NAMES.has(r.spec.name)) return;
    const d = C.duels[r.spec.id] || { won: 0, lost: 0 };
    if (place - 1 < ri) d.won++; else d.lost++;
    C.duels[r.spec.id] = d;
  });
  if (win) {
    C.totalPrize += prize; C.money += prize; C.finishes.push(place);
    if (place === 1 && !extra) { const k = ['speed', 'stamina', 'guts'][C.raceIndex % 3]; C.bonus[k] = Math.min(3, C.bonus[k] + 1); }   // 1 着で少し成長
    if (!extra && C.raceIndex < D.MAIN_COUNT - 1) C.atStable = true;
  } else C.credits--;
  C.boost = { staminaK: 1, topBonus: 0, pressureK: 1, names: [] };
  save.plays = (save.plays || 0) + 1;
  let unlockMsg = '';
  if (extra && win && C.trial) unlockMsg = '育てていない馬で幻影に勝った！';
  else if (extra && win) { unlockMsg = save.phantomBeaten ? '幻影に、また勝った！' : 'ファントムナイトが馬選びで使えるようになった！'; save.phantomBeaten = true; }
  saveCareer();
  lastResult = { place, win, prize, extra, def: s.def, time: p.finishTime, unlockMsg,
    order: order.map(r => ({ name: r.spec.name, me: r.isPlayer, cap: D.FRAME_COLORS[r.index], t: r.finished ? r.finishTime : null, id: r.spec.id })) };
  if (win) sound.win(); else sound.lose();
  sound.fadeCrowd(win ? 2 : 0.5);
  renderResult();
}

function renderResult() {
  G.mode = 'still';
  const R = lastResult, def = R.def;
  let prev = null;
  const rows = R.order.map((r, i) => {
    const m = i === 0 || r.t === null || prev === null ? '' : RaceSim.margin(r.t - prev);
    prev = r.t;
    return `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td><span class="cap" style="background:${hex(r.cap)}"></span></td><td class="nm">${esc(r.name)}</td><td>${r.t ? RaceSim.formatTime(r.t) : '-'}</td><td>${m}</td></tr>`;
  }).join('');
  const main = D.rivalsFor(def.name)[0];
  let cut = '';
  if (main) {
    const ri = R.order.findIndex(r => r.id === main.spec.id), rivalWon = ri >= 0 && ri < R.place - 1;
    const per = main.spec.persona;
    cut = `<div class="cut ${rivalWon ? 'lost' : ''}"><div id="rface"></div><div>
      <div class="t1">${esc(main.spec.name)}　${ri + 1}着</div><div class="t2">${esc(rivalWon ? per.win : per.lose)}</div>
      ${main.spec.id === 'phantom' ? '' : `<div class="t3">${esc(main.jockey)}「${esc(D.rivalWord(main.spec.id, rivalWon))}」</div>`}</div></div>`;
  }
  const road = R.extra ? '' : `<div class="road">${D.RACES.slice(0, D.MAIN_COUNT).map((r, i) => `<span class="${i < C.raceIndex || (i === C.raceIndex && R.win) ? 'done' : (i === C.raceIndex ? 'now' : '')}">${esc(r.grade)}</span>`).join('')}</div>`;
  const over = !R.win && C.credits <= 0;
  const me = D.ROSTER[C.horseIndex];
  const shareText = R.extra && C.trial
    ? (R.win ? `体験版で漆黒の幻影に勝った！ ${me.name}で幻影賞1着` : `体験版で漆黒の幻影に挑んだ… 幻影賞${R.place}着`)
    : R.extra
    ? (R.win ? `漆黒の幻影に勝った！ ${me.name}で幻影賞1着` : `漆黒の幻影に敗れた… ${me.name}で幻影賞${R.place}着`)
    : `第${C.raceIndex + 1}話「${def.name}」${R.place}着！ ${me.name}`;
  const share = 'https://x.com/intent/post?text=' + encodeURIComponent(`【ターフの幻影】${shareText}\n9つのレースの先に、漆黒の馬が待つ。 #ターフの幻影`) + '&url=' + encodeURIComponent(location.origin + location.pathname);
  const el = showScreen(`<div class="wrap">
    <p class="big ${R.win ? 'win' : ''}">${R.place}着</p>
    <p class="center" style="font-size:15px">${esc(def.name)}　${R.time ? RaceSim.formatTime(R.time) : ''}</p>
    ${cut}
    <div class="panel"><table class="entries"><tr><th>着</th><th></th><th>馬名</th><th>タイム</th><th>着差</th></tr>${rows}</table></div>
    <dl class="prize"><div><dt>獲得賞金</dt><dd>${D.formatYen(R.prize)}</dd></div><div><dt>総賞金</dt><dd>${D.formatYen(C.totalPrize)}</dd></div></dl>
    ${road}
    ${R.unlockMsg ? `<p class="center gold">${esc(R.unlockMsg)}</p>` : ''}
    ${!R.win ? `<p class="center red">${over ? 'GAME OVER' : `${R.extra ? '幻影に届かなかった' : '3着以内に入れなかった'}　のこりクレジット ${C.credits}`}</p>` : ''}
    ${C.trial ? `<p class="note center">体験版の馬は育成なし。物語を「はじめから」進めると、勝つたびに速さ・体力・根性が伸び、厩舎の調教と買い物で仕上げてから幻影賞に挑める。</p>` : ''}
    <div id="next" class="wrap" style="gap:8px"></div>
    <a class="btn small" href="${share}" target="_blank" rel="noopener">結果を X にポスト</a></div>`, 'result', 'dim-bg');
  if (main) el.querySelector('#rface').append(headCanvas(main.spec));
  const nx = el.querySelector('#next');
  const add = (label, fn, primary = false) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label; b.addEventListener('click', fn); nx.appendChild(b); return b; };
  if (C.trial) {
    if (!R.win && !over) add('もう一度挑む', goEntries, true);
    add('はじめから育てる', () => { save.career = null; persist(); C = newCareer(); showSelect(); }, R.win || over);
    add('タイトルへ', () => { save.career = null; persist(); showTitle(); });
  } else if (R.win && R.extra) add('タイトルへ', () => { save.career = null; persist(); showTitle(); }, true);
  else if (R.win && C.raceIndex === D.MAIN_COUNT - 1) add('エンディングへ', showEnding, true);
  else if (R.win) add('厩舎へ', showStable, true);
  else if (!over) {
    add('もう一度走る', goEntries, true);
    if (!R.extra) add('馬を乗りかえる', () => showSelect(true));
  } else add('タイトルへ', () => { save.career = null; persist(); showTitle(); }, true);
  if (AUTO && !qs.has('stay')) setTimeout(() => { const b = nx.querySelector('button'); if (b) b.click(); }, 400);
}

// ---- 厩舎 (調教・買い物)
function showStable() {
  G.mode = 'still'; G.sim = null;
  G.theme = A.themeOf(D.RACES[0], false); buildBackdrop();
  C.atStable = true; saveCareer();
  const next = D.RACES[C.raceIndex + 1];
  const h = horseSpec();
  const canTrain = D.TRAINING_AFTER.includes(C.raceIndex) && !C.trainedThisTurn;
  const remain = D.TRAINING_AFTER.filter(x => x >= C.raceIndex).length - (C.trainedThisTurn ? 1 : 0);
  const bars = (n, b) => Array.from({ length: 10 }, (_, i) => `<i class="${i < n - b ? 'on' : (i < n ? 'plus' : '')}"></i>`).join('');
  const el = showScreen(`<div class="wrap">
    <div class="panel"><h2>厩舎　<span style="color:#eef0fa;font-size:12px">次は ${esc(next.name)}（${esc(next.venue)}・${next.surface === 'dirt' ? 'ダート' : '芝'}${next.distance}m${next.rain ? '・雨' : ''}）</span></h2>
      <div class="card" id="card"><div class="info"><div class="name">${esc(h.name)}</div><div class="ttl">所持金 ${D.formatYen(C.money)}</div>
      <div class="stat">スピード<div class="bars">${bars(h.speed, C.bonus.speed)}</div></div>
      <div class="stat">スタミナ<div class="bars">${bars(h.stamina, C.bonus.stamina)}</div></div>
      <div class="stat">ガッツ<div class="bars">${bars(h.guts, C.bonus.guts)}</div></div>
      <p class="note">脚質 ${D.STYLE[h.style].name}　通算 ${C.starts}戦${C.wins}勝　緑は育った分</p></div></div></div>
    <div class="panel"><h2>調教 <span class="note">${canTrain ? '1回だけできる' : (C.trainedThisTurn ? '調教は済み' : (remain > 0 ? `決まったレースのあとだけ（あと${remain}回）` : 'もうできない'))}</span></h2>
      <div class="choice">
      <button class="btn small" data-t="turf" ${canTrain ? '' : 'disabled'}>芝コース<small>スピードが上がる</small></button>
      <button class="btn small" data-t="dirt" ${canTrain ? '' : 'disabled'}>ダート<small>スタミナが上がる</small></button>
      <button class="btn small" data-t="slope" ${canTrain ? '' : 'disabled'}>坂路<small>ガッツが上がる</small></button></div></div>
    <div class="panel"><h2>買い物（次のレースだけ）</h2><div class="choice" id="shop"></div></div>
    <button class="btn primary" id="go">次のレースへ</button></div>`, 'stable');
  el.querySelector('#card').prepend(spriteCanvas(D.ROSTER[C.horseIndex], 9));
  el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => startTraining(b.dataset.t)));
  const shop = el.querySelector('#shop');
  for (const it of D.SHOP) {
    const owned = C.boost.names.includes(it.name);
    const b = document.createElement('button');
    b.className = 'btn small';
    b.disabled = owned || C.money < it.price;
    b.innerHTML = `${esc(it.name)}　${owned ? '購入済み' : D.formatYen(it.price)}<small>${esc(it.text)}</small>`;
    b.addEventListener('click', () => { C.money -= it.price; it.apply(C.boost); C.boost.names.push(it.name); saveCareer(); sound.good(); showStable(); });
    shop.appendChild(b);
  }
  on(el, '#go', () => { C.raceIndex++; C.trainedThisTurn = false; C.atStable = false; saveCareer(); showStory(); });
  if (AUTO) setTimeout(() => { const t = el.querySelector('[data-t]:not([disabled])'); if (t && qs.has('train')) t.click(); else el.querySelector('#go').click(); }, 300);
}

function showMessage(title, sub, label, fn) {
  G.mode = 'still';
  const el = showScreen(`<div class="wrap" style="margin:auto"><p class="big win">${esc(title)}</p><p class="center" style="font-size:18px">${esc(sub)}</p><button class="btn primary" id="ok">${esc(label)}</button></div>`, 'msg', 'dim-bg');
  on(el, '#ok', fn);
  if (AUTO) setTimeout(fn, 300);
}

// ---- エンディング → 後日談 → 幻影賞の予告
function showEnding() {
  save.cleared = true;
  save.champion = { horse: C.horseIndex, bonus: Object.assign({}, C.bonus) };
  persist();
  const pages = D.epilogue(C, D.ROSTER[C.horseIndex]);
  let k = -1;
  const el = showScreen(`<div class="wrap" style="margin:auto">
    <p class="center gold" style="font-size:22px">世界の頂点へ</p>
    <p class="center">北嶺の小さな厩舎の馬が、ワールドチャンピオンSを制した。<br>総賞金 ${D.formatYen(C.totalPrize)}・通算 ${C.starts}戦${C.wins}勝</p>
    <div class="panel" id="page" style="min-height:150px"></div>
    <button class="btn primary" id="nx">つぎへ</button></div>`, 'ending', 'dim-bg');
  const page = el.querySelector('#page');
  const next = () => {
    k++;
    if (k >= pages.length) { showTeaser(); return; }
    page.innerHTML = `<h2>― そして ―　${esc(pages[k].name)}</h2>${pages[k].lines.map(l => `<p class="note" style="color:#eef0fa;margin-bottom:8px">${esc(l)}</p>`).join('')}`;
  };
  on(el, '#nx', next);
  next();
  sound.win();
  if (AUTO) { const iv = setInterval(() => { if (!el.isConnected) { clearInterval(iv); return; } next(); }, 200); }
}
function showTeaser() {
  G.theme = A.themeOf(D.RACES[9], true); buildBackdrop(); G.mode = 'title'; G.sim = null;
  const el = showScreen(`<div class="wrap" style="margin:auto">
    <p class="center note" style="color:#eef0fa;line-height:2;font-size:14px">……その年の暮れ。<br>府中台の夜のレースに、<br>出走表にない馬がまぎれこむという。</p>
    <p class="center gold" style="font-size:20px;margin:16px 0">EXTRA EPISODE「ファントム」</p>
    <button class="btn primary" id="go">挑む</button><button class="btn" id="later">またこんど</button></div>`, 'teaser', 'dim-bg');
  on(el, '#go', () => { C.raceIndex = D.EXTRA_INDEX; C.extraOnly = true; C.credits = Math.max(C.credits, 3); saveCareer(); showStory(); });
  on(el, '#later', () => { save.career = null; persist(); showTitle(); });
  if (AUTO) setTimeout(() => el.querySelector('#go').click(), 300);
}

// ---------------------------------------------------------------- 起動
window.addEventListener('resize', () => { resize(); if (G.mode === 'title') measureTitle(); });
document.addEventListener('visibilitychange', () => { last = performance.now(); if (sound.ctx) (document.hidden ? sound.ctx.suspend() : sound.ctx.resume()); });
resize();
showTitle();
if (document.fonts && document.fonts.load) document.fonts.load('16px "DotGothic16"', '残り位手綱ムチ馬群割り控える流星体力速さ嫌気').then(measureTitle).catch(() => {});
requestAnimationFrame(frame);
if (AUTO) {
  const start = Number(qs.get('race') || 0);
  setTimeout(() => { C = newCareer(); C.horseIndex = Number(qs.get('horse') || 8); C.raceIndex = start; const b = Number(qs.get('bonus') || 0); C.bonus = { speed: b, stamina: b, guts: b }; if (start >= D.MAIN_COUNT) C.extraOnly = true; showStory(); }, 300);
}
// 確認用: 画面が裏にあって描画が止まる環境でも、時間を手で進めて確かめられるようにする
window.__game = G;
window.__run = sec => { for (let i = 0; i < Math.round(sec * 60); i++) advance(STEP); return { mode: G.mode, rem: G.sim ? Math.round(G.sim.remaining(G.sim.player)) : null, place: G.sim ? G.sim.standing(G.sim.player) : null }; };
window.__career = () => C;
