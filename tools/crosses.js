// Centres : au moment du centre, combien de joueurs de chaque équipe dans la surface ? Qui touche le ballon en premier, et comment ?
// Usage : node tools/crosses.js [réglages des Bleus, qui défendent] [réglages des Rouges, qui centrent] [nombre de matchs]
// Exemple : node tools/crosses.js equipe=faible,line=-1,press=-1,cross=-1 equipe=elite 12
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])], n = +process.argv[4] || 12;
const R = { n: 0, def: 0, att: 0, first: {}, how: {}, shot: 0, gk: 0 };
const add = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (let s = 1; s <= n; s++) {
  const m = E.createMatch({ seed: s, duration: 5400, tactics: sides.map(x => x.tactics), teams: sides.map(x => x.team), formations: sides.map(x => x.formation) });
  let cur = null, seen = null;
  while (m.mode !== 'over') {
    E.step(m);
    const q = m.pass;
    if (q && q !== seen && q.kind === 'pass' && q.lofted && q.from && q.from.team === 1 && Math.abs(q.from.y) > 16 && q.from.x * m.teams[1].dir > 25) {
      seen = q; R.n++;
      const inBox = T => T.players.filter(p => p.role !== 'GK' && p.x * m.teams[0].dir < -52.5 + 16.5 && Math.abs(p.y) < 20.2).length;
      R.def += inBox(m.teams[0]); R.att += inBox(m.teams[1]);
      cur = { q, t: m.t, touched: false, shot: m.teams[1].stats.shots };
    }
    if (cur && !cur.touched) {
      const lt = m.ball.lastTouch;
      if (m.mode !== 'play') { add(R.first, 'ballon sorti ou arrêt de jeu'); cur.touched = true; }
      else if (lt && lt !== cur.q.from) { add(R.first, lt.team === 1 ? 'un attaquant (Rouges)' : lt.role === 'GK' ? 'le gardien (Bleus)' : 'un défenseur (Bleus)'); add(R.how, (m.ball.z > 1.25 ? 'de la tête' : 'au pied ou au rebond') + (lt.team === 1 ? ', Rouges' : ', Bleus')); cur.touched = true; }
    }
    if (cur && m.t - cur.t > 4) { if (m.teams[1].stats.shots > cur.shot) R.shot++; cur = null; }
  }
}
const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
console.log(`\n${n} matchs — Bleus (défendent) : ${Eq.name(sides[0])} ; Rouges (centrent) : ${Eq.name(sides[1])}`);
console.log(`Centres des Rouges : ${(R.n / n).toFixed(1)} par match ; dans la surface au moment du centre : ${(R.def / R.n).toFixed(1)} Bleus, ${(R.att / R.n).toFixed(1)} Rouges ; tir dans les 4 s : ${pct(R.shot, R.n)}`);
console.log('Premier à toucher le ballon'); for (const [k, v] of Object.entries(R.first).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(40) + pct(v, R.n));
console.log('Comment'); for (const [k, v] of Object.entries(R.how).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(40) + pct(v, R.n));
