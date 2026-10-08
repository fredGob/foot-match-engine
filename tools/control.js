// Prise de balle : combien de contrôles ratés, selon la pression et selon la note du joueur.
// Les Bleus reçoivent la note indiquée (sur 20) en prise de balle, les Rouges restent à 14.
// Usage : node tools/control.js [nombre de matchs de 90 min] [notes à comparer, ex. 8,14,18]
const E = require('../engine.js');
const n = +process.argv[2] || 20, levels = (process.argv[3] || '8,14,18').split(',').map(Number);
console.log(`\n${n} matchs de 90 min par ligne. Contrôles des Bleus (ballons qui leur reviennent : passes d'un partenaire, ballons libres).\n`);
console.log('note   contrôles   ratés/match   raté sans adversaire   raté gêné   raté pressé   contrôles orientés/match   ballons perdus sur tacle/match');
for (const lv of levels) {
  const c = {}; let lost = 0, mis = 0;
  for (let i = 0; i < n; i++) {
    const m = E.createMatch({ seed: 8000 + i, duration: 5400 });
    for (const p of m.teams[0].players) p.a.firstTouch = lv / 20;
    while (m.mode !== 'over') E.step(m);
    for (const k in m.count) if (k.startsWith('ctrl.0.')) c[k.slice(7)] = (c[k.slice(7)] || 0) + m.count[k];
    lost += m.teams[1].stats.tackles; mis += m.teams[0].stats.miscontrols;
  }
  const g = k => c[k] || 0, rate = z => { const t = g(z + '.ok') + g(z + '.rate'); return t ? (100 * g(z + '.rate') / t).toFixed(1).padStart(5) + ' %' : '    –'; };
  const tot = ['libre', 'gene', 'presse'].reduce((a, z) => a + g(z + '.ok') + g(z + '.rate'), 0);
  console.log(`${String(lv).padStart(3)}    ${(tot / n).toFixed(0).padStart(7)}     ${(mis / n).toFixed(1).padStart(7)}          ${rate('libre')}              ${rate('gene')}      ${rate('presse')}             ${(g('oriente') / n).toFixed(1).padStart(6)}                       ${(lost / n).toFixed(1).padStart(6)}`);
}
console.log('\nRepère du vrai football (de mémoire, non vérifié) : une équipe rate une quinzaine de contrôles par match.');
