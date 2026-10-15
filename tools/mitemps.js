// Teste la mi-temps dans un vrai navigateur (Chromium sans fenêtre, par Playwright) : le match s'arrête à la mi-temps
// sur l'écran Tactique, un changement validé se fait au coup d'envoi de la seconde période, « Reprendre » relance le match,
// et revoir la mi-temps ne s'y arrête plus. Capture : docs/mi-temps.png. Usage : node build.js && node tools/mitemps.js
const path = require('path');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const EQ = require(path.join(ROOT, 'equipes.json')).equipes;
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const lens = Object.assign({}, EQ.find(T => T.id === 'lens'));
const url = 'file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: lens, adversaire: 'marseille' }));
const secs = s => { const m = /^(\d+):(\d+)/.exec(s); return 60 * +m[1] + +m[2]; };

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => errors.push(String(e)));
  const seek = t => page.evaluate(t => { const r = document.getElementById('time'); r.value = t; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }, t);
  await page.goto(url); await page.waitForTimeout(400);
  await page.selectOption('#duration', '600'); await page.waitForTimeout(200);
  await page.click('[data-mode="coach"]');
  await page.click('#kick');
  await page.waitForFunction(() => !document.getElementById('time').disabled && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await page.click('[data-speed="2"]');
  await page.evaluate(() => { document.getElementById('hl').checked = true; });

  console.log('Arrivée à la mi-temps (Coach It, match de 10 minutes)');
  await page.waitForFunction(() => !document.getElementById('tacView').hidden, null, { timeout: 240000 });
  const t = secs(await page.textContent('#clock'));
  check(t === 300, 'le match s\'arrête à la mi-temps', 'horloge ' + (await page.textContent('#clock')));
  check(await page.isVisible('#tvHalf'), 'l\'écran Tactique s\'ouvre avec le cadre « Mi-temps »', (await page.textContent('#halfText')).slice(0, 80));
  check(/Mi-temps/.test(await page.textContent('#log')), 'le fil du match note la mi-temps');
  await page.waitForTimeout(1500);
  check(secs(await page.textContent('#clock')) === 300, 'le match reste à l\'arrêt');
  await page.screenshot({ path: path.join(DOCS, 'mi-temps.png') }); console.log('        capture : docs/mi-temps.png');

  console.log('Changement au vestiaire');
  const cur = await page.$eval('[data-tv-form].on', b => b.dataset.tvForm), other = cur === '433' ? '442' : '433';
  await page.click('[data-tv-form="' + other + '"]'); await page.click('#tvApply'); await page.waitForTimeout(300);
  await page.click('#halfGo');
  check(await page.isHidden('#tacView') && await page.isHidden('#tvHalf'), '« Reprendre la seconde période » ramène au match');
  await page.waitForFunction(() => /Formation des Bleus/.test(document.getElementById('log').textContent), null, { timeout: 60000 });
  const line = await page.$$eval('#log div', ds => (ds.find(d => /Formation des Bleus/.test(d.textContent)) || {}).textContent || '');
  check(secs(line) >= 300 && secs(line) <= 303, 'la formation change au coup d\'envoi de la seconde période', line);
  await page.waitForTimeout(1500);
  check(secs(await page.textContent('#clock')) > 303, 'le match a repris');

  console.log('Revoir la mi-temps');
  await seek(290); await page.waitForTimeout(300);
  if (await page.textContent('#play') !== 'Pause') await page.click('#play');
  await page.waitForFunction(() => { const m = /^(\d+):(\d+)/.exec(document.getElementById('clock').textContent); return 60 * +m[1] + +m[2] >= 306; }, null, { timeout: 60000 });
  check(await page.isHidden('#tacView'), 'en revoyant une action, la mi-temps ne s\'arrête plus');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})();
