// Duels : le pressing et les tacles réussissent-ils mieux pour un joueur fort ?
// Un « pressing » commence quand un joueur sort sur le porteur adverse (intention « presser ») et arrive à moins de 3 m.
// Il se termine quand le porteur n'a plus le ballon : ballon repris par l'équipe qui presse, ou porteur sorti (passe, ballon gardé).
// Pour chaque équipe : pressings gagnés selon la note du presseur ; tacles réussis selon la note de tacle et le dribble du porteur.
// Usage : node tools/duels.js [réglages des Bleus] [réglages des Rouges] [nombre de matchs] [durée en secondes]
// Exemple : node tools/duels.js equipe=elite equipe=faible 12
const E = require('../engine.js'), Eq = require('../equipes.js');
const sides = [Eq.side(process.argv[2]), Eq.side(process.argv[3])];
const n = +process.argv[4] || 12, duration = +process.argv[5] || 5400;
const ROLE = { GK: 'Gardien', DEF: 'Défenseurs', MID: 'Milieux', FWD: 'Attaquants' };
const T = [0, 1].map(() => ({ press: {}, pressRole: {}, tackle: {}, tackleGap: {}, foul: 0, tries: 0, won: 0, pressN: 0, pressWon: 0, pressFoul: 0, pressT: 0 }));
const add = (o, k, ok) => { const r = o[k] || (o[k] = [0, 0]); r[0]++; if (ok) r[1]++; };
const band = v => { const r = Math.round(v * 20); return r <= 9 ? '9 et moins' : r <= 12 ? '10 à 12' : r <= 14 ? '13 et 14' : '15 et plus'; };
const BANDS = ['9 et moins', '10 à 12', '13 et 14', '15 et plus'];

for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 1 + i, duration, tactics: sides.map(s => s.tactics), teams: sides.map(s => s.team), formations: sides.map(s => s.formation) });
  const ready = new Map(); for (const p of m.players) ready.set(p, p.tackleReadyAt || 0);
  let ep = null;
  while (m.mode !== 'over') {
    const c0 = m.ball.owner, st = [0, 1].map(t => [m.teams[t].stats.tackles, m.teams[t].stats.fouls]);
    E.step(m);
    // tacles tentés pendant ce pas
    for (const p of m.players) {
      const r = p.tackleReadyAt || 0;
      if (r > ready.get(p) + 0.5 && c0 && c0.team !== p.team) {
        const S = T[p.team], won = m.teams[p.team].stats.tackles > st[p.team][0], foul = m.teams[p.team].stats.fouls > st[p.team][1];
        S.tries++; if (won) S.won++; if (foul) S.foul++;
        add(S.tackle, band(p.a.tackling), won);
        const gap = Math.round((p.a.tackling - c0.a.dribbling) * 20);
        add(S.tackleGap, gap <= -3 ? 'porteur meilleur de 3 et plus' : gap >= 3 ? 'tacleur meilleur de 3 et plus' : 'à peu près égaux', won);
      }
      ready.set(p, r);
    }
    // pressings
    const o = m.ball.owner;
    if (!ep && o && m.mode === 'play' && !o.setPiece && !o.hands) {
      const pr = m.teams[1 - o.team].players.find(q => q.intent.type === 'press' && Math.hypot(q.x - o.x, q.y - o.y) < 3);
      if (pr) ep = { c: o, by: pr, t0: m.t, fouls: m.teams[pr.team].stats.fouls };
    } else if (ep) {
      // le pressing se juge quand quelqu'un d'autre a le ballon (une passe en l'air n'est pas encore jugée), ou à l'arrêt de jeu
      const foul = m.teams[ep.by.team].stats.fouls > ep.fouls;
      if (foul || m.mode !== 'play' || (o && o !== ep.c)) {
        const S = T[ep.by.team], won = !foul && o && o.team === ep.by.team;
        S.pressN++; S.pressT += m.t - ep.t0; if (won) S.pressWon++; if (foul) S.pressFoul++;
        add(S.press, band(ep.by.a.tackling), won); add(S.pressRole, ROLE[ep.by.role], won);
        ep = null;
      }
    }
  }
}

const pct = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '–';
const col = s => String(s).padStart(24);
const row = (label, f) => console.log(('  ' + label).padEnd(40) + col(f(T[0])) + col(f(T[1])));
console.log(`\n${n} matchs de ${duration / 60} min — Bleus : ${Eq.name(sides[0])}, Rouges : ${Eq.name(sides[1])}\n`);
console.log(''.padEnd(40) + col('Bleus') + col('Rouges'));
console.log('Pressing (quand l\'équipe presse le porteur adverse)');
row('Pressings par match', S => (S.pressN / n).toFixed(0));
row('… ballon repris', S => pct(S.pressWon, S.pressN));
row('… faute', S => pct(S.pressFoul, S.pressN));
console.log('Pressings gagnés selon la note de tacle du presseur');
for (const b of BANDS) row(b, S => S.press[b] ? (S.press[b][0] / n).toFixed(0) + ' · ' + pct(S.press[b][1], S.press[b][0]) : '–');
console.log('Pressings gagnés selon le poste du presseur');
for (const k of ['Attaquants', 'Milieux', 'Défenseurs']) row(k, S => S.pressRole[k] ? (S.pressRole[k][0] / n).toFixed(0) + ' · ' + pct(S.pressRole[k][1], S.pressRole[k][0]) : '–');
console.log('Tacles');
row('Tacles tentés par match', S => (S.tries / n).toFixed(0));
row('… réussis', S => pct(S.won, S.tries));
row('… fautes', S => pct(S.foul, S.tries));
console.log('Tacles réussis selon la note de tacle');
for (const b of BANDS) row(b, S => S.tackle[b] ? (S.tackle[b][0] / n).toFixed(0) + ' · ' + pct(S.tackle[b][1], S.tackle[b][0]) : '–');
console.log('Tacles réussis selon l\'écart tacle du défenseur – dribble du porteur');
for (const k of ['porteur meilleur de 3 et plus', 'à peu près égaux', 'tacleur meilleur de 3 et plus']) row(k, S => S.tackleGap[k] ? (S.tackleGap[k][0] / n).toFixed(0) + ' · ' + pct(S.tackleGap[k][1], S.tackleGap[k][0]) : '–');
