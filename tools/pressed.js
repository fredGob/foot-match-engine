// Porteur pressé : que fait un joueur de champ quand un adversaire est sur lui (pression > 0,5) ?
// Première décision prise sous pression après avoir reçu le ballon : conduire le ballon, passe en retrait, passe à plat ou vers l'avant, garder, dégager ; et perd-il le ballon dans les 3 secondes ?
// Classé selon sa note de « conduite sous pression » : moyenne de prise de balle, dribble et physique (vitesse et accélération).
// Usage : node tools/pressed.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [durée en secondes]
// Exemple : node tools/pressed.js equipe=elite equipe=faible 8
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])];
const n = +process.argv[4] || 8, duration = +process.argv[5] || 5400;
const KINDS = ['conduit', 'passe en retrait', 'passe à plat', 'passe vers l\'avant', 'garde', 'dégage', 'tire'];
const R = {};          // R[zone][bande] = { n, k: {choix: [n, perdus]} }
const band = q => { const r = Math.round(q * 20); return r <= 10 ? '10 et moins' : r <= 12 ? '11 et 12' : r <= 14 ? '13 et 14' : r <= 16 ? '15 et 16' : '17 et plus'; };
const BANDS = ['10 et moins', '11 et 12', '13 et 14', '15 et 16', '17 et plus'];
const kindOf = (p, o, d) => {
  if (o.kind === 'dribble') return 'conduit';
  if (o.kind === 'hold') return 'garde';
  if (o.kind === 'clear') return 'dégage';
  if (o.kind === 'shot') return 'tire';
  const f = ((o.qx != null ? o.qx : o.to ? o.to.x : p.x) - p.x) * d;
  return f < -3 ? 'passe en retrait' : f > 5 ? 'passe vers l\'avant' : 'passe à plat';
};
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  const open = [], seen = new Map();
  m.onChoice = (p, opts, pick, pr) => {
    if (pr < 0.5 || p.role === 'GK' || p.setPiece || p.hands || seen.get(p) === p.gotBallAt) return;
    seen.set(p, p.gotBallAt);      // une seule décision par ballon reçu : la première prise sous pression
    const d = m.teams[p.team].dir, zone = p.x * d < 0 ? 'dans son camp' : 'dans le camp adverse';
    const q = (p.a.firstTouch + p.a.dribbling + (p.a.pace + p.a.accel) / 2) / 3;
    open.push({ team: p.team, t: m.t, zone, b: band(q), k: kindOf(p, pick, d) });
  };
  while (m.mode !== 'over') {
    E.step(m);
    for (let j = open.length - 1; j >= 0; j--) {
      const e = open[j], o = m.ball.owner, lost = o && o.team !== e.team;
      if (!lost && m.t - e.t < 3 && m.mode === 'play') continue;
      open.splice(j, 1);
      const Z = R[e.zone] || (R[e.zone] = {}), B = Z[e.b] || (Z[e.b] = { n: 0, k: {} }), K = B.k[e.k] || (B.k[e.k] = [0, 0]);
      B.n++; K[0]++; if (lost) K[1]++;
    }
  }
}
const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
console.log(`\n${n} matchs — Bleus : ${Eq.name(sides[0])}, Rouges : ${Eq.name(sides[1])} (les deux équipes ensemble)`);
console.log('Première décision d\'un porteur pressé selon sa note de conduite (prise de balle, dribble, physique) ; entre parenthèses : ballon perdu dans les 3 s');
for (const zone of ['dans son camp', 'dans le camp adverse']) {
  if (!R[zone]) continue;
  console.log('\n' + zone[0].toUpperCase() + zone.slice(1) + ''.padEnd(10) + ['cas/match', ...KINDS].map(k => k.padStart(17)).join(''));
  for (const b of BANDS) {
    const B = R[zone][b]; if (!B) continue;
    console.log(('  ' + b).padEnd(23) + String((B.n / n).toFixed(0)).padStart(17) + KINDS.map(k => { const K = B.k[k]; return (K ? pct(K[0], B.n) + ' (' + pct(K[1], K[0]) + ')' : '–').padStart(17); }).join(''));
  }
}
