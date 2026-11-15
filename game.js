'use strict';
/* ORB PIT — roguelite brick-breaker / survivors em pixel art de 32 bits.
   Ficheiro único de lógica, sem dependências. Resolução lógica 200 x H (H dinâmico). */
(() => {
const W = 200, WALL = 6, TOP = 22;
let H = 356;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------------- gravação ---------------- */
const SAVE_KEY = 'orbpit.save.v1';
const save = { unlocked: 1, stars: [0, 0, 0, 0, 0, 0], aim: null, sound: true, char: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
if (!save.aim) save.aim = (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'auto' : 'manual';
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

/* ---------------- áudio (chiptune simples) ---------------- */
let AC = null, lastHitSfx = 0, lastBoomSfx = 0;
function initAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
}
function beep(f, d = 0.06, type = 'square', v = 0.04, slide = 0) {
  if (!AC || !save.sound) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d);
}
const sfx = {
  hit() { const n = performance.now(); if (n - lastHitSfx < 35) return; lastHitSfx = n; beep(280 + Math.random() * 120, .04, 'square', .025); },
  kill() { beep(200, .12, 'sawtooth', .04, -140); },
  boom() { const n = performance.now(); if (n - lastBoomSfx < 90) return; lastBoomSfx = n; beep(110, .22, 'sawtooth', .06, -70); },
  zap() { beep(900, .05, 'square', .02, -500); },
  hurt() { beep(130, .3, 'sawtooth', .07, -80); },
  lvl() { beep(520, .1, 'square', .05); setTimeout(() => beep(780, .16, 'square', .05), 90); },
  pick() { beep(660, .06, 'square', .04); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .16, 'square', .05), i * 120)); },
  lose() { [330, 262, 196, 130].forEach((f, i) => setTimeout(() => beep(f, .2, 'sawtooth', .05), i * 150)); },
  boss() { beep(70, .5, 'sawtooth', .08, 30); },
};

/* ---------------- dados do jogo ---------------- */
const ORDER = ['fire', 'ice', 'poison', 'shock', 'bomb', 'ghost'];
const BT = {
  iron:   { name: 'Iron Ball',   c: '#d5d9e6', dmg: 1.2,  d: 'Solid, reliable damage' },
  fire:   { name: 'Fire Ball',   c: '#ff7a2a', dmg: 1,    d: 'Burns enemies over time' },
  ice:    { name: 'Ice Ball',    c: '#6fd8ff', dmg: 1,    d: 'Slows enemies down' },
  poison: { name: 'Poison Ball', c: '#8ee04a', dmg: 0.9,  d: 'Stacking poison damage' },
  shock:  { name: 'Shock Ball',  c: '#ffe94a', dmg: 0.9,  d: 'Chains lightning to others' },
  bomb:   { name: 'Bomb Ball',   c: '#ff4f6d', dmg: 1,    d: 'Explodes on impact' },
  ghost:  { name: 'Ghost Ball',  c: '#b98cff', dmg: 0.75, d: 'Pierces through enemies' },
};
const FUS = {
  'fire+ice': 'Steam Orb', 'fire+poison': 'Blight Orb', 'fire+shock': 'Plasma Orb', 'fire+bomb': 'Meteor',
  'fire+ghost': 'Soulfire', 'ice+poison': 'Cryotoxin', 'ice+shock': 'Storm Orb', 'ice+bomb': 'Glacier Mine',
  'ice+ghost': 'Specter', 'poison+shock': 'Virus Orb', 'poison+bomb': 'Plague Bomb', 'poison+ghost': 'Miasma',
  'shock+bomb': 'Thunderbomb', 'shock+ghost': 'Phantom Arc', 'bomb+ghost': 'Haunted Mine',
};
const PASSIVES = [
  { id: 'pow',   name: 'Power Up',    desc: '+20% damage to all balls',   max: 6, c: '#ff6a4a', ab: 'ATK' },
  { id: 'spd',   name: 'Swift Orbs',  desc: '+12% ball speed',            max: 5, c: '#4ac8ff', ab: 'SPD' },
  { id: 'xtra',  name: 'Extra Ball',  desc: '+1 ball every volley',       max: 3, c: '#ffd23f', ab: '+1' },
  { id: 'size',  name: 'Big Orbs',    desc: 'Balls get larger',           max: 3, c: '#b98cff', ab: 'BIG' },
  { id: 'crit',  name: 'Sharp Eye',   desc: '+10% crit chance (x2 dmg)',  max: 5, c: '#ffe94a', ab: 'CRT' },
  { id: 'heart', name: 'Heart',       desc: '+1 max HP and heal 1',       max: 5, c: '#ff4455', ab: 'HP' },
  { id: 'regen', name: 'Regen',       desc: 'Heal 1 HP every 25 seconds', max: 2, c: '#8ee04a', ab: 'REG' },
  { id: 'move',  name: 'Boots',       desc: '+15% move speed',            max: 3, c: '#7a8cff', ab: 'RUN' },
  { id: 'xp',    name: 'Scholar',     desc: '+25% XP gained',             max: 3, c: '#5ae6a0', ab: 'XP' },
];
const CH = [
  { name: 'KNIGHT', hue: 215, hat: 205, hp: 7, ball: 'iron',  mv: 1,    bs: 1,    crit: 0,   desc: 'Tough. Iron Ball' },
  { name: 'PYRO',   hue: 18,  hat: 5,   hp: 5, ball: 'fire',  mv: 1,    bs: 1,    crit: 0,   desc: 'Starts with Fire' },
  { name: 'SHADE',  hue: 270, hat: 290, hp: 4, ball: 'ghost', mv: 1.12, bs: 1.08, crit: 0.1, desc: 'Fast. Ghost Ball' },
];
const LV = [
  { name: 'MOSSY PIT',     hue: 125, dur: 60, boss: 'MOSS KING' },
  { name: 'CRYSTAL CAVE',  hue: 195, dur: 70, boss: 'GEM GOLEM' },
  { name: 'EMBER HOLLOW',  hue: 18,  dur: 75, boss: 'MAGMA BEAST' },
  { name: 'TOXIC SEWER',   hue: 85,  dur: 80, boss: 'SLUDGE LORD' },
  { name: 'HAUNTED CRYPT', hue: 265, dur: 85, boss: 'THE LICH' },
  { name: 'VOID CORE',     hue: 320, dur: 90, boss: 'VOID EYE' },
];
const ET = {
  grunt: { hp: 8,  spd: 11, xp: 2, dmg: 1, off: 0 },
  bat:   { hp: 5,  spd: 20, xp: 2, dmg: 1, off: 40 },
  tank:  { hp: 40, spd: 6,  xp: 7, dmg: 2, off: -25 },
  shoot: { hp: 14, spd: 10, xp: 5, dmg: 1, off: 160 },
  boss:  { hp: 0,  spd: 12, xp: 0, dmg: 3, off: 0 },
};
const MAXSLOTS = 5, MAXLVL = 5, D0 = 5;
const nOf = l => Math.ceil(l * 0.75);

/* ---------------- sprites (pixel art em strings) ---------------- */
const MAPS = {
  grunt: [
    '....oooo....', '..ooccaaoo..', '.occaaaaaao.', '.oawkaawkao.', 'oaaaaaaaaaao',
    'oaaaaaaaaaao', 'obaaaaaaaabo', '.obbbbbbbbo.', '..oooooooo..'],
  bat: [
    'oo..........oo', 'obo...oo...obo', 'obbo.oaao.obbo', 'obaaooaaooaabo', '.obawkaawkabo.',
    '..obaaaaaabo..', '...ooaaaaoo...', '.....oaao.....', '......oo......'],
  tank: [
    '..oooooooooooo..', '.occcccccccccco.', 'occaaaaaaaaaacco', 'oaaaaaaaaaaaaaao', 'oaaokkoaaokkoaao',
    'oaaokwoaaokwoaao', 'oaaaoooaaoooaaao', 'obaaaaaaaaaaaabo', 'obaaaokkkkkkoaabo', 'obbaaaaaaaaaabbo',
    '.obbbbbbbbbbbbo.', '..oooooooooooo..'],
  shoot: [
    '....oooo....', '...occcco...', '..occaaaao..', '..oakkkkao..', '..oakrrkao..',
    '...oaaaaao..', '..obaaaaabo.', '.obbaaaaabbo', '.obbaacaabbo', '.obbaaaaabbo',
    '..obbbbbbbo.', '...oooooooo.'],
  boss: [
    'y..y..y..y..y', '.yyyyyyyyyyy.', 'ooooooooooooooo', 'occcccccccccco', 'ocaaaaaaaaaaaco',
    'oaawwwaaaawwwao', 'oaawkwaaaawkwao', 'oaawwwaaaawwwao', 'oaaaaaaaaaaaaao', 'obaakkkkkkkaabo',
    'obbaakwkwkaabbo', '.obbbbbbbbbbbo.', '..ooooooooooo..'],
  player: [
    '..oooooo..', '.ohhhhhho.', 'ohhhhhhhho', 'osskssksso', '.osssssso.',
    'occaaaaaco', 'oaaaaaaaao', 'obaaaaaabo', '.obbbbbbo.', '..oo..oo..'],
  heart: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
};
const dims = m => ({ w: Math.max(...m.map(r => r.length)), h: m.length });
for (const k of ['grunt', 'bat', 'tank', 'shoot']) { const d = dims(MAPS[k]); ET[k].w = d.w; ET[k].h = d.h; }
{ const d = dims(MAPS.boss); ET.boss.w = d.w * 2; ET.boss.h = d.h * 2; }
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
const palOf = (h, extra) => Object.assign({
  o: '#15101f', k: '#15101f', a: hsl(h, 55, 52), b: hsl(h, 55, 33), c: hsl(h, 60, 74),
  w: '#fff', r: '#ff4455', y: '#ffd23f', s: '#f1c8a0', g: '#3a3348',
}, extra || {});
const SPR = {};
function makeSpr(map, pal, flash) {
  const d = dims(map), c = document.createElement('canvas');
  c.width = d.w; c.height = d.h;
  const g = c.getContext('2d');
  map.forEach((row, y) => {
    const pad = Math.floor((d.w - row.length) / 2);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]; if (ch === '.') continue;
      g.fillStyle = flash ? '#fff' : (pal[ch] || '#f0f');
      g.fillRect(x + pad, y, 1, 1);
    }
  });
  return c;
}
function getSpr(type, hue, flash) {
  const key = type + '|' + hue + '|' + (flash ? 1 : 0);
  return SPR[key] || (SPR[key] = makeSpr(MAPS[type], palOf(hue), flash));
}
function getPlayerSpr(ch, flash) {
  const key = 'pl|' + ch + '|' + (flash ? 1 : 0), C = CH[ch];
  return SPR[key] || (SPR[key] = makeSpr(MAPS.player, palOf(C.hue, { h: hsl(C.hat, 70, 46) }), flash));
}
const HEART_FULL = makeSpr(MAPS.heart, { r: '#ff4455' }, false);
const HEART_EMPTY = makeSpr(MAPS.heart, { r: '#3a3348' }, false);

/* ---------------- primitivas de desenho ---------------- */
function pxCircle(cx, cy, r, col) {
  ctx.fillStyle = col; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r + r * 0.8 - dy * dy));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}
function drawBallIcon(fx, x, y, r) {
  const c1 = BT[fx[0]].c, c2 = fx[1] ? BT[fx[1]].c : null, c3 = fx[2] ? BT[fx[2]].c : null;
  pxCircle(x, y, r + 1, '#15101f'); pxCircle(x, y, r, c1);
  if (c2 && r > 1) pxCircle(x + 1, y + 1, Math.max(1, r - 1), c2);
  if (c3 && r > 3) pxCircle(x + 1, y + 1, r - 3, c3);
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x) - Math.max(1, r - 2), Math.round(y) - Math.max(1, r - 2), 1, 1);
}
function txt(s, x, y, c = '#fff', size = 8, align = 'left', mono = false) {
  ctx.font = mono ? `bold ${size}px monospace` : `${size}px "Press Start 2P",monospace`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.fillStyle = '#000'; ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = c; ctx.fillText(s, Math.round(x), Math.round(y));
}
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
let BTN = [];
function button(label, x, y, w, h, fn, opt = {}) {
  const r = { x, y, w, h, fn }; BTN.push(r);
  const press = ptr.down && inRect(ptr.x, ptr.y, r);
  ctx.fillStyle = '#0a0710'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = opt.bg || '#2f2850'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = press ? '#1c1730' : (opt.hi || '#5b4f94'); ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = press ? (opt.hi || '#5b4f94') : '#1c1730'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  txt(label, x + w / 2, y + h / 2 - 4 + (press ? 1 : 0), opt.fg || '#fff', 8, 'center');
  return r;
}
function panel(x, y, w, h, edge, bg) {
  ctx.fillStyle = '#0a0710'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = edge || '#5b4f94'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = bg || '#221c3a'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/* ---------------- estado global ---------------- */
let scene = 'title', G = null, tt = 0, FLOOR = 0, FAIL = 0;
const P = { x: W / 2, y: 300 };
const keys = {};
const ptr = { x: W / 2, y: 100, down: false, ui: false, seen: false };
const TB = Array.from({ length: 7 }, (_, i) => ({ x: rnd(10, 190), y: rnd(20, 300), vx: rnd(-60, 60) || 40, vy: rnd(40, 90) * (i % 2 ? 1 : -1), k: ORDER[i % ORDER.length] }));

function layout() { P.y = H - 30; FLOOR = P.y + 6; FAIL = P.y - 14; }
function resize() {
  const aw = innerWidth || 400, ah = innerHeight || 800;
  H = Math.max(300, Math.min(440, Math.round(W * ah / aw)));
  cv.width = W; cv.height = H;
  const s = Math.min(aw / W, ah / H);
  cv.style.width = (W * s) + 'px'; cv.style.height = (H * s) + 'px';
  ctx.imageSmoothingEnabled = false;
  layout();
}

/* ---------------- lógica de bolas / cartas ---------------- */
const sortFx = a => a.sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
const makeEntry = (fx, lvl = 1, bonus = 1) => ({ fx, lvl, bonus });
function ballName(b) {
  if (b.fx.length === 1) return BT[b.fx[0]].name;
  if (b.fx.length === 2) return FUS[sortFx([...b.fx]).join('+')] || 'Fusion Orb';
  return 'Chaos Orb';
}
const shortName = b => ballName(b).replace(' Ball', '');
function dmgOf(en) {
  let m = 0; for (const f of en.fx) m += BT[f].dmg; m /= en.fx.length;
  return D0 * m * (1 + 0.25 * (en.lvl - 1)) * en.bonus * (1 + 0.2 * (G.pas.pow || 0));
}

function startLevel(n, ch) {
  const C = CH[ch];
  G = {
    n, ch, C, t: 0, boss: null, bossPhase: false, spawnT: 1.2, hp: C.hp, maxhp: C.hp,
    inv: [makeEntry([C.ball])], pas: {}, xp: 0, xpNeed: 8, plvl: 1, pending: n * 2,
    balls: [], queue: [], fireT: 0, enemies: [], eb: [], parts: [], fx: [], pk: [],
    invT: 0, shake: 0, kills: 0, dmgTaken: 0, regenT: 0, over: false, clear: false, endT: 0,
    cards: null, eid: 0, warn: 0, crit: C.crit,
  };
  P.x = W / 2; scene = 'play';
  if (G.pending > 0) openCards();
}
function openCards() { G.cards = makeCards(); scene = 'cards'; sfx.lvl(); }
function makeCards() {
  const g = G, pool = [];
  const has = k => g.inv.some(b => b.fx.length === 1 && b.fx[0] === k);
  if (g.inv.length < MAXSLOTS) for (const k of ORDER) if (!has(k)) pool.push({ kind: 'ball', type: k, w: 3 });
  g.inv.forEach((b, i) => { if (b.lvl < MAXLVL) pool.push({ kind: 'up', i, w: 5 }); });
  for (let i = 0; i < g.inv.length; i++) for (let j = i + 1; j < g.inv.length; j++) {
    const a = g.inv[i], b = g.inv[j];
    if (a.lvl < 2 || b.lvl < 2 || a.fx.includes('iron') || b.fx.includes('iron')) continue;
    const u = sortFx([...new Set([...a.fx, ...b.fx])]);
    if (u.length > 3 || u.length <= Math.max(a.fx.length, b.fx.length)) continue;
    pool.push({ kind: 'fuse', i, j, u, w: 9 });
  }
  for (const p of PASSIVES) if ((g.pas[p.id] || 0) < p.max) pool.push({ kind: 'pas', p, w: 2.5 });
  const out = [];
  while (out.length < 3 && pool.length) {
    let r = Math.random() * pool.reduce((s, c) => s + c.w, 0), k = 0;
    for (; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) break; }
    out.push(pool.splice(Math.min(k, pool.length - 1), 1)[0]);
  }
  if (!out.length) out.push({ kind: 'heal' });
  return out;
}
function choose(i) {
  const g = G, c = g.cards && g.cards[i]; if (!c) return;
  if (c.kind === 'ball') g.inv.push(makeEntry([c.type]));
  else if (c.kind === 'up') g.inv[c.i].lvl++;
  else if (c.kind === 'fuse') {
    const a = g.inv[c.i], b = g.inv[c.j];
    const ne = makeEntry(c.u, Math.min(MAXLVL, Math.max(a.lvl, b.lvl) + 1), 1.35);
    g.inv.splice(c.j, 1); g.inv[c.i] = ne;
  } else if (c.kind === 'pas') {
    g.pas[c.p.id] = (g.pas[c.p.id] || 0) + 1;
    if (c.p.id === 'heart') { g.maxhp++; g.hp = Math.min(g.maxhp, g.hp + 1); }
    if (c.p.id === 'crit') g.crit += 0.1;
  } else if (c.kind === 'heal') g.hp = Math.min(g.maxhp, g.hp + 2);
  sfx.pick();
  g.pending--;
  if (g.pending > 0) g.cards = makeCards(); else { g.cards = null; scene = 'play'; }
}
function addXP(v) {
  const g = G; g.xp += v * (1 + 0.25 * (g.pas.xp || 0));
  while (g.xp >= g.xpNeed) { g.xp -= g.xpNeed; g.plvl++; g.xpNeed = Math.round(g.xpNeed * 1.15 + 3); g.pending++; }
  if (g.pending > 0 && scene === 'play') openCards();
}

/* ---------------- inimigos ---------------- */
function spawn(type, x, y) {
  const T = ET[type], i = G.n, prog = Math.min(1, G.t / LV[i].dur);
  const m = (1 + i * 0.5) * (1 + prog * 0.8);
  const hp = type === 'boss' ? Math.round(340 * (1 + i * 0.55)) : Math.max(2, Math.round(T.hp * m));
  const e = {
    id: ++G.eid, type, x, y, x0: x, hw: T.w / 2, hh: T.h / 2, hp, max: hp, spd: T.spd * (1 + i * 0.05),
    t: rnd(0, 6), flash: 0, slow: 0, slowF: 1, burn: null, pois: null, shootT: rnd(1, 2.2), dead: false,
    xp: T.xp, dmg: T.dmg, boss: type === 'boss', sT: 2.5, spT: 6,
  };
  G.enemies.push(e); return e;
}
function spawnFormation() {
  const i = G.n, prog = G.t / LV[i].dur, o = ['row'];
  if (prog > 0.15 || i > 0) o.push('vee');
  if (i >= 1 || prog > 0.5) o.push('tank');
  if ((i >= 1 && prog > 0.25) || i >= 2) o.push('shoot');
  if (i >= 2) o.push('swarm');
  const f = pick(o), y0 = TOP - 8, xl = WALL + 12, xr = W - WALL - 12;
  if (f === 'row') {
    const n = Math.min(6, 3 + ri(0, 2) + (i >> 1)), off = rnd(-6, 6);
    for (let k = 0; k < n; k++) spawn('grunt', lerp(xl, xr, n === 1 ? .5 : k / (n - 1)) + off * (k % 2 ? 1 : -1) * 0.3, y0 - (k % 2) * 6);
  } else if (f === 'vee') {
    const cx = rnd(60, 140);
    for (let k = -2; k <= 2; k++) spawn('bat', clamp(cx + k * 22, xl, xr), y0 - Math.abs(k) * 10);
  } else if (f === 'tank') {
    const x = rnd(60, 140); spawn('tank', x, y0 - 4);
    spawn('grunt', clamp(x - 36, xl, xr), y0); spawn('grunt', clamp(x + 36, xl, xr), y0);
  } else if (f === 'shoot') {
    const n = i >= 3 ? 2 : 1;
    for (let k = 0; k < n; k++) spawn('shoot', n === 1 ? rnd(50, 150) : (k ? 150 : 50), y0 - k * 8);
    spawn('grunt', xl + 10, y0 - 12); spawn('grunt', xr - 10, y0 - 12);
  } else {
    for (let k = 0; k < 8; k++) spawn('bat', rnd(xl, xr), y0 - k * 14);
  }
}

/* ---------------- efeitos ---------------- */
function burst(x, y, c, n = 6, sp = 50) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 260) break;
    const a = rnd(0, TAU), s = rnd(10, sp);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, m: rnd(.25, .55), c, s: Math.random() < .3 ? 2 : 1 });
  }
}
function hurt(e, d, dot) {
  if (e.dead) return;
  e.hp -= d; if (!dot) e.flash = 0.07;
  if (e.hp <= 0) killE(e);
}
function killE(e) {
  e.dead = true; const g = G; g.kills++;
  burst(e.x, e.y, hsl(LV[g.n].hue + ET[e.type].off, 55, 55), e.boss ? 40 : 10, e.boss ? 110 : 60);
  sfx.kill();
  if (e.boss) {
    g.clear = true; g.endT = 1.5; g.shake = 8; sfx.win();
    for (const o of g.enemies) if (!o.dead && o !== e) { o.dead = true; burst(o.x, o.y, '#fff', 8, 60); }
    g.eb.length = 0;
    return;
  }
  addXP(e.xp);
  if (Math.random() < 0.045) g.pk.push({ x: e.x, y: e.y });
}
function chain(src, dmg, k) {
  const near = G.enemies.filter(o => !o.dead && o !== src && Math.hypot(o.x - src.x, o.y - src.y) < 58)
    .sort((a, b) => Math.hypot(a.x - src.x, a.y - src.y) - Math.hypot(b.x - src.x, b.y - src.y)).slice(0, k);
  let prev = src;
  for (const o of near) {
    G.fx.push({ k: 'bolt', x1: prev.x, y1: prev.y, x2: o.x, y2: o.y, t: 0.14 });
    hurt(o, dmg); prev = o;
  }
  if (near.length) sfx.zap();
}
function boom(x, y, r, dmg, skip) {
  for (const o of G.enemies) {
    if (o.dead || o === skip) continue;
    if (Math.hypot(o.x - x, o.y - y) - Math.max(o.hw, o.hh) < r) hurt(o, dmg);
  }
  G.fx.push({ k: 'ring', x, y, r, t: 0.28 });
  burst(x, y, '#ff9a3a', 6, 70); sfx.boom(); G.shake = Math.max(G.shake, 2);
}
function ballHit(b, e) {
  const g = G, en = b.e; let d = dmgOf(en);
  const crit = Math.random() < g.crit; if (crit) d *= 2;
  hurt(e, d); sfx.hit();
  burst(b.x, b.y, crit ? '#ffe94a' : BT[en.fx[0]].c, crit ? 5 : 3, 40);
  const L = en.lvl, pw = 1 + 0.2 * (g.pas.pow || 0);
  for (const f of en.fx) {
    if (f === 'fire') e.burn = { t: 3, dps: (2 + 1.5 * L) * pw };
    else if (f === 'ice') { e.slow = 2.5; e.slowF = Math.max(0.3, 0.68 - 0.06 * L); }
    else if (f === 'poison') { const st = e.pois ? Math.min(6, e.pois.s + 1) : 1; e.pois = { t: 4, s: st, dps: (1 + 0.5 * L) * pw }; }
    else if (f === 'shock') chain(e, d * (0.4 + 0.05 * L), 2 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0));
    else if (f === 'bomb') boom(b.x, b.y, 20 + 3 * L, d * 0.6, e);
  }
}
function hurtPlayer(d) {
  const g = G; if (g.invT > 0 || g.over || g.clear) return;
  g.hp -= d; g.invT = 1.2; g.shake = 5; g.dmgTaken++; sfx.hurt();
  burst(P.x, P.y, '#ff4455', 12, 70);
  if (g.hp <= 0) { g.hp = 0; g.over = true; g.endT = 1.0; sfx.lose(); }
}

/* ---------------- tiro ---------------- */
function aimAngle() {
  const g = G; let tx = null, ty = null;
  if (save.aim === 'manual' && ptr.seen) { tx = ptr.x; ty = ptr.y; }
  else {
    const c = g.enemies.filter(e => !e.dead && e.y > TOP + 2).sort((a, b) => b.y - a.y).slice(0, 3);
    if (c.length) { const e = pick(c); tx = e.x; ty = e.y; }
  }
  let a;
  if (tx !== null) a = Math.atan2(tx - P.x, Math.max(24, P.y - ty)) + rnd(-0.05, 0.05);
  else a = rnd(-0.3, 0.3);
  return clamp(a, -1.2, 1.2);
}
function volley() {
  const out = [];
  for (const en of G.inv) for (let k = 0; k < nOf(en.lvl); k++) out.push(en);
  for (let k = 0; k < (G.pas.xtra || 0); k++) out.push(pick(G.inv));
  return out;
}
function ballSpeed() { return 210 * (1 + 0.12 * (G.pas.spd || 0)) * G.C.bs; }
function launch(en) {
  const a = aimAngle(), s = ballSpeed();
  G.balls.push({
    x: P.x, y: P.y - 8, vx: Math.sin(a) * s, vy: -Math.cos(a) * s, r: 3 + 0.7 * (G.pas.size || 0),
    e: en, age: 0, cd: {}, tr: [], pierce: en.fx.includes('ghost'), dead: false,
  });
  beep(700, .03, 'square', .012);
}

/* ---------------- update (jogo) ---------------- */
function updateFx(dt) {
  const g = G;
  for (const p of g.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
  g.parts = g.parts.filter(p => p.t < p.m);
  for (const f of g.fx) f.t -= dt;
  g.fx = g.fx.filter(f => f.t > 0);
  g.shake = Math.max(0, g.shake - dt * 25);
}
function updatePlay(dt) {
  const g = G;
  updateFx(dt);
  if (g.over || g.clear) {
    g.endT -= dt;
    if (g.endT <= 0) { scene = g.clear ? 'clear' : 'over'; if (g.clear) onClear(); }
    return;
  }
  g.t += dt; g.invT = Math.max(0, g.invT - dt); g.warn = Math.max(0, g.warn - dt);

  // movimento do jogador
  let mv = 0; if (keys.ArrowLeft || keys.KeyA) mv -= 1; if (keys.ArrowRight || keys.KeyD) mv += 1;
  const sp = 130 * (1 + 0.15 * (g.pas.move || 0)) * g.C.mv;
  if (mv) P.x += mv * sp * dt;
  else if (ptr.down && !ptr.ui) P.x += clamp(ptr.x - P.x, -sp * 2.2 * dt, sp * 2.2 * dt);
  P.x = clamp(P.x, WALL + 8, W - WALL - 8);

  if (g.pas.regen) { g.regenT += dt; if (g.regenT >= 25 / g.pas.regen) { g.regenT = 0; g.hp = Math.min(g.maxhp, g.hp + 1); } }

  // diretor de ondas
  const L = LV[g.n];
  if (!g.bossPhase) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) { spawnFormation(); g.spawnT = lerp(3.3, 1.8, g.t / L.dur) * (1 - 0.04 * g.n); }
    if (g.t >= L.dur) { g.bossPhase = true; g.warn = 2.5; g.boss = spawn('boss', W / 2, TOP - 20); sfx.boss(); }
  }

  // disparo em rajadas: só dispara de novo quando todas as bolas regressaram
  if (g.queue.length) { g.fireT -= dt; if (g.fireT <= 0) { launch(g.queue.shift()); g.fireT = 0.06; } }
  else if (g.balls.length === 0) { g.queue = volley(); g.fireT = 0.12; }

  // bolas
  const spd = ballSpeed();
  for (const b of g.balls) {
    b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < WALL + b.r) { b.x = WALL + b.r; b.vx = Math.abs(b.vx); }
    else if (b.x > W - WALL - b.r) { b.x = W - WALL - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y < TOP + b.r) { b.y = TOP + b.r; b.vy = Math.abs(b.vy); }
    const k = spd / (Math.hypot(b.vx, b.vy) || 1); b.vx *= k; b.vy *= k;
    const mn = 0.3 * spd;
    if (Math.abs(b.vy) < mn) { b.vy = (b.vy < 0 ? -1 : 1) * mn; b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(spd * spd - mn * mn); }
    b.tr.push([b.x, b.y]); if (b.tr.length > 5) b.tr.shift();
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = b.x - e.x, dy = b.y - e.y;
      const ox = e.hw + b.r - Math.abs(dx), oy = e.hh + b.r - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue;
      if (b.pierce) { if ((b.cd[e.id] || 0) > g.t) continue; b.cd[e.id] = g.t + 0.2; ballHit(b, e); continue; }
      if (ox < oy) { b.vx = (dx < 0 ? -1 : 1) * Math.abs(b.vx); b.x += dx < 0 ? -ox : ox; }
      else { b.vy = (dy < 0 ? -1 : 1) * Math.abs(b.vy); b.y += dy < 0 ? -oy : oy; }
      ballHit(b, e); break;
    }
    if (b.y > FLOOR || b.age > 14) b.dead = true;
  }
  g.balls = g.balls.filter(b => !b.dead);

  // inimigos
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.t += dt; e.flash = Math.max(0, e.flash - dt);
    if (e.slow > 0) e.slow -= dt;
    if (e.burn) { e.burn.t -= dt; hurt(e, e.burn.dps * dt, true); if (Math.random() < dt * 6) burst(e.x + rnd(-e.hw, e.hw), e.y - e.hh, '#ff9a3a', 1, 20); if (e.burn.t <= 0) e.burn = null; }
    if (e.pois && !e.dead) { e.pois.t -= dt; hurt(e, e.pois.s * e.pois.dps * dt, true); if (e.pois.t <= 0) e.pois = null; }
    if (e.dead) continue;
    const sm = e.slow > 0 ? e.slowF : 1;
    if (e.boss) {
      const stopY = TOP + 34; if (e.y < stopY) e.y += e.spd * dt;
      e.x = W / 2 + Math.sin(e.t * 0.7) * 44;
      const ph2 = e.hp < e.max * 0.5;
      e.sT -= dt * (ph2 ? 1.6 : 1);
      if (e.sT <= 0) { e.sT = 2.4; fan(e, 3 + Math.min(4, g.n) + (ph2 ? 2 : 0)); }
      e.spT -= dt;
      if (e.spT <= 0) { e.spT = ph2 ? 5 : 7.5; spawn('grunt', e.x - 14, e.y + 16); spawn('grunt', e.x + 14, e.y + 16); }
      continue;
    }
    if (e.type === 'bat') { e.y += e.spd * sm * dt; e.x = clamp(e.x0 + Math.sin(e.t * 3) * 18, WALL + e.hw, W - WALL - e.hw); }
    else if (e.type === 'shoot') {
      const stopY = TOP + 52;
      if (e.y < stopY) e.y += e.spd * sm * dt; else e.y += 1.8 * sm * dt;
      e.x = clamp(e.x0 + Math.sin(e.t * 0.9) * 22, WALL + e.hw, W - WALL - e.hw);
      e.shootT -= dt * sm;
      if (e.shootT <= 0 && e.y > TOP + 10) {
        e.shootT = 2.4;
        const a = Math.atan2(P.y - e.y, P.x - e.x);
        g.eb.push({ x: e.x, y: e.y + 6, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55 });
      }
    } else e.y += e.spd * sm * dt;
    if (e.y + e.hh >= FAIL) { hurtPlayer(e.dmg); e.dead = true; burst(e.x, e.y, '#fff', 6, 50); }
  }
  g.enemies = g.enemies.filter(e => !e.dead);

  // projéteis inimigos
  for (const p of g.eb) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (Math.hypot(p.x - P.x, p.y - P.y) < 7) { hurtPlayer(1); p.dead = true; }
    if (p.y > H + 4 || p.x < -4 || p.x > W + 4 || p.y < -10) p.dead = true;
  }
  g.eb = g.eb.filter(p => !p.dead);

  // corações
  for (const k of g.pk) {
    k.y += 28 * dt;
    if (k.y > P.y - 6 && Math.abs(k.x - P.x) < 12) { g.hp = Math.min(g.maxhp, g.hp + 1); k.dead = true; sfx.pick(); }
    if (k.y > H) k.dead = true;
  }
  g.pk = g.pk.filter(k => !k.dead);
}
function fan(e, n) {
  const a0 = Math.atan2(P.y - e.y, P.x - e.x);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k - (n - 1) / 2) * 0.28;
    G.eb.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 });
  }
  beep(160, .12, 'square', .04, -60);
}
function onClear() {
  const g = G, stars = g.dmgTaken === 0 ? 3 : g.dmgTaken <= 2 ? 2 : 1;
  g.stars = stars;
  save.stars[g.n] = Math.max(save.stars[g.n] || 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LV.length, g.n + 2));
  persist();
}

/* ---------------- desenho ---------------- */
function drawBg(h, t) {
  ctx.fillStyle = hsl(h, 35, 11); ctx.fillRect(0, 0, W, H);
  const off = Math.floor(t * 8) % 16;
  ctx.fillStyle = hsl(h, 32, 14);
  for (let ry = -1; ry * 16 + off < H; ry++) for (let rx = 0; rx * 16 < W; rx++) {
    if (((rx + ry) & 1) === 0) ctx.fillRect(WALL + rx * 16, ry * 16 + off, 16, 16);
  }
  for (let y = -8 + (off >> 1); y < H; y += 8) {
    const odd = (Math.floor((y - (off >> 1)) / 8) & 1);
    for (const x0 of [0, W - WALL]) {
      ctx.fillStyle = hsl(h, 22, 25); ctx.fillRect(x0, y, WALL, 8);
      ctx.fillStyle = hsl(h, 22, 13); ctx.fillRect(x0, y + 7, WALL, 1); ctx.fillRect(x0 + (odd ? 2 : 4), y, 1, 8);
    }
  }
}
function drawEnemy(e) {
  const hue = LV[G.n].hue + ET[e.type].off, spr = getSpr(e.type, ((hue % 360) + 360) % 360, e.flash > 0);
  const m = e.boss ? 2 : 1, w = spr.width * m, h = spr.height * m;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(Math.round(e.x - w / 2 + 1), Math.round(e.y + h / 2 - 1), w - 2, 2);
  const bob = Math.round(Math.sin(e.t * 5));
  ctx.drawImage(spr, Math.round(e.x - w / 2), Math.round(e.y - h / 2 + bob), w, h);
  let dx = Math.round(e.x - w / 2);
  const dot = c => { ctx.fillStyle = c; ctx.fillRect(dx, Math.round(e.y - h / 2 - 3), 2, 2); dx += 3; };
  if (e.burn) dot('#ff7a2a'); if (e.pois) dot('#8ee04a'); if (e.slow > 0) dot('#6fd8ff');
  if (!e.boss && e.hp < e.max) {
    const bw = Math.round(w), x = Math.round(e.x - w / 2), y = Math.round(e.y + h / 2 + 1);
    ctx.fillStyle = '#15101f'; ctx.fillRect(x, y, bw, 2);
    ctx.fillStyle = '#ff4455'; ctx.fillRect(x, y, Math.max(1, Math.round(bw * e.hp / e.max)), 1);
  }
}
function drawBall(b) {
  const r = Math.round(b.r), c = BT[b.e.fx[0]].c;
  b.tr.forEach((p, i) => { ctx.globalAlpha = (i + 1) / (b.tr.length + 3) * 0.5; ctx.fillStyle = c; ctx.fillRect(Math.round(p[0]) - 1, Math.round(p[1]) - 1, 2, 2); });
  ctx.globalAlpha = 1;
  drawBallIcon(b.e.fx, b.x, b.y, r);
}
function drawPlay() {
  const g = G, L = LV[g.n];
  ctx.save();
  if (g.shake > 0) ctx.translate(Math.round(rnd(-g.shake, g.shake) * 0.5), Math.round(rnd(-g.shake, g.shake) * 0.5));
  drawBg(L.hue, g.t);
  ctx.fillStyle = hsl(L.hue, 30, 7); ctx.fillRect(WALL, FAIL, W - WALL * 2, H - FAIL);
  ctx.fillStyle = 'rgba(255,70,90,.45)';
  for (let x = WALL; x < W - WALL; x += 6) ctx.fillRect(x, FAIL, 3, 1);
  for (const k of g.pk) ctx.drawImage(HEART_FULL, Math.round(k.x - 3), Math.round(k.y - 3));
  for (const e of g.enemies) drawEnemy(e);
  for (const p of g.eb) { pxCircle(p.x, p.y, 2, '#15101f'); pxCircle(p.x, p.y, 1, '#ff5a6e'); }
  for (const b of g.balls) drawBall(b);
  // jogador + mira
  if (!g.over && (g.invT <= 0 || Math.floor(g.t * 20) % 2)) {
    const spr = getPlayerSpr(g.ch, g.invT > 0.9);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(Math.round(P.x - 5), Math.round(P.y + 4), 10, 2);
    ctx.drawImage(spr, Math.round(P.x - 5), Math.round(P.y - 5));
  }
  if (!g.over && !g.clear && scene === 'play' && !g.queue.length) {
    let ang = 0;
    if (save.aim === 'manual' && ptr.seen) ang = Math.atan2(ptr.x - P.x, Math.max(24, P.y - ptr.y));
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let d = 16; d <= 34; d += 9) ctx.fillRect(Math.round(P.x + Math.sin(clamp(ang, -1.2, 1.2)) * d), Math.round(P.y - 8 - Math.cos(clamp(ang, -1.2, 1.2)) * d), 1, 1);
  }
  for (const p of g.parts) { ctx.globalAlpha = 1 - p.t / p.m; ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const f of g.fx) {
    if (f.k === 'ring') {
      const k = 1 - f.t / 0.28; ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = '#ffb04a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.7), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = '#ffe94a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
      ctx.lineTo((f.x1 + f.x2) / 2 + rnd(-4, 4), (f.y1 + f.y2) / 2 + rnd(-4, 4)); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    }
  }
  ctx.restore();
  drawHud();
}
function drawHud() {
  const g = G, L = LV[g.n];
  ctx.fillStyle = '#0d0a14'; ctx.fillRect(0, 0, W, TOP);
  ctx.fillStyle = hsl(L.hue, 30, 28); ctx.fillRect(0, TOP - 1, W, 1);
  for (let i = 0; i < g.maxhp; i++) ctx.drawImage(i < g.hp ? HEART_FULL : HEART_EMPTY, 4 + i * 8, 3);
  // barra de progresso / boss
  const bx = 112, by = 4, bw = 64, bh = 6;
  ctx.fillStyle = '#15101f'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = '#2b2540'; ctx.fillRect(bx, by, bw, bh);
  if (g.bossPhase && g.boss) {
    ctx.fillStyle = Math.floor(g.t * 6) % 2 && g.boss.hp > 0 ? '#ff7788' : '#ff3a52';
    ctx.fillRect(bx, by, Math.max(0, Math.round(bw * g.boss.hp / g.boss.max)), bh);
  } else { ctx.fillStyle = hsl(L.hue, 60, 55); ctx.fillRect(bx, by, Math.round(bw * Math.min(1, g.t / L.dur)), bh); }
  txt('Lv' + g.plvl, bx, 12, '#cfc6ff', 7, 'left', true);
  // XP
  ctx.fillStyle = '#15101f'; ctx.fillRect(0, TOP - 4, W, 3);
  ctx.fillStyle = '#5ae6a0'; ctx.fillRect(0, TOP - 4, Math.round(W * g.xp / g.xpNeed), 2);
  // pausa
  if (scene === 'play') {
    BTN.push({ x: W - 22, y: 2, w: 20, h: 16, fn: togglePause });
    ctx.fillStyle = '#cfc6ff'; ctx.fillRect(W - 15, 5, 3, 9); ctx.fillRect(W - 9, 5, 3, 9);
  }
  // inventário
  ctx.fillStyle = 'rgba(13,10,20,.8)'; ctx.fillRect(WALL, H - 14, W - WALL * 2, 14);
  g.inv.forEach((b, i) => { const x = WALL + 6 + i * 36; drawBallIcon(b.fx, x + 4, H - 7, 3); txt(b.lvl + 'x' + nOf(b.lvl), x + 11, H - 11, '#cfc6ff', 7, 'left', true); });
  if (g.warn > 0 && Math.floor(g.t * 5) % 2) txt('! BOSS !', W / 2, H * 0.4, '#ff4455', 12, 'center');
  if (g.bossPhase && g.boss && g.boss.hp > 0) txt(L.boss, W / 2, TOP + 3, '#ff9aa8', 7, 'center', true);
}
function dim(a = 0.65) { ctx.fillStyle = `rgba(8,5,14,${a})`; ctx.fillRect(0, 0, W, H); }

function cardIcon(c, x, y) {
  ctx.fillStyle = '#15101f'; ctx.fillRect(x, y, 30, 30);
  if (c.kind === 'ball') drawBallIcon([c.type], x + 15, y + 15, 7);
  else if (c.kind === 'up') { drawBallIcon(G.inv[c.i].fx, x + 15, y + 15, 7); txt('+', x + 22, y + 18, '#fff', 8, 'left', true); }
  else if (c.kind === 'fuse') { const a = G.inv[c.i], b = G.inv[c.j]; drawBallIcon(a.fx, x + 10, y + 15, 5); drawBallIcon(b.fx, x + 20, y + 15, 5); }
  else if (c.kind === 'pas') { ctx.fillStyle = c.p.c; ctx.fillRect(x + 3, y + 3, 24, 24); txt(c.p.ab, x + 15, y + 11, '#15101f', 8, 'center', true); }
  else ctx.drawImage(HEART_FULL, x + 8, y + 9, 14, 12);
}
function cardInfo(c) {
  if (c.kind === 'ball') return [BT[c.type].name, 'NEW BALL', '#7fe08a', BT[c.type].d];
  if (c.kind === 'up') { const b = G.inv[c.i]; return [ballName(b), 'UPGRADE ' + b.lvl + '>' + (b.lvl + 1), '#6fd8ff', nOf(b.lvl) + '>' + nOf(b.lvl + 1) + ' balls, +25% dmg']; }
  if (c.kind === 'fuse') {
    const a = G.inv[c.i], b = G.inv[c.j], u = { fx: c.u };
    return [ballName(u), 'FUSION!', '#ffd23f', shortName(a) + ' + ' + shortName(b) + ' merge'];
  }
  if (c.kind === 'pas') return [c.p.name, 'PASSIVE ' + ((G.pas[c.p.id] || 0) + 1) + '/' + c.p.max, '#c9a8ff', c.p.desc];
  return ['Snack', 'HEAL', '#ff7788', 'Heal 2 HP'];
}
function drawCards() {
  dim(0.78);
  txt('LEVEL UP!', W / 2, 30, '#ffd23f', 12, 'center');
  txt((G.pending > 1 ? G.pending + ' picks left' : 'Pick one'), W / 2, 48, '#cfc6ff', 7, 'center', true);
  const ch = Math.min(80, Math.floor((H - 70 - 24) / 3 - 6));
  G.cards.forEach((c, i) => {
    const x = 10, y = 64 + i * (ch + 6), w = W - 20, inf = cardInfo(c);
    const r = button('', x, y, w, ch, () => choose(i), { bg: '#241e3f', hi: inf[2] });
    cardIcon(c, x + 6, y + (ch - 30) / 2);
    txt(inf[0], x + 42, y + 8, '#fff', 8);
    txt(inf[1], x + 42, y + 22, inf[2], 7, 'left', true);
    txt(inf[3], x + 42, y + 34, '#b9b0e0', 7, 'left', true);
    if (c.kind === 'fuse') txt('LV ' + Math.min(MAXLVL, Math.max(G.inv[c.i].lvl, G.inv[c.j].lvl) + 1), x + 42, y + 46, '#ffd23f', 7, 'left', true);
  });
}
function drawPause() {
  dim(0.7);
  txt('PAUSED', W / 2, 70, '#fff', 12, 'center');
  button('RESUME', 40, 100, 120, 24, togglePause);
  button('AIM: ' + save.aim.toUpperCase(), 40, 132, 120, 24, () => { save.aim = save.aim === 'auto' ? 'manual' : 'auto'; persist(); });
  button('SOUND: ' + (save.sound ? 'ON' : 'OFF'), 40, 164, 120, 24, () => { save.sound = !save.sound; persist(); });
  button('QUIT', 40, 196, 120, 24, () => { scene = 'select'; }, { bg: '#4a2030', hi: '#a04060' });
  txt('Drag to move. Auto-aim picks', W / 2, 236, '#8f86b8', 7, 'center', true);
  txt('targets; MANUAL aims at pointer.', W / 2, 247, '#8f86b8', 7, 'center', true);
}
function statLines(y) {
  const g = G;
  txt('Time  ' + Math.floor(g.t) + 's', W / 2, y, '#cfc6ff', 8, 'center', true);
  txt('Kills ' + g.kills, W / 2, y + 12, '#cfc6ff', 8, 'center', true);
  txt('Level ' + g.plvl, W / 2, y + 24, '#cfc6ff', 8, 'center', true);
}
function drawOver() {
  dim(0.75); txt('GAME OVER', W / 2, 70, '#ff4455', 14, 'center'); statLines(104);
  button('RETRY', 40, 160, 120, 24, () => startLevel(G.n, G.ch));
  button('MENU', 40, 192, 120, 24, () => { scene = 'select'; });
}
function drawClear() {
  dim(0.75); txt('LEVEL CLEAR!', W / 2, 56, '#ffd23f', 12, 'center');
  for (let i = 0; i < 3; i++) { ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = i < G.stars ? '#ffd23f' : '#3a3348'; ctx.fillText('\u2605', W / 2 - 32 + i * 32, 82); }
  statLines(120);
  let y = 166;
  if (G.n < LV.length - 1) { button('NEXT LEVEL', 40, y, 120, 24, () => startLevel(G.n + 1, G.ch)); y += 32; }
  else txt('YOU BEAT THE PIT!', W / 2, y - 6, '#8ee04a', 8, 'center');
  button('MENU', 40, y + (G.n < LV.length - 1 ? 0 : 14), 120, 24, () => { scene = 'select'; });
}

/* ---------------- menus ---------------- */
function drawTitle() {
  drawBg(270, tt); dim(0.35);
  for (const b of TB) drawBallIcon([b.k], b.x, b.y, 4);
  txt('ORB', W / 2, 62, '#ff7a2a', 28, 'center');
  txt('PIT', W / 2, 96, '#6fd8ff', 28, 'center');
  txt('bounce  \u00b7  fuse  \u00b7  survive', W / 2, 138, '#cfc6ff', 8, 'center', true);
  if (Math.floor(tt * 2) % 2) txt('TAP TO START', W / 2, H * 0.62, '#fff', 8, 'center');
  txt('Levels cleared: ' + Math.max(0, save.unlocked - 1) + '/' + LV.length, W / 2, H - 28, '#8f86b8', 7, 'center', true);
  BTN.push({ x: 0, y: 0, w: W, h: H, fn: () => { scene = 'select'; } });
}
function drawSelect() {
  drawBg(270, tt); dim(0.55);
  txt('SELECT', W / 2, 8, '#fff', 10, 'center');
  txt('HERO', 8, 26, '#8f86b8', 7, 'left', true);
  CH.forEach((c, i) => {
    const x = 8 + i * 63, y = 36, sel = save.char === i;
    button('', x, y, 58, 66, () => { save.char = i; persist(); }, { bg: sel ? '#3b2f6a' : '#241e3f', hi: sel ? '#ffd23f' : '#5b4f94' });
    ctx.drawImage(getPlayerSpr(i, false), x + 14, y + 6, 30, 30);
    txt(c.name, x + 29, y + 40, sel ? '#ffd23f' : '#fff', 7, 'center', true);
    txt('HP ' + c.hp, x + 29, y + 50, '#ff7788', 7, 'center', true);
    drawBallIcon([c.ball], x + 29, y + 61, 2);
  });
  txt(CH[save.char].desc, W / 2, 106, '#cfc6ff', 7, 'center', true);
  txt('LEVEL', 8, 118, '#8f86b8', 7, 'left', true);
  const bh = clamp(Math.floor((H - 130 - 40) / 3) - 4, 34, 46);
  LV.forEach((l, i) => {
    const x = 8 + (i % 2) * 96, y = 130 + (i >> 1) * (bh + 5), open = i < save.unlocked;
    button('', x, y, 92, bh, () => { if (open) startLevel(i, save.char); }, { bg: open ? '#241e3f' : '#17121f', hi: open ? hsl(l.hue, 50, 50) : '#2b2540' });
    txt(String(i + 1), x + 6, y + 6, open ? hsl(l.hue, 70, 65) : '#4a4260', 14);
    if (open) {
      txt(l.name, x + 28, y + 6, '#fff', 7, 'left', true);
      txt('Boss:' + l.boss.split(' ')[0], x + 28, y + 17, '#b9b0e0', 7, 'left', true);
      for (let s = 0; s < 3; s++) { ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = s < (save.stars[i] || 0) ? '#ffd23f' : '#3a3348'; ctx.fillText('\u2605', x + 28 + s * 11, y + 26); }
    } else txt('LOCKED', x + 28, y + 12, '#6a6285', 7, 'left', true);
  });
  txt('Higher levels start with free picks', W / 2, H - 10, '#6a6285', 7, 'center', true);
}

function draw() {
  BTN = [];
  ctx.imageSmoothingEnabled = false;
  if (scene === 'title') drawTitle();
  else if (scene === 'select') drawSelect();
  else {
    drawPlay();
    if (scene === 'cards') drawCards();
    else if (scene === 'pause') drawPause();
    else if (scene === 'over') drawOver();
    else if (scene === 'clear') drawClear();
  }
}

/* ---------------- ciclo principal ---------------- */
function update(dt) {
  tt += dt;
  if (scene === 'title' || scene === 'select') {
    for (const b of TB) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 6 || b.x > W - 6) b.vx *= -1;
      if (b.y < 6 || b.y > H - 6) b.vy *= -1;
    }
  } else if (G) {
    if (scene === 'play') updatePlay(dt);
    else if (scene === 'over' || scene === 'clear') updateFx(dt);
  }
}
let last = 0, acc = 0;
const STEP = 1 / 60;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now; acc += dt;
  let n = 0; while (acc >= STEP && n++ < 6) { update(STEP); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}

/* ---------------- entrada ---------------- */
function togglePause() { if (scene === 'play') scene = 'pause'; else if (scene === 'pause') scene = 'play'; }
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function handleClick(x, y) {
  for (let i = BTN.length - 1; i >= 0; i--) if (inRect(x, y, BTN[i])) { BTN[i].fn(); if (scene !== 'cards') sfx.pick(); return true; }
  return false;
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); initAudio();
  const p = toLogical(e); ptr.x = p.x; ptr.y = p.y; ptr.down = true; ptr.seen = true;
  ptr.ui = handleClick(p.x, p.y);
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
});
cv.addEventListener('pointermove', e => { const p = toLogical(e); ptr.x = p.x; ptr.y = p.y; ptr.seen = true; });
const up = () => { ptr.down = false; ptr.ui = false; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
window.addEventListener('keydown', e => {
  keys[e.code] = true; initAudio();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (scene === 'cards' && /^Digit[1-3]$/.test(e.code)) choose(+e.code[5] - 1);
  if (scene === 'title' && (e.code === 'Enter' || e.code === 'Space')) scene = 'select';
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { if (scene === 'play') scene = 'pause'; });
document.addEventListener('visibilitychange', () => { if (document.hidden && scene === 'play') scene = 'pause'; });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
document.addEventListener('contextmenu', e => e.preventDefault());

window.__orb = { start: startLevel, choose, get G() { return G; }, get scene() { return scene; }, LV };
resize();
requestAnimationFrame(frame);
})();
