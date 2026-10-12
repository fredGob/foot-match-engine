// Teste les temps forts (lecture accélérée des temps faibles) et la carte de fin de match dans un vrai navigateur
// (Chromium sans fenêtre, par Playwright). Captures : docs/fin-de-match.png (la carte seule), docs/fin-de-match-page.png, docs/fin-telephone.png.
// Usage : node build.js && node tools/fin.js
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const EQ = require(path.join(ROOT, 'equipes.json')).equipes;
const fails = [], errors = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const lens = Object.assign({}, EQ.find(T => T.id === 'lens'), { formation: '442', consignes: {} });
const url = 'file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: lens, adversaire: 'marseille' }));
const secs = s => { const m = /^(\d+):(\d+)/.exec(s); return 60 * +m[1] + +m[2]; };

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => errors.push(String(e)));
  const seek = t => page.evaluate(t => { const r = document.getElementById('time'); r.value = t; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }, t);
  const ready = () => page.waitForFunction(() => !document.getElementById('time').disabled && document.getElementById('busy').hidden, null, { timeout: 60000 });
  await page.goto(url); await page.waitForTimeout(400);
  await page.fill('#seed', '12'); await page.click('#load'); await page.waitForTimeout(200);

  console.log('Temps forts');
  check(await page.isChecked('#hl'), 'la case « Accélérer les temps faibles » est cochée par défaut');
  await page.click('#kick'); await ready();
  const bands = (await page.$$('#hlBands i')).length;
  check(bands > 30, 'les temps forts sont dessinés sur la barre de temps', bands + ' temps forts');
  // vitesse ×1 : en temps faible l'horloge file à ×8, en temps fort elle avance normalement
  const pace = async want => {
    await page.waitForFunction(w => document.getElementById('ff').hidden === !w && !document.querySelector('.stage').classList.contains('x'), want, { timeout: 60000 });
    await page.waitForTimeout(700);
    if (await page.isHidden('#ff') === want) return null;
    const a = secs(await page.textContent('#clock')), D0 = await page.evaluate(() => 0); await page.waitForTimeout(2000);
    return (secs(await page.textContent('#clock')) - a) / 2;
  };
  const weak = await pace(true);
  check(weak != null && weak >= 5, 'temps faible : la lecture va environ 8 fois plus vite, et le repère « ⏩ » s\'affiche', weak + ' s de match par seconde');
  const strong = await pace(false);
  check(strong != null && strong <= 3, 'temps fort : retour à la vitesse choisie (×1)', strong + ' s de match par seconde (arrêts de jeu ×6 compris)');
  await page.uncheck('#hl'); await page.waitForTimeout(400);
  check(await page.isHidden('#ff'), 'case décochée : plus d\'accéléré, plus de repère');
  await page.check('#hl');

  console.log('Carte de fin de match');
  await seek(5400); await page.waitForTimeout(600);
  check(await page.isVisible('#end') && await page.isVisible('#card'), 'à la fin du match, la carte s\'affiche');
  const filled = await page.evaluate(() => { const c = document.getElementById('card'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 200) n++; return n; });
  check(filled > 200, 'la carte est dessinée (score, courbe, chiffres, homme du match)', filled + ' points clairs');
  await (await page.$('#card')).screenshot({ path: path.join(DOCS, 'fin-de-match.png') }); console.log('        capture : docs/fin-de-match.png');
  await page.screenshot({ path: path.join(DOCS, 'fin-de-match-page.png') }); console.log('        capture : docs/fin-de-match-page.png');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#saveCard')]);
  const file = path.join(require('os').tmpdir(), dl.suggestedFilename()); await dl.saveAs(file);
  const head = fs.readFileSync(file).slice(0, 8).toString('hex');
  check(/^match-lens-marseille-12\.png$/.test(dl.suggestedFilename()) && head === '89504e470d0a1a0a' && fs.statSync(file).size > 30000, '« Enregistrer l\'image » télécharge une image PNG', dl.suggestedFilename() + ', ' + Math.round(fs.statSync(file).size / 1024) + ' ko');
  await page.click('#rewatch'); await page.waitForTimeout(300);
  check(await page.isHidden('#end'), '« Revoir depuis le début » ferme la carte');

  console.log('Téléphone (390 × 844)');
  const pp = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  pp.on('pageerror', e => errors.push(String(e)));
  await pp.goto(url); await pp.waitForTimeout(300);
  await pp.selectOption('#duration', '600'); await pp.waitForTimeout(200); await pp.click('#kick');
  await pp.waitForFunction(() => !document.getElementById('time').disabled, null, { timeout: 60000 });
  await pp.evaluate(() => { const r = document.getElementById('time'); r.value = 600; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); }); await pp.waitForTimeout(500);
  check(await pp.isVisible('#card') && await pp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'sur téléphone : la carte s\'affiche, pas de défilement de côté');
  await pp.screenshot({ path: path.join(DOCS, 'fin-telephone.png') }); console.log('        capture : docs/fin-telephone.png');

  check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' échec(s)' : 'Tout est bon.');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
