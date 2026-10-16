/* Replay 3D des buts (demande de Frédéric, n° 125) : après un but, l'action est rejouée au ralenti dans une scène 3D plus soignée que celle du match.
   On ne recalcule rien : la page donne les positions enregistrées des joueurs et du ballon (clip.at(t)), et on les met en scène.
   Deux caméras (choix de Frédéric) : la caméra télé ralentie, puis une caméra qui suit le buteur, derrière son épaule.
   En plus de la course : la frappe (ou la tête) du buteur, le plongeon du gardien, le filet qui se gonfle.
   Besoin de three.js (r128, global THREE), chargé par render3d.js (MatchRender3D.load). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchReplay3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const HL = 52.5, HW = 34, MX = 4.5, MY = 3.5, GW = 3.66, GH = 2.44, GD = 2.0;
const KEEPER = ['#f2a33a', '#26282c'];
const SKIN = ['#e9c39b', '#c99a6e', '#8d5a3b', '#f1d0b0', '#6b4128', '#d9a77f'];
const HAIR = ['#1d1a17', '#3b2a1e', '#6b4a2b', '#0f0f10', '#a07a4a', '#2a2522'];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

function rand(seed) { let a = seed >>> 0; return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296; }
// texture dessinée sur un canvas ; couleurs en sRGB (le rendu travaille en couleurs linéaires, comme un appareil photo)
function canvasTex(w, h, draw, data) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; if (!data) t.encoding = THREE.sRGBEncoding; return t;
}
const lin = c => new THREE.Color(c).convertSRGBToLinear();

function pitchTexture(R2) {
  const k = 22, w = Math.round(2 * (HL + MX) * k), h = Math.round(2 * (HW + MY) * k);
  return canvasTex(w, h, g => {
    R2.drawPitch(g, w, h);
    const r = rand(7);
    for (let i = 0; i < 160000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
  });
}
// brins d'herbe, répétés tous les 60 cm : ce qui donne du grain quand la caméra est près du sol
function grassTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rand(5);
    for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h, l = 3 + r() * 7; g.strokeStyle = r() < 0.55 ? 'rgba(10,40,12,0.30)' : 'rgba(190,230,150,0.20)'; g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - l); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function crowdTexture() {
  const t = canvasTex(2048, 512, (g, w, h) => {
    g.fillStyle = '#161a20'; g.fillRect(0, 0, w, h);
    const r = rand(11), cols = ['#c9d3de', '#3a5f9e', '#9e3a3a', '#d8c45a', '#5a5a5a', '#e8e8e8', '#2f6fdf', '#d8423a', '#8a6a4a', '#2c2c2c', '#f0c8a0', '#6a4a3a'];
    for (let y = 3; y < h; y += 7) for (let x = (y % 14) / 2; x < w; x += 6) {
      if (r() < 0.08) continue;
      g.globalAlpha = 0.5 + 0.5 * (y / h);
      g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y + 2, 4.4, 4.6);           // le maillot
      g.fillStyle = r() < 0.5 ? '#e0b48c' : '#8a5a3c'; g.beginPath(); g.arc(x + 2.2, y + 1, 1.8, 0, 7); g.fill();      // la tête
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) { const x = r() * w, y = 40 + r() * (h - 120); g.fillStyle = i % 2 ? '#2f6fdf' : '#d8423a'; g.fillRect(x, y, 34, 20); g.fillStyle = '#ffffff'; g.fillRect(x, y + 8, 34, 4); }      // drapeaux
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
function boardTexture() {
  const t = canvasTex(4096, 128, (g, w, h) => {
    const ads = [['#11151a', '#ffe45c', "L'ENTRAÎNEUR EN CARTON"], ['#2f6fdf', '#ffffff', 'COUPE EN CARTON'], ['#d8423a', '#ffffff', 'MATCH RAPIDE'], ['#1e7a3c', '#ffffff', 'TACTIQUE · TACTIQUE']];
    ads.forEach((a, i) => { g.fillStyle = a[0]; g.fillRect(i * w / 4, 0, w / 4, h); g.fillStyle = a[1]; g.font = '800 66px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a[2], i * w / 4 + w / 8, h / 2 + 2); });
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
function ballTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, w, h);
    const spots = [[0.1, 0.5], [0.35, 0.5], [0.6, 0.5], [0.85, 0.5], [0.22, 0.17], [0.72, 0.17], [0.47, 0.83], [0.97, 0.83], [0.47, 0.17], [0.22, 0.83], [0.97, 0.17], [0.72, 0.83]];
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (const [x, y] of spots) {
      g.fillStyle = '#16181c'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; g.lineTo(x * w + 24 * Math.cos(a), y * h + 24 * Math.sin(a)); } g.closePath(); g.fill();
      for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; g.beginPath(); g.moveTo(x * w + 24 * Math.cos(a), y * h + 24 * Math.sin(a)); g.lineTo(x * w + 48 * Math.cos(a), y * h + 48 * Math.sin(a)); g.stroke(); }
    }
  });
}
function skyTexture() { return canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2c4a78'); gr.addColorStop(0.5, '#7fa3cc'); gr.addColorStop(0.8, '#e4c79a'); gr.addColorStop(1, '#f0b878'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
// le visage, peint sur la tête (le devant de la sphère est au milieu de la texture)
function faceTexture(skin, hair) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = skin; g.fillRect(0, 0, w, h);
    g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.3);                                  // cheveux sur le haut et l'arrière
    const cx = w / 2;
    for (const s of [-1, 1]) {
      const ex = cx + s * 0.05 * w, ey = 0.47 * h;
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(ex, ey, 9, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#2a1c12'; g.beginPath(); g.arc(ex, ey, 4, 0, 7); g.fill();
      g.strokeStyle = hair; g.lineWidth = 4; g.beginPath(); g.moveTo(ex - 11, ey - 12 + s); g.lineTo(ex + 11, ey - 13 - s); g.stroke();      // sourcils
    }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(cx, 0.56 * h, 6, 12, 0, 0, 7); g.fill();       // ombre du nez
    g.strokeStyle = 'rgba(90,30,20,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 12, 0.66 * h); g.quadraticCurveTo(cx, 0.69 * h, cx + 12, 0.66 * h); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = 'rgba(0,0,0,0.10)'; g.beginPath(); g.ellipse(cx + s * 0.25 * w, 0.5 * h, 10, 18, 0, 0, 7); g.fill(); }      // oreilles
  });
}
// le dos du maillot : nom et numéro
function backTexture(name, num, ink) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const nm = String(name || '').split(' ').pop().toUpperCase().slice(0, 12);
    g.font = '700 ' + (nm.length > 8 ? 26 : 32) + 'px system-ui, sans-serif'; g.fillText(nm, w / 2, 34);
    g.font = '800 150px system-ui, sans-serif'; g.fillText(String(num), w / 2, 150);
  });
}

function create(canvas, R2, opt) {
  opt = opt || {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(opt.small ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture(); scene.fog = new THREE.Fog(lin('#b9c3c9'), 150, 340);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 800);
  scene.add(new THREE.HemisphereLight(lin('#d6e4ff'), lin('#3b5a30'), 0.75));
  // soleil de fin d'après-midi, rasant : de longues ombres nettes autour de l'action
  const sun = new THREE.DirectionalLight(lin('#ffe9c8'), 2.1); sun.castShadow = true;
  const SM = opt.small ? 2048 : 4096; sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 5, far: 160 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(lin('#b8ccff'), 0.45); fill.position.set(40, 30, -60); scene.add(fill);

  const std = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: rough == null ? 0.85 : rough, metalness: 0 }, extra || {}));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 260), std('#2c5730', 1)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HL + MX), 2 * (HW + MY)), std('#ffffff', 0.92, { map: pitchTexture(R2) })); pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
  const gt = grassTexture(); gt.repeat.set(2 * (HL + MX) / 0.6, 2 * (HW + MY) / 0.6);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HL + MX), 2 * (HW + MY)), new THREE.MeshStandardMaterial({ map: gt, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = 0.004; grass.receiveShadow = true; scene.add(grass);
  // panneaux publicitaires, tribunes sur les quatre côtés, projecteurs
  const boards = boardTexture();
  const board = (len, x, z, ry, rep) => { const t = boards.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: lin('#ffffff'), emissiveMap: t, emissiveIntensity: 0.35 }); const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), face, face]); m.position.set(x, 0.45, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; scene.add(m); };
  board(100, 0, -(HW + 3.2), 0, 100 / 32); board(100, 0, HW + 3.2, Math.PI, 100 / 32); board(64, -(HL + 3.6), 0, Math.PI / 2, 2); board(64, HL + 3.6, 0, -Math.PI / 2, 2);
  const crowd = crowdTexture(), dark = std('#23282f', 0.9), roofM = std('#3a3f47', 0.6);
  function stand(len, cx, cz, ry) {
    const g = new THREE.Group(), t = crowd.clone(); t.needsUpdate = true; t.repeat.set(len / 30, 1);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 26), std('#ffffff', 1, { map: t, side: THREE.DoubleSide })); face.rotation.x = -0.6; face.position.set(0, 8, 9); g.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 19, 1), dark); back.position.set(0, 9.5, 19.5); g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.6, 17), roofM); roof.position.set(0, 20, 11.5); roof.rotation.x = 0.08; roof.castShadow = true; g.add(roof);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.4), dark); wall.position.set(0, 0.8, -1); g.add(wall);
    g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
  }
  stand(150, 0, -(HW + 8), Math.PI); stand(150, 0, HW + 8, 0); stand(90, -(HL + 9), 0, -Math.PI / 2); stand(90, HL + 9, 0, Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand(34, sx * (HL + 14), sz * (HW + 13), Math.atan2(sx, sz));      // les coins, pour fermer le stade
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 38, 10), std('#5b6068', 0.5)); mast.position.set(sx * (HL + 24), 19, sz * (HW + 22)); scene.add(mast);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.6), new THREE.MeshBasicMaterial({ color: lin('#fffbe6') })); lamp.position.set(sx * (HL + 23), 38.5, sz * (HW + 21)); lamp.lookAt(0, 0, 0); scene.add(lamp);
  }

  // ---------- les buts : poteaux, barre, montants arrière, et un vrai filet (des mailles) qui se gonfle ----------
  const white = std('#ffffff', 0.35);
  const nets = [];
  for (const d of [-1, 1]) {
    const gx = d * HL;
    for (const z of [-GW, GW]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GH, 16), white); p.position.set(gx, GH / 2, z); p.castShadow = true; scene.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2 * GW + 0.12, 16), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, GH, 0); bar.castShadow = true; scene.add(bar);
    const rear = std('#d9dde2', 0.5);
    for (const z of [-GW, GW]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(GD, GH - 0.3), 8), rear); st.position.set(gx + d * GD / 2, (GH + 0.3) / 2, z); st.rotation.z = d * Math.atan2(GD, GH - 0.3); scene.add(st);
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, GD, 8), rear); bt.rotation.z = Math.PI / 2; bt.position.set(gx + d * GD / 2, 0.03, z); scene.add(bt);
    }
    // le filet : des surfaces (fond, toit, côtés) découpées en mailles de 12 cm ; chaque point peut être poussé vers l'arrière
    const pts = [], lines = [];
    function surf(nu, nv, at) {
      const base = pts.length;
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pts.push(at(i / nu, j / nv));
      const id = (i, j) => base + i * (nv + 1) + j;
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { if (i < nu) lines.push(id(i, j), id(i + 1, j)); if (j < nv) lines.push(id(i, j), id(i, j + 1)); }
    }
    // u, v → [x, y (hauteur), z, poids : à quel point ce point du filet peut bouger]
    surf(60, 18, (u, v) => [gx + d * GD, v * (GH - 0.3), (u - 0.5) * 2 * GW, Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1))]);      // fond
    surf(60, 16, (u, v) => [gx + d * GD * v, GH - 0.3 * v, (u - 0.5) * 2 * GW, 0.6 * v * Math.sin(Math.PI * u)]);                                      // toit
    for (const z of [-GW, GW]) surf(16, 18, (u, v) => [gx + d * GD * u, v * (GH - 0.3 * u), z, 0.5 * u * Math.sin(Math.PI * v)]);                    // côtés
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(lines);
    const net = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: lin('#f4f6f8'), transparent: true, opacity: 0.7 }));
    scene.add(net);
    nets.push({ d, gx, pts, geo, s: 0, vs: 0, hy: 1.2, hz: 0 });
  }
  function updateNet(N) {
    const pos = N.geo.attributes.position.array;
    for (let i = 0; i < N.pts.length; i++) {
      const p = N.pts[i], g = Math.exp(-((p[1] - N.hy) ** 2 + (p[2] - N.hz) ** 2) / 1.3);
      pos[i * 3] = p[0] + N.d * N.s * p[3] * g;
      pos[i * 3 + 1] = p[1] - Math.abs(N.s) * 0.15 * p[3] * g;      // le filet s'affaisse un peu en se creusant
    }
    N.geo.attributes.position.needsUpdate = true;
  }

  // ballon
  const BR = 0.13;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 40, 28), std('#ffffff', 0.35, { map: ballTexture() })); ball.castShadow = true; scene.add(ball);

  // ---------- les joueurs : corps articulé plus fin que celui du match (genoux, coudes, épaules arrondies, visage, nom et numéro dans le dos) ----------
  const mats = {}, mat = (c, r, map) => map ? std(c, r, { map }) : (mats[c + r] || (mats[c + r] = std(c, r)));
  const G = {
    thigh: new THREE.CylinderGeometry(0.09, 0.072, 0.44, 16), knee: new THREE.SphereGeometry(0.072, 14, 10), shin: new THREE.CylinderGeometry(0.07, 0.05, 0.42, 16),
    short: new THREE.CylinderGeometry(0.118, 0.112, 0.21, 16), pelvis: new THREE.CylinderGeometry(0.175, 0.185, 0.18, 20),
    boot: new THREE.BoxGeometry(0.22, 0.085, 0.105), toe: new THREE.SphereGeometry(0.055, 12, 8), sole: new THREE.BoxGeometry(0.27, 0.025, 0.11),
    torso: new THREE.CylinderGeometry(0.21, 0.165, 0.56, 22), shoulder: new THREE.SphereGeometry(0.085, 14, 10), collar: new THREE.TorusGeometry(0.06, 0.015, 8, 18),
    neck: new THREE.CylinderGeometry(0.052, 0.058, 0.11, 12), head: new THREE.SphereGeometry(0.115, 32, 24), hair: new THREE.SphereGeometry(0.122, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    sleeve: new THREE.CylinderGeometry(0.07, 0.064, 0.15, 14), upper: new THREE.CylinderGeometry(0.054, 0.047, 0.29, 14), elbow: new THREE.SphereGeometry(0.048, 12, 8),
    fore: new THREE.CylinderGeometry(0.045, 0.037, 0.26, 14), hand: new THREE.SphereGeometry(0.048, 12, 10), glove: new THREE.SphereGeometry(0.068, 12, 10), num: new THREE.PlaneGeometry(0.3, 0.3),
  };
  function seg(geo, material, len, parent, x, y, z) {      // un segment qui pend sous son articulation
    const j = new THREE.Group(), m = new THREE.Mesh(geo, material); m.position.y = -len / 2; m.castShadow = true; m.receiveShadow = true; j.add(m); j.position.set(x, y, z); parent.add(j); return j;
  }
  function makePlayer(q, shirt, shorts, socks, skin, hair, keeper) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ';
    const legs = [];
    for (const s of [1, -1]) {
      const hip = seg(G.thigh, mat(skin, 0.75), 0.44, body, 0, 0.92, 0.1 * s);
      const sh = new THREE.Mesh(G.short, mat(shorts, 0.8)); sh.position.y = -0.08; sh.castShadow = true; hip.add(sh);
      const kn = new THREE.Mesh(G.knee, mat(skin, 0.75)); kn.position.y = -0.44; hip.add(kn);
      const knee = seg(G.shin, mat(socks, 0.9), 0.42, hip, 0, -0.44, 0);
      const ankle = new THREE.Group(); ankle.position.set(0, -0.42, 0); knee.add(ankle);
      const boot = new THREE.Mesh(G.boot, mat('#121417', 0.4)); boot.position.set(0.035, -0.035, 0); boot.castShadow = true; ankle.add(boot);
      const toe = new THREE.Mesh(G.toe, mat('#121417', 0.4)); toe.scale.set(1, 0.75, 0.95); toe.position.set(0.14, -0.045, 0); ankle.add(toe);
      const sole = new THREE.Mesh(G.sole, mat('#3a3d42', 0.6)); sole.position.set(0.05, -0.085, 0); ankle.add(sole);
      legs.push({ hip, knee, ankle });
    }
    const pel = new THREE.Mesh(G.pelvis, mat(shorts, 0.8)); pel.position.y = 0.96; pel.scale.set(0.82, 1, 1.12); pel.castShadow = true; body.add(pel);
    const chest = new THREE.Group(); chest.position.y = 1.03; body.add(chest);
    const to = new THREE.Mesh(G.torso, mat(shirt, 0.7)); to.position.y = 0.28; to.scale.set(0.7, 1, 1.18); to.castShadow = true; to.receiveShadow = true; chest.add(to);
    const back = new THREE.Mesh(G.num, new THREE.MeshBasicMaterial({ map: backTexture(q.name, q.num, keeper ? '#11151a' : '#ffffff'), transparent: true, depthWrite: false }));
    back.position.set(-0.153, 0.31, 0); back.rotation.y = -Math.PI / 2; chest.add(back);
    const col = new THREE.Mesh(G.collar, mat(shorts, 0.7)); col.rotation.x = Math.PI / 2; col.position.y = 0.57; chest.add(col);
    const neck = new THREE.Mesh(G.neck, mat(skin, 0.75)); neck.position.y = 0.6; chest.add(neck);
    const head = new THREE.Group(); head.position.y = 0.73; chest.add(head);
    const hd = new THREE.Mesh(G.head, mat(skin, 0.65, faceTexture(skin, hair))); hd.scale.set(0.95, 1.12, 0.9); hd.castShadow = true; head.add(hd);
    const hr = new THREE.Mesh(G.hair, mat(hair, 0.95)); hr.position.set(-0.012, 0.025, 0); hr.scale.set(1, 1, 0.95); head.add(hr);
    const arms = [];
    for (const s of [1, -1]) {
      const sd = new THREE.Mesh(G.shoulder, mat(shirt, 0.7)); sd.position.set(0, 0.5, 0.235 * s); sd.scale.set(0.9, 0.85, 1); sd.castShadow = true; chest.add(sd);
      const sho = seg(G.upper, mat(keeper ? shirt : skin, 0.75), 0.29, chest, 0, 0.5, 0.25 * s);
      const sl = new THREE.Mesh(G.sleeve, mat(shirt, 0.7)); sl.position.y = -0.07; sl.castShadow = true; sho.add(sl);
      const el = new THREE.Mesh(G.elbow, mat(keeper ? shirt : skin, 0.75)); el.position.y = -0.29; sho.add(el);
      const elb = seg(G.fore, mat(keeper ? shirt : skin, 0.75), 0.26, sho, 0, -0.29, 0);
      const hand = new THREE.Mesh(keeper ? G.glove : G.hand, mat(keeper ? '#f2f2f2' : skin, 0.7)); hand.position.y = -0.29; hand.castShadow = true; elb.add(hand);
      sho.rotation.x = -0.12 * s;
      arms.push({ sho, elb, s });
    }
    g.userData = { body, chest, head, legs, arms, phase: Math.random() * 6, sp: 0, lean: 0 };
    g.traverse(o => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
    scene.add(g); return g;
  }

  // la foulée (comme dans le match), puis ce qui s'y ajoute : frappe, tête, plongeon
  function gait(u, v, gdt) {
    const run = Math.min(1, v / 7), walk = Math.min(1, v / 1.6), stride = 0.9 + 0.75 * run;
    u.phase += gdt * (v / stride) * Math.PI;
    const ph = u.phase, A = 0.1 + 0.32 * walk + 0.38 * run;
    for (let i = 0; i < 2; i++) {
      const L = u.legs[i], ps = ph + i * Math.PI, sw = Math.sin(ps) * walk;
      L.hip.rotation.set(0, 0, A * sw);
      L.knee.rotation.z = -(0.06 + walk * (0.25 + 1.1 * run) * Math.max(0, Math.cos(ps + 0.5)));
      L.ankle.rotation.z = -0.3 * walk * Math.max(0, -Math.sin(ps));
    }
    for (let i = 0; i < 2; i++) {
      const Ar = u.arms[i], ps = ph + (1 - i) * Math.PI;
      Ar.sho.rotation.set(-0.12 * Ar.s, 0, -(0.08 + (0.25 * walk + 0.55 * run)) * Math.sin(ps + Math.PI) * walk);
      Ar.elb.rotation.z = 0.15 + 1.15 * run + 0.25 * walk;
    }
    u.body.position.y = run * 0.05 * Math.abs(Math.cos(ph)) - 0.02 * walk;
    const leanT = 0.04 + 0.16 * run; u.lean += (leanT - u.lean) * Math.min(1, gdt * 6);
    u.chest.rotation.set(0, 0.12 * run * Math.sin(ph), -u.lean);
    u.head.rotation.set(0, 0, u.lean * 0.6);
  }
  // la frappe : jambe armée, frappe, accompagnement ; r = temps depuis la frappe (s)
  function kick(u, r, leg) {
    const w = smooth(-0.5, -0.32, r) * (1 - smooth(0.35, 0.6, r)); if (w <= 0) return;
    const L = u.legs[leg], O = u.legs[1 - leg];
    let hip, knee;
    if (r < -0.12) { const k = smooth(-0.5, -0.12, r); hip = lerp(0, -0.85, k); knee = lerp(-0.3, -1.6, k); }
    else if (r < 0.04) { const k = smooth(-0.12, 0.04, r); hip = lerp(-0.85, 1.05, k); knee = lerp(-1.6, -0.12, k); }
    else { const k = smooth(0.04, 0.35, r); hip = lerp(1.05, 1.3, k); knee = lerp(-0.12, -0.35, k); }
    L.hip.rotation.z = lerp(L.hip.rotation.z, hip, w); L.knee.rotation.z = lerp(L.knee.rotation.z, knee, w); L.ankle.rotation.z = lerp(L.ankle.rotation.z, 0.35, w);
    O.hip.rotation.z = lerp(O.hip.rotation.z, -0.1, w); O.knee.rotation.z = lerp(O.knee.rotation.z, -0.35, w);      // la jambe d'appui
    for (const A of u.arms) { A.sho.rotation.x = lerp(A.sho.rotation.x, -A.s * 0.9, w); A.elb.rotation.z = lerp(A.elb.rotation.z, 0.4, w); }      // bras écartés pour l'équilibre
    u.chest.rotation.z = lerp(u.chest.rotation.z, 0.18, w);      // buste en arrière pour frapper
  }
  // la tête : il saute, se cambre puis donne un coup de tête vers l'avant
  function header(u, r) {
    const w = smooth(-0.45, -0.3, r) * (1 - smooth(0.25, 0.5, r)); if (w <= 0) return;
    u.body.position.y += 0.38 * w * Math.max(0, Math.cos(r * 3.2));
    const nod = r < 0 ? lerp(0.25, -0.35, smooth(-0.3, 0, r)) : -0.35;
    u.chest.rotation.z = lerp(u.chest.rotation.z, nod, w);
    for (const L of u.legs) L.knee.rotation.z = lerp(L.knee.rotation.z, -0.9, w);
    for (const A of u.arms) { A.sho.rotation.x = lerp(A.sho.rotation.x, -A.s * 1.1, w); A.elb.rotation.z = lerp(A.elb.rotation.z, 0.9, w); }
  }
  // le plongeon du gardien : il bascule vers le ballon (k : 0 → 1), bras tendus au-dessus de la tête
  function dive(u, k) {
    if (k <= 0) return;
    for (const A of u.arms) { A.sho.rotation.x = lerp(A.sho.rotation.x, -A.s * 2.75, k); A.sho.rotation.z = lerp(A.sho.rotation.z, 0, k); A.elb.rotation.z = lerp(A.elb.rotation.z, 0.12, k); }
    for (const L of u.legs) { L.hip.rotation.z = lerp(L.hip.rotation.z, 0.15, k); L.knee.rotation.z = lerp(L.knee.rotation.z, -0.35, k); }
    u.chest.rotation.z = lerp(u.chest.rotation.z, 0, k);
  }

  // ---------- le replay ----------
  const figs = [];
  let clip = null, hooks = null, segs = [], si = 0, t = 0, raf = 0, last = 0, cam = null, ballLast = null, kickLeg = 0, diveSide = 0, diveDir = 0, diveReach = 0, diveAmt = 0, W = 1, H = 1;
  function resize(w, h) { W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // les mêmes gestes pour les joueurs animés (players3d.js) : on tourne les os du squelette par-dessus le mouvement enregistré
  function kickR(u, r, leg) {
    const w = smooth(-0.5, -0.32, r) * (1 - smooth(0.35, 0.6, r)); if (w <= 0) return;
    const B = u.bones, up = leg === 0 ? B.rUp : B.lUp, kn = leg === 0 ? B.rLeg : B.lLeg;
    let hip, knee;
    if (r < -0.12) { const k = smooth(-0.5, -0.12, r); hip = lerp(0, 0.9, k); knee = lerp(0.3, 1.7, k); }       // jambe armée
    else if (r < 0.04) { const k = smooth(-0.12, 0.04, r); hip = lerp(0.9, -1.25, k); knee = lerp(1.7, 0.1, k); }      // frappe
    else { const k = smooth(0.04, 0.35, r); hip = lerp(-1.25, -1.45, k); knee = lerp(0.1, 0.4, k); }                  // accompagnement
    up.rotation.x += hip * w; kn.rotation.x += knee * w;
    B.lArm.rotation.z += 0.8 * w; B.rArm.rotation.z -= 0.8 * w; B.spine.rotation.x -= 0.2 * w;      // bras écartés, buste en arrière
  }
  function headerR(u, r) {
    const w = smooth(-0.45, -0.3, r) * (1 - smooth(0.25, 0.5, r)); if (w <= 0) return;
    const B = u.bones;
    u.body.position.y = 0.38 * w * Math.max(0, Math.cos(r * 3.2));
    B.spine.rotation.x += (r < 0 ? lerp(-0.35, 0.45, smooth(-0.3, 0, r)) : 0.45) * w;      // il se cambre, puis donne le coup de tête
    B.lLeg.rotation.x += 0.8 * w; B.rLeg.rotation.x += 0.8 * w;
    B.lArm.rotation.z += 0.9 * w; B.rArm.rotation.z -= 0.9 * w;
  }
  function diveR(u, k) {
    if (k <= 0) return;
    const B = u.bones;
    B.lArm.rotation.z += 2.6 * k; B.rArm.rotation.z -= 2.6 * k;      // bras tendus au-dessus de la tête
    B.lLeg.rotation.x += 0.3 * k; B.rLeg.rotation.x += 0.3 * k;
  }
  const P3 = () => (typeof self !== 'undefined' && self.Players3D && self.Players3D.ready()) ? self.Players3D : null;
  function setup(c) {
    for (const f of figs) scene.remove(f); figs.length = 0;
    c.players.forEach((q, i) => {
      const k = (q.num * 7 + q.team * 3 + i) >>> 0, gk = q.role === 'GK', shirt = gk ? KEEPER[q.team] : c.teams[q.team].color;
      const shorts = q.team === 0 ? '#f2f4f7' : '#1b1f24', socks = gk ? shirt : q.team === 0 ? '#2f6fdf' : '#d8423a';
      if (P3()) {      // vrais mouvements (n° 129)
        const f = P3().make({ shirt: lin(shirt), shorts: lin(shorts), socks: lin(socks), skin: lin(SKIN[k % SKIN.length]), hair: lin(HAIR[(k >> 2) % HAIR.length]), boots: lin('#141619'), hands: lin(gk ? '#f2f2f2' : SKIN[k % SKIN.length]) }, { num: q.num, name: q.name, ink: gk ? '#11151a' : '#ffffff', shadow: true });
        f.rotation.order = 'YXZ'; f.userData.sp = 0; scene.add(f); figs.push(f);
      } else figs.push(makePlayer(q, shirt, shorts, socks, SKIN[k % SKIN.length], HAIR[(k >> 2) % HAIR.length], gk));
    });
    // la jambe qui frappe : celle du côté du ballon au moment du tir
    const S = c.at(c.shotT), sc = S.players[c.scorer];
    if (sc) { const lz = (S.ball.x - sc.x) * -Math.sin(sc.face) + (S.ball.y - sc.y) * Math.cos(sc.face); kickLeg = lz >= 0 ? 0 : 1; }
    // le gardien : de quel côté plonger, et jusqu'où (d'après l'endroit où le ballon passe la ligne)
    const Gf = c.at(c.goalT), k0 = c.keeper >= 0 ? S.players[c.keeper] : null;
    if (k0) {
      const dy = Gf.ball.y - k0.y, side = Math.cos(k0.face) >= 0 ? 1 : -1;
      diveDir = Math.sign(dy || 1); diveSide = diveDir * side; diveReach = clamp(Math.abs(dy) - 0.5, 0, 2.2); diveAmt = clamp(Math.abs(dy) / 1.6, 0.25, 1);
    }
    for (const N of nets) { N.s = 0; N.vs = 0; updateNet(N); }
  }
  // vitesse du ralenti selon le moment de l'action
  function rate(s, tt) {
    if (s.cam === 'buteur') return 0.42;
    const a = clip.shotT - 1.3, b = clip.goalT + 0.5;
    return tt < a - 0.4 ? 1 : tt < a ? lerp(1, 0.32, (tt - a + 0.4) / 0.4) : tt < b ? 0.32 : lerp(0.32, 0.7, Math.min(1, (tt - b) / 0.5));
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    let s = segs[si]; const gdt = dt * rate(s, t); t += gdt;
    if (t > s.to) {
      si++;
      if (si >= segs.length) { stop(); if (hooks.onEnd) hooks.onEnd(); return; }
      s = segs[si]; t = s.from; cam = null; ballLast = null; if (hooks.onAngle) hooks.onAngle(s.cam);
      for (const N of nets) { N.s = 0; N.vs = 0; }
    }
    render(t, cam ? gdt : 0, dt, s);
  }
  function render(tt, gdt, dt, s) {
    const c = clip, S = c.at(tt);
    S.players.forEach((p, i) => {
      const f = figs[i], u = f.userData;
      if (!gdt) u.sp = p.v; else u.sp += (Math.min(p.v, 10) - u.sp) * Math.min(1, gdt * 10);
      if (u.rigged) { u.body.position.y = 0; P3().animate(f, u.sp, gdt); } else gait(u, u.sp, gdt);
      let x = p.x, z = p.y, roll = 0, lift = 0;
      if (i === c.scorer && c.shotT != null && !c.own) { if (c.head) (u.rigged ? headerR : header)(u, tt - c.shotT); else (u.rigged ? kickR : kick)(u, tt - c.shotT, kickLeg); }
      if (i === c.keeper && c.shotT != null) {
        const k = smooth(c.shotT + 0.06, c.shotT + 0.06 + Math.max(0.3, (c.goalT - c.shotT) * 0.9), tt) * (1 - smooth(c.goalT + 1.4, c.goalT + 2.2, tt));
        (u.rigged ? diveR : dive)(u, k);
        roll = diveSide * 1.3 * diveAmt * k; lift = 0.45 * diveAmt * Math.sin(Math.PI * Math.min(1, k)) * (tt < c.goalT + 0.3 ? 1 : 0.4);
        z += diveDir * diveReach * k;      // il s'étire vers le ballon, au-delà de ce que le moteur lui fait parcourir
      }
      f.position.set(x, lift, z); f.rotation.set(roll, -p.face, 0); f.scale.setScalar(u.rigged ? 1.03 : 1.12);
    });
    // le ballon : dans le but, il s'arrête dans le filet, qui se creuse
    let bx = S.ball.x, by = Math.max(0, S.ball.z), bz = S.ball.y;
    const N = nets.find(n => n.d === Math.sign(bx));
    if (N && Math.abs(bx) > HL && Math.abs(bz) < GW + 0.2 && by < GH) {
      const push = clamp(Math.abs(bx) - (HL + GD - 0.3), 0, 0.7);
      if (gdt) { N.vs += (90 * (push - N.s) - 9 * N.vs) * gdt; N.s += N.vs * gdt; }
      N.hy = clamp(by + BR, 0.3, GH - 0.4); N.hz = clamp(bz, -GW + 0.4, GW - 0.4);
      bx = N.d * Math.min(Math.abs(bx), HL + GD - 0.2 + Math.max(0, N.s) * 0.9);
    } else if (N && gdt) { N.vs += (-90 * N.s - 9 * N.vs) * gdt; N.s += N.vs * gdt; }
    for (const n of nets) updateNet(n);
    if (ballLast) { const dx = bx - ballLast.x, dz = bz - ballLast.z, dd = Math.hypot(dx, dz); if (dd > 1e-4 && dd < 5) ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / dd, 0, -dx / dd), dd / BR)); }
    ballLast = { x: bx, z: bz };
    ball.position.set(bx, by + BR, bz);
    placeCamera(s.cam, S, bx, by, bz, dt);
    renderer.render(scene, camera);
  }
  // les deux caméras ; elles glissent en douceur (temps réel : au ralenti, elles restent bien sur l'action)
  function placeCamera(kind, S, bx, by, bz, dt) {
    const c = clip, gx = c.side * HL, k = cam ? 1 - Math.exp(-dt * (kind === 'buteur' ? 5 : 3)) : 1;
    let pos, look, fov;
    if (kind === 'buteur') {
      const p = S.players[c.scorer], dx = gx - p.x, dy = -p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const after = smooth(c.shotT - 0.1, c.shotT + 0.4, t);
      pos = [p.x - ux * 4.6 - uy * 1.2, 2.0, p.y - uy * 4.6 + ux * 1.2];
      const ahead = [p.x + ux * 7, 0.9, p.y + uy * 7];
      look = [lerp(lerp(bx, ahead[0], 0.5), bx, after), lerp(lerp(by + 0.3, ahead[1], 0.5), by + 0.4, after), lerp(lerp(bz, ahead[2], 0.5), bz, after)];
      fov = 42;
    } else {
      // caméra télé de replay : plus basse et plus près que celle du match, légèrement tournée vers le but
      const k = 0.25 * smooth(c.shotT - 2, c.shotT, t);
      look = [lerp(bx, gx, k), 0.6 + by * 0.5, lerp(bz, 0, k) * 0.9];
      pos = [clamp(bx, -HL + 2, HL - 2) - c.side * 8, 9, bz * 0.6 + 21];
      fov = 30;
    }
    if (!cam) cam = { pos: pos.slice(), look: look.slice() };
    for (let i = 0; i < 3; i++) { cam.pos[i] += (pos[i] - cam.pos[i]) * k; cam.look[i] += (look[i] - cam.look[i]) * k; }
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]); camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    figs.forEach((f, i) => { f.visible = i === c.scorer || Math.hypot(f.position.x - cam.pos[0], f.position.z - cam.pos[2]) > 3; });      // pas de joueur collé à l'objectif
    sun.position.set(cam.look[0] - 30, 55, cam.look[2] + 38); sun.target.position.set(cam.look[0], 0, cam.look[2]);
  }
  /* clip : { t0, t1, shotT, goalT, side (but en x = side × 52,5), scorer, keeper (index des joueurs, -1 sinon), own (contre son camp), head,
             teams: [{ color }], players: [{ team, role, num, name }], at(t) → { players: [{ x, y, face, v }], ball: { x, y, z } } }
     hooks : { onAngle(nom), onEnd() } */
  function play(c, h) {
    stop(); clip = c; hooks = h || {};
    segs = [{ cam: 'tele', from: c.t0, to: c.t1 }];
    if (c.scorer >= 0 && !c.own && c.shotT != null) segs.push({ cam: 'buteur', from: Math.max(c.t0, c.shotT - 2.2), to: Math.min(c.t1, c.goalT + 1.3) });
    setup(c); si = 0; t = segs[0].from; cam = null; ballLast = null; last = performance.now();
    if (hooks.onAngle) hooks.onAngle(segs[0].cam);
    render(t, 0, 0, segs[0]);
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  // une seule image, à l'instant tt, avec la caméra « nom » (pour les essais et les captures)
  function still(c, tt, kind) { stop(); clip = c; hooks = {}; setup(c); t = tt; cam = null; ballLast = null; render(tt, 0, 0, { cam: kind }); }
  return { play, stop, resize, still, playing: () => !!raf };
}

return { create };
});
