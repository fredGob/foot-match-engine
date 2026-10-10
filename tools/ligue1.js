// Fabrique les dix équipes de Ligue 1 de equipes.json : les dix premiers du championnat 2025-26, avec les notes du jeu EA Sports FC 27.
// Usage : node tools/ligue1.js          → réécrit ces dix équipes dans equipes.json (les quatre équipes de niveau ne bougent pas) et affiche les moyennes
//         node tools/ligue1.js voir     → n'écrit rien, affiche seulement les moyennes
// Attention : relancer cet outil efface les retouches faites à la main sur ces dix équipes dans equipes.json.
//
// D'où viennent les notes (recherche du 10 octobre 2026) :
// - Classement final 2025-26 : PSG 76 points, Lens 70, Lille 61, Lyon 60, Marseille 59, Rennes 59, Monaco 54, Strasbourg 53, Toulouse 45, Lorient 45.
// - Notes FC 27 : pages officielles d'EA (ea.com, « teams-ratings »), et futbin, fut.gg, fcratings, sportsdunia, wefut quand EA ne les donnait pas.
//   On n'a pu lire que des extraits de ces pages : pour chaque joueur on a au mieux la note générale et les six valeurs de sa carte
//   (vitesse, tir, passe, dribble, défense, physique ; pour un gardien : plongeon, mains, jeu au pied, réflexes, vitesse, placement).
// - Chaque joueur porte une « source » :
//     « carte »      : note générale et au moins une partie des six valeurs trouvées (les valeurs manquantes sont estimées) ;
//     « note seule » : seule la note générale a été trouvée, les six valeurs sont estimées d'après le poste ;
//     « supposé »    : joueur de l'effectif 2025-26 que je n'ai pas trouvé dans les notes FC 27 : présence au club et note estimées par moi.
//
// La conversion, en deux temps :
// 1. Des six valeurs de la carte aux vingt notes, sur l'échelle du jeu (1 à 99) : formules de DETAIL ci-dessous
//    (vitesse ← vitesse, passe ← passe, tacle ← défense, finition ← tir, jeu de tête ← physique et défense ou tir, etc., avec un petit
//    ajustement selon le poste : un milieu axial a plus d'endurance qu'un avant-centre, un défenseur central moins de vision).
// 2. De l'échelle du jeu à nos notes sur 20, une seule formule pour tous : note = (valeur + DECALAGE) / PENTE, arrondie, entre 1 et 20.
//    Elle est réglée pour que le PSG soit un peu au-dessus de l'équipe Élite et le dixième (Lorient) au niveau de l'équipe Moyen.
//    Un joueur de champ a 5 en réflexes et en jeu de mains.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), FILE = path.join(ROOT, 'equipes.json');
const PENTE = 6, DECALAGE = 3;
const note = v => Math.max(1, Math.min(20, Math.round((v + DECALAGE) / PENTE)));

// Valeurs de la carte estimées d'après la note générale, quand on ne les a pas trouvées (écart à la note générale, selon le poste du jeu).
// Joueur de champ : vitesse, tir, passe, dribble, défense, physique. Gardien : plongeon, mains, jeu au pied, réflexes, vitesse, placement.
const GABARIT = {
  GK: [1, -2, -6, 2, -35, 0],
  CB: [-6, -35, -15, -14, 1, 1],
  LB: [3, -18, -6, -4, -2, -3], RB: [3, -18, -6, -4, -2, -3],
  CDM: [-14, -12, -5, -4, -2, 2],
  CM: [-8, -6, 0, 1, -8, -6],
  CAM: [-4, -4, 0, 4, -40, -16],
  LM: [8, -4, -5, 3, -40, -10], RM: [8, -4, -5, 3, -40, -10], LW: [8, -4, -5, 3, -40, -10], RW: [8, -4, -5, 3, -40, -10],
  ST: [0, 2, -14, -2, -45, 0],
};
// famille de poste (pour les petits ajustements)
const FAM = { GK: 'G', CB: 'DC', LB: 'LAT', RB: 'LAT', CDM: 'MDEF', CM: 'MC', CAM: 'MOF', LM: 'AIL', RM: 'AIL', LW: 'AIL', RW: 'AIL', ST: 'BU' };
const adj = (f, t) => t[f] || 0;

// Des six valeurs de la carte (et de la note générale O) aux vingt notes, sur l'échelle du jeu.
function DETAIL(pos, O, c) {
  const f = FAM[pos];
  if (f === 'G') {
    const [DIV, HAN, KIC, REF, SPD, POS] = c;
    return { vitesse: 0.5 * SPD + 0.5 * O - 5, acceleration: 0.5 * SPD + 0.5 * O - 5, endurance: O - 20, passe: KIC - 6, vision: KIC - 4, prise_de_balle: KIC - 8,
      dribble: 40, finition: 40, tacle: 40, placement: POS, anticipation: POS + 2, lucidite: O, sang_froid: O + 2, volume_de_course: O - 25,
      agressivite: O - 15, gout_du_risque: O - 20, jeu_de_tete: O - 15, appels: 40, reflexes: (REF + DIV) / 2, mains: HAN };
  }
  const [P, S, A, D, F, H] = c;
  const def = f === 'DC' || f === 'LAT' || f === 'MDEF';
  return {
    vitesse: P,
    acceleration: P + adj(f, { AIL: 2, MOF: 2, LAT: 1, DC: -3 }),
    endurance: 0.5 * H + 0.5 * O + adj(f, { LAT: 6, MC: 6, MDEF: 4, AIL: 2, DC: -4, BU: -6 }),
    passe: A,
    vision: A + adj(f, { MOF: 4, MC: 3, BU: -2, LAT: -3, DC: -6 }),
    prise_de_balle: 0.7 * D + 0.3 * A + 2,
    dribble: D - (f === 'DC' ? 4 : 0),
    finition: S + adj(f, { BU: 3, MC: -3, MDEF: -5, LAT: -6, DC: -6 }),
    tacle: F,
    placement: def ? 0.7 * F + 0.3 * O : f === 'MC' ? 0.5 * F + 0.5 * O - 3 : 0.4 * F + 0.6 * O - 6,
    anticipation: Math.max(0.5 * F + 0.5 * O, O - (f === 'BU' ? 1 : 3)),
    lucidite: O + adj(f, { MC: 1, MOF: 1 }),
    sang_froid: O + adj(f, { BU: 1 }),
    volume_de_course: 0.5 * H + 0.5 * O + adj(f, { LAT: 4, MC: 5, MDEF: 4, AIL: 1, MOF: -1, DC: -3, BU: -5 }),
    agressivite: 0.6 * H + 0.4 * Math.max(F, 50),
    gout_du_risque: 0.5 * D + 0.3 * S + 0.2 * O - adj(f, { DC: 8, MDEF: 5, LAT: 3 }),
    jeu_de_tete: f === 'DC' ? 0.5 * H + 0.5 * F : f === 'BU' ? 0.55 * H + 0.45 * S - 2 : 0.6 * H + 0.2 * F + 0.2 * S - (f === 'AIL' ? 12 : 6),
    appels: f === 'BU' ? 0.6 * S + 0.4 * O + 2 : f === 'AIL' || f === 'MOF' ? 0.5 * S + 0.3 * P + 0.2 * O : f === 'MC' ? 0.5 * S + 0.5 * O - 6 :
      f === 'MDEF' ? 0.5 * S + 0.5 * O - 10 : f === 'LAT' ? 0.4 * P + 0.3 * S + 0.3 * O - 6 : 0.5 * S + 0.5 * O - 18,
    reflexes: null, mains: null,
  };
}

// ---------- les dix clubs ----------
// Titulaires : [place du 4-4-2 dans equipes.json, nom, poste dans le jeu, note générale FC 27, valeurs de la carte (null = à estimer), source]
// Remplaçants : [poste naturel (comme joueurs.json : G, AG, DC, AD, MG, MC, MD, AT), nom, poste dans le jeu, note, valeurs, source]
// Places : MCG = milieu récupérateur, MCD = organisateur, ATG = attaquant mobile, ATD = avant-centre.
const C = 'carte', N = 'note seule', S = 'supposé', _ = null;
const CLUBS = [
  { id: 'psg', nom: 'Paris SG', rang: 1, points: 76, titulaires: [
    ['G', 'Safonov', 'GK', 83, _, N], ['AG', 'Nuno Mendes', 'LB', 89, [94, _, _, _, _, _], C], ['DCG', 'Pacho', 'CB', 89, [80, 34, 63, 65, 90, 86], C],
    ['DCD', 'Marquinhos', 'CB', 87, _, N], ['AD', 'Hakimi', 'RB', 88, [92, _, _, _, _, _], C], ['MG', 'Kvaratskhelia', 'LW', 89, _, N],
    ['MCG', 'João Neves', 'CM', 88, _, N], ['MCD', 'Vitinha', 'CM', 90, [_, _, 88, 91, _, _], C], ['MD', 'Doué', 'RW', 86, _, N],
    ['ATG', 'Barcola', 'LW', 85, _, N], ['ATD', 'Dembélé', 'ST', 90, [90, 89, 83, 93, 55, 70], C]],
    remplacants: [['G', 'Chevalier', 'GK', 80, _, N], ['DC', 'L. Hernández', 'CB', 81, _, N], ['MC', 'Fabián Ruiz', 'CM', 86, _, N], ['MC', 'Zaïre-Emery', 'CM', 83, _, N], ['AT', 'Mbaye', 'RW', 76, _, N]] },
  { id: 'lens', nom: 'Lens', rang: 2, points: 70, titulaires: [
    ['G', 'Risser', 'GK', 81, [82, 76, 84, 84, 39, 78], C], ['AG', 'Udol', 'LB', 81, [70, 61, 76, 76, 79, 84], C], ['DCG', 'Ganiou', 'CB', 77, [73, _, 61, _, 77, 80], C],
    ['DCD', 'Baidoo', 'CB', 78, _, N], ['AD', 'Abdulhamid', 'RB', 77, _, N], ['MG', 'Sima', 'LW', 75, _, S],
    ['MCG', 'Haidara', 'CDM', 75, [61, 67, 75, 76, _, _], C], ['MCD', 'Sangaré', 'CM', 76, _, S], ['MD', 'Thauvin', 'RW', 82, [70, 79, 84, 83, 46, 68], C],
    ['ATG', 'Saïd', 'ST', 75, _, S], ['ATD', 'Édouard', 'ST', 78, _, N]],
    remplacants: [['G', 'Gurtner', 'GK', 70, _, S], ['DC', 'Gradit', 'CB', 77, [64, 29, _, _, 77, 77], C], ['AD', 'Aguilar', 'RB', 77, [64, _, 70, _, 75, 75], C], ['MC', 'Fulgini', 'CAM', 73, _, S], ['AT', 'Guilavogui', 'ST', 74, _, S]] },
  { id: 'lille', nom: 'Lille', rang: 3, points: 61, titulaires: [
    ['G', 'Özer', 'GK', 79, [79, 74, 72, 82, 44, 79], C], ['AG', 'Perraud', 'LB', 78, [_, _, 78, _, _, _], C], ['DCG', 'Ngoy', 'CB', 77, [79, _, _, _, _, _], C],
    ['DCD', 'Alexsandro', 'CB', 79, _, N], ['AD', 'Meunier', 'RB', 77, [_, _, _, _, _, 82], C], ['MG', 'Sahraoui', 'LM', 76, [_, _, _, 82, _, _], C],
    ['MCG', 'André', 'CDM', 80, [54, 64, 73, 76, 79, 83], C], ['MCD', 'Bouaddi', 'CDM', 80, [75, 56, 74, 79, 75, 76], C], ['MD', 'Fernandez-Pardo', 'RW', 78, [91, _, _, 82, _, _], C],
    ['ATG', 'Haraldsson', 'CAM', 78, [_, _, _, 81, _, _], C], ['ATD', 'Giroud', 'ST', 78, [_, 79, _, _, _, _], C]],
    remplacants: [['G', 'Mannone', 'GK', 68, _, S], ['DC', 'Mandi', 'CB', 77, _, N], ['MC', 'Mukau', 'CM', 73, _, N], ['MG', 'Correia', 'LW', 75, _, N], ['AT', 'Igamane', 'ST', 76, _, N]] },
  { id: 'lyon', nom: 'Lyon', rang: 4, points: 60, titulaires: [
    ['G', 'Greif', 'GK', 80, [78, 76, 82, 82, 24, 81], C], ['AG', 'Tagliafico', 'LB', 78, _, N], ['DCG', 'Niakhaté', 'CB', 80, [69, 49, 65, 64, 81, 81], C],
    ['DCD', 'Mata', 'CB', 76, _, S], ['AD', 'Maitland-Niles', 'RB', 75, _, S], ['MG', 'Fofana', 'LW', 78, [86, _, _, 82, _, _], C],
    ['MCG', 'Morton', 'CDM', 79, _, N], ['MCD', 'Tolisso', 'CM', 82, [69, 79, 80, 76, 78, 82], C], ['MD', 'Moreira', 'RW', 76, [91, _, _, _, _, _], S],
    ['ATG', 'Šulc', 'CAM', 78, _, N], ['ATD', 'Endrick', 'ST', 78, [87, _, _, 80, _, _], C]],
    remplacants: [['G', 'Descamps', 'GK', 70, _, S], ['AG', 'Abner', 'LB', 74, _, S], ['AD', 'Kumbedi', 'RB', 72, _, S], ['MC', 'Karabec', 'CAM', 75, _, S], ['AT', 'Satriano', 'ST', 74, _, S]] },
  { id: 'marseille', nom: 'Marseille', rang: 5, points: 59, titulaires: [
    ['G', 'Rulli', 'GK', 80, [81, 77, 80, 85, 54, 75], C], ['AG', 'Emerson', 'LB', 76, _, S], ['DCG', 'Aguerd', 'CB', 80, [75, 50, 66, 65, 81, 81], C],
    ['DCD', 'Balerdi', 'CB', 79, _, N], ['AD', 'Murillo', 'RB', 77, _, S], ['MG', 'Paixão', 'LM', 79, [87, 78, 75, 80, 32, 70], C],
    ['MCG', 'Højbjerg', 'CDM', 80, [49, 71, 75, 74, 76, 82], C], ['MCD', 'Timber', 'CM', 79, [76, 77, 75, 79, 74, 83], C], ['MD', 'Weah', 'RM', 78, [87, 75, 72, 77, 68, 67], C],
    ['ATG', 'Gouiri', 'ST', 80, [77, 82, 77, 81, 45, 71], C], ['ATD', 'Vaz', 'ST', 74, _, S]],
    remplacants: [['G', 'De Lange', 'GK', 72, _, S], ['DC', 'Egan-Riley', 'CB', 74, _, S], ['AD', 'Pavard', 'RB', 78, _, S], ['MC', 'Gomes', 'CM', 77, _, S], ['MC', 'Nadir', 'CAM', 73, _, S]] },
  { id: 'rennes', nom: 'Rennes', rang: 6, points: 59, titulaires: [
    ['G', 'Samba', 'GK', 80, _, N], ['AG', 'Merlin', 'LB', 76, _, N], ['DCG', 'Brassier', 'CB', 76, _, N],
    ['DCD', 'Rouault', 'CB', 76, _, N], ['AD', 'Hateboer', 'RB', 76, _, N], ['MG', 'Blas', 'LM', 77, _, N],
    ['MCG', 'Rongier', 'CDM', 80, [60, 66, 75, 78, 74, 78], C], ['MCD', 'Thomasson', 'CM', 81, [57, 74, 82, 80, 71, 75], C], ['MD', 'Al-Tamari', 'RW', 76, _, S],
    ['ATG', 'Embolo', 'ST', 77, _, N], ['ATD', 'Lepaul', 'ST', 81, [76, 83, 61, 78, 39, 71], C]],
    remplacants: [['G', 'Silistrie', 'GK', 68, _, S], ['DC', 'Cresswell', 'CB', 78, _, S], ['MC', 'Camara', 'CM', 78, _, N], ['MC', 'Fofana', 'CM', 77, _, N], ['AT', 'Dia', 'ST', 78, [83, 79, 66, 78, 43, 66], C]] },
  { id: 'monaco', nom: 'Monaco', rang: 7, points: 54, titulaires: [
    ['G', 'Hrádecký', 'GK', 79, _, N], ['AG', 'Caio Henrique', 'LB', 75, _, S], ['DCG', 'Kehrer', 'CB', 76, _, S],
    ['DCD', 'Teze', 'CB', 78, _, N], ['AD', 'Vanderson', 'RB', 77, _, N], ['MG', 'Golovin', 'CAM', 78, [_, _, _, 82, _, _], C],
    ['MCG', 'Zakaria', 'CDM', 81, [80, 67, 74, 77, 80, 85], C], ['MCD', 'Camara', 'CM', 80, [79, 69, 82, 79, 71, 72], C], ['MD', 'Minamino', 'CAM', 77, _, N],
    ['ATG', 'Abline', 'ST', 77, [86, _, _, _, _, _], S], ['ATD', 'Balogun', 'ST', 80, [84, 80, 63, 78, 24, 71], C]],
    remplacants: [['G', 'Köhn', 'GK', 77, _, N], ['DC', 'Mawissa', 'CB', 74, _, S], ['MC', 'Magassa', 'CDM', 74, _, S], ['MG', 'Ben Seghir', 'CAM', 76, _, S], ['AT', 'Biereth', 'ST', 76, _, S]] },
  { id: 'strasbourg', nom: 'Strasbourg', rang: 8, points: 53, titulaires: [
    ['G', 'Penders', 'GK', 78, _, N], ['AG', 'Chilwell', 'LB', 77, _, N], ['DCG', 'Doukouré', 'CB', 77, _, N],
    ['DCD', 'Omobamidele', 'CB', 75, _, S], ['AD', 'G. Doué', 'RB', 78, _, N], ['MG', 'Godo', 'LM', 76, _, N],
    ['MCG', 'El Mourabet', 'CDM', 75, _, N], ['MCD', 'Barco', 'CM', 77, _, S], ['MD', 'Moreira', 'RM', 79, [89, 69, 70, 83, 64, 69], C],
    ['ATG', 'Enciso', 'CAM', 78, [78, 74, 72, 83, 33, 53], C], ['ATD', 'Panichelli', 'ST', 79, [69, 81, 63, 73, 28, 82], C]],
    remplacants: [['DC', 'Sarr', 'CB', 74, _, S], ['MC', 'Ouattara', 'CDM', 72, _, S], ['MD', 'Nanasi', 'RW', 75, _, N], ['MD', 'Bakwa', 'RW', 74, _, S]] },
  { id: 'toulouse', nom: 'Toulouse', rang: 9, points: 45, titulaires: [
    ['G', 'Restes', 'GK', 78, [79, 75, 80, 80, 40, 78], C], ['AG', 'Methalie', 'LB', 72, _, S], ['DCG', 'Nicolaisen', 'CB', 76, [46, 41, 56, 60, 76, 80], C],
    ['DCD', 'McKenzie', 'CB', 75, _, N], ['AD', 'Sidibé', 'RB', 72, _, S], ['MG', 'Gboho', 'LW', 77, [79, 70, 71, 82, 36, 65], C],
    ['MCG', 'Cásseres', 'CDM', 76, [77, 64, 69, 73, 76, 77], C], ['MCD', 'Schmidt', 'CM', 73, _, S], ['MD', 'Dønnum', 'RM', 76, [81, 68, 72, 77, 52, 74], C],
    ['ATG', 'Hidalgo', 'RW', 73, _, N], ['ATD', 'Magri', 'ST', 73, _, S]],
    remplacants: [['G', 'Haug', 'GK', 70, _, S], ['AD', 'Kamanzi', 'RB', 72, _, S], ['MC', 'Jørgensen', 'CM', 72, _, S], ['AT', 'Emersonn', 'ST', 72, _, S]] },
  { id: 'lorient', nom: 'Lorient', rang: 10, points: 45, titulaires: [
    ['G', 'Mvogo', 'GK', 77, _, N], ['AG', 'Yongwa', 'LB', 71, _, S], ['DCG', 'Talbi', 'CB', 75, _, N],
    ['DCD', 'Touré', 'CB', 70, _, N], ['AD', 'Kouassi', 'RB', 77, _, N], ['MG', 'Le Bris', 'LM', 70, _, S],
    ['MCG', 'Abergel', 'CDM', 74, _, S], ['MCD', 'Makengo', 'CM', 72, _, S], ['MD', 'Pagis', 'RW', 73, _, S],
    ['ATG', 'Aiyegun', 'ST', 73, _, S], ['ATD', 'Meïté', 'ST', 73, _, S]],
    remplacants: [['AD', 'Katseris', 'RB', 70, _, S], ['MC', 'Ponceau', 'CM', 71, _, S], ['AT', 'Dieng', 'ST', 72, _, S]] },
];
const NUM = { G: 1, AG: 3, DCG: 4, DCD: 5, AD: 2, MG: 7, MCG: 6, MCD: 8, MD: 10, ATG: 11, ATD: 9 };
const NATUREL = { G: 'G', AG: 'AG', DCG: 'DC', DCD: 'DC', AD: 'AD', MG: 'MG', MCG: 'MC', MCD: 'MC', MD: 'MD', ATG: 'AT', ATD: 'AT' };
const KEYS = ['vitesse', 'acceleration', 'endurance', 'passe', 'vision', 'prise_de_balle', 'dribble', 'finition', 'tacle', 'placement', 'anticipation', 'lucidite', 'sang_froid',
  'volume_de_course', 'agressivite', 'gout_du_risque', 'jeu_de_tete', 'appels', 'reflexes', 'mains'];

function notesOf(pos, O, carte) {
  const g = GABARIT[pos]; if (!g) throw new Error('poste du jeu inconnu : ' + pos);
  const c = g.map((d, i) => carte && carte[i] != null ? carte[i] : O + d);
  const x = DETAIL(pos, O, c), out = {};
  for (const k of KEYS) out[k] = x[k] == null ? 5 : note(x[k]);
  return out;
}
function build() {
  return CLUBS.map(K => {
    if (K.titulaires.length !== 11) throw new Error(K.nom + ' : il faut 11 titulaires');
    return {
      id: K.id, nom: K.nom,
      description: K.rang + (K.rang === 1 ? 'er' : 'e') + ' de Ligue 1 en 2025-26 (' + K.points + ' points). D\'après les notes EA Sports FC 27 (octobre 2026), converties sur 20 par tools/ligue1.js.',
      championnat: 'Ligue 1 2025-26', classement: K.rang,
      joueurs: K.titulaires.map(([poste, nom, pos, O, carte, src]) => ({ poste, numero: NUM[poste], nom, poste_naturel: NATUREL[poste], fc: O, source: src, notes: notesOf(pos, O, carte) })),
      remplacants: K.remplacants.map(([pn, nom, pos, O, carte, src], k) => ({ poste_naturel: pn, numero: 12 + k, nom, fc: O, source: src, notes: notesOf(pos, O, carte) })),
    };
  });
}

// ---------- écriture dans equipes.json : une ligne par joueur, comme les autres équipes ----------
const pad = (s, w) => (s + ' '.repeat(w)).slice(0, Math.max(w, s.length));
function playerLine(j) {
  const head = j.poste ? '"poste": ' + pad(JSON.stringify(j.poste) + ',', 6) + ' ' : '';
  const notes = KEYS.map(k => JSON.stringify(k) + ': ' + String(j.notes[k]).padStart(2)).join(', ');
  return '{ ' + head + '"numero": ' + String(j.numero).padStart(2) + ', "nom": ' + pad(JSON.stringify(j.nom) + ',', 18) + ' "poste_naturel": ' + pad(JSON.stringify(j.poste_naturel) + ',', 5) +
    ' "fc": ' + j.fc + ', "source": ' + pad(JSON.stringify(j.source) + ',', 13) + ' "notes": { ' + notes + ' } }';
}
function teamText(T) {
  return '    {\n      "id": ' + JSON.stringify(T.id) + ',\n      "nom": ' + JSON.stringify(T.nom) + ',\n      "description": ' + JSON.stringify(T.description) +
    ',\n      "championnat": ' + JSON.stringify(T.championnat) + ',\n      "classement": ' + T.classement +
    ',\n      "joueurs": [\n' + T.joueurs.map(j => '        ' + playerLine(j)).join(',\n') + '\n      ],\n      "remplacants": [\n' + T.remplacants.map(j => '        ' + playerLine(j)).join(',\n') + '\n      ]\n    }';
}

const teams = build();
const avg = T => { let s = 0, n = 0; for (const j of T.joueurs) for (const k of KEYS) { s += j.notes[k]; n++; } return s / n; };
const strong = T => {      // moyenne des cinq meilleures notes de chaque titulaire (ses « points forts »)
  return T.joueurs.reduce((s, j) => s + KEYS.map(k => j.notes[k]).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) / 5, 0) / 11;
};
if (require.main === module) {
  const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log('Moyenne des vingt notes des titulaires (réflexes et mains compris), puis moyenne des cinq meilleures notes de chaque titulaire :');
  for (const T of old.equipes.filter(T => !T.championnat).concat(teams)) console.log('  ' + pad(T.nom, 12) + avg(T).toFixed(2).padStart(6) + strong(T).toFixed(2).padStart(8) + (T.championnat ? '   (' + T.joueurs.filter(j => j.source === 'supposé').length + ' titulaires supposés)' : ''));
  if (process.argv[2] !== 'voir') {
    const keep = old.equipes.filter(T => !T.championnat);      // les équipes de niveau (et toute équipe ajoutée à la main) restent telles quelles
    const src = fs.readFileSync(FILE, 'utf8');
    // on recopie le texte des équipes gardées tel quel (mise en forme d'origine), puis on ajoute les dix clubs
    const blocks = [];
    for (const T of keep) {
      const start = src.indexOf('    {\n      "id": ' + JSON.stringify(T.id));
      if (start < 0) throw new Error('équipe introuvable dans le texte de equipes.json : ' + T.id);
      let depth = 0, i = start + 4;
      for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
      blocks.push(src.slice(start, i + 1));
    }
    const head = src.slice(0, src.indexOf('  "equipes": [')) + '  "equipes": [\n';
    const txt = head + blocks.concat(teams.map(teamText)).join(',\n') + '\n  ]\n}\n';
    JSON.parse(txt);      // le fichier écrit doit rester du JSON valide
    fs.writeFileSync(FILE, txt);
    console.log('equipes.json écrit : ' + keep.length + ' équipes gardées, ' + teams.length + ' clubs de Ligue 1.');
  }
}
module.exports = { CLUBS, build, note, PENTE, DECALAGE };
