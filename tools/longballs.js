// Longs ballons : que devient un ballon joué en l'air ? Qui le touche en premier, où, à quelle hauteur ?
// Usage : node tools/longballs.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [durée en secondes]
// Exemple : node tools/longballs.js equipe=elite equipe=moyen 6
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])];
const n = +process.argv[4] || 6, duration = +process.argv[5] || 5400;
const R = [0, 1].map(() => ({ n: 0, est: 0, first: {}, where: {}, z: {}, then: {} }));
const add = (o, k) => { o[k] = (o[k] || 0) + 1; };

for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  let cur = null, last = null, lastTouch = null;
  while (m.mode !== 'over') {
    E.step(m);
    const q = m.pass;
    if (q && q !== last && q.kind === 'pass' && q.lofted && q.from) {
      const p = q.from, D = q.to ? Math.hypot(q.to.x - p.x, q.to.y - p.y) : 0;
      cur = { team: p.team, q, x0: p.x, y0: p.y, D, est: q.pOk || 0, to: q.to, t0: m.t, touched: false };
      R[p.team].n++; R[p.team].est += cur.est; lastTouch = m.ball.lastTouch;
    }
    last = q;
    if (cur && !cur.touched) {
      const b = m.ball, lt = b.lastTouch;
      if (m.mode !== 'play') { cur.touched = true; add(R[cur.team].first, 'ballon sorti'); cur = null; continue; }
      if (lt && lt !== cur.q.from && (lt !== lastTouch || b.owner)) {
        const S = R[cur.team], mine = lt.team === cur.team, flight = Math.hypot(lt.x - cur.x0, lt.y - cur.y0);
        add(S.first, mine ? (lt === cur.to ? 'le receveur visé' : 'un autre partenaire') : 'un adversaire');
        add(S.where, flight < 0.4 * cur.D ? 'au départ (premier 40 %)' : flight < 0.85 * cur.D ? 'en route' : 'à l\'arrivée');
        add(S.z, b.z > 1.25 ? 'de la tête (en l\'air)' : 'au sol ou au rebond');
        cur.touched = true; cur.after = { mine, t: m.t };
      }
    }
    if (cur && cur.touched && cur.after && m.t - cur.after.t > 2) {
      const o = m.ball.owner; add(R[cur.team].then, o ? (o.team === cur.team ? 'son équipe a le ballon' : 'l\'adversaire a le ballon') : 'ballon libre');
      cur = null;
    }
  }
}
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '–';
const col = s => String(s).padStart(22);
console.log(`\n${n} matchs — Bleus : ${Eq.name(sides[0])}, Rouges : ${Eq.name(sides[1])}\n`);
console.log(''.padEnd(40) + col('Bleus') + col('Rouges'));
console.log('  Longs ballons par match'.padEnd(40) + col((R[0].n / n).toFixed(0)) + col((R[1].n / n).toFixed(0)));
console.log('  Réussite estimée par le passeur'.padEnd(40) + col(pct(R[0].est, R[0].n)) + col(pct(R[1].est, R[1].n)));
for (const [title, key, ks] of [['Premier à toucher le ballon', 'first', ['le receveur visé', 'un autre partenaire', 'un adversaire', 'ballon sorti']], ['Où', 'where', ['au départ (premier 40 %)', 'en route', 'à l\'arrivée']], ['Comment', 'z', ['de la tête (en l\'air)', 'au sol ou au rebond']], ['2 secondes après la première touche', 'then', ['son équipe a le ballon', 'ballon libre', 'l\'adversaire a le ballon']]]) {
  console.log(title);
  for (const k of ks) console.log(('  ' + k).padEnd(40) + col(pct(R[0][key][k] || 0, R[0].n)) + col(pct(R[1][key][k] || 0, R[1].n)));
}
