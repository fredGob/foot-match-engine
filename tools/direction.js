// Consigne « Jeu de passes » : direction des passes des Bleus (en retrait, latérales, vers l'avant), transversales,
// passes vers les attaquants, longs ballons, et ce que ça donne (possession, tirs, occasions). Les Rouges restent neutres.
// Usage : node tools/direction.js [matchs par réglage] [autres consignes des Bleus, ex. line=1] [équipes, ex. equipe=elite equipe=moyen]
const E = require('../engine.js'), St = require('../stats.js'), Eq = require('../equipes.js');
const n = +process.argv[2] || 20, extra = process.argv[3] || '', sides = [Eq.side(process.argv[4] || ''), Eq.side(process.argv[5] || '')];
const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
for (const v of [-1, 0, 1]) {
  const c = { n: 0, ok: 0, back: 0, side: 0, fwd: 0, cross: 0, att: 0, attFwd: 0, long: 0, prog: 0 }, acc = St.create();
  for (let i = 0; i < n; i++) {
    const tb = Object.assign({}, Eq.side(extra).tactics, sides[0].tactics, { passing: v });
    const m = E.createMatch({ seed: 700 + i, duration: 5400, tactics: [tb, sides[1].tactics], teams: sides.map(s => s.team) });
    let last = null;
    while (m.mode !== 'over') {
      E.step(m);
      const q = m.pass;
      if (q && q !== last && q.kind === 'pass' && q.type !== 'tete' && q.from && q.from.team === 0 && q.aimX != null) {
        const p = q.from, d = m.teams[0].dir, fx = q.aimX - p.x * d, dy = q.to ? Math.abs(q.to.y - p.y) : 0, D = Math.hypot(fx, dy);
        c.n++;
        if (fx < -3) c.back++; else if (fx <= 5) c.side++; else c.fwd++;
        if (dy > 25 && Math.abs(fx) < 15) c.cross++;
        if (q.to && q.to.role === 'FWD') { c.att++; if (fx > 5) c.attFwd++; }
        if (D > 30) c.long++;
        c.prog += Math.max(0, fx);
      }
      last = q;
    }
    St.add(acc, m);
  }
  const r = St.rows(acc), g = l => { const x = r.find(y => y.label === l); return x.a + ' – ' + x.b; };
  console.log(['Court', 'Mixte', 'Direct'][v + 1] + ' (' + n + ' matchs de 90 min' + (extra ? ', ' + extra : '') + ')');
  console.log('  passes tentées ' + Math.round(c.n / n) + ' par match : en retrait ' + pct(c.back, c.n) + ', latérales ' + pct(c.side, c.n) + ', vers l\'avant ' + pct(c.fwd, c.n) + ' ; transversales ' + (c.cross / n).toFixed(1) + ' ; vers un attaquant ' + pct(c.att, c.n) + ' (dont vers l\'avant ' + pct(c.attFwd, c.n) + ') ; plus de 30 m ' + pct(c.long, c.n) + ' ; gain vers l\'avant ' + Math.round(c.prog / n) + ' m par match');
  console.log('  possession ' + g('Possession') + ', passes réussies ' + g('Passes réussies') + ', tirs ' + g('Tirs') + ', occasions ' + g('Buts attendus') + ', buts ' + g('Buts'));
}
