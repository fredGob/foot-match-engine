// Teste la vue 3D de la page de match (Chromium sans fenêtre, par Playwright) : bouton 2D / 3D, chargement de three.js,
// match dessiné par la caméra télé, chrono, joueur choisi au clic, retour en 2D, choix retenu, onglet Statistiques, téléphone,
// et le cas sans internet (message, retour en 2D).
// Usage : node build.js && node tools/vue3d.js        Captures : docs/vue-3d.png, docs/vue-3d-telephone.png.
// three.js est servi au navigateur depuis une copie locale (téléchargée une fois dans tools/node_modules/.cache).
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs'), url = 'file://' + path.join(ROOT, 'match.html');
const R3 = require(path.join(ROOT, 'render3d.js')), LIBF = path.join(__dirname, 'node_modules', '.cache', 'three-r128.min.js');
if (!fs.existsSync(LIBF)) { fs.mkdirSync(path.dirname(LIBF), { recursive: true }); execFileSync('curl', ['-sS', '-o', LIBF, R3.LIB]); }
// les joueurs animés (players3d.js) : chargeur, outil de copie des squelettes et mannequin, servis aussi depuis une copie locale
const P3 = require(path.join(ROOT, 'players3d.js')), P3F = P3.LIBS.concat(P3.MODEL).map(u => [u, path.join(path.dirname(LIBF), path.basename(u))]);
for (const [u, f] of P3F) if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '-o', f, u]);
let fails = 0; const check = (ok, what, info) => { if (!ok) fails++; console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (info ? ' — ' + info : '')); };

(async () => {
  const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  // model = false : sans le mannequin animé (joueurs faits main). Ici, sans carte graphique, 22 corps animés ne font qu'une image par seconde :
// les longs parcours se font donc avec les joueurs faits main, et un essai court vérifie les joueurs animés.
const serve = async (ctx, model = true) => { await ctx.route(R3.LIB, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(LIBF) })); for (const [u, f] of P3F) await ctx.route(u, r => !model && /\.glb$/.test(u) ? r.abort() : r.fulfill({ status: 200, contentType: /\.glb$/.test(u) ? 'model/gltf-binary' : 'application/javascript', body: fs.readFileSync(f) })); };

  console.log('Ordinateur');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); await serve(ctx);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url); await page.evaluate(() => localStorage.removeItem('vue')); await page.reload(); await page.waitForTimeout(300);
  check(await page.isVisible('[data-view="3d"]') && await page.isHidden('#pitch3d'), 'bouton 2D / 3D ; vue de dessus au départ');
  await page.click('[data-view="3d"]');
  await page.waitForFunction(() => document.body.dataset.vue3d === 'prete' || document.body.dataset.vue3d === 'erreur', null, { timeout: 60000 });
  check(await page.evaluate(() => document.body.dataset.vue3d) === 'prete', 'three.js chargé, scène 3D créée');
  check(await page.evaluate(() => document.body.dataset.joueurs3d) === 'animes', 'joueurs animés avec de vrais mouvements (mannequin chargé)');
  await page.click('#kick'); await page.waitForTimeout(3500);
  const pb = await (await page.$('#pitch3d')).boundingBox(), cb = await (await page.$('#pitch')).boundingBox();
  check(await page.isVisible('#pitch3d') && Math.abs(pb.width - cb.width) < 2 && Math.abs(pb.height - cb.height) < 2, 'la vue 3D prend la place du terrain', Math.round(pb.width) + ' × ' + Math.round(pb.height));
  check(/^\d\d:\d\d/.test(await page.textContent('#clock3d')) && /Pause/.test(await page.textContent('#play')), 'chrono en surimpression, le match se lit', await page.textContent('#clock3d'));
  await page.screenshot({ path: path.join(DOCS, 'vue-3d.png') }); console.log('        capture : docs/vue-3d.png');
  // l'image n'est pas vide : on compte les couleurs différentes au centre du terrain
  const png = (await (await page.$('#pitch3d')).screenshot()).toString('base64');
  const colors = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const k = document.createElement('canvas'); k.width = 200; k.height = 120; const g = k.getContext('2d'); g.drawImage(img, 0, 0, 200, 120); const d = g.getImageData(0, 0, 200, 120).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return s.size; }, png);
  check(colors > 12, 'la scène est dessinée (pelouse, joueurs, tribunes)', colors + ' teintes');
  // clic sur un joueur : on balaie le terrain jusqu'à toucher quelqu'un
  await page.click('#play'); await page.waitForTimeout(200);
  let hit = false;
  for (let y = pb.y + pb.height * 0.3; y < pb.y + pb.height * 0.95 && !hit; y += 14) for (let x = pb.x + 20; x < pb.x + pb.width - 20 && !hit; x += 14) { await page.mouse.click(x, y); await page.waitForTimeout(30); hit = await page.isVisible('#label3d'); }
  check(hit && !/Cliquez/.test(await page.textContent('#player')), 'clic sur un joueur : anneau jaune, nom au-dessus de lui, fiche à droite', hit ? await page.textContent('#label3d') : '');
  await page.click('#tabStats'); await page.waitForTimeout(200);
  check(await page.isHidden('#pitch3d') && await page.isVisible('#numbers'), 'onglet Statistiques : les chiffres, sans la 3D');
  await page.click('#tabMatch'); await page.waitForTimeout(200);
  await page.click('[data-view="2d"]'); await page.waitForTimeout(200);
  check(await page.isHidden('#pitch3d') && await page.isHidden('#clock3d'), 'retour à la vue de dessus');
  await page.click('[data-view="3d"]'); await page.waitForTimeout(100);
  await page.reload(); await page.waitForTimeout(300);
  await page.waitForFunction(() => document.body.dataset.vue3d === 'prete', null, { timeout: 60000 });
  check(await page.evaluate(() => document.querySelector('[data-view="3d"]').classList.contains('on')), 'la vue 3D est retenue d\'une fois sur l\'autre');

  console.log('Téléphone couché (844 × 390)');
  const tel = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await serve(tel, false);
  const ph = await tel.newPage(); ph.on('pageerror', e => errors.push(String(e)));
  await ph.goto(url); await ph.evaluate(() => { localStorage.setItem('vue', '3d'); localStorage.removeItem('menuFerme'); }); await ph.reload();
  await ph.waitForFunction(() => document.body.dataset.vue3d === 'prete', null, { timeout: 60000 });
  check(await ph.isVisible('#ppanel #views'), 'boutons 2D / 3D dans la colonne');
  await ph.tap('#kick'); await ph.waitForTimeout(3000);
  check(await ph.isVisible('#pitch3d') && await ph.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'match en 3D, sans défilement de côté');
  await ph.screenshot({ path: path.join(DOCS, 'vue-3d-telephone.png') }); console.log('        capture : docs/vue-3d-telephone.png');
  await ph.tap('#pclose'); await ph.waitForTimeout(300);
  check(await ph.textContent('#miniView') === '2D', 'menu fermé : bouton flottant « 2D » pour revenir à la vue de dessus');
  await ph.tap('#miniView'); await ph.waitForTimeout(300);
  check(await ph.isHidden('#pitch3d') && await ph.textContent('#miniView') === '3D', 'il bascule bien');

  console.log('Sans internet');
  const off = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await off.route(R3.LIB, r => r.abort());
  const op = await off.newPage(); op.on('pageerror', e => errors.push(String(e)));
  await op.goto(url); await op.click('[data-view="3d"]');
  await op.waitForFunction(() => document.body.dataset.vue3d === 'erreur', null, { timeout: 60000 });
  check(await op.evaluate(() => document.querySelector('[data-view="2d"]').classList.contains('on')) && /internet/.test(await op.textContent('#player')), 'message clair, on reste en vue de dessus', await op.textContent('#player'));

  console.log('Sans le mannequin (seulement three.js)');
  const nom = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await nom.route(R3.LIB, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(LIBF) }));
  await nom.route(P3.MODEL, r => r.abort());
  const np = await nom.newPage(); np.on('pageerror', e => errors.push(String(e)));
  await np.goto(url); await np.evaluate(() => localStorage.removeItem('vue')); await np.reload(); await np.click('[data-view="3d"]');
  await np.waitForFunction(() => document.body.dataset.vue3d === 'prete' || document.body.dataset.vue3d === 'erreur', null, { timeout: 30000 });
  await np.click('#kick'); await np.waitForTimeout(1500);
  check(await np.evaluate(() => document.body.dataset.vue3d) === 'prete' && await np.evaluate(() => document.body.dataset.joueurs3d) === 'simples' && await np.isVisible('#pitch3d'), 'mannequin introuvable : la 3D marche quand même, avec les joueurs faits main');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails ? fails + ' échec(s)' : 'Tout est bon.');
  process.exit(fails ? 1 : 0);
})();
