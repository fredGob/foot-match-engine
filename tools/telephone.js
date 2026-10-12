// Teste la page de match sur téléphone (Chromium sans fenêtre, par Playwright, écran tactile) : message « Tournez votre téléphone »
// en vertical ; en largeur, mode Coach It, terrain à gauche et colonne de commandes à droite, lecture, joueur touché, écran Tactique
// en plein écran (« Valider » ramène au match, qui reprend), statistiques, carte de fin. Petit téléphone (667 × 375) aussi.
// Captures : docs/telephone-avant.png, docs/telephone-match.png, docs/telephone-tactique.png, docs/telephone-fin.png, docs/telephone-vertical.png.
// Usage : node build.js && node tools/telephone.js
const path = require('path');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const EQ = require(path.join(ROOT, 'equipes.json')).equipes;
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const lens = Object.assign({}, EQ.find(T => T.id === 'lens'), { formation: '442', consignes: {} });
const url = 'file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: lens, adversaire: 'marseille' }));
const phone = (browser, w, h) => browser.newContext({ viewport: { width: w, height: h }, screen: { width: Math.min(w, h), height: Math.max(w, h) }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await phone(browser, 390, 844), page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  const box = async sel => (await page.$(sel)).boundingBox();
  const ready = () => page.waitForFunction(() => !document.getElementById('time').disabled && document.getElementById('busy').hidden, null, { timeout: 60000 });
  const noSide = () => page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');

  console.log('Téléphone droit (390 × 844)');
  await page.goto(url); await page.waitForTimeout(400);
  check(await page.isVisible('#rotate') && /Tournez/.test(await page.textContent('#rotate')), 'message « Tournez votre téléphone »');
  await page.screenshot({ path: path.join(DOCS, 'telephone-vertical.png') }); console.log('        capture : docs/telephone-vertical.png');

  console.log('Téléphone couché (844 × 390)');
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(400);
  check(await page.isHidden('#rotate'), 'en largeur, le message disparaît');
  check(await page.evaluate('document.body.classList.contains("phone") && document.body.classList.contains("coach")') && await page.isHidden('[data-mode="god"]'), 'mode Coach It d\'office, pas de choix de mode');
  const pb = await box('#pitch'), cb = await box('#ppanel');
  check(pb.height >= 385 && pb.x === 0 && Math.abs(pb.x + pb.width - cb.x) < 2 && cb.x + cb.width <= 845, 'terrain à gauche sur toute la hauteur, colonne de commandes à droite', Math.round(pb.width) + ' × ' + Math.round(pb.height) + ' + colonne ' + Math.round(cb.width));
  check(await noSide(), 'pas de défilement de côté');
  check(await page.isVisible('#kick') && await page.isVisible('#preTac'), 'avant-match : « Régler la tactique » et « Lancer le match » sur le terrain');
  await page.screenshot({ path: path.join(DOCS, 'telephone-avant.png') }); console.log('        capture : docs/telephone-avant.png');
  await page.selectOption('#duration', '600').catch(() => page.evaluate(() => { const d = document.getElementById('duration'); d.value = '600'; d.dispatchEvent(new Event('change')); }));
  await page.waitForTimeout(200);
  await page.tap('#kick'); await ready(); await page.waitForTimeout(2500);
  const c1 = await page.textContent('#clock');
  check(!/^00:00/.test(c1) && await page.textContent('#play') === 'Pause', 'au toucher, le match se lance et se lit', c1);
  // toucher un joueur : sa fiche dans la colonne
  for (let x = 40; x < 580 && /Cliquez/.test(await page.textContent('#player')); x += 30) for (let y = 30; y < 370 && /Cliquez/.test(await page.textContent('#player')); y += 30) await page.mouse.click(x, y);
  check(!/Cliquez/.test(await page.textContent('#player')), 'toucher un joueur affiche sa fiche dans la colonne', (await page.textContent('#player')).replace(/\s+/g, ' ').slice(0, 60));
  await page.screenshot({ path: path.join(DOCS, 'telephone-match.png') }); console.log('        capture : docs/telephone-match.png');

  console.log('Tactique en plein écran');
  await page.tap('#tabTac'); await page.waitForTimeout(300);
  const tb = await box('#tacView');
  check(tb.x === 0 && tb.y === 0 && tb.width >= 840 && await page.textContent('#play') === 'Lecture', '« Tactique » met en pause et ouvre l\'écran Tactique en plein écran', Math.round(tb.width) + ' × ' + Math.round(tb.height));
  check((await page.$$('#tvPitch .ttok')).length === 11 && await page.isHidden('#tvTeams') && await page.isVisible('#tvBack'), 'onze joueurs, votre équipe seulement, bouton « Retour au match »');
  await page.selectOption('#tvTac select[data-tv-key="press"]', '1'); await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(DOCS, 'telephone-tactique.png') }); console.log('        capture : docs/telephone-tactique.png');
  await page.tap('#tvApply'); await ready(); await page.waitForTimeout(400);
  check(await page.isHidden('#tacView') && await page.textContent('#play') === 'Pause', '« Valider » ramène au match, qui reprend');
  await page.waitForTimeout(400); await page.tap('#tabTac'); await page.waitForTimeout(200);
  check(/pressing/.test(await page.textContent('#tvPending')) || /harceler/i.test(await page.inputValue('#tvTac select[data-tv-key="press"]').then(v => v === '1' ? 'harceler' : '')), 'la consigne est en attente ou en place', (await page.textContent('#tvPending')).replace(/\s+/g, ' '));
  await page.tap('#tvBack'); await page.waitForTimeout(300);
  check(await page.isHidden('#tacView') && await page.textContent('#play') === 'Pause', '« Retour au match » : le match reprend');

  console.log('Statistiques et fin du match');
  await page.tap('#tabStats'); await page.waitForTimeout(300);
  check(await page.isVisible('#numbers') && (await page.$$('#stats tr')).length > 10, '« Stats » : le tableau des chiffres à la place du terrain');
  await page.tap('#tabMatch'); await page.waitForTimeout(200);
  await page.evaluate(() => { const r = document.getElementById('time'); r.value = 600; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
  // Coach It : pas au-delà du direct ; on laisse la lecture filer jusqu'au bout
  await page.tap('[data-speed="4"]');
  await page.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 240000 });
  const eb = await box('#card');
  check(eb.width > 400 && eb.y >= 0 && eb.y + eb.height <= 390, 'carte de fin de match en entier sur l\'écran', Math.round(eb.width) + ' × ' + Math.round(eb.height));
  await page.screenshot({ path: path.join(DOCS, 'telephone-fin.png') }); console.log('        capture : docs/telephone-fin.png');

  console.log('Petit téléphone couché (667 × 375)');
  const small = await (await phone(browser, 667, 375)).newPage(); small.on('pageerror', e => errors.push(String(e)));
  await small.goto(url); await small.waitForTimeout(400);
  const sp = await (await small.$('#pitch')).boundingBox();
  check(await small.evaluate('document.documentElement.scrollWidth <= window.innerWidth') && sp.height >= 370 && sp.width >= 400, 'terrain et colonne tiennent, sans défilement de côté', Math.round(sp.width) + ' × ' + Math.round(sp.height));
  await small.tap('#preTac'); await small.waitForTimeout(300);
  check((await (await small.$('#tacView')).boundingBox()).width >= 660 && await small.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'écran Tactique en plein écran');

  console.log('Ordinateur');
  const desk = await browser.newPage({ viewport: { width: 1400, height: 900 } }); desk.on('pageerror', e => errors.push(String(e)));
  await desk.goto(url); await desk.waitForTimeout(400);
  check(!(await desk.evaluate('document.body.classList.contains("phone")')) && await desk.isVisible('[data-mode="god"]') && await desk.isVisible('aside'), 'sur ordinateur, rien ne change (mode God, colonne de droite)');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
