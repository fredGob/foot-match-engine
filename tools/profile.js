// Duel entre deux réglages, avec le profil dans le temps : occasions par demi-heure, fraîcheur par ligne, efforts.
// Usage : node tools/profile.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs de 90 min]
// Exemple : node tools/profile.js press=-1 "" 60      (Bleus en « attendre », Rouges neutres)
// Exemple : node tools/profile.js equipe=faible,press=-1,line=-1 equipe=elite 60      (l'équipe faible attend en bloc bas contre l'équipe élite)
// Les matchs sont répartis sur plusieurs cœurs : 60 matchs prennent une dizaine de secondes.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), os = require('os');
const E = require(path.join(__dirname, '..', 'engine.js')), Eq = require(path.join(__dirname, '..', 'equipes.js'));

if (!isMainThread) {
  const { tactics, seeds, ids } = workerData, teams = ids.map(id => id ? Eq.get(id) : null);
  const blank = () => ({ xg: [0, 0, 0], goals: 0, shots: 0, poss: 0, recov: 0, recovHigh: 0, fouls: 0, tackles: 0, wins: 0, stam: { DEF: 0, MID: 0, FWD: 0 }, low: 0, dist: 0, sprint: 0, pressT: 0 });
  const out = { teams: [blank(), blank()], draws: 0 };
  for (const seed of seeds) {
    const m = E.createMatch({ seed, duration: 5400, tactics, teams });
    let third = 0, mark = [0, 0];
    while (m.mode !== 'over') {
      E.step(m);
      for (let t = 0; t < 2; t++) for (const p of m.teams[t].players) { if (p.role === 'GK') continue; if (Math.hypot(p.vx, p.vy) > 6.2) out.teams[t].sprint += E.DT; if (p.intent.type === 'press') out.teams[t].pressT += E.DT; }
      if (third < 3 && (m.t >= (third + 1) * 1800 - 0.03 || m.mode === 'over')) { for (let t = 0; t < 2; t++) { out.teams[t].xg[third] += m.teams[t].stats.xg - mark[t]; mark[t] = m.teams[t].stats.xg; } third++; }
    }
    for (let t = 0; t < 2; t++) {
      const T = m.teams[t], S = T.stats, o = out.teams[t], f = T.players.filter(p => p.role !== 'GK');
      o.goals += S.goals; o.shots += S.shots; o.poss += S.possT; o.recov += S.recov; o.recovHigh += S.recovHigh; o.fouls += S.fouls; o.tackles += S.tackles;
      for (const r of ['DEF', 'MID', 'FWD']) { const g = f.filter(p => p.role === r); o.stam[r] += g.reduce((a, p) => a + p.stam, 0) / g.length; }
      o.low += Math.min(...f.map(p => p.stam)); o.dist += f.reduce((a, p) => a + p.dist, 0) / f.length;
    }
    const a = m.teams[0].score, b = m.teams[1].score;
    if (a > b) out.teams[0].wins++; else if (b > a) out.teams[1].wins++; else out.draws++;
  }
  parentPort.postMessage(out);
} else {
  const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])], tactics = sides.map(x => x.tactics), ids = sides.map(x => x.team && x.team.id), n = +process.argv[4] || 60;
  const nw = Math.max(1, Math.min(n, os.cpus().length - 2)), chunks = Array.from({ length: nw }, () => []);
  for (let i = 0; i < n; i++) chunks[i % nw].push(1000 + i);
  const run = seeds => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { tactics, seeds, ids } }); w.on('message', res); w.on('error', rej); });
  const sum = (a, b) => { for (const k in b) { if (typeof b[k] === 'number') a[k] = (a[k] || 0) + b[k]; else a[k] = sum(a[k] || (Array.isArray(b[k]) ? [] : {}), b[k]); } return a; };
  Promise.all(chunks.map(run)).then(parts => {
    const R = parts.reduce(sum, {}), A = R.teams[0], B = R.teams[1];
    const row = (label, f, dec, unit) => console.log(('  ' + label).padEnd(40) + (f(A, B).toFixed(dec) + (unit || '')).padStart(10) + (f(B, A).toFixed(dec) + (unit || '')).padStart(10));
    const all = S => (4 * S.stam.DEF + 4 * S.stam.MID + 2 * S.stam.FWD) / 10;
    console.log(`\nBleus (${Eq.name(sides[0])}) contre Rouges (${Eq.name(sides[1])}) — ${n} matchs de 90 min`);
    console.log(`Bilan des Bleus : ${A.wins} victoires, ${R.draws} nuls, ${B.wins} défaites\n`);
    console.log(' '.repeat(40) + 'Bleus'.padStart(10) + 'Rouges'.padStart(10));
    row('Buts', S => S.goals / n, 2); row('Tirs', S => S.shots / n, 1);
    row('Occasions (buts attendus)', S => (S.xg[0] + S.xg[1] + S.xg[2]) / n, 2);
    row('  de la 1re à la 30e minute', S => S.xg[0] / n, 2); row('  de la 30e à la 60e', S => S.xg[1] / n, 2); row('  de la 60e à la 90e', S => S.xg[2] / n, 2);
    row('Possession', (S, O) => 100 * S.poss / (S.poss + O.poss), 0, ' %');
    row('Ballons repris', S => S.recov / n, 1); row('  dont dans le camp adverse', S => S.recovHigh / n, 1);
    row('Tacles réussis', S => S.tackles / n, 1); row('Fautes', S => S.fouls / n, 1);
    row('Fraîcheur à la fin', S => 100 * all(S) / n, 0, ' %');
    row('  défenseurs', S => 100 * S.stam.DEF / n, 0, ' %'); row('  milieux', S => 100 * S.stam.MID / n, 0, ' %'); row('  attaquants', S => 100 * S.stam.FWD / n, 0, ' %');
    row('  joueur le plus fatigué', S => 100 * S.low / n, 0, ' %');
    row('Distance par joueur de champ', S => S.dist / n / 1000, 2, ' km');
    row('Sprint par joueur de champ', S => S.sprint / n / 10 / 60, 1, ' min'); row('Pressing par joueur de champ', S => S.pressT / n / 10 / 60, 1, ' min');
  });
}
