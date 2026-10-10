// D'où vient l'écart entre deux équipes ? Pour chaque groupe de notes, on efface l'écart sur ce groupe seulement :
// les deux équipes reçoivent, poste par poste, la moyenne de leurs deux notes. Le reste ne change pas.
// Le groupe dont l'effacement réduit le plus l'écart est celui qui pèse le plus dans le moteur.
// Usage : node tools/gap.js [équipe forte] [équipe faible] [matchs par réglage]
// Exemple : node tools/gap.js elite faible 40      (40 matchs de 90 min par réglage, moitié dans chaque camp, sur plusieurs cœurs)
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), os = require('os');
const E = require(path.join(__dirname, '..', 'engine.js')), Eq = require(path.join(__dirname, '..', 'equipes.js'));
const GROUPS = [
  ['aucun (écart réel)', []],
  ['physique', ['vitesse', 'acceleration', 'endurance', 'volume_de_course']],
  ['passe et vision', ['passe', 'vision']],
  ['prise de balle et dribble', ['prise_de_balle', 'dribble']],
  ['finition, appels, tête', ['finition', 'appels', 'jeu_de_tete']],
  ['défense (tacle, placement, anticipation, agressivité)', ['tacle', 'placement', 'anticipation', 'agressivite']],
  ['mental (lucidité, sang-froid, goût du risque)', ['lucidite', 'sang_froid', 'gout_du_risque']],
  ['gardien (réflexes, mains)', ['reflexes', 'mains']],
];
function blend(A, B, keys) {
  const a = JSON.parse(JSON.stringify(A)), b = JSON.parse(JSON.stringify(B));
  for (const pa of a.joueurs) { const pb = b.joueurs.find(q => q.poste === pa.poste); for (const k of keys) { const v = Math.round((pa.notes[k] + pb.notes[k]) / 2); pa.notes[k] = v; pb.notes[k] = v; } }
  return [a, b];
}
if (!isMainThread) {
  const { a, b, seeds } = workerData, out = { g: [0, 0], xg: [0, 0], poss: [0, 0], w: 0, d: 0, l: 0 };
  for (const seed of seeds) {
    const flip = seed % 2, teams = flip ? [b, a] : [a, b];
    const m = E.createMatch({ seed, duration: 5400, teams });
    while (m.mode !== 'over') E.step(m);
    const S = flip ? [m.teams[1], m.teams[0]] : [m.teams[0], m.teams[1]];
    for (let t = 0; t < 2; t++) { out.g[t] += S[t].score; out.xg[t] += S[t].stats.xg; out.poss[t] += S[t].stats.possT; }
    if (S[0].score > S[1].score) out.w++; else if (S[0].score < S[1].score) out.l++; else out.d++;
  }
  parentPort.postMessage(out);
} else {
  const A = Eq.get(process.argv[2] || 'elite'), B = Eq.get(process.argv[3] || 'faible'), n = +process.argv[4] || 40;
  const nw = Math.max(1, os.cpus().length > 4 ? os.cpus().length - 2 : os.cpus().length);
  (async () => {
    console.log(`\n${A.nom} contre ${B.nom}, ${n} matchs de 90 min par ligne. Valeurs de ${A.nom} (pour – contre).\n`);
    console.log('Écart effacé sur'.padEnd(56) + 'V – N – D'.padStart(12) + 'Buts'.padStart(14) + 'Occasions'.padStart(14) + 'Possession'.padStart(12));
    for (const [label, keys] of GROUPS) {
      const [a, b] = blend(A, B, keys), chunks = Array.from({ length: nw }, () => []);
      for (let i = 0; i < n; i++) chunks[i % nw].push(1 + i);
      const parts = await Promise.all(chunks.map(seeds => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { a, b, seeds } }); w.on('message', res); w.on('error', rej); })));
      const R = parts.reduce((s, p) => { for (const k of ['w', 'd', 'l']) s[k] += p[k]; for (const k of ['g', 'xg', 'poss']) for (let t = 0; t < 2; t++) s[k][t] += p[k][t]; return s; }, { g: [0, 0], xg: [0, 0], poss: [0, 0], w: 0, d: 0, l: 0 });
      const pc = v => Math.round(100 * v / n);
      console.log(label.padEnd(56) + `${pc(R.w)}–${pc(R.d)}–${pc(R.l)} %`.padStart(12) + `${(R.g[0] / n).toFixed(2)} – ${(R.g[1] / n).toFixed(2)}`.padStart(14) + `${(R.xg[0] / n).toFixed(2)} – ${(R.xg[1] / n).toFixed(2)}`.padStart(14) + `${Math.round(100 * R.poss[0] / (R.poss[0] + R.poss[1]))} %`.padStart(12));
    }
  })();
}
