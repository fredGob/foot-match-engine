// Possession : pourquoi une équipe garde ou perd le ballon.
// Pour chaque équipe : nombre et durée des possessions, comment elles se terminent, et la réussite des passes
// selon la note de passe du passeur, la pression au moment de frapper et la direction de la passe.
// Usage : node tools/possession.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [durée en secondes]
// Exemple : node tools/possession.js equipe=elite equipe=faible 20
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])];
const n = +process.argv[4] || 20, duration = +process.argv[5] || 5400;

const ENDS = { interceptee: 'Passe interceptée', devie: 'Passe déviée', rate_partenaire: 'Passe manquée (le partenaire ne l\'a pas)', ctrl: 'Contrôle raté', tacle: 'Tacle subi', shot: 'Tir', sortie: 'Ballon sorti', clear: 'Dégagement', gardien: 'Passe captée par le gardien', hors_jeu: 'Hors-jeu', faute: 'Faute', autre: 'Autre' };
const T = [0, 1].map(() => ({ poss: 0, possT: 0, ends: {}, passes: {}, byRating: {}, byPress: {}, byDir: {}, calib: {}, shots: 0 }));
const add = (o, k, ok) => { const r = o[k] || (o[k] = [0, 0]); r[0]++; if (ok) r[1]++; };

for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  let holder = null, since = 0, lastKey = 'autre', lastPass = null;
  const open = [];                                   // passes parties, pas encore terminées
  const count = m.count;
  m.count = new Proxy(count, { set(o, k, v) {
    o[k] = v; const head = String(k).split('.')[0];
    if (head === 'ctrl' && k.endsWith('rate')) lastKey = 'ctrl';
    else if (ENDS[head] && head !== 'ctrl') lastKey = head;
    else if (head === 'tacle' && k !== 'tacle.tente') lastKey = 'tacle';
    else if (head === 'arret' && k.startsWith('arret.freekick') || head === 'arret' && k === 'arret.penalty') lastKey = lastKey === 'sortie' ? 'sortie' : 'faute';
    return true;
  } });
  while (m.mode !== 'over') {
    const fouls = m.teams[0].stats.fouls + m.teams[1].stats.fouls, tk = m.teams[0].stats.tackles + m.teams[1].stats.tackles;
    E.step(m);
    if (m.teams[0].stats.tackles + m.teams[1].stats.tackles > tk) lastKey = 'tacle';
    if (m.teams[0].stats.fouls + m.teams[1].stats.fouls > fouls) lastKey = 'faute';
    const q = m.pass;
    if (q && q !== lastPass && q.kind === 'pass' && q.type !== 'tete' && q.from) {
      const p = q.from, O = m.teams[1 - p.team];
      let dmin = 99; for (const o of O.players) dmin = Math.min(dmin, Math.hypot(o.x - p.x, o.y - p.y));
      const pr = Math.max(0, Math.min(1, 1 - (dmin - 1.3) / 4.5));
      const d = m.teams[p.team].dir, fwd = q.to ? (q.to.x - p.x) * d : 0;
      open.push({ q, team: p.team, rating: Math.round(p.a.passing * 20), pr: pr > 0.5 ? 'pressé' : pr > 0.05 ? 'gêné' : 'libre', dir: fwd > 5 ? 'vers l\'avant' : fwd < -5 ? 'vers l\'arrière' : 'à plat', type: q.type, est: q.pOk });
    }
    lastPass = q;
    for (let j = open.length - 1; j >= 0; j--) {
      const o = open[j]; if (!o.q.ended) continue;
      open.splice(j, 1);
      const S = T[o.team], ok = o.q.to && m.ball.owner && m.ball.owner.team === o.team || false;
      add(S.passes, o.type, ok); add(S.byRating, o.rating, ok); add(S.byPress, o.pr, ok); add(S.byDir, o.dir, ok);
      if (o.est != null) { const k = o.type + ' ' + (Math.min(9, Math.floor(o.est * 10)) * 10) + '-' + (Math.min(9, Math.floor(o.est * 10)) * 10 + 10) + ' %'; add(S.calib, k, ok); }
    }
    const ow = m.ball.owner;
    if (ow && ow.team !== holder) {
      if (holder !== null) { const S = T[holder]; S.poss++; S.possT += m.t - since; S.ends[lastKey] = (S.ends[lastKey] || 0) + 1; }
      holder = ow.team; since = m.t; lastKey = 'autre';
    }
  }
  for (let t = 0; t < 2; t++) { T[t].shots += m.teams[t].stats.shots; T[t].engPoss = (T[t].engPoss || 0) + m.teams[t].stats.possT; }
}

const name = s => Eq.name(s), pct = (a, b) => b ? (100 * a / b).toFixed(1).padStart(5) + ' %' : '    –  ';
const col = (s, w = 26) => String(s).padStart(w);
console.log(`\n${n} matchs de ${duration / 60} min — Bleus : ${name(sides[0])}, Rouges : ${name(sides[1])}\n`);
console.log(''.padEnd(44) + col('Bleus') + col('Rouges'));
const tot = t => T[t].engPoss;
console.log('Possession (temps balle au pied d\'un joueur)'.padEnd(44) + col(pct(tot(0), tot(0) + tot(1))) + col(pct(tot(1), tot(0) + tot(1))));
console.log('Possessions par match'.padEnd(44) + col((T[0].poss / n).toFixed(0)) + col((T[1].poss / n).toFixed(0)));
console.log('Temps de possession, arrêts de jeu compris'.padEnd(44) + col((T[0].possT / T[0].poss).toFixed(1) + ' s') + col((T[1].possT / T[1].poss).toFixed(1) + ' s'));
console.log('\nComment la possession se termine (par match)');
for (const k in ENDS) { const a = (T[0].ends[k] || 0) / n, b = (T[1].ends[k] || 0) / n; if (a + b >= 0.05) console.log(('  ' + ENDS[k]).padEnd(44) + col(a.toFixed(1)) + col(b.toFixed(1))); }
const block = (title, key, order) => {
  console.log('\n' + title + ' (passes par match · réussies)');
  const ks = order || [...new Set([...Object.keys(T[0][key]), ...Object.keys(T[1][key])])].sort((a, b) => a - b);
  for (const k of ks) { const c = T.map(S => S[key][k] || [0, 0]); console.log(('  ' + k).padEnd(44) + c.map(r => col(r[0] ? (r[0] / n).toFixed(0) + ' · ' + pct(r[1], r[0]).trim() : '–')).join('')); }
};
block('Selon le type', 'passes', ['pieds', 'course', 'air']);
block('Selon la note de passe du passeur', 'byRating');
block('Selon la pression sur le passeur', 'byPress', ['libre', 'gêné', 'pressé']);
block('Selon la direction', 'byDir', ['vers l\'arrière', 'à plat', 'vers l\'avant']);
block('Réussite estimée par le passeur, puis réelle', 'calib', [...new Set([...Object.keys(T[0].calib), ...Object.keys(T[1].calib)])].sort());
