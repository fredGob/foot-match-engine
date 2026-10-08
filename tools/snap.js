// Rend des images du match à des instants donnés, avec le même code de dessin que le navigateur.
// Usage : node snap.js <graine> <sortie.png> <t1,t2,...> [intents|-] [consignes des Bleus] [consignes des Rouges]
// Consignes : « clé=valeur » séparées par des virgules, par exemple line=1,press=1 (voir sim.js)
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'engine.js')), R = require(path.join(ROOT, 'render.js'));
const seed = +process.argv[2] || 1, out = process.argv[3] || 'snap.png';
const times = (process.argv[4] || '5,30,60').split(',').map(Number), intents = process.argv[5] === 'intents';
const W = 880, H = 580, cols = Math.min(2, times.length), rows = Math.ceil(times.length / cols);
const sheet = createCanvas(W * cols, H * rows), sctx = sheet.getContext('2d');
const parse = s => { const t = {}; for (const kv of (s || '').split(',')) { const [k, v] = kv.split('='); if (k) t[k] = +v; } return t; };
const m = E.createMatch({ seed, tactics: [parse(process.argv[6]), parse(process.argv[7])] });
times.forEach((t, i) => {
  while (m.t < t && m.mode !== 'over') E.step(m);
  const c = createCanvas(W, H), ctx = c.getContext('2d');
  R.drawMatch(ctx, W, H, m, 1, { intents, selected: -1 });
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 330, 24); ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const o = m.ball.owner;
  ctx.fillText(`t=${m.t.toFixed(1)}s ${m.mode}${m.restart ? ':' + m.restart.type : ''} ${m.teams[0].score}-${m.teams[1].score} ${o ? 'n°' + o.num + (o.team ? ' R ' : ' B ') + o.intent.label : 'libre'}`, 6, 12);
  sctx.drawImage(c, (i % cols) * W, Math.floor(i / cols) * H);
});
require('fs').writeFileSync(out, sheet.toBuffer('image/png'));
console.log('écrit', out);
