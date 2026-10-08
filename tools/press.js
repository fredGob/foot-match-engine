// Pressing : que devient un porteur bleu pressé par les Rouges, et que se passe-t-il quand le pressing est battu ?
// Usage : node tools/press.js [consignes des Rouges] [nombre de matchs de 90 min] [consignes des Bleus]
// Exemple : node tools/press.js press=1 20        (Rouges en « harceler », Bleus neutres)
//
// Un « épisode » commence quand un Bleu a le ballon avec un Rouge qui le presse à moins de 4 m. Il se termine par :
//   - sorti proprement : passe réussie vers un partenaire ;  « pressing battu » si le ballon arrive plus haut que tous les Rouges qui pressaient
//   - ballon perdu : tacle, contrôle raté, passe interceptée, sortie
// Pour chaque issue, on regarde les 10 secondes suivantes : y a-t-il un tir, et pour qui ?
const E = require('../engine.js');
const parse = s => { const t = {}; for (const kv of (s || '').split(',')) { const [k, v] = kv.split('='); if (k) t[k] = +v; } return t; };
const red = parse(process.argv[2]), n = +process.argv[3] || 20, blue = parse(process.argv[4]);
const R = { ep: 0, out: 0, beaten: 0, lost: 0, lostOwnHalf: 0, shotAfterBeaten: 0, xgAfterBeaten: 0, shotAfterLost: 0, xgAfterLost: 0, pressers: 0, behind: 0, behindN: 0, epX: 0 };
let stam = 0, stamLo = 0, dist = 0, sprint = 0, shotsB = 0, shotsR = 0, xgB = 0, xgR = 0;
const per = [[0, 0], [0, 0], [0, 0]];                    // occasions (buts attendus) par demi-heure : [Bleus, Rouges]
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 9000 + i, duration: 5400, tactics: [blue, red] });
  let ep = null, watch = [], mark = [0, 0], third = 0;
  while (m.mode !== 'over') {
    E.step(m);
    if (m.t >= (third + 1) * 1800 - 0.03 || m.mode === 'over') { if (third < 3) { per[third][0] += m.teams[0].stats.xg - mark[0]; per[third][1] += m.teams[1].stats.xg - mark[1]; mark = [m.teams[0].stats.xg, m.teams[1].stats.xg]; third++; } }
    const o = m.ball.owner, B = m.teams[0], Rd = m.teams[1];
    for (const p of Rd.players) if (Math.hypot(p.vx, p.vy) > 6.5) sprint += E.DT;
    // épisode en cours
    if (!ep && o && o.team === 0 && m.mode === 'play' && !o.setPiece && !o.hands) {
      const pr = Rd.players.filter(q => q.intent.type === 'press' && Math.hypot(q.x - o.x, q.y - o.y) < 4);
      if (pr.length) { ep = { p: o, t0: m.t, front: Math.max(...pr.map(q => q.x)), n: pr.length, x: o.x }; R.ep++; R.pressers += pr.length; R.epX += o.x; }
    } else if (ep) {
      let end = null;
      if (m.mode === 'dead') end = 'lost';
      else if (o && o.team === 1) end = 'lost';
      else if (o && o.team === 0 && o !== ep.p) end = o.x > ep.front + 3 ? 'beaten' : 'out';       // les Bleus attaquent vers +x : « plus haut » = x plus grand
      else if (m.t - ep.t0 > 6) end = 'none';
      if (end) {
        if (end === 'lost') { R.lost++; if (ep.x < 0) R.lostOwnHalf++; watch.push({ kind: 'lost', until: m.t + 10, s: Rd.stats.shots, xg: Rd.stats.xg }); }
        else if (end !== 'none') { R.out++; if (end === 'beaten') { R.beaten++; let nb = 0; for (const q of Rd.players) if (q.role !== 'GK' && q.x > o.x + 1) nb++; R.behind += nb; R.behindN++; watch.push({ kind: 'beaten', until: m.t + 10, s: B.stats.shots, xg: B.stats.xg }); } }
        ep = null;
      }
    }
    watch = watch.filter(w => { if (m.t < w.until) return true; const S = (w.kind === 'lost' ? Rd : B).stats; if (S.shots > w.s) { if (w.kind === 'lost') { R.shotAfterLost++; R.xgAfterLost += S.xg - w.xg; } else { R.shotAfterBeaten++; R.xgAfterBeaten += S.xg - w.xg; } } return false; });
  }
  const f = m.teams[1].players.filter(p => p.role !== 'GK');
  stam += f.reduce((a, p) => a + p.stam, 0) / f.length; stamLo += Math.min(...f.map(p => p.stam)); dist += f.reduce((a, p) => a + p.dist, 0) / f.length;
  shotsB += m.teams[0].stats.shots; shotsR += m.teams[1].stats.shots; xgB += m.teams[0].stats.xg; xgR += m.teams[1].stats.xg;
}
const pm = v => (v / n).toFixed(1), pc = (a, b) => b ? (100 * a / b).toFixed(0) + ' %' : '–';
const name = t => E.TACTICS.filter(c => t[c.key]).map(c => c.label + ' : ' + c.options[t[c.key] + 1].toLowerCase()).join(', ') || 'neutres';
console.log(`\nRouges (${name(red)}) contre Bleus (${name(blue)}) — ${n} matchs de 90 min\n`);
console.log(`Porteur bleu pressé à moins de 4 m : ${pm(R.ep)} fois par match (${(R.pressers / R.ep).toFixed(2)} Rouge(s) sur lui en moyenne)`);
console.log(`  il s'en sort par une passe        ${pc(R.out, R.ep).padStart(5)}   dont pressing battu (ballon arrivé plus haut que les presseurs) : ${pm(R.beaten)} par match`);
console.log(`  il perd le ballon                 ${pc(R.lost, R.ep).padStart(5)}   soit ${pm(R.lost)} par match, dont ${pm(R.lostOwnHalf)} dans le camp bleu`);
console.log(`Après un pressing battu : les Bleus tirent dans les 10 s ${pc(R.shotAfterBeaten, R.beaten)} du temps (occasions : ${(R.xgAfterBeaten / n).toFixed(2)} par match) ; il reste ${(R.behind / Math.max(1, R.behindN)).toFixed(1)} Rouges entre le ballon et leur but`);
console.log(`Après un ballon gagné   : les Rouges tirent dans les 10 s ${pc(R.shotAfterLost, R.lost)} du temps (occasions : ${(R.xgAfterLost / n).toFixed(2)} par match)`);
console.log(`Match entier : tirs Bleus ${pm(shotsB)} (occasions ${(xgB / n).toFixed(2)}), tirs Rouges ${pm(shotsR)} (occasions ${(xgR / n).toFixed(2)})`);
console.log('Occasions par demi-heure (Bleus / Rouges) : ' + per.map((q, i) => `${i * 30}-${i * 30 + 30} min : ${(q[0] / n).toFixed(2)} / ${(q[1] / n).toFixed(2)}`).join('   '));
console.log(`Coût pour les Rouges : fraîcheur finale ${(100 * stam / n).toFixed(0)} % (le plus fatigué ${(100 * stamLo / n).toFixed(0)} %), ${(dist / n / 1000).toFixed(2)} km par joueur, ${(sprint / n / 10).toFixed(0)} s de sprint par joueur`);
