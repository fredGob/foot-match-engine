// Assemble index.html, engine.js, render.js, stats.js et les équipes de equipes.json en un seul fichier autonome : match.html
// Usage : node build.js
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
let html = read('index.html');
for (const f of ['engine.js', 'render.js', 'stats.js']) {
  const tag = '<script src="' + f + '"></script>';
  if (!html.includes(tag)) throw new Error('balise introuvable : ' + tag);
  html = html.replace(tag, () => '<script>\n' + read(f).replace(/<\/script/g, '<\\/script') + '</script>');
}
// les équipes du fichier equipes.json sont recopiées dans la page (un fichier ouvert par double-clic ne peut pas lire un autre fichier)
const teams = JSON.parse(read('equipes.json')), E = require('./engine.js');
for (const T of teams.equipes) E.readTeam(T);                // fichier mal rempli : on s'arrête avec un message clair
if (!html.includes('/*EQUIPES*/null')) throw new Error('emplacement des équipes introuvable dans index.html');
html = html.replace('/*EQUIPES*/null', () => JSON.stringify({ equipes: teams.equipes }).replace(/<\/script/g, '<\\/script'));
fs.writeFileSync(path.join(__dirname, 'match.html'), html);
console.log('match.html écrit (' + Math.round(html.length / 1024) + ' ko, ' + teams.equipes.length + ' équipes : ' + teams.equipes.map(T => T.nom).join(', ') + ')');
