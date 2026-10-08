// Qui passe à qui : part des passes entre les lignes (gardien, défenseurs centraux, latéraux, milieux axiaux, milieux de côté, attaquants)
// Usage : node tools/passes.js [nombre de matchs]
const E = require('../engine.js');
const n = +process.argv[2] || 50;
const LINE = { GK: 'Gardien', LCB: 'Déf. centraux', RCB: 'Déf. centraux', LB: 'Latéraux', RB: 'Latéraux', LCM: 'Milieux axiaux', RCM: 'Milieux axiaux', LM: 'Milieux côté', RM: 'Milieux côté', LF: 'Attaquants', RF: 'Attaquants' };
const names = ['Gardien', 'Déf. centraux', 'Latéraux', 'Milieux axiaux', 'Milieux côté', 'Attaquants'];
const mat = {}, made = {}, got = {}; let total = 0;
for (const a of names) { mat[a] = {}; made[a] = 0; got[a] = 0; for (const b of names) mat[a][b] = 0; }
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 300 + i }); let last = null;
  while (m.mode !== 'over') {
    E.step(m);
    const q = m.pass;
    if (q && q !== last && q.kind === 'pass' && q.to && q.type !== 'tete') { const a = LINE[q.from.slot], b = LINE[q.to.slot]; mat[a][b]++; made[a]++; got[b]++; total++; }
    last = q;
  }
}
const pct = v => (100 * v / total).toFixed(1).padStart(6) + ' %';
console.log(`\n${n} matchs — ${(total / n).toFixed(0)} passes par match (2 équipes). Part de toutes les passes :\n`);
console.log('de ↓  vers →'.padEnd(18) + names.map(x => x.slice(0, 13).padStart(14)).join('') + '   | donne');
for (const a of names) console.log(a.padEnd(18) + names.map(b => pct(mat[a][b]).padStart(14)).join('') + '   | ' + pct(made[a]));
console.log('reçoit'.padEnd(18) + names.map(b => pct(got[b]).padStart(14)).join(''));
console.log(`\nLes deux défenseurs centraux reçoivent ${pct(got['Déf. centraux']).trim()} des passes, dont ${pct(mat['Milieux axiaux']['Déf. centraux'] + mat['Milieux côté']['Déf. centraux']).trim()} venant des milieux.`);
console.log('Repère du vrai football (de mémoire, à vérifier) : les deux centraux reçoivent environ 20 % des passes de leur équipe.');
