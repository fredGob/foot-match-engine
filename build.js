// Assemble page-match.html, engine.js, render.js, stats.js et les équipes de equipes.json en un seul fichier autonome : match.html.
// Fait aussi la page de construction d'équipe : construction.html, joueurs.json et les clubs de equipes.json → equipe.html (voir en bas).
// Usage : node build.js
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
let html = read('page-match.html');
for (const f of ['engine.js', 'render.js', 'stats.js']) {
  const tag = '<script src="' + f + '"></script>';
  if (!html.includes(tag)) throw new Error('balise introuvable : ' + tag);
  html = html.replace(tag, () => '<script>\n' + read(f).replace(/<\/script/g, '<\\/script') + '</script>');
}
// les équipes du fichier equipes.json sont recopiées dans la page (un fichier ouvert par double-clic ne peut pas lire un autre fichier)
const teams = JSON.parse(read('equipes.json')), E = require('./engine.js');
for (const T of teams.equipes) E.readTeam(T);                // fichier mal rempli : on s'arrête avec un message clair
if (!html.includes('/*EQUIPES*/null')) throw new Error('emplacement des équipes introuvable dans page-match.html');
html = html.replace('/*EQUIPES*/null', () => JSON.stringify({ equipes: teams.equipes }).replace(/<\/script/g, '<\\/script'));
fs.writeFileSync(path.join(__dirname, 'match.html'), html);
console.log('match.html écrit (' + Math.round(html.length / 1024) + ' ko, ' + teams.equipes.length + ' équipes : ' + teams.equipes.map(T => T.nom).join(', ') + ')');

// ---------- deuxième page : la construction d'équipe (construction.html + joueurs.json → equipe.html) ----------
// Elle n'embarque pas le moteur : seulement les données dont elle a besoin, lues ici dans engine.js (formations, tactiques prédéfinies,
// consignes, noms des notes) et dans joueurs.json (note globale et prix calculés par les formules de tools/joueurs.js).
{
  // places de chaque formation (rang i de l'effectif du 4-4-2, code de poste dans equipes.json, dessin) : données par le moteur
  const formations = E.FORMATIONS.map(f => ({ id: f.id, name: f.name, places: E.formationPlaces(f.id) }));
  const base = JSON.parse(read('joueurs.json')), J = require('./tools/joueurs.js'), noms = E.QUALITIES.map(q => q[1]), vus = new Set();
  for (const j of base.joueurs) {      // fichier mal rempli : on s'arrête avec un message clair
    const who = 'joueurs.json, ' + (j.nom || j.id || '?');
    if (!J.CLES[j.poste]) throw new Error(who + ' : poste inconnu « ' + j.poste + ' » (postes : ' + Object.keys(J.CLES).join(', ') + ')');
    if (!j.id || vus.has(j.id)) throw new Error(who + ' : identifiant manquant ou en double « ' + j.id + ' »'); vus.add(j.id);
    for (const k of noms) if (typeof (j.notes || {})[k] !== 'number' || !(j.notes[k] >= 1 && j.notes[k] <= 20)) throw new Error(who + ' : la note « ' + k + ' » doit être un nombre de 1 à 20');
    for (const k in j.notes) if (!noms.includes(k)) throw new Error(who + ' : note inconnue « ' + k + ' »');
    j.note = J.noteGlobale(j); j.prix = J.prix(j.note);
  }
  // les clubs de equipes.json (champ « championnat ») : leurs seize joueurs, pour le choix « Prendre une équipe de Ligue 1 ».
  // Poste naturel : « poste_naturel » du fichier, sinon déduit de la place du 4-4-2 (DCG → DC…) ; note globale et prix : mêmes formules que la base.
  const NAT = { G: 'G', AG: 'AG', DCG: 'DC', DCD: 'DC', AD: 'AD', MG: 'MG', MCG: 'MC', MCD: 'MC', MD: 'MD', ATG: 'AT', ATD: 'AT' };
  const clubs = teams.equipes.filter(T => T.championnat).map(T => {
    const one = (j, k) => { const o = { id: T.id + '-' + k, nom: j.nom, poste: j.poste_naturel || NAT[j.poste], notes: j.notes, fc: j.fc, source: j.source };
      if (!J.CLES[o.poste]) throw new Error('equipes.json, ' + T.nom + ', ' + j.nom + ' : poste naturel inconnu « ' + o.poste + ' »');
      o.note = J.noteGlobale(o); o.prix = J.prix(o.note); return o; };
    return { id: T.id, nom: T.nom, championnat: T.championnat, classement: T.classement, description: T.description,
      titulaires: T.joueurs.map((j, k) => Object.assign(one(j, k), { place: j.poste })), remplacants: (T.remplacants || []).map((j, k) => one(j, 11 + k)) };
  });
  // adversaires possibles pour « Passer au match » : l'équipe standard, puis toutes les équipes de equipes.json (niveaux, puis clubs)
  const adversaires = [{ id: '', nom: 'Standard (tous à 14)', groupe: 'Niveaux' }].concat(teams.equipes.map(T => ({ id: T.id, nom: T.nom, groupe: T.championnat || 'Niveaux' })));
  const data = { budget: base.budget, joueurs: base.joueurs, clubs, adversaires, cles: J.CLES, formations, presets: E.PRESETS,
    tactics: E.TACTICS.map(c => ({ key: c.key, label: c.label, options: c.options, help: c.help })), qualities: E.QUALITIES.map(q => [q[1], q[2]]) };
  let page = read('construction.html');
  if (!page.includes('/*DONNEES*/null')) throw new Error('emplacement des données introuvable dans construction.html');
  page = page.replace('/*DONNEES*/null', () => JSON.stringify(data).replace(/<\/script/g, '<\\/script'));
  fs.writeFileSync(path.join(__dirname, 'equipe.html'), page);
  console.log('equipe.html écrit (' + Math.round(page.length / 1024) + ' ko, ' + base.joueurs.length + ' joueurs, budget ' + base.budget + ' M€, ' + clubs.length + ' clubs)');
}
