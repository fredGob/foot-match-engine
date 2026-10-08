// Simule des matchs sans affichage et affiche les statistiques moyennes.
// Usage : node sim.js [nombre de matchs] [première graine] [durée en secondes] [réglages des Bleus] [réglages des Rouges]
// Réglages : liste « clé=valeur » séparée par des virgules. Consignes (valeur −1, 0 ou 1) : passing, tempo, width, line, press.
// Équipe du fichier equipes.json : equipe=elite, eleve, moyen ou faible. Sans « equipe= » : équipe standard, tous les joueurs à 14.
// Exemple : node sim.js 200 1 600 passing=-1,line=1 press=1     (Bleus : jeu court et bloc haut ; Rouges : pressing « harceler »)
// Exemple : node sim.js 100 1 5400 equipe=elite equipe=faible,line=-1,press=-1     (l'équipe élite contre l'équipe faible qui attend en bloc bas)
const E = require('./engine.js'), St = require('./stats.js'), Eq = require('./equipes.js');

const n = +process.argv[2] || 100, seed0 = +process.argv[3] || 1, duration = +process.argv[4] || 600;
const sides = [Eq.side(process.argv[5]), Eq.side(process.argv[6])], tactics = sides.map(x => x.tactics), teams = sides.map(x => x.team);
const tactical = tactics.some(t => Object.values(t).some(v => v)) || teams.some(Boolean);
const keys = ['goals', 'shots', 'onTarget', 'xg', 'passes', 'tackles', 'interceptions', 'blocks', 'fouls', 'corners', 'offsides', 'saves'];
const acc = St.create(), count = {};
let play = 0, t0 = Date.now();

for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: seed0 + i, duration, tactics, teams });
  while (m.mode !== 'over') E.step(m);
  St.add(acc, m); play += m.playT;
  for (const k in m.count) count[k] = (count[k] || 0) + m.count[k];
  if (n === 1) for (const e of m.events) console.log(String(Math.floor(e.t / 60)).padStart(2, '0') + ':' + String(Math.floor(e.t % 60)).padStart(2, '0'), e.text);
}

const A = acc.teams[0], B = acc.teams[1], both = k => (A[k] + B[k]) / n;
// ordres de grandeur du football professionnel pour 90 minutes, ramenés à la durée simulée (les deux équipes ensemble)
const ref = { goals: 2.7, shots: 25, onTarget: 8.5, xg: 2.7, passes: 900, tackles: 33, interceptions: 20, blocks: 7, fouls: 23, corners: 10, offsides: 4, saves: 6 };
console.log(`\n${n} match(s) de ${duration} s — ${((Date.now() - t0) / n).toFixed(0)} ms par match\n`);
console.log('par match (2 équipes)   simulé    réel (ordre de grandeur)');
for (const k of keys) console.log('  ' + k.padEnd(20) + both(k).toFixed(2).padStart(8) + '    ' + (ref[k] * duration / 5400).toFixed(2));
console.log('  passes réussies'.padEnd(22) + (100 * (A.passesOk + B.passesOk) / (A.passes + B.passes)).toFixed(1).padStart(7) + ' %    80 à 85 %');
console.log('  temps de jeu effectif'.padEnd(22) + (100 * play / (n * duration)).toFixed(1).padStart(6) + ' %    55 à 60 %');
console.log('  possession Bleus'.padEnd(22) + (100 * A.possT / (A.possT + B.possT)).toFixed(1).padStart(7) + ' %    50 %');
console.log('  distance par joueur'.padEnd(22) + ((A.dist + B.dist) / (n * 22)).toFixed(0).padStart(7) + ' m    ' + (10500 * duration / 5400).toFixed(0) + ' m');
if (n > 1) console.log('\nscores les plus fréquents :', Object.entries(acc.scores).sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0] + ' ×' + e[1]).join(', '));

if (tactical) {
  console.log(`\nBleus (${Eq.name(sides[0])}) contre Rouges (${Eq.name(sides[1])}) : ${A.wins} victoires, ${acc.draws} nuls, ${B.wins} défaites\n`);
  console.log(' '.repeat(30) + 'Bleus'.padStart(10) + 'Rouges'.padStart(10));
  let g = ''; for (const r of St.rows(acc)) { if (r.group !== g) console.log('— ' + (g = r.group)); console.log(('  ' + r.label).padEnd(30) + r.a.padStart(10) + r.b.padStart(10)); }
}
if (process.env.DETAIL) { console.log('\ndétail (par match) :'); for (const k of Object.keys(count).sort()) console.log('  ' + k.padEnd(28) + (count[k] / n).toFixed(2).padStart(8)); }
