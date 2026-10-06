(() => {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const MAX_LV = 5;
const fmt = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- Upgrades ---------- */
const UP = {
  bolt:     { n:'Magic Bolt',   i:'✦',  d:'Shoots the nearest enemy. Gains extra bolts and pierce.' },
  fire:     { n:'Incineration', i:'🔥', d:'Hurls fireballs that explode on impact. +1 fireball per level.' },
  ray:      { n:'Arcane Ray',   i:'🔱', d:'Beams that pierce across the screen. +1 beam per level.' },
  lightning:{ n:'Lightning',    i:'⚡', d:'Strikes random enemies on screen. +1 strike per level.' },
  orbit:    { n:'Satellite',    i:'🔮', d:'Orbs circle you and knock enemies back. +1 orb per level.' },
  might:    { n:'Intelligence', i:'🧠', d:'+15% damage for all spells.' },
  haste:    { n:'Haste',        i:'⏳', d:'Spells recharge 8% faster.' },
  swift:    { n:'Swiftness',    i:'👟', d:'+10% movement speed.' },
  vital:    { n:'Vitality',     i:'❤️', d:'+20 max HP and heal 20.' },
  magnet:   { n:'Magnet',       i:'🧲', d:'+30% crystal pickup range.' }
};
const HEAL = { n:'Healing Draught', i:'🧪', d:'All spells are maxed. Restore 40% HP.' };

const ETYPES = {
  grunt:  { r:12, hp:14, speed:62,  dmg:8,  xp:1, col:'#09080b' },
  runner: { r:9,  hp:9,  speed:108, dmg:6,  xp:1, col:'#24102e' },
  brute:  { r:22, hp:90, speed:44,  dmg:16, xp:5, col:'#050405' }
};

/* ---------- State ---------- */
let state = 'start';
let P, enemies, bullets, gems, fx, texts, time, kills, spawnT, lvls, timers, level, xp, xpNeed, pending, orbAngle, shake;

const need = l => Math.round(6 + (l - 1) * 5 + Math.pow(l - 1, 1.5) * 1.5);
const L = k => lvls[k];
const dmgMul = () => 1 + 0.15 * L('might');
const cdMul  = () => Math.max(0.55, 1 - 0.08 * L('haste'));
const speed  = () => 150 * (1 + 0.1 * L('swift'));
const pickR  = () => 60 * (1 + 0.3 * L('magnet'));

function reset(){
  P = { x:0, y:0, r:11, hp:100, maxHp:100, face:1, inv:0, walk:0, moving:false };
  enemies = []; bullets = []; gems = []; fx = []; texts = [];
  time = 0; kills = 0; spawnT = 0; level = 1; xp = 0; xpNeed = need(1); pending = 0; orbAngle = 0; shake = 0;
  lvls = {}; for (const k in UP) lvls[k] = 0; lvls.bolt = 1;
  timers = { bolt:0.3, fire:1, ray:1, lightning:1 };
  for (let i = 0; i < 8; i++) spawnEnemy();
}

/* ---------- Helpers ---------- */
function hash(x, y){
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function segDist(px, py, x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
  let t = ((px - x1) * dx + (py - y1) * dy) / l; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function nearest(n, range){
  const r2 = range * range, out = [];
  for (const e of enemies){ if (e.hp <= 0) continue; const d = (e.x - P.x) ** 2 + (e.y - P.y) ** 2; if (d < r2) out.push([e, d]); }
  out.sort((a, b) => a[1] - b[1]);
  return out.slice(0, n).map(a => a[0]);
}
function spawnRadius(){ return Math.hypot(W, H) / 2 + 40; }

function spawnEnemy(){
  const a = Math.random() * TAU, R = spawnRadius();
  const scale = 1 + time / 60 * 0.4;
  const roll = Math.random();
  let t = 'grunt';
  if (time > 150 && roll < 0.08) t = 'brute';
  else if (time > 60 && roll < 0.3) t = 'runner';
  const T = ETYPES[t];
  enemies.push({ x:P.x + Math.cos(a) * R, y:P.y + Math.sin(a) * R, r:T.r, hp:T.hp * scale, maxHp:T.hp * scale,
    speed:T.speed * rand(0.9, 1.1), dmg:T.dmg, xp:T.xp, col:T.col, type:t, flash:0, orbCd:0, wob:Math.random() * 6 });
}

function hurt(e, d){
  if (e.hp <= 0) return;
  e.hp -= d; e.flash = 0.08;
  if (texts.length < 70) texts.push({ x:e.x + rand(-6, 6), y:e.y - e.r, t:Math.round(d), life:0.6, col:'#fff' });
  if (e.hp <= 0){
    kills++;
    gems.push({ x:e.x, y:e.y, v:e.xp, mag:false });
    fx.push({ type:'puff', x:e.x, y:e.y, r:e.r, life:0.35, max:0.35 });
  }
}

function explode(b){
  for (const e of enemies)
    if (e.hp > 0 && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (b.aoe + e.r) ** 2) hurt(e, b.dmg);
  fx.push({ type:'boom', x:b.x, y:b.y, r:b.aoe, life:0.3, max:0.3 });
}

function jag(x, y){
  const pts = []; let sx = x + rand(-40, 40), sy = y - 420;
  for (let i = 0; i <= 9; i++){
    const t = i / 9;
    pts.push([sx + (x - sx) * t + (i && i < 9 ? rand(-18, 18) : 0), sy + (y - sy) * t]);
  }
  return pts;
}

/* ---------- Spells ---------- */
function castSpells(dt){
  const m = dmgMul(), c = cdMul();

  if (L('bolt')){
    timers.bolt -= dt;
    if (timers.bolt <= 0){
      const lv = L('bolt'), n = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
      const ts = nearest(n, 520);
      timers.bolt = ts.length ? (0.85 - 0.05 * lv) * c : 0.2;
      for (const t of ts){
        const a = Math.atan2(t.y - P.y, t.x - P.x);
        bullets.push({ kind:'bolt', x:P.x, y:P.y, vx:Math.cos(a) * 460, vy:Math.sin(a) * 460, r:5,
          dmg:(9 + 4 * lv) * m, pierce:lv >= 4 ? 2 : 1, life:1.4, hit:new Set() });
      }
    }
  }

  if (L('fire')){
    timers.fire -= dt;
    if (timers.fire <= 0){
      const lv = L('fire'); timers.fire = (2.4 - 0.15 * lv) * c;
      const pool = nearest(12, 450);
      for (let i = 0; i < lv + 1; i++){
        let tx, ty;
        if (pool.length){ const t = pool[(Math.random() * pool.length) | 0]; tx = t.x; ty = t.y; }
        else { const a = Math.random() * TAU; tx = P.x + Math.cos(a) * 200; ty = P.y + Math.sin(a) * 200; }
        const a = Math.atan2(ty - P.y, tx - P.x), d = Math.hypot(tx - P.x, ty - P.y);
        bullets.push({ kind:'fire', x:P.x, y:P.y, vx:Math.cos(a) * 320, vy:Math.sin(a) * 320, r:7,
          dmg:(12 + 6 * lv) * m, aoe:44 + 6 * lv, life:Math.max(0.15, d / 320), hit:new Set() });
      }
    }
  }

  if (L('ray')){
    timers.ray -= dt;
    if (timers.ray <= 0){
      const lv = L('ray'); timers.ray = (3.2 - 0.2 * lv) * c;
      const t = nearest(1, 700)[0];
      const base = t ? Math.atan2(t.y - P.y, t.x - P.x) : Math.random() * TAU;
      const w = 8 + lv * 1.5;
      for (let i = 0; i < lv; i++){
        const a = base + i * TAU / lv;
        const ex = P.x + Math.cos(a) * 800, ey = P.y + Math.sin(a) * 800;
        for (const e of enemies)
          if (e.hp > 0 && segDist(e.x, e.y, P.x, P.y, ex, ey) < e.r + w) hurt(e, (18 + 8 * lv) * m);
        fx.push({ type:'ray', x:P.x, y:P.y, x2:ex, y2:ey, w, life:0.3, max:0.3 });
      }
    }
  }

  if (L('lightning')){
    timers.lightning -= dt;
    if (timers.lightning <= 0){
      const lv = L('lightning'); timers.lightning = (2.6 - 0.15 * lv) * c;
      const vis = enemies.filter(e => e.hp > 0 && Math.abs(e.x - P.x) < W / 2 && Math.abs(e.y - P.y) < H / 2);
      const R = 36 + 4 * lv;
      for (let i = 0; i < lv + 1 && vis.length; i++){
        const t = vis.splice((Math.random() * vis.length) | 0, 1)[0];
        const tx = t.x, ty = t.y;
        for (const e of enemies)
          if (e.hp > 0 && (e.x - tx) ** 2 + (e.y - ty) ** 2 < (R + e.r) ** 2) hurt(e, (24 + 10 * lv) * m);
        fx.push({ type:'zap', x:tx, y:ty, pts:jag(tx, ty), R, life:0.25, max:0.25 });
      }
    }
  }

  if (L('orbit')){
    const lv = L('orbit'), n = lv + 1, R = 62 + lv * 4;
    orbAngle += dt * (2.4 + 0.2 * lv);
    for (let i = 0; i < n; i++){
      const a = orbAngle + i * TAU / n, ox = P.x + Math.cos(a) * R, oy = P.y + Math.sin(a) * R;
      for (const e of enemies){
        if (e.hp > 0 && e.orbCd <= 0 && (e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 9) ** 2){
          hurt(e, (7 + 4 * lv) * m); e.orbCd = 0.45;
          const d = Math.hypot(e.x - P.x, e.y - P.y) || 1;
          e.x += (e.x - P.x) / d * 10; e.y += (e.y - P.y) / d * 10;
        }
      }
    }
  }
}

/* ---------- Input ---------- */
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p'){
    if (state === 'play') pause(); else if (state === 'paused') resume();
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

const joy = { active:false, id:null, ox:0, oy:0, dx:0, dy:0 };
const joyEl = $('joy'), knob = $('knob');
canvas.addEventListener('pointerdown', e => {
  if (state !== 'play' || joy.active) return;
  joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = joy.dy = 0;
  joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px'; joyEl.style.display = 'block';
  knob.style.transform = 'translate(0,0)';
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  const d = Math.hypot(dx, dy);
  if (d > 50){ dx = dx / d * 50; dy = dy / d * 50; }
  joy.dx = dx; joy.dy = dy;
  knob.style.transform = `translate(${dx}px,${dy}px)`;
});
function endJoy(e){ if (e && e.pointerId !== joy.id) return; joy.active = false; joy.dx = joy.dy = 0; joyEl.style.display = 'none'; }
canvas.addEventListener('pointerup', endJoy);
canvas.addEventListener('pointercancel', endJoy);

function inputVec(){
  let x = 0, y = 0;
  if (keys['a'] || keys['arrowleft']) x -= 1;
  if (keys['d'] || keys['arrowright']) x += 1;
  if (keys['w'] || keys['arrowup']) y -= 1;
  if (keys['s'] || keys['arrowdown']) y += 1;
  if (x || y){ const d = Math.hypot(x, y); return [x / d, y / d]; }
  if (joy.active){
    const d = Math.hypot(joy.dx, joy.dy);
    if (d > 6) return [joy.dx / 50, joy.dy / 50];
  }
  return [0, 0];
}

/* ---------- Update ---------- */
function update(dt){
  time += dt;

  // Move player
  const [mx, my] = inputVec();
  P.moving = !!(mx || my);
  P.x += mx * speed() * dt; P.y += my * speed() * dt;
  if (mx) P.face = mx > 0 ? 1 : -1;
  if (P.moving) P.walk += dt * 10;
  P.inv -= dt; shake -= dt;

  // Spawning (endless, ramps up over time)
  spawnT -= dt;
  if (spawnT <= 0){
    spawnT = Math.max(0.18, 0.9 - time * 0.005);
    const batch = 1 + Math.floor(time / 50);
    for (let i = 0; i < batch && enemies.length < 350; i++) spawnEnemy();
  }

  castSpells(dt);

  // Bullets
  for (const b of bullets){
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life > 0){
      for (const e of enemies){
        if (e.hp <= 0 || b.hit.has(e)) continue;
        if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + b.r) ** 2){
          if (b.kind === 'fire'){ b.life = 0; break; }
          hurt(e, b.dmg); b.hit.add(e);
          if (--b.pierce <= 0){ b.life = 0; break; }
        }
      }
    }
    if (b.life <= 0 && b.kind === 'fire' && !b.done){ b.done = true; explode(b); }
  }
  bullets = bullets.filter(b => b.life > 0);

  // Enemies chase the player
  const far = spawnRadius() * 1.6;
  for (const e of enemies){
    if (e.hp <= 0) continue;
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
    e.x += dx / d * e.speed * dt; e.y += dy / d * e.speed * dt;
    e.flash -= dt; e.orbCd -= dt; e.wob += dt * 8;
    if (d < e.r + P.r && P.inv <= 0){
      P.hp -= e.dmg; P.inv = 0.5; shake = 0.18;
      texts.push({ x:P.x, y:P.y - 26, t:'-' + e.dmg, life:0.7, col:'#ff6b6b' });
    }
    if (d > far){
      const a = Math.random() * TAU, R = spawnRadius();
      e.x = P.x + Math.cos(a) * R; e.y = P.y + Math.sin(a) * R;
    }
  }
  enemies = enemies.filter(e => e.hp > 0);
  separate();

  // Crystals
  const pr = pickR();
  for (const g of gems){
    const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy) || 1;
    if (d < pr) g.mag = true;
    if (g.mag){ g.x += dx / d * 420 * dt; g.y += dy / d * 420 * dt; }
    if (d < P.r + 6){ g.taken = true; xp += g.v; }
  }
  gems = gems.filter(g => !g.taken);
  while (xp >= xpNeed){ xp -= xpNeed; level++; xpNeed = need(level); pending++; }

  // Effects
  for (const f of fx) f.life -= dt;
  fx = fx.filter(f => f.life > 0);
  for (const t of texts){ t.life -= dt; t.y -= 30 * dt; }
  texts = texts.filter(t => t.life > 0);

  if (P.hp <= 0){ P.hp = 0; gameOver(); return; }
  if (pending > 0) openLevelUp();
}

function separate(){
  const cell = 44, grid = new Map();
  for (const e of enemies){
    const k = Math.floor(e.x / cell) + ',' + Math.floor(e.y / cell);
    let arr = grid.get(k); if (!arr){ arr = []; grid.set(k, arr); } arr.push(e);
  }
  for (const e of enemies){
    const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){
      const arr = grid.get((cx + i) + ',' + (cy + j)); if (!arr) continue;
      for (const o of arr){
        if (o === e) continue;
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy, r = e.r + o.r;
        if (d2 < r * r && d2 > 0.01){
          const d = Math.sqrt(d2), p = (r - d) * 0.25 / d;
          e.x += dx * p; e.y += dy * p;
        }
      }
    }
  }
}

/* ---------- Rendering ---------- */
function spiky(x, y, r, n, rot){
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++){
    const a = rot + i * Math.PI / n, rr = i % 2 ? r * 0.55 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
function circle(x, y, r){ ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

function drawFloor(cx, cy){
  const S = 64;
  const x0 = Math.floor(cx / S), x1 = Math.floor((cx + W) / S), y0 = Math.floor(cy / S), y1 = Math.floor((cy + H) / S);
  const tones = ['#4b4a50', '#47464c', '#4f4e54', '#444349'];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++){
    ctx.fillStyle = tones[(hash(tx, ty) * 4) | 0];
    ctx.fillRect(tx * S, ty * S, S, S);
  }
  ctx.strokeStyle = 'rgba(30,29,33,.6)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let tx = x0; tx <= x1 + 1; tx++){ ctx.moveTo(tx * S, y0 * S); ctx.lineTo(tx * S, (y1 + 1) * S); }
  for (let ty = y0; ty <= y1 + 1; ty++){ ctx.moveTo(x0 * S, ty * S); ctx.lineTo((x1 + 1) * S, ty * S); }
  ctx.stroke();
  // Dark thorn bushes scattered on the floor
  ctx.fillStyle = '#121114';
  for (let tx = x0 - 1; tx <= x1 + 1; tx++) for (let ty = y0 - 1; ty <= y1 + 1; ty++){
    const h = hash(tx * 7 + 3, ty * 13 + 5);
    if (h < 0.2){
      const bx = tx * S + hash(tx, ty * 3) * S, by = ty * S + hash(tx * 5, ty) * S;
      spiky(bx, by, 10 + h * 60, 8, h * 10);
      spiky(bx + 8, by + 6, 6 + h * 30, 7, h * 20);
    }
  }
}

function drawPlayer(){
  ctx.save(); ctx.translate(P.x, P.y);
  if (P.inv > 0 && ((P.inv * 20) | 0) % 2) ctx.globalAlpha = 0.45;
  const bob = P.moving ? Math.sin(P.walk) * 1.5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0, 12, 11, 4, 0, 0, TAU); ctx.fill();
  ctx.translate(0, bob);
  ctx.fillStyle = '#5a3fd0';
  ctx.beginPath(); ctx.moveTo(-10, 11); ctx.lineTo(10, 11); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f0d2ad'; circle(0, -7, 5);
  ctx.fillStyle = '#35248f';
  ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(9, -9); ctx.lineTo(P.face * 7, -26); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#a07a4a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(P.face * 11, 12); ctx.lineTo(P.face * 13, -12); ctx.stroke();
  ctx.fillStyle = '#9ff0ff'; circle(P.face * 13, -14, 3);
  ctx.restore();
  // HP bar under the wizard
  const w = 34, hp = Math.max(0, P.hp / P.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(P.x - w / 2 - 1, P.y + 18, w + 2, 6);
  ctx.fillStyle = hp > 0.35 ? '#5be37a' : '#e2483f'; ctx.fillRect(P.x - w / 2, P.y + 19, w * hp, 4);
}

function drawEnemy(e){
  const wob = Math.sin(e.wob) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.8, e.r * 0.9, e.r * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.col;
  spiky(e.x, e.y + wob, e.r * 1.25, e.type === 'brute' ? 11 : 8, e.wob * 0.05);
  circle(e.x, e.y + wob, e.r * 0.8);
  ctx.fillStyle = e.type === 'runner' ? '#d27bff' : '#ff3b30';
  const er = e.type === 'brute' ? 3 : 2;
  circle(e.x - e.r * 0.3, e.y - 2 + wob, er); circle(e.x + e.r * 0.3, e.y - 2 + wob, er);
  if (e.type === 'brute'){
    const w = 30, h = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
    ctx.fillStyle = '#e2483f'; ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * h, 4);
  }
}

function render(){
  ctx.fillStyle = '#1a191d'; ctx.fillRect(0, 0, W, H);
  if (!P) return;
  const sx = shake > 0 ? rand(-4, 4) : 0, sy = shake > 0 ? rand(-4, 4) : 0;
  const camX = P.x - W / 2 + sx, camY = P.y - H / 2 + sy;
  ctx.save(); ctx.translate(-camX, -camY);

  drawFloor(camX, camY);

  // Crystals
  for (const g of gems){
    ctx.fillStyle = g.v > 1 ? '#c58bff' : '#5cc8ff';
    const s = g.v > 1 ? 6 : 4;
    ctx.beginPath(); ctx.moveTo(g.x, g.y - s * 1.4); ctx.lineTo(g.x + s, g.y); ctx.lineTo(g.x, g.y + s * 1.4); ctx.lineTo(g.x - s, g.y); ctx.closePath(); ctx.fill();
  }

  // Ground effects
  for (const f of fx){
    const a = f.life / f.max;
    if (f.type === 'puff'){ ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#000'; circle(f.x, f.y, f.r * (1.6 - a * 0.6)); }
  }
  ctx.globalAlpha = 1;

  for (const e of enemies) drawEnemy(e);
  drawPlayer();

  // Glowing magic
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fx){
    const a = f.life / f.max;
    if (f.type === 'ray'){
      ctx.strokeStyle = `rgba(150,205,255,${a * 0.35})`; ctx.lineWidth = f.w * 2.2;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(235,245,255,${a})`; ctx.lineWidth = f.w * 0.6; ctx.stroke();
    } else if (f.type === 'boom'){
      ctx.fillStyle = `rgba(255,120,40,${a * 0.5})`; circle(f.x, f.y, f.r * (1.2 - a * 0.4));
      ctx.fillStyle = `rgba(255,220,120,${a * 0.6})`; circle(f.x, f.y, f.r * 0.5 * a);
    } else if (f.type === 'zap'){
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(120,170,255,${a * 0.6})`; ctx.lineWidth = 7;
      ctx.beginPath(); f.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = `rgba(190,215,255,${a * 0.45})`; circle(f.x, f.y, f.R);
    }
  }
  for (const b of bullets){
    if (b.kind === 'bolt'){
      ctx.fillStyle = 'rgba(140,110,255,.35)'; circle(b.x, b.y, b.r * 2.4);
      ctx.fillStyle = '#e6deff'; circle(b.x, b.y, b.r);
    } else {
      ctx.fillStyle = 'rgba(255,110,30,.4)'; circle(b.x, b.y, b.r * 2.6);
      ctx.fillStyle = '#ffd27a'; circle(b.x, b.y, b.r);
    }
  }
  if (L('orbit')){
    const lv = L('orbit'), n = lv + 1, R = 62 + lv * 4;
    for (let i = 0; i < n; i++){
      const a = orbAngle + i * TAU / n, ox = P.x + Math.cos(a) * R, oy = P.y + Math.sin(a) * R;
      ctx.fillStyle = 'rgba(120,230,160,.35)'; circle(ox, oy, 16);
      ctx.fillStyle = '#d8ffe6'; circle(ox, oy, 7);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  // Damage numbers
  ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
  for (const t of texts){
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.strokeText(t.t, t.x, t.y); ctx.fillStyle = t.col; ctx.fillText(t.t, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vignette
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* ---------- HUD & menus ---------- */
const hud = $('hud');
function updateHUD(){
  $('xpfill').style.width = (xp / xpNeed * 100).toFixed(1) + '%';
  $('lvl').textContent = 'Lv ' + level;
  $('time').textContent = fmt(time);
  $('kills').textContent = '☠ ' + kills;
}

function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

function openLevelUp(){
  state = 'levelup'; endJoy();
  const avail = shuffle(Object.keys(UP).filter(k => lvls[k] < MAX_LV)).slice(0, 3);
  const opts = avail.length ? avail : ['heal'];
  const box = $('cards'); box.innerHTML = '';
  for (const k of opts){
    const u = k === 'heal' ? HEAL : UP[k], cur = k === 'heal' ? 0 : lvls[k];
    const btn = document.createElement('button'); btn.className = 'card';
    let pips = '';
    if (k !== 'heal'){
      pips = '<div class="pips">';
      for (let i = 1; i <= MAX_LV; i++) pips += `<i class="${i <= cur ? 'on' : i === cur + 1 ? 'next' : ''}"></i>`;
      pips += '</div>';
    }
    const tag = k === 'heal' ? '' : cur === 0 ? '<span class="tag">New</span>' : `<span style="color:var(--muted);font-weight:400"> Lv ${cur} → ${cur + 1}</span>`;
    btn.innerHTML = `<div class="ic">${u.i}</div><div><div class="nm">${u.n}${tag}</div><div class="ds">${u.d}</div>${pips}</div>`;
    btn.onclick = () => choose(k);
    box.appendChild(btn);
  }
  $('levelUp').classList.remove('hidden');
}

function choose(k){
  if (k === 'heal') P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.4);
  else {
    lvls[k]++;
    if (k === 'vital'){ P.maxHp += 20; P.hp = Math.min(P.maxHp, P.hp + 20); }
  }
  pending--;
  if (pending > 0) openLevelUp();
  else { $('levelUp').classList.add('hidden'); state = 'play'; last = performance.now(); }
}

function pause(){
  if (state !== 'play') return;
  state = 'paused'; endJoy();
  $('pTime').textContent = fmt(time); $('pLvl').textContent = level; $('pKills').textContent = kills;
  const list = $('skillList'); list.innerHTML = '';
  for (const k in UP) if (lvls[k]){
    const s = document.createElement('span');
    s.textContent = `${UP[k].i} ${UP[k].n} ${lvls[k] >= MAX_LV ? 'MAX' : 'Lv ' + lvls[k]}`;
    list.appendChild(s);
  }
  $('pauseMenu').classList.remove('hidden');
}
function resume(){
  $('pauseMenu').classList.add('hidden');
  state = 'play'; last = performance.now();
}

function getBest(){ try { return parseFloat(localStorage.getItem('arcaneSurvivorBest')) || 0; } catch (_) { return 0; } }
function setBest(v){ try { localStorage.setItem('arcaneSurvivorBest', String(v)); } catch (_) {} }

function gameOver(){
  state = 'over'; endJoy();
  const best = getBest(), isNew = time > best;
  if (isNew) setBest(time);
  $('gTime').textContent = fmt(time); $('gLvl').textContent = level; $('gKills').textContent = kills;
  $('gBest').textContent = isNew ? 'New best time!' : 'Best time: ' + fmt(best);
  $('gameOver').classList.remove('hidden');
}

function start(){
  ['startScreen', 'pauseMenu', 'gameOver', 'levelUp'].forEach(id => $(id).classList.add('hidden'));
  reset(); hud.classList.remove('hidden');
  state = 'play'; last = performance.now();
}

$('startBtn').onclick = start;
$('restartBtn').onclick = start;
$('againBtn').onclick = start;
$('resumeBtn').onclick = resume;
$('pauseBtn').onclick = () => { if (state === 'play') pause(); else if (state === 'paused') resume(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const best0 = getBest();
if (best0) $('bestStart').textContent = 'Best time: ' + fmt(best0);

/* ---------- Main loop ---------- */
let last = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play'){ update(dt); updateHUD(); }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();