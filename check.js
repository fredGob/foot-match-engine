// Vérifie que le moteur reste sain sur beaucoup de matchs : pas de valeur aberrante, pas de match qui se fige,
// et deux simulations de la même graine strictement identiques.
// Chaque graine est jouée trois fois : consignes neutres, puis consignes tirées au hasard avec un changement en cours de match,
// puis deux équipes du fichier equipes.json (niveaux différents ou clubs de Ligue 1) avec des consignes au hasard.
// Remplacements : au deuxième passage, les Bleus échangent deux joueurs et font entrer un remplaçant au premier arrêt de jeu après la mi-match ;
// au troisième, les deux équipes font leurs remplacements automatiques. On vérifie l'effectif (pas plus de cinq changements, personne en double).
// Usage : node check.js [nombre de matchs] [durée en secondes]
const E = require('./engine.js'), Eq = require('./equipes.js');
const n = +process.argv[2] || 100, duration = +process.argv[3] || 600, problems = [];
const bad = (seed, t, msg) => { if (problems.length < 20) problems.push(`graine ${seed} t=${t.toFixed(1)} : ${msg}`); };
// consignes au hasard, toujours les mêmes pour une graine donnée
function randomTactics(seed, salt) {
  let a = (seed * 2654435761 + salt * 40503) >>> 0; const t = {};
  for (const c of E.TACTICS) { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; t[c.key] = (a >>> 16) % 3 - 1; }
  return t;
}
function run(seed, watch, tactical, squads) {
  const teams = squads ? [Eq.list[seed % Eq.list.length], Eq.list[(seed * 7 + 3) % Eq.list.length]] : null;      // toutes les affiches reviennent, dans les deux sens
  const m = E.createMatch({ seed, duration, tactics: tactical ? [randomTactics(seed, 1), randomTactics(seed, 2)] : null, teams, autoSubs: squads ? [true, true] : null });
  const tag = seed + (squads ? ' (' + teams.map(T => T.nom).join(' contre ') + ')' : '') + (tactical ? ' (consignes ' + m.teams.map(T => E.TACTICS.map(c => T.tac[c.key]).join(',')).join(' / ') + ')' : '');
  let lastOwner = null, lastChange = 0, deadSince = 0, changed = false, swapped = !tactical || squads, sawDead = false;
  while (m.mode !== 'over') {
    if (tactical && !changed && m.t >= duration / 2) { changed = true; E.setTactics(m, 0, randomTactics(seed, 3)); E.setTactics(m, 1, randomTactics(seed, 4)); }
    if (!swapped && changed && m.mode === 'dead') {
      sawDead = true;
      const r = m.teams[0].players.map(p => p.rid), a = 1 + seed % 9, b = 1 + (seed * 5 + 2) % 9;
      if (a !== b) [r[a], r[b]] = [r[b], r[a]];
      r[1 + (seed * 3) % 10] = 11 + seed % 5;
      swapped = E.setLineup(m, 0, r);
    }
    E.step(m);
    if (!watch) continue;
    const b = m.ball;
    if (![b.x, b.y, b.z, b.vx, b.vy, b.vz].every(Number.isFinite)) { bad(tag, m.t, 'ballon : valeur non finie'); break; }
    if (Math.abs(b.x) > 58 || Math.abs(b.y) > 39) bad(tag, m.t, 'ballon très loin du terrain');
    for (const p of m.players) {
      if (![p.x, p.y, p.vx, p.vy, p.face, p.intent.tx, p.intent.ty].every(Number.isFinite)) { bad(tag, m.t, 'joueur n°' + p.num + ' : valeur non finie'); return m; }
      if (Math.hypot(p.vx, p.vy) > 10.5) bad(tag, m.t, 'joueur n°' + p.num + ' trop rapide');
    }
    if (b.owner !== lastOwner || m.mode === 'dead') { lastOwner = b.owner; lastChange = m.t; }
    if (m.t - lastChange > 25) { bad(tag, m.t, 'même situation depuis 25 s (' + (b.owner ? 'porteur n°' + b.owner.num + ' : ' + b.owner.intent.label : 'ballon libre') + ')'); lastChange = m.t; }
    if (m.mode === 'dead') { if (m.t - deadSince > 95) { bad(tag, m.t, 'arrêt de jeu interminable (' + m.restart.type + ')'); deadSince = m.t; } } else deadSince = m.t;
  }
  if (watch) for (const T of m.teams) {
    const on = T.players.map(p => p.rid);
    if (T.subs > E.MAX_SUBS || new Set(on).size !== 11 || on.some(r => T.roster[r].out) || T.players.some(p => p.name !== T.roster[p.rid].name)) bad(tag, m.t, 'effectif incohérent (' + T.name + ', ' + T.subs + ' changements)');
    if (tactical && !squads && T.id === 0 && !swapped && sawDead) bad(tag, m.t, 'le changement des Bleus n\'a jamais été fait');
    subsDone += T.subs;
  }
  return m;
}
let subsDone = 0;
const sig = m => m.teams.map(T => T.score + ':' + T.stats.passes + ':' + T.stats.shots).join('|') + '|' + m.players.map(p => p.x.toFixed(6)).join(',');
for (let i = 1; i <= n; i++) { run(i, true, false); run(i, true, true); run(i, true, true, true); }
if (sig(run(42, false, false)) !== sig(run(42, false, false))) problems.push('la même graine ne redonne pas le même match (consignes neutres)');
if (sig(run(42, false, true)) !== sig(run(42, false, true))) problems.push('la même graine ne redonne pas le même match (avec consignes)');
if (sig(run(42, false, true, true)) !== sig(run(42, false, true, true))) problems.push('la même graine ne redonne pas le même match (équipes du fichier)');
console.log(problems.length ? 'PROBLÈMES :\n' + problems.join('\n') : `OK : ${n} matchs neutres, ${n} avec consignes et ${n} entre équipes de niveaux différents sans anomalie, simulation reproductible ; ${subsDone} remplacements faits en tout`);
process.exit(problems.length ? 1 : 0);
