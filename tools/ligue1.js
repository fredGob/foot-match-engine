// Fabrique les dix équipes de Ligue 1 de equipes.json : les dix premiers du championnat 2025-26, avec leur effectif d'octobre 2026
// (après le mercato d'été 2026), leur système et le style de leur entraîneur.
// Usage : node tools/ligue1.js            → n'écrit rien, affiche seulement les moyennes
//         node tools/ligue1.js reecrire   → réécrit ces dix équipes dans equipes.json (les quatre équipes de niveau ne bougent pas)
// Attention : « reecrire » efface les retouches faites à la main sur ces dix équipes dans equipes.json.
// Depuis le n° 106, les notes se retouchent à la main dans equipes.json : ce fichier n'est plus la référence.
//
// - Classement final 2025-26 : PSG 76 points, Lens 70, Lille 61, Lyon 60, Marseille 59, Rennes 59, Monaco 54, Strasbourg 53, Toulouse 45, Lorient 45.
// - Notes de base : pour chaque joueur, une note générale sur 99 et, quand on l'a, un profil de six valeurs
//   (vitesse, tir, passe, dribble, défense, physique ; pour un gardien : plongeon, mains, jeu au pied, réflexes, vitesse, placement).
//   Ce n'est qu'une base de départ, à corriger à la main.
// - Chaque joueur porte une « source » :
//     « détaillé »     : note générale et au moins une partie du profil (les valeurs manquantes sont estimées) ;
//     « note globale » : seule la note générale, le profil est estimé d'après le poste ;
//     « supposé »      : note estimée sans base (souvent une recrue de l'été 2026).
//
// Effectifs (recherche du 11 au 13 octobre 2026) : onze type de l'entraîneur (compositions de la 6e journée), remplaçants vus dans les
// compositions récentes. Laissés de côté : les blessés pour longtemps et les joueurs dont la présence au club n'a pas pu être vérifiée.
//
// Style de l'entraîneur (« consignes ») : estimé d'après la réputation de chaque entraîneur et de son équipe, à corriger à la main.
//
// La conversion, en deux temps :
// 1. Des six valeurs du profil aux vingt notes, sur l'échelle 1 à 99 : formules de DETAIL ci-dessous
//    (vitesse ← vitesse, passe ← passe, tacle ← défense, finition ← tir, jeu de tête ← physique et défense ou tir, etc., avec un petit
//    ajustement selon le poste : un milieu axial a plus d'endurance qu'un avant-centre, un défenseur central moins de vision).
// 2. De l'échelle 1 à 99 à nos notes sur 20, une seule formule pour tous : note = (valeur + DECALAGE) / PENTE, arrondie, entre 1 et 20.
//    Elle est réglée pour que le PSG soit un peu au-dessus de l'équipe Élite et le dixième (Lorient) au niveau de l'équipe Moyen.
//    Un joueur de champ a 5 en réflexes et en jeu de mains.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), FILE = path.join(ROOT, 'equipes.json');
const PENTE = 6, DECALAGE = 3;
const note = v => Math.max(1, Math.min(20, Math.round((v + DECALAGE) / PENTE)));

// Valeurs du profil estimées d'après la note générale, quand on ne les a pas trouvées (écart à la note générale, selon le poste du jeu).
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

// Des six valeurs du profil (et de la note générale O) aux vingt notes, sur l'échelle 1 à 99.
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
// Titulaires : [place dans equipes.json, nom, poste réel, note générale sur 99, profil (null = à estimer), source]
// Remplaçants : [poste naturel (comme joueurs.json : G, AG, DC, AD, MG, MC, MD, AT), nom, poste réel, note, profil, source]
// Places : MCG = milieu récupérateur, MCD = organisateur, ATG = attaquant mobile, ATD = avant-centre.
const C = 'détaillé', N = 'note globale', S = 'supposé', _ = null;
const CLUBS = [
  // Onze types : compositions de la 6e journée (9-11 octobre 2026) ; PSG : onze annoncé contre Manchester City (14 octobre), le PSG ayant fait tourner à la 6e journée.
  // Les codes de place sont ceux de la formation du club (voir E.formationPlaces) : en 4-3-3, MG = ailier gauche, MCG = milieu défensif,
  // MCD = milieu intérieur droit, MD = ailier droit, ATG = milieu intérieur gauche, ATD = avant-centre ; en 4-2-3-1, MG / MD = milieux offensifs
  // de côté, MCG / MCD = milieux défensifs, ATG = milieu offensif axial ; en 3-4-2-1, AG / AD = pistons, MCG = défenseur central du milieu,
  // MG / MD = milieux offensifs (derrière l'avant-centre), ATG / MCD = milieux axiaux gauche / droit.
  { id: 'psg', nom: 'Paris Saint-Qatar', court: 'PSQ', rang: 1, points: 76, formation: '433', consignes: { passing: -1, width: 1, line: 1, press: 1, cross: 1 }, entraineur: 'Luis Enrique', titulaires: [
    ['G', 'Safonov', 'GK', 83, _, N], ['AG', 'Nuno Mendes', 'LB', 89, [94, _, _, _, _, _], C], ['DCG', 'Pacho', 'CB', 89, [80, 34, 63, 65, 90, 86], C],
    ['DCD', 'Marquinhos', 'CB', 87, _, N], ['AD', 'Hakimi', 'RB', 88, [92, _, _, _, _, _], C], ['MG', 'Kvaratskhelia', 'LW', 89, _, N],
    ['MCG', 'Vitinha', 'CM', 90, [_, _, 88, 91, _, _], C], ['MCD', 'João Neves', 'CM', 88, _, N], ['MD', 'Doué', 'RW', 86, _, N],
    ['ATG', 'Fabián Ruiz', 'CM', 86, _, N], ['ATD', 'Dembélé', 'ST', 90, [90, 89, 83, 93, 55, 70], C]],
    remplacants: [['G', 'Chevalier', 'GK', 80, _, N], ['DC', 'Zabarnyi', 'CB', 80, _, N], ['AG', 'L. Hernández', 'LB', 81, _, N], ['DC', 'Beraldo', 'CB', 78, _, S],
      ['MC', 'Zaïre-Emery', 'CM', 83, _, N], ['MD', 'Akliouche', 'CAM', 81, _, N], ['AT', 'Ferran Torres', 'ST', 84, [88, _, _, _, _, _], C]] },
  { id: 'lens', nom: 'RC Lentilles', court: 'RCL', rang: 2, points: 70, formation: '3421', consignes: { tempo: 1, width: 1, press: 1 }, entraineur: 'Yannick Cahuzac', titulaires: [
    ['G', 'Risser', 'GK', 81, [82, 76, 84, 84, 39, 78], C], ['AG', 'Udol', 'LB', 81, [70, 61, 76, 76, 79, 84], C], ['DCG', 'Ganiou', 'CB', 77, [73, _, 61, _, 77, 80], C],
    ['MCG', 'Antonio', 'CB', 74, _, S], ['DCD', 'Gradit', 'CB', 77, [64, 29, _, _, 77, 77], C], ['AD', 'Aguilar', 'RB', 77, [64, _, 70, _, 75, 75], C],
    ['ATG', 'Titraoui', 'CM', 71, _, S], ['MCD', 'Cuisance', 'CM', 73, _, S], ['MD', 'Thauvin', 'RW', 82, [70, 79, 84, 83, 46, 68], C],
    ['MG', 'Sotoca', 'ST', 74, _, S], ['ATD', 'Édouard', 'ST', 78, _, N]],
    remplacants: [['G', 'Gorgelin', 'GK', 70, _, S], ['DC', 'Todibo', 'CB', 78, _, N], ['DC', 'Baidoo', 'CB', 78, _, N], ['AD', 'Abdulhamid', 'RB', 77, _, N],
      ['MC', 'Haidara', 'CDM', 75, [61, 67, 75, 76, _, _], C], ['AT', 'Ivanović', 'ST', 74, _, S], ['MG', 'Kadile', 'LW', 70, _, S]] },
  { id: 'lille', nom: 'Olympique Ch\'ti de Lille', court: 'LIL', rang: 3, points: 61, formation: '4231', consignes: { passing: -1 }, titulaires: [
    ['G', 'Özer', 'GK', 79, [79, 74, 72, 82, 44, 79], C], ['AG', 'Perraud', 'LB', 78, [_, _, 78, _, _, _], C], ['DCG', 'Alexsandro', 'CB', 78, _, N],
    ['DCD', 'Nianzou', 'CB', 74, _, S], ['AD', 'Tiago Santos', 'RB', 77, _, S], ['MG', 'Perrin', 'LW', 72, _, S],
    ['MCG', 'Bentaleb', 'CDM', 74, _, S], ['MCD', 'Mukau', 'CM', 73, _, N], ['MD', 'Bakwa', 'RW', 76, _, S],
    ['ATG', 'Kjærgaard', 'CAM', 73, _, S], ['ATD', 'Giroud', 'ST', 78, [_, 79, _, _, _, _], C]],
    remplacants: [['DC', 'Ngoy', 'CB', 77, [79, _, _, _, _, _], C], ['MC', 'André', 'CDM', 80, [54, 64, 73, 76, 79, 83], C], ['MG', 'Sahraoui', 'LW', 73, _, S],
      ['MG', 'Correia', 'LW', 75, _, N], ['AT', 'Ueda', 'ST', 78, _, N], ['MD', 'E. Mbappé', 'CM', 72, _, S]] },
  { id: 'lyon', nom: 'Olympique Lyon-Quenelle', court: 'OLQ', rang: 4, points: 60, formation: '4231', consignes: { tempo: 1, width: 1, line: 1, press: 1 }, entraineur: 'Paulo Fonseca', titulaires: [
    ['G', 'Greif', 'GK', 81, [78, 76, 82, 82, 24, 81], C], ['AG', 'Abner', 'LB', 74, _, S], ['DCG', 'Kluivert', 'CB', 74, _, S],
    ['DCD', 'Bacher', 'CB', 73, _, S], ['AD', 'Athekame', 'RB', 74, _, S], ['MG', 'Tolisso', 'CM', 82, [69, 79, 80, 76, 78, 82], C],
    ['MCG', 'Morton', 'CDM', 79, _, N], ['MCD', 'Bidstrup', 'CM', 75, _, S], ['MD', 'Nuamah', 'RM', 74, _, N],
    ['ATG', 'Šulc', 'CAM', 79, _, N], ['ATD', 'Openda', 'ST', 79, [94, _, _, _, _, _], S]],
    remplacants: [['G', 'Descamps', 'GK', 70, _, S], ['DC', 'Niakhaté', 'CB', 81, [69, 49, 65, 64, 81, 81], C], ['AG', 'Tagliafico', 'LB', 77, _, S],
      ['MG', 'Nakamura', 'LW', 75, _, S], ['MG', 'Duranville', 'LW', 72, _, S]] },
  { id: 'marseille', nom: 'Olympique de Marsupilami', court: 'OMA', rang: 5, points: 59, formation: '4231', consignes: { passing: -1 }, entraineur: 'Bruno Genesio', titulaires: [
    ['G', 'De Lange', 'GK', 74, _, N], ['AG', 'Emerson', 'LB', 77, [71, _, 75, _, _, _], C], ['DCG', 'Aguerd', 'CB', 80, [75, 50, 66, 65, 81, 81], C],
    ['DCD', 'Egan-Riley', 'CB', 75, [80, _, _, _, 74, _], C], ['AD', 'Bezahaf', 'RB', 70, _, S], ['MG', 'Paixão', 'LM', 79, [87, 78, 75, 80, 32, 70], C],
    ['MCG', 'Kamissoko', 'CDM', 72, _, S], ['MCD', 'Abdelli', 'CM', 75, _, N], ['MD', 'Harit', 'RM', 74, _, N],
    ['ATG', 'A. Gomes', 'CAM', 75, [71, _, _, 78, _, _], C], ['ATD', 'Gouiri', 'ST', 80, [77, 82, 77, 81, 45, 71], C]],
    remplacants: [['AD', 'U. Garcia', 'RB', 73, _, N], ['MC', 'Nnadi', 'CDM', 73, _, S], ['AT', 'Maupay', 'ST', 74, [70, 74, _, _, _, _], C]] },
  { id: 'rennes', nom: 'Stade Galette-Saucisse', court: 'SGS', rang: 6, points: 59, formation: '433', consignes: { tempo: 1, width: 1, line: 1, press: 1 }, entraineur: 'Franck Haise', titulaires: [
    ['G', 'Samba', 'GK', 81, _, N], ['AG', 'Nagida', 'LB', 72, _, S], ['DCG', 'Rouault', 'CB', 76, _, N],
    ['DCD', 'Cresswell', 'CB', 78, _, N], ['AD', 'Reynolds', 'RB', 74, _, S], ['MG', 'Al-Tamari', 'LW', 76, _, S],
    ['MCG', 'Rongier', 'CDM', 80, [60, 66, 75, 78, 74, 78], C], ['MCD', 'Camara', 'CM', 78, _, N], ['MD', 'Soumaré', 'RW', 74, _, S],
    ['ATG', 'Thomasson', 'CM', 81, [57, 74, 82, 80, 71, 75], C], ['ATD', 'Lepaul', 'ST', 81, [76, 83, 61, 78, 39, 71], C]],
    remplacants: [['G', 'Silistrie', 'GK', 68, _, S], ['AD', 'Frankowski', 'RB', 75, _, S], ['DC', 'Aït Boudlal', 'CB', 73, _, S], ['AG', 'Merlin', 'LB', 74, _, S],
      ['MC', 'Blas', 'CAM', 77, _, S], ['AT', 'Dia', 'ST', 78, [83, 79, 66, 78, 43, 66], C], ['MG', 'Nordin', 'LW', 74, _, S]] },
  { id: 'monaco', nom: 'AS Paradis Fiscal', court: 'ASP', rang: 7, points: 54, formation: '4231', consignes: { tempo: 1, line: 1, press: 1 }, titulaires: [
    ['G', 'Hrádecký', 'GK', 79, _, N], ['AG', 'Nazinho', 'LB', 72, _, S], ['DCG', 'Dier', 'CB', 77, _, N],
    ['DCD', 'Sané', 'CB', 72, _, S], ['AD', 'Vanderson', 'RB', 77, _, N], ['MG', 'Detourbet', 'LW', 70, _, S],
    ['MCG', 'Zakaria', 'CDM', 81, [80, 67, 74, 77, 80, 85], C], ['MCD', 'Camara', 'CM', 80, [79, 69, 82, 79, 71, 72], C], ['MD', 'Diop', 'RM', 72, _, S],
    ['ATG', 'Golovin', 'CAM', 78, [_, _, _, 82, _, _], C], ['ATD', 'Abline', 'ST', 77, [86, _, _, _, _, _], S]],
    remplacants: [['G', 'Köhn', 'GK', 77, _, N], ['DC', 'Teze', 'CB', 78, _, N], ['DC', 'Salisu', 'CB', 76, _, S], ['DC', 'Mawissa', 'CB', 74, _, S],
      ['MG', 'Ansu Fati', 'LW', 77, _, N], ['AT', 'Brunner', 'ST', 70, _, S]] },
  { id: 'strasbourg', nom: 'Racing Choucroute', court: 'RCH', rang: 8, points: 53, formation: '433', consignes: { passing: -1, line: 1, press: 1 }, titulaires: [
    ['G', 'F. Jørgensen', 'GK', 77, _, N], ['AG', 'Oso', 'LB', 73, _, S], ['DCG', 'K. Coulibaly', 'CB', 74, _, S],
    ['DCD', 'Mitchell', 'CB', 72, _, S], ['AD', 'Antwi', 'RB', 72, _, S], ['MG', 'Amo-Ameyaw', 'LW', 72, _, S],
    ['MCG', 'Diop', 'CDM', 72, _, S], ['MCD', 'Diogo Sousa', 'CM', 70, _, N], ['MD', 'Yassine', 'RW', 72, _, S],
    ['ATG', 'Essugo', 'CM', 75, _, N], ['ATD', 'Harder', 'ST', 74, _, S]],
    remplacants: [['DC', 'Doukouré', 'CB', 77, _, N], ['DC', 'S. Coulibaly', 'CB', 72, _, N], ['MC', 'El Mourabet', 'CDM', 75, _, N], ['MD', 'Nanasi', 'RW', 75, _, N],
      ['MC', 'Reyna', 'CAM', 73, _, N], ['AT', 'Deivid Washington', 'ST', 73, _, S]] },
  { id: 'toulouse', nom: 'Toulouse Cassoulet FC', court: 'TCF', rang: 9, points: 45, formation: '4231', consignes: { passing: -1, width: 1 }, titulaires: [
    ['G', 'Restes', 'GK', 78, [79, 75, 80, 80, 40, 78], C], ['AG', 'Tapé', 'LB', 70, _, S], ['DCG', 'McKenzie', 'CB', 75, _, N],
    ['DCD', 'Koumbassa', 'CB', 72, _, S], ['AD', 'Messali', 'RB', 70, _, S], ['MG', 'Azizi', 'LW', 70, _, S],
    ['MCG', 'Cásseres', 'CDM', 76, [77, 64, 69, 73, 76, 77], C], ['MCD', 'Vossah', 'CM', 70, _, S], ['MD', 'Tengstedt', 'RW', 72, _, S],
    ['ATG', 'T. Jørgensen', 'CAM', 76, _, S], ['ATD', 'Russell-Rowe', 'ST', 72, _, S]],
    remplacants: [['G', 'Haug', 'GK', 70, _, S], ['DC', 'Nicolaisen', 'CB', 76, [46, 41, 56, 60, 76, 80], C], ['AD', 'Kamanzi', 'RB', 72, _, S],
      ['MC', 'Sigur', 'CM', 72, _, S], ['MD', 'Hidalgo', 'RW', 73, _, N], ['MD', 'Dønnum', 'RM', 76, [81, 68, 72, 77, 52, 74], C]] },
  { id: 'lorient', nom: 'FC Lorient-Express', court: 'FLE', rang: 10, points: 45, formation: '3421', consignes: { passing: 1, tempo: 1, line: -1, press: -1, cross: -1 }, titulaires: [
    ['G', 'Mvogo', 'GK', 77, _, N], ['AG', 'Kouassi', 'LB', 77, _, N], ['DCG', 'Touré', 'CB', 72, _, S],
    ['MCG', 'Talbi', 'CB', 75, _, N], ['DCD', 'Adjei', 'CB', 70, _, N], ['AD', 'Georgen', 'RB', 68, _, S],
    ['MG', 'Makengo', 'CAM', 74, _, N], ['ATG', 'Cadiou', 'CDM', 70, _, S], ['MCD', 'Sylla', 'CM', 70, _, S],
    ['MD', 'Jensen', 'ST', 70, _, S], ['ATD', 'Koné', 'ST', 70, _, S]],
    remplacants: [['AD', 'Katseris', 'RB', 70, _, S], ['MG', 'Le Bris', 'LW', 70, _, S], ['AT', 'Baldé', 'ST', 70, _, S], ['AT', 'Bernardeau', 'ST', 66, _, S]] },
];
const NUM = { G: 1, AG: 3, DCG: 4, DCD: 5, AD: 2, MG: 7, MCG: 6, MCD: 8, MD: 10, ATG: 11, ATD: 9 };
const NAT_OF = { GK: 'G', LB: 'AG', RB: 'AD', CB: 'DC', CDM: 'MC', CM: 'MC', CAM: 'MC', LM: 'MG', LW: 'MG', RM: 'MD', RW: 'MD', ST: 'AT' };      // poste naturel d'après le poste réel du joueur
const NATUREL = { G: 'G', AG: 'AG', DCG: 'DC', DCD: 'DC', AD: 'AD', MG: 'MG', MCG: 'MC', MCD: 'MC', MD: 'MD', ATG: 'AT', ATD: 'AT' };
const KEYS = ['vitesse', 'acceleration', 'endurance', 'passe', 'vision', 'prise_de_balle', 'dribble', 'finition', 'tacle', 'placement', 'anticipation', 'lucidite', 'sang_froid',
  'volume_de_course', 'agressivite', 'gout_du_risque', 'jeu_de_tete', 'appels', 'reflexes', 'mains'];

function notesOf(pos, O, profil) {
  const g = GABARIT[pos]; if (!g) throw new Error('poste du jeu inconnu : ' + pos);
  const c = g.map((d, i) => profil && profil[i] != null ? profil[i] : O + d);
  const x = DETAIL(pos, O, c), out = {};
  for (const k of KEYS) out[k] = x[k] == null ? 5 : note(x[k]);
  return out;
}
function build() {
  return CLUBS.map(K => {
    if (K.titulaires.length !== 11) throw new Error(K.nom + ' : il faut 11 titulaires');
    return {
      id: K.id, nom: K.nom,
      description: K.rang + (K.rang === 1 ? 'er' : 'e') + ' de Ligue 1 en 2025-26 (' + K.points + ' points). Effectif d\'octobre 2026' + (K.entraineur ? ', entraîneur ' + K.entraineur : '') + '.',
      championnat: 'Ligue 1 2026-27', classement: K.rang, court: K.court, formation: K.formation, consignes: Object.assign({ passing: 0, tempo: 0, width: 0, line: 0, press: 0, cross: 0 }, K.consignes),
      joueurs: K.titulaires.map(([poste, nom, pos, O, profil, src]) => ({ poste, numero: NUM[poste], nom, poste_naturel: NAT_OF[pos], source: src, notes: notesOf(pos, O, profil) })),
      remplacants: K.remplacants.map(([pn, nom, pos, O, profil, src], k) => ({ poste_naturel: pn, numero: 12 + k, nom, source: src, notes: notesOf(pos, O, profil) })),
    };
  });
}

// ---------- écriture dans equipes.json : une ligne par joueur, comme les autres équipes ----------
const pad = (s, w) => (s + ' '.repeat(w)).slice(0, Math.max(w, s.length));
function playerLine(j) {
  const head = j.poste ? '"poste": ' + pad(JSON.stringify(j.poste) + ',', 6) + ' ' : '';
  const notes = KEYS.map(k => JSON.stringify(k) + ': ' + String(j.notes[k]).padStart(2)).join(', ');
  return '{ ' + head + '"numero": ' + String(j.numero).padStart(2) + ', "nom": ' + pad(JSON.stringify(j.nom) + ',', 18) + ' "poste_naturel": ' + pad(JSON.stringify(j.poste_naturel) + ',', 5) +
    ' "source": ' + pad(JSON.stringify(j.source) + ',', 15) + ' "notes": { ' + notes + ' } }';
}
function teamText(T) {
  return '    {\n      "id": ' + JSON.stringify(T.id) + ',\n      "nom": ' + JSON.stringify(T.nom) + ',\n      "description": ' + JSON.stringify(T.description) +
    ',\n      "championnat": ' + JSON.stringify(T.championnat) + ',\n      "classement": ' + T.classement + ',\n      "court": ' + JSON.stringify(T.court) + ',\n      "formation": ' + JSON.stringify(T.formation) +
    ',\n      "consignes": ' + JSON.stringify(T.consignes).replace(/,/g, ', ').replace(/:/g, ': ') +
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
  if (process.argv[2] === 'reecrire') {
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
