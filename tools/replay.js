// Teste le replay 3D des buts (n° 125) dans Chromium sans fenêtre (Playwright) : replay automatique après un but, bandeau,
// deux caméras (télé ralentie puis buteur), retour au match, « ▶ Revoir » dans le fil du match, boutons sous la carte de fin, « Passer », téléphone.
// Usage : node build.js && node tools/replay.js        Captures : docs/replay-tele.png, docs/replay-buteur.png, docs/replay-telephone.png.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs'), url = 'file://' + path.join(ROOT, 'match.html');
const R3 = require(path.join(ROOT, 'render3d.js')), LIBF = path.join(__dirname, 'node_modules', '.cache', 'three-r128.min.js');
if (!fs.existsSync(LIBF)) { fs.mkdirSync(path.dirname(LIBF), { recursive: true }); execFileSync('curl', ['-sS', '-o', LIBF, R3.LIB]); }
// les joueurs animés (players3d.js) : chargeur, outil de copie des squelettes et mannequin, servis aussi depuis une copie locale
const P3 = require(path.join(ROOT, 'players3d.js')), P3F = P3.LIBS.concat(P3.MODEL).map(u => [u, path.join(path.dirname(LIBF), path.basename(u))]);
for (const [u, f] of P3F) if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '-o', f, u]);
let fails = 0; const check = (ok, what, info) => { if (!ok) fails++; console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (info ? ' — ' + info : '')); };
const SEED = 22;      // équipes standard, 10 minutes : un but à 0:51

(async () => {
  const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  // model = false : sans le mannequin animé (joueurs faits main). Ici, sans carte graphique, 22 corps animés ne font qu'une image par seconde :
// les longs parcours se font donc avec les joueurs faits main, et un essai court vérifie les joueurs animés.
const serve = async (ctx, model = true) => { await ctx.route(R3.LIB, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(LIBF) })); for (const [u, f] of P3F) await ctx.route(u, r => !model && /\.glb$/.test(u) ? r.abort() : r.fulfill({ status: 200, contentType: /\.glb$/.test(u) ? 'model/gltf-binary' : 'application/javascript', body: fs.readFileSync(f) })); };
  const state = p => p.evaluate(() => document.body.dataset.replay || '');
  const colors = async p => {
    const png = (await (await p.$('#replayCv')).screenshot()).toString('base64');
    return p.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const k = document.createElement('canvas'); k.width = 240; k.height = 135; const g = k.getContext('2d'); g.drawImage(img, 0, 0, 240, 135); const d = g.getImageData(0, 0, 240, 135).data, s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return s.size; }, png);
  };
  const start = async p => {
    await p.goto(url); await p.waitForTimeout(300);
    await p.evaluate(s => { const d = document.getElementById('duration'); d.value = '600'; d.dispatchEvent(new Event('change')); document.getElementById('seed').value = s; document.getElementById('load').click(); }, SEED);
    await p.waitForTimeout(200);
  };

  console.log('Ordinateur');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } }); await serve(ctx, false);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await start(page);
  check(await page.isChecked('#rpAuto'), 'case « Replay des buts » cochée par défaut');
  await page.click('#kick'); await page.click('[data-speed="2"]');
  await page.waitForFunction(() => document.body.dataset.replay === 'tele', null, { timeout: 90000 });
  check(await page.isVisible('#replay') && /Pause/.test(await page.textContent('#play')) === false, 'après le but, le match se met en pause et le replay part');
  await page.waitForTimeout(2500);
  const who = await page.textContent('#rpWho'), sc = await page.textContent('#rpScore');
  check(await page.isVisible('.rpTag') && /^n°\d+ .+ · \d+'$/.test(who) && /\d – \d/.test(sc), 'bandeau télé : REPLAY, buteur, minute, score', who + ' · ' + sc);
  const c1 = await colors(page);
  check(c1 > 40, 'la scène est dessinée (pelouse, joueurs, tribunes, filet)', c1 + ' teintes');
  await page.screenshot({ path: path.join(DOCS, 'replay-tele.png') }); console.log('        capture : docs/replay-tele.png');
  await page.waitForFunction(() => document.body.dataset.replay === 'buteur', null, { timeout: 90000 });
  check(true, 'deuxième caméra : derrière le buteur');
  await page.waitForTimeout(3200);
  await page.screenshot({ path: path.join(DOCS, 'replay-buteur.png') }); console.log('        capture : docs/replay-buteur.png');
  await page.waitForFunction(() => document.getElementById('replay').hidden, null, { timeout: 120000 });
  await page.waitForTimeout(300);
  check(/Pause/.test(await page.textContent('#play')), 'fin du replay : le match reprend tout seul');
  await page.click('#play'); await page.waitForTimeout(200);
  const btn = await page.$('#log .rpBtn');
  check(!!btn, 'bouton « ▶ Revoir » à côté du but dans le fil du match');
  if (btn) {
    await btn.click(); await page.waitForFunction(() => document.body.dataset.replay === 'tele', null, { timeout: 20000 });
    await page.waitForTimeout(800); await page.click('#rpSkip'); await page.waitForTimeout(300);
    check(await page.isHidden('#replay') && /Lecture/.test(await page.textContent('#play')), '« Revoir » puis « Passer » : retour au match, toujours en pause');
  }
  await page.click('#finish'); await page.waitForFunction(() => !document.getElementById('end').hidden, null, { timeout: 60000 });
  const n = (await page.$$('#endGoals button')).length;
  check(n >= 1, 'carte de fin : un bouton par but pour revoir son replay', n + ' bouton(s)');
  await page.click('#endGoals button'); await page.waitForFunction(() => document.body.dataset.replay === 'tele', null, { timeout: 20000 });
  check(await page.isVisible('#replay'), 'le replay s\'ouvre depuis la carte de fin');
  await page.click('#rpSkip'); await page.waitForTimeout(300);
  check(await page.isHidden('#replay') && await page.isVisible('#end'), '« Passer » ramène à la carte de fin');

  console.log('Replay décoché');
  await start(page); await page.uncheck('#rpAuto');
  await page.click('#kick'); await page.click('[data-speed="2"]');
  await page.waitForFunction(() => /^0[1-9]:/.test(document.getElementById('clock').textContent), null, { timeout: 90000 });
  check(await page.isHidden('#replay') && /Pause/.test(await page.textContent('#play')), 'case décochée : pas de replay automatique, le match continue');
  await page.check('#rpAuto');

  console.log('Téléphone couché (844 × 390)');
  const tel = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await serve(tel, false);
  const ph = await tel.newPage(); ph.on('pageerror', e => errors.push(String(e)));
  await ph.goto(url); await ph.evaluate(() => { localStorage.setItem('menuFerme', '1'); localStorage.removeItem('vue'); }); await start(ph);
  if (await ph.isVisible('#tacView')) await ph.tap('#tvBack');      // la tactique s'ouvre d'abord : « ▶ Jouer »
  await ph.tap('#kick'); await ph.evaluate(() => document.querySelector('[data-speed="2"]').click());
  await ph.waitForFunction(() => document.body.dataset.replay === 'tele', null, { timeout: 120000 });
  await ph.waitForTimeout(2500);
  const rb = await (await ph.$('#replay')).boundingBox();
  check(rb.width > 600 && rb.height > 380 && await ph.isHidden('#pmini'), 'replay sur tout le terrain, sans les boutons flottants', Math.round(rb.width) + ' × ' + Math.round(rb.height));
  await ph.screenshot({ path: path.join(DOCS, 'replay-telephone.png') }); console.log('        capture : docs/replay-telephone.png');
  await ph.tap('#rpSkip'); await ph.waitForTimeout(400);
  check(await ph.isHidden('#replay') && await ph.isVisible('#pmini'), '« Passer » au doigt : retour au match');

  console.log('Replay avec les joueurs animés (vrais mouvements, n° 129)');
  const an = await browser.newContext({ viewport: { width: 1200, height: 700 } }); await serve(an, true);
  const ap = await an.newPage(); ap.on('pageerror', e => errors.push(String(e)));
  await start(ap); await ap.click('#kick'); await ap.click('[data-speed="2"]');
  await ap.waitForFunction(() => document.body.dataset.replay === 'tele', null, { timeout: 120000 });
  await ap.waitForTimeout(4000);
  const ca = await colors(ap);
  check(await ap.evaluate(() => window.Players3D && Players3D.ready()) && ca > 40, 'le replay s\'affiche avec les joueurs animés', ca + ' teintes');
  await ap.screenshot({ path: path.join(DOCS, 'replay-anime.png') }); console.log('        capture : docs/replay-anime.png');
  await ap.click('#rpSkip');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails ? fails + ' échec(s)' : 'Tout est bon.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
