/* Moteur de match — simulation pure, sans affichage.
   Repère : x le long du terrain (−52.5 … 52.5), y en largeur (−34 … 34), z en hauteur. Mètres et secondes.
   L'équipe 0 attaque vers +x, l'équipe 1 vers −x.
   « Relatif » = repère retourné pour que l'équipe considérée attaque toujours vers +x (x*dir, y*dir). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const P = { HL: 52.5, HW: 34, GOAL_HW: 3.66, GOAL_H: 2.44, BOX_D: 16.5, BOX_HW: 20.16, SIX_D: 5.5, SIX_HW: 9.16, SPOT: 11, CIRCLE_R: 9.15 };
const DT = 0.05, G = 9.81;
const ROLL_A = 0.9, ROLL_B = 0.16, AIR_K = 0.012;      // frottement au sol (a + b·v), traînée en l'air
const WALK = 1.7, JOG = 3.3, RUN = 5.3;

// ---------- utilitaires ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const sigmoid = x => 1 / (1 + Math.exp(-x));
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
  return tab[tab.length - 1][1];
}
function makeRng(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- physique du ballon ----------
function ballStep(b, dt) {
  if (b.z > 0.02 || Math.abs(b.vz) > 0.5) {
    const k = AIR_K * Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    b.vx -= k * b.vx * dt; b.vy -= k * b.vy * dt; b.vz -= (G * (1 + (b.dip || 0)) + k * b.vz) * dt;      // dip : ballon brossé, il plonge plus vite
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z <= 0) { b.z = 0; b.dip = 0; if (b.vz < -1.2) { b.vz = -b.vz * 0.55; b.vx *= 0.72; b.vy *= 0.72; } else b.vz = 0; }
  } else {
    b.z = 0; b.vz = 0;
    const sp = hyp(b.vx, b.vy);
    if (sp > 0) { const f = Math.max(0, sp - (ROLL_A + ROLL_B * sp) * dt) / sp; b.vx *= f; b.vy *= f; }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
}
// ballon qui roule : distance et temps pour passer de la vitesse v0 à v1
function rollDist(v0, v1) { return (v0 - v1) / ROLL_B - (ROLL_A / (ROLL_B * ROLL_B)) * Math.log((ROLL_A + ROLL_B * v0) / (ROLL_A + ROLL_B * v1)); }
function rollTime(v0, v1) { return Math.log((ROLL_A + ROLL_B * v0) / (ROLL_A + ROLL_B * v1)) / ROLL_B; }
function groundSpeedFor(d, vArr) { let lo = vArr, hi = 40; for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (rollDist(mid, vArr) < d) lo = mid; else hi = mid; } return hi; }
function groundTime(v0, s) {
  if (s <= 0) return 0;
  if (rollDist(v0, 0) <= s) return Infinity;
  // distance parcourue après t secondes : (v0 + a/b)(1 − e^(−bt))/b − (a/b)t ; on cherche t par la méthode de Newton
  const c = ROLL_A / ROLL_B, A = v0 + c;
  let t = s / v0;
  for (let i = 0; i < 12; i++) { const e = Math.exp(-ROLL_B * t), f = A * (1 - e) / ROLL_B - c * t - s; if (f > -1e-5) break; t -= f / (A * e - c); }
  return t;
}
// ballon en l'air : table vitesse → (distance, temps) du premier rebond, par angle de frappe
const LOFT = {};
for (const e of [28, 38]) {
  const rows = [], er = e * Math.PI / 180;
  for (let v = 8; v <= 34; v++) {
    const b = { x: 0, y: 0, z: 0, vx: v * Math.cos(er), vy: 0, vz: v * Math.sin(er) }; let t = 0;
    do { ballStep(b, 0.02); t += 0.02; } while (b.z > 0 && t < 8);
    rows.push({ v, d: b.x, t });
  }
  LOFT[e] = rows;
}
function loftSolve(d, e) {
  const rows = LOFT[e];
  if (d <= rows[0].d) return { v: rows[0].v, t: rows[0].t };
  for (let i = 1; i < rows.length; i++) if (d <= rows[i].d) { const a = rows[i - 1], b = rows[i], u = (d - a.d) / (b.d - a.d); return { v: lerp(a.v, b.v, u), t: lerp(a.t, b.t, u) }; }
  const l = rows[rows.length - 1]; return { v: l.v, t: l.t };
}

// ---------- effectif ----------
// yD/yA : largeur en défense / en attaque ; dD/dA : distance à la ligne défensive en défense / en attaque
const SLOTS = [
  { slot: 'GK',  role: 'GK',  num: 1,  side: 0,  yD: 0,    yA: 0,   dD: 0,    dA: 0 },
  { slot: 'LB',  role: 'DEF', num: 3,  side: -1, yD: -17,  yA: -26, dD: 1.5,  dA: 11 },
  { slot: 'LCB', role: 'DEF', num: 4,  side: 0,  yD: -6,   yA: -10, dD: 0,    dA: 0 },
  { slot: 'RCB', role: 'DEF', num: 5,  side: 0,  yD: 6,    yA: 10,  dD: 0,    dA: 0 },
  { slot: 'RB',  role: 'DEF', num: 2,  side: 1,  yD: 17,   yA: 26,  dD: 1.5,  dA: 11 },
  { slot: 'LM',  role: 'MID', num: 11, side: -1, yD: -21,  yA: -28, dD: 11.5, dA: 30 },
  { slot: 'LCM', role: 'MID', num: 6,  side: 0,  yD: -4.5, yA: -6,  dD: 9,    dA: 16 },
  { slot: 'RCM', role: 'MID', num: 8,  side: 0,  yD: 6,    yA: 9,   dD: 12,   dA: 24 },
  { slot: 'RM',  role: 'MID', num: 7,  side: 1,  yD: 21,   yA: 28,  dD: 11.5, dA: 30 },
  { slot: 'LF',  role: 'FWD', num: 10, side: 0,  yD: -8,   yA: -9,  dD: 22,   dA: 40 },
  { slot: 'RF',  role: 'FWD', num: 9,  side: 0,  yD: 8,    yA: 9,   dD: 21,   dA: 36 },
];
// formations : pour chacun des onze joueurs (dans l'ordre de l'effectif du 4-4-2), son rôle, son côté, sa place et son nom de poste.
// Les joueurs gardent leur rang dans l'effectif : en 4-3-3, le milieu gauche devient ailier gauche, l'attaquant mobile milieu intérieur, etc.
const F = (role, side, yD, yA, dD, dA, poste) => ({ role, side, yD, yA, dD, dA, poste });
const FORMATIONS = [
  { id: '442', name: '4-4-2', slots: null },
  { id: '433', name: '4-3-3', slots: [null, null, null, null, null,
      F('FWD', -1, -20, -27, 19, 38, 'Ailier gauche'), F('MID', 0, 0, 0, 5, 11, 'Milieu défensif'), F('MID', 0, 9, 12, 11, 24, 'Milieu intérieur droit'),
      F('FWD', 1, 20, 27, 19, 38, 'Ailier droit'), F('MID', 0, -9, -12, 11, 24, 'Milieu intérieur gauche'), F('FWD', 0, 0, 0, 22, 39, 'Avant-centre')] },
  { id: '4231', name: '4-2-3-1', slots: [null, null, null, null, null,
      F('MID', -1, -20, -27, 14, 33, 'Milieu offensif gauche'), F('MID', 0, -5, -7, 7, 14, 'Milieu défensif gauche'), F('MID', 0, 5, 7, 7, 15, 'Milieu défensif droit'),
      F('MID', 1, 20, 27, 14, 33, 'Milieu offensif droit'), F('MID', 0, 0, 0, 15, 29, 'Milieu offensif axial'), F('FWD', 0, 0, 0, 23, 39, 'Avant-centre')] },
  { id: '352', name: '3-5-2', slots: [null,
      F('MID', -1, -24, -30, 2, 28, 'Piston gauche'), F('DEF', 0, -10, -16, 0, 0, 'Défenseur central gauche'), F('DEF', 0, 10, 16, 0, 0, 'Défenseur central droit'), F('MID', 1, 24, 30, 2, 28, 'Piston droit'),
      F('MID', 0, -10, -13, 11, 22, 'Milieu gauche'), F('DEF', 0, 0, 0, 0, 0, 'Défenseur central'), F('MID', 0, 0, 0, 9, 18, 'Milieu axial'),
      F('MID', 0, 10, 13, 11, 22, 'Milieu droit'), null, null] },
  { id: '532', name: '5-3-2', slots: [null,
      F('DEF', -1, -22, -29, 1, 20, 'Piston gauche'), F('DEF', 0, -10, -16, 0, 0, 'Défenseur central gauche'), F('DEF', 0, 10, 16, 0, 0, 'Défenseur central droit'), F('DEF', 1, 22, 29, 1, 20, 'Piston droit'),
      F('MID', 0, -11, -14, 10, 20, 'Milieu gauche'), F('DEF', 0, 0, 0, 0, 0, 'Défenseur central'), F('MID', 0, 0, 0, 9, 18, 'Milieu axial'),
      F('MID', 0, 11, 14, 10, 20, 'Milieu droit'), null, null] },
];
// place du joueur n° i dans la formation de son équipe (null dans une formation : comme en 4-4-2)
function slotOf(T, i) { const f = FORMATIONS.find(x => x.id === T.form), s = f && f.slots && f.slots[i]; return s ? Object.assign({}, SLOTS[i], s) : SLOTS[i]; }
// change la formation d'une équipe, avant ou pendant le match
function setFormation(m, team, id) {
  const T = m.teams[team], f = FORMATIONS.find(x => x.id === id);
  if (!f || T.form === id) return;
  const was = T.form; T.form = id;
  for (const p of T.players) { const s = slotOf(T, p.idx); p.role = s.role; p.side = s.side; p.poste = s.poste || POSTE[s.slot]; }
  if (was && m.tick > 0) log(m, 'tactic', team, 'Formation des ' + T.name + ' : ' + f.name);
}
const POSTE = { GK: 'Gardien', LB: 'Arrière gauche', LCB: 'Défenseur central', RCB: 'Défenseur central', RB: 'Arrière droit', LM: 'Milieu gauche', LCM: 'Milieu axial', RCM: 'Milieu axial', RM: 'Milieu droit', LF: 'Attaquant', RF: 'Attaquant' };
// hauteur de la ligne défensive (x relatif) selon la position du ballon (x relatif)
const DEF_LINE = [[-52.5, -47.5], [-40, -44], [-25, -37], [-10, -29], [5, -21], [25, -12], [52.5, -6]];
const ATT_LINE = [[-52.5, -41], [-35, -38], [-10, -25], [15, -11], [35, -2], [52.5, 0]];
const NAMES = ['Morel', 'Garnier', 'Faure', 'Roussel', 'Blanchard', 'Guérin', 'Boyer', 'Chevalier', 'Perrin', 'Robin', 'Masson', 'Marchand', 'Dupuis', 'Lemoine', 'Benoît', 'Renard', 'Colin', 'Vidal', 'Picard', 'Leclerc', 'Gaillard', 'Barbier', 'Arnaud', 'Brun', 'Giraud', 'Meunier', 'Aubert', 'Carpentier', 'Lacroix', 'Fabre', 'Rey', 'Hubert', 'Royer', 'Berger', 'Leroux', 'Noël', 'Poirier', 'Huet', 'Charpentier', 'Ménard', 'Bailly', 'Collet', 'Maréchal', 'Besson'];

// ---------- consignes tactiques ----------
// Chaque consigne vaut −1, 0 ou +1 (0 = neutre ; les valeurs intermédiaires sont acceptées), dans l'ordre des options.
// Une consigne oriente les choix de chaque joueur sans les dicter : une équipe qui « joue court » tente encore
// un long ballon quand c'est nettement la meilleure solution.
const TACTICS = [
  { key: 'passing', label: 'Jeu de passes', options: ['Court', 'Mixte', 'Long'], notes: ['jouer court', '', 'jouer long'],
    help: 'Court : passes dans les pieds, partenaires proches du porteur. Long : on cherche vite les attaquants, par-dessus ou dans la profondeur.' },
  { key: 'tempo', label: 'Rythme', options: ['Posé', 'Normal', 'Rapide'], notes: ['jouer posé', '', 'jouer vite'],
    help: 'Posé : le porteur attend qu\'une bonne solution s\'ouvre. Rapide : le ballon circule en une ou deux touches, quitte à forcer.' },
  { key: 'width', label: 'Largeur', options: ['Resserré', 'Normal', 'Large'], notes: ['jouer dans l\'axe', '', 'jouer sur les ailes'],
    help: 'Resserré : on attaque par l\'axe, joueurs proches. Large : on occupe les deux ailes et on centre.' },
  { key: 'line', label: 'Hauteur du bloc', options: ['Bas', 'Médian', 'Haut'], notes: ['défendre bas', '', 'défendre haut'],
    help: 'Bas : l\'équipe défend près de son but. Haut : la défense monte, l\'adversaire a moins de place mais de l\'espace dans le dos.' },
  { key: 'press', label: 'Pressing', options: ['Attendre', 'Normal', 'Harceler'], notes: ['attendre l\'adversaire', '', 'harceler le porteur'],
    help: 'Attendre : on garde ses positions et on laisse venir ; les attaquants ne courent pas après le ballon et restent frais. Harceler : on va chercher le porteur loin, à deux s\'il le faut, au prix de beaucoup d\'énergie.' },
];
// tactiques prédéfinies : un jeu des cinq consignes, prêt à l'emploi (passing, tempo, width, line, press)
const PRESETS = [
  { id: 'equilibre', name: 'Équilibré', t: { passing: 0, tempo: 0, width: 0, line: 0, press: 0 }, help: 'Toutes les consignes au neutre.' },
  { id: 'possession', name: 'Possession', t: { passing: -1, tempo: -1, width: 1, line: 0, press: 0 }, help: 'Garder le ballon : passes courtes, on prend son temps, on écarte le jeu.' },
  { id: 'pressing', name: 'Pressing haut', t: { passing: 0, tempo: 1, width: 0, line: 1, press: 1 }, help: 'Reprendre le ballon loin de son but : bloc haut, on harcèle le porteur, on joue vite. Coûte beaucoup d\'énergie.' },
  { id: 'contre', name: 'Contre-attaque', t: { passing: 1, tempo: 1, width: 0, line: -1, press: -1 }, help: 'Laisser venir, puis partir vite dans le dos de la défense.' },
  { id: 'blocbas', name: 'Bloc bas', t: { passing: 1, tempo: -1, width: -1, line: -1, press: -1 }, help: 'Défendre le score : bloc bas et compact, on ne prend aucun risque, on dégage loin.' },
  { id: 'direct', name: 'Jeu direct', t: { passing: 1, tempo: 1, width: 1, line: 0, press: 0 }, help: 'Aller vite vers l\'avant : longs ballons, ailes et centres.' },
  { id: 'attaque', name: 'Tout pour l\'attaque', t: { passing: 0, tempo: 1, width: 1, line: 1, press: 1 }, help: 'Courir après le score : tout le monde monte, on presse et on écarte. Laisse de l\'espace derrière.' },
];
// change les consignes d'une équipe, avant ou pendant le match (un changement en cours de match est noté dans le fil du match)
// label : nom d'une tactique prédéfinie ; le fil du match note alors une seule ligne au lieu d'une par consigne
function setTactics(m, team, tac, label) {
  const T = m.teams[team]; let changed = false;
  for (const c of TACTICS) if (tac && tac[c.key] != null) {
    const v = clamp(+tac[c.key] || 0, -1, 1);
    if (v !== T.tac[c.key] && m.tick > 0) { changed = true; if (!label) log(m, 'tactic', team, 'Consigne des ' + T.name + ' : ' + c.label.toLowerCase() + ' → ' + c.options[Math.round(v) + 1].toLowerCase()); }
    T.tac[c.key] = v;
  }
  if (label && changed) log(m, 'tactic', team, 'Tactique des ' + T.name + ' : ' + label);
}
const tacNote = (key, v) => TACTICS.find(c => c.key === key).notes[v < 0 ? 0 : 2];

// Dans cette version, tous les joueurs ont toutes leurs qualités au même niveau (14 sur 20) : deux équipes strictement égales,
// pour que seules les consignes fassent la différence. Les notes individuelles tirées au hasard restent disponibles (opts.random).
const LEVEL = 0.7;
const PASS_GAP = 3.5;          // poids de la note de passe sur la précision du geste (×1 à 14, ×2,9 à 8, ×0,6 à 17)
const BAD_LAT = 0.6, BAD_PASS = 0.25;      // passe mal ajustée : écart toléré (m), puis risque de contrôle raté
const VISION = 2.5;        // poids de la vision : risque de ne pas voir un partenaire loin ou dans le dos
const PANIC_V = 0.7, PANIC_R = 0.3;      // sous 14 de vision, un joueur pressé commence à paniquer ; à 8, il panique tout à fait
const MISREAD = 0.6;       // vision 8 : il ne voit que 40 % du danger d'interception sur une passe
const DUEL_MIND = 0.4;     // part de l'anticipation (défenseur) et du sang-froid (porteur) dans un duel
const PRESS_Q = 10;        // presseur (moyenne démarrage, anticipation, agressivité) : pèse 1,5 m plus près à 17, 3 m plus loin à 8
const AMORTI_FREE = 2.5;   // sans adversaire à moins de 2,5 m, un ballon aérien s'amortit au lieu de se jouer de la tête
const CROSS_MARK = 1;      // centre possible : marquage serré dans la surface
const AXIS_D = 35;         // à moins de 35 m du but, un défenseur ferme l'axe ballon-but s'il est ouvert
const READ = 1.2;          // lecture de la passe : allonge la portée de 18 % à 17, la réduit de 36 % à 8
const LUCID = 2;           // lucidité : prudence face à une passe risquée (+30 % à 17, −60 % à 8)
const PATIENCE = 3;        // lucidité : attente avant de s'impatienter (8 s à 14, 11,6 s à 17, 0,8 s à 8)
const CTRL = 0.6;        // poids de la pression sur la prise de balle (9,6 % de contrôles ratés sous pression pour un joueur à 14)
const MASK = 0.22;      // coup franc par-dessus le mur : retard (s) du gardien, qui voit partir le ballon tard
const DIP = 0.8;        // coup franc brossé : le ballon plonge comme si la pesanteur était 1,8 fois plus forte
const CARRY = 1, CARRY_Q = 0.85;   // conduire sous pression dans son camp (l'effet s'éteint 15 m après la ligne médiane) : rien au-dessus de 17 de moyenne (prise de balle, dribble, physique) ; à 14, la conduite perd 0,43 × l'enjeu sous pression maximale ; à 10, tout l'enjeu
const SAFE_BACK = 0.3;          // … et la passe courte en retrait gagne 30 % de ce qu'a perdu la conduite
// Les 20 qualités d'un joueur : nom dans le moteur, nom dans le fichier des équipes (equipes.json), nom affiché.
const QUALITIES = [['pace', 'vitesse', 'Vitesse'], ['accel', 'acceleration', 'Accélération'], ['stamina', 'endurance', 'Endurance'], ['passing', 'passe', 'Passe'], ['vision', 'vision', 'Vision du jeu'],
  ['firstTouch', 'prise_de_balle', 'Prise de balle'], ['dribbling', 'dribble', 'Dribble'], ['finishing', 'finition', 'Finition'], ['tackling', 'tacle', 'Tacle'], ['positioning', 'placement', 'Placement'],
  ['anticipation', 'anticipation', 'Anticipation'], ['decisions', 'lucidite', 'Lucidité'], ['composure', 'sang_froid', 'Sang-froid'], ['workRate', 'volume_de_course', 'Volume de course'], ['aggression', 'agressivite', 'Agressivité'],
  ['flair', 'gout_du_risque', 'Goût du risque'], ['heading', 'jeu_de_tete', 'Jeu de tête'], ['offBall', 'appels', 'Appels de balle'], ['reflexes', 'reflexes', 'Réflexes'], ['handling', 'mains', 'Jeu de mains']];
// Les 11 places du 4-4-2, telles qu'on les écrit dans le fichier des équipes.
const PLACES = { G: 'GK', AG: 'LB', DCG: 'LCB', DCD: 'RCB', AD: 'RB', MG: 'LM', MCG: 'LCM', MCD: 'RCM', MD: 'RM', ATG: 'LF', ATD: 'RF' };
// Lit une équipe du fichier des équipes (notes sur 20) et la range dans l'ordre des places. Dit clairement ce qui cloche si le fichier est mal rempli.
function readTeam(def) {
  const who = 'équipe « ' + (def && (def.nom || def.id) || '?') + ' »';
  if (!def || !Array.isArray(def.joueurs) || def.joueurs.length !== 11) throw new Error(who + ' : il faut exactement 11 joueurs');
  const squad = new Array(11);
  for (const j of def.joueurs) {
    const i = SLOTS.findIndex(s => s.slot === PLACES[j.poste]);
    if (i < 0) throw new Error(who + ', ' + (j.nom || '?') + ' : poste inconnu « ' + j.poste + ' » (postes : ' + Object.keys(PLACES).join(', ') + ')');
    if (squad[i]) throw new Error(who + ' : deux joueurs au poste ' + j.poste);
    const a = {}, notes = j.notes || {};
    for (const q of QUALITIES) {
      const v = notes[q[1]];
      if (typeof v !== 'number' || !(v >= 1 && v <= 20)) throw new Error(who + ', ' + (j.nom || j.poste) + ' : la note « ' + q[1] + ' » doit être un nombre de 1 à 20');
      a[q[0]] = v / 20;
    }
    for (const k in notes) if (!QUALITIES.some(q => q[1] === k)) throw new Error(who + ', ' + (j.nom || j.poste) + ' : note inconnue « ' + k + ' »');
    squad[i] = { name: String(j.nom || POSTE[SLOTS[i].slot]), num: j.numero || SLOTS[i].num, a };
  }
  return squad;
}
function makePlayer(m, T, i, name, own) {
  const s = SLOTS[i], g = m.gauss;
  if (own) { const p = newPlayer(m, T, i, own.name, own.a); p.num = own.num; return p; }      // joueur venu du fichier des équipes
  if (!m.random) {
    const a = {}; for (const q of QUALITIES) a[q[0]] = LEVEL;
    return newPlayer(m, T, i, name, a);
  }
  const base = () => clamp(0.6 + 0.13 * g(), 0.25, 0.97);
  const a = { pace: base(), accel: base(), stamina: base(), passing: base(), vision: base(), firstTouch: base(), dribbling: base(), finishing: base(), tackling: base(), positioning: base(), anticipation: base(), decisions: base(), composure: base(), workRate: base(), aggression: base(), flair: base(), heading: base(), offBall: base(), reflexes: 0.3, handling: 0.3 };
  const add = (k, v) => { a[k] = clamp(a[k] + v, 0.2, 0.98); };
  if (s.role === 'GK') { a.reflexes = clamp(0.68 + 0.1 * g(), 0.4, 0.97); a.handling = clamp(0.66 + 0.1 * g(), 0.4, 0.97); add('pace', -0.15); add('dribbling', -0.2); add('finishing', -0.3); }
  if (s.role === 'DEF') { add('tackling', 0.12); add('positioning', 0.1); add('heading', 0.1); add('finishing', -0.2); add('dribbling', -0.08); }
  if (s.role === 'MID') { add('passing', 0.1); add('vision', 0.1); add('stamina', 0.08); add('workRate', 0.05); }
  if (s.role === 'FWD') { add('finishing', 0.16); add('pace', 0.07); add('offBall', 0.13); add('tackling', -0.2); }
  if (s.side !== 0) { add('pace', 0.08); add('dribbling', 0.05); }
  return newPlayer(m, T, i, name, a);
}
function newPlayer(m, T, i, name, a) {
  const s = SLOTS[i];
  return {
    id: T.id * 11 + i, team: T.id, idx: i, num: s.num, name, slot: s.slot, role: s.role, side: s.side, poste: POSTE[s.slot], a,
    top: 7.1 + 1.7 * a.pace, acc: 3.3 + 2.2 * a.accel,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, face: T.dir > 0 ? 0 : Math.PI, stam: 1, dist: 0,
    ax: 0, ay: 0, driftX: 0, driftY: 0,
    nextThink: m.rng() * 0.3, intent: { type: 'position', label: 'Se replace', note: null, tx: 0, ty: 0, urg: 0.3, since: 0 },
    plan: null, onRun: false, turned: false, shieldUntil: 0, stunUntil: 0, noControlUntil: 0, tackleReadyAt: 0, controlReadyAt: 0, gotBallAt: -9, protectedUntil: 0, holdUntil: 0,
    setPiece: null, hands: false, firstTime: false, nextRunAt: 0, saveAt: 0,
  };
}

function createMatch(opts) {
  opts = opts || {};
  const seed = opts.seed == null ? 1 : opts.seed;
  const m = { seed, rng: makeRng(seed), t: 0, tick: 0, duration: opts.duration || 600, mode: 'dead', players: [], teams: [], events: [], pass: null, shot: null, restart: null, corner: null, wall: null, path: [], icpt: [], icptTick: -9, poss: -1, lastTeam: -1, holder: -1, possSince: 0, playT: 0, count: {}, random: !!opts.random };
  m.gauss = () => { let u = 0; while (u < 1e-9) u = m.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * m.rng()); };
  const names = NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(m.rng() * (i + 1)); const t = names[i]; names[i] = names[j]; names[j] = t; }
  // opts.teams : pour chaque camp, une équipe du fichier des équipes, ou rien (équipe standard, tous les joueurs à 14)
  const squads = [0, 1].map(t => opts.teams && opts.teams[t] ? readTeam(opts.teams[t]) : null);
  for (let t = 0; t < 2; t++) {
    const T = { id: t, name: t === 0 ? 'Bleus' : 'Rouges', club: squads[t] ? String(opts.teams[t].nom || opts.teams[t].id || '') : '', color: t === 0 ? '#2f6fdf' : '#d8423a', dir: t === 0 ? 1 : -1, score: 0, phase: 0.5, refX: 0, refY: 0, line: -30, offLine: 0, spread: 46, players: [],
      tac: { passing: 0, tempo: 0, width: 0, line: 0, press: 0 },
      stats: { possT: 0, passes: 0, passesOk: 0, shots: 0, onTarget: 0, goals: 0, xg: 0, tackles: 0, interceptions: 0, blocks: 0, fouls: 0, corners: 0, offsides: 0, saves: 0,
        // mesures du style de jeu : elles servent à voir l'effet des consignes
        miscontrols: 0, passLen: 0, passLenN: 0, longBalls: 0, through: 0, crosses: 0, ballT: 0, touches: 0, widthSum: 0, widthN: 0, lineSum: 0, lineN: 0, recov: 0, recovHigh: 0, passFollow: 0, passDefy: 0 } };
    for (let i = 0; i < 11; i++) { const p = makePlayer(m, T, i, names[t * 11 + i], squads[t] && squads[t][i]); T.players.push(p); m.players.push(p); }
    m.teams.push(T);
  }
  for (let t = 0; t < 2; t++) setFormation(m, t, (opts.formations && opts.formations[t]) || '442');
  if (opts.tactics) for (let t = 0; t < 2; t++) setTactics(m, t, opts.tactics[t]);
  m.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, dip: 0, owner: null, lastTouch: null };
  setRestart(m, 'kickoff', 0, 0, 0, 2);
  m.restart.ballAt = 0;
  updateContext(m);
  for (const p of m.players) { p.x = p.px = p.ax; p.y = p.py = p.ay; }
  const k = m.restart.taker; k.x = k.px = -0.5 * m.teams[0].dir; k.y = k.py = 0;
  log(m, 'kickoff', 0, 'Coup d\'envoi');
  return m;
}

function log(m, kind, team, text) { m.events.push({ t: m.t, kind, team, text }); }
function cnt(m, k, v) { m.count[k] = (m.count[k] || 0) + (v == null ? 1 : v); }
function passEnd(m, how) { const q = m.pass; if (q && q.kind === 'pass' && !q.ended) { q.ended = true; q.how = how; cnt(m, how + '.' + q.type); } }      // how : issue de la passe (pour la carte des passes)
function topSpeed(p) { return p.top * (0.76 + 0.24 * p.stam); }      // un joueur à 50 % de fraîcheur perd 12 % de vitesse de pointe
function inOwnBox(T, x, y) { return x * T.dir < -P.HL + P.BOX_D && Math.abs(y) < P.BOX_HW; }

// temps (s) pour que le joueur q couvre la distance dd vers (tx, ty), en tenant compte de son élan
function timeToCover(m, q, dd, tx, ty) {
  const vmax = topSpeed(q);
  let t = q.stunUntil > m.t ? q.stunUntil - m.t : 0;
  if (dd <= 0) return t;
  const D = hyp(tx - q.x, ty - q.y) || 1;
  const vt = (q.vx * (tx - q.x) + q.vy * (ty - q.y)) / D;       // vitesse actuelle vers la cible
  const v0 = Math.max(0, vt);
  const tAcc = (vmax - v0) / q.acc, dAcc = (v0 + vmax) / 2 * tAcc + 0.01;
  t += dd / vmax + 0.5 * tAcc * (1 - v0 / vmax) * Math.min(1, dd / dAcc);
  if (vt < 0) t += -vt / 7.5;
  return t;
}

// ---------- valeur d'une position (probabilité approximative de marquer sur cette possession) ----------
function valueAt(T, x, y) {
  const rx = x * T.dir, dx = P.HL - rx, d = hyp(dx, y), u = (rx + P.HL) / (2 * P.HL);
  return 0.005 + 0.035 * Math.pow(u, 2.2) + 0.6 * Math.exp(-d / 7) * (0.35 + 0.65 * Math.max(0, dx / (d + 1e-6)));
}
const TURNOVER = 0.008;
function baseXg(T, x, y) {
  const dx = Math.max(0.3, P.HL - x * T.dir), ry = y * T.dir, d = hyp(dx, ry);
  const th = Math.abs(Math.atan((ry + P.GOAL_HW) / dx) - Math.atan((ry - P.GOAL_HW) / dx));   // angle sous lequel on voit le but
  return sigmoid(-1.6 + 2.8 * th - 0.105 * d);
}

// ---------- contexte d'équipe : phase de jeu, ligne défensive, positions de référence ----------
function updateContext(m) {
  const b = m.ball, R = m.restart;
  let poss = -1;
  if (m.mode === 'dead') poss = R.team;
  else if (b.owner) poss = b.owner.team;
  else if (m.pass && m.pass.kind === 'pass' && m.pass.to) poss = m.pass.from.team;
  m.poss = poss;
  let rx = b.x, ry = b.y;
  if (m.mode === 'dead') { rx = R.x; ry = R.y; }
  else if (!b.owner && m.pass && m.pass.to && m.icpt[m.pass.to.id]) { const ic = m.icpt[m.pass.to.id]; rx = (rx + ic.x) / 2; ry = (ry + ic.y) / 2; }
  for (const T of m.teams) {
    const target = poss < 0 ? 0.5 : poss === T.id ? 1 : 0;
    T.phase += clamp(target - T.phase, -0.8 * DT, 0.8 * DT);
    const k = DT / 0.45;
    T.refX += (rx * T.dir - T.refX) * k; T.refY += (ry * T.dir - T.refY) * k;
    // ligne de hors-jeu : avant-dernier adversaire, ballon ou ligne médiane
    const O = m.teams[1 - T.id]; let m1 = -99, m2 = -99;
    for (const o of O.players) { const x = o.x * T.dir; if (x > m1) { m2 = m1; m1 = x; } else if (x > m2) m2 = x; }
    T.offLine = Math.max(m2, b.x * T.dir, 0);
    let lo = 99, hi = -99; for (const p of T.players) if (p.role !== 'GK') { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
    T.spread += (hi - lo - T.spread) * DT / 1.5;             // largeur occupée par l'équipe, lissée sur une seconde et demie
  }
  for (const T of m.teams) computeAnchors(m, T);
}

function computeAnchors(m, T) {
  const f = T.phase, bx = T.refX, by = T.refY, d = T.dir, b = m.ball, R = m.restart, tac = T.tac;
  const short = Math.max(0, -tac.passing), long = Math.max(0, tac.passing), wide = tac.width;
  const fit = clamp(m.teams[1 - T.id].spread / 46, 0.72, 1.12);      // le bloc se resserre face à une attaque axiale, s'étire face à une attaque large
  const wait = Math.max(0, -tac.press);                              // « attendre » : lignes plus proches, bloc plus étroit
  // consigne « hauteur du bloc » : toute l'équipe défend plus haut ou plus bas, sauf quand le ballon approche de son but
  const hunt = Math.max(0, tac.press) * (1 - f) * clamp((bx + 25) / 20, 0, 1);      // « harceler » : tout le bloc se resserre autour du ballon, sauf près de son but
  const lift = (tac.line * (tac.line > 0 ? 8 : 6) + 5 * Math.max(0, tac.press)) * clamp((bx + 40) / 25, 0, 1);
  let line = lerp(Math.min(interp(DEF_LINE, bx) + lift, -1, bx - 1.5), Math.min(interp(ATT_LINE, bx) + 0.4 * lift, 0), f);
  line = Math.max(line, -50.5);
  T.line = line;
  const squeeze = line < -40 ? lerp(0.6, 1, (line + 50.5) / 10.5) : 1;       // bloc très bas : lignes resserrées
  const ballSide = by > 6 ? 1 : by < -6 ? -1 : 0;
  const corner = m.corner && (m.mode === 'dead' || m.t < m.corner.until) ? m.corner : null;
  for (const p of T.players) {
    const s = slotOf(T, p.idx);
    let ax, ay;
    if (p.role === 'GK') {
      const gbx = b.x * d + P.HL, gby = b.y * d, dg = hyp(gbx, gby) || 1;
      const out = dg > 45 ? lerp(5.5, 12, clamp((dg - 45) / 40, 0, 1)) * (0.5 + 0.5 * f) * (1 + 0.35 * tac.line) : clamp(dg * 0.3, 1, lerp(4.5, 3, clamp((dg - 16) / 10, 0, 1)));      // bloc haut : le gardien joue plus avancé
      ax = Math.max(-P.HL + 0.4, -P.HL + gbx / dg * out); ay = gby / dg * out;
      if (m.wall && m.wall.team === T.id && m.t < m.wall.until) { ax = -P.HL + 1.2; ay = -clamp(m.wall.y * d / 5, -1, 1) * 1.3; }      // coup franc : sur sa ligne, du côté que le mur ne couvre pas
    } else {
      // consignes avec le ballon : largeur (ailes occupées ou non), jeu long (attaquants plus hauts), jeu court (on se rapproche du ballon)
      const yA = s.yA * (1 + (wide > 0 ? (s.side ? 0.13 : 0.3) : (s.side ? 0.28 : 0.3)) * wide), tuck = 1 - 0.7 * wide * f;
      ax = line + lerp(s.dD * (1 - 0.18 * wait), s.dA * (s.role === 'FWD' ? 1 + 0.15 * long : 1), f) * squeeze;
      ay = lerp(s.yD * fit * (1 - 0.1 * wait), yA, f) + by * lerp(s.role === 'DEF' ? 0.42 : s.role === 'MID' ? 0.5 : 0.55, 0.3 + 0.12 * short, f);
      if (s.role !== 'DEF') ax += (bx - ax) * 0.2 * short * f;
      if (hunt) { if (s.role !== 'DEF') ax += (bx - 3 - ax) * 0.2 * hunt; ay += (by - ay) * (s.role === 'DEF' ? 0.08 : 0.15) * hunt; }
      if (s.role === 'DEF' && s.side !== 0) {
        if (f > 0.5 && s.side === ballSide && bx > -10) ax += 12 * (f - 0.5);     // le latéral côté ballon monte
        if (s.side === -ballSide) ay -= s.side * 4 * tuck;                       // l'autre resserre
      }
      if (s.role === 'MID' && s.side !== 0 && s.side === -ballSide) {
        ay -= s.side * 5 * tuck; if (f > 0.5 && bx > 20) { ay -= s.side * 6 * tuck; ax += 4; }
        if (f >= 0.5 && bx > 28 && Math.abs(by) > 12) { ax = Math.max(ax, P.HL - 9.5); ay = s.side * 6.5; }      // centre possible : il plonge au second poteau
      }
      if (s.role === 'FWD') {
        if (f >= 0.5 && bx > 28 && Math.abs(by) > 12) { ax = Math.max(ax, P.HL - 11.5); ay = (s.slot === 'LF' ? -1 : 1) === ballSide ? ballSide * 3.5 : -ballSide * 4; }   // centre possible : dans la surface
      }
      if (f > 0.3) ax = Math.min(ax, T.offLine - (s.role === 'FWD' ? 3 : 1));      // rester en jeu, avec un peu d'élan devant soi
    }
    if (corner) { const c = cornerSpot(p, T, corner); if (c) { ax = c[0]; ay = c[1]; } }
    const yMax = 30.5 + 1.5 * Math.max(0, wide);
    ax = clamp(ax, -P.HL + 0.4, P.HL - 3); ay = clamp(ay, -yMax, yMax);
    if (R && R.type === 'kickoff') {
      ax = Math.min(ax, -1.2);
      if (T.id !== R.team && hyp(ax, ay) < P.CIRCLE_R + 0.6) { const n = hyp(ax, ay) || 1; ax = Math.min(-1.2, ax / n * (P.CIRCLE_R + 0.6)); ay = (ay / n || 1) * Math.sqrt(Math.max(0, (P.CIRCLE_R + 0.6) ** 2 - ax * ax)); }
      if (T.id === R.team && s.slot === 'RF') { ax = -0.8; ay = 2.5; }
    }
    if (R && R.type === 'penalty' && p.role !== 'GK') {
      const att = T.id === R.team;
      if (att) ax = Math.min(ax, P.HL - P.BOX_D - 1.5); else ax = Math.max(ax, -P.HL + P.BOX_D + 1.5);
    }
    if (R && R.type === 'penalty' && p.role === 'GK' && T.id !== R.team) { ax = -P.HL + 0.3; ay = 0; }
    p.ax = ax * d; p.ay = ay * d;
  }
}

// positions sur corner (repère relatif), n = +1 du côté du corner
function cornerSpot(p, T, c) {
  const att = T.id === c.team, n = c.side * T.dir || 1, s = p.slot;
  if (att) {
    if (s === 'LF') return [47, n * 2.5]; if (s === 'RF') return [43, -n]; if (s === 'LCB') return [45.5, -n * 4.5]; if (s === 'RCB') return [41, n * 5.5];
    if (s === 'LCM') return [34, n * 4]; if (s === 'RCM') return [3, 0]; if (s === 'LB') return [-10, -13]; if (s === 'RB') return [-10, 13];
    if (p.role === 'MID' && p.side === -n) return [38.5, -n * 9];
    return null;
  }
  if (s === 'GK') return [-52, -n * 0.6];
  if (s === 'LB') return [-48.5, -5]; if (s === 'LCB') return [-48, -1.5]; if (s === 'RCB') return [-48, 2]; if (s === 'RB') return [-48.5, 5.5];
  if (s === 'LCM') return [-44.5, -3]; if (s === 'RCM') return [-44.5, 3.5]; if (s === 'LF') return [-37, n * 2]; if (s === 'RF') return [-18, 0];
  return p.side === n ? [-47, n * 10] : [-42, -n * 8];
}

// ---------- trajectoire prévue du ballon et temps d'interception de chaque joueur ----------
function predict(m) {
  const b = m.ball, s = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, dip: b.dip }, path = m.path;
  path.length = 0; path.push({ x: s.x, y: s.y, z: s.z, t: 0 });
  for (let i = 1; i <= 110; i++) {
    ballStep(s, DT);
    path.push({ x: s.x, y: s.y, z: s.z, t: i * DT });
    if (Math.abs(s.x) > P.HL + 0.5 || Math.abs(s.y) > P.HW + 0.5) break;
    if (s.z === 0 && s.vx * s.vx + s.vy * s.vy < 0.05) break;
  }
  for (const p of m.players) m.icpt[p.id] = intercept(m, p);
  m.icptTick = m.tick;
}
function intercept(m, p) {
  const path = m.path, keeper = p.role === 'GK' && inOwnBox(m.teams[p.team], p.x, p.y);
  const reach = keeper ? 1.1 : 0.7, zMax = keeper ? 2.6 : 2.3, vmax = topSpeed(p);
  for (let i = 0; i < path.length; i++) {
    const q = path[i]; if (q.z > zMax) continue;
    const dd = hyp(q.x - p.x, q.y - p.y) - reach;
    if (dd > q.t * vmax + 1e-6) continue;                    // même à pleine vitesse il n'y serait pas : inutile de calculer plus finement
    if (dd <= 0 || timeToCover(m, p, dd, q.x, q.y) <= q.t) return { t: q.t, x: q.x, y: q.y, z: q.z };
  }
  const q = path[path.length - 1], dd = Math.max(0, hyp(q.x - p.x, q.y - p.y) - reach);
  return { t: Math.max(q.t, timeToCover(m, p, dd, q.x, q.y)), x: q.x, y: q.y, z: q.z };
}

// ---------- le cerveau de chaque joueur ----------
function setIntent(m, p, type, label, tx, ty, urg) {
  const it = p.intent;
  if (it.type !== type) it.since = m.t;
  it.type = type; it.label = label; it.tx = tx; it.ty = ty; it.urg = urg; it.note = null; it.hunt = false; it.cover = null;
}
// ce que la fiche du joueur affichera : il suit une consigne de son entraîneur, ou il s'en écarte
function note(p, key, v, against) { p.intent.note = (against ? 'Malgré la consigne : ' : 'Consigne : ') + tacNote(key, v); }
// les joueurs ne réagissent pas tous au même instant : chacun a son temps de réaction
function react(m, quick) {
  for (const p of m.players) { const r = (0.10 + 0.28 * (1 - p.a.anticipation)) * (0.6 + 0.8 * m.rng()) * (p === quick ? 0.4 : 1); if (p.nextThink > m.t + r) p.nextThink = m.t + r; }
}
function threat(m) {
  const b = m.ball;
  if (b.owner) return { x: b.owner.x, y: b.owner.y, player: b.owner };
  if (m.pass && m.pass.to && m.icpt[m.pass.to.id]) { const ic = m.icpt[m.pass.to.id]; return { x: ic.x, y: ic.y, player: m.pass.to }; }
  return { x: b.x, y: b.y, player: null };
}
function pressure(m, p) {
  let dmin = 99;
  for (const o of m.teams[1 - p.team].players) { if (o.stunUntil > m.t) continue; const dd = hyp(o.x - p.x, o.y - p.y) - closeIn(o); if (dd < dmin) dmin = dd; }
  return clamp(1 - (dmin - 1.3) / 4.5, 0, 1);
}
// un presseur vif, agressif et qui anticipe ferme mieux le porteur : il pèse comme s'il était plus près (rien à 14)
const closeIn = o => PRESS_Q * ((o.a.accel - LEVEL) + (o.a.anticipation - LEVEL) + (o.a.aggression - LEVEL)) / 3;
// pression ressentie au moment de frapper vers (gx, 0) : un adversaire dans le dos compte comme s'il était un tiers plus loin
function shotPressure(m, p, gx) {
  let dmin = 99; const ux = gx - p.x, uy = -p.y;
  for (const o of m.teams[1 - p.team].players) { if (o.stunUntil > m.t) continue; const rx = o.x - p.x, ry = o.y - p.y; let dd = hyp(rx, ry); if (rx * ux + ry * uy < 0) dd *= 1.35; if (dd < dmin) dmin = dd; }
  return clamp(1 - (dmin - 1.3) / 4.5, 0, 1);
}
function oppDist(O, x, y) { let dmin = 99; for (const o of O.players) { const dd = hyp(o.x - x, o.y - y); if (dd < dmin) dmin = dd; } return dmin; }

function think(m, p) {
  const base = p.role === 'GK' ? 0.16 : (0.36 - 0.14 * p.a.decisions) * (1 + 0.6 * (1 - p.stam));      // fatigué, on réagit moins vite
  p.nextThink = m.t + base * (0.75 + 0.5 * m.rng());
  const sd = 1.6 * (1.3 - p.a.positioning);                 // petit écart personnel à la position théorique
  p.driftX = p.driftX * 0.9 + m.gauss() * sd * 0.44; p.driftY = p.driftY * 0.9 + m.gauss() * sd * 0.44;
  if (p.stunUntil > m.t) return;
  const w = m.wall;
  if (w && m.t < w.until && w.spots[p.id]) return setIntent(m, p, 'position', 'Dans le mur', w.spots[p.id][0], w.spots[p.id][1], 0.6);
  if (m.mode === 'dead') return thinkRestart(m, p);
  const b = m.ball;
  if (b.owner === p) return thinkCarrier(m, p);
  if (p.role === 'GK') return thinkKeeper(m, p);
  if (!b.owner) {
    if (m.pass && m.pass.to === p) return setIntent(m, p, 'receive', 'Va chercher la passe', b.x, b.y, 0.9);
    if (wantsChase(m, p)) return setIntent(m, p, 'chase', 'Va au ballon', b.x, b.y, 1);
  }
  const attacking = m.poss < 0 ? m.teams[p.team].phase > 0.5 : m.poss === p.team;
  if (attacking) thinkSupport(m, p); else thinkDefend(m, p, false);
}

function wantsChase(m, p) {
  const me = m.icpt[p.id]; if (!me) return false;
  const pass = m.pass, T = m.teams[p.team], chasing = p.intent.type === 'chase';
  const noise = () => 0.12 * (1.3 - p.a.anticipation) * m.gauss();
  if (pass && pass.to && pass.kind === 'pass') {
    const rec = m.icpt[pass.to.id];
    if (pass.to.team === p.team) return me.t < rec.t - 0.8;                       // un coéquipier est servi
    if (me.t > rec.t - 0.05 + noise() + (chasing ? 0.25 : 0)) return false;       // je n'arriverai pas avant lui
  }
  let better = 0;
  for (const q of T.players) {
    if (q === p || (q.role === 'GK' && !inOwnBox(T, me.x, me.y))) continue;
    if (m.icpt[q.id].t + noise() < me.t - (chasing ? 0.45 : 0.12)) better++;
  }
  return better === 0 || (better === 1 && me.x * T.dir < -25);
}

function pressCost(m, q, th, gx) {
  let ux = gx - th.x, uy = -th.y; const n = hyp(ux, uy) || 1; ux /= n; uy /= n;
  const tx = th.x + ux * 1.5, ty = th.y + uy * 1.5;
  let c = timeToCover(m, q, hyp(tx - q.x, ty - q.y), tx, ty);
  if (q.role === 'DEF' && q.side === 0 && n > 30) c += 1.0;      // un central ne sort pas au milieu de terrain
  if (q.role === 'GK') c += 99;
  if (q.intent.type === 'press') c -= 0.4;
  return c;
}

function thinkDefend(m, p, noPress) {
  const T = m.teams[p.team], O = m.teams[1 - p.team], d = T.dir, b = m.ball;
  const gx = -P.HL * d, th = threat(m), c = th.player;
  const dGoalTh = hyp(th.x - gx, th.y);
  const ax = p.ax + p.driftX, ay = p.ay + p.driftY;
  let held = false;
  if (!noPress && c && c.team !== p.team && !(c.protectedUntil > m.t)) {
    const mine = pressCost(m, p, th, gx);
    let rank = 0;
    const k = T.tac.press, spare = q => k < 0 && q.role === 'FWD' && hyp(th.x - q.x, th.y - q.y) > 4;      // « attendre » : les attaquants ne courent pas après le ballon, ils gardent leurs forces
    for (const q of T.players) if (q !== p && !spare(q) && pressCost(m, q, th, gx) + 0.1 * m.gauss() < mine) rank++;
    const dAnch = hyp(th.x - p.ax, th.y - p.ay), dMe = hyp(th.x - p.x, th.y - p.y);
    // consigne « pressing » : la zone où l'on sort sur le porteur grandit ou rétrécit, surtout pour les attaquants
    const own = k < 0 ? clamp((th.x * d + 5) / 25, 0, 1) : 1;       // « attendre » : on laisse l'adversaire tranquille chez lui, on défend normalement chez soi
    const reach = (1 + (p.role === 'DEF' ? 0.3 : p.role === 'FWD' ? 0.8 : 0.5) * k * own) * (0.6 + 0.4 * p.stam);      // fatigué, on sort moins loin
    const zone0 = (p.role === 'DEF' ? 11 : 15) + (p.intent.type === 'press' ? 5 : 0), zone = zone0 * reach;
    const deep = th.x * d < -17.5, tooFar = k < 0 && th.x * d > 15 + 40 * (1 + k);      // « attendre » : on ne sort pas dans le camp adverse
    // contre-pressing : juste après la perte du ballon, un joueur qui court et lit le jeu (au-dessus de 14) saute sur le porteur
    const cpq = clamp(((p.a.workRate + p.a.anticipation) / 2 - LEVEL) / 0.15, 0, 1) * (0.5 + 0.5 * p.stam);
    if (cpq > 0 && rank <= 1 && m.holder === 1 - p.team && m.t - m.possSince < 2 + 3 * cpq && dMe < 8 + 8 * cpq && !spare(p))
      return setIntent(m, p, 'press', 'Contre-presse le n°' + c.num, th.x, th.y, 1);
    if (rank === 0 && !tooFar && !spare(p) && (dAnch < zone || deep || dMe < 5 * (1 + 0.4 * k * own))) {
      setIntent(m, p, 'press', 'Presse le n°' + c.num, th.x, th.y, 1);
      if (k > 0 && !(dAnch < zone0 || deep || dMe < 5)) note(p, 'press', k);     // sans la consigne, il serait resté à son poste
      return;
    }
    if (rank === 0 && k < 0 && (dAnch < zone0 || dMe < 5)) held = true;            // sans la consigne, il serait sorti
    if (rank === 1 && deep && dMe < 12 && !spare(p) && T.players.some(q => q.intent.type === 'press' && m.t - q.intent.since > 2.5)) return setIntent(m, p, 'press', 'Vient aider sur le n°' + c.num, th.x, th.y, 1);
    if (rank === 1 && k > 0 && dMe < 14 * k && dAnch < zone) { setIntent(m, p, 'press', 'Presse à deux le n°' + c.num, th.x, th.y, 1); note(p, 'press', k); return; }      // « harceler » : un deuxième joueur sort aussi
    if (rank === 1 && dGoalTh < 42 && dAnch < zone + 6) {
      const ux = gx - th.x, uy = -th.y, n = hyp(ux, uy) || 1;
      return setIntent(m, p, 'position', 'Couvre son coéquipier', lerp(ax, th.x + ux / n * 6.5, 0.6), lerp(ay, th.y + uy / n * 6.5, 0.6), 0.75);
    }
  }
  // l'axe ballon-but : un porteur adverse approche du but et personne n'est entre lui et le but ?
  // Le défenseur le mieux placé pour fermer cet axe y va (il contient ou presse) au lieu de suivre un appel.
  if (!noPress && p.role === 'DEF' && c && b.owner === c && c.team !== p.team && dGoalTh < AXIS_D) {
    const ux = (gx - th.x) / dGoalTh, uy = -th.y / dGoalTh;
    const guards = q => { const rx = q.x - th.x, ry = q.y - th.y, s = rx * ux + ry * uy; return s > 0.3 && s < Math.min(12, dGoalTh) && Math.abs(rx * uy - ry * ux) < 1.5 + 0.25 * s; };
    if (!T.players.some(q => q !== p && q.role !== 'GK' && guards(q))) {
      const kx = th.x + ux * 3, ky = th.y + uy * 3, mine = timeToCover(m, p, hyp(kx - p.x, ky - p.y), kx, ky);
      if (!T.players.some(q => q !== p && q.role === 'DEF' && timeToCover(m, q, hyp(kx - q.x, ky - q.y), kx, ky) < mine))
        return setIntent(m, p, 'press', 'Ferme l\'axe du but face au n°' + c.num, th.x, th.y, 1);
    }
  }
  // ombre de l'attaquant : l'adversaire construit chez lui ; l'attaquant qui ne presse pas se place entre le porteur et le milieu adverse libre le plus proche
  if (!noPress && p.role === 'FWD' && c && b.owner === c && c.team !== p.team && th.x * d > 5) {
    let tgt = null, td = 14;
    for (const o of O.players) {
      if (o === c || o.role !== 'MID' || (o.x - p.ax) * d > 3 || (p.ax - o.x) * d > 16) continue;
      const dd = hyp(o.x - p.ax, o.y - p.ay);
      if (dd < td && !T.players.some(q => q !== p && (q.intent.cover === o || (q.role === 'MID' && hyp(q.x - o.x, q.y - o.y) < 4)))) { td = dd; tgt = o; }
    }
    if (tgt) { setIntent(m, p, 'position', 'Coupe la passe vers le n°' + tgt.num, tgt.x + (c.x - tgt.x) * 0.35, tgt.y + (c.y - tgt.y) * 0.35, 0.6); p.intent.cover = tgt; return; }
  }
  // marquage : l'adversaire le plus dangereux de ma zone
  const kHunt = Math.max(0, T.tac.press) * clamp((th.x * d + 25) / 20, 0, 1) * (0.5 + 0.5 * p.stam); let hunting = false;      // fatigué, on harcèle moins
  const zoneR = (p.role === 'DEF' ? 13 : 10) * (1 + 0.3 * kHunt);
  let best = null, bs = 0, bd = 0;
  for (const o of O.players) {
    if (o.role === 'GK' || o === c) continue;
    const running = o.intent.type === 'run' && p.role === 'DEF';
    const dd = hyp(o.x - p.ax, o.y - p.ay) * (running ? 0.6 : 1); if (dd > zoneR) continue;
    const s = (1 - dd / zoneR) * (1.2 - clamp(hyp(o.x - gx, o.y) / 60, 0, 1)) * (running ? 1.5 : 1);
    if (s > bs) { bs = s; best = o; bd = dd; }
  }
  let tx = ax, ty = ay, label = 'Garde sa zone';
  if (best) {
    const og = hyp(best.x - gx, best.y) || 1;
    let tight = clamp(1.1 - og / 45, 0.25, 1) * (p.role === 'DEF' ? 1 : p.role === 'MID' ? 0.7 : 0.3);
    // centre possible (ballon sur un côté près de sa surface) : défenseurs et milieux serrent les attaquants présents dans la surface
    const crossing = th.x * d < -P.HL + 30 && Math.abs(th.y) > 13 && inOwnBox(T, best.x, best.y) && p.role !== 'FWD';
    if (crossing) tight = Math.max(tight, CROSS_MARK);
    if (kHunt && hyp(best.x - th.x, best.y - th.y) < 20) { tight = Math.max(tight, 0.45 + 0.25 * kHunt); hunting = true; }      // « harceler » : on colle les solutions de passe proches
    const md = 1.2 + 2.5 * (1 - tight);
    const ob = hyp(b.x - best.x, b.y - best.y) || 1;
    const mx = best.x + (gx - best.x) / og * md + (b.x - best.x) / ob * 0.8, my = best.y + (0 - best.y) / og * md + (b.y - best.y) / ob * 0.8;
    let w = clamp((1 - bd / zoneR) * 1.4, 0, 1) * tight, lx = 0, ly = 0;
    if (best.intent.type === 'run' && p.role === 'DEF') { w = Math.max(w, 0.9); lx = best.vx * 0.5; ly = best.vy * 0.5; }      // il anticipe la course
    tx = lerp(ax, mx + lx, w); ty = lerp(ay, my + ly, w);
    if (w > 0.3) label = (lx || ly ? 'Suit l\'appel du n°' : 'Marque le n°') + best.num;
  }
  let urg = 0.35, calm = false;
  if (hyp(th.x - p.x, th.y - p.y) < 25) urg = 0.6;
  if (dGoalTh < 35 && p.role !== 'FWD') urg = 0.75;
  const chased = best && best.intent.type === 'run' && p.role === 'DEF';
  if ((tx - p.x) * d < -6 || chased) {
    // « attendre » : tant que le ballon est loin et encore devant lui, il rentre dans le bloc sans sprinter
    if (T.tac.press < 0 && !chased && dGoalTh > 40 && (th.x - p.x) * d > 5) { urg = Math.max(urg, 0.7); if (!best) label = 'Rentre dans le bloc'; calm = true; }
    else { urg = Math.max(urg, 0.95); if (!best) label = 'Se replie'; }
  }
  if (kHunt && hyp(th.x - p.x, th.y - p.y) < 28) { urg = Math.min(1, urg + 0.2 * kHunt); hunting = true; }
  setIntent(m, p, 'position', label, tx, ty, urg);
  p.intent.hunt = hunting;
  if (hunting && !held) note(p, 'press', T.tac.press);
  if (held || calm) note(p, 'press', T.tac.press);
}

// marge minimale (m) laissée par les adversaires autour d'une ligne de passe
function laneOpen(O, bx, by, qx, qy) {
  const dx = qx - bx, dy = qy - by, D = hyp(dx, dy) || 1, ux = dx / D, uy = dy / D; let mn = 9;
  for (const o of O.players) { const rx = o.x - bx, ry = o.y - by, s = rx * ux + ry * uy; if (s < 1 || s > D + 1) continue; const v = Math.abs(rx * uy - ry * ux) - 0.22 * s; if (v < mn) mn = v; }
  return mn;
}

function thinkSupport(m, p) {
  const T = m.teams[p.team], O = m.teams[1 - p.team], d = T.dir, b = m.ball, it = p.intent;
  const th = threat(m), carrier = b.owner && b.owner.team === p.team ? b.owner : null;
  const ax = p.ax + p.driftX, ay = p.ay + p.driftY;
  if (it.type === 'run' && m.t < it.until) return;
  const dB = hyp(ax - th.x, ay - th.y);
  // consigne « jeu de passes » : en jeu long on multiplie les appels et on les lance de plus loin ; en jeu court on reste à portée du porteur
  const kp = T.tac.passing, long = Math.max(0, kp), short = Math.max(0, -kp), runs = 1 + 0.9 * long - 0.4 * short, gap = 1 - 0.4 * long + 0.3 * short;
  // appel en profondeur
  if ((p.role === 'FWD' || (p.role === 'MID' && p.side !== 0)) && carrier && !carrier.setPiece && dB < 38 + 14 * long && th.x * d > -15 - 18 * long && m.t > p.nextRunAt
      && T.offLine < P.HL - 14 && pressure(m, carrier) < 0.7 && m.rng() < (0.08 + 0.22 * p.a.offBall) * runs) {
    const tx = Math.min(T.offLine + 14, 46) * d, ty = clamp(p.y * 0.55 + 4 * m.gauss(), -26, 26);
    setIntent(m, p, 'run', 'Appel en profondeur', tx, ty, 1);
    it.until = m.t + 2.2; p.nextRunAt = m.t + 6 * gap + 6 * m.rng() * gap;
    if (long && !(dB < 38 && th.x * d > -15)) note(p, 'passing', kp);
    return;
  }
  let bx = ax, by = ay, bsc = -1e9;
  if (dB < 34) {
    const rings = dB < 20 ? [0, 5, 9] : [0, 5];
    for (const r of rings) for (let k = 0; k < (r ? 8 : 1); k++) {
      const qx = ax + r * Math.cos(k * Math.PI / 4), qy = ay + r * Math.sin(k * Math.PI / 4);
      if (Math.abs(qx) > 51.5 || Math.abs(qy) > 33) continue;
      const rx = qx * d; if (rx > T.offLine - 0.6) continue;
      const dq = hyp(qx - th.x, qy - th.y);
      let s = 0.8 * clamp(oppDist(O, qx, qy) / 9, 0, 1);                         // de l'espace
      s += clamp(laneOpen(O, th.x, th.y, qx, qy) / 3, -1, 1);                    // une ligne de passe ouverte
      if (dq < 7) s -= (7 - dq) * 0.25;                                          // pas dans les pieds du porteur
      s -= 0.012 * r * r;                                                        // sans trop quitter son poste
      s += 0.03 * (rx - ax * d) * (p.role === 'FWD' ? 1.3 : 1) * (1 + 0.5 * long);  // de préférence vers l'avant
      if (short && dq > 12) s -= 0.03 * short * (dq - 12);                       // jeu court : à portée d'une passe courte
      for (const q of T.players) { if (q === p || q === carrier) continue; const dm = hyp(qx - q.x, qy - q.y); if (dm < 8) s -= (8 - dm) * 0.08; }
      if (hyp(qx - it.tx, qy - it.ty) < 2.5) s += 0.15;                          // ne change pas d'avis sans raison
      if (s > bsc) { bsc = s; bx = qx; by = qy; }
    }
  }
  const moved = hyp(bx - ax, by - ay) > 2;
  setIntent(m, p, 'position', moved ? 'Se démarque' : dB < 34 ? 'Propose une solution' : 'Garde sa position', bx, by, (dB < 20 ? 0.6 : dB < 34 ? 0.45 : 0.3) + 0.12 * T.tac.tempo);      // rythme rapide : on bouge plus vite sans ballon
}

// le ballon file-t-il vers le cadre ? renvoie le point où il passe à la hauteur du gardien
function goalThreat(m, p) {
  const b = m.ball, d = m.teams[p.team].dir, path = m.path;
  if (b.vx * d > -6) return null;
  let at = null, last = null;
  for (let i = 0; i < path.length; i++) {
    const q = path[i];
    if (q.x * d <= -P.HL) return (Math.abs(q.y) < P.GOAL_HW + 1 && q.z < P.GOAL_H + 0.8) ? (at || last) : null;
    if (q.x * d <= p.x * d + 0.2) { last = q; if (!at && q.z <= 2.4) at = q; }
  }
  return null;
}

function thinkKeeper(m, p) {
  const b = m.ball, T = m.teams[p.team], O = m.teams[1 - p.team];
  if (!b.owner) {
    if (m.pass && m.pass.to === p) return setIntent(m, p, 'receive', 'Va chercher la passe', b.x, b.y, 0.9);
    const c = goalThreat(m, p);
    if (c) { if (p.intent.type !== 'save') p.saveAt = m.t + 0.04 + 0.08 * (1 - p.a.reflexes) + (m.shot && m.shot.masked ? MASK : 0); return setIntent(m, p, 'save', 'Plonge', c.x, c.y, 1); }      // derrière un mur, il voit partir le ballon en retard
    const me = m.icpt[p.id];
    if (me) {
      let tOpp = 99, tMate = 99;
      for (const o of O.players) tOpp = Math.min(tOpp, m.icpt[o.id].t);
      for (const q of T.players) if (q !== p) tMate = Math.min(tMate, m.icpt[q.id].t);
      const h = p.intent.type === 'claim' ? 0.3 : 0, box = inOwnBox(T, me.x, me.y);
      if ((box && me.t < tOpp - 0.15 + h && me.t < tMate + 0.4 + h) || (!box && hyp(me.x + P.HL * T.dir, me.y) < 30 && me.t < tOpp - 0.7 + h && me.t < tMate - 0.2 + h))
        return setIntent(m, p, 'claim', 'Sort sur le ballon', me.x, me.y, 1);
    }
  }
  const c = b.owner;
  if (c && c.team !== p.team && inOwnBox(T, c.x, c.y) && hyp(c.x - p.x, c.y - p.y) < (p.intent.type === 'claim' ? 11 : 8)) {
    const gx = -P.HL * T.dir, dc = hyp(c.x - gx, c.y); let covered = false;
    for (const q of T.players) if (q !== p && hyp(q.x - c.x, q.y - c.y) < 2.5 && hyp(q.x - gx, q.y) < dc) covered = true;      // un défenseur est déjà entre lui et le but
    if (!covered) return setIntent(m, p, 'claim', 'Sort dans les pieds', c.x, c.y, 1);
  }
  setIntent(m, p, 'position', 'Se place', p.ax, p.ay, 0.7);
}

function thinkRestart(m, p) {
  const R = m.restart, T = m.teams[p.team];
  if (p === R.taker) {
    const n = hyp(R.x, R.y) || 1, ux = R.x / n, uy = R.y / n;        // se place derrière le ballon, dos à la touche
    const off = R.type === 'kickoff' ? 0 : 0.5;
    const tx = R.type === 'kickoff' ? -0.5 * T.dir : R.x + ux * off, ty = R.type === 'kickoff' ? 0 : R.y + uy * off;
    return setIntent(m, p, 'toBall', 'Va jouer le ballon', tx, ty, 0.7);
  }
  const free = R.type === 'throwin' || R.type === 'freekick' || R.type === 'goalkick';
  if (p.role === 'GK' || !free) setIntent(m, p, 'position', 'Se replace', p.ax, p.ay, 0.4);
  else if (p.team === R.team) thinkSupport(m, p); else thinkDefend(m, p, true);
  // distance réglementaire
  const it = p.intent, need = p.team === R.team ? (R.type === 'kickoff' ? 0 : 3) : R.type === 'throwin' ? 2.5 : 9.6;
  const dd = hyp(it.tx - R.x, it.ty - R.y);
  if (dd < need) { const ux = dd > 0.1 ? (it.tx - R.x) / dd : -T.dir, uy = dd > 0.1 ? (it.ty - R.y) / dd : 0; it.tx = R.x + ux * need; it.ty = R.y + uy * need; }
  if (it.urg > 0.5) it.urg = 0.5;
}

// ---------- le porteur du ballon : il note ses options et choisit ----------
function passAcc(p, D, pr, off, lofted) {
  const e = (0.02 + 0.0035 * D) * (1.7 - 1.1 * p.a.passing) * (1 + 1.3 * pr) * (1 + 0.35 * off) * (lofted ? 1.7 : 1);
  return clamp(1 - e, 0.3, 0.995);
}
// probabilité qu'une passe au sol ne soit pas coupée en route
function laneProb(m, p, qx, qy, D, v0, O) {
  const ux = (qx - p.x) / D, uy = (qy - p.y) / D; let ok = 1;
  for (const o of O.players) {
    const rx = o.x - p.x, ry = o.y - p.y; let s = rx * ux + ry * uy;
    if (s < 0.5 || s > D + 0.5) continue;
    s = Math.min(s, D);
    const perp = Math.abs(rx * uy - ry * ux), keeper = o.role === 'GK' && inOwnBox(m.teams[o.team], o.x, o.y);
    const to = 0.25 + timeToCover(m, o, Math.max(0, perp - (keeper ? 1.2 : 0.9)), p.x + ux * s, p.y + uy * s);
    ok *= 1 - 0.95 * sigmoid(-(to - groundTime(v0, s)) / 0.18);
  }
  return ok;
}
// lecture du jeu : un joueur qui lit mal (vision faible) ne voit pas tous les adversaires qui peuvent couper sa passe
const misread = p => MISREAD * clamp((PANIC_V - p.a.vision) / PANIC_R, 0, 1);
const seenLane = (p, lane) => 1 - (1 - lane) * (1 - misread(p));
function fastestOpp(m, O, qx, qy) {
  let tO = 99;
  for (const o of O.players) { const keeper = o.role === 'GK' && inOwnBox(m.teams[o.team], qx, qy); const dd = Math.max(0, hyp(o.x - qx, o.y - qy) - (keeper ? 1.2 : 0.8)); const t = timeToCover(m, o, dd, qx, qy) + 0.25; if (t < tO) { tO = t; fastestOpp.who = o; fastestOpp.keeper = keeper; } }
  return tO;
}

function passOption(m, p, q, pr, sp, hands, risk) {
  const T = m.teams[p.team], O = m.teams[1 - p.team], d = T.dir, b = m.ball, a = p.a;
  const D0 = hyp(q.x - p.x, q.y - p.y), all = [];
  if (D0 < 3.5) return all;
  const exempt = sp === 'throwin' || sp === 'goalkick' || sp === 'corner';
  if (!exempt && q.x * d > T.offLine + 0.2 && m.rng() < 0.75 + 0.25 * a.vision) return all;      // il voit que le partenaire est hors-jeu
  const off0 = Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.face));
  const off = Math.max(0, off0 - 8 * (0.10 + 0.22 * off0 / Math.PI));                              // il aura le temps de se tourner avant de frapper
  const seen = 1;      // partenaire dans son dos : le risque de ne pas le voir est déjà compté par seesMate (vision), pas une deuxième fois ici
  const maxV = hands ? 16 : sp === 'throwin' ? 13 : 24;
  const keep = o => { all.push(o); };
  // floor : valeur plancher d'une passe vers un partenaire libre. Reculer coûte moins cher qu'avancer ne rapporte.
  const score = (pOk, qx, qy, space, lossX, lossY, scale, floor) => { const fwd = clamp((qx - p.x) * d, -15, 15); return pOk * Math.max(valueAt(T, qx, qy), floor || 0) * space * scale - (1 - pOk) * (valueAt(O, lossX, lossY) + TURNOVER) * risk + pOk * 0.0004 * scale * (fwd < 0 ? 0.3 * fwd : fwd); };
  // (A) dans les pieds
  {
    const v0 = Math.min(maxV, groundSpeedFor(D0, 8.5 + 0.04 * D0)), tb = groundTime(v0, D0);
    if (tb < 3.2) {
      const lead = Math.min(tb, 0.7) * 0.6, qx = q.x + q.vx * lead, qy = q.y + q.vy * lead, D = hyp(qx - p.x, qy - p.y) || 1;
      const dOpp = oppDist(O, qx, qy);
      const tol = clamp(1 - (dOpp - 2) / 10, 0.15, 1);                           // vers un partenaire seul, une passe imprécise arrive quand même
      // relance : donner à un partenaire libre garde la valeur de l'action, tant qu'on est en phase de construction (plafond)
      const keepV = Math.min(valueAt(T, p.x, p.y), 0.011) * clamp((dOpp - 3) / 9, 0, 1) * (q.role === 'GK' ? 0.95 : 1) * (1 - 0.4 * Math.max(0, T.tac.passing));      // jeu long : on relance moins par l'arrière
      const pOk = seenLane(p, laneProb(m, p, qx, qy, D, v0, O)) * (1 - (1 - passAcc(p, D, pr, off, false)) * tol) * (0.985 - 0.22 * clamp(1 - (dOpp - 0.8) / 2.5, 0, 1)) * seen;
      keep({ kind: 'pass', u: score(pOk, qx, qy, 0.72 + 0.28 * clamp(dOpp / 8, 0, 1), (p.x + qx) / 2, (p.y + qy) / 2, 1, keepV), to: q, qx, qy, v0, lofted: false, feet: true, pOk });
    }
  }
  if (q.role === 'GK') return all;
  // direction de course du partenaire : son élan, sinon le but
  let ux = P.HL * d - q.x, uy = -q.y * 0.5; let n = hyp(ux, uy) || 1; ux /= n; uy /= n;
  const sq = hyp(q.vx, q.vy);
  if (sq > 2) { ux = ux * 0.5 + q.vx / sq * 0.5; uy = uy * 0.5 + q.vy / sq * 0.5; n = hyp(ux, uy) || 1; ux /= n; uy /= n; }
  // (B) dans la course, au sol
  if (!hands && q.x * d > p.x * d - 8) for (const L of [9, 16]) {
    const qx = q.x + ux * L, qy = q.y + uy * L; if (Math.abs(qx) > 50.5 || Math.abs(qy) > 32.5) continue;
    const D = hyp(qx - p.x, qy - p.y); if (D < 8 || D > 45) continue;
    const tr = timeToCover(m, q, L, qx, qy) + 0.15;
    let v0 = maxV;
    if (groundTime(maxV, D) < tr) { let lo = 6, hi = maxV; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (groundTime(mid, D) > tr) lo = mid; else hi = mid; } v0 = hi; }
    v0 = Math.min(v0, groundSpeedFor(D, 7.5));                // pas trop appuyée : elle doit rester jouable à l'arrivée
    const tb = groundTime(v0, D), tArr = Math.max(tr, tb), tO = fastestOpp(m, O, qx, qy);
    const pOk = sigmoid((tO - tArr) / 0.3) * seenLane(p, laneProb(m, p, qx, qy, D, v0, O)) * passAcc(p, D, pr, off, false) * 0.97 * seen;
    keep({ kind: 'pass', u: score(pOk, qx, qy, 0.8 + 0.2 * clamp(tO - tArr, 0, 1), (p.x + qx) / 2, (p.y + qy) / 2, 1), to: q, qx, qy, v0, lofted: false, pOk });
  }
  // (C) en l'air
  if (D0 > 20 && sp !== 'throwin') for (const L of [0, 10]) {
    const qx = q.x + ux * L, qy = q.y + uy * L; if (Math.abs(qx) > 50.5 || Math.abs(qy) > 32.5) continue;
    const D = hyp(qx - p.x, qy - p.y); if (D < 18 || D > 62) continue;
    const lo = loftSolve(D, 28), tr = L ? timeToCover(m, q, L, qx, qy) + 0.15 : 0, tO = fastestOpp(m, O, qx, qy);
    const arrR = Math.max(tr, lo.t), arrO = Math.max(tO, lo.t);
    // tous deux sous le ballon avant lui : libre si le défenseur arrive bien après, sinon duel de la tête (et une tête gagnée ne garde pas toujours le ballon)
    const who = fastestOpp.who, free = sigmoid((tO - tr - 1.0) / 0.35);
    const duel = fastestOpp.keeper ? 0.1 : 0.75 * clamp(0.45 + 0.6 * (q.a.heading - who.a.heading), 0.15, 0.8);
    const win = arrR === arrO ? free + (1 - free) * duel : sigmoid((arrO - arrR) / 0.3);
    const pOk = win * passAcc(p, D, pr, off, true) * 0.85 * seen;
    keep({ kind: 'pass', u: score(pOk, qx, qy, 0.6 + 0.4 * clamp(oppDist(O, qx, qy) / 8, 0, 1), qx, qy, qx * d > P.HL - P.BOX_D && Math.abs(qy) < P.BOX_HW ? 0.9 : 0.6), to: q, qx, qy, v0: lo.v, lofted: true, elev: 28, pOk });
  }
  return all;
}

// Poids des consignes sur une option du porteur, en parts de l'enjeu du moment (0,3 = « 30 % plus tentant »).
// C'est un penchant, pas un interdit : une option nettement meilleure l'emporte quand même.
function intentBias(T, p, o, pr, waited) {
  const tac = T.tac, d = T.dir, kp = tac.passing, kt = tac.tempo, kw = tac.width, part = { passing: 0, tempo: 0, width: 0 };
  if (o.kind === 'pass') {
    const D = hyp(o.qx - p.x, o.qy - p.y), fwd = (o.qx - p.x) * d, cross = o.lofted && isCross(T, p);
    if (kp < 0) part.passing = -kp * (o.lofted ? (cross ? -0.25 : -0.45) : 0.25 * clamp((20 - D) / 12, -1, 1));
    else if (kp > 0) part.passing = kp * (o.lofted ? (cross ? 0 : 0.9 * clamp(fwd / 25, 0, 1) * clamp(o.pOk / 0.4, 0.2, 1)) : o.feet ? 0.15 * clamp(fwd / 20, 0, 1) - 0.2 * clamp((12 - fwd) / 12, 0, 1) : 0.3 * clamp(fwd / 15, 0, 1));
    if (kt > 0) part.tempo = 0.12 * kt; else if (kt < 0) part.tempo = kt * 0.3 * Math.max(0, 0.85 - o.pOk);
    if (kw) part.width = 0.15 * kw * clamp((Math.abs(o.qy) - 14) / 10, -1, 1) + (cross ? 0.3 * kw : 0);
  } else if (o.kind === 'hold') part.tempo = kt > 0 ? -0.5 * kt : -0.25 * kt * (1 - pr) * Math.max(0, 1 - waited / 2.5);
  else if (o.kind === 'dribble') part.tempo = kt > 0 ? -0.25 * kt * (1 - Math.max(0, o.dx * d)) : -0.12 * kt * (1 - pr);      // foncer vers l'avant reste du jeu rapide
  else if (o.kind === 'clear' && p.hands) part.passing = 0.5 * kp;
  let key = 'passing'; for (const k in part) if (Math.abs(part[k]) > Math.abs(part[key])) key = k;
  o.why = part[key] > 0.05 || part[key] < -0.25 ? key : null; o.against = part[key] < 0;      // pour la fiche du joueur : la consigne qui a le plus pesé
  return part.passing + part.tempo + part.width;
}
const isCross = (T, p) => Math.abs(p.y) > 16 && p.x * T.dir > 25;

function shotXg(m, p, pr) {
  const T = m.teams[p.team], O = m.teams[1 - p.team], gx = P.HL * T.dir;
  let xg = baseXg(T, p.x, p.y) * (1 - 0.6 * pr) * (0.58 + 0.4 * p.a.finishing);
  const D = hyp(gx - p.x, p.y) || 1, ux = (gx - p.x) / D, uy = -p.y / D;
  for (const o of O.players) { if (o.role === 'GK') continue; const rx = o.x - p.x, ry = o.y - p.y, s = rx * ux + ry * uy; if (s > 0.5 && s < Math.min(D, 12) && Math.abs(rx * uy - ry * ux) < 0.9) xg *= 0.65; }
  return clamp(xg, 0.003, 0.95);
}

// voit-il ce partenaire ? Proche et devant lui : toujours. Loin, dans son dos : ça dépend de sa vision et de la pression.
function seesMate(m, p, q, pr) {
  const D = hyp(q.x - p.x, q.y - p.y), off = Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.face));
  const hard = 0.5 * clamp((D - 15) / 30, 0, 1) + 0.5 * clamp((off - 1.0) / 1.8, 0, 1);
  if (hard <= 0) return true;
  return m.rng() >= hard * (0.3 + 0.9 * pr) * VISION * Math.pow(1 - p.a.vision, 1.5);
}

const DRIB = [0, 0.45, -0.45, 0.95, -0.95, 1.6, -1.6, 2.6, -2.6];
function thinkCarrier(m, p) {
  const b = m.ball, T = m.teams[p.team], O = m.teams[1 - p.team], a = p.a, rng = m.rng, d = T.dir;
  if (p.plan) return;
  if (m.t < p.controlReadyAt) { setIntent(m, p, 'control', p.turned ? 'Contrôle orienté' : 'Contrôle le ballon', p.x, p.y, 0.2); p.nextThink = p.controlReadyAt; return; }
  p.nextThink = m.t + 0.16 + 0.14 * rng();
  const sp = p.setPiece, hands = p.hands;
  if (hands && m.t < p.holdUntil) return setIntent(m, p, 'hold', 'Garde le ballon en main', p.x, p.y, 0.1);
  const pr = sp || hands ? 0 : pressure(m, p);
  const gx = P.HL * d, dGoal = hyp(gx - p.x, p.y);
  const vHere = valueAt(T, p.x, p.y), lossHere = valueAt(O, p.x, p.y) + TURNOVER, risk = (1.15 - 0.4 * a.flair) * (1 + LUCID * (a.decisions - LEVEL));      // un joueur lucide sait ce que coûte une passe forcée : il est plus prudent (rien à 14)
  const opts = [];
  if (sp === 'freekick') { if (dGoal < 31) { const xg = clamp(0.085 - 0.004 * (dGoal - 18), 0.03, 0.085) * clamp(1.5 - Math.abs(p.y) / 12, 0.25, 1); opts.push({ kind: 'shot', u: xg, xg }); } }      // coup franc direct
  else if ((!sp || sp === 'penalty') && !hands && dGoal < 28) { const xg = shotXg(m, p, sp ? 0 : shotPressure(m, p, gx)); opts.push({ kind: 'shot', u: sp === 'penalty' ? 9 : xg * (dGoal > 17 ? 1.35 : 1), xg }); }      // de loin, on tente sa chance un peu plus que ne le dit le calcul
  const groups = [], rest = [];
  // vision : un partenaire loin, dans le dos ou de l'autre côté peut passer inaperçu, surtout sous pression
  const blind = [];
  if (sp !== 'penalty') for (const q of T.players) {
    if (q === p) continue;
    if (!sp && !hands && !seesMate(m, p, q, pr)) { blind.push(q.name); continue; }
    const g = passOption(m, p, q, pr, sp, hands, risk); if (g.length) groups.push(g);
  }
  // panique : pressé, un joueur qui lit mal le jeu ne prend pas le temps et se débarrasse du ballon
  const panic = sp || hands ? 0 : pr * clamp((PANIC_V - a.vision) / PANIC_R, 0, 1);
  if (!sp && !hands) {
    const w = clamp(1 - dGoal / 45, 0, 1) * 0.9, base = Math.atan2(-p.y * w, gx - p.x), ds = Math.min(topSpeed(p) * 0.89, 7.8);
    for (const offA of DRIB) {
      const ang = base + offA, dx = Math.cos(ang), dy = Math.sin(ang), L = 5.5, qx = p.x + dx * L, qy = p.y + dy * L;
      if (Math.abs(qx) > P.HL - 1.2 || Math.abs(qy) > P.HW - 1.2) continue;
      let keepP = 1, free = 99;
      for (const o of O.players) {
        const rx = o.x - p.x, ry = o.y - p.y, dO = hyp(rx, ry); if (dO > 14) continue;
        if (dO < 5.8) keepP *= 1 - 0.5 * clamp(1 - (dO - 1.3) / 4.5, 0, 1) * (0.6 + 0.4 * (rx * dx + ry * dy) / (dO || 1));
        const s = clamp(rx * dx + ry * dy, 0, L), perp = hyp(rx - dx * s, ry - dy * s);
        if (perp < free && rx * dx + ry * dy > -0.5) free = perp;                    // seuls ceux qui sont devant ou à côté comptent
        const tO = 0.12 + timeToCover(m, o, Math.max(0, perp - 1.1), p.x + dx * s, p.y + dy * s);
        keepP *= 1 - sigmoid(-(tO - s / ds) / 0.22) * clamp(0.45 + 0.5 * (o.a.tackling - a.dribbling), 0.15, 0.8);
      }
      let u = keepP * valueAt(T, qx, qy) - (1 - keepP) * lossHere * risk + 0.0005 * (qx - p.x) * d - 0.0015 * Math.abs(angDiff(ang, p.face)) - 0.12 * vHere;
      if (p.intent.type === 'dribble' && p.intent.dx * dx + p.intent.dy * dy > 0.9) u += 0.001;
      const stroll = p.role === 'DEF' && p.x * d < 0 && pr < 0.2;      // un défenseur libre dans son camp avance sans courir
      rest.push({ kind: 'dribble', u, dx, dy, stroll, speed: stroll ? JOG + 0.6 : free > 6 ? ds : Math.min(ds, RUN * (0.95 + 0.2 * a.pace)) });
    }
    const waited = p.intent.type === 'hold' ? m.t - p.intent.since : 0;
    rest.push({ kind: 'hold', u: vHere * (1 - 0.5 * pr - Math.min(0.9, 0.35 * waited)) * (1 - panic) - pr * 0.6 * lossHere * risk - 0.0008, waited });
    if (p.x * d < -18 && pr > 0.5 || panic > 0.3 && p.x * d < 15) rest.push({ kind: 'clear', u: -0.008 + 0.014 * panic, panic: panic > 0.3 });
  }
  if (hands) rest.push({ kind: 'clear', u: 0.004 });
  const tac = T.tac;
  let ref = 0.004, natural = null;                           // l'enjeu du moment, et ce qu'il ferait sans consigne
  for (const g of groups) for (const o of g) if (o.u > ref) { ref = o.u; natural = o; }
  for (const o of rest) if (o.u > ref) { ref = o.u; natural = o; }
  // un joueur libre prend le temps de lever la tête : juste après avoir reçu le ballon, la passe le tente moins
  if (!sp && !hands) {
    const calm = (1 - pr) * (1 - pr) * Math.max(0, 1 - (m.t - p.gotBallAt) / (3.5 * (1 - 0.6 * tac.tempo))) * clamp((20 - p.x * d) / 20, 0, 1);      // sauf près du but adverse
    const early = 1 - 0.7 * Math.max(0, tac.passing);        // jeu long : pas besoin d'attendre pour allonger
    if (calm > 0) for (const g of groups) for (const o of g) o.u -= ref * calm * (o.feet ? 1 : early);
  }
  // impatience : plus la possession dure sans rien donner, plus on accepte de tenter vers l'avant (plus tôt à rythme rapide)
  if (!sp && !hands) {
    const hurry = 0.5 * clamp((m.t - m.possSince - 8 * (1 + PATIENCE * (a.decisions - LEVEL)) * (1 - 0.4 * tac.tempo) * (1 - 0.5 * Math.max(0, tac.passing))) / 12, 0, 1);
    if (hurry > 0) {
      for (const g of groups) for (const o of g) { const fwd = (o.qx - p.x) * d; if (fwd > 4) o.u += ref * hurry * clamp(fwd / 15, 0, 1); }
      for (const o of rest) if (o.kind === 'dribble' && o.dx * d > 0.5) o.u += ref * hurry * 0.5;
    }
  }
  // conduire sous pression : seul un joueur sûr de sa prise de balle, de son dribble et de son physique s'y risque ; les autres cherchent la passe, souvent en retrait
  if (!sp && !hands && pr > 0) {
    const q = (a.firstTouch + a.dribbling + (a.pace + a.accel) / 2) / 3, k = pr * CARRY * clamp((CARRY_Q - q) / 0.35, 0, 1) * clamp((15 - p.x * d) / 30, 0, 1);
    if (k > 0) {
      for (const o of rest) if (o.kind === 'dribble') o.u -= ref * k;
      for (const g of groups) for (const o of g) if (o.feet && (o.qx - p.x) * d < -3) { o.u += ref * k * SAFE_BACK; o.safe = k > 0.25; }
    }
  }
  // consignes de l'entraîneur : elles rendent certaines options plus ou moins tentantes
  if (tac.passing || tac.tempo || tac.width) {
    for (const g of groups) for (const o of g) o.u += ref * intentBias(T, p, o, pr, 0);
    if (!sp) for (const o of rest) o.u += ref * intentBias(T, p, o, pr, o.waited || 0);
  }
  for (const g of groups) { let best = g[0]; for (const o of g) if (o.u > best.u) best = o; opts.push(best); }      // une seule passe par partenaire : la meilleure
  for (const o of rest) opts.push(o);
  if (!opts.length) return setIntent(m, p, 'hold', 'Cherche une solution', p.x, p.y, 0.1);
  // choix : la meilleure option le plus souvent, mais pas toujours (lucidité, pression)
  let top = -1e9, sum = 0; for (const o of opts) if (o.u > top) top = o.u;
  const tau = (0.03 + 0.08 * (1 - a.decisions) + 0.08 * pr * (1 - a.composure) + 0.12 * panic) * Math.max(Math.abs(top), 0.004);      // l'écart toléré se mesure à l'enjeu
  for (const o of opts) { o.w = Math.exp((o.u - top) / tau); sum += o.w; }
  let r = rng() * sum, pick = opts[0]; for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
  cnt(m, 'choix.' + pick.kind);
  if (m.onChoice) m.onChoice(p, opts, pick, pr);      // point d'écoute pour les outils de mesure (aucun effet sur le match)
  if (pick.why && !pick.against && pick === natural) pick.why = null;      // il l'aurait fait de toute façon
  const why = () => { if (pick.why) note(p, pick.why, tac[pick.why], pick.against); };

  if (pick.kind === 'dribble') { setIntent(m, p, 'dribble', pick.stroll ? 'Avance avec le ballon' : 'Conduit le ballon', p.x + pick.dx * 6, p.y + pick.dy * 6, 0.8); p.intent.dx = pick.dx; p.intent.dy = pick.dy; p.intent.speed = pick.speed; why(); return; }
  if (pick.kind === 'hold') {
    setIntent(m, p, 'hold', pr > 0.4 ? 'Protège le ballon' : 'Lève la tête', p.x, p.y, 0.1);
    why();
    p.intent.shield = null;
    if (pr > 0.4) { let dn = 99, no = null; for (const o of O.players) { const dd = hyp(o.x - p.x, o.y - p.y); if (dd < dn) { dn = dd; no = o; } } p.intent.shield = Math.atan2(p.y - no.y, p.x - no.x); }      // dos à l'adversaire
    return;
  }
  let ang, label;
  if (pick.kind === 'pass') { ang = Math.atan2(pick.qy - p.y, pick.qx - p.x); label = (pick.lofted ? (isCross(T, p) ? 'Centre vers ' : 'Long ballon vers ') : pick.safe ? 'Pressé, assure en retrait vers ' : pick.feet ? 'Passe à ' : 'Passe en profondeur pour ') + pick.to.name; }
  else if (pick.kind === 'shot') { ang = Math.atan2(-p.y, gx - p.x); label = 'Tire au but'; }
  else { ang = Math.atan2((p.y >= 0 ? 1 : -1) * 0.35 * d, d) + 0.15 * m.gauss(); label = pick.panic ? 'Pressé, se débarrasse du ballon' : 'Dégage'; }
  const turn = Math.abs(angDiff(ang, p.face));
  pick.ang = ang; pick.at = m.t + 0.10 + 0.22 * turn / Math.PI + (pick.kind === 'shot' ? 0.12 : 0) + (sp ? 0.3 : 0);
  pick.firstTime = p.firstTime && m.t - p.gotBallAt < 0.25;
  p.plan = pick;
  setIntent(m, p, 'kick', label, p.x, p.y, 0.3);
  why();
  if (!p.intent.note && blind.length) p.intent.note = 'Ne voit pas ' + blind.join(', ');      // fiche du joueur : les partenaires qui lui ont échappé
  if (pick.kind === 'pass' && pick.why) T.stats[pick.against ? 'passDefy' : 'passFollow']++;
}

function executePlan(m, p) {
  const pl = p.plan, b = m.ball, T = m.teams[p.team], a = p.a, d = T.dir, g = m.gauss, rng = m.rng;
  const sp = p.setPiece, pr = sp || p.hands ? 0 : pl.kind === 'shot' ? shotPressure(m, p, P.HL * d) : pressure(m, p);
  p.plan = null;
  let ang, vh, vz = 0, to = null;
  if (pl.kind === 'pass') {
    to = pl.to;
    if (!sp && to.x * d > T.offLine + 0.3 && m.rng() < 0.5 + 0.5 * a.vision) { p.nextThink = m.t; return; }
    let qx = pl.qx, qy = pl.qy, v0 = pl.v0;
    if (pl.feet) { const D0 = hyp(to.x - p.x, to.y - p.y); v0 = Math.min(v0 * 1.15, groundSpeedFor(D0, 8.5 + 0.04 * D0)); const lead = Math.min(groundTime(v0, D0), 0.7) * 0.6; qx = to.x + to.vx * lead; qy = to.y + to.vy * lead; }
    const off = Math.abs(angDiff(Math.atan2(qy - p.y, qx - p.x), p.face));
    const skill = Math.exp(PASS_GAP * (LEVEL - a.passing));      // l'écart grandit vite quand la note baisse
    const sig = (0.016 + 0.032 * (1 - a.passing)) * skill * (1 + 1.2 * pr) * (1 + 0.3 * off) * (pl.lofted ? 1.6 : 1) * (pl.firstTime ? 1.4 : 1);
    const eA = sig * g(), eV = 0.05 * skill * g();
    ang = Math.atan2(qy - p.y, qx - p.x) + eA;
    const v = v0 * (1 + eV);                                     // un mauvais passeur dose mal : trop molle ou trop appuyée
    pl.lat = Math.abs(eA) * hyp(qx - p.x, qy - p.y); pl.dose = Math.abs(eV);      // passe mal ajustée : à côté (m), mal dosée (part de la vitesse)
    if (pl.lofted) { const e = pl.elev * Math.PI / 180 + 0.03 * g(); vh = v * Math.cos(e); vz = v * Math.sin(e); } else vh = v;
    T.stats.passes++; T.stats.passLen += hyp(qx - p.x, qy - p.y); T.stats.passLenN++;
    if (pl.lofted) T.stats[isCross(T, p) ? 'crosses' : 'longBalls']++; else if (!pl.feet) T.stats.through++;
  } else if (pl.kind === 'shot') {
    const gx = P.HL * d, gk = m.teams[1 - p.team].players[0];
    let side = gk.y > 0 ? -1 : 1; if (rng() < 0.25) side = -side;                    // vise le côté ouvert, le plus souvent
    const aimY = side * (sp === 'penalty' ? 2.28 + 0.85 * rng() : 0.5 + (P.GOAL_HW - 1.0) * Math.pow(rng(), 0.7)), aimZ = 0.2 + 1.9 * Math.pow(rng(), 1.3);      // penalty : on vise près du poteau
    const D = hyp(gx - p.x, aimY - p.y), v = 21 + 8 * (0.4 + 0.6 * a.finishing), tf = D / (v * 0.93);
    const still = sp === 'penalty' ? 0.42 : sp ? 0.55 : 1;                     // ballon arrêté : le geste est plus précis
    const far = sp ? 1 : 1 + 0.35 * clamp((D - 4) / 6, 0, 1) + 0.3 * clamp((D - 7) / 11, 0, 1);                  // dans le jeu : précis de près, bien moins de loin
    let masked = false;
    ang = Math.atan2(aimY - p.y, gx - p.x);
    vh = v; vz = aimZ / tf + 0.5 * G * tf;
    if (sp === 'freekick' && m.wall) {                                              // le mur est-il sur la trajectoire ? alors il faut passer au-dessus
      let dW = 0; const ux = Math.cos(ang), uy = Math.sin(ang);
      for (const id in m.wall.spots) { const q = m.wall.spots[id], rx = q[0] - p.x, ry = q[1] - p.y; if (Math.abs(rx * uy - ry * ux) < 0.9) dW = Math.max(dW, rx * ux + ry * uy); }
      if (dW > 0) { const fk = freeKickSolve(D, dW, Math.max(aimZ, 0.9)); vh = fk.v * Math.cos(fk.e); vz = fk.v * Math.sin(fk.e); masked = true; }
    }
    ang += (0.075 + 0.12 * (1 - a.finishing)) * (1 + 0.7 * pr) * (1 + D / 60) * still * far * g();      // dans le jeu, une frappe est bien moins précise que sur ballon arrêté
    vz += v * (0.075 + 0.10 * (1 - a.finishing)) * (1 + 0.5 * pr) * still * far * g();
    if (vz < 0) vz = 0;
    m.shot = { by: p, team: p.team, xg: pl.xg, t0: m.t, done: false, masked, sp, d0: sp ? 99 : hyp(gx - p.x, p.y) };
    T.stats.shots++; T.stats.xg += sp === 'penalty' ? 0.76 : pl.xg * 1.1;      // statistique recalée sur les buts réellement marqués
  } else {
    const v = 24 + 4 * rng(), e = 38 * Math.PI / 180; ang = pl.ang; vh = v * Math.cos(e); vz = v * Math.sin(e);
  }
  if (m.wall && sp === 'freekick') m.wall.until = m.t + 0.5;                       // le mur se défait une fois le ballon parti
  b.owner = null; b.dip = pl.kind === 'shot' && m.shot.masked ? DIP : 0;
  b.x = p.x + Math.cos(ang) * 0.6; b.y = p.y + Math.sin(ang) * 0.6; b.z = 0;
  b.vx = Math.cos(ang) * vh; b.vy = Math.sin(ang) * vh; b.vz = vz; b.lastTouch = p;
  p.noControlUntil = m.t + 0.45; p.setPiece = null; p.hands = false; p.protectedUntil = 0;
  const offs = [];
  if (pl.kind === 'pass' && sp !== 'throwin' && sp !== 'goalkick' && sp !== 'corner') for (const q of T.players) if (q !== p && q.x * d > T.offLine + 0.3) offs.push(q.id);
  m.pass = { from: p, to, kind: pl.kind, lofted: !!pl.lofted, t0: m.t, offs, type: pl.lofted ? 'air' : pl.feet ? 'pieds' : 'course', aimX: pl.kind === 'pass' ? pl.qx * d : null, lat: pl.lat || 0, dose: pl.dose || 0, pOk: pl.pOk };
  if (pl.kind === 'pass') cnt(m, 'passe.' + m.pass.type); else cnt(m, pl.kind);
  if (m.corner && sp === 'corner') m.corner.until = m.t + 3;
  predict(m);
  react(m, to);
}

// ---------- contacts avec le ballon ----------
function deflect(m, p, keepFrac, spread) {
  m.ball.dip = 0;
  const b = m.ball, sp = hyp(b.vx, b.vy), ang = Math.atan2(b.vy, b.vx) + spread * m.gauss(), v = sp * keepFrac + 1 + 2 * m.rng();
  b.vx = Math.cos(ang) * v + p.vx * 0.3; b.vy = Math.sin(ang) * v + p.vy * 0.3; b.vz = b.z > 0.3 ? Math.abs(b.vz) * 0.3 : 1.5 * m.rng();
  if (m.pass) passEnd(m, m.pass.from.team === p.team ? 'rate_partenaire' : 'devie');
  b.lastTouch = p; p.noControlUntil = m.t + 0.45; m.pass = null;
  react(m, null);
}
function offsideCheck(m, p) {
  const pass = m.pass;
  if (!pass || pass.kind !== 'pass' || pass.from.team !== p.team || pass.offs.indexOf(p.id) < 0) return false;
  passEnd(m, 'hors_jeu'); m.teams[p.team].stats.offsides++; log(m, 'offside', p.team, 'Hors-jeu de ' + p.name);
  setRestart(m, 'freekick', 1 - p.team, clamp(p.x, -P.HL + 1, P.HL - 1), clamp(p.y, -P.HW + 1, P.HW - 1), STOP.freekick);
  return true;
}
function gainControl(m, p, z, pr) {
  const b = m.ball, T = m.teams[p.team], a = p.a, pass = m.pass;
  if (offsideCheck(m, p)) return;
  const fromMate = pass && pass.from.team === p.team;
  if (pass && pass.kind === 'pass') { if (fromMate) { if (pass.from !== p) T.stats.passesOk++; } else T.stats.interceptions++; passEnd(m, fromMate ? 'ok' : 'interceptee'); }
  if (m.shot && !m.shot.done) m.shot.done = true;
  const sb = hyp(b.vx, b.vy), sr = hyp(p.vx, p.vy);
  p.onRun = sr > 4 && sb > 2 && (b.vx * p.vx + b.vy * p.vy) / (sb * sr) > 0.6;      // il court dans le sens du ballon : il le prend dans sa foulée
  b.owner = p; b.z = 0; b.vz = 0; b.lastTouch = p;
  let delay = 0.18 + 0.34 * (1 - a.firstTouch) + (z > 0.4 ? 0.15 : 0);
  const pressed = oppDist(m.teams[1 - p.team], p.x, p.y) < 3;
  if (fromMate && m.rng() < 0.1 + 0.3 * a.passing * a.decisions + (pressed ? 0.3 : 0) + 0.2 * T.tac.tempo) delay = 0.05;      // jeu en une touche, plus fréquent à rythme rapide
  // contrôle orienté : pressé, un joueur doué de sa prise de balle s'éloigne de l'adversaire dès le premier contact
  p.turned = false;
  if (pr > 0.45 && delay > 0.1 && m.rng() < clamp(1.7 * a.firstTouch - 0.75, 0, 0.9)) { p.turned = true; delay *= 0.6; p.shieldUntil = m.t + delay + 0.5; cnt(m, 'ctrl.' + p.team + '.oriente'); }
  p.controlReadyAt = m.t + delay; p.gotBallAt = m.t; p.firstTime = delay < 0.1; T.stats.touches++;
  p.plan = null; p.hands = false; p.setPiece = null; p.protectedUntil = 0;
  p.nextThink = Math.min(p.nextThink, p.controlReadyAt);
  m.pass = null;
  react(m, null);
}
function catchBall(m, p) {
  const b = m.ball;
  if (m.pass && m.pass.kind === 'pass' && m.pass.from.team !== p.team) { m.teams[p.team].stats.interceptions++; passEnd(m, 'gardien'); }
  if (m.shot && !m.shot.done) m.shot.done = true;
  b.owner = p; b.lastTouch = p; p.hands = true; p.plan = null; p.setPiece = null;
  p.holdUntil = m.t + 2.5 + 2.5 * m.rng(); p.protectedUntil = p.holdUntil + 4; p.controlReadyAt = m.t; p.nextThink = m.t;
  m.pass = null;
  react(m, null);
}
function keeperSave(m, p, z, stretch, sp3) {
  const b = m.ball, T = m.teams[p.team], a = p.a, rng = m.rng, shot = m.shot;
  const quick = clamp((9 - (shot.d0 || 99)) / 5, 0, 1);                // frappe à bout portant : il n'a presque pas le temps de réagir
  const pStop = clamp(0.995 - 0.55 * stretch * stretch * (1.5 - a.reflexes) - 0.5 * quick - (z > 1.9 ? 0.1 : 0), 0.3, 0.995);
  if (rng() >= pStop) { const sh = m.shot; deflect(m, p, 0.6, 0.35); m.shot = sh; p.noControlUntil = m.t + 0.8; return; }     // touché, pas arrêté
  shot.done = true; m.teams[shot.team].stats.onTarget++; T.stats.saves++;
  if (sp3 < 15 || rng() < 0.2 + 0.5 * a.handling - 0.35 * stretch) { log(m, 'save', p.team, 'Tir de ' + shot.by.name + ', arrêt de ' + p.name); return catchBall(m, p); }
  log(m, 'save', p.team, 'Tir de ' + shot.by.name + ', parade de ' + p.name);
  const sgn = b.y >= p.y ? 1 : -1, ang = Math.atan2(sgn * (0.6 + 0.9 * rng()), T.dir * (-0.3 + 1.2 * rng())), v = 5 + 0.25 * sp3 + 3 * rng();
  b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = 1 + 3 * rng(); b.dip = 0; b.lastTouch = p; p.noControlUntil = m.t + 0.7; m.pass = null;
  react(m, null);
}
function header(m, p0, z) {
  const b = m.ball, rng = m.rng, pass = m.pass;
  let p = p0;
  for (const o of m.teams[1 - p.team].players) {                          // duel aérien
    if (o.stunUntil > m.t || o.noControlUntil > m.t || o.role === 'GK' || hyp(o.x - b.x, o.y - b.y) > 1.5) continue;      // celui qui vient de toucher le ballon ne dispute pas le duel suivant
    if (rng() > clamp(0.5 + 0.6 * (p.a.heading - o.a.heading) + (pass && pass.to === p ? 0.08 : 0), 0.15, 0.85)) p = o;
    break;
  }
  if (offsideCheck(m, p)) return;
  const T = m.teams[p.team], d = T.dir, a = p.a, gx = P.HL * d, dGoal = hyp(gx - p.x, p.y), rx = p.x * d;
  if (pass && pass.kind === 'pass') { if (pass.from.team === p.team) T.stats.passesOk++; else T.stats.interceptions++; passEnd(m, pass.from.team === p.team ? 'ok' : 'interceptee'); }
  b.lastTouch = p; p.noControlUntil = m.t + 0.6;
  let ang, v, vz, kind = 'clear', to = null;
  if (dGoal < 15 && rx > 36) {                                            // tête au but
    ang = Math.atan2((rng() - 0.5) * 2 * (P.GOAL_HW - 0.5) - p.y, gx - p.x) + (0.10 + 0.14 * (1 - a.heading)) * m.gauss();
    v = 11 + 5 * rng(); vz = -1 + 3 * rng(); kind = 'shot';
    const xg = clamp(0.4 * baseXg(T, p.x, p.y), 0.01, 0.4);
    m.shot = { by: p, team: p.team, xg, t0: m.t, done: false }; T.stats.shots++; T.stats.xg += xg;
  } else if (rx < -22) {                                                  // dégagement de la tête, parfois en corner
    ang = Math.atan2((p.y >= 0 ? 0.7 : -0.7) * d, rx < -44 && rng() < 0.3 ? -0.5 * d : d) + 0.35 * m.gauss(); v = 11 + 4 * rng(); vz = 4 + 2 * rng();
  } else {                                                                // remise
    let bd = 99;
    for (const q of T.players) { if (q === p || q.role === 'GK') continue; const dd = hyp(q.x - p.x, q.y - p.y); if (dd > 4 && dd < 20 && dd < bd) { bd = dd; to = q; } }
    if (to) { ang = Math.atan2(to.y - p.y, to.x - p.x) + 0.22 * m.gauss(); v = Math.min(14, groundSpeedFor(bd, 3) * 0.9); vz = 1; kind = 'pass'; T.stats.passes++; }
    else { ang = Math.atan2(0, d) + 0.5 * m.gauss(); v = 9; vz = 3; }
  }
  b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = vz; b.dip = 0;
  m.pass = { from: p, to, kind, lofted: false, t0: m.t, offs: [], type: 'tete' };
  react(m, to);
}

function touch(m, p, z, stretch) {
  const b = m.ball, T = m.teams[p.team], a = p.a, rng = m.rng, pass = m.pass, shot = m.shot;
  const keeper = p.role === 'GK' && inOwnBox(T, p.x, p.y);
  const sp3 = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz), vrel = hyp(b.vx - p.vx, b.vy - p.vy);
  const fromMate = pass && pass.from.team === p.team;
  if (shot && !shot.done && shot.team !== p.team) {                       // tir adverse
    if (keeper) return keeperSave(m, p, z, stretch, sp3);
    const inWall = m.wall && m.wall.spots[p.id] && m.t < m.wall.until + 1;
    if (rng() < (inWall ? 0.95 : 0.72)) { shot.done = true; T.stats.blocks++; log(m, 'block', p.team, inWall ? 'Coup franc de ' + shot.by.name + ' dans le mur' : 'Tir de ' + shot.by.name + ' contré par ' + p.name); deflect(m, p, 0.5, 1.0); }
    else p.noControlUntil = m.t + 0.3;
    return;
  }
  if (pass && m.t - pass.t0 < 0.22 && !fromMate && sp3 > 8 && !keeper) {   // ballon tout juste frappé : pas le temps de réagir
    if (rng() < 0.3) deflect(m, p, 0.4, 0.9); else p.noControlUntil = m.t + 0.25;
    return;
  }
  if (keeper && !(fromMate && pass.kind === 'pass')) {                    // le gardien s'en saisit
    if (rng() < clamp(0.97 - 0.012 * Math.max(0, sp3 - 12) - (z > 1.8 ? 0.08 : 0), 0.5, 0.99)) { if (!offsideCheck(m, p)) catchBall(m, p); } else deflect(m, p, 0.3, 1.0);
    return;
  }
  if (z > 1.25 && fromMate && pass.kind === 'pass' && oppDist(m.teams[1 - p.team], p.x, p.y) > AMORTI_FREE) {      // seul sous le ballon : il l'amortit (poitrine, cuisse)
    const ok = rng() < clamp(0.45 + 0.55 * a.firstTouch - (z > 1.8 ? 0.1 : 0), 0.4, 0.95);
    cnt(m, 'amorti.' + (ok ? 'ok' : 'rate'));
    if (ok) return gainControl(m, p, z, pressure(m, p));
    deflect(m, p, 0.3, 0.9); T.stats.miscontrols++; setIntent(m, p, 'chase', 'Amorti raté', b.x, b.y, 1); p.nextThink = m.t + 0.35;
    return;
  }
  if (z > 1.25) return header(m, p, z);
  let vOk = 11 + 8 * a.firstTouch; if (!(pass && pass.to === p)) vOk -= fromMate ? 2 : 6;
  // Prise de balle : sans adversaire proche, même un joueur moyen contrôle. Pressé, tout dépend de sa qualité.
  const pr = pressure(m, p), mine = fromMate || !pass;                      // mine : ce ballon lui revient (pas une interception)
  // une passe mal ajustée (à côté du pied, trop molle ou trop appuyée) est plus dure à contrôler, surtout pressé
  const bad = fromMate && pass.to === p ? clamp((pass.lat - BAD_LAT) / 2.5, 0, 1) + clamp((pass.dose - 0.06) / 0.12, 0, 1) : 0;
  const miss = CTRL * pr * pr * Math.pow(1 - a.firstTouch, 1.3) * (z > 0.45 ? 1.5 : 1) + BAD_PASS * bad * (1.3 - a.firstTouch) * (0.3 + 0.7 * pr);
  const pc = 1 - clamp((vrel - vOk) / 14, 0, 0.92) - 0.002 - 0.004 * (1 - a.firstTouch) - (z > 0.45 ? 0.08 : 0) - miss;
  const ok = rng() < pc;
  if (mine) cnt(m, 'ctrl.' + p.team + (pr > 0.5 ? '.presse.' : pr > 0.05 ? '.gene.' : '.libre.') + (ok ? 'ok' : 'rate'));
  if (ok) return gainControl(m, p, z, pr);
  deflect(m, p, 0.3, 0.9);
  if (mine) { T.stats.miscontrols++; setIntent(m, p, 'chase', 'Contrôle raté', b.x, b.y, 1); p.nextThink = m.t + 0.35; }
}

function resolveFreeBall(m) {
  const b = m.ball, sx = b.x - b.px, sy = b.y - b.py, L2 = sx * sx + sy * sy, fast = L2 > (15 * DT) * (15 * DT);
  let best = null, bs = 1e9, bz = 0, bd = 0;
  for (const p of m.players) {
    if (p.stunUntil > m.t || p.noControlUntil > m.t) continue;
    const keeper = p.role === 'GK' && inOwnBox(m.teams[p.team], p.x, p.y);
    const reads = m.pass && m.pass.from.team !== p.team ? 1 + READ * (p.a.anticipation - LEVEL) : 1;      // il lit la passe adverse : il la coupe d'un peu plus loin
    const R = (keeper ? 1.3 : fast ? 0.65 : 0.85) * (keeper ? 1 : reads), zMax = keeper ? 2.6 : 2.3;
    const u = L2 > 1e-9 ? clamp(((p.x - b.px) * sx + (p.y - b.py) * sy) / L2, 0, 1) : 0;
    const dd = hyp(p.x - b.px - sx * u, p.y - b.py - sy * u), z = b.pz + (b.z - b.pz) * u;
    if (dd > R || z > zMax) continue;
    let s = u * Math.sqrt(L2) + dd * 0.6 + 0.3 * m.rng();
    if (m.pass && m.pass.to === p) s -= 0.4;
    if (s < bs) { bs = s; best = p; bz = z; bd = L2 > 1e-9 ? Math.min(1, Math.abs((p.x - b.px) * sy - (p.y - b.py) * sx) / Math.sqrt(L2) / R) : dd / R; }
  }
  if (best) touch(m, best, bz, bd);
}

// duel : le défenseur gagne par son tacle et par le moment où il s'engage (anticipation) ; le porteur résiste par son dribble et son sang-froid
const duelDef = o => o.a.tackling + DUEL_MIND * (o.a.anticipation - o.a.tackling);
const duelAtt = c => c.a.dribbling + DUEL_MIND * (c.a.composure - c.a.dribbling);
function resolveTackles(m) {
  const b = m.ball, c = b.owner, rng = m.rng;
  if (c.hands || c.protectedUntil > m.t || c.shieldUntil > m.t) return;      // shieldUntil : il vient de réussir un contrôle orienté
  for (const o of m.teams[1 - c.team].players) {
    if (o.stunUntil > m.t || o.tackleReadyAt > m.t) continue;
    if (hyp(o.x - b.x, o.y - b.y) > 1.25) continue;
    const T = m.teams[o.team], keeper = o.role === 'GK' && inOwnBox(T, o.x, o.y);
    const rx = o.x - c.x, ry = o.y - c.y, closing = (c.vx * rx + c.vy * ry) / (hyp(rx, ry) || 1);
    const lam = closing > 2.5 || (keeper && o.intent.type === 'claim') ? 5 : (o.intent.type === 'press' || keeper ? 0.6 : 0.25) * (0.6 + 0.8 * o.a.aggression) * (hyp(c.x + P.HL * T.dir, c.y) < 25 ? 2.2 : 1) * (o.intent.type === 'press' ? 1 + 0.5 * T.tac.press : 1);
    if (rng() > lam * DT) continue;
    const front = (rx * Math.cos(c.face) + ry * Math.sin(c.face)) / (hyp(rx, ry) || 1);      // 1 : de face, −1 : dans le dos
    const pWin = clamp(0.46 * (0.8 + 0.2 * o.stam) + 0.55 * (duelDef(o) - duelAtt(c)) + 0.12 * front + (m.t < c.controlReadyAt ? 0.5 * (1 - c.a.firstTouch) : 0) + (keeper ? 0.2 : 0), 0.12, 0.85);      // pendant son contrôle, il est d'autant plus vulnérable que sa prise de balle est faible
    const pFoul = (0.09 + 0.13 * o.a.aggression) * (front < -0.2 ? 1.6 : 1) * (keeper ? 0.4 : 1) * (inOwnBox(T, c.x, c.y) ? 0.1 : 1);      // dans sa surface, on se retient
    const r = rng();
    o.tackleReadyAt = m.t + 1.0 + 0.6 * rng();
    cnt(m, 'tacle.tente');
    if (r < pFoul) {
      T.stats.fouls++;
      const pen = inOwnBox(T, c.x, c.y);
      log(m, 'foul', o.team, 'Faute de ' + o.name + ' sur ' + c.name + (pen ? ' — penalty !' : ''));
      if (pen) setRestart(m, 'penalty', c.team, -(P.HL - P.SPOT) * T.dir, 0, STOP.penalty);
      else setRestart(m, 'freekick', c.team, clamp(c.x, -P.HL + 1, P.HL - 1), clamp(c.y, -P.HW + 1, P.HW - 1), STOP.freekick);
    } else if (r < pFoul + pWin) {
      T.stats.tackles++; c.stunUntil = m.t + 0.35; c.plan = null; c.setPiece = null;
      if (keeper) catchBall(m, o);
      else if (rng() < 0.5) { b.owner = o; b.lastTouch = o; o.controlReadyAt = m.t + 0.35; o.gotBallAt = m.t; o.firstTime = false; o.plan = null; o.nextThink = m.t + 0.35; m.pass = null; react(m, null); }
      else { const ang = o.face + 0.8 * m.gauss(), v = 4 + 4 * rng(); b.owner = null; b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v; b.vz = 0; b.lastTouch = o; o.noControlUntil = m.t + 0.25; c.noControlUntil = m.t + 0.5; m.pass = null; react(m, null); }
    } else o.stunUntil = m.t + 0.4 + 0.35 * rng() + (o.intent.type === 'press' && T.tac.press > 0 && hyp(c.x + P.HL * T.dir, c.y) > 30 ? 0.8 * T.tac.press : 0);      // tacle manqué : le défenseur est éliminé un instant, plus longtemps s'il s'est jeté loin de son but
    return;
  }
}

// ---------- arrêts de jeu ----------
function pickTaker(m, type, team, x, y) {
  const T = m.teams[team], ps = T.players, ry = y * T.dir;
  if (type === 'kickoff') return ps[9];
  if (type === 'goalkick') return ps[0];
  if (type === 'corner') return ry < 0 ? ps[5] : ps[8];
  if (type === 'penalty') { let b = ps[9]; for (const p of ps) if (p.role !== 'GK' && p.a.finishing > b.a.finishing) b = p; return b; }
  let best = null, bd = 1e9;
  const cands = type === 'throwin' ? (ry < 0 ? [ps[1], ps[5]] : [ps[4], ps[8]]) : ps;
  for (const p of cands) { let dd = hyp(p.x - x, p.y - y); if (p.role === 'GK' && !inOwnBox(T, x, y)) dd += 99; if (dd < bd) { bd = dd; best = p; } }
  return best;
}
// durée moyenne (s) de chaque arrêt de jeu, réglée pour que le ballon soit en jeu environ 60 % du temps comme en vrai
const STOP = { throwin: 17, goalkick: 30, corner: 34, freekick: 27, kickoff: 55, penalty: 60 };
function setRestart(m, type, team, x, y, delay) {
  if (delay > 5) delay *= 0.7 + 0.6 * m.rng();                  // certains arrêts sont joués vite, d'autres traînent
  passEnd(m, 'sortie'); cnt(m, 'arret.' + type);
  m.mode = 'dead'; m.ball.owner = null; m.pass = null; m.shot = null; m.lastTeam = -1; m.holder = -1;
  for (const p of m.players) { p.plan = null; p.setPiece = null; p.hands = false; if (p.intent.type === 'run') p.intent.until = 0; p.nextThink = Math.min(p.nextThink, m.t + 0.2 + 0.5 * m.rng()); }
  m.restart = { type, team, x, y, readyAt: m.t + delay, deadline: m.t + delay + 14, ballAt: m.t + 1, placed: false, taker: pickTaker(m, type, team, x, y) };
  m.corner = type === 'corner' ? { team, side: Math.sign(y) || 1, until: Infinity } : null;
  m.wall = type === 'freekick' ? makeWall(m, team, x, y) : null;
  if (m.wall) { m.restart.readyAt += 10; m.restart.deadline += 10; }      // le temps de placer le mur
}
// Mur sur coup franc à portée de tir : deux à cinq joueurs à distance réglementaire, entre le ballon et leur but,
// décalés vers le premier poteau (le gardien garde l'autre côté).
function makeWall(m, team, x, y) {
  const D = m.teams[1 - team], gx = -P.HL * D.dir, dG = hyp(x - gx, y);
  if (dG > 32 || dG < 13) return null;
  const side = Math.abs(y) / dG;                                  // 0 dans l'axe, proche de 1 sur le côté
  let n = dG < 22 ? 5 : dG < 27 ? 4 : 3; if (side > 0.75) n = 2; else if (side > 0.55) n = Math.min(n, 3);
  let ux = gx - x, uy = clamp(y / 4, -1, 1) * 1.2 - y; const L = hyp(ux, uy); ux /= L; uy /= L;
  const cx = x + ux * 9.6, cy = y + uy * 9.6, spots = {}, order = ['LCM', 'RCM', 'LF', 'RF', 'LM'];
  for (let k = 0; k < n; k++) { const p = D.players.find(q => q.slot === order[k]), o = (k - (n - 1) / 2) * 0.75; spots[p.id] = [cx - uy * o, cy + ux * o]; }
  return { team: D.id, spots, x, y, until: Infinity };
}
// hauteur du ballon après d1 puis d2 mètres pour une frappe de vitesse v et d'angle e (−1 s'il retombe avant)
function flightZ(v, e, d1, d2) {
  const b = { x: 0, y: 0, z: 0, vx: v * Math.cos(e), vy: 0, vz: v * Math.sin(e), dip: DIP }; let z1 = -1;
  for (let i = 0; i < 220; i++) {
    const px = b.x, pz = b.z; ballStep(b, 0.02);
    if (z1 < 0 && b.x >= d1) z1 = lerp(pz, b.z, (d1 - px) / (b.x - px));
    if (b.x >= d2) return [z1, lerp(pz, b.z, (d2 - px) / (b.x - px))];
    if (b.z <= 0) break;
  }
  return [z1, -1];
}
// coup franc direct : la frappe la plus tendue qui passe au-dessus du mur (à dW mètres) et arrive à la hauteur aimZ sur la ligne (à D mètres)
function freeKickSolve(D, dW, aimZ) {
  let best = null;
  for (let v = 30; v >= 15; v--) {
    let lo = 0.03, hi = 0.8;
    for (let i = 0; i < 14; i++) { const e = (lo + hi) / 2; if (flightZ(v, e, dW, D)[1] < aimZ) lo = e; else hi = e; }
    best = { v, e: hi };
    if (flightZ(v, hi, dW, D)[0] >= 2.6) break;
  }
  return best;
}
function runRestart(m) {
  const R = m.restart, b = m.ball, k = R.taker;
  if (!R.placed) {
    if (m.t < R.ballAt) {                                   // le ballon finit sa course (dans le filet, hors du terrain)
      ballStep(b, DT);
      if (Math.abs(b.x) > P.HL || Math.abs(b.y) > P.HW) {             // filet, panneaux : le ballon s'arrête vite
        const inGoal = Math.abs(b.x) > P.HL && Math.abs(b.y) < P.GOAL_HW + 0.3 && b.z < P.GOAL_H;
        b.vx *= 0.8; b.vy *= 0.8;
        b.x = clamp(b.x, -P.HL - (inGoal ? 2.2 : 3.5), P.HL + (inGoal ? 2.2 : 3.5)); b.y = inGoal ? clamp(b.y, -P.GOAL_HW, P.GOAL_HW) : clamp(b.y, -P.HW - 2.8, P.HW + 2.8);
      }
      return;
    }
    b.x = b.px = R.x; b.y = b.py = R.y; b.z = b.pz = 0; b.vx = b.vy = b.vz = 0; R.placed = true;
  }
  const near = hyp(k.x - b.x, k.y - b.y) < 1.2;
  if (!(m.t >= R.readyAt && near) && m.t < R.deadline) return;
  if (!near) { k.x = b.x; k.y = b.y; k.vx = k.vy = 0; }
  m.mode = 'play'; b.owner = k; b.lastTouch = k;
  k.setPiece = R.type; k.protectedUntil = m.t + 8; k.controlReadyAt = m.t + 0.4 + 0.5 * m.rng(); k.gotBallAt = -9; k.firstTime = false; k.hands = false; k.plan = null; k.nextThink = m.t;
  k.face = Math.atan2(-k.y, -k.x || m.teams[k.team].dir);
  m.restart = null;
}
function goal(m, att) {
  const b = m.ball, T = m.teams[att], s = m.shot;
  T.score++; T.stats.goals++;
  let scorer = b.lastTouch;
  if (s && !s.done) { s.done = true; if (s.team === att) { scorer = s.by; T.stats.onTarget++; } }
  const sc = ' (' + m.teams[0].score + '-' + m.teams[1].score + ')';
  log(m, 'goal', att, scorer && scorer.team !== att ? 'But contre son camp de ' + scorer.name + sc : 'BUT pour les ' + T.name + ' ! ' + (scorer ? scorer.name : '') + sc);
  setRestart(m, 'kickoff', 1 - att, 0, 0, STOP.kickoff);
  m.restart.ballAt = m.t + 3;
}
function checkBounds(m) {
  const b = m.ball;
  if (b.owner && b.owner.setPiece) return;
  const ax = Math.abs(b.x), ay = Math.abs(b.y);
  if (ax <= P.HL && ay <= P.HW) return;
  const last = b.lastTouch;
  let u = 1, goalLine = false;
  if (ax > P.HL) { const pax = Math.abs(b.px); u = pax >= P.HL ? 0 : (P.HL - pax) / (ax - pax); goalLine = true; }
  if (ay > P.HW) { const pay = Math.abs(b.py), ut = pay >= P.HW ? 0 : (P.HW - pay) / (ay - pay); if (!goalLine || ut < u) { u = ut; goalLine = false; } }
  const cx = b.px + (b.x - b.px) * u, cy = b.py + (b.y - b.py) * u, cz = b.pz + (b.z - b.pz) * u;
  if (goalLine) {
    const end = b.x > 0 ? 1 : -1, att = end > 0 ? 0 : 1, def = 1 - att;
    if (Math.abs(cy) < P.GOAL_HW && cz < P.GOAL_H) return goal(m, att);
    const s = m.shot;
    if (s && !s.done) { s.done = true; log(m, 'shot', s.team, 'Tir de ' + s.by.name + (cz >= P.GOAL_H && Math.abs(cy) < P.GOAL_HW ? ' au-dessus' : ' à côté')); }
    const side = cy >= 0 ? 1 : -1;
    if (last && last.team === def) { m.teams[att].stats.corners++; log(m, 'corner', att, 'Corner pour les ' + m.teams[att].name); setRestart(m, 'corner', att, end * (P.HL - 0.4), side * (P.HW - 0.4), STOP.corner); }
    else setRestart(m, 'goalkick', def, end * (P.HL - P.SIX_D), side * 5, STOP.goalkick);
  } else {
    setRestart(m, 'throwin', last ? 1 - last.team : 0, clamp(cx, -P.HL + 1, P.HL - 1), (b.y > 0 ? 1 : -1) * (P.HW - 0.25), STOP.throwin);
  }
}

// ---------- déplacement ----------
function speedFor(p, dd, urg) {
  if (dd < 0.6) return 0;
  const e = clamp(urg * (0.8 + 0.4 * p.a.workRate), 0, 1);
  const cap = e > 0.8 ? topSpeed(p) : e > 0.5 ? RUN * (0.9 + 0.2 * p.a.pace) : JOG;
  return clamp(dd / lerp(6, 0.8, e), WALK, cap);          // plus c'est urgent, moins on se donne de temps pour y être
}
function act(m, p) {
  const b = m.ball, it = p.intent, T = m.teams[p.team], d = T.dir, top = topSpeed(p), owner = b.owner === p;
  let tx = it.tx, ty = it.ty, sp = 0, acc = p.acc * (0.7 + 0.3 * p.stam), dec = 7.5, brake = true, cap = top;      // fatigué, on démarre moins vite
  if (p.stunUntil > m.t) { tx = p.x; ty = p.y; }
  else switch (it.type) {
    case 'chase': case 'receive': case 'claim': {
      const ic = !b.owner && m.mode === 'play' ? m.icpt[p.id] : null;
      if (ic) { tx = ic.x; ty = ic.y; } else { tx = b.x; ty = b.y; }
      sp = top; brake = false;
      if (it.type === 'receive' && ic) {                       // le ballon lui est destiné : il vient à sa rencontre sans se précipiter
        let rival = 99; for (const o of m.teams[1 - p.team].players) rival = Math.min(rival, m.icpt[o.id].t);
        if (rival > ic.t + 0.5) { sp = Math.min(top, Math.max(JOG, hyp(tx - p.x, ty - p.y) / Math.max(0.2, ic.t - 0.15))); brake = true; }
      }
      break;
    }
    case 'press': {
      const c = b.owner && b.owner.team !== p.team ? b.owner : null, th = c || threat(m);
      const gx = -P.HL * d; let ux = gx - th.x, uy = -th.y; const n = hyp(ux, uy) || 1; ux /= n; uy /= n;
      const engage = c && (n < 24 + 70 * Math.max(0, T.tac.press) || hyp(c.vx, c.vy) < 1.5);      // « harceler » : on va au contact partout
      const dd = hyp(th.x - p.x, th.y - p.y), off = dd > 6 ? 2.5 : dd > 3 ? 2 : engage ? 0.6 : 1.7, lead = c ? Math.min(dd / 8, 0.5) : 0;
      tx = th.x + (c ? c.vx * lead : 0) + ux * off; ty = th.y + (c ? c.vy * lead : 0) + uy * off;
      if (engage && dd < 3 && hyp(c.vx, c.vy) < 1.5) { tx = b.x; ty = b.y; }                // il protège son ballon : on le contourne
      sp = dd > 5 || !c ? top : Math.max(hyp(c.vx, c.vy) + 1.5, 4);      // sprinte puis temporise à l'approche
      brake = !c; break;
    }
    case 'run': {
      sp = top; brake = false; break;
    }
    case 'dribble': tx = p.x + it.dx * 6; ty = p.y + it.dy * 6; sp = Math.min(it.speed, top * 0.9); brake = false; break;
    case 'toBall': sp = RUN; break;
    case 'save': {
      if (m.t >= p.saveAt) { const c = !b.owner ? goalThreat(m, p) : null; if (c) { it.tx = c.x; it.ty = c.y; } tx = it.tx; ty = it.ty; sp = 6.8; acc = 18; dec = 18; cap = 7; }
      else { tx = p.x; ty = p.y; }
      break;
    }
    case 'control': { const v = hyp(p.vx, p.vy); tx = p.x + p.vx; ty = p.y + p.vy; sp = p.onRun ? Math.max(2.5, Math.min(v, top * 0.9)) : Math.min(v, 2.5); brake = false; break; }
    case 'kick': tx = p.x + Math.cos(p.face); ty = p.y + Math.sin(p.face); sp = Math.min(hyp(p.vx, p.vy), 1.5); brake = false; break;
    case 'hold': tx = p.x; ty = p.y; break;
    default: sp = speedFor(p, hyp(tx - p.x, ty - p.y), it.urg);
  }
  const dx = tx - p.x, dy = ty - p.y, dist = hyp(dx, dy);
  let vdx = 0, vdy = 0;
  if (dist > (it.type === 'save' ? 0.08 : 0.25) && sp > 0) { const v = brake ? Math.min(sp, Math.sqrt(0.93 * dec * dist)) : sp; vdx = dx / dist * v; vdy = dy / dist * v; }
  let ex = vdx - p.vx, ey = vdy - p.vy; const e = hyp(ex, ey), cur = hyp(p.vx, p.vy);
  const amax = (ex * p.vx + ey * p.vy < 0 ? dec : acc * (1 - 0.55 * Math.min(1, cur / top))) * DT;      // on freine plus vite qu'on n'accélère
  if (e > amax) { ex *= amax / e; ey *= amax / e; }
  p.vx += ex; p.vy += ey;
  let ns = hyp(p.vx, p.vy); if (ns > cap) { p.vx *= cap / ns; p.vy *= cap / ns; ns = cap; }
  p.x += p.vx * DT; p.y += p.vy * DT;
  const mg = owner ? -0.6 : 1.5;
  p.x = clamp(p.x, -P.HL - mg, P.HL + mg); p.y = clamp(p.y, -P.HW - mg, P.HW + mg);
  // orientation du corps
  const shield = owner && it.type === 'hold' && it.shield != null;
  const fa = p.plan ? p.plan.ang : shield ? it.shield : (ns > 1.4 && it.type !== 'press') ? Math.atan2(p.vy, p.vx) : Math.atan2(b.y - p.y, b.x - p.x);
  if (!(owner && ns <= 1.4 && !p.plan && !shield)) p.face += clamp(angDiff(fa, p.face), -8 * DT, 8 * DT);
  // fatigue
  const r = ns / p.top; p.stam = Math.max(0.3, p.stam - 0.00075 * r * r * r * (1.3 - 0.5 * p.a.stamina) * (it.type === 'press' ? 4.5 : it.hunt ? 3 : 1) * DT);      // presser et harceler coûtent bien plus cher que courir (accélérations, changements de direction)      // la fraîcheur ne revient pas : un quart perdu en 90 minutes en moyenne, davantage si l'on sprinte beaucoup
  p.dist += ns * DT;
}
function separate(m) {
  const ps = m.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 > 0.49 || d2 < 1e-6) continue;
    const dd = Math.sqrt(d2), k = (0.7 - dd) / 2 / dd;
    a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
  }
}
function moveBall(m) {
  const b = m.ball, o = b.owner;
  if (o) {
    const off = o.hands ? 0.35 : 0.5 + 0.06 * hyp(o.vx, o.vy);
    b.x += (o.x + Math.cos(o.face) * off - b.x) * 0.45; b.y += (o.y + Math.sin(o.face) * off - b.y) * 0.45;
    b.x = clamp(b.x, -P.HL + 0.1, P.HL - 0.1); b.y = clamp(b.y, -P.HW + 0.1, P.HW - 0.1);
    b.z = o.hands ? 1.1 : 0; b.vx = o.vx; b.vy = o.vy; b.vz = 0;
  } else if (m.mode === 'play') ballStep(b, DT);
}

// mesures du style de jeu (aucune influence sur le match)
function measure(m) {
  const o = m.ball.owner;
  if (o) {
    const T = m.teams[o.team], S = T.stats;
    if (!o.setPiece && !o.hands) S.ballT += DT;
    if (m.lastTeam >= 0 && m.lastTeam !== o.team) { S.recov++; if (o.x * T.dir > 0) S.recovHigh++; }      // ballon repris à l'adversaire
    m.lastTeam = o.team;
  }
  if (m.tick % 10 || m.poss < 0) return;
  const A = m.teams[m.poss], D = m.teams[1 - m.poss];
  let lo = 99, hi = -99; for (const p of A.players) if (p.role !== 'GK') { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
  A.stats.widthSum += hi - lo; A.stats.widthN++;                                       // largeur de l'équipe qui a le ballon
  let x = 0, n = 0; for (const p of D.players) if (p.role === 'DEF') { x += p.x * D.dir; n++; }
  D.stats.lineSum += x / n + P.HL; D.stats.lineN++;                                    // distance entre la défense et son but, sans le ballon
}

// ---------- un pas de simulation ----------
function step(m) {
  if (m.mode === 'over') return;
  const b = m.ball;
  for (const p of m.players) { p.px = p.x; p.py = p.y; }
  b.px = b.x; b.py = b.y; b.pz = b.z;
  m.t += DT; m.tick++;
  if (b.owner) b.dip = 0;
  if (!b.owner && m.mode === 'play') predict(m);
  updateContext(m);
  if (m.mode === 'dead') runRestart(m);
  if (b.owner && b.owner.plan && m.t >= b.owner.plan.at) executePlan(m, b.owner);
  for (const p of m.players) if (m.t >= p.nextThink) think(m, p);
  for (const p of m.players) act(m, p);
  separate(m);
  moveBall(m);
  if (m.mode === 'play') {
    if (b.owner) resolveTackles(m); else resolveFreeBall(m);
    if (m.mode === 'play') checkBounds(m);
  }
  { const o = b.owner; if (o && o.team !== m.holder) { m.holder = o.team; m.possSince = m.t; } }      // depuis quand cette équipe a le ballon
  if (m.mode === 'play') { m.playT += DT; if (m.poss >= 0) m.teams[m.poss].stats.possT += DT; if (b.owner) cnt(m, 'temps.balle_au_pied', DT); measure(m); }
  if (m.t >= m.duration) { m.mode = 'over'; log(m, 'end', -1, 'Fin du match : ' + m.teams[0].name + ' ' + m.teams[0].score + ' - ' + m.teams[1].score + ' ' + m.teams[1].name); }
}

// restart : met en scène un arrêt de jeu (penalty, coup franc, corner…), pour les outils de mesure
return { createMatch, step, setTactics, setFormation, FORMATIONS, restart: setRestart, readTeam, TACTICS, PRESETS, QUALITIES, PLACES, DT, PITCH: P, valueAt };
});
