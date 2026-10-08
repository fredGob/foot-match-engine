// Coups francs à portée de tir : le mur est-il en place, que décide le tireur, et que devient le tir ?
// Usage : node tools/freekicks.js [nombre de demi-heures simulées]
const E = require('../engine.js');
const n = +process.argv[2] || 200; let walls = 0, shots = 0, out = {}, inPlace = 0, need = 0, snaps = [];
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 4000 + i, duration: 1800 }); let cur = null, ev = 0, wasWall = null;
  while (m.mode !== 'over') {
    const hadWall = m.wall, taker = m.ball.owner && m.ball.owner.setPiece === 'freekick' ? m.ball.owner : null, planned = taker && taker.plan;
    E.step(m);
    if (m.wall && m.wall !== wasWall) { walls++; wasWall = m.wall; }
    if (planned && !taker.plan && hadWall && m.pass) {          // le coup franc vient d'être joué
      const k = m.pass.kind === 'shot' ? 'tir' : m.pass.lofted ? 'centre / long ballon' : 'passe courte'; out[k] = (out[k] || 0) + 1;
      for (const id in hadWall.spots) { need++; const q = m.players[id]; if (Math.hypot(q.x - hadWall.spots[id][0], q.y - hadWall.spots[id][1]) < 1) inPlace++; }
      if (m.pass.kind === 'shot') { cur = { t0: m.t, d: Math.hypot(52.5 * m.teams[taker.team].dir - taker.x, taker.y), seed: m.seed }; shots++; if (snaps.length < 3) snaps.push(m.seed + ':' + (m.t - 0.5).toFixed(1)); }
    }
    for (; ev < m.events.length; ev++) { const e = m.events[ev]; if (cur && e.t >= cur.t0 && !cur.end) { let k = null; if (e.kind === 'goal') k = 'but'; else if (e.kind === 'save') k = 'arrêt du gardien'; else if (e.kind === 'block') k = /mur/.test(e.text) ? 'dans le mur' : 'contré'; else if (e.kind === 'shot') k = /au-dessus/.test(e.text) ? 'au-dessus' : 'à côté'; if (k) { cur.end = k; out['→ ' + k] = (out['→ ' + k] || 0) + 1; } } }
    if (cur && m.t - cur.t0 > 5) cur = null;
  }
}
console.log(`${n} demi-heures : ${walls} coups francs avec mur (${(walls / n * 3).toFixed(1)} par 90 min). Joueurs du mur en place au moment de la frappe : ${(100 * inPlace / need).toFixed(0)} %`);
for (const k of Object.keys(out).sort()) console.log('  ' + k.padEnd(24) + out[k] + (k[0] === '→' ? '  (' + (100 * out[k] / shots).toFixed(0) + ' % des tirs)' : ''));
console.log('exemples à regarder :', snaps.join('  '));
