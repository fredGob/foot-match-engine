/* Statistiques : additionne un ou plusieurs matchs et en tire les lignes affichées (page, sim.js, outils).
   Aucune influence sur le moteur. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function create() { return { n: 0, teams: [{ dist: 0, fresh: 0, wins: 0 }, { dist: 0, fresh: 0, wins: 0 }], draws: 0, scores: {} }; }

// ajoute un match (terminé ou en cours) au total
function add(acc, m) {
  acc.n++;
  for (let t = 0; t < 2; t++) {
    const S = m.teams[t].stats, A = acc.teams[t];
    for (const k in S) A[k] = (A[k] || 0) + S[k];
    A.dist += S.run != null ? S.run : m.teams[t].players.reduce((d, p) => d + p.dist, 0);      // toute l'équipe, joueurs sortis compris
    for (const p of m.teams[t].players) if (p.role !== 'GK') A.fresh += p.stam;
  }
  const a = m.teams[0].score, b = m.teams[1].score;
  if (a > b) acc.teams[0].wins++; else if (b > a) acc.teams[1].wins++; else acc.draws++;
  acc.scores[a + '-' + b] = (acc.scores[a + '-' + b] || 0) + 1;
  return acc;
}

const ratio = (a, b) => b ? a / b : NaN;
// chaque ligne : [groupe, libellé, calcul(S équipe, O adversaire, n matchs), décimales pour un seul match, pour une série, unité]
const ROWS = [
  ['Résultat', 'Buts', (S, O, n) => S.goals / n, 0, 2, ''],
  ['Résultat', 'Tirs', (S, O, n) => S.shots / n, 0, 1, ''],
  ['Résultat', 'Tirs cadrés', (S, O, n) => S.onTarget / n, 0, 1, ''],
  ['Résultat', 'Buts attendus', (S, O, n) => S.xg / n, 2, 2, ''],
  ['Résultat', 'Possession', (S, O) => 100 * ratio(S.possT, S.possT + O.possT), 0, 1, ' %'],
  ['Avec le ballon', 'Passes', (S, O, n) => S.passes / n, 0, 0, ''],
  ['Avec le ballon', 'Passes réussies', S => 100 * ratio(S.passesOk, S.passes), 0, 1, ' %'],
  ['Avec le ballon', 'Longueur des passes', S => ratio(S.passLen, S.passLenN), 1, 1, ' m'],
  ['Avec le ballon', 'Longs ballons', (S, O, n) => S.longBalls / n, 0, 1, ''],
  ['Avec le ballon', 'Passes en profondeur', (S, O, n) => S.through / n, 0, 1, ''],
  ['Avec le ballon', 'Centres', (S, O, n) => S.crosses / n, 0, 1, ''],
  ['Avec le ballon', 'Corners', (S, O, n) => S.corners / n, 0, 2, ''],
  ['Avec le ballon', 'Hors-jeu', (S, O, n) => S.offsides / n, 0, 2, ''],
  ['Avec le ballon', 'Temps balle au pied', S => ratio(S.ballT, S.touches), 1, 2, ' s'],
  ['Avec le ballon', 'Contrôles ratés', (S, O, n) => S.miscontrols / n, 0, 1, ''],
  ['Avec le ballon', 'Passes contre la consigne', (S, O, n) => S.passDefy / n, 0, 1, ''],
  ['Avec le ballon', 'Largeur de l\'équipe', S => ratio(S.widthSum, S.widthN), 0, 1, ' m'],
  ['Sans le ballon', 'Hauteur de la défense', S => ratio(S.lineSum, S.lineN), 0, 1, ' m'],
  ['Sans le ballon', 'Ballons repris', (S, O, n) => S.recov / n, 0, 1, ''],
  ['Sans le ballon', '… dont camp adverse', (S, O, n) => S.recovHigh / n, 0, 1, ''],
  ['Sans le ballon', 'Tacles réussis', (S, O, n) => S.tackles / n, 0, 1, ''],
  ['Sans le ballon', 'Interceptions', (S, O, n) => S.interceptions / n, 0, 1, ''],
  ['Sans le ballon', 'Fautes', (S, O, n) => S.fouls / n, 0, 1, ''],
  ['Effort', 'Distance par joueur', (S, O, n) => S.dist / (11 * n), 0, 0, ' m'],
  ['Effort', 'Fraîcheur des joueurs', (S, O, n) => 100 * S.fresh / (10 * n), 0, 1, ' %'],
];

// renvoie les lignes prêtes à afficher : { group, label, a, b, va, vb } (a, b : textes ; va, vb : nombres)
function rows(acc) {
  const A = acc.teams[0], B = acc.teams[1], n = acc.n || 1, one = acc.n <= 1;
  const fmt = (v, r) => Number.isFinite(v) ? v.toFixed(one ? r[3] : r[4]).replace('.', ',') + r[5] : '–';
  return ROWS.map(r => { const va = r[2](A, B, n), vb = r[2](B, A, n); return { group: r[0], label: r[1], a: fmt(va, r), b: fmt(vb, r), va, vb }; });
}

// pour un match en cours : mêmes lignes à partir de deux blocs de statistiques
function rowsOf(statsA, statsB) { return rows({ n: 1, teams: [statsA, statsB] }); }

// Temps forts (choix de Frédéric) : les actions qui finissent en tir (on remonte avant le tir, on garde un peu après),
// et les moments où une équipe a le ballon dans les 25 derniers mètres, même sans tir. Le reste est un temps faible, lu en accéléré.
// o : { n (images), DT, x(f) (position du ballon), team(f) (équipe qui a le ballon, -1 personne), dir [sens des Bleus, des Rouges], HL (demi-longueur), events }
// renvoie { on: Uint8Array (1 = temps fort, image par image), parts: [[début, fin] en secondes] }
const HL_ZONE = 25, HL_PRE = 5, HL_POST = 1.5, HL_SHOT_PRE = 10, HL_SHOT_POST = 3, HL_GOAL_POST = 5, HL_GAP = 6, HL_MIN = 1.5;
function highlights(o) {
  const n = o.n, DT = o.DT, on = new Uint8Array(n), mark = (t0, t1) => { for (let f = Math.max(0, Math.round(t0 / DT)), e = Math.min(n - 1, Math.round(t1 / DT)); f <= e; f++) on[f] = 1; };
  // ballon près du but : à une équipe, ou libre juste après qu'elle l'a perdu
  let last = -1, f0 = -1;
  for (let f = 0; f <= n; f++) {
    let hot = false;
    if (f < n) { const t = o.team(f); if (t >= 0) last = t; hot = last >= 0 && o.x(f) * o.dir[last] > o.HL - HL_ZONE; }
    if (hot && f0 < 0) f0 = f;
    else if (!hot && f0 >= 0) { if ((f - f0) * DT >= HL_MIN) mark(f0 * DT - HL_PRE, f * DT + HL_POST); f0 = -1; }      // un ballon qui ne fait que passer ne compte pas
  }
  // actions qui finissent en tir, et penalties
  for (const e of o.events) {
    if (e.kind === 'goal') mark(e.t - HL_SHOT_PRE, e.t + HL_GOAL_POST);
    else if (e.kind === 'shot' || e.kind === 'save' || e.kind === 'block' || (e.kind === 'foul' && /penalty/.test(e.text))) mark(e.t - HL_SHOT_PRE, e.t + HL_SHOT_POST);
  }
  // deux temps forts proches n'en font qu'un (pas d'accéléré de 2 secondes au milieu d'une action)
  const gap = Math.round(HL_GAP / DT);
  for (let f = 0, prev = -1; f < n; f++) if (on[f]) { if (prev >= 0 && f - prev > 1 && f - prev <= gap) for (let k = prev + 1; k < f; k++) on[k] = 1; prev = f; }
  const parts = [];
  for (let f = 0; f < n; f++) if (on[f] && (f === 0 || !on[f - 1])) { let g = f; while (g + 1 < n && on[g + 1]) g++; parts.push([f * DT, g * DT]); }
  return { on, parts };
}

return { create, add, rows, rowsOf, highlights };
});
