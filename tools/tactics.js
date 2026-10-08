// Mesure l'effet de chaque consigne : les Bleus appliquent UNE consigne, les Rouges restent neutres, mêmes matchs à chaque fois.
// Usage : node tools/tactics.js [nombre de matchs par réglage] [durée en secondes]
// Chaque colonne se lit par rapport à la colonne « neutre ».
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const E = require(path.join(__dirname, '..', 'engine.js')), St = require(path.join(__dirname, '..', 'stats.js'));

if (!isMainThread) {
  const { tac, n, duration } = workerData, acc = St.create();
  for (let i = 0; i < n; i++) { const m = E.createMatch({ seed: 1000 + i, duration, tactics: [tac, {}] }); while (m.mode !== 'over') E.step(m); St.add(acc, m); }
  parentPort.postMessage(acc);
} else {
  const n = +process.argv[2] || 100, duration = +process.argv[3] || 600;
  const configs = [{ name: 'neutre', tac: {} }];
  for (const c of E.TACTICS) for (const v of [-1, 1]) configs.push({ name: c.options[v < 0 ? 0 : 2], group: c.label, tac: { [c.key]: v } });
  const run = cfg => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { tac: cfg.tac, n, duration } }); w.on('message', res); w.on('error', rej); });
  Promise.all(configs.map(run)).then(accs => {
    const W = 10, col = s => String(s).slice(0, W - 1).padStart(W);
    console.log(`\n${n} matchs de ${duration / 60} min par colonne. Valeurs des Bleus (la consigne), face à des Rouges neutres.\n`);
    console.log(' '.repeat(34) + col('') + E.TACTICS.map(c => col('') + col(c.label.replace('Hauteur du ', '').replace('Jeu de ', ''))).join(''));
    console.log(' '.repeat(34) + configs.map(c => col(c.name)).join(''));
    const tables = accs.map(a => St.rows(a));
    let group = '';
    tables[0].forEach((r, i) => {
      if (r.group !== group) { group = r.group; console.log('— ' + group); }
      console.log(('  ' + r.label).padEnd(34) + tables.map(t => col(t[i].a)).join(''));
    });
    console.log('— Contre elle (ce que font les Rouges)');
    for (const label of ['Buts', 'Tirs', 'Buts attendus', 'Passes réussies', 'Longs ballons', 'Hors-jeu']) {
      const i = tables[0].findIndex(r => r.label === label);
      console.log(('  ' + label).padEnd(34) + tables.map(t => col(t[i].b)).join(''));
    }
    console.log('— Bilan des Bleus');
    console.log('  victoires / nuls / défaites'.padEnd(34) + accs.map(a => col(a.teams[0].wins + '/' + a.draws + '/' + a.teams[1].wins)).join(''));
  });
}
