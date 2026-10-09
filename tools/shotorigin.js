// D'où viennent les tirs concédés ? Pour chaque tir des Rouges : l'action qui l'a préparé (centre, passe en profondeur,
// passe au sol, tir après avoir conduit le ballon, ballon repris), la distance au but, et le nombre de Bleus entre le tireur et le but.
// Usage : node tools/shotorigin.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs]
// Exemple : node tools/shotorigin.js line=-1,press=-1 "" 15
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])], n = +process.argv[4] || 15;
const R = { n: 0, xg: 0, kind: {}, dist: {}, cover: {}, lineX: 0, lineN: 0, midGap: 0 };
const add = (o, k, xg) => { const r = o[k] || (o[k] = [0, 0]); r[0]++; r[1] += xg; };
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration: 5400, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team) });
  let lastPass = null, lastShot = null, f = 0;
  const B = m.teams[0];
  while (m.mode !== 'over') {
    E.step(m); f++;
    if (m.pass && m.pass.kind === 'pass' && m.pass.from.team === 1) lastPass = { q: m.pass, t: m.t };
    // hauteur de la défense et écart défense-milieu des Bleus quand les Rouges ont le ballon dans le camp bleu
    const o = m.ball.owner;
    if (f % 10 === 0 && o && o.team === 1 && o.x * B.dir < 0) {
      const xs = r => B.players.filter(p => p.role === r).map(p => p.x * B.dir);
      const dx = xs('DEF'), mx = xs('MID'), avg = a => a.reduce((s, v) => s + v, 0) / a.length;
      R.lineX += avg(dx); R.midGap += avg(mx) - avg(dx); R.lineN++;
    }
    if (m.shot && m.shot !== lastShot && m.shot.team === 1 && !m.shot.sp) {
      lastShot = m.shot; const p = m.shot.by, xg = m.shot.xg || 0, gx = -52.5 * B.dir * -1 * -1;
      const goalX = B.dir * -52.5, D = Math.hypot(goalX - p.x, p.y);
      let kind = 'ballon repris ou rebond';
      if (lastPass && m.t - lastPass.t < 4 && lastPass.q.to === p) kind = lastPass.q.type === 'air' ? (Math.abs(lastPass.q.from.y) > 16 ? 'centre' : 'long ballon') : lastPass.q.type === 'course' ? 'passe en profondeur' : lastPass.q.type === 'tete' ? 'remise de la tête' : 'passe au sol';
      else if (lastPass && m.t - lastPass.t < 8 && lastPass.q.to === p) kind = 'a conduit le ballon après une passe';
      let cover = 0; const ux = (goalX - p.x) / D, uy = -p.y / D;
      for (const q of B.players) { if (q.role === 'GK') continue; const rx = q.x - p.x, ry = q.y - p.y, s = rx * ux + ry * uy; if (s > 0 && s < D && Math.abs(rx * uy - ry * ux) < 2.5) cover++; }
      R.n++; R.xg += xg; add(R.kind, kind, xg); add(R.dist, D < 6 ? 'à moins de 6 m' : D < 12 ? '6 à 12 m' : D < 18 ? '12 à 18 m' : 'plus de 18 m', xg); add(R.cover, cover >= 2 ? '2 et plus' : String(cover), xg);
    }
  }
}
const show = (title, o, keys) => { console.log(title); for (const k of keys || Object.keys(o).sort((a, b) => o[b][0] - o[a][0])) if (o[k]) console.log(('  ' + k).padEnd(42) + (o[k][0] / n).toFixed(1).padStart(6) + ' tirs   ' + (o[k][1] / n).toFixed(2).padStart(6) + ' d\'occasions'); };
console.log(`\n${n} matchs — Bleus : ${Eq.name(sides[0])} ; tirs des Rouges hors coups de pied arrêtés : ${(R.n / n).toFixed(1)} par match, ${(R.xg / n).toFixed(2)} d'occasions`);
console.log(`Quand les Rouges attaquent dans le camp bleu : défense bleue à ${(52.5 + R.lineX / R.lineN).toFixed(1)} m de son but, milieux ${(R.midGap / R.lineN).toFixed(1)} m devant elle`);
show('Ce qui a préparé le tir', R.kind);
show('Distance au but', R.dist, ['à moins de 6 m', '6 à 12 m', '12 à 18 m', 'plus de 18 m']);
show('Bleus entre le tireur et le but (gardien non compté)', R.cover, ['0', '1', '2 et plus']);
