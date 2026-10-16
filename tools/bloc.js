// Le bloc qui défend : quand l'adversaire a le ballon (en jeu), combien de défenseurs sont près du ballon, et quelle forme a l'équipe
// (largeur, profondeur, joueurs restés de l'autre côté). Pour juger le « match de poussins » (tout le monde va au ballon).
// Usage : node tools/bloc.js [camp bleu] [camp rouge] [matchs]     ex. node tools/bloc.js equipe=psg equipe=lyon 6
const E = require('../engine.js'), Q = require('../equipes.js');
const args = process.argv.slice(2), n = +(args.find(a => /^\d+$/.test(a)) || 6), sides = [0, 1].map(k => Q.side(args.filter(a => !/^\d+$/.test(a))[k]));
const zones = ['près de son but (< 35 m)', 'milieu', 'loin de son but (> 70 m)'];
const loose = [0, 0, 0, 0], lines = zones.map(() => ({ k: 0, dsd: 0, msd: 0, gap: 0, mark: 0 })), why = {}, nPress = zones.map(() => [0, 0, 0, 0]), out = zones.map(() => ({ k: 0, n: 0 }));
const acc = zones.map(() => ({ k: 0, r5: 0, r10: 0, r15: 0, r20: 0, width: 0, depth: 0, far: 0, behind: 0, near: 0 }));
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 500 + i, duration: 5400, teams: sides.map(s => s.team), tactics: sides.map(s => s.tactics), formations: sides.map(s => s.formation) });
  while (m.mode !== 'over') {
    E.step(m);
    const o = m.ball.owner;
    if (m.mode === 'play' && !o && m.tick % 10 === 0) {      // ballon libre : combien de joueurs de chaque équipe y vont
      for (const T of m.teams) { const c = T.players.filter(p => /chase|press|claim|receive/.test(p.intent.type)).length; loose[Math.min(3, c)]++; }
    }
    if (!o || m.mode !== 'play' || m.tick % 10) continue;
    const D = m.teams[1 - o.team], b = m.ball, own = D.dir * -1;      // own : côté de son but (x = own × 52,5)
    const dGoal = Math.abs(b.x - own * E.PITCH.HL), z = dGoal < 35 ? 0 : dGoal > 70 ? 2 : 1, A = acc[z];
    const P = D.players.filter(p => p.role !== 'GK'), d = P.map(p => Math.hypot(p.x - b.x, p.y - b.y));
    A.k++; A.r5 += d.filter(x => x < 5).length; A.r10 += d.filter(x => x < 10).length; A.r15 += d.filter(x => x < 15).length; A.r20 += d.filter(x => x < 20).length;
    const ys = P.map(p => p.y), xs = P.map(p => p.x);
    A.width += Math.max(...ys) - Math.min(...ys); A.depth += Math.max(...xs) - Math.min(...xs);
    A.far += P.filter(p => Math.abs(p.y - b.y) > 25).length;                       // restés de l'autre côté du terrain
    const gx = own * E.PITCH.HL, dB = Math.hypot(b.x - gx, b.y); A.behind += P.filter(p => Math.hypot(p.x - gx, p.y) < dB).length;      // plus près de son but que le ballon
    A.near += Math.min(...d);
    // qui sort sur le porteur (ou va au ballon), et pourquoi
    const pr = D.players.filter(p => p.intent.type === 'press' || p.intent.type === 'chase');
    nPress[z][Math.min(3, pr.length)]++;
    for (const p of pr) { const key = (p.intent.label || '').replace(/ ?(le |du |au )?n°\d+/, '').replace(/ face au$/, '') + ' (' + p.role + ')'; why[key] = (why[key] || 0) + 1; }
    // les lignes : défenseurs et milieux qui ne sortent pas sur le porteur ; écart en profondeur dans chaque ligne, écart entre les deux lignes
    const sd = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return { mu, sd: Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / a.length) }; };
    const dl = D.players.filter(p => p.role === 'DEF' && p.intent.type !== 'press').map(p => p.x), ml = D.players.filter(p => p.role === 'MID' && p.intent.type !== 'press').map(p => p.x);
    if (dl.length > 1 && ml.length > 1) { const a = sd(dl), c = sd(ml), L = lines[z]; L.k++; L.dsd += a.sd; L.msd += c.sd; L.gap += (c.mu - a.mu) * -own; }
    lines[z].mark += D.players.filter(p => /^(Marque|Suit)/.test(p.intent.label || '')).length;
    // défenseurs sortis : un défenseur à plus de 8 m devant la ligne des autres défenseurs
    const defs = D.players.filter(p => p.role === 'DEF');
    for (const p of defs) { const others = defs.filter(q => q !== p), line = others.reduce((s, q) => s + q.x, 0) / others.length; out[z].k++; if ((line - p.x) * own > 8) out[z].n++; }
  }
}
console.log('Défense de : ' + Q.name(sides[0]) + ' / ' + Q.name(sides[1]) + ' (' + n + ' matchs, les deux équipes ensemble)');
console.log('\nJoueurs qui sortent sur le porteur ou vont au ballon (part du temps)    0      1      2      3 et plus    défenseur sorti à 8 m devant sa ligne');
nPress.forEach((c, z) => { const t = c.reduce((a, b) => a + b, 0) || 1; console.log(zones[z].padEnd(66) + c.map(v => (100 * v / t).toFixed(0).padStart(5) + ' %').join('') + (100 * out[z].n / out[z].k).toFixed(1).padStart(14) + ' %'); });
const tot = Object.values(why).reduce((a, b) => a + b, 0);
console.log('\nPourquoi ils sortent :'); Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log('  ' + (100 * v / tot).toFixed(1).padStart(5) + ' %  ' + k));
{ const t = loose.reduce((a, b) => a + b, 0) || 1; console.log('\nBallon libre : joueurs d\'une équipe qui y vont   0 : ' + loose.map((v, i) => (i === 3 ? '3 et plus : ' : i ? i + ' : ' : '') + (100 * v / t).toFixed(0) + ' %').join('   ').replace(/^0 : /, '')); }
console.log('\nLignes (sans ceux qui pressent)      ligne de défense : écart en profondeur   milieux : écart   entre les deux lignes   joueurs qui marquent un adversaire');
lines.forEach((L, z) => { const f = v => (v / L.k).toFixed(1); console.log(zones[z].padEnd(36) + (f(L.dsd) + ' m').padStart(22) + (f(L.msd) + ' m').padStart(18) + (f(L.gap) + ' m').padStart(22) + (L.mark / acc[z].k).toFixed(1).padStart(22)); });
console.log('');
console.log('ballon                      défenseurs à <5 m  <10 m  <15 m  <20 m   largeur  profondeur  côté opposé (>25 m)  plus près du but  plus proche');
acc.forEach((A, z) => { const f = v => (v / A.k).toFixed(1); console.log(zones[z].padEnd(28) + f(A.r5).padStart(8) + f(A.r10).padStart(7) + f(A.r15).padStart(7) + f(A.r20).padStart(7) + (f(A.width) + ' m').padStart(10) + (f(A.depth) + ' m').padStart(12) + f(A.far).padStart(14) + f(A.behind).padStart(20) + (f(A.near) + ' m').padStart(14)); });
