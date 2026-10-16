/* Vue 3D du match (demande de Frédéric, n° 120) : le même match que la vue de dessus, dessiné autrement.
   Le moteur ne change pas : on lit les positions des joueurs et du ballon (hauteur comprise) et on les pose dans une scène three.js.
   Caméra télé : en hauteur, sur le côté du terrain, elle suit le ballon. Besoin de three.js (r128, global THREE). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchRender3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const HL = 52.5, HW = 34, MX = 4.5, MY = 3.5;
const KEEPER = ['#f2a33a', '#26282c'];
const SKIN = ['#e9c39b', '#c99a6e', '#8d5a3b', '#f1d0b0', '#6b4128'];
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

// charge three.js une seule fois (depuis internet) ; rappelle cb(erreur)
let loading = null;
function load(cb) {
  if (typeof THREE !== 'undefined') return cb(null);
  if (!loading) {
    loading = [];
    const s = document.createElement('script'); s.src = LIB; s.async = true;
    s.onload = () => { const l = loading; loading = null; l.forEach(f => f(typeof THREE !== 'undefined' ? null : new Error('three.js absent'))); };
    s.onerror = () => { const l = loading; loading = null; l.forEach(f => f(new Error('Impossible de charger la bibliothèque 3D (pas de connexion internet ?)'))); };
    document.head.appendChild(s);
  }
  loading.push(cb);
}

// la pelouse : on reprend le dessin de la vue de dessus (render.js), à 16 pixels par mètre
function pitchTexture(R2) {
  const k = 16, c = document.createElement('canvas');
  c.width = Math.round(2 * (HL + MX) * k); c.height = Math.round(2 * (HW + MY) * k);
  R2.drawPitch(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
// une tribune : des petits points de couleur pour la foule
function crowdTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#20262e'; g.fillRect(0, 0, 512, 128);
  const cols = ['#c9d3de', '#3a5f9e', '#9e3a3a', '#d8c45a', '#5a5a5a', '#e8e8e8', '#2f6fdf', '#d8423a'];
  for (let i = 0; i < 2600; i++) { g.fillStyle = cols[(i * 7919) % cols.length]; const x = (i * 97.13) % 512, y = (i * 53.71) % 128; g.fillRect(x, y, 2.4, 3); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); return t;
}

function create(canvas, R2) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1117'); scene.fog = new THREE.Fog('#0d1117', 140, 260);
  const camera = new THREE.PerspectiveCamera(32, 2, 1, 600);
  scene.add(new THREE.HemisphereLight('#ffffff', '#3a5a3a', 0.6));
  const sun = new THREE.DirectionalLight('#ffffff', 0.7); sun.position.set(-30, 80, 40); scene.add(sun);

  // terrain, sol autour, tribunes
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshLambertMaterial({ color: '#25552d' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HL + MX), 2 * (HW + MY)), new THREE.MeshLambertMaterial({ map: pitchTexture(R2) }));
  pitch.rotation.x = -Math.PI / 2; scene.add(pitch);
  const crowd = new THREE.MeshLambertMaterial({ map: crowdTexture() });
  const stand = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, 14), crowd); m.position.set(x, 4, z); m.rotation.y = ry; scene.add(m); };
  stand(130, 0, -(HW + MY + 12), 0); stand(90, -(HL + MX + 12), 0, Math.PI / 2); stand(90, HL + MX + 12, 0, Math.PI / 2);

  // les buts : poteaux, barre, filet
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  for (const d of [-1, 1]) {
    const gx = d * HL;
    for (const z of [-3.66, 3.66]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 10), white); p.position.set(gx, 1.22, z); scene.add(p); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 10), white); bar.rotation.x = Math.PI / 2; bar.position.set(gx, 2.44, 0); scene.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.25 }));
    net.position.set(gx + d * 1, 1.22, 0); scene.add(net);
  }

  // ballon et son ombre
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  scene.add(ball);
  const shade = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false });
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), shade); ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({ color: '#ffe45c', transparent: true, opacity: 0.95, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; scene.add(ring);

  // un joueur : jambes, short, maillot, bras, tête ; il regarde vers +x (son « face »)
  const mats = {}, mat = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  const legG = new THREE.CylinderGeometry(0.085, 0.07, 0.86, 8), armG = new THREE.CylinderGeometry(0.055, 0.05, 0.6, 6), torsoG = new THREE.CylinderGeometry(0.21, 0.17, 0.62, 10),
    shortsG = new THREE.CylinderGeometry(0.18, 0.2, 0.26, 10), headG = new THREE.SphereGeometry(0.13, 12, 10), shadowG = new THREE.CircleGeometry(0.42, 16);
  function limb(geo, material, len) { const g = new THREE.Group(), m = new THREE.Mesh(geo, material); m.position.y = -len / 2; g.add(m); return g; }
  function makePlayer(shirt, shorts, skin) {
    const g = new THREE.Group();
    const L = limb(legG, mat('#1b1f24'), 0.86), Rl = limb(legG, mat('#1b1f24'), 0.86); L.position.set(0, 0.88, 0.1); Rl.position.set(0, 0.88, -0.1);
    const sh = new THREE.Mesh(shortsG, mat(shorts)); sh.position.y = 0.92;
    const to = new THREE.Mesh(torsoG, mat(shirt)); to.position.y = 1.36;
    const aL = limb(armG, mat(shirt), 0.6), aR = limb(armG, mat(shirt), 0.6); aL.position.set(0, 1.62, 0.26); aR.position.set(0, 1.62, -0.26);
    const he = new THREE.Mesh(headG, mat(skin)); he.position.y = 1.82;
    const sd = new THREE.Mesh(shadowG, shade); sd.rotation.x = -Math.PI / 2; sd.position.y = 0.02;
    g.add(L, Rl, sh, to, aL, aR, he, sd);
    g.userData = { L, R: Rl, aL, aR, phase: 0, x: null };
    scene.add(g); return g;
  }
  const figs = new Map();      // joueur (id) → silhouette
  function figFor(p, m) {
    const shirt = p.role === 'GK' ? KEEPER[p.team] : m.teams[p.team].color, key = p.id;
    let f = figs.get(key);
    if (!f || f.userData.shirt !== shirt) {
      if (f) scene.remove(f);
      f = makePlayer(shirt, p.team === 0 ? '#ffffff' : '#1b1f24', SKIN[(p.num * 7 + p.team * 3) % SKIN.length]);
      f.userData.shirt = shirt; figs.set(key, f);
    }
    return f;
  }

  // caméra télé : en tribune principale, en hauteur ; elle suit le ballon de gauche à droite, en douceur
  const cam = { x: 0, z: 0, ready: false };
  let W = 1, H = 1, last = 0;
  function resize(w, h) { W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function placeCamera(bx, bz, dt) {
    const tx = Math.max(-HL + 16, Math.min(HL - 16, bx)), tz = Math.max(-12, Math.min(12, bz * 0.5));
    if (!cam.ready || dt > 1) { cam.x = tx; cam.z = tz; cam.ready = true; }
    else { const k = Math.min(1, dt * 1.6); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k * 0.6; }
    const narrow = camera.aspect < 1.3 ? 1.25 : 1;      // écran étroit : on recule un peu
    camera.position.set(cam.x * 0.82, 34 * narrow, HW + 42 * narrow);
    camera.lookAt(cam.x, 0, cam.z + 5);
  }

  /* m : la vue du match (comme pour la vue de dessus) ; alpha : interpolation entre deux pas ;
     opts.selected : joueur choisi (-1 sinon) ; opts.big : joueurs grossis (petit écran). Renvoie l'endroit, à l'écran, où écrire le nom du joueur choisi. */
  function draw(m, alpha, opts) {
    opts = opts || {};
    const now = performance.now(), dt = last ? Math.min(0.25, (now - last) / 1000) : 0; last = now;
    const Lp = (a, b) => a + (b - a) * alpha, big = opts.big || 1;
    const seen = new Set();
    for (const p of m.players) {
      const f = figFor(p, m), u = f.userData, x = Lp(p.px, p.x), z = Lp(p.py, p.y);
      seen.add(p.id);
      const sp = u.x === null ? 0 : Math.hypot(x - u.x, z - u.z) / Math.max(dt, 1e-3);
      u.sp = u.x === null ? 0 : u.sp + (Math.min(sp, 10) - u.sp) * Math.min(1, dt * 8);      // vitesse lissée (la lecture peut sauter dans le temps)
      if (u.x !== null && Math.hypot(x - u.x, z - u.z) > 3) u.sp = 0;
      u.x = x; u.z = z;
      u.phase += dt * (2.2 + u.sp * 1.15);
      const sw = Math.min(0.85, u.sp * 0.13) * Math.sin(u.phase * Math.PI);
      u.L.rotation.z = sw; u.R.rotation.z = -sw; u.aL.rotation.z = -sw * 0.8; u.aR.rotation.z = sw * 0.8;
      f.position.set(x, 0, z); f.rotation.y = -p.face; f.scale.setScalar(1.3 * big);
      f.visible = true;
    }
    for (const [id, f] of figs) if (!seen.has(id)) f.visible = false;
    const b = m.ball, bx = Lp(b.px, b.x), bz = Lp(b.py, b.y), by = Math.max(0, Lp(b.pz, b.z));
    ball.position.set(bx, by + 0.3, bz); ballShadow.position.set(bx, 0.025, bz); ballShadow.scale.setScalar(1 / (1 + by * 0.15));
    const sel = opts.selected >= 0 ? m.players.find(p => p.id === opts.selected) : null;
    ring.visible = !!sel; if (sel) ring.position.set(Lp(sel.px, sel.x), 0.03, Lp(sel.py, sel.y));
    placeCamera(bx, bz, dt);
    renderer.render(scene, camera);
    return sel ? project(Lp(sel.px, sel.x), 2.6 * big, Lp(sel.py, sel.y)) : null;
  }
  const v3 = () => new THREE.Vector3();
  function project(x, y, z) { const v = v3().set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, front: v.z < 1 }; }
  // le joueur le plus proche d'un clic (en pixels), ou -1
  function pick(m, px, py) {
    let best = -1, bd = 30;
    for (const p of m.players) { const q = project(p.x, 1.1, p.y), d = Math.hypot(q.x - px, q.y - py); if (q.front && d < bd) { bd = d; best = p.id; } }
    return best;
  }
  function reset() { cam.ready = false; for (const f of figs.values()) f.userData.x = null; }
  return { draw, resize, pick, reset };
}

return { load, create, LIB };
});
