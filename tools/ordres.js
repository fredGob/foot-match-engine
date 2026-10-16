// Ce que change une consigne individuelle (n° 121) : on la donne à un seul joueur des Bleus (équipe standard, 4-4-2), contre des Rouges standard,
// et on compare avec le même joueur sans consigne. Plusieurs cœurs.
// Usage : node tools/ordres.js [place 0 à 10] [matchs de 90 min par réglage]
// Exemple : node tools/ordres.js 10 24     (place 10 = attaquant de pointe en 4-4-2 ; 1 = arrière gauche ; 7 = milieu axial)
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), os = require('os');
const E = require(path.join(__dirname, '..', 'engine.js'));
const place = isMainThread ? +(process.argv[2] || 10) : workerData.place, n = +process.argv[3] || 24;
if (!isMainThread) {
  const { ord, seeds } = workerData, s = { touch: 0, drib: 0, pass: 0, simple: 0, shots: 0, far: 0, farGoals: 0, runs: 0, xSum: 0, xN: 0, goals: 0, ga: 0, lost: 0 };
  for (const seed of seeds) {
    const m = E.createMatch({ seed, duration: 5400 });
    const arr = []; arr[place] = ord; E.setOrders(m, 0, arr);
    const P = m.teams[0].players[place];
    m.onChoice = (p, opts, pick) => { if (p !== P) return; s.touch++; if (pick.kind === 'dribble') s.drib++; if (pick.kind === 'pass') s.pass++; if (pick.kind === 'shot') { s.shots++; const D = Math.hypot(E.PITCH.HL * m.teams[0].dir - p.x, p.y); if (D > 20) s.far++; } };
    let wasRun = false, shot = null;
    while (m.mode !== 'over') {
      E.step(m);
      const run = P.intent.type === 'run'; if (run && !wasRun) s.runs++; wasRun = run;
      if (m.mode === 'play' && m.ball.owner && m.ball.owner.team === 0 && m.tick % 10 === 0) { s.xSum += P.x * m.teams[0].dir; s.xN++; }
    }
    s.goals += m.teams[0].score; s.ga += m.teams[1].score;
  }
  parentPort.postMessage(s);
} else {
  const P0 = E.createMatch({ seed: 1, duration: 60 }).teams[0].players[place];
  console.log('Place ' + place + ' (' + P0.poste + ') des Bleus, ' + n + ' matchs de 90 min par réglage, contre des Rouges standard. Valeurs par match.\n');
  const cfgs = [['neutre', {}]];
  for (const c of E.ORDERS) for (const v of [-1, 1]) cfgs.push([c.options[v + 1].toLowerCase(), { [c.key]: v }]);
  const cores = Math.max(1, os.cpus().length), seeds = Array.from({ length: n }, (_, i) => 100 + i);
  const run = ord => Promise.all(Array.from({ length: cores }, (_, k) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { ord, place, seeds: seeds.filter((_, i) => i % cores === k) } }); w.on('message', res); w.on('error', rej); })))
    .then(parts => parts.reduce((a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; }, {}));
  (async () => {
    const cols = ['réglage', 'ballons', 'conduites', 'passes', 'tirs', 'dont >20 m', 'appels', 'hauteur (ballon)', 'buts B – R'];
    console.log(cols.map((c, i) => i ? c.padStart(14) : c.padEnd(18)).join(''));
    for (const [name, ord] of cfgs) {
      const s = await run(ord), f = (x, k = 1) => (x / n).toFixed(k);
      console.log([name.padEnd(18), f(s.touch), f(s.drib), f(s.pass), f(s.shots, 2), f(s.far, 2), f(s.runs), (s.xSum / Math.max(1, s.xN)).toFixed(1) + ' m', f(s.goals, 2) + ' – ' + f(s.ga, 2)].map((x, i) => i ? String(x).padStart(14) : x).join(''));
    }
  })();
}
