// Les équipes du fichier equipes.json jouent toutes les unes contre les autres : est-ce que le niveau se voit ?
// Usage : node tools/levels.js [nombre de matchs par affiche] [équipes] [consignes de toutes les équipes]
// Exemple : node tools/levels.js 60            (60 matchs de 90 min par affiche, consignes neutres, les quatre équipes de niveau)
//           node tools/levels.js 20 psg,lens,lille,elite,moyen      (seulement ces équipes, séparées par des virgules)
//           node tools/levels.js 20 ligue1      (les dix clubs de Ligue 1, plus Élite et Moyen pour comparer)
//           node tools/levels.js 20 tout        (toutes les équipes du fichier : 14 équipes, 91 affiches, long)
// Par défaut, seulement les quatre équipes de niveau (élite, élevé, moyen, faible) : avec les quatorze équipes du fichier, le tournoi serait trop long.
// Chaque affiche est jouée moitié en Bleus, moitié en Rouges, pour que le côté ne compte pas.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path'), os = require('os');
const E = require(path.join(__dirname, '..', 'engine.js')), Eq = require(path.join(__dirname, '..', 'equipes.js'));
const KEYS = ['goals', 'shots', 'xg', 'possT', 'passes', 'passesOk', 'tackles', 'fouls', 'miscontrols', 'recov'];

if (!isMainThread) {
  const out = [];
  for (const job of workerData.jobs) {
    const m = E.createMatch({ seed: job.seed, duration: 5400, tactics: [workerData.tactics, workerData.tactics], teams: [Eq.get(job.a), Eq.get(job.b)] });
    while (m.mode !== 'over') E.step(m);
    const r = { a: job.a, b: job.b, score: m.teams.map(T => T.score), stats: m.teams.map(T => KEYS.map(k => T.stats[k])), fresh: m.teams.map(T => T.players.filter(p => p.role !== 'GK').reduce((s, p) => s + p.stam, 0) / 10) };
    out.push(r);
  }
  parentPort.postMessage(out);
} else {
  // 3e argument : la liste des équipes (s'il contient « = », ce sont les consignes, comme avant)
  let arg3 = process.argv[3] || '', arg4 = process.argv[4] || '';
  if (arg3.includes('=')) { arg4 = arg3; arg3 = ''; }
  const n = +process.argv[2] || 40, tactics = Eq.side(arg4).tactics;
  const L1 = Eq.list.filter(T => T.championnat).map(T => T.id), NIV = Eq.list.filter(T => !T.championnat).map(T => T.id);
  const ids = arg3 === 'tout' ? Eq.list.map(T => T.id) : arg3 === 'ligue1' ? L1.concat(['elite', 'moyen']) : arg3 ? arg3.split(',').map(id => Eq.get(id).id) : NIV;
  const jobs = [];
  for (const a of ids) for (const b of ids) for (let i = 0; i < (a === b ? n : Math.ceil(n / 2)); i++) jobs.push({ a, b, seed: 3000 + i });      // a en Bleus, b en Rouges
  const nw = Math.max(1, Math.min(jobs.length, os.cpus().length - 2)), chunks = Array.from({ length: nw }, () => []);
  jobs.forEach((j, i) => chunks[i % nw].push(j));
  const run = part => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: { jobs: part, tactics } }); w.on('message', res); w.on('error', rej); });
  Promise.all(chunks.map(run)).then(parts => {
    // pour chaque affiche « x contre y » : les matchs vus du côté de x, quel que soit son camp
    const duel = {};
    const cell = (x, y) => duel[x + '/' + y] || (duel[x + '/' + y] = { n: 0, w: 0, d: 0, l: 0, f: KEYS.map(() => 0), a: KEYS.map(() => 0), fresh: 0 });
    for (const r of parts.flat()) for (let t = 0; t < 2; t++) {
      if (r.a === r.b && t === 1) continue;                  // même équipe des deux côtés : on ne compte le match qu'une fois, vu des Bleus
      const x = t ? r.b : r.a, y = t ? r.a : r.b, c = cell(x, y), gf = r.score[t], ga = r.score[1 - t];
      c.n++; if (gf > ga) c.w++; else if (gf < ga) c.l++; else c.d++;
      KEYS.forEach((k, i) => { c.f[i] += r.stats[t][i]; c.a[i] += r.stats[1 - t][i]; }); c.fresh += r.fresh[t];
    }
    const nom = id => Eq.get(id).nom, col = (s, w) => String(s).padStart(w || 12), K = k => KEYS.indexOf(k);
    const tac = E.TACTICS.filter(c => tactics[c.key]).map(c => c.label.toLowerCase() + ' : ' + c.options[tactics[c.key] + 1].toLowerCase()).join(', ') || 'consignes neutres';
    console.log(`\n${n} matchs de 90 min par affiche, ${tac}. Chaque ligne se lit : l'équipe de gauche contre l'équipe de la colonne.\n`);
    const grid = (title, f) => {
      console.log(title);
      console.log(' '.repeat(14) + ids.map(y => col('c. ' + nom(y), 16)).join(''));
      for (const x of ids) console.log(('  ' + nom(x)).padEnd(14) + ids.map(y => col(f(cell(x, y), x === y), 16)).join(''));
      console.log('');
    };
    const pc = (v, n) => (100 * v / n).toFixed(0);
    grid('Victoires – nuls – défaites (en % des matchs)', c => pc(c.w, c.n) + ' – ' + pc(c.d, c.n) + ' – ' + pc(c.l, c.n));
    grid('Buts marqués – encaissés par match', c => (c.f[K('goals')] / c.n).toFixed(2) + ' – ' + (c.a[K('goals')] / c.n).toFixed(2));
    grid('Occasions (buts attendus) pour – contre', c => (c.f[K('xg')] / c.n).toFixed(2) + ' – ' + (c.a[K('xg')] / c.n).toFixed(2));
    grid('Tirs pour – contre', c => (c.f[K('shots')] / c.n).toFixed(1) + ' – ' + (c.a[K('shots')] / c.n).toFixed(1));
    grid('Possession', c => pc(c.f[K('possT')], c.f[K('possT')] + c.a[K('possT')]) + ' %');
    grid('Passes réussies', c => (100 * c.f[K('passesOk')] / c.f[K('passes')]).toFixed(1) + ' %');
    grid('Contrôles ratés par match', c => (c.f[K('miscontrols')] / c.n).toFixed(1));
    grid('Tacles réussis – fautes par match', c => (c.f[K('tackles')] / c.n).toFixed(1) + ' – ' + (c.f[K('fouls')] / c.n).toFixed(1));
    grid('Fraîcheur des joueurs à la fin', c => pc(c.fresh, c.n) + ' %');
    // classement : chaque équipe contre les trois autres
    console.log('Classement (chaque équipe contre toutes les autres)');
    const rank = ids.map(x => { const r = { x, n: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pf: 0, pa: 0 }; for (const y of ids) if (y !== x) { const c = cell(x, y); r.n += c.n; r.w += c.w; r.d += c.d; r.l += c.l; r.gf += c.f[K('goals')]; r.ga += c.a[K('goals')]; r.pf += c.f[K('possT')]; r.pa += c.a[K('possT')]; } return r; });
    rank.sort((p, q) => (3 * q.w + q.d) / q.n - (3 * p.w + p.d) / p.n);
    for (const r of rank) console.log(('  ' + nom(r.x)).padEnd(14) + col(((3 * r.w + r.d) / r.n).toFixed(2) + ' point par match', 22) + col(pc(r.w, r.n) + ' % de victoires', 22) + col('buts ' + (r.gf / r.n).toFixed(2) + ' – ' + (r.ga / r.n).toFixed(2), 20) + col('possession ' + pc(r.pf, r.pf + r.pa) + ' %', 18));
  });
}
