/* Vue 3D du match (demande de Frédéric, n° 120 ; plus réaliste au n° 122) : le même match que la vue de dessus, dessiné autrement.
   Le moteur ne change pas : on lit les positions des joueurs et du ballon (hauteur comprise) et on les pose dans une scène three.js.
   Caméra télé : en hauteur, sur le côté du terrain, elle suit le ballon. Besoin de three.js (r128, global THREE). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchRender3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const HL = 52.5, HW = 34, MX = 4.5, MY = 3.5;
const KEEPER = ['#f2a33a', '#26282c'];
const SKIN = ['#e9c39b', '#c99a6e', '#8d5a3b', '#f1d0b0', '#6b4128', '#d9a77f'];
const HAIR = ['#1d1a17', '#3b2a1e', '#6b4a2b', '#0f0f10', '#a07a4a', '#2a2522'];
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// charge three.js une seule fois (depuis internet) ; rappelle cb(erreur)
let loading = null;
// puis les joueurs animés (players3d.js) ; s'ils ne se chargent pas, on garde les joueurs faits main
const P3 = () => (typeof self !== 'undefined' && self.Players3D) || null;
function load(cb) {
  const next = e => { if (e || !P3()) return cb(e); P3().load(() => cb(null)); };
  if (typeof THREE !== 'undefined') return next(null);
  loadThree(next);
}
function loadThree(cb) {
  if (!loading) {
    loading = [];
    const s = document.createElement('script'); s.src = LIB; s.async = true;
    s.onload = () => { const l = loading; loading = null; l.forEach(f => f(typeof THREE !== 'undefined' ? null : new Error('three.js absent'))); };
    s.onerror = () => { const l = loading; loading = null; l.forEach(f => f(new Error('Impossible de charger la bibliothèque 3D (pas de connexion internet ?)'))); };
    document.head.appendChild(s);
  }
  loading.push(cb);
}

// petit tirage au hasard fixe (le décor est toujours le même)
function rand(seed) { let a = seed >>> 0; return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t; }

// la pelouse : le dessin de la vue de dessus (render.js), plus un grain d'herbe
function pitchTexture(R2) {
  const k = 16, w = Math.round(2 * (HL + MX) * k), h = Math.round(2 * (HW + MY) * k);
  return canvasTex(w, h, (g) => {
    R2.drawPitch(g, w, h);
    const r = rand(7);
    for (let i = 0; i < 90000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
  });
}
// la foule : des taches de couleur serrées, plus claires vers le bas (les premiers rangs sont éclairés)
function crowdTexture() {
  const t = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#1a1f26'; g.fillRect(0, 0, w, h);
    const r = rand(11), cols = ['#c9d3de', '#3a5f9e', '#9e3a3a', '#d8c45a', '#5a5a5a', '#e8e8e8', '#2f6fdf', '#d8423a', '#8a6a4a', '#2c2c2c'];
    for (let y = 2; y < h; y += 5) for (let x = (y % 10) / 2; x < w; x += 4.2) { if (r() < 0.12) continue; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.55 + 0.45 * (y / h); g.fillRect(x, y, 3, 3.6); }
    g.globalAlpha = 1;
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
// panneaux publicitaires au bord du terrain
function boardTexture() {
  const t = canvasTex(2048, 64, (g, w, h) => {
    const ads = [['#11151a', '#ffe45c', "L'ENTRAÎNEUR EN CARTON"], ['#2f6fdf', '#ffffff', 'COUPE EN CARTON'], ['#d8423a', '#ffffff', 'MATCH RAPIDE'], ['#1e7a3c', '#ffffff', 'TACTIQUE · TACTIQUE']];
    ads.forEach((a, i) => { g.fillStyle = a[0]; g.fillRect(i * w / 4, 0, w / 4, h); g.fillStyle = a[1]; g.font = '800 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a[2], i * w / 4 + w / 8, h / 2 + 1); });
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
// le ballon : blanc à pentagones noirs (approchés par des taches)
function ballTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b';
    const spots = [[0.1, 0.5], [0.35, 0.5], [0.6, 0.5], [0.85, 0.5], [0.22, 0.18], [0.72, 0.18], [0.47, 0.82], [0.97, 0.82], [0.47, 0.18], [0.22, 0.82]];
    for (const [x, y] of spots) { g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; g.lineTo(x * w + 13 * Math.cos(a), y * h + 13 * Math.sin(a)); } g.fill(); }
  });
}
// le ciel : un dégradé de soir d'été
function skyTexture() { return canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d5f8f'); gr.addColorStop(0.55, '#8fb2d6'); gr.addColorStop(1, '#d9c9a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
// le numéro dans le dos
function numberTexture(num, ink) { return canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = ink; g.font = '800 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), w / 2, h / 2 + 2); }); }

function create(canvas, R2, opt) {
  opt = opt || {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture(); scene.fog = new THREE.Fog('#9fb4c8', 160, 320);
  const camera = new THREE.PerspectiveCamera(28, 2, 1, 700);
  scene.add(new THREE.HemisphereLight('#dfe9ff', '#2f4a2f', 0.62));
  // le soleil (et les projecteurs) : de vraies ombres sous les joueurs
  const sun = new THREE.DirectionalLight('#fff4e0', 0.85); sun.position.set(-40, 90, 55);
  sun.castShadow = true; sun.shadow.mapSize.set(opt.small ? 1024 : 2048, opt.small ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 45, bottom: -45, near: 10, far: 220 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);

  const std = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: rough == null ? 0.85 : rough, metalness: 0 }, extra || {}));
  // terrain, sol autour
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 240), std('#2a5a30', 1)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.receiveShadow = true; scene.add(ground);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HL + MX), 2 * (HW + MY)), std('#c9d6c4', 0.95, { map: pitchTexture(R2) })); pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
  // panneaux publicitaires
  const boards = boardTexture();
  const board = (len, x, z, ry, rep) => { const t = boards.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]); m.position.set(x, 0.45, z); m.rotation.y = ry; m.castShadow = true; scene.add(m); };
  board(100, 0, -(HW + 3.2), 0, 100 / 32); board(64, -(HL + 3.6), 0, Math.PI / 2, 2); board(64, HL + 3.6, 0, Math.PI / 2, 2);
  // tribunes en gradins, avec un toit, et la foule
  const crowd = crowdTexture(), dark = std('#2a2f37', 0.9), roofM = std('#3a3f47', 0.7);
  function stand(len, cx, cz, ry) {
    const g = new THREE.Group(), t = crowd.clone(); t.needsUpdate = true; t.repeat.set(len / 40, 1);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 24), std('#ffffff', 1, { map: t, side: THREE.DoubleSide })); face.rotation.x = -0.62; face.position.set(0, 7.5, 8); g.add(face);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 17, 1), dark); back.position.set(0, 8.5, 18.5); g.add(back);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.6, 16), roofM); roof.position.set(0, 18.5, 11); roof.rotation.x = 0.08; g.add(roof);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 0.4), dark); wall.position.set(0, 0.8, -1); g.add(wall);
    g.position.set(cx, 0, cz); g.rotation.y = ry; scene.add(g);
  }
  stand(140, 0, -(HW + 8), Math.PI); stand(84, -(HL + 9), 0, -Math.PI / 2); stand(84, HL + 9, 0, Math.PI / 2);
  // projecteurs aux quatre coins
  for (const sx of [-1, 1]) for (const sz of [-1]) {      // seulement en face : ceux du côté de la caméra passeraient devant
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 34, 8), std('#5b6068', 0.6)); mast.position.set(sx * (HL + 20), 17, sz * (HW + 18)); scene.add(mast);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), new THREE.MeshBasicMaterial({ color: '#fffbe6' })); lamp.position.set(sx * (HL + 19), 34.5, sz * (HW + 17)); lamp.lookAt(0, 0, 0); scene.add(lamp);
  }

  // les buts : poteaux, barre, filet tendu vers l'arrière
  const white = std('#ffffff', 0.4);
  for (const d of [-1, 1]) {
    const gx = d * HL;
    for (const z of [-3.66, 3.66]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.44, 12), white); p.position.set(gx, 1.22, z); p.castShadow = true; scene.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 12), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 2.44, 0); bar.castShadow = true; scene.add(bar);
    const netM = new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.22 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(2, 7.32, 8, 28), netM); top.rotation.set(-Math.PI / 2, 0, 0); top.rotation.z = 0; top.position.set(gx + d * 1, 2.3, 0); top.rotation.x = -Math.PI / 2 + d * 0.12; scene.add(top);
    const backN = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.3, 28, 9), netM); backN.rotation.y = Math.PI / 2; backN.position.set(gx + d * 2, 1.15, 0); scene.add(backN);
    for (const z of [-3.66, 3.66]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.4, 8, 9), netM); side.position.set(gx + d * 1, 1.2, z); scene.add(side); }
  }

  // ballon
  const BR = 0.14;      // rayon du ballon : 0,11 m en vrai, un peu plus ici comme les joueurs (×1,15)
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), std('#ffffff', 0.45, { map: ballTexture() })); ball.castShadow = true; scene.add(ball);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), new THREE.MeshBasicMaterial({ color: '#ffe45c', transparent: true, opacity: 0.95, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; scene.add(ring);

  // ---------- un joueur : un vrai petit corps articulé (hanches, genoux, épaules, coudes), qui regarde vers +x ----------
  const mats = {}, mat = (c, r) => mats[c + r] || (mats[c + r] = std(c, r));
  const G = {
    thigh: new THREE.CylinderGeometry(0.085, 0.07, 0.44, 8), shin: new THREE.CylinderGeometry(0.065, 0.05, 0.44, 8), foot: new THREE.BoxGeometry(0.26, 0.08, 0.1),
    shorts: new THREE.CylinderGeometry(0.17, 0.19, 0.24, 10), torso: new THREE.CylinderGeometry(0.22, 0.17, 0.56, 12), neck: new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8),
    head: new THREE.SphereGeometry(0.115, 14, 12), hair: new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    upper: new THREE.CylinderGeometry(0.055, 0.048, 0.29, 8), fore: new THREE.CylinderGeometry(0.044, 0.038, 0.26, 8), hand: new THREE.SphereGeometry(0.045, 8, 6), num: new THREE.PlaneGeometry(0.24, 0.24),
  };
  function seg(geo, material, len, parent, x, y, z) {      // un segment qui pend sous son articulation
    const j = new THREE.Group(), m = new THREE.Mesh(geo, material); m.position.y = -len / 2; m.castShadow = true; j.add(m); j.position.set(x, y, z); parent.add(j); return j;
  }
  function makePlayer(shirt, shorts, socks, skin, hair, num, ink) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);       // body : ce qui monte et descend avec la foulée
    const legs = [];
    for (const s of [1, -1]) {
      const hip = seg(G.thigh, mat(skin, 0.8), 0.44, body, 0, 0.92, 0.1 * s);
      const knee = seg(G.shin, mat(socks, 0.9), 0.44, hip, 0, -0.44, 0);
      const ankle = new THREE.Group(); ankle.position.set(0, -0.44, 0); knee.add(ankle);
      const foot = new THREE.Mesh(G.foot, mat('#15171a', 0.5)); foot.position.set(0.06, -0.03, 0); foot.castShadow = true; ankle.add(foot);
      legs.push({ hip, knee, ankle });
    }
    const sh = new THREE.Mesh(G.shorts, mat(shorts, 0.8)); sh.position.y = 0.92; sh.scale.set(0.8, 1, 1.1); sh.castShadow = true; body.add(sh);
    const chest = new THREE.Group(); chest.position.y = 1.02; body.add(chest);        // le buste penche et tourne autour des hanches
    const to = new THREE.Mesh(G.torso, mat(shirt, 0.75)); to.position.y = 0.28; to.scale.set(0.72, 1, 1.2); to.castShadow = true; chest.add(to);
    const back = new THREE.Mesh(G.num, new THREE.MeshBasicMaterial({ map: numberTexture(num, ink), transparent: true, depthWrite: false }));
    back.position.set(-0.15, 0.32, 0); back.rotation.y = -Math.PI / 2; chest.add(back);
    const neck = new THREE.Mesh(G.neck, mat(skin, 0.8)); neck.position.y = 0.6; chest.add(neck);
    const head = new THREE.Group(); head.position.y = 0.72; chest.add(head);
    const hd = new THREE.Mesh(G.head, mat(skin, 0.7)); hd.scale.set(1, 1.12, 0.95); hd.castShadow = true; head.add(hd);
    const hr = new THREE.Mesh(G.hair, mat(hair, 0.9)); hr.position.set(-0.01, 0.02, 0); head.add(hr);
    const arms = [];
    for (const s of [1, -1]) {
      const sho = seg(G.upper, mat(shirt, 0.75), 0.29, chest, 0, 0.5, 0.26 * s);
      const elb = seg(G.fore, mat(skin, 0.8), 0.26, sho, 0, -0.29, 0);
      const hand = new THREE.Mesh(G.hand, mat(skin, 0.8)); hand.position.y = -0.28; elb.add(hand);
      sho.rotation.x = -0.12 * s;      // bras légèrement écartés du corps
      arms.push({ sho, elb });
    }
    g.userData = { body, chest, head, legs, arms, phase: Math.random() * 6, x: null, sp: 0, lean: 0 };
    scene.add(g); return g;
  }
  const figs = new Map();      // joueur (id) → silhouette
  function figFor(p, m) {
    const shirt = p.role === 'GK' ? KEEPER[p.team] : m.teams[p.team].color, key = p.id + ':' + p.num;
    let f = figs.get(p.id);
    if (!f || f.userData.key !== key + shirt) {
      if (f) scene.remove(f);
      const k = (p.num * 7 + p.team * 3 + p.id) >>> 0, shorts = p.team === 0 ? '#f2f4f7' : '#1b1f24', socks = p.role === 'GK' ? shirt : p.team === 0 ? '#2f6fdf' : '#d8423a';
      if (P3() && P3().ready()) {      // vrais mouvements (n° 129)
        const C = c => new THREE.Color(c);
        f = P3().make({ shirt: C(shirt), shorts: C(shorts), socks: C(socks), skin: C(SKIN[k % SKIN.length]), hair: C(HAIR[(k >> 2) % HAIR.length]), boots: C('#141619'), hands: C(p.role === 'GK' ? '#f2f2f2' : SKIN[k % SKIN.length]) }, { num: p.num, ink: '#ffffff', shadow: true });
        f.userData.x = null; f.userData.lean = 0; scene.add(f);
      } else f = makePlayer(shirt, shorts, socks, SKIN[k % SKIN.length], HAIR[(k >> 2) % HAIR.length], p.num, '#ffffff');
      f.userData.key = key + shirt; figs.set(p.id, f);
    }
    return f;
  }
  // la foulée : la cadence suit la vitesse du joueur dans le match (pas la vitesse de lecture)
  function pose(u, v, gdt) {
    const run = Math.min(1, v / 7), walk = Math.min(1, v / 1.6);           // 0 à l'arrêt, 1 au sprint
    const stride = 0.9 + 0.75 * run;                                          // longueur d'un pas (m)
    u.phase += gdt * (v / stride) * Math.PI;                                  // deux pas par cycle
    const ph = u.phase, A = 0.1 + 0.32 * walk + 0.38 * run;                  // amplitude des cuisses
    for (let i = 0; i < 2; i++) {
      const L = u.legs[i], ps = ph + i * Math.PI, sw = Math.sin(ps) * walk;
      L.hip.rotation.z = A * sw;                                              // cuisse vers l'avant (+) ou l'arrière (−)
      L.knee.rotation.z = -(0.05 + walk * (0.25 + 1.1 * run) * Math.max(0, Math.cos(ps + 0.5)));     // le genou plie quand la jambe revient
      L.ankle.rotation.z = -0.3 * walk * Math.max(0, -Math.sin(ps));      // pointe du pied tendue à la poussée
    }
    for (let i = 0; i < 2; i++) {
      const Ar = u.arms[i], ps = ph + (1 - i) * Math.PI;                      // bras opposé à la jambe
      Ar.sho.rotation.z = -(0.08 + (0.25 * walk + 0.55 * run)) * Math.sin(ps + Math.PI) * walk;
      Ar.elb.rotation.z = 0.15 + 1.15 * run + 0.25 * walk;                    // coude plié en courant
    }
    u.body.position.y = run * 0.05 * Math.abs(Math.cos(ph)) - 0.02 * walk;  // rebond de la foulée
    const leanT = 0.04 + 0.16 * run; u.lean += (leanT - u.lean) * Math.min(1, gdt * 6);
    u.chest.rotation.z = -u.lean; u.chest.rotation.y = 0.12 * run * Math.sin(ph);     // buste penché en avant, qui tourne avec les épaules
    u.head.rotation.z = u.lean * 0.6;                                         // il garde la tête droite
  }

  // caméra télé : en tribune principale, en hauteur ; elle suit le ballon de gauche à droite, en douceur
  const cam = { x: 0, z: 0, ready: false };
  let W = 1, H = 1, last = 0, lastT = null;
  function resize(w, h) { W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function placeCamera(bx, bz, dt) {
    const tx = Math.max(-HL + 15, Math.min(HL - 15, bx)), tz = Math.max(-12, Math.min(12, bz * 0.5));
    if (!cam.ready || dt > 1) { cam.x = tx; cam.z = tz; cam.ready = true; }
    else { const k = Math.min(1, dt * 1.6); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k * 0.6; }
    const narrow = camera.aspect < 1.3 ? 1.25 : 1;      // écran étroit : on recule un peu
    camera.position.set(cam.x * 0.8, 21 * narrow, HW + 33 * narrow);
    camera.lookAt(cam.x, 0, cam.z + 3);
  }

  /* m : la vue du match (comme pour la vue de dessus) ; alpha : interpolation entre deux pas ;
     opts.selected : joueur choisi (-1 sinon) ; opts.big : joueurs grossis (petit écran) ; opts.t : temps de jeu affiché (pour la foulée).
     Renvoie l'endroit, à l'écran, où écrire le nom du joueur choisi. */
  const qa = () => new THREE.Quaternion(), va = () => new THREE.Vector3();
  let ballLast = null;
  function draw(m, alpha, opts) {
    opts = opts || {};
    const now = performance.now(), dt = last ? Math.min(0.25, (now - last) / 1000) : 0; last = now;
    // temps de jeu écoulé depuis l'image précédente (la lecture peut être accélérée, mise en pause ou sauter)
    let gdt = opts.t != null && lastT != null ? opts.t - lastT : dt; if (opts.t != null) lastT = opts.t;
    const jump = gdt < 0 || gdt > 1.5; if (jump) gdt = 0;
    const Lp = (a, b) => a + (b - a) * alpha, big = opts.big || 1;
    const seen = new Set();
    for (const p of m.players) {
      const f = figFor(p, m), u = f.userData, x = Lp(p.px, p.x), z = Lp(p.py, p.y);
      seen.add(p.id);
      let v = p.v != null ? p.v : (u.x === null || !gdt ? 0 : Math.hypot(x - u.x, z - u.z) / gdt);
      if (jump || u.x === null) u.sp = v; else u.sp += (Math.min(v, 10) - u.sp) * Math.min(1, gdt * 10);
      u.x = x; u.z = z;
      if (u.rigged) P3().animate(f, u.sp, gdt); else pose(u, u.sp, gdt);
      f.position.set(x, 0, z); f.rotation.y = -p.face; f.scale.setScalar((u.rigged ? 1.05 : 1.15) * big);
      f.visible = true;
    }
    for (const [id, f] of figs) if (!seen.has(id)) f.visible = false;
    const b = m.ball, bx = Lp(b.px, b.x), bz = Lp(b.py, b.y), by = Math.max(0, Lp(b.pz, b.z));
    // le ballon roule : il tourne autour de l'axe perpendiculaire à son déplacement
    if (ballLast && !jump) { const dx = bx - ballLast.x, dz = bz - ballLast.z, dd = Math.hypot(dx, dz); if (dd > 1e-4 && dd < 5) ball.quaternion.premultiply(qa().setFromAxisAngle(va().set(dz / dd, 0, -dx / dd), dd / BR)); }
    ballLast = { x: bx, z: bz };
    ball.position.set(bx, by + BR, bz);
    sun.position.set(cam.x - 40, 90, 55); sun.target.position.set(cam.x, 0, 0);      // les ombres restent nettes là où regarde la caméra
    const sel = opts.selected >= 0 ? m.players.find(p => p.id === opts.selected) : null;
    ring.visible = !!sel; if (sel) ring.position.set(Lp(sel.px, sel.x), 0.03, Lp(sel.py, sel.y));
    placeCamera(bx, bz, dt);
    renderer.render(scene, camera);
    return sel ? project(Lp(sel.px, sel.x), 2.5 * big, Lp(sel.py, sel.y)) : null;
  }
  function project(x, y, z) { const v = va().set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, front: v.z < 1 }; }
  // le joueur le plus proche d'un clic (en pixels), ou -1
  function pick(m, px, py) {
    let best = -1, bd = 30;
    for (const p of m.players) { const q = project(p.x, 1.0, p.y), d = Math.hypot(q.x - px, q.y - py); if (q.front && d < bd) { bd = d; best = p.id; } }
    return best;
  }
  function reset() { cam.ready = false; lastT = null; ballLast = null; for (const f of figs.values()) f.userData.x = null; }
  return { draw, resize, pick, reset };
}

return { load, create, LIB };
});
