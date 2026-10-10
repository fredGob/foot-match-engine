// Fabrique la base de joueurs à acheter (joueurs.json), pour la page de construction d'équipe (equipe.html).
// Usage : node tools/joueurs.js            → écrit joueurs.json et affiche les prix et le budget
//         node tools/joueurs.js 7          → même chose avec une autre graine (d'autres joueurs)
//         node tools/joueurs.js calcul     → n'écrit rien : relit joueurs.json (même modifié à la main) et refait le calcul du budget
// Même graine : exactement les mêmes joueurs.
//
// Comment un joueur est fabriqué :
// 1. Son poste naturel : G, AG, DC, AD, MG, MC, MD, AT (DC, MC et AT valent pour les deux côtés de l'axe).
// 2. Son niveau : la valeur de ses points forts, de 6 à 19. Peu de vedettes, beaucoup de joueurs moyens (courbe en cloche autour de 12,5).
//    Chaque poste reçoit toute la gamme des niveaux, du plus faible au plus fort.
// 3. Ses notes : le profil de son poste, pris sur l'équipe Élite de equipes.json (écart de chaque note à 17), ajouté à son niveau,
//    plus un petit hasard (un point en plus ou en moins), un point fort personnel (+2) et un point faible personnel (−2).
//    Un joueur de champ a 5 en réflexes et en jeu de mains, comme dans equipes.json.
// La note globale et le prix ne sont pas écrits dans joueurs.json : la page les calcule (même formule qu'ici, voir NOTE et PRIX).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const arg = require.main === module ? process.argv[2] : null;

// ---------- formules partagées avec la page (gardées identiques dans construction.html) ----------
// Notes clés de chaque poste : elles comptent trois fois dans la note globale. Les autres notes comptent une fois,
// sauf réflexes et jeu de mains pour un joueur de champ (zéro) et les notes d'attaque pour un gardien (zéro).
const CLES = {
  G:  ['reflexes', 'mains', 'placement', 'anticipation', 'sang_froid'],
  AG: ['vitesse', 'acceleration', 'endurance', 'tacle', 'placement', 'volume_de_course'],
  AD: ['vitesse', 'acceleration', 'endurance', 'tacle', 'placement', 'volume_de_course'],
  DC: ['tacle', 'placement', 'anticipation', 'jeu_de_tete', 'sang_froid'],
  MG: ['vitesse', 'acceleration', 'dribble', 'passe', 'appels', 'volume_de_course'],
  MD: ['vitesse', 'acceleration', 'dribble', 'passe', 'appels', 'volume_de_course'],
  MC: ['passe', 'vision', 'lucidite', 'prise_de_balle', 'endurance', 'anticipation'],
  AT: ['finition', 'appels', 'sang_froid', 'prise_de_balle', 'vitesse', 'anticipation'],
};
const INUTILES_G = ['dribble', 'finition', 'appels', 'gout_du_risque', 'tacle'];
function noteGlobale(j) {
  let s = 0, w = 0;
  for (const [k, v] of Object.entries(j.notes)) {
    let p = CLES[j.poste].includes(k) ? 3 : 1;
    if (j.poste !== 'G' && (k === 'reflexes' || k === 'mains')) p = 0;
    if (j.poste === 'G' && INUTILES_G.includes(k)) p = 0;
    s += p * v; w += p;
  }
  return Math.round(10 * s / w) / 10;
}
// Prix en millions d'euros : 0,4 M€ à 8 de note globale, et 40 % de plus par point (convexe : une vedette coûte très cher).
// 10 → 0,8 M€ · 12 → 1,5 · 14 → 3,0 · 16 → 5,9 · 18 → 11,6
function prix(note) { return Math.max(0.2, Math.round(10 * 0.4 * Math.pow(1.4, note - 8)) / 10); }

// ---------- fabrication ----------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const equipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'equipes.json'), 'utf8')).equipes;
const NOMS_NOTES = Object.keys(equipes[0].joueurs[0].notes);

function fabrique(seed) {
  const rng = makeRng(seed), gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rng(); return (s - 3) / Math.sqrt(0.5); };
  const pick = a => a[Math.floor(rng() * a.length)];
  // profils de poste : écart de chaque note au niveau (17) dans l'équipe Élite
  const elite = equipes.find(T => T.id === 'elite');
  const profil = code => { const j = elite.joueurs.find(x => x.poste === code); const o = {}; for (const k of NOMS_NOTES) o[k] = j.notes[k] - 17; return o; };
  const PROFILS = { G: [profil('G')], AG: [profil('AG')], AD: [profil('AD')], DC: [profil('DCG'), profil('DCD')], MG: [profil('MG')], MD: [profil('MD')],
    MC: [profil('MCG'), profil('MCD')], AT: [profil('ATG'), profil('ATD')] };      // MC : récupérateur ou organisateur ; AT : mobile ou avant-centre
  const COMBIEN = { G: 12, AG: 11, DC: 22, AD: 11, MG: 12, MC: 24, MD: 12, AT: 16 };      // 120 joueurs
  const PRENOMS = ['Lucas', 'Hugo', 'Théo', 'Nathan', 'Louis', 'Jules', 'Arthur', 'Raphaël', 'Mathis', 'Enzo', 'Tom', 'Noah', 'Gabriel', 'Léo', 'Maxime', 'Clément', 'Antoine', 'Paul',
    'Baptiste', 'Romain', 'Quentin', 'Julien', 'Bastien', 'Valentin', 'Adrien', 'Florian', 'Kévin', 'Yanis', 'Samuel', 'Alexis', 'Thibault', 'Corentin', 'Mathéo', 'Sacha', 'Victor',
    'Robin', 'Martin', 'Loïc', 'Damien', 'Jérémy', 'Benjamin', 'Malo', 'Gaël', 'Erwan', 'Rémi', 'Simon', 'Lilian', 'Axel', 'Noé', 'Marius'];
  const NOMS = ['Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Lefèvre', 'Mercier', 'Dupont', 'Bertrand', 'Morin', 'Girard', 'André', 'Lefebvre', 'Mathieu', 'Clément',
    'Gauthier', 'Dumont', 'Lopez', 'Moulin', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garcia', 'Roux', 'Fournier', 'Caron', 'Gilbert', 'Lemaire', 'Duval', 'Joly', 'Gautier',
    'Roger', 'Roche', 'Roy', 'Noël', 'Meyer', 'Lucas', 'Jean', 'Perez', 'Marie', 'Dufour', 'Blanc', 'Guillaume', 'Rolland', 'Vasseur', 'Brunet', 'Schmitt', 'Leroy', 'Bouvier',
    'Paris', 'Renaud', 'Hamel', 'Perret', 'Tessier', 'Pons', 'Ollivier', 'Delmas', 'Cordier', 'Pichon', 'Marchal', 'Laurent', 'Hoarau', 'Baron', 'Tanguy', 'Lebrun', 'Bouchet',
    'Rivière', 'Laine', 'Germain', 'Prévost', 'Jacquet', 'Collin', 'Klein', 'Daniel', 'Lebon', 'Leblanc', 'Marty', 'Benard', 'Langlois', 'Hervé', 'Antoine', 'Poulain',
    'Charrier', 'Gros', 'Lesage', 'Labbé', 'Bailleul', 'Maillard', 'Chauvin', 'Lecomte', 'Barre', 'Delattre', 'Ferrand', 'Grégoire', 'Thomas', 'Weber', 'Millet', 'Costa', 'Andrieu'];
  const vus = new Set(), joueurs = [];
  for (const [code, n] of Object.entries(COMBIEN)) {
    // toute la gamme pour chaque poste : quantiles d'une courbe en cloche (moyenne 12,5, écart 2,6), bornés de 6 à 19, avec un peu de hasard
    const niveaux = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.2 + 0.6 * rng()) / n;
      let z = 0; { let lo = -4, hi = 4; for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2, cdf = 0.5 * (1 + erf(mid / Math.SQRT2)); if (cdf < u) lo = mid; else hi = mid; } z = lo; }
      niveaux.push(Math.min(19, Math.max(6, 12.5 + 2.6 * z)));
    }
    for (const L of niveaux) {
      const pr = pick(PROFILS[code]);
      const fort = pick(NOMS_NOTES.filter(k => k !== 'reflexes' && k !== 'mains')), faible = pick(NOMS_NOTES.filter(k => k !== 'reflexes' && k !== 'mains' && k !== fort));
      const notes = {};
      for (const k of NOMS_NOTES) {
        if (code !== 'G' && (k === 'reflexes' || k === 'mains')) { notes[k] = 5; continue; }
        let v = L + pr[k] + Math.round(gauss() * 0.7) + (k === fort ? 2 : 0) - (k === faible ? 2 : 0);
        notes[k] = Math.min(20, Math.max(1, Math.round(v)));
      }
      let nom; do nom = pick(PRENOMS) + ' ' + pick(NOMS); while (vus.has(nom)); vus.add(nom);
      joueurs.push({ poste: code, nom, age: 18 + Math.floor(rng() * 17), notes });
    }
  }
  // ordre du fichier : par poste, puis par niveau décroissant ; un numéro d'identité stable
  const ordre = Object.keys(COMBIEN);
  joueurs.sort((a, b) => ordre.indexOf(a.poste) - ordre.indexOf(b.poste) || noteGlobale(b) - noteGlobale(a));
  joueurs.forEach((j, i) => { j.id = 'j' + String(i + 1).padStart(3, '0'); });
  return joueurs;
}
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

// ---------- budget ----------
// Repère : la note globale (même formule) des onze joueurs de chaque équipe de equipes.json.
// Le budget permet un effectif de 16 dont les onze titulaires sont entre Moyen et Élevé : on prend, dans la base, pour chaque titulaire
// d'un 4-4-2 le joueur du bon poste le plus proche de cette cible, plus cinq remplaçants au niveau Moyen ; on arrondit au million.
function budget(joueurs, afficher) {
  const POSTE_GEN = { G: 'G', AG: 'AG', DCG: 'DC', DCD: 'DC', AD: 'AD', MG: 'MG', MCG: 'MC', MCD: 'MC', MD: 'MD', ATG: 'AT', ATD: 'AT' };
  const moy = {};
  for (const T of equipes) moy[T.id] = T.joueurs.reduce((s, j) => s + noteGlobale({ poste: POSTE_GEN[j.poste], notes: j.notes }), 0) / 11;
  const cible = (moy.moyen + moy.eleve) / 2;
  const prend = (postes, c, pris) => postes.map(p => {
    const j = joueurs.filter(x => x.poste === p && !pris.has(x.id)).sort((a, b) => Math.abs(noteGlobale(a) - c) - Math.abs(noteGlobale(b) - c))[0];
    pris.add(j.id); return j;
  });
  const pris = new Set();
  const titulaires = prend(['G', 'AG', 'DC', 'DC', 'AD', 'MG', 'MC', 'MC', 'MD', 'AT', 'AT'], cible, pris);
  const remplacants = prend(['G', 'DC', 'MC', 'AT', 'AG'], moy.moyen, pris);
  const cout = l => l.reduce((s, j) => s + prix(noteGlobale(j)), 0);
  const total = cout(titulaires) + cout(remplacants), B = Math.round(total);
  if (afficher) {
    const f = x => x.toFixed(1).replace('.', ',');
    console.log('Note globale moyenne des titulaires de equipes.json : ' + equipes.map(T => T.nom + ' ' + f(moy[T.id])).join(', '));
    console.log('Cible (entre Moyen et Élevé) : ' + f(cible));
    console.log('Effectif repère : 11 titulaires à ' + f(titulaires.reduce((s, j) => s + noteGlobale(j), 0) / 11) + ' de moyenne (' + f(cout(titulaires)) + ' M€) + 5 remplaçants au niveau Moyen (' + f(cout(remplacants)) + ' M€) = ' + f(total) + ' M€');
    console.log('Budget : ' + B + ' M€');
    for (const T of equipes) {
      const tit = prend(['G', 'AG', 'DC', 'DC', 'AD', 'MG', 'MC', 'MC', 'MD', 'AT', 'AT'], moy[T.id], new Set());
      console.log('  Onze titulaires au niveau ' + T.nom + ' : ' + f(cout(tit)) + ' M€');
    }
    const tri = joueurs.map(j => ({ j, n: noteGlobale(j), p: prix(noteGlobale(j)) })).sort((a, b) => a.p - b.p);
    console.log('Moins cher : ' + tri[0].j.nom + ' (' + tri[0].j.poste + ', ' + f(tri[0].n) + ') ' + f(tri[0].p) + ' M€ ; plus cher : ' + tri[tri.length - 1].j.nom + ' (' + tri[tri.length - 1].j.poste + ', ' + f(tri[tri.length - 1].n) + ') ' + f(tri[tri.length - 1].p) + ' M€');
    const top16 = tri.slice(-16).reduce((s, x) => s + x.p, 0), bas16 = tri.slice(0, 16).reduce((s, x) => s + x.p, 0);
    console.log('Les 16 plus chers : ' + f(top16) + ' M€ ; les 16 moins chers : ' + f(bas16) + ' M€');
    const hist = {}; for (const x of tri) { const b = Math.floor(x.n); hist[b] = (hist[b] || 0) + 1; }
    console.log('Joueurs par note globale : ' + Object.keys(hist).sort((a, b) => a - b).map(k => k + ' : ' + hist[k]).join(' · '));
  }
  return B;
}

if (require.main !== module) { /* utilisé par build.js : seulement les formules */ }
else if (arg === 'calcul') {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'joueurs.json'), 'utf8'));
  const B = budget(base.joueurs, true);
  if (B !== base.budget) console.log('Attention : joueurs.json indique un budget de ' + base.budget + ' M€ (le calcul donne ' + B + ' M€). Le corriger à la main si besoin.');
} else {
  const seed = arg ? +arg : 2026;
  const joueurs = fabrique(seed), B = budget(joueurs, true);
  const ligne = j => '    { "id": "' + j.id + '", "poste": ' + JSON.stringify(j.poste).padEnd(4) + ', "nom": ' + JSON.stringify(j.nom).padEnd(22) + ', "age": ' + String(j.age).padStart(2) +
    ', "notes": { ' + NOMS_NOTES.map(k => '"' + k + '": ' + String(j.notes[k]).padStart(2)).join(', ') + ' } }';
  const txt = '{\n  "aide": [\n' + [
    'Base de joueurs à acheter dans la page de construction d\'équipe (equipe.html). Fabriquée par « node tools/joueurs.js » (graine ' + seed + '), puis modifiable à la main : une ligne par joueur.',
    'Postes naturels : G = gardien, AG = arrière gauche, DC = défenseur central, AD = arrière droit, MG = milieu gauche, MC = milieu axial, MD = milieu droit, AT = attaquant.',
    'Notes de 1 à 20, les mêmes que dans equipes.json. La note globale et le prix ne sont pas écrits ici : la page les calcule à partir des notes.',
    'Budget en millions d\'euros. Après une modification : « node tools/joueurs.js calcul » refait le calcul du budget, « node build.js » refait equipe.html.',
  ].map(s => '    ' + JSON.stringify(s)).join(',\n') + '\n  ],\n  "graine": ' + seed + ',\n  "budget": ' + B + ',\n  "joueurs": [\n' + joueurs.map(ligne).join(',\n') + '\n  ]\n}\n';
  fs.writeFileSync(path.join(ROOT, 'joueurs.json'), txt);
  console.log('joueurs.json écrit : ' + joueurs.length + ' joueurs, budget ' + B + ' M€');
}
module.exports = { noteGlobale, prix, CLES };
