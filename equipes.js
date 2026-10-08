// Donne aux outils en ligne de commande les équipes du fichier equipes.json.
// Dans une commande, un camp s'écrit « equipe=elite,press=1,line=-1 » : l'équipe, puis ses consignes. Sans « equipe= » : équipe standard (tous à 14).
const E = require('./engine.js'), data = require('./equipes.json');
const list = data.equipes;
for (const T of list) E.readTeam(T);                        // fichier mal rempli : on le dit tout de suite
function get(id) {
  const T = list.find(x => x.id === id);
  if (!T) { console.error('équipe inconnue : ' + id + ' (équipes : ' + list.map(x => x.id).join(', ') + ')'); process.exit(1); }
  return T;
}
// « equipe=elite,press=1 » → { team: l'équipe (ou null), tactics: { press: 1 } }
function side(str) {
  const out = { team: null, tactics: {} };
  for (const kv of (str || '').split(',')) {
    const [k, v] = kv.split('='); if (!k) continue;
    if (k === 'equipe') out.team = get(v);
    else if (E.TACTICS.some(c => c.key === k)) out.tactics[k] = +v;
    else { console.error('réglage inconnu : ' + k + ' (réglages : equipe, ' + E.TACTICS.map(c => c.key).join(', ') + ')'); process.exit(1); }
  }
  return out;
}
// texte court pour les titres : « Élite, pressing : harceler »
function name(s) {
  const tac = E.TACTICS.filter(c => s.tactics[c.key]).map(c => c.label.toLowerCase() + ' : ' + c.options[s.tactics[c.key] + 1].toLowerCase());
  return [s.team ? s.team.nom : 'standard'].concat(tac.length ? tac : ['consignes neutres']).join(', ');
}
module.exports = { list, get, side, name };
