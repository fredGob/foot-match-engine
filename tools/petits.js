// Fabrique coupe.json : les 20 clubs inventés de la Coupe en carton (Ligue 2, National, N2-N3, régional) ; à chaque coupe, 14 sont tirés au sort
// pour compléter les 18 clubs de Ligue 1. (n° 111 : AJ Chablis et Le Mans 24 Heures retirés, Auxerre et Le Mans étant en Ligue 1.)
// Usage : node tools/petits.js            → n'écrit rien, affiche les clubs et leur moyenne
//         node tools/petits.js reecrire   → réécrit coupe.json (efface les retouches faites à la main)
// Même graine : exactement les mêmes joueurs.
//
// Comment un club est fabriqué : on part de l'équipe Faible de equipes.json (onze titulaires et cinq remplaçants, mêmes profils de poste),
// on décale toutes les notes selon la division (régional −0,4 point, N2-N3 0, National +0,4, Ligue 2 +0,8, en moyenne),
// puis chaque note varie d'un point en plus ou en moins au hasard. Les noms des joueurs sont tirés au hasard.
// Réflexes et jeu de mains restent à 5 pour un joueur de champ.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), FILE = path.join(ROOT, 'coupe.json');

const DIVISIONS = { L2: { nom: 'Ligue 2', decalage: 0.8 }, NAT: { nom: 'National', decalage: 0.4 }, N2: { nom: 'National 2', decalage: 0 }, REG: { nom: 'Régional', decalage: -0.4 } };
// [identifiant, nom, code court, division, formation, consignes (−1, 0, 1 ; ce qui n'est pas écrit vaut 0)]
const CLUBS = [
  ['saint-eteinte', 'AS Saint-Éteinte', 'ASE', 'L2', '433', { tempo: 1, press: 1 }],
  ['nantes', 'FC Nantes-Berlingot', 'FCN', 'L2', '4231', { passing: -1 }],
  ['bordeaux', 'Girondins Canelé', 'GIR', 'L2', '442', { width: 1 }],
  ['reims', 'Stade de Reims-Bulles', 'SDR', 'L2', '433', { passing: -1, line: 1 }],
  ['caen', 'SM Calvados', 'SMC', 'L2', '4231', { passing: 1, press: 1 }],
  ['red-star', 'Red Star Puces', 'RSP', 'NAT', '433', { width: 1, tempo: 1 }],
  ['nancy', 'AS Nancy-Bergamote', 'ASN', 'NAT', '4231', {}],
  ['dijon', 'Dijon Moutarde FC', 'DMF', 'NAT', '442', { press: 1 }],
  ['concarneau', 'US Concarneau-Crêpe', 'USC', 'NAT', '532', { line: -1, passing: 1 }],
  ['rouen', 'FC Rouen-Camembert', 'FRC', 'NAT', '442', { width: 1 }],
  ['trifouilly', 'AS Trifouilly-les-Oies', 'ATO', 'N2', '442', { passing: 1 }],
  ['petaouchnok', 'FC Pétaouchnok', 'PET', 'N2', '532', { line: -1, press: -1 }],
  ['perpete', 'Olympique Perpète-les-Bains', 'OPB', 'N2', '442', { tempo: 1 }],
  ['saint-glinglin', 'JS Saint-Glinglin', 'JSG', 'N2', '4231', { passing: 1, width: 1 }],
  ['chauvigny', 'US Chauvigny-les-Mollets', 'UCM', 'N2', '442', { press: 1 }],
  ['boulangers', 'Entente des Boulangers de Croissy', 'EBC', 'REG', '442', { passing: 1, line: -1 }],
  ['moustiques', 'Les Moustiques de Camargue', 'MOU', 'REG', '532', { line: -1, press: -1, cross: -1 }],
  ['tracteurs', 'FC Tracteur de Bouzonville', 'TRA', 'REG', '442', { passing: 1, tempo: 1 }],
  ['bar-tabac', 'Amicale du Bar-Tabac', 'ABT', 'REG', '442', { passing: 1 }],
  ['pompiers', 'Union Sportive des Pompiers', 'USP', 'REG', '442', { press: 1, passing: 1 }],
];
const PRENOMS = ['Lucas', 'Hugo', 'Théo', 'Nathan', 'Louis', 'Jules', 'Arthur', 'Mathis', 'Enzo', 'Tom', 'Noah', 'Léo', 'Maxime', 'Clément', 'Paul', 'Baptiste', 'Romain', 'Quentin',
  'Julien', 'Bastien', 'Valentin', 'Adrien', 'Florian', 'Kévin', 'Yanis', 'Samuel', 'Alexis', 'Thibault', 'Corentin', 'Sacha', 'Robin', 'Loïc', 'Damien', 'Jérémy', 'Malo', 'Gaël',
  'Erwan', 'Rémi', 'Simon', 'Axel', 'Marius', 'Dylan', 'Mehdi', 'Karim', 'Moussa', 'Ibrahima', 'Bryan', 'Steven', 'Jordan', 'Anthony', 'Cédric', 'Fabien', 'Sébastien', 'Ludovic'];
const NOMS = ['Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Lefèvre', 'Mercier', 'Bertrand', 'Morin', 'Girard', 'Mathieu', 'Gauthier', 'Dumont', 'Lopez', 'Moulin',
  'Bonnet', 'Legrand', 'Garcia', 'Roux', 'Fournier', 'Caron', 'Gilbert', 'Lemaire', 'Duval', 'Joly', 'Roche', 'Meyer', 'Perez', 'Dufour', 'Blanc', 'Rolland', 'Vasseur', 'Brunet',
  'Schmitt', 'Bouvier', 'Renaud', 'Hamel', 'Perret', 'Tessier', 'Pons', 'Delmas', 'Cordier', 'Pichon', 'Marchal', 'Hoarau', 'Baron', 'Tanguy', 'Lebrun', 'Bouchet', 'Rivière',
  'Germain', 'Prévost', 'Jacquet', 'Collin', 'Klein', 'Leblanc', 'Marty', 'Langlois', 'Hervé', 'Poulain', 'Gros', 'Lesage', 'Maillard', 'Chauvin', 'Lecomte', 'Barre', 'Ferrand',
  'Grégoire', 'Weber', 'Millet', 'Costa', 'Andrieu', 'Diallo', 'Traoré', 'Camara', 'Benali', 'Mendy', 'Petitjean', 'Courtois', 'Le Gall', 'Le Goff', 'Kerboul', 'Nicolas', 'Picard'];

function makeRng(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function fabrique(seed) {
  const rng = makeRng(seed), pick = a => a[Math.floor(rng() * a.length)];
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'equipes.json'), 'utf8')).equipes.find(T => T.id === 'faible');
  const vus = new Set();
  const nom = () => { let n; do n = pick(PRENOMS).charAt(0) + '. ' + pick(NOMS); while (vus.has(n)); vus.add(n); return n; };
  const joueur = (j, dec, champ) => {
    const notes = {};
    for (const [k, v] of Object.entries(j.notes)) {
      if (champ && (k === 'reflexes' || k === 'mains')) { notes[k] = v; continue; }
      const d = Math.floor(dec) + (rng() < dec - Math.floor(dec) ? 1 : 0) + (rng() < 1 / 3 ? -1 : rng() < 0.5 ? 1 : 0);
      notes[k] = Math.max(1, Math.min(100, v + 5 * d));      // décalage compté en points sur 20, notes écrites sur 100
    }
    return notes;
  };
  return CLUBS.map(([id, n, court, div, formation, cons]) => {
    const D = DIVISIONS[div];
    return {
      id, nom: n, court, division: D.nom, formation, consignes: Object.assign({ passing: 0, tempo: 0, width: 0, line: 0, press: 0, cross: 0 }, cons),
      joueurs: base.joueurs.map(j => ({ poste: j.poste, numero: j.numero, nom: nom(), notes: joueur(j, D.decalage, j.poste !== 'G') })),
      remplacants: base.remplacants.map(j => ({ numero: j.numero, nom: nom(), poste_naturel: j.poste_naturel, notes: joueur(j, D.decalage, j.poste_naturel !== 'G') })),
    };
  });
}

// ---------- écriture : une ligne par joueur, comme equipes.json ----------
const line = j => '{ ' + (j.poste ? '"poste": ' + (JSON.stringify(j.poste) + ',').padEnd(6) + ' ' : '') + '"numero": ' + String(j.numero).padStart(2) + ', "nom": ' + (JSON.stringify(j.nom) + ',').padEnd(16) +
  (j.poste_naturel ? ' "poste_naturel": ' + JSON.stringify(j.poste_naturel) + ',' : '') + ' "notes": { ' + Object.entries(j.notes).map(([k, v]) => JSON.stringify(k) + ': ' + String(v).padStart(3)).join(', ') + ' } }';
function texte(clubs) {
  const aide = [
    "Clubs inventés de la Coupe en carton : à chaque coupe, 14 d'entre eux sont tirés au sort pour compléter les 18 clubs de Ligue 1 de equipes.json (32 équipes). Fabriqués par « node tools/petits.js reecrire », puis modifiables à la main.",
    "Mêmes postes et mêmes notes que equipes.json (de 1 à 100). « division » ne sert qu'à l'affichage ; « formation » et « consignes » : le système et le style de l'entraîneur.",
    "Après une modification : node build.js pour que coupe.html et match.html prennent les nouvelles notes.",
  ];
  return '{\n  "aide": ' + JSON.stringify(aide, null, 4).replace(/\n/g, '\n  ') + ',\n  "equipes": [\n' + clubs.map(T => '    {\n      "id": ' + JSON.stringify(T.id) + ', "nom": ' + JSON.stringify(T.nom) + ', "court": ' + JSON.stringify(T.court) +
    ', "division": ' + JSON.stringify(T.division) + ', "formation": ' + JSON.stringify(T.formation) + ',\n      "consignes": ' + JSON.stringify(T.consignes).replace(/,/g, ', ').replace(/:/g, ': ') +
    ',\n      "joueurs": [\n' + T.joueurs.map(j => '        ' + line(j)).join(',\n') + '\n      ],\n      "remplacants": [\n' + T.remplacants.map(j => '        ' + line(j)).join(',\n') + '\n      ]\n    }').join(',\n') + '\n  ]\n}\n';
}

if (require.main === module) {
  const clubs = fabrique(2027);
  const avg = T => { let s = 0, n = 0; for (const j of T.joueurs) for (const v of Object.values(j.notes)) { s += v; n++; } return s / n; };
  for (const T of clubs) console.log((T.division + '          ').slice(0, 12) + (T.nom + ' '.repeat(36)).slice(0, 36) + avg(T).toFixed(2));
  if (process.argv[2] === 'reecrire') { const t = texte(clubs); JSON.parse(t); fs.writeFileSync(FILE, t); console.log('coupe.json écrit : ' + clubs.length + ' clubs.'); }
}
module.exports = { fabrique, CLUBS, DIVISIONS };
