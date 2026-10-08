// D'où partent les tirs et ce qu'ils deviennent, par zone, pour comparer aux chiffres vérifiés du vrai football.
// Usage : node tools/shots.js [nombre de matchs de 90 min]
// Repères (Premier League 2024-25, Opta) : 26 tirs par match, 32 % hors de la surface ; 14,7 % de buts dans la surface, 4,2 % en dehors.
// Repères plus anciens (StatsBomb) : environ 40 % de buts dans les six mètres, 20 % dans l'axe de la surface.
const E = require('../engine.js');
const n = +process.argv[2] || 40, PP = E.PITCH;
const zones = ['dans les six mètres', 'reste de la surface', 'hors de la surface'], res = zones.map(() => ({ n: 0, goal: 0, save: 0, block: 0, off: 0 }));
const set = { penalty: { n: 0, goal: 0 }, freekick: { n: 0, goal: 0 } };
let play = 0, total = 0;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 500 + i, duration: 5400 }); let cur = null, ev = 0;
  while (m.mode !== 'over') {
    E.step(m);
    const s = m.shot;
    if (s && s !== cur) {
      cur = s; total++;
      const d = m.teams[s.team].dir, dx = PP.HL - s.by.x * d, ay = Math.abs(s.by.y);
      s._z = s.sp === 'penalty' ? 1 : dx <= PP.SIX_D && ay <= PP.SIX_HW ? 0 : dx <= PP.BOX_D && ay <= PP.BOX_HW ? 1 : 2;
      res[s._z].n++; if (set[s.sp]) set[s.sp].n++;
    }
    for (; ev < m.events.length; ev++) {
      const e = m.events[ev]; if (!cur || cur._end || e.t < cur.t0) continue;
      const k = e.kind === 'goal' ? 'goal' : e.kind === 'save' ? 'save' : e.kind === 'block' ? 'block' : e.kind === 'shot' ? 'off' : null;
      if (k) { cur._end = k; res[cur._z][k]++; if (k === 'goal' && set[cur.sp]) set[cur.sp].goal++; }
    }
  }
  play += m.playT;
}
const pc = (a, b) => b ? (100 * a / b).toFixed(0).padStart(4) + ' %' : '    –';
console.log(`\n${n} matchs de 90 min — ${(total / n).toFixed(1)} tirs par match, ballon en jeu ${(play / n / 60).toFixed(0)} min\n`);
console.log('zone                     tirs/match   part   but   arrêté  contré  hors cadre');
res.forEach((r, i) => console.log(zones[i].padEnd(24) + (r.n / n).toFixed(1).padStart(8) + '  ' + pc(r.n, total) + pc(r.goal, r.n) + '  ' + pc(r.save, r.n) + '  ' + pc(r.block, r.n) + '    ' + pc(r.off, r.n)));
const inb = { n: res[0].n + res[1].n, goal: res[0].goal + res[1].goal }, all = res.reduce((a, r) => ({ goal: a.goal + r.goal, save: a.save + r.save, block: a.block + r.block }), { goal: 0, save: 0, block: 0 });
console.log(`\ndans la surface : ${pc(inb.goal, inb.n).trim()} de buts (vrai : 14,7 %)   hors de la surface : ${pc(res[2].goal, res[2].n).trim()} (vrai : 4,2 %)   part des tirs hors surface : ${pc(res[2].n, total).trim()} (vrai : 32 %)`);
console.log(`ensemble : ${pc(all.goal, total).trim()} de buts (vrai : 11 à 12 %), ${pc(all.goal + all.save, total).trim()} cadrés, ${pc(all.block, total).trim()} contrés`);
console.log(`penalties : ${(set.penalty.n / n).toFixed(2)} par match, ${pc(set.penalty.goal, set.penalty.n).trim()} de buts   coups francs directs : ${(set.freekick.n / n).toFixed(1)} par match, ${pc(set.freekick.goal, set.freekick.n).trim()} de buts (vrai : 5,6 %)`);
