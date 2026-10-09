// Axe ballon-but : quand un porteur des Rouges approche du but bleu, y a-t-il un Bleu entre lui et le but ?
// Et quand l'axe est ouvert, pourquoi : tous les défenseurs sont battus (derrière le ballon), ou il y en a devant le ballon mais à côté de l'axe ?
// Usage : node tools/axis.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs]
// Exemple : node tools/axis.js "" "" 8
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])], n = +process.argv[4] || 8;
const R = { where: {}, s: 0, open: 0, near: 0, openNear: 0, why: {}, labels: {}, gap: 0, gapN: 0 };
const add = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (let s = 1; s <= n; s++) {
  const m = E.createMatch({ seed: s, duration: 5400, tactics: sides.map(x => x.tactics), teams: sides.map(x => x.team), formations: sides.map(x => x.formation) });
  while (m.mode !== 'over') {
    E.step(m);
    const c = m.ball.owner;
    if (!c || c.team !== 1 || m.mode !== 'play' || c.setPiece || m.tick % 5) continue;
    const T = m.teams[0], gx = -52.5 * T.dir, D = Math.hypot(gx - c.x, c.y);
    if (D > 30) continue;
    const ux = (gx - c.x) / D, uy = -c.y / D, F = T.players.filter(q => q.role !== 'GK');
    const along = q => (q.x - c.x) * ux + (q.y - c.y) * uy, side = q => Math.abs((q.x - c.x) * uy - (q.y - c.y) * ux);
    const guard = F.some(q => { const sp = along(q); return sp > 0.3 && sp < Math.min(12, D) && side(q) < 1.5 + 0.25 * sp; });
    R.s++; if (!guard) R.open++;
    if (D >= 20) continue;
    R.near++;
    if (guard) continue;
    R.openNear++;
    add(R.where, Math.abs(c.y) < 11 ? 'porteur dans l\'axe du terrain' : 'porteur excentré');
    if (F.some(q => /Ferme l'axe/.test(q.intent.label))) add(R.where, 'un Bleu est en route pour fermer l\'axe');
    const ahead = F.filter(q => along(q) > 0.3);
    if (!ahead.length) { add(R.why, 'tous les Bleus sont derrière le ballon (battus)'); continue; }
    const best = ahead.reduce((a, q) => side(q) - 0.3 * along(q) < side(a) - 0.3 * along(a) ? q : a);
    R.gap += side(best); R.gapN++;
    const dc = Math.hypot(best.x - c.x, best.y - c.y);
    add(R.why, dc < 3 ? 'un Bleu tout près du porteur, mais pas dans l\'axe' : 'des Bleus devant le ballon, à côté de l\'axe');
    add(R.labels, (best.poste || best.role) + ' : ' + best.intent.label.replace(/n°\d+/g, 'n°…'));
  }
}
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '–';
console.log(`\n${n} matchs — Bleus : ${Eq.name(sides[0])}, Rouges : ${Eq.name(sides[1])}`);
console.log(`Porteur rouge à moins de 30 m du but bleu : axe ouvert ${pct(R.open, R.s)} du temps ; à moins de 20 m : ${pct(R.openNear, R.near)}`);
console.log('À moins de 20 m, axe ouvert : où est le porteur');
for (const [k, v] of Object.entries(R.where)) console.log('  ' + k.padEnd(56) + pct(v, R.openNear));
console.log('À moins de 20 m, axe ouvert : pourquoi');
for (const [k, v] of Object.entries(R.why).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(56) + pct(v, R.openNear));
console.log(`  écart moyen du Bleu le mieux placé à l'axe : ${(R.gap / R.gapN).toFixed(1)} m`);
console.log('Ce que fait alors le Bleu le mieux placé (devant le ballon)');
const tot = Object.values(R.labels).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(R.labels).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log('  ' + k.padEnd(56) + pct(v, tot));
