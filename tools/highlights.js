// Temps forts : combien de temps un match se lit à vitesse normale, et combien de temps dure la lecture entière
// avec les temps faibles en accéléré (×8) et les arrêts de jeu passés vite (×6).
// Usage : node tools/highlights.js [matchs] [équipe des Bleus] [équipe des Rouges]   (ex. : node tools/highlights.js 10 equipe=elite equipe=faible)
const E = require('../engine.js'), St = require('../stats.js'), Eq = require('../equipes.js');
const n = +process.argv[2] || 10, sides = [Eq.side(process.argv[3]), Eq.side(process.argv[4])];
const FAST = 8, DEAD = 6;
let hot = 0, play = 0, watch = 0, parts = 0, shotsIn = 0, shots = 0, all = 0;
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 500 + i, duration: 5400, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  const X = [], T = [], D = [];
  const rec = () => { X.push(m.ball.x); T.push(m.ball.owner ? m.ball.owner.team : -1); D.push(m.mode === 'dead' ? 1 : 0); };
  rec(); while (m.mode !== 'over') { E.step(m); rec(); }
  const H = St.highlights({ n: X.length, DT: E.DT, x: f => X[f], team: f => T[f], dir: m.teams.map(t => t.dir), HL: E.PITCH.HL, events: m.events });
  for (let f = 0; f < X.length; f++) {
    const dt = E.DT; all += dt;
    if (!D[f]) play += dt;
    if (H.on[f] && !D[f]) hot += dt;
    watch += dt / (H.on[f] ? (D[f] ? DEAD : 1) : Math.max(FAST, D[f] ? DEAD : 1));
  }
  parts += H.parts.length;
  for (const e of m.events) if (e.kind === 'shot' || e.kind === 'save' || e.kind === 'block' || e.kind === 'goal') { shots++; if (H.on[Math.round(e.t / E.DT)]) shotsIn++; }
}
const mn = s => (s / 60 / n).toFixed(1).replace('.', ',');
console.log(n + ' matchs de 90 min');
console.log('  ballon en jeu : ' + mn(play) + ' min par match, dont ' + mn(hot) + ' min de temps forts (' + Math.round(100 * hot / play) + ' %)');
console.log('  temps forts : ' + (parts / n).toFixed(1).replace('.', ',') + ' par match, ' + (hot / parts).toFixed(0) + ' s en moyenne');
console.log('  tirs dans un temps fort : ' + shotsIn + ' sur ' + shots);
console.log('  durée de la lecture à ×1 (temps faibles ×' + FAST + ', arrêts de jeu ×' + DEAD + ') : ' + mn(watch) + ' min (sans accéléré des temps faibles : ' + mn(play + (all - play) / DEAD) + ' min)');
