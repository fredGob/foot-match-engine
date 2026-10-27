// Échappées : un porteur a dépassé tous les joueurs de champ adverses (il ne reste que le gardien) à moins de 35 m du but.
// Que fait-il (tir, passe, ballon perdu, et où) ? Combien d'adversaires lui courent après, et avec quelle intention ?
// Et pourquoi ne tire-t-il pas : à chaque décision, ce que vaut le tir comparé à la conduite du ballon.
// Usage : node tools/echappee.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [axe | strict] [distance maximale au but, 35 m par défaut]
// « axe » : définition large, chemin du but ouvert (personne dans le couloir vers le but) même avec un défenseur à côté
// Exemple : node tools/echappee.js "" "" 20      node tools/echappee.js equipe=psg equipe=lyon 20
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])], n = +process.argv[4] || 20, AXE = process.argv[5] === 'axe', DMAX = +process.argv[6] || 35;      // « axe » : chemin du but ouvert (personne dans le couloir vers le but), même avec un défenseur à côté
const add = (o, k, v) => { o[k] = (o[k] || 0) + (v == null ? 1 : v); };
const R = { ep: 0, end: {}, d0: 0, d1: 0, dur: 0, shotD: [], chase: {}, chaseMax: {}, labels: {}, dec: 0, decShot: 0, picks: {}, gap: [], uShot: 0, uDrib: 0, uN: 0, gkD: [], goals: 0 };
let ep = null;
function close(m, how) {
  const e = ep; ep = null;
  R.ep++; add(R.end, how); R.d0 += e.d0; R.d1 += e.dLast; R.dur += m.t - e.t0;
  add(R.chaseMax, Math.min(e.maxChase, 4) + (e.maxChase >= 4 ? ' et plus' : ''));
  if (how === 'tir') R.shotD.push(e.dLast);
}
for (let s = 1; s <= n; s++) {
  const m = E.createMatch({ seed: s, duration: 5400, tactics: sides.map(x => x.tactics), teams: sides.map(x => x.team), formations: sides.map(x => x.formation) });
  m.onChoice = (p, opts, pick, pr) => {
    if (!ep || p !== ep.c) return;
    let sh = null, dr = null;
    for (const o of opts) { if (o.kind === 'shot') sh = o; else if (o.kind === 'dribble' && (!dr || o.u > dr.u)) dr = o; }
    R.dec++; add(R.picks, pick.kind);
    if (sh && dr) { R.uShot += sh.u; R.uDrib += dr.u; R.uN++; if (pick.kind === 'shot') R.decShot++; }
  };
  let shots0 = 0, owner = null;
  while (m.mode !== 'over') {
    E.step(m);
    const c = m.ball.owner;
    if (ep) {
      const e = ep, T = m.teams[1 - e.c.team];
      if (m.shot && m.shot.by === e.c && m.shot.t0 >= e.t0) { close(m, 'tir'); continue; }
      if (m.mode !== 'play') { close(m, 'arrêt de jeu (faute, sortie)'); continue; }
      if (c && c !== e.c) { close(m, c.team === e.c.team ? 'passe à un coéquipier' : c.role === 'GK' ? 'pris par le gardien' : 'repris par un défenseur'); continue; }
      if (!c && m.pass && m.pass.from === e.c) { close(m, 'passe à un coéquipier'); continue; }
      if (!c) { if (m.t - e.lastOwn > 0.6) close(m, 'ballon perdu (contrôle, tacle)'); continue; }
      e.lastOwn = m.t;
      const gx = -52.5 * T.dir; e.dLast = Math.hypot(gx - e.c.x, e.c.y);
      if (m.tick % 4 === 0) {
        let k = 0;
        for (const q of T.players) {
          if (q.role === 'GK') continue;
          const dq = Math.hypot(q.x - e.c.x, q.y - e.c.y);
          if (dq < 10 && q.intent.type === 'press') { k++; add(R.labels, q.intent.label.replace(/n°\d+/g, 'n°…')); }
        }
        add(R.chase, Math.min(k, 4)); e.maxChase = Math.max(e.maxChase, k);
        const gk = T.players[0]; R.gkD.push(Math.hypot(gk.x - e.c.x, gk.y - e.c.y));
      }
      continue;
    }
    if (!c || m.mode !== 'play' || c.setPiece || m.tick % 2) continue;
    const T = m.teams[1 - c.team], gx = -52.5 * T.dir, D = Math.hypot(gx - c.x, c.y);
    if (D > DMAX) continue;
    const ux = (gx - c.x) / D, uy = -c.y / D;
    if (AXE) { if (T.players.some(q => { if (q.role === 'GK') return false; const a = (q.x - c.x) * ux + (q.y - c.y) * uy; return a > 0.3 && a < Math.min(14, D) && Math.abs((q.x - c.x) * uy - (q.y - c.y) * ux) < 1.5 + 0.25 * a; })) continue; }
    else if (T.players.some(q => q.role !== 'GK' && (q.x - c.x) * ux + (q.y - c.y) * uy > 0.5)) continue;      // un défenseur encore devant lui
    ep = { c, t0: m.t, d0: D, dLast: D, maxChase: 0, lastOwn: m.t };
  }
  ep = null;
}
const pct = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '–';
const tot = o => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`\n${n} matchs de 90 min — Bleus : ${Eq.name(sides[0])}, Rouges : ${Eq.name(sides[1])}`);
console.log(`${AXE ? 'Chemin du but ouvert (personne dans le couloir), à moins de ' + DMAX + ' m' : 'Échappées (porteur seul devant le gardien, à moins de ' + DMAX + ' m)'} : ${R.ep} (${(R.ep / n).toFixed(1)} par match), départ à ${(R.d0 / R.ep).toFixed(1)} m du but en moyenne, durée ${(R.dur / R.ep).toFixed(1)} s`);
console.log('Comment elles finissent');
for (const [k, v] of Object.entries(R.end).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(40) + pct(v, R.ep));
const sd = R.shotD.sort((a, b) => a - b);
if (sd.length) console.log(`Distance du tir : médiane ${sd[sd.length >> 1].toFixed(1)} m (de ${sd[0].toFixed(1)} à ${sd[sd.length - 1].toFixed(1)})`);
console.log(`Distance au but à la fin de l'échappée : ${(R.d1 / R.ep).toFixed(1)} m en moyenne`);
const gk = R.gkD.sort((a, b) => a - b); if (gk.length) console.log(`Gardien à ${gk[gk.length >> 1].toFixed(1)} m du porteur (médiane)`);
console.log('Adversaires qui pressent le porteur (à moins de 10 m), part du temps');
for (const [k, v] of Object.entries(R.chase).sort()) console.log('  ' + (k + (k === '4' ? ' et plus' : '')).padEnd(40) + pct(v, tot(R.chase)));
console.log('Le plus grand nombre de presseurs pendant l\'échappée');
for (const [k, v] of Object.entries(R.chaseMax).sort()) console.log('  ' + k.padEnd(40) + pct(v, R.ep));
console.log('Pourquoi ils pressent (intention affichée)');
for (const [k, v] of Object.entries(R.labels).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('  ' + k.padEnd(40) + pct(v, tot(R.labels)));
console.log(`Décisions du porteur pendant l'échappée : ${R.dec}`);
for (const [k, v] of Object.entries(R.picks).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(40) + pct(v, R.dec));
if (R.uN) console.log(`Valeur moyenne : tir ${(R.uShot / R.uN).toFixed(3)}, meilleure conduite ${(R.uDrib / R.uN).toFixed(3)} (tir choisi ${pct(R.decShot, R.uN)} des fois où il pouvait tirer)`);
