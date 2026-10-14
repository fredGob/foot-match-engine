// Ce que vaut une note : on impose la même valeur à tous les joueurs de champ des Bleus (équipe standard, tout le reste à 14),
// contre des Rouges standard, et on compare.
// Usage : node tools/note.js sang_froid 8,14,18 24      (note, valeurs essayées, matchs de 90 minutes par valeur)
const E = require('../engine.js');
const key = process.argv[2] || 'sang_froid', vals = (process.argv[3] || '8,14,18').split(',').map(Number), n = +process.argv[4] || 24;
const Q = E.QUALITIES.find(q => q[1] === key); if (!Q) { console.error('note inconnue : ' + key + ' (notes : ' + E.QUALITIES.map(q => q[1]).join(', ') + ')'); process.exit(1); }
console.log(Q[2] + ' des joueurs de champ bleus imposée ; ' + n + ' matchs de 90 minutes par valeur, contre des Rouges standard.\n');
const cols = ['Note', 'Buts B', 'Occ. B', 'Tirs B', 'Près: buts/tir', 'Face-à-face', 'Passes B', 'Pressé: passes ok', 'Hors-jeu B', 'Buts R', 'Occ. R', 'Tirs R', 'Profondeur R'];
console.log(cols.map(c => c.padStart(13)).join(''));
for (const v of vals) {
  const s = { gB: 0, xB: 0, tB: 0, near: 0, nearG: 0, face: 0, faceG: 0, pa: 0, pok: 0, prA: 0, prOk: 0, off: 0, gR: 0, xR: 0, tR: 0, deep: 0 };
  for (let i = 0; i < n; i++) {
    const m = E.createMatch({ seed: 1000 + i, duration: 5400 });
    for (const p of m.teams[0].players) if (p.role !== 'GK') p.a[Q[0]] = v / 20;
    let shot = null, sc = 0, pass = null;
    while (m.mode !== 'over') {
      E.step(m);
      // tirs bleus dans le jeu de près (moins de 14 m) ; face-à-face : tel que le moteur le voit (personne entre le tireur et le but, peu pressé)
      if (m.shot && m.shot !== shot) {
        shot = m.shot;
        if (shot.team === 0 && !shot.sp && shot.d0 < 14) s.near++;
        if (shot.team === 0 && shot.face) s.face++;
      }
      if (m.teams[0].score > sc) { sc = m.teams[0].score; if (shot && shot.team === 0 && !shot.sp) { if (shot.d0 < 14) s.nearG++; if (shot.face) s.faceG++; } }
      // passes bleues jouées sous pression (un adversaire à moins de 3 m) : réussies ou non
      if (m.pass && m.pass !== pass) {
        pass = m.pass;
        if (pass.from && pass.from.team === 0 && pass.kind === 'pass' && pass.to) {
          pass.pressed = m.teams[1].players.some(o => Math.hypot(o.x - pass.from.x, o.y - pass.from.y) < 3);
          if (pass.pressed) s.prA++;
        }
      }
      if (pass && pass.pressed && !pass.counted && m.ball.owner) { pass.counted = true; if (m.ball.owner === pass.to) s.prOk++; }
    }
    const B = m.teams[0].stats, R = m.teams[1].stats;
    s.gB += m.teams[0].score; s.xB += B.xg; s.tB += B.shots; s.pa += B.passes; s.pok += B.passesOk; s.off += B.offsides;
    s.gR += m.teams[1].score; s.xR += R.xg; s.tR += R.shots; s.deep += R.through;
  }
  const f = (x, k = 1) => (x / n).toFixed(k), pc = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '—';
  console.log([v, f(s.gB, 2), f(s.xB, 2), f(s.tB), pc(s.nearG, s.near) + ' /' + f(s.near), pc(s.faceG, s.face) + ' /' + f(s.face), pc(s.pok, s.pa), pc(s.prOk, s.prA), f(s.off, 2), f(s.gR, 2), f(s.xR, 2), f(s.tR), f(s.deep)].map(x => String(x).padStart(13)).join(''));
}
