// Où se joue le match : temps passé par le ballon dans chaque bande du terrain (du point de vue de l'équipe qui a le ballon)
const E = require('../engine.js');
const n = +process.argv[2] || 20, bands = [-52.5, -35, -17.5, 0, 17.5, 30, 36, 44, 53], time = bands.map(() => 0), shots = bands.map(() => 0);
let lost = bands.map(() => 0), prevOwnerTeam = -1, tot = 0;
const band = x => { for (let i = bands.length - 2; i >= 0; i--) if (x >= bands[i]) return i; return 0; };
for (let i = 0; i < n; i++) {
  const m = E.createMatch({ seed: 100 + i }); let lastTeam = -1, lastX = 0, shotsSeen = 0;
  while (m.mode !== 'over') {
    E.step(m);
    const o = m.ball.owner;
    if (o && m.mode === 'play') {
      const rx = m.ball.x * m.teams[o.team].dir; time[band(rx)] += E.DT; tot += E.DT;
      if (lastTeam >= 0 && lastTeam !== o.team) lost[band(lastX)]++;
      lastTeam = o.team; lastX = rx;
    }
    const s = m.teams[0].stats.shots + m.teams[1].stats.shots; if (s > shotsSeen) { shotsSeen = s; const sh = m.shot; if (sh) shots[band(sh.by.x * m.teams[sh.team].dir)]++; }
  }
}
console.log('bande (x relatif)     temps balle au pied   pertes/match   tirs/match');
for (let i = 0; i < bands.length - 1; i++) console.log(`  ${String(bands[i]).padStart(6)} … ${String(bands[i + 1]).padEnd(6)}   ${(100 * time[i] / tot).toFixed(1).padStart(6)} %          ${(lost[i] / n).toFixed(1).padStart(6)}      ${(shots[i] / n).toFixed(2).padStart(6)}`);
