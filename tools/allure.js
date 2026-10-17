// Réalisme des déplacements (n° 134, remarques de Frédéric : « des défenseurs marchent par moment alors qu'il faut défendre » ;
// « des joueurs passent à côté du ballon sans le toucher »).
// 1) Défenseurs qui marchent : l'adversaire a le ballon (en jeu) et avance vers notre but, ou le ballon est libre dans notre moitié.
//    Pour chaque joueur de champ de l'équipe qui défend, plus près de son but que le ballon (donc « derrière le ballon ») ou à moins de 30 m de lui :
//    marche-t-il (moins de 2 m/s) ? Que fait-il (intention), est-il loin de là où il veut aller, ce point s'éloigne-t-il de lui ?
// 2) Ballon frôlé : un ballon libre (sans porteur), bas (moins de 1 m), passe à moins de 1,5 m d'un joueur, qui ne le touche pas.
//    Pourquoi : trop loin pour la portée du moteur, joueur « sonné » ou qui vient de toucher, ou un autre l'a pris.
// Usage : node tools/allure.js [camp bleu] [camp rouge] [matchs]       ex. node tools/allure.js equipe=psg equipe=lyon 6
const E = require('../engine.js'), Q = require('../equipes.js');
const args = process.argv.slice(2), n = +(args.find(a => /^\d+$/.test(a)) || 6), sides = [0, 1].map(k => Q.side(args.filter(a => !/^\d+$/.test(a))[k]));
const W = { n: 0, walk: 0, walkFar: 0, why: {}, lag: 0, lagN: 0 };      // défenseurs qui marchent
const F = { pass: 0, by: {}, dd: {}, intent: {} };                         // ballons frôlés
const pct = (a, b) => (100 * a / Math.max(1, b)).toFixed(1) + ' %';
let minutes = 0;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 700 + i, duration: 5400, teams: sides.map(s => s.team), tactics: sides.map(s => s.tactics), formations: sides.map(s => s.formation) });
  const prevT = {};      // où chaque joueur voulait aller au pas précédent (pour savoir si ce point s'éloigne)
  let watch = [];        // ballons frôlés en attente : on regarde s'il touche le ballon dans les 0,3 s
  while (m.mode !== 'over') {
    const b = m.ball, lastBefore = b.lastTouch;
    E.step(m);
    if (m.mode !== 'play') { watch = []; continue; }
    minutes += E.DT / 60 / n;
    // --- 1) défenseurs qui marchent (un pas sur cinq) ---
    if (m.tick % 5 === 0) {
      const o = b.owner;
      for (const D of m.teams) {
        const own = -D.dir * E.PITCH.HL, attacking = o ? o.team !== D.id && (o.vx * -D.dir) > 1.5 : !o && (b.vx * -D.dir) > 3 && b.x * -D.dir > 0;
        if (!attacking) continue;
        const dB = Math.hypot(b.x - own, b.y);
        for (const p of D.players) {
          if (p.role === 'GK') continue;
          const dp = Math.hypot(p.x - own, p.y), near = Math.hypot(p.x - b.x, p.y - b.y) < 30;
          if (!(dp < dB + 5 || near)) continue;
          const v = Math.hypot(p.vx, p.vy), it = p.intent, toT = Math.hypot(it.tx - p.x, it.ty - p.y);
          W.n++;
          if (v < 2) {
            W.walk++;
            const pt = prevT[p.id], away = pt ? (Math.hypot(it.tx - p.x, it.ty - p.y) - Math.hypot(pt[0] - p.x, pt[1] - p.y)) / (5 * E.DT) : 0;
            if (toT > 2) W.walkFar++;
            const key = it.type + ' · ' + (it.label || '').replace(/ ?(le |du |au )?n°\d+/, '').trim();
            const w = W.why[key] || (W.why[key] = { k: 0, far: 0, away: 0 }); w.k++; if (toT > 2) w.far++; if (away > 1) w.away++;
          }
          W.lag += toT; W.lagN++;
        }
      }
      for (const p of m.players) prevT[p.id] = [p.intent.tx, p.intent.ty];
    }
    // --- 2) ballon frôlé ---
    if (!b.owner && b.z < 1) {
      const sx = b.x - b.px, sy = b.y - b.py, L2 = sx * sx + sy * sy;
      for (const p of m.players) {
        const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - b.px) * sx + (p.y - b.py) * sy) / L2)) : 0;
        const dd = Math.hypot(p.x - b.px - sx * u, p.y - b.py - sy * u);
        if (dd < 1.5 && p !== b.lastTouch && !watch.some(w => w.p === p)) watch.push({ p, t: m.t, dd, sp: Math.sqrt(L2) / E.DT, why: p.stunUntil > m.t ? 'sonné (tacle raté, duel perdu)' : p.noControlUntil > m.t ? 'vient de toucher le ballon' : null, it: p.intent.type });
      }
    }
    const touched = b.lastTouch !== lastBefore || b.owner;
    watch = watch.filter(w => {
      if (touched && (b.lastTouch === w.p || b.owner === w.p)) return false;
      if (m.t - w.t < 0.3) return true;
      F.pass++;
      const why = w.why || (touched ? 'un autre joueur l\'a pris' : w.dd > 0.85 ? 'hors de portée (0,85 m)' : w.sp > 15 ? 'ballon rapide, portée 0,65 m' : 'à portée mais pas touché');
      F.by[why] = (F.by[why] || 0) + 1;
      const band = w.dd < 0.65 ? '< 0,65 m' : w.dd < 0.85 ? '0,65 à 0,85 m' : w.dd < 1.2 ? '0,85 à 1,2 m' : '1,2 à 1,5 m';
      F.dd[band] = (F.dd[band] || 0) + 1;
      if (!w.why && !touched) F.intent[w.it] = (F.intent[w.it] || 0) + 1;
      return false;
    });
  }
}
console.log(n + ' matchs de 90 minutes · ' + (sides[0].label || 'standard') + ' contre ' + (sides[1].label || 'standard'));
console.log('\n1) Quand l\'adversaire attaque : joueurs de champ derrière le ballon ou à moins de 30 m');
console.log('   marchent (< 2 m/s) : ' + pct(W.walk, W.n) + ' du temps, dont loin (> 2 m) de là où ils veulent aller : ' + pct(W.walkFar, W.n));
console.log('   écart moyen entre un défenseur et sa cible : ' + (W.lag / W.lagN).toFixed(1) + ' m');
console.log('   ce que font ceux qui marchent (part du temps de marche ; loin de la cible ; cible qui s\'éloigne) :');
Object.entries(W.why).sort((a, b) => b[1].k - a[1].k).slice(0, 12).forEach(([k, w]) => console.log('     ' + pct(w.k, W.walk).padStart(7) + '  ' + k + '  (loin ' + pct(w.far, w.k) + ', cible qui s\'éloigne ' + pct(w.away, w.k) + ')'));
console.log('\n2) Ballons libres et bas passés à moins de 1,5 m d\'un joueur sans qu\'il le touche : ' + (F.pass / n).toFixed(0) + ' par match');
Object.entries(F.by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('     ' + pct(v, F.pass).padStart(7) + '  ' + k));
console.log('   distance au ballon :'); Object.entries(F.dd).sort().forEach(([k, v]) => console.log('     ' + pct(v, F.pass).padStart(7) + '  ' + k));
console.log('   ce que faisait le joueur (ballon passé sans raison, personne ne l\'a pris) :'); Object.entries(F.intent).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log('     ' + String(v).padStart(6) + '  ' + k));
