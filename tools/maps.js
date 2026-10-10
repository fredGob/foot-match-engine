// Cartes cumulées sur plusieurs matchs, en images : carte de chaleur de chaque équipe (avec les tirs adverses en points)
// et réseau de passes de chaque équipe. Sert à voir où les défauts du moteur se logent.
// Usage : node tools/maps.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [préfixe des images]
// Exemple : node tools/maps.js tactique=blocbas tactique=equilibre 12 tools/blocbas
//   → tools/blocbas_chaleur_bleus.png, _chaleur_rouges.png, _passes_bleus.png, _passes_rouges.png
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const E = require('../engine.js'), R = require('../render.js'), Eq = require('../equipes.js');
R.setMakeCanvas(createCanvas);
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])];
const n = +process.argv[4] || 12, out = process.argv[5] || path.join(__dirname, 'cartes');
const W = 1140, H = 750;
const heat = [0, 1].map(() => new Float32Array(R.HEAT.cols * R.HEAT.rows)), shots = [[], []];
const pos = [0, 1].map(() => Array.from({ length: 11 }, () => [0, 0, 0])), made = [0, 1].map(() => new Array(11).fill(0)), got = [0, 1].map(() => new Array(11).fill(0)), okp = [0, 1].map(() => new Array(11).fill(0)), pair = [new Map(), new Map()];
let names = null, nums = null, roles = null;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration: 5400, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  if (!names) { names = m.players.map(p => p.name); nums = m.players.map(p => p.num); roles = m.players.map(p => p.poste); }
  const open = []; let lastQ = null, lastShot = null, f = 0;
  while (m.mode !== 'over') {
    E.step(m); f++;
    if (m.mode === 'play' && f % 4 === 0) {
      for (const p of m.players) if (p.role !== 'GK') { const c = R.heatCell(p.x, p.y); if (c >= 0) heat[p.team][c]++; }
      const o = m.ball.owner;
      if (o && f % 8 === 0) for (const p of m.teams[o.team].players) { const k = m.teams[o.team].players.indexOf(p), P = pos[o.team][k]; P[0] += p.x; P[1] += p.y; P[2]++; }
    }
    if (m.shot && m.shot !== lastShot) { lastShot = m.shot; const p = m.shot.by; shots[p.team].push([p.x, p.y, m.shot.xg || 0]); }
    const q = m.pass;
    if (q && q !== lastQ && q.kind === 'pass' && q.type !== 'tete' && q.from) open.push(q);
    lastQ = q;
    for (let j = open.length - 1; j >= 0; j--) if (open[j].ended) {
      const x = open.splice(j, 1)[0], t = x.from.team, ps = m.teams[t].players, a = ps.indexOf(x.from); made[t][a]++;
      if (x.how === 'ok' && x.to && x.to.team === t) { const b = ps.indexOf(x.to); okp[t][a]++; got[t][b]++; const k = Math.min(a, b) + '-' + Math.max(a, b); pair[t].set(k, (pair[t].get(k) || 0) + 1); }
    }
  }
}
const colors = ['#2f6fdf', '#d8423a'], label = ['bleus', 'rouges'];
for (let t = 0; t < 2; t++) {
  // carte de chaleur, et les tirs de l'adversaire (rond d'autant plus gros que l'occasion est belle)
  let cv = createCanvas(W, H), ctx = cv.getContext('2d');
  R.drawHeat(ctx, W, H, heat[t]);
  const v = R.view(W, H);
  for (const s of shots[1 - t]) { ctx.beginPath(); ctx.arc(v.ox + s[0] * v.s, v.oy + s[1] * v.s, 2 + 14 * Math.sqrt(s[2]), 0, 2 * Math.PI); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = '600 16px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(Eq.name(sides[t]) + ' (' + label[t] + ', sans le gardien) · ' + n + ' matchs · points blancs : tirs adverses (' + (shots[1 - t].length / n).toFixed(1) + ' par match)', 12, 20);
  require('fs').writeFileSync(out + '_chaleur_' + label[t] + '.png', cv.toBuffer('image/png'));
  // réseau de passes
  cv = createCanvas(W, H); ctx = cv.getContext('2d');
  const inv = made[t].map((x, i) => x + got[t][i]), maxInv = Math.max(...inv, 1), base = 11 * t;
  const nodes = pos[t].map((P, i) => ({ x: P[2] ? P[0] / P[2] : 0, y: P[2] ? P[1] / P[2] : 0, num: nums[base + i], size: inv[i] / maxInv }));
  let maxPair = 0; for (const x of pair[t].values()) maxPair = Math.max(maxPair, x);
  const edges = []; for (const [k, x] of pair[t]) if (x >= 0.15 * maxPair) { const [a, b] = k.split('-').map(Number); edges.push({ a, b, n: x }); }
  R.drawNetwork(ctx, W, H, nodes, edges, colors[t], -1);
  ctx.fillStyle = '#fff'; ctx.font = '600 16px sans-serif'; ctx.textAlign = 'left';
  const tot = made[t].reduce((a, b) => a + b, 0), ok = okp[t].reduce((a, b) => a + b, 0);
  ctx.fillText(Eq.name(sides[t]) + ' (' + label[t] + ') · ' + n + ' matchs · ' + Math.round(tot / n) + ' passes par match, ' + Math.round(100 * ok / Math.max(1, tot)) + ' % réussies', 12, 20);
  require('fs').writeFileSync(out + '_passes_' + label[t] + '.png', cv.toBuffer('image/png'));
  // en texte : qui touche le ballon
  console.log('\n' + Eq.name(sides[t]) + ' (' + label[t] + ') — passes données / reçues par match, position moyenne avec le ballon (x : vers le but adverse)');
  for (let i = 0; i < 11; i++) console.log('  n°' + String(nums[base + i]).padEnd(3) + (roles[base + i] || '').padEnd(22) + String(Math.round(made[t][i] / n)).padStart(5) + String(Math.round(got[t][i] / n)).padStart(6) + '   x = ' + (nodes[i].x * (t === 0 ? 1 : -1)).toFixed(0).padStart(4) + ' m');
}
console.log('\nImages : ' + out + '_chaleur_bleus.png, _chaleur_rouges.png, _passes_bleus.png, _passes_rouges.png');
