// Ouvre match.html dans un VRAI navigateur (Brave, sans fenêtre, profil jetable) et le pilote : lecture, glisser la barre de temps
// à la souris, clic sur un joueur, consignes, série de matchs. Prend des captures d'écran dans tools/.
// Usage : node tools/browser.js      (nécessite Brave installé par Flatpak ; aucune dépendance npm)
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 9333, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'match-engine-'));
const browser = spawn('flatpak', ['run', '--filesystem=' + ROOT + ':ro', '--filesystem=' + tmp, 'com.brave.Browser', '--headless=new', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + tmp, '--window-size=1500,1100', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [], fails = [];
const check = (ok, what, detail) => { console.log((ok ? '  ok    ' : '  ÉCHEC ') + what + (detail ? ' — ' + detail : '')); if (!ok) fails.push(what); };
const stop = code => { try { browser.kill(); } catch (e) {} setTimeout(() => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); }, 800); };

(async () => {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await wait(500); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch (e) {} }
  if (!target) { console.log('Impossible de joindre le navigateur (Brave par Flatpak est-il installé ?)'); return stop(2); }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pending = new Map();
  ws.onmessage = e => { const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result || msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params) => new Promise(r => { pending.set(++seq, r); ws.send(JSON.stringify({ id: seq, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result ? r.result.value : undefined; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, name), Buffer.from(r.data, 'base64')); console.log('        capture : tools/' + name); };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const txt = id => ev(`document.getElementById('${id}').textContent`);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file://' + path.join(ROOT, 'match.html') }); await wait(1500);
  console.log('Navigateur : ' + (await ev('navigator.userAgent')).replace(/.*(Chrome\/[\d.]+).*/, '$1') + ' (Brave)');

  console.log('Avant-match');
  await wait(1200);
  check(/^00:00 \/ 90:00/.test(await txt('clock')) && (await txt('play')) === 'Lancer le match', 'à l\'ouverture : 90 minutes, à l\'arrêt, bouton « Lancer le match »', await txt('clock'));
  await shot('navigateur-0-avant-match.png');
  await ev(`(() => { const s = document.getElementById('duration'); s.value = '600'; s.dispatchEvent(new Event('change')); document.getElementById('seed').value = 7; document.getElementById('load').click(); })()`); await wait(300);

  console.log('Lecture');
  await ev(`document.getElementById('kick').click()`); await wait(300);
  const c0 = await txt('clock'); await wait(2000); const c1 = await txt('clock');
  check(c0 !== c1 && /^00:0[1-6]/.test(c1), 'après « Lancer le match », le match se lit à vitesse réelle', c0 + ' → ' + c1 + ' en 2 secondes');
  await ev(`document.querySelector('[data-speed="8"]').click()`); await wait(1500);
  check(/^00:[1-5]/.test(await txt('clock')), 'vitesse ×8', await txt('clock'));

  console.log('Barre de temps, à la souris');
  const r = await ev(`(() => { const b = document.getElementById('time').getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; })()`);
  await mouse('mousePressed', r.x + 0.2 * r.w, r.y); await wait(100);
  for (let k = 0.2; k <= 0.6001; k += 0.05) { await mouse('mouseMoved', r.x + k * r.w, r.y); await wait(40); }
  const mid = await txt('clock');
  await mouse('mouseReleased', r.x + 0.6 * r.w, r.y); await wait(300);
  const at6 = await txt('clock'), log6 = await ev(`document.getElementById('log').children.length`);
  check(/^0[56]:/.test(at6), 'glisser la barre jusqu\'à 60 % amène vers 6 minutes', 'pendant le glissement ' + mid + ', au relâchement ' + at6 + ', ' + log6 + ' lignes dans le fil');
  await mouse('mousePressed', r.x + 0.6 * r.w, r.y); for (let k = 0.6; k >= 0.1; k -= 0.05) { await mouse('mouseMoved', r.x + k * r.w, r.y); await wait(40); } await mouse('mouseReleased', r.x + 0.1 * r.w, r.y); await wait(300);
  const at1 = await txt('clock'), log1 = await ev(`document.getElementById('log').children.length`);
  check(/^0[01]:/.test(at1) && log1 <= log6, 'glisser en arrière jusqu\'à 10 % ramène vers 1 minute', at1 + ', ' + log1 + ' lignes dans le fil');
  await ev(`document.getElementById('play').click()`);      // pause

  console.log('Clic sur un joueur');
  const cb = await ev(`(() => { const b = document.getElementById('pitch').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  let found = false;
  for (let gx = 0.2; gx < 0.8 && !found; gx += 0.04) for (let gy = 0.2; gy < 0.8 && !found; gy += 0.06) { await mouse('mousePressed', cb.x + gx * cb.w, cb.y + gy * cb.h); await mouse('mouseReleased', cb.x + gx * cb.w, cb.y + gy * cb.h); await wait(30); found = !/Cliquez/.test(await txt('player')); }
  await wait(300);
  check(found, 'un vrai clic sur le terrain ouvre la fiche d\'un joueur', (await txt('player')).replace(/\s+/g, ' ').slice(0, 70));

  console.log('Consignes');
  const pick = (team, key, v) => ev(`(() => { const s = document.querySelector('#tactics select[data-team="${team}"][data-key="${key}"]'); s.value = '${v}'; s.dispatchEvent(new Event('change')); })()`);
  await pick(0, 'line', 1); await pick(0, 'press', 1); await pick(1, 'passing', 1); await wait(400);
  check(await ev(`document.querySelectorAll('#marks .mark.tactic').length`) === 3, 'trois changements de consigne posés sur la barre');
  await ev(`document.getElementById('intents').checked = true; document.getElementById('fwd').click(); document.getElementById('fwd').click(); document.getElementById('fwd').click()`); await wait(500);
  await shot('navigateur-1-match.png');

  console.log('Série de matchs');
  const t0 = Date.now();
  await ev(`document.getElementById('nSeries').value = 30; document.getElementById('runSeries').click()`);
  for (let i = 0; i < 600 && !(await ev(`document.getElementById('seriesOut').children.length`)); i++) await wait(100);
  const secs = (Date.now() - t0) / 1000;
  check(await ev(`document.querySelectorAll('#seriesOut table tr').length`) > 20, '30 matchs de 10 minutes simulés dans le navigateur', secs.toFixed(1) + ' secondes — ' + (await ev(`document.querySelector('#seriesOut .small').textContent`)).slice(0, 78));
  await ev(`document.querySelector('.series').scrollIntoView()`); await wait(300);
  await shot('navigateur-2-serie.png');

  console.log('Durée');
  const t1 = Date.now();
  await ev(`(() => { window.scrollTo(0, 0); const s = document.getElementById('duration'); s.value = '5400'; s.dispatchEvent(new Event('change')); })()`); await wait(200);
  const t2 = Date.now();
  await ev(`document.getElementById('kick').click()`);
  for (let i = 0; i < 300 && (await ev(`document.getElementById('time').disabled || !document.getElementById('busy').hidden`)); i++) await wait(50);
  check(/\/ 90:00$/.test(await txt('clock')), 'match de 90 minutes calculé au coup d\'envoi', ((Date.now() - t2) / 1000).toFixed(1) + ' secondes');
  await ev(`(() => { const t = document.getElementById('time'); t.value = 3000; t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('change')); })()`); await wait(500);
  await shot('navigateur-3-90min.png');

  console.log('Équipes');
  // les équipes ne se choisissent plus dans match.html : la page équipe les envoie dans l'adresse (match.html#partie=…)
  const elite = require('../equipes.json').equipes.find(T => T.id === 'elite');
  await send('Page.navigate', { url: 'about:blank' }); await wait(300);
  await send('Page.navigate', { url: 'file://' + path.join(ROOT, 'match.html') + '#partie=' + encodeURIComponent(JSON.stringify({ equipe: elite, adversaire: 'faible' })) }); await wait(1500);
  check(/Élite/.test(await txt('name0')) && /Faible/.test(await txt('name1')) && /^00:00/.test(await txt('clock')) && !(await ev(`!!document.querySelector('#squads select')`)), 'Élite contre Faible reçus de la page équipe, sans choix d\'équipe dans la page, match à l\'arrêt', (await txt('name0')) + ' / ' + (await txt('name1')));
  await ev(`document.getElementById('kick').click()`);
  for (let i = 0; i < 300 && (await ev(`document.getElementById('time').disabled || !document.getElementById('busy').hidden`)); i++) await wait(50);
  await ev(`(() => { if (document.getElementById('play').textContent === 'Pause') document.getElementById('play').click(); const t = document.getElementById('time'); t.value = t.max; t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('change')); })()`); await wait(500);
  const fin = await txt('goals'), sc = fin.split('–').map(x => +x);
  check(sc[0] > sc[1], 'sur ce match de 90 minutes, l\'équipe élite bat l\'équipe faible', 'score ' + fin);
  await shot('navigateur-4-equipes.png');

  console.log('\nerreurs JavaScript :', errors.length ? errors : 'aucune');
  console.log(fails.length || errors.length ? 'RÉSULTAT : ' + fails.length + ' échec(s)' : 'RÉSULTAT : tout fonctionne dans un vrai navigateur');
  stop(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.log('erreur du test :', e); stop(2); });
