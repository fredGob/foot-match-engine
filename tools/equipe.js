// Teste la page de construction d'équipe (equipe.html) dans un vrai navigateur (Chromium sans fenêtre, par Playwright) :
// accueil, achat d'un effectif valable (vrais clics), bouton « Valider » bloqué tant qu'il manque quelque chose, fiche d'un joueur,
// écran tactique, changement de formation, joueurs glissés à la souris, consignes, enregistrement, export, reprise après rechargement,
// affichage sur téléphone. Le fichier exporté est ensuite lu par le moteur : chaque joueur doit jouer à la place où on l'a déposé.
// Puis « Prendre une équipe de Ligue 1 » : liste des dix clubs, choix du PSG, écran tactique déjà rempli (titulaires de equipes.json à leur
// place, remplaçants sur le banc), glisser un joueur, formation, export lu par le moteur.
// Captures d'écran dans docs/ (equipe-accueil.png, equipe-achat.png, equipe-fiche.png, equipe-tactique.png, equipe-telephone*.png,
// equipe-ligue1.png, equipe-ligue1-tactique.png).
// Usage : node build.js && node tools/equipe.js
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const E = require(path.join(ROOT, 'engine.js')), EQ = require(path.join(ROOT, 'equipes.json'));
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };

// effectif à acheter, choisi d'avance : 2 G, 2 AG, 3 DC, 1 AD, 1 MG, 3 MC, 1 MD, 3 AT ; pour chaque place, le meilleur joueur à moins de 1,8 M€
function choisir(D) {
  const besoin = ['G', 'G', 'AG', 'AG', 'DC', 'DC', 'DC', 'AD', 'MG', 'MC', 'MC', 'MC', 'MD', 'AT', 'AT', 'AT'], pris = [];
  for (const p of besoin) { const j = D.joueurs.filter(x => x.poste === p && x.prix <= 1.8 && !pris.includes(x)).sort((a, b) => b.note - a.note)[0]; pris.push(j); }
  return pris;
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = 'file://' + path.join(ROOT, 'equipe.html'), home = 'file://' + path.join(ROOT, 'index.html');
  await page.goto(url + '#construire');
  const D = await page.evaluate('D');
  await page.goto(home);
  const shot = async name => { await page.screenshot({ path: path.join(DOCS, name) }); console.log('        capture : docs/' + name); };

  console.log('Accueil');
  check(await page.isVisible('#goBuild') && await page.isVisible('#goClubs') && await page.isVisible('#goQuick') && await page.isVisible('#none'), 'accueil (index.html) : trois grands choix « Créer mon équipe », « Choisir un club de Ligue 1 », « Match rapide » ; pas encore d\'équipe enregistrée');
  check((await page.getAttribute('#goQuick', 'href')) === 'match.html', '« Match rapide » mène à match.html');
  await shot('equipe-accueil.png');

  console.log('Achats');
  await page.click('#goBuild'); await page.waitForURL(/equipe\.html#construire/);
  check(await page.isDisabled('#validate'), 'au départ, « Valider mon équipe » est bloqué', await page.textContent('#why'));
  const liste = choisir(D), cout = liste.reduce((s, j) => s + j.prix, 0);
  console.log('        effectif choisi : ' + liste.length + ' joueurs, ' + cout.toFixed(1) + ' M€ (budget ' + D.budget + ' M€), note moyenne ' + (liste.reduce((s, j) => s + j.note, 0) / 16).toFixed(1));
  for (const j of liste.slice(0, 15)) await page.click('button[data-buy="' + j.id + '"]');
  check(await page.isDisabled('#validate') && /encore 1 joueur/.test(await page.textContent('#why')), 'à 15 joueurs, toujours bloqué, et la page dit ce qui manque', await page.textContent('#why'));
  // une vedette trop chère : son bouton est grisé
  const star = D.joueurs.filter(j => !liste.includes(j)).sort((a, b) => b.prix - a.prix)[0];
  const left = await page.evaluate('reste()');
  check(star.prix > left ? await page.isDisabled('button[data-buy="' + star.id + '"]') : true, 'un joueur trop cher ne peut pas être acheté', star.nom + ' ' + star.prix + ' M€, reste ' + left + ' M€');
  // un effectif de 16 sans assez d'attaquants : bloqué (on achète un défenseur à la place du dernier attaquant, puis on le revend)
  const extra = D.joueurs.find(j => j.poste === 'DC' && !liste.includes(j) && j.prix <= left);
  await page.click('button[data-buy="' + extra.id + '"]');
  check(await page.isDisabled('#validate') && /attaquant/.test(await page.textContent('#why')), '16 joueurs mais 2 attaquants : bloqué, « attaquant » est nommé', await page.textContent('#why'));
  await page.click('#squad button[data-sell="' + extra.id + '"]');
  await page.click('button[data-buy="' + liste[15].id + '"]');
  check(!(await page.isDisabled('#validate')), 'effectif valable (16 joueurs, minimums, budget) : « Valider » débloqué', await page.textContent('#money'));
  // filtres et tri
  await page.click('#fPoste button[data-f="AT"]');
  const postes = await page.$$eval('#base tr.p td:first-child', tds => [...new Set(tds.map(t => t.textContent))]);
  check(postes.length === 1 && postes[0] === 'AT', 'filtre « Attaquants »', postes.join(','));
  await page.selectOption('#sort', 'prix');
  const prix = await page.$$eval('#base tr.p', trs => trs.map(t => t.dataset.id));
  check(prix.every((id, i) => i === 0 || D.joueurs.find(j => j.id === prix[i - 1]).prix <= D.joueurs.find(j => j.id === id).prix), 'tri par prix');
  await page.click('#fPoste button[data-f="tous"]'); await page.selectOption('#sort', 'note');
  await shot('equipe-achat.png');
  await page.click('#base tr.p[data-id="' + star.id + '"] td:nth-child(2)');
  const nAttrs = await page.$$eval('#sheet .attr', a => a.length);
  check(await page.isVisible('#sheet') && nAttrs === 20, 'clic sur un joueur : sa fiche avec ses 20 notes', nAttrs + ' notes');
  await shot('equipe-fiche.png');
  await page.keyboard.press('Escape');

  console.log('Tactique');
  await page.click('#validate');
  check(await page.isVisible('#pitch') && (await page.$$('#pitch .tok')).length === 11 && (await page.$$('#bench .tok')).length === 5, 'écran tactique : 11 joueurs sur le terrain, 5 sur le banc');
  await page.click('#forms button[data-form="433"]');
  check(await page.evaluate('S.formation') === '433', 'formation 4-3-3 choisie');
  // vrai glisser-déposer à la souris : le 1er remplaçant sur la place n° 10 (avant-centre en 4-3-3)
  const drag = async (from, to) => {
    const a = await page.locator(from + ' .tok .ball').boundingBox(), b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 10, { steps: 12 }); await page.mouse.up();
  };
  const k = await page.evaluate(`S.bench.findIndex(id => byId[id].poste === 'AT')`), b0 = await page.evaluate('S.bench[' + k + ']'), was10 = await page.evaluate('S.lineup[10]');
  await drag('[data-drop="b' + k + '"]', '[data-drop="p10"]');
  check(await page.evaluate('S.lineup[10]') === b0 && await page.evaluate('S.bench[' + k + ']') === was10, 'glisser un attaquant remplaçant sur l\'avant-centre : les deux sont échangés');
  // un défenseur central glissé en attaque : marqué « hors poste »
  const dcPlace = await page.evaluate(`S.lineup.findIndex(id => byId[id].poste === 'DC')`);
  await drag('[data-drop="p' + dcPlace + '"]', '[data-drop="p9"]');
  const off = await page.evaluate(`[...document.querySelectorAll('#pitch .tok.off')].map(t => byId[t.dataset.tok].poste + ' en ' + forme().places[+t.closest('[data-drop]').dataset.drop.slice(1)].label)`);
  check(off.some(s => /^DC en Milieu intérieur gauche/.test(s)), 'défenseur central glissé au milieu : marqué « hors poste »', off.join(' ; '));
  // clic sur un joueur : ses vingt notes dans le cadre « Joueur » ; cliquer sur deux joueurs de suite ne les échange pas
  const p1 = await page.evaluate('S.lineup[1]'), p4 = await page.evaluate('S.lineup[4]');
  await page.click('[data-drop="p1"] .tok .ball');
  const look1 = await page.$$eval('#look .attr', a => a.map(x => x.textContent));
  check(look1.length === 20 && (await page.textContent('#look')).includes(await page.evaluate('byId[S.lineup[1]].nom')) && /Arrière gauche/.test(await page.textContent('#look')), 'clic sur un joueur : ses vingt notes et sa place dans le cadre « Joueur »', (await page.textContent('#look .who')) + ' · ' + look1.slice(0, 4).join(', ') + '…');
  await page.click('[data-drop="p4"] .tok .ball');
  check(await page.evaluate('S.lineup[1]') === p1 && await page.evaluate('S.lineup[4]') === p4 && (await page.textContent('#look .who')) === await page.evaluate('byId[S.lineup[4]].nom'), 'clic sur un second joueur : sa fiche remplace la première, aucun échange');
  await page.click('#compo tr[data-look="' + p1 + '"]');
  check((await page.textContent('#look .who')) === await page.evaluate('byId[S.lineup[1]].nom'), 'clic sur une ligne de la composition : la fiche du joueur');
  await page.click('[data-drop="p1"] .tok .ball'); await page.evaluate('scrollTo(0, 0)'); await shot('equipe-fiche-placement.png');
  // échange sans glisser (pour le téléphone) : « Échanger ce joueur » dans la fiche, puis toucher l'autre
  await page.click('[data-drop="p1"] .tok .ball'); await page.click('#swapBtn'); await page.click('[data-drop="p4"] .tok .ball');
  check(await page.evaluate('S.lineup[1]') === p4 && await page.evaluate('S.lineup[4]') === p1, '« Échanger ce joueur » puis clic sur l\'autre : arrière gauche et arrière droit échangés');
  await page.click('[data-drop="p1"] .tok .ball'); await page.click('#swapBtn'); await page.click('[data-drop="p4"] .tok .ball');      // on les remet
  // consignes
  await page.selectOption('#preset', 'pressing');
  check(JSON.stringify(await page.evaluate('S.tac')) === JSON.stringify(D.presets.find(p => p.id === 'pressing').t), 'tactique prédéfinie « Pressing haut » : les cinq consignes suivent');
  await page.selectOption('select[data-tac="passing"]', '-1');
  check(await page.inputValue('#preset') === '' && await page.evaluate('S.tac.passing') === -1, 'une consigne changée à la main : tactique « Personnalisée »');
  await page.fill('#nom', 'Les Essais');
  await shot('equipe-tactique.png');

  console.log('Enregistrer, exporter');
  await page.click('#save');
  const saved = await page.evaluate(`JSON.parse(localStorage.getItem('construction-equipe'))`);
  check(saved && saved.nom === 'Les Essais' && saved.formation === '433' && saved.lineup.length === 11, 'enregistrée dans le navigateur', await page.textContent('#msg'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const tmp = path.join(os.tmpdir(), 'equipe-export-' + process.pid + '.json'); await dl.saveAs(tmp);
  const T = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
  check(dl.suggestedFilename() === 'equipe-les-essais.json', 'fichier exporté', dl.suggestedFilename());
  check(T.joueurs.length === 11 && T.remplacants.length === 5 && T.formation === '433', '11 titulaires, 5 remplaçants, formation');
  // le moteur lit le fichier et met chaque joueur à la place où il a été déposé
  let okEngine = true, detail = '';
  try {
    E.readTeam(T);
    const m = E.createMatch({ seed: 3, duration: 120, teams: [T, null], formations: [T.formation, '442'], tactics: [T.consignes, {}] });
    const lineup = await page.evaluate('S.lineup.map(id => byId[id].nom)'), labels = await page.evaluate('forme().places.map(p => p.label)');
    for (let i = 0; i < 11; i++) {
      const p = m.teams[0].players[i];
      if (p.name !== lineup[i]) { okEngine = false; detail += ' place ' + i + ' : ' + p.name + ' au lieu de ' + lineup[i]; }
      if (i > 0 && p.poste !== labels[i]) { okEngine = false; detail += ' place ' + i + ' : ' + p.poste + ' au lieu de ' + labels[i]; }
    }
    while (m.mode !== 'over') E.step(m);
    detail = detail || 'match de 2 minutes joué, ' + m.teams[0].score + '-' + m.teams[1].score + ' ; ' + m.teams[0].players.slice(5, 11).map(p => p.name.split(' ').pop() + ' : ' + p.poste).join(', ');
  } catch (e) { okEngine = false; detail = e.message; }
  check(okEngine, 'le moteur lit l\'équipe exportée, chacun à sa place', detail);

  console.log('Reprise après rechargement');
  await page.goto(home);
  check(await page.isVisible('#mine') && /Les Essais/.test(await page.textContent('#mine')) && (await page.$$('#mine svg circle[fill="#2f6fdf"]')).length === 11 && /4-3-3/.test(await page.textContent('#mine')), 'l\'accueil montre « Mon équipe » : nom, formation, onze titulaires sur le terrain', (await page.textContent('#mine .facts')).replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(DOCS, 'accueil.png'), fullPage: true }); console.log('        capture : docs/accueil.png');
  await page.click('#editMine'); await page.waitForURL(/equipe\.html#reprendre/);
  check(await page.isVisible('#pitch') && JSON.stringify(await page.evaluate('S.lineup')) === JSON.stringify(saved.lineup) && await page.evaluate('S.formation') === '433', 'équipe reprise : même formation, mêmes places');

  console.log('Prendre une équipe de Ligue 1');
  await page.click('#home'); await page.click('#goClubs'); await page.waitForURL(/#clubs/);
  const clubs = EQ.equipes.filter(T => T.championnat);
  check(await page.isVisible('#clubs') && (await page.$$('#clubs .club')).length === clubs.length && clubs.length === 10, 'liste des dix clubs', (await page.$$eval('#clubs .club b', b => b.map(x => x.textContent))).join(', '));
  await shot('equipe-ligue1.png');
  await page.click('#clubs .club[data-club="psg"]');
  const PSG = clubs.find(T => T.id === 'psg');
  const order = ['G', 'AG', 'DCG', 'DCD', 'AD', 'MG', 'MCG', 'MCD', 'MD', 'ATG', 'ATD'];      // rang de l'effectif du 4-4-2 dans le moteur
  const want = order.map(c => PSG.joueurs.find(j => j.poste === c).nom);
  check(await page.isVisible('#pitch') && (await page.$$('#pitch .tok')).length === 11 && (await page.$$('#bench .tok')).length === PSG.remplacants.length,
    'PSG choisi : écran tactique, 11 titulaires sur le terrain, ' + PSG.remplacants.length + ' remplaçants sur le banc');
  check(JSON.stringify(await page.evaluate('S.lineup.map(id => byId[id].nom)')) === JSON.stringify(want) && await page.evaluate('S.formation') === '442', 'chaque titulaire à sa place du 4-4-2 de equipes.json', want.join(', '));
  check(/pas de budget/.test(await page.textContent('#teamInfo')) && (await page.textContent('#back')) === 'Changer de club' && /Choisir le club/.test(await page.textContent('#st1')), 'pas de budget affiché, bouton « Changer de club »', await page.textContent('#teamInfo'));
  // le remplaçant attaquant glissé sur l'attaquant mobile (place n° 9 en 4-4-2)
  const kb = await page.evaluate(`S.bench.findIndex(id => byId[id].poste === 'AT')`), sub = await page.evaluate('S.bench[' + kb + ']'), ac = await page.evaluate('S.lineup[9]');
  await drag('[data-drop="b' + kb + '"]', '[data-drop="p9"]');
  check(await page.evaluate('S.lineup[9]') === sub && await page.evaluate('S.bench[' + kb + ']') === ac, 'glisser le remplaçant attaquant sur l\'attaquant mobile : échangés', await page.evaluate('byId[S.lineup[9]].nom'));
  await page.click('#forms button[data-form="4231"]');
  check(await page.evaluate('S.formation') === '4231', 'formation 4-2-3-1 choisie');
  await page.selectOption('#preset', 'possession');
  await shot('equipe-ligue1-tactique.png');
  await page.click('#save');
  const saved2 = await page.evaluate(`JSON.parse(localStorage.getItem('construction-equipe'))`);
  check(saved2 && saved2.club === 'psg' && saved2.formation === '4231', 'enregistrée (club, formation)');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const tmp2 = path.join(os.tmpdir(), 'equipe-export-l1-' + process.pid + '.json'); await dl2.saveAs(tmp2);
  const T2 = JSON.parse(fs.readFileSync(tmp2, 'utf8')); fs.unlinkSync(tmp2);
  check(dl2.suggestedFilename() === 'equipe-paris-sg.json' && T2.joueurs.length === 11 && T2.remplacants.length === PSG.remplacants.length && T2.formation === '4231', 'fichier exporté', dl2.suggestedFilename() + ' · ' + T2.description);
  const all = PSG.joueurs.concat(PSG.remplacants);
  check(T2.joueurs.concat(T2.remplacants).every(j => JSON.stringify(j.notes) === JSON.stringify(all.find(x => x.nom === j.nom).notes)), 'les notes exportées sont celles de equipes.json');
  let ok2 = true, det2 = '';
  try {
    const m = E.createMatch({ seed: 4, duration: 120, teams: [T2, PSG], formations: [T2.formation, '442'], tactics: [T2.consignes, {}] });
    const lineup = await page.evaluate('S.lineup.map(id => byId[id].nom)'), labels = await page.evaluate('forme().places.map(p => p.label)');
    for (let i = 0; i < 11; i++) { const p = m.teams[0].players[i]; if (p.name !== lineup[i] || (i > 0 && p.poste !== labels[i])) { ok2 = false; det2 += ' place ' + i + ' : ' + p.name + ' (' + p.poste + ')'; } }
    while (m.mode !== 'over') E.step(m);
    det2 = det2 || 'match de 2 minutes joué contre le PSG de equipes.json, ' + m.teams[0].score + '-' + m.teams[1].score + ' ; ' + m.teams[0].players.slice(5, 11).map(p => p.name + ' : ' + p.poste).join(', ');
  } catch (e) { ok2 = false; det2 = e.message; }
  check(ok2, 'le moteur lit l\'équipe exportée, chacun à sa place', det2);
  await page.goto(home); await page.click('#editMine'); await page.waitForURL(/#reprendre/);
  check(await page.isVisible('#pitch') && await page.evaluate('S.club') === 'psg' && JSON.stringify(await page.evaluate('S.lineup')) === JSON.stringify(saved2.lineup), 'club repris après rechargement : même formation, mêmes places');
  await page.click('#back');
  check(await page.isVisible('#clubs'), '« Changer de club » ramène à la liste des clubs');
  await page.click('#home'); await page.click('#goBuild'); await page.waitForURL(/#construire/);
  check(await page.evaluate('S.squad.length') === 0 && await page.evaluate('S.club') === null, '« Construire mon équipe » après un club : effectif vide, budget entier');

  console.log('Passer au match');
  await page.click('#home'); await page.click('#goClubs'); await page.waitForURL(/#clubs/); await page.click('#clubs .club[data-club="lens"]');
  await page.click('#forms button[data-form="352"]'); await page.selectOption('#preset', 'contre');
  const advs = await page.$$eval('#adv optgroup', g => g.map(x => x.label + ' : ' + x.children.length));
  check(advs.length === 2 && advs[0] === 'Niveaux : 5' && advs[1] === 'Ligue 1 2025-26 : 10', 'choix de l\'adversaire : Standard, quatre niveaux, dix clubs', advs.join(' | '));
  await page.selectOption('#adv', 'marseille');
  const tacLens = await page.evaluate('Object.assign({}, S.tac)'), lineLens = await page.evaluate('S.lineup.map(id => byId[id].nom)');
  await Promise.all([page.waitForURL(/match\.html#partie=/), page.click('#play')]);
  await page.waitForTimeout(800);
  const nm = [await page.textContent('#name0'), await page.textContent('#name1')];
  check(/Lens/.test(nm[0]) && /Marseille/.test(nm[1]) && (await page.$$('#squads select')).length === 0, '« Passer au match » ouvre match.html : Lens contre Marseille, aucun choix d\'équipe dans la page', nm.join(' / '));
  const formM = await page.inputValue('#tactics select[data-formation="0"]'), tacM = {};
  for (const k of Object.keys(tacLens)) tacM[k] = +(await page.inputValue('#tactics select[data-team="0"][data-key="' + k + '"]'));
  check(formM === '352' && JSON.stringify(tacM) === JSON.stringify(tacLens), 'la formation (3-5-2) et la tactique « Contre-attaque » sont en place dans le match', formM + ' ' + JSON.stringify(tacM));
  await page.click('#kick'); await page.waitForFunction(() => !document.getElementById('time').disabled && document.getElementById('busy').hidden, null, { timeout: 30000 });
  const sent = JSON.parse(decodeURIComponent(/#partie=(.*)$/.exec(page.url())[1]));      // ce que la page équipe a envoyé, lu par le moteur
  const onPitch = E.createMatch({ seed: 1, duration: 60, teams: [sent.equipe, null], formations: [sent.equipe.formation, '442'] }).teams[0].players.map(p => p.name);
  check(JSON.stringify(onPitch) === JSON.stringify(lineLens), 'chaque joueur joue à la place où on l\'a mis', onPitch.slice(8).join(', '));
  await page.waitForTimeout(1500); await page.screenshot({ path: path.join(DOCS, 'match-depuis-equipe.png') }); console.log('        capture : docs/match-depuis-equipe.png');
  await Promise.all([page.waitForURL(/equipe\.html/), page.click('#teamLink')]);
  await page.waitForTimeout(300);
  check(await page.isVisible('#pitch') && await page.evaluate('S.club') === 'lens' && await page.evaluate('S.formation') === '352' && await page.inputValue('#adv') === 'marseille', '« Retour à la page équipe » : on retrouve Lens, son placement et l\'adversaire');

  console.log('Téléphone (390 × 844)');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const pp = await phone.newPage();
  pp.on('pageerror', e => errors.push(String(e)));
  await pp.goto(home);
  await pp.evaluate(s => localStorage.setItem('construction-equipe', JSON.stringify(s)), saved);
  await pp.reload();
  const noScroll = async () => pp.evaluate('document.documentElement.scrollWidth <= window.innerWidth');
  check(await noScroll(), 'accueil : pas de défilement de côté');
  await pp.click('#goBuild'); await pp.waitForURL(/#construire/);
  check(await noScroll(), 'achats : pas de défilement de côté');
  await pp.screenshot({ path: path.join(DOCS, 'equipe-telephone-achat.png') }); console.log('        capture : docs/equipe-telephone-achat.png');
  await pp.click('#home'); await pp.click('#goClubs'); await pp.waitForURL(/#clubs/);
  check(await noScroll(), 'liste des clubs : pas de défilement de côté');
  await pp.click('#home'); await pp.screenshot({ path: path.join(DOCS, 'accueil-telephone.png'), fullPage: true }); console.log('        capture : docs/accueil-telephone.png');
  check(await noScroll(), 'accueil avec « Mon équipe » : pas de défilement de côté');
  await pp.click('#editMine'); await pp.waitForURL(/#reprendre/);
  check(await noScroll(), 'tactique : pas de défilement de côté');
  await pp.screenshot({ path: path.join(DOCS, 'equipe-telephone.png') }); console.log('        capture : docs/equipe-telephone.png');
  const q1 = await pp.evaluate('S.lineup[2]'), q2 = await pp.evaluate('S.lineup[3]');
  await pp.tap('[data-drop="p2"] .tok .ball');
  check((await pp.$$('#look .attr')).length === 20, 'au doigt : toucher un joueur montre ses notes');
  await pp.tap('#swapBtn'); await pp.tap('[data-drop="p3"] .tok .ball');
  check(await pp.evaluate('S.lineup[2]') === q2 && await pp.evaluate('S.lineup[3]') === q1, 'au doigt : « Échanger ce joueur » puis toucher l\'autre les échange');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
