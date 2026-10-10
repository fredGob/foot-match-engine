// Fait tourner la vraie page match.html dans un faux navigateur et vérifie que l'interface fonctionne :
// lecture, clic sur un joueur, barre de temps (avant, arrière), consignes, série de matchs, durée.
const fs = require('fs'), { JSDOM } = require('jsdom'), { createCanvas } = require('@napi-rs/canvas');
const html = fs.readFileSync(__dirname + '/../match.html', 'utf8');
const errors = [], fails = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
  const real = createCanvas(1140, 750);
  w.HTMLCanvasElement.prototype.getContext = function () { return real.getContext('2d'); };
  w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 1140, height: 750 }; };
  w.scrollTo = () => {};
  w.addEventListener('error', e => errors.push(e.message));
  w.__canvas = real;
} });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const goTo = async t => { $('time').value = String(t); $('time').dispatchEvent(new w.Event('input')); $('time').dispatchEvent(new w.Event('change')); await wait(350); };
const stat = label => { const r = [...$('stats').querySelectorAll('tr')].find(x => x.children[1] && x.children[1].textContent === label); return r ? [r.children[0].textContent, r.children[2].textContent] : null; };
const pick = async (team, key, v) => { const s = d.querySelector(`#tactics select[data-team="${team}"][data-key="${key}"]`); s.value = String(v); s.dispatchEvent(new w.Event('change')); await wait(500); };

(async () => {
  console.log('Avant-match');
  await wait(300);
  check($('duration').value === '5400' && /^00:00 \/ 90:00/.test($('clock').textContent) && !$('pre').hidden && $('play').textContent === 'Lancer le match', 'à l\'ouverture : match de 90 minutes, à l\'arrêt, bouton « Lancer le match »', $('clock').textContent);
  await pick(0, 'width', 1); await wait(600);
  check(/^00:00/.test($('clock').textContent) && d.querySelector('#tactics select[data-team="0"][data-key="width"]').value === '1', 'régler une consigne avant le coup d\'envoi ne lance pas le match');
  await pick(0, 'width', 0);
  $('duration').value = '600'; $('duration').dispatchEvent(new w.Event('change')); await wait(200);
  $('seed').value = '7'; $('load').click(); await wait(300);
  check(/^00:00 \/ 10:00/.test($('clock').textContent) && !$('pre').hidden, 'durée de 10 minutes pour les essais, toujours à l\'arrêt', $('clock').textContent);

  console.log('Équipes');
  check(!d.querySelector('#squads select') && /Standard[\s\S]*Standard/.test($('squads').textContent) && $('teamLink').getAttribute('href') === 'equipe.html', 'sans équipe reçue (« Match rapide ») : standard contre standard, aucun choix d\'équipe dans la page, lien vers la page équipe', $('squads').textContent.replace(/\s+/g, ' '));
  // la page équipe envoie votre équipe dans l'adresse : « match.html#partie=… » (équipe au format de equipes.json, formation, consignes, adversaire)
  {
    const EQ = require('../equipes.json'), elite = Object.assign({}, EQ.equipes.find(T => T.id === 'elite'), { formation: '433', consignes: { press: 1, line: 1 } });
    const url = 'file://' + require('path').join(__dirname, '..', 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: elite, adversaire: 'faible' }));
    const errs2 = [];
    const dom2 = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
      const real = createCanvas(1140, 750);
      w.HTMLCanvasElement.prototype.getContext = function () { return real.getContext('2d'); };
      w.HTMLCanvasElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 1140, height: 750 }; };
      w.scrollTo = () => {}; w.addEventListener('error', e => errs2.push(e.message));
    } });
    const w2 = dom2.window, d2 = w2.document, $2 = id => d2.getElementById(id);
    await wait(400);
    check(/Élite/.test($2('name0').textContent) && /Faible/.test($2('name1').textContent) && !d2.querySelector('#squads select') && $2('teamLink').getAttribute('href') === 'equipe.html#reprendre', 'équipe reçue de la page équipe : Élite contre Faible, sans choix d\'équipe, lien de retour vers la page équipe', $2('name0').textContent + ' / ' + $2('name1').textContent);
    const v2 = sel => d2.querySelector(sel).value;
    check(v2('#tactics select[data-formation="0"]') === '433' && v2('#tactics select[data-team="0"][data-key="press"]') === '1' && v2('#tactics select[data-team="0"][data-key="line"]') === '1' && v2('#tactics select[data-formation="1"]') === '442' && v2('#tactics select[data-team="1"][data-key="press"]') === '0', 'la formation et les consignes choisies dans la page équipe sont en place ; l\'adversaire est au neutre');
    for (let x = 200; x < 1000 && /Cliquez/.test($2('player').textContent); x += 40) for (let y = 150; y < 650 && /Cliquez/.test($2('player').textContent); y += 40) { $2('pitch').onclick({ clientX: x, clientY: y }); await wait(30); }
    await wait(300);
    const notes = [...$2('player').querySelectorAll('.attr b')].map(x => +x.textContent);
    check(notes.length === 12 && notes.some(v => v !== 14) && /\((Élite|Faible)\)/.test($2('player').textContent), 'la fiche d\'un joueur montre ses notes venues du fichier', $2('player').textContent.replace(/\s+/g, ' ').slice(0, 60) + ' … notes ' + notes.join(' '));
    $2('duration').value = '600'; $2('duration').dispatchEvent(new w2.Event('change')); await wait(200);
    $2('kick').click(); await wait(600); if ($2('play').textContent === 'Pause') $2('play').click();
    $2('time').value = '600'; $2('time').dispatchEvent(new w2.Event('input')); $2('time').dispatchEvent(new w2.Event('change')); await wait(400);
    const r = [...$2('stats').querySelectorAll('tr')].find(x => x.children[1] && x.children[1].textContent === 'Tirs'), sh = r ? [r.children[0].textContent, r.children[2].textContent] : [0, 0];
    check(+sh[0] > +sh[1], 'sur ce match, l\'équipe élite tire plus que l\'équipe faible', 'score ' + $2('goals').textContent + ', tirs ' + sh.join(' / '));
    d2.querySelector('[data-mode="coach"]').click(); await wait(400);
    check(/Votre équipe[\s\S]*Élite[\s\S]*Adversaire[\s\S]*Faible/.test($2('squads').textContent) && v2('#tactics select[data-formation="0"]') === '433', 'mode Coach It : « Votre équipe » Élite, « Adversaire » Faible, la formation reste', $2('squads').textContent.replace(/\s+/g, ' '));
    const bad = new JSDOM(html, { url: url.replace(/#.*/, '#partie=' + encodeURIComponent(JSON.stringify({ equipe: { nom: 'Cassée', joueurs: [] } }))), runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) {
      const real = createCanvas(1140, 750); w.HTMLCanvasElement.prototype.getContext = function () { return real.getContext('2d'); }; w.scrollTo = () => {}; } });
    await wait(300);
    check(/illisible/.test(bad.window.document.getElementById('squads').textContent) && /Standard/.test(bad.window.document.getElementById('squads').textContent), 'équipe reçue mal formée : message clair, match entre équipes standard', bad.window.document.getElementById('squads').textContent.replace(/\s+/g, ' ').slice(0, 120));
    check(errs2.length === 0, 'aucune erreur JavaScript avec une équipe reçue', errs2.join(' | '));
    w2.close(); bad.window.close();
  }

  console.log('Lecture');
  $('kick').click(); await wait(300);
  check($('pre').hidden, 'le bouton « Lancer le match » calcule le match et démarre la lecture');
  d.querySelector('[data-speed="8"]').click(); await wait(2000);
  const c1 = $('clock').textContent;
  check(/^00:[1-4]\d/.test(c1), 'l\'horloge avance à vitesse ×8 (plus vite encore pendant les arrêts de jeu)', c1 + ' | ' + $('name0').textContent + ' ' + $('goals').textContent + ' ' + $('name1').textContent);
  let found = false;
  for (let x = 200; x < 1000 && !found; x += 50) for (let y = 150; y < 650 && !found; y += 50) { $('pitch').onclick({ clientX: x, clientY: y }); await wait(40); if (!/Cliquez/.test($('player').textContent)) found = true; }
  await wait(300);
  check(found, 'un clic sur un joueur ouvre sa fiche', $('player').textContent.replace(/\s+/g, ' ').slice(0, 90));
  $('play').click(); await wait(250); const t1 = $('clock').textContent; await wait(450);
  check(t1 === $('clock').textContent && $('play').textContent === 'Lecture', 'la pause tient');

  console.log('Barre de temps');
  await goTo(300);
  const n300 = $('log').children.length, p300 = stat('Passes');
  check(/^05:00/.test($('clock').textContent), 'saut à 5 minutes', $('clock').textContent + ', ' + n300 + ' lignes dans le fil, passes ' + p300.join(' / '));
  await goTo(60);
  const n60 = $('log').children.length, p60 = stat('Passes');
  check(/^01:00/.test($('clock').textContent) && n60 <= n300 && +p60[0] < +p300[0], 'retour en arrière à 1 minute : fil et statistiques reviennent en arrière', n60 + ' lignes, passes ' + p60.join(' / '));
  check(d.querySelectorAll('#marks .mark').length > 0, 'des repères (tirs, buts) sont posés sur la barre', d.querySelectorAll('#marks .mark').length + ' repères');
  await goTo(600);
  const endLong0 = stat('Longs ballons'), endScore0 = $('goals').textContent;
  check(!$('end').hidden, 'à la fin, le score final s\'affiche', $('endText').textContent);

  console.log('Consignes');
  await goTo(60); const before60 = stat('Passes');
  await pick(0, 'passing', 1);
  check(JSON.stringify(stat('Passes')) === JSON.stringify(before60), 'changer une consigne à 1 minute ne modifie pas le passé');
  check(d.querySelectorAll('#marks .mark.tactic').length === 1, 'le changement est repéré sur la barre de temps');
  const mk = d.querySelector('#marks .mark.tactic'), mkT = mk ? mk.title.slice(0, 5) : '';
  check(mkT >= '01:00', 'le changement attend le prochain arrêt de jeu après 1 minute', 'fait à ' + mkT);
  await goTo(599);
  check(/Consigne des Bleus : jeu de passes → long/.test($('log').textContent), 'le changement est noté dans le fil du match');
  await goTo(600);
  const endLong1 = stat('Longs ballons');
  check(+endLong1[0] > +endLong0[0], 'les Bleus en jeu long font plus de longs ballons sur le même match', endLong0[0] + ' → ' + endLong1[0] + ' (Rouges : ' + endLong0[1] + ' → ' + endLong1[1] + ')');
  await goTo(30);
  check(d.querySelector('#tactics select[data-team="0"][data-key="passing"]').value === '0', 'avant le changement, la consigne affichée est l\'ancienne');
  await goTo(0); await pick(1, 'press', 1);
  check(d.querySelectorAll('#marks .mark.tactic').length === 0 && d.querySelector('#tactics select[data-team="1"][data-key="press"]').value === '1', 'une consigne réglée au coup d\'envoi vaut pour tout le match et efface les changements suivants');
  await goTo(600); const fouls = stat('Fautes');
  console.log('        Rouges en pressing « harceler » sur ce match : fautes ' + fouls.join(' / ') + ', ballons repris dans le camp adverse ' + stat('… dont camp adverse').join(' / '));

  console.log('Prise de balle et arrêts de jeu');
  check(stat('Contrôles ratés') !== null, 'la ligne « Contrôles ratés » est dans les statistiques', (stat('Contrôles ratés') || []).join(' / '));
  check($('skip').checked, 'la lecture accélérée des arrêts de jeu est cochée par défaut');
  $('pitch').onclick({ clientX: 570, clientY: 375 }); for (let x = 200; x < 1000 && /Cliquez/.test($('player').textContent); x += 40) for (let y = 150; y < 650 && /Cliquez/.test($('player').textContent); y += 40) { $('pitch').onclick({ clientX: x, clientY: y }); await wait(30); }
  await wait(300);
  check(/Prise de balle\s*14/.test($('player').textContent.replace(/\s+/g, ' ')), 'la fiche du joueur affiche « Prise de balle »', ($('player').textContent.match(/Prise de balle\s*\d+/) || [''])[0]);

  console.log('Série de matchs');
  $('nSeries').value = '8'; $('runSeries').click();
  for (let i = 0; i < 200 && !$('seriesOut').children.length; i++) await wait(100);
  for (let i = 0; i < 400 && !$('seriesOut').querySelector('table'); i++) await wait(100);
  const rows = $('seriesOut').querySelectorAll('table tr').length;
  if (!$('seriesOut').querySelector('.small')) console.log('    contenu :', $('seriesOut').textContent.slice(0, 300));
  check(rows > 20 && /Rouges/.test($('seriesOut').textContent) && /pressing : harceler/i.test($('seriesOut').textContent), 'la série se termine et affiche le tableau avec les consignes utilisées', rows + ' lignes — ' + $('seriesOut').querySelector('.small').textContent.slice(0, 80));
  const chip = $('seriesOut').querySelector('[data-seed]');
  if (chip) { chip.click(); await wait(600); check($('seed').value === chip.dataset.seed && $('pre').hidden && !/^00:00/.test($('clock').textContent), 'un match de la série peut être revu : il se lance directement', 'n°' + chip.dataset.seed + ', ' + $('clock').textContent); }

  console.log('Durée');
  $('duration').value = '5400'; $('duration').dispatchEvent(new w.Event('change')); await wait(300);
  $('play').click();
  for (let i = 0; i < 100 && !$('pre').hidden || !$('busy').hidden; i++) await wait(100);
  await wait(500); if ($('play').textContent === 'Pause') $('play').click(); await goTo(4000);
  check(/^66:40 \/ 90:00$/.test($('clock').textContent), 'match de 90 minutes calculé, saut à la 67e minute', $('clock').textContent + ', ' + $('log').children.length + ' lignes dans le fil, ' + d.querySelectorAll('#marks .mark').length + ' repères, score ' + $('goals').textContent);

  fs.writeFileSync(__dirname + '/page.png', w.__canvas.toBuffer('image/png'));
  console.log('\nerreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(fails.length || errors.length ? 'RÉSULTAT : ' + fails.length + ' échec(s)' : 'RÉSULTAT : tout fonctionne');
  w.close(); process.exit(fails.length || errors.length ? 1 : 0);
})();
