// Énergie : où part la fraîcheur des Bleus ? Par activité, par allure, par moment du jeu, par ligne.
// Usage : node tools/energy.js [consignes des Bleus] [nombre de matchs de 90 min] [consignes des Rouges]
// Exemple : node tools/energy.js press=-1 20        (Bleus en « attendre », Rouges neutres)
const E = require('../engine.js');
const parse = s => { const t = {}; for (const kv of (s || '').split(',')) { const [k, v] = kv.split('='); if (k) t[k] = +v; } return t; };
const blue = parse(process.argv[2]), n = +process.argv[3] || 20, red = parse(process.argv[4]);
const ACT = { press: 'presse le porteur', hunt: 'colle un adversaire (harceler)', position: 'se place sans ballon', run: 'fait un appel', chase: 'va au ballon', receive: 'va au ballon', claim: 'va au ballon', toBall: 'va au ballon', dribble: 'a le ballon', control: 'a le ballon', kick: 'a le ballon', hold: 'a le ballon' };
const add = (o, k, t, e) => { const r = o[k] || (o[k] = { t: 0, e: 0 }); r.t += t; r.e += e; };
const act = {}, pace = {}, phase = {}, role = {}, label = {};
let total = 0, time = 0, dist = 0, end = 0, low = 0, xgF = 0, xgA = 0, possF = 0, possA = 0;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 9000 + i, duration: 5400, tactics: [blue, red] });
  const ps = m.teams[0].players.filter(p => p.role !== 'GK'), prev = new Map(ps.map(p => [p, p.stam]));
  while (m.mode !== 'over') {
    E.step(m);
    const ph = m.mode !== 'play' ? 'arrêt de jeu' : m.poss === 0 ? 'les Bleus ont le ballon' : m.poss === 1 ? 'les Rouges ont le ballon' : 'ballon à personne';
    for (const p of ps) {
      const e = prev.get(p) - p.stam; prev.set(p, p.stam);
      const v = Math.hypot(p.vx, p.vy), it = p.intent;
      add(act, it.type === 'position' && it.hunt ? ACT.hunt : ACT[it.type] || it.type, E.DT, e);
      add(pace, v < 0.5 ? '0 arrêté' : v < 2.4 ? '1 marche' : v < 4.3 ? '2 trottine' : v < 6.2 ? '3 court' : '4 sprinte', E.DT, e);
      add(phase, ph, E.DT, e); add(role, p.role, E.DT, e);
      if (m.mode === 'play' && m.poss !== 0) add(label, (it.label || it.type).replace(/ ?(le |du )?n°\d+/, ''), E.DT, e);
      total += e; time += E.DT;
    }
  }
  for (const p of ps) dist += p.dist;
  end += ps.reduce((a, p) => a + p.stam, 0) / ps.length; low += Math.min(...ps.map(p => p.stam));
  xgF += m.teams[0].stats.xg; xgA += m.teams[1].stats.xg; possF += m.teams[0].stats.possT; possA += m.teams[1].stats.possT;
}
const name = t => E.TACTICS.filter(c => t[c.key]).map(c => c.label + ' : ' + c.options[t[c.key] + 1].toLowerCase()).join(', ') || 'neutres';
const N = n * 10;                                            // joueurs de champ × matchs
console.log(`\nBleus (${name(blue)}) contre Rouges (${name(red)}) — ${n} matchs de 90 min\n`);
console.log(`Fraîcheur finale ${(100 * end / n).toFixed(1)} % (le plus fatigué ${(100 * low / n).toFixed(0)} %), ${(dist / N / 1000).toFixed(2)} km par joueur`);
console.log(`Possession ${(100 * possF / (possF + possA)).toFixed(0)} %, occasions ${(xgF / n).toFixed(2)} pour, ${(xgA / n).toFixed(2)} contre\n`);
const table = (title, o, keep, max) => {
  console.log(title.padEnd(34) + 'temps par joueur'.padStart(18) + 'fraîcheur perdue'.padStart(20) + 'part'.padStart(8) + 'coût par minute'.padStart(18));
  for (const k of Object.keys(o).sort((a, b) => keep ? a.localeCompare(b) : o[b].e - o[a].e).slice(0, max || 99)) {
    const r = o[k];
    console.log(('  ' + k.replace(/^\d /, '')).padEnd(34) + ((r.t / N / 60).toFixed(1) + ' min').padStart(18) + ((100 * r.e / N).toFixed(1) + ' pts').padStart(20) + ((100 * r.e / total).toFixed(0) + ' %').padStart(8) + ((100 * r.e / r.t * 60).toFixed(2) + ' pt').padStart(18));
  }
  console.log('');
};
table('Par activité', act); table('Par allure', pace, true); table('Par moment du jeu', phase); table('Par ligne', role, true);
table('Sans le ballon, par intention', label, false, 7);
