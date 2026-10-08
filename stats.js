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
    for (const p of m.teams[t].players) { A.dist += p.dist; if (p.role !== 'GK') A.fresh += p.stam; }
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

return { create, add, rows, rowsOf };
});
