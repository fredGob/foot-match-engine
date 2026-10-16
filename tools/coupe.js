// Teste la Coupe en carton dans un vrai navigateur (Chromium sans fenêtre, par Playwright) : départ (équipe, difficulté), tirage animé,
// autres matchs simulés en arrière-plan, votre match dans match.html (Coach It, tirs au but en cas d'égalité, résultat rendu à la coupe),
// tour suivant, reprise de la partie après fermeture, élimination et image du parcours, accueil, téléphone.
// Captures : docs/coupe-depart.png, docs/coupe-tirage.png, docs/coupe-tableau.png, docs/coupe-tab.png, docs/coupe-fin.png, docs/coupe-telephone.png.
// Usage : node build.js && node tools/coupe.js
const path = require('path');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const COUPE = 'file://' + path.join(ROOT, 'coupe.html');

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));

  console.log('Départ');
  await page.goto(COUPE); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
  check(await page.isVisible('#vStart'), 'sans partie enregistrée : l\'écran de départ');
  const picks = await page.$$('#teamPick .pick');
  check(picks.length === 18, 'les 18 clubs de Ligue 1 au choix', picks.length + ' choix');
  check(await page.isDisabled('#startBtn'), '« Lancer la coupe » grisé tant qu\'aucune équipe n\'est choisie');
  await page.click('#teamPick [data-k="lens"]'); await page.click('#diffPick [data-d="difficile"]');
  await page.screenshot({ path: path.join(DOCS, 'coupe-depart.png') });
  await page.click('#startBtn'); await page.waitForTimeout(1400);
  check(await page.isVisible('#draw'), 'tirage au sort animé');
  await page.screenshot({ path: path.join(DOCS, 'coupe-tirage.png') });
  await page.click('#drawSkip'); await page.waitForTimeout(300);
  const G = await page.evaluate(() => JSON.parse(localStorage.getItem('coupe-partie')));
  check(G && G.teams.length === 32 && new Set(G.teams).size === 32, '32 équipes, chacune une fois', G && G.teams.length + ' équipes');
  check(G.rounds[0].pairs.length === 16 && G.rounds[0].pairs.filter(p => p.a === 'moi').length === 1 && !G.rounds[0].pairs.some(p => p.b === 'moi'), '16 matchs, le vôtre une fois, votre équipe à domicile (les Bleus)');
  check(!G.teams.includes('lens') && G.me.club === 'lens', 'votre club n\'apparaît pas deux fois');
  const D0 = await page.evaluate(() => window.CoupeData), divs = {};
  for (const id of G.teams) { const T = D0.petits.find(x => x.id === id); if (T) divs[T.division] = (divs[T.division] || 0) + 1; }
  check(G.teams.filter(id => D0.clubs.some(C => C.id === id)).length === 17 && divs['Ligue 2'] === 4 && divs['National'] === 4 && divs['National 2'] === 3 && divs['Régional'] === 3, 'les 17 autres clubs de Ligue 1 et 14 petits poucets tirés au sort (4 L2, 4 National, 3 N2, 3 régionaux)', JSON.stringify(divs));
  check(await page.isVisible('a.btn.main[href^="match.html#partie="]'), 'bouton « Jouer le match »');

  console.log('Les autres matchs (simulés par le moteur, en arrière-plan)');
  const t0 = Date.now();
  await page.waitForFunction(() => { const g = JSON.parse(localStorage.getItem('coupe-partie')); return g.rounds[0].pairs.filter(p => p.res).length === 15; }, null, { timeout: 240000 });
  check(true, 'les 15 autres matchs du tour sont joués', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  const R0 = await page.evaluate(() => JSON.parse(localStorage.getItem('coupe-partie')).rounds[0].pairs.filter(p => p.res));
  check(R0.every(p => p.res.winner === 0 || p.res.winner === 1) && R0.every(p => p.res.score[0] !== p.res.score[1] || p.res.tab), 'chaque match a un vainqueur (tirs au but en cas d\'égalité)', R0.filter(p => p.res.tab).length + ' séances de tirs au but');
  check((await page.$$('#scorers tr')).length >= 3, 'classement des buteurs');
  await page.screenshot({ path: path.join(DOCS, 'coupe-tableau.png'), fullPage: true });

  console.log('Votre match (match.html, mode Coach It)');
  // pour l'essai : le même lien, avec un match de 2 minutes (« duree »), qui finit souvent à égalité → tirs au but
  const href = await page.getAttribute('a.btn.main[href^="match.html#partie="]', 'href');
  const P = JSON.parse(decodeURIComponent(href.split('#partie=')[1]));
  check(typeof P.adversaire === 'object' && P.coupe && P.coupe.tour === '16e de finale', 'le lien envoie l\'adversaire entier et le tour de coupe');
  const opp0 = (await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('coupe-partie')); const p = g.rounds[0].pairs.find(q => q.a === 'moi'); return p.b; }));
  const D = await page.evaluate(() => window.CoupeData);
  const raw = D.clubs.concat(D.petits).find(T => T.id === opp0);
  check(P.adversaire.joueurs[3].notes.passe === Math.min(100, raw.joueurs[3].notes.passe + 10), 'difficulté « difficile » : 10 points de plus sur les notes de l\'adversaire');
  let page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(String(e)));
  let tied = null;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    P.coupe.seed = seed; P.coupe.duree = 120;
    await page2.goto('file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify(P))); await page2.waitForTimeout(400);
    if (seed === 1) {
      check(await page2.evaluate(() => document.body.classList.contains('coach') && document.querySelector('[data-mode="god"]').disabled), 'mode Coach It imposé, mode God grisé');
      check(await page2.isHidden('#load'), 'pas de « Rejouer ce match » ni de « Nouveau match » en coupe');
      check(/Coupe en carton · 16e de finale/.test(await page2.textContent('#squads')), 'le tour de coupe est affiché');
      check(await page2.getAttribute('#teamLink', 'href') === 'coupe.html', 'lien « Retour à la coupe »');
    }
    await page2.click('#kick'); await page2.click('[data-speed="2"]');
    await page2.waitForFunction(() => !document.getElementById('end').hidden || !document.getElementById('tvHalf').hidden, null, { timeout: 120000 });
    if (await page2.isVisible('#tvHalf')) { check(true, 'arrêt à la mi-temps (vestiaire), puis « Reprendre la seconde période »'); await page2.click('#halfGo'); await page2.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 120000 }); }
    const r = await page2.evaluate(() => JSON.parse(localStorage.getItem('coupe-resultat')));
    if (r && r.tab) { tied = r; break; }
  }
  check(tied, 'match nul → tirs au but, résultat enregistré pour la coupe', tied && tied.score.join('-') + ', t.a.b. ' + tied.tab.join('-'));
  if (tied) {
    check(await page2.isVisible('#tab'), 'la séance de tirs au but s\'affiche');
    await page2.waitForTimeout(2600); await page2.screenshot({ path: path.join(DOCS, 'coupe-tab.png') });
    await page2.waitForSelector('#tabSee', { state: 'visible', timeout: 40000 });
    check(/remporte la séance/.test(await page2.textContent('#tabWho')), 'vainqueur de la séance annoncé');
    await page2.click('#tabSee');
    check(await page2.isHidden('#tab') && await page2.isVisible('#card'), '« Voir le résumé » montre la carte de fin de match');
    check(/Retour à la coupe/.test(await page2.textContent('#again')), 'bouton « Retour à la coupe »');
  }
  // résultat direct : tout le match (90 minutes) d'un coup, la feuille de match, et le résultat rendu à la coupe
  await page2.evaluate(() => { localStorage.removeItem('coupe-resultat'); localStorage.removeItem('coupe-en-cours'); });
  P.coupe.seed = 7; delete P.coupe.duree;
  await page2.close(); page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(String(e)));
  await page2.goto('file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify(P))); await page2.waitForTimeout(400);
  await page2.click('#instant');
  await page2.waitForFunction(() => !document.getElementById('end').hidden || !document.getElementById('tab').hidden, null, { timeout: 60000 });
  const rd = await page2.evaluate(() => ({ r: JSON.parse(localStorage.getItem('coupe-resultat')), run: localStorage.getItem('coupe-en-cours') }));
  check(rd.r && rd.r.id === P.coupe.id && !rd.run && /^90:00/.test(await page2.textContent('#clock')), '« Résultat direct » en coupe : feuille de match, résultat rendu à la coupe, pas de forfait', rd.r && rd.r.score.join('-') + (rd.r.tab ? ', t.a.b. ' + rd.r.tab.join('-') : ''));
  // finir le match en cours de partie (Coach It : on confirme), résultat rendu à la coupe
  await page2.close(); page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push(String(e)));
  P.coupe.seed = 8;
  await page2.goto('file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify(P))); await page2.waitForTimeout(400);
  await page2.evaluate(() => localStorage.removeItem('coupe-resultat'));
  await page2.click('#kick'); await page2.waitForTimeout(2500);
  let asked = ''; page2.once('dialog', d => { asked = d.message(); d.accept(); });
  await page2.click('#finish');
  await page2.waitForFunction(() => !document.getElementById('end').hidden || !document.getElementById('tab').hidden, null, { timeout: 60000 });
  const rf = await page2.evaluate(() => ({ r: JSON.parse(localStorage.getItem('coupe-resultat')), run: localStorage.getItem('coupe-en-cours') }));
  check(/Finir le match/.test(asked) && rf.r && rf.r.id === P.coupe.id && !rf.run && /^90:00/.test(await page2.textContent('#clock')), '« Finir le match » en cours de partie : confirmation, feuille de match, résultat rendu à la coupe', rf.r && rf.r.score.join('-'));
  await page2.close();

  console.log('Retour à la coupe');
  // résultat forcé : victoire 5-1, cinq buts du même joueur (pour aller au tour suivant et le voir en tête des buteurs)
  await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('coupe-partie')); const p = g.rounds[0].pairs.find(q => q.a === 'moi'); localStorage.setItem('coupe-resultat', JSON.stringify({ id: p.id, score: [5, 1], tab: null, winner: 0, scorers: [{ team: 0, name: 'Buteur Test', og: false, min: "12'" }, { team: 0, name: 'Buteur Test', og: false, min: "30'" }, { team: 0, name: 'Buteur Test', og: false, min: "44'" }, { team: 0, name: 'Buteur Test', og: false, min: "61'" }, { team: 0, name: 'Buteur Test', og: false, min: "80'" }, { team: 1, name: 'Autre', og: false, min: "50'" }] })); });
  await page.reload(); await page.waitForTimeout(500);
  check(/Qualifié/.test(await page.textContent('#myBox')), 'victoire lue au retour : « Qualifié pour le tour suivant »');
  check(/Buteur Test/.test(await page.textContent('#scorers')), 'vos buteurs comptent dans le classement');
  await page.click('#nextRound'); await page.waitForTimeout(400); await page.click('#drawSkip'); await page.waitForTimeout(300);
  const G2 = await page.evaluate(() => JSON.parse(localStorage.getItem('coupe-partie')));
  check(G2.rounds.length === 2 && G2.rounds[1].pairs.length === 8 && G2.rounds[1].name === '8e de finale', 'nouveau tirage : 8es de finale, 8 matchs');
  const alive = G2.rounds[0].pairs.map(p => p.res.winner === 0 ? p.a : p.b).sort().join(), drawn = G2.rounds[1].pairs.flatMap(p => [p.a, p.b]).sort().join();
  check(alive === drawn, 'seuls les qualifiés sont tirés');

  console.log('Reprise après fermeture du navigateur');
  const page3 = await ctx.newPage(); await page3.goto(COUPE); await page3.waitForTimeout(400);
  check(await page3.isVisible('#vCup') && /8e de finale/.test(await page3.textContent('#roundTitle')), 'la partie reprend au même tour');
  await page3.close();

  console.log('Abandon = défaite (match lancé puis quitté)');
  const href2 = await page.getAttribute('a.btn.main[href^="match.html#partie="]', 'href');
  const page4 = await ctx.newPage(); page4.on('pageerror', e => errors.push(String(e)));
  await page4.goto('file://' + path.join(ROOT, href2)); await page4.waitForTimeout(400);
  await page4.reload(); await page4.waitForTimeout(400);
  check(await page4.isHidden('#forfait'), 'page rechargée avant le coup d\'envoi : pas de forfait (on peut régler sa tactique)');
  await page4.click('#kick'); await page4.waitForTimeout(3500);
  await page4.reload(); await page4.waitForTimeout(500);
  check(await page4.isVisible('#forfait') && await page4.isHidden('#kick'), 'match lancé puis page rechargée : « défaite par forfait », plus de coup d\'envoi');
  await page4.close();
  await page.reload(); await page.waitForTimeout(500);
  check(/forfait/.test(await page.textContent('#myBox')) && /Éliminé en 8e de finale/.test(await page.textContent('#myBox')), 'la coupe compte le forfait : éliminé en 8e de finale', (await page.textContent('#myBox')).slice(0, 120));

  console.log('Image du parcours');
  await page.click('#toEnd'); await page.waitForTimeout(400);
  check(await page.isVisible('#card'), 'image du parcours');
  await page.screenshot({ path: path.join(DOCS, 'coupe-fin.png') });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveImg')]);
  check(/^coupe-en-carton-rc-lentilles\.png$/.test(dl.suggestedFilename()), 'image enregistrable', dl.suggestedFilename());
  await page.click('#backCup'); await page.waitForTimeout(300);

  console.log('Accueil');
  await page.goto('file://' + path.join(ROOT, 'index.html')); await page.waitForTimeout(300);
  check(/éliminé en 8e de finale/.test(await page.textContent('#cupState')), 'l\'accueil montre la coupe en cours', await page.textContent('#cupState'));
  check(await page.getAttribute('#goCup', 'href') === 'coupe.html', 'carte « La Coupe en carton » vers coupe.html');

  console.log('Avec une équipe construite (page équipe)');
  await page.goto('file://' + path.join(ROOT, 'equipe.html') + '#clubs'); await page.waitForTimeout(400);
  await page.click('[data-club="monaco"]'); await page.waitForTimeout(300); await page.click('#save'); await page.waitForTimeout(200);
  const built = await page.evaluate(() => (JSON.parse(localStorage.getItem('construction-equipe')) || {}).equipe);
  check(built && built.joueurs.length === 11 && built.remplacants.length > 0 && built.formation, '« Enregistrer l\'équipe » garde l\'équipe entière pour la coupe');
  await page.goto(COUPE); await page.waitForTimeout(300);
  page.once('dialog', d => d.accept()); await page.click('#backCup').catch(() => {});
  await page.evaluate(() => localStorage.removeItem('coupe-partie')); await page.reload(); await page.waitForTimeout(300);
  check(await page.isVisible('#teamPick [data-k="moi"]'), 'l\'équipe enregistrée est proposée en premier');
  await page.click('#teamPick [data-k="moi"]'); await page.click('#startBtn'); await page.waitForTimeout(300); await page.click('#drawSkip');
  const G3 = await page.evaluate(() => JSON.parse(localStorage.getItem('coupe-partie')));
  check(G3.teams.length === 32 && new Set(G3.teams).size === 32 && !G3.teams.includes('monaco') && G3.me.club === 'monaco', 'Monaco placé dans la page équipe : il remplace le Monaco d\'origine (pas deux fois)');

  console.log('Téléphone');
  const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await ph.newPage(); pp.on('pageerror', e => errors.push(String(e)));
  await pp.goto(COUPE); await pp.waitForTimeout(300);
  check(await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'pas de défilement de côté sur téléphone');
  await pp.screenshot({ path: path.join(DOCS, 'coupe-telephone.png'), fullPage: true });
  await ph.close();

  check(!errors.length, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})();
