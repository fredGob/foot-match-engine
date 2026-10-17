// Gestes de foot du replay (n° 133) : photographie chaque touche d'une action de but, en gros plan sur le joueur, au moment du geste.
// Usage : node build.js && node tools/gestes.js [graine] [n° du but] [dossier] [tous]       (par défaut : graine 22, premier but, docs/gestes)
// Sortie : une image par touche (« 03-ctrl-n7.png »…) et une planche « planche.png » qui les rassemble.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..'), url = 'file://' + path.join(ROOT, 'match.html');
const R3 = require(path.join(ROOT, 'render3d.js')), LIBF = path.join(__dirname, 'node_modules', '.cache', 'three-r128.min.js');
if (!fs.existsSync(LIBF)) { fs.mkdirSync(path.dirname(LIBF), { recursive: true }); execFileSync('curl', ['-sS', '-o', LIBF, R3.LIB]); }
const P3 = require(path.join(ROOT, 'players3d.js')), P3F = P3.LIBS.concat(P3.MODEL).map(u => [u, path.join(path.dirname(LIBF), path.basename(u))]);
for (const [u, f] of P3F) if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '-o', f, u]);
const SEED = +(process.argv[2] || 22), K = +(process.argv[3] || 0), OUT = path.resolve(process.argv[4] || path.join(ROOT, 'docs', 'gestes'));
// à quel moment photographier chaque geste (secondes après la touche)
const WHEN = { pass: -0.08, lob: -0.08, clear: -0.08, shot: -0.06, punt: -0.06, throw: -0.3, ctrl: -0.04, head: -0.02, block: 0, tackle: 0.15, miss: 0.15, save: 0.1, catch: 0 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  await ctx.route(R3.LIB, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(LIBF) }));
  for (const [u, f] of P3F) await ctx.route(u, r => r.fulfill({ status: 200, contentType: /\.glb$/.test(u) ? 'model/gltf-binary' : 'application/javascript', body: fs.readFileSync(f) }));
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url); await page.waitForTimeout(300);
  await page.evaluate(s => { const d = document.getElementById('duration'); d.value = '5400'; d.dispatchEvent(new Event('change')); document.getElementById('seed').value = s; document.getElementById('load').click(); }, SEED);
  await page.waitForTimeout(200); await page.click('#instant');
  await page.waitForFunction(() => document.body.dataset.calcul === 'fini', null, { timeout: 120000 });
  await page.evaluate(() => new Promise(ok => window.MatchRender3D.load(() => window.Players3D.load(() => ok()))));
  const info = await page.evaluate(k => window.replayStill(k, 0, 'tele'), K);
  if (!info.touches) { console.log('pas de touches pour ce but'); process.exit(1); }
  let list = info.touches.filter(x => x[0] >= info.t0 - 0.5), fake = null;
  // « tous » (4e argument) : chaque geste joué tour à tour par le même joueur (le premier qui touche le ballon), pour les voir tous
  if (process.argv[5] === 'tous') {
    const [t, i] = list[0], G = [['pass', 0], ['lob', 0], ['shot', 0], ['punt', 0], ['throw', 0], ['ctrl', 0], ['ctrl', 0.8], ['ctrl', 1.3], ['head', 2.1], ['block', 0], ['tackle', 0], ['catch', 0.2], ['catch', 1.1], ['catch', 2.0]];
    list = G.map(([k, z]) => [t, i, k, z]); fake = true;
  }
  // « film:shot:0 » : un seul geste, en 8 images de 0,5 s avant à 0,6 s après la touche
  let offs = null;
  if (/^film:/.test(process.argv[5] || '')) {
    const [, k, z] = process.argv[5].split(':'), [t, i] = list[0];
    offs = [-0.5, -0.32, -0.18, -0.08, 0, 0.1, 0.3, 0.6]; list = offs.map(() => [t, i, k, +(z || 0)]); fake = true;
  }
  console.log(list.length + ' touches dans l\'action (but n° ' + K + ', graine ' + SEED + ')');
  const files = [];
  for (let j = 0; j < list.length; j++) {
    const [t, i, k, z] = list[j];
    await page.evaluate(([k, tt, i, tc]) => window.replayStill(k, tt, 'pres', i, true, tc), [K, t + (offs ? offs[j] : WHEN[k] || 0), i, fake ? [list[j]] : null]);
    await page.waitForTimeout(150);
    const f = path.join(OUT, String(j).padStart(2, '0') + '-' + k + '-j' + i + '.png');
    await (await page.$('#replayCv')).screenshot({ path: f }); files.push([f, k + ' (h ' + z + ' m)' + (offs ? ' ' + offs[j] + ' s' : '')]);
    console.log('  ' + t.toFixed(2) + ' s  joueur ' + i + '  ' + k + '  ballon à ' + z + ' m');
  }
  // planche : toutes les images côte à côte
  const html = '<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;width:1600px">' + files.map(([f, l]) => '<div style="width:' + (offs ? 400 : 300) + 'px;color:#fff;font:14px sans-serif"><img src="file://' + f + '" style="width:300px"><br>' + l + '</div>').join('') + '</body>';
  fs.writeFileSync(path.join(OUT, 'planche.html'), html);
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 1600, height: 300 }); await p2.goto('file://' + path.join(OUT, 'planche.html')); await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(OUT, 'planche.png'), fullPage: true });
  console.log(errors.length ? 'ERREURS : ' + errors.join(' | ') : 'aucune erreur JavaScript');
  await browser.close();
})();
