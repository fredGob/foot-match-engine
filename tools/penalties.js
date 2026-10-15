// Penalties mis en scène : part de buts, d'arrêts et de tirs hors cadre. Repère du vrai football : environ 77 % de buts (de mémoire).
// Usage : node tools/penalties.js [nombre de penalties] [note=valeur, imposée à tous les joueurs de champ, par exemple sang_froid=40, sur 100]
const E = require('../engine.js');
const n = +process.argv[2] || 400, out = { goal: 0, save: 0, shot: 0, other: 0 };
const [qk, qv] = (process.argv[3] || '').split('='), Q = qk && E.QUALITIES.find(q => q[1] === qk);
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 7000 + i });
  if (Q) for (const p of m.players) if (p.role !== 'GK') p.a[Q[0]] = +qv / 100;
  for (let k = 0; k < 100; k++) E.step(m);
  const team = i % 2, ev = m.events.length;
  E.restart(m, 'penalty', team, (E.PITCH.HL - E.PITCH.SPOT) * m.teams[team].dir, 0, 6);
  let res = null;
  for (let k = 0; k < 1200 && !res; k++) { E.step(m); for (let j = ev; j < m.events.length; j++) { const e = m.events[j]; if (e.kind === 'goal' || e.kind === 'save' || e.kind === 'shot') { res = e.kind; break; } } }
  out[res || 'other']++;
}
console.log(`${n} penalties : ${(100 * out.goal / n).toFixed(0)} % de buts, ${(100 * out.save / n).toFixed(0)} % arrêtés, ${(100 * out.shot / n).toFixed(0)} % hors cadre` + (out.other ? `, ${out.other} sans issue claire` : ''));
