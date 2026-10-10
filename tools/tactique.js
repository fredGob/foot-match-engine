// Teste l'onglet « Tactique » de la page de match (match.html) dans un vrai navigateur (Chromium sans fenêtre, par Playwright) :
// composition avant le coup d'envoi, remplacement et changement de place glissés à la souris pendant le match, fait au prochain
// arrêt de jeu, limite de cinq remplacements, remplacements automatiques de l'adversaire, mode Coach It.
// Captures : docs/tactique.png, docs/tactique-telephone.png.
// Usage : node build.js && node tools/tactique.js
const path = require('path');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const EQ = require(path.join(ROOT, 'equipes.json')).equipes;
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const lens = Object.assign({}, EQ.find(T => T.id === 'lens'), { formation: '442', consignes: {} });
const url = 'file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: lens, adversaire: 'marseille' }));

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => errors.push(String(e)));
  const seek = t => page.evaluate(t => { const r = document.getElementById('time'); r.value = t; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }, t);
  const ready = () => page.waitForFunction(() => !document.getElementById('time').disabled && document.getElementById('busy').hidden, null, { timeout: 60000 });
  const drag = async (a, b) => {
    const A = await (await page.$(a)).boundingBox(), B = await (await page.$(b)).boundingBox();
    await page.mouse.move(A.x + A.width / 2, A.y + A.height / 2); await page.mouse.down();
    await page.mouse.move(A.x + A.width / 2 + 12, A.y + A.height / 2 + 12, { steps: 3 }); await page.mouse.move(B.x + B.width / 2, B.y + B.height / 2, { steps: 8 }); await page.mouse.up();
  };
  const names = sel => page.$$eval(sel + ' .ttok .nm:first-of-type', x => x.map(e => e.textContent));
  await page.goto(url); await page.waitForTimeout(500);

  console.log('Avant le coup d\'envoi');
  await page.click('#tabTac');
  check((await page.$$('#tvPitch .ttok')).length === 11 && (await page.$$('#tvBench .ttok')).length === lens.remplacants.length, 'onglet Tactique : onze joueurs sur le terrain, les remplaçants sur le banc', (await names('#tvBench')).join(', '));
  check(/avant le coup d'envoi/.test(await page.textContent('#tvSubs')), 'avant le coup d\'envoi, les titulaires sont au choix (pas des remplacements)');
  await page.click('#tvPitch [data-tdrop="p9"] .ttok .ball');
  check((await page.$$('#tvLook .attr')).length === 18 && /Attaquant/.test(await page.textContent('#tvLook')), 'clic sur un joueur : sa fiche et ses notes', (await page.textContent('#tvLook b')));
  const benchAT = await page.$eval('#tvBench .ttok', e => e.dataset.rid);
  await drag('#tvBench [data-tdrop] .ttok', '#tvPitch [data-tdrop="p9"]');
  check(/Titulaire/.test(await page.textContent('#tvDraft')), 'un remplaçant glissé sur un titulaire : « Titulaire : … » en préparation', (await page.textContent('#tvDraft')));
  await page.click('#tvApply'); await page.waitForTimeout(300);
  check(await page.$eval('#tvPitch [data-tdrop="p9"] .ttok', e => e.dataset.rid) === benchAT && /coup d'envoi/.test(await page.textContent('#tvPending')), 'validé : il est titulaire au coup d\'envoi', await page.textContent('#tvPending'));

  console.log('Pendant le match');
  await page.selectOption('#duration', '1200'); await page.waitForTimeout(200);
  await page.fill('#seed', '7'); await page.click('#load'); await page.waitForTimeout(200);      // match n° 7 : pas d'arrêt de jeu à 05:00 pile
  await page.click('#tabMatch'); await page.click('#kick'); await ready();
  await page.click('#play').catch(() => {}); await seek(300); await page.waitForTimeout(300);
  await page.click('#tabTac'); await page.waitForTimeout(200);
  check(await page.$eval('#tvPitch [data-tdrop="p9"] .ttok', e => e.dataset.rid) === benchAT, 'le titulaire choisi avant le match joue bien');
  check(/remplacements 0 \/ 5/.test(await page.textContent('#tvSubs')), 'compteur : 0 remplacement sur 5', await page.textContent('#tvSubs'));
  const before = await names('#tvPitch');
  await drag('#tvBench [data-tdrop] .ttok', '#tvPitch [data-tdrop="p7"]');
  await drag('#tvPitch [data-tdrop="p1"] .ttok', '#tvPitch [data-tdrop="p4"]');
  const draft = await page.textContent('#tvDraft');
  check(/Entre :/.test(draft) && /→/.test(draft) && /remplacements 1 \/ 5/.test(await page.textContent('#tvSubs')), 'un remplacement et un changement de place en préparation', draft.replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(DOCS, 'tactique.png') }); console.log('        capture : docs/tactique.png');
  await page.click('#tvApply'); await ready(); await page.waitForTimeout(300);
  check(/fait au prochain arrêt de jeu/.test(await page.textContent('#tvPending')) && /En attente du prochain arrêt de jeu : composition/.test(await page.textContent('#tvPending')), 'validé à 05:00 : en attente du prochain arrêt de jeu', (await page.textContent('#tvPending')).replace(/\s+/g, ' '));
  await page.click('#tabMatch'); await seek(1199); await page.waitForTimeout(400);
  const log = await page.textContent('#log'), m1 = /(\d\d:\d\d)Remplacement des Bleus : ([^(]+) remplace/.exec(log), m2 = /(\d\d:\d\d)Changement de place des Bleus/.exec(log);
  check(m1 && m2 && m1[1] >= '05:00' && m1[1] === m2[1], 'remplacement et changement de place faits ensemble, au premier arrêt de jeu après 05:00', m1 ? m1[1] + ' ' + m1[2] : log.slice(0, 200));
  check((await page.$$('#marks .mark.sub')).length >= 2, 'repères « remplacement » sur la barre de temps');
  await page.click('#tabTac'); await page.waitForTimeout(200);
  check(/remplacements 1 \/ 5/.test(await page.textContent('#tvSubs')) && (await page.$$('#tvBench .ttok.gone')).length === 1, 'à la fin : 1 remplacement fait, le joueur sorti est grisé sur le banc');
  // limite : quatre de plus, puis un sixième refusé
  for (let k = 0; k < 4; k++) await drag('#tvBench .tdrop:not(:has(.gone)):not(:has(.leaving)) .ttok', '#tvPitch [data-tdrop="p' + (5 + k) + '"]');
  check(/remplacements 5 \/ 5/.test(await page.textContent('#tvSubs')), 'cinq remplacements préparés', await page.textContent('#tvSubs'));
  const benchLeft = await page.$$('#tvBench .tdrop:not(:has(.gone)):not(:has(.leaving)) .ttok');
  if (benchLeft.length) { await drag('#tvBench .tdrop:not(:has(.gone)):not(:has(.leaving)) .ttok', '#tvPitch [data-tdrop="p10"]'); check(/Plus de remplacement possible/.test(await page.textContent('#tvPending')), 'un sixième est refusé', await page.textContent('#tvPending')); }
  else check(true, 'plus de remplaçant disponible (le sixième ne peut pas être tenté)');
  await page.click('#tvReset');

  console.log('Adversaire et mode Coach It');
  await page.selectOption('#duration', '5400'); await page.click('#tabMatch'); await page.click('#kick'); await ready();
  await seek(5399); await page.waitForTimeout(400);
  const nR = ((await page.textContent('#log')).match(/Remplacement des Rouges/g) || []).length;
  check(nR >= 1 && nR <= 5, 'sur 90 minutes, l\'adversaire fait ses remplacements tout seul', nR + ' remplacements des Rouges');
  await page.click('[data-mode="coach"]'); await page.waitForTimeout(300);
  await page.click('#kick'); await ready(); await page.click('#play').catch(() => {}); await page.waitForTimeout(200);
  await page.click('#tabTac'); await page.waitForTimeout(200);
  check(!(await page.isVisible('#tvTeams')), 'mode Coach It : seulement votre équipe dans l\'onglet Tactique');
  await drag('#tvBench .tdrop:not(:has(.gone)):not(:has(.leaving)) .ttok', '#tvPitch [data-tdrop="p8"]'); await page.click('#tvApply'); await ready();
  check(/En attente du prochain arrêt de jeu/.test(await page.textContent('#tvPending')), 'mode Coach It : remplacement demandé au direct, en attente', (await page.textContent('#tvPending')).replace(/\s+/g, ' '));

  console.log('Téléphone (390 × 844)');
  const pp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  pp.on('pageerror', e => errors.push(String(e)));
  await pp.goto(url); await pp.waitForTimeout(400); await pp.click('#tabTac'); await pp.waitForTimeout(200);
  check(await pp.evaluate('document.documentElement.scrollWidth <= window.innerWidth') && (await pp.$$('#tvPitch .ttok')).length === 11, 'onglet Tactique sur téléphone : pas de défilement de côté');
  await pp.tap('#tvPitch [data-tdrop="p2"] .ttok .ball'); await pp.tap('#tvSwap'); await pp.tap('#tvPitch [data-tdrop="p3"] .ttok .ball');
  check(/→/.test(await pp.textContent('#tvDraft')), 'au doigt : « Échanger ce joueur » puis toucher l\'autre', (await pp.textContent('#tvDraft')).replace(/\s+/g, ' '));
  await pp.screenshot({ path: path.join(DOCS, 'tactique-telephone.png'), fullPage: true }); console.log('        capture : docs/tactique-telephone.png');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
