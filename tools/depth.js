// Que deviennent les ballons joués par les Bleus dans le dos de la défense rouge ? Qui les reçoit, et y a-t-il un tir ensuite ?
// Usage : node tools/depth.js [consignes des Bleus] [consignes des Rouges] [nombre de matchs de 90 min]
// Exemple : node tools/depth.js passing=1 line=1 20     (jeu long contre bloc haut)
const E = require('../engine.js');
const parse = s => { const t = {}; for (const kv of (s || '').split(',')) { const [k, v] = kv.split('='); if (k) t[k] = +v; } return t; };
const n = +process.argv[4] || 20, tac = [parse(process.argv[2]), parse(process.argv[3])];
const res = {}, add = (k, v) => { res[k] = (res[k] || 0) + (v == null ? 1 : v); }; const ex = [];
let tot = 0, got = 0, shotAfter = 0, xgAfter = 0, goalsAfter = 0, lead = 0, cen = 0, dGoalSum = 0;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 2000 + i, duration: 5400, tactics: tac }); let last = null, watch = [], ev = 0;
  while (m.mode !== 'over') {
    const before = m.pass; E.step(m); const q = m.pass;
    if (q && q !== last && q.kind === 'pass' && q.from.team === 0 && q.to && q.type !== 'tete') {
      let a = -99, b2 = -99; for (const o of m.teams[1].players) { if (o.x > a) { b2 = a; a = o.x; } else if (o.x > b2) b2 = o.x; }
      if (q.aimX > b2 + 2 && q.aimX > 0) { tot++; q._w = { t0: m.t, line: b2, type: q.type, to: q.to, from: q.from, fromX: q.from.x, seed: m.seed, D: q.aimX - q.from.x }; add('type.' + q.type); }
    }
    // la passe vient de se terminer : qui a le ballon ?
    if (last && last._w && !last._w.end && (m.pass !== last)) {
      const w = last._w, o = m.ball.owner; w.end = true;
      if (m.mode === 'dead') add('fin.' + (m.restart.type === 'freekick' ? 'hors-jeu' : m.restart.type === 'goalkick' ? 'sortie de but' : m.restart.type));
      else if (o && o.team === 0) { add('fin.reçue'); got++; let dmin = 99, goalSide = 0; for (const d of m.teams[1].players) { if (d.role === 'GK') continue; const dd = Math.hypot(d.x - o.x, d.y - o.y); if (dd < dmin) dmin = dd; if (d.x > o.x + 0.5 && Math.abs(d.y - o.y) < 12) goalSide++; }
        lead += dmin; cen += Math.abs(o.y) < 14 ? 1 : 0; dGoalSum += Math.hypot(52.5 - o.x, o.y); add('reçue.défenseurs entre lui et le but: ' + Math.min(goalSide, 3)); watch.push({ until: m.t + 10, shots: m.teams[0].stats.shots, xg: m.teams[0].stats.xg, goals: m.teams[0].score, seed: m.seed, t: m.t, x: o.x, y: o.y, dmin, goalSide });
        if (ex.length < 6 && goalSide === 0 && Math.abs(o.y) < 14) ex.push(m.seed + ':' + m.t.toFixed(1)); }
      else if (o && o.team === 1) add(o.role === 'GK' ? 'fin.gardien' : 'fin.défenseur');
      else { add('fin.ballon libre / tête'); }
    }
    last = q || last;
    if (!m.pass && last && last._w && !last._w.end) { /* géré ci-dessus au prochain tour */ }
    watch = watch.filter(w => { if (m.t < w.until) return true; const S = m.teams[0].stats; if (S.shots > w.shots) { shotAfter++; xgAfter += S.xg - w.xg; add('suite.tir'); } else add('suite.pas de tir'); if (m.teams[0].score > w.goals) goalsAfter++; return false; });
  }
}
console.log(`Bleus [${process.argv[2] || 'neutre'}] / Rouges [${process.argv[3] || 'neutre'}] — ${n} matchs : ${(tot / n).toFixed(1)} ballons joués dans le dos de la défense par match`);
for (const k of Object.keys(res).sort()) console.log('   ' + k.padEnd(46) + (res[k] / n).toFixed(1).padStart(6) + ' par match');
console.log(`   reçus : ${(got / n).toFixed(1)} par match (${(100 * got / tot).toFixed(0)} %) ; défenseur le plus proche à ${(lead / got).toFixed(1)} m ; dans l'axe ${(100 * cen / got).toFixed(0)} % ; à ${(dGoalSum / got).toFixed(0)} m du but en moyenne`);
console.log(`   dans les 10 s qui suivent : tir ${(100 * shotAfter / got).toFixed(0)} % (xG moyen ${(xgAfter / Math.max(1, shotAfter)).toFixed(2)}), but ${(100 * goalsAfter / got).toFixed(1)} %`);
console.log('   exemples (seul face au but, dans l\'axe) :', ex.join('  '));
