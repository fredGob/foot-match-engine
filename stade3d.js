/* Le stade 3D (n° 141, demande de Frédéric : « améliorer les graphismes 3D, surtout pour les ralentis ») : la pelouse, les lignes,
   les panneaux, les tribunes à deux étages avec leur toit, le public et les écrans géants, communs à la vue 3D du match (render3d.js)
   et au replay des buts (replay3d.js). Couleurs en sRGB converties en couleurs linéaires (le rendu travaille comme un appareil photo :
   outputEncoding sRGB et tone mapping ACES). Besoin de three.js (r128, global THREE). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stade3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const HL = 52.5, HW = 34;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function rand(seed) { let a = seed >>> 0; return () => (a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296; }
// texture dessinée sur un canvas ; couleurs en sRGB, sauf pour une texture de données (data)
function canvasTex(w, h, draw, data) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; if (!data) t.encoding = THREE.sRGBEncoding; return t;
}
const lin = c => new THREE.Color(c).convertSRGBToLinear();

/* ---------- La pelouse (n° 141) ----------
   Dessinée dans le processeur graphique, d'après la position au sol : bandes de tonte dont le contraste dépend de l'angle de vue
   (comme à la télé : les brins couchés vers la caméra paraissent plus sombres), grandes taches plus ou moins vertes, coins plus secs,
   usure devant les buts, au point de penalty et au rond central, et des brins d'herbe (une texture répétée à deux échelles). */
// les taches de la pelouse : des bruits (grandes taches, zones sèches, usure, petites taches) calculés une fois dans une texture,
// plutôt qu'à chaque point de l'image (bien plus léger pour les téléphones et les ordinateurs sans carte graphique)
const NZ = [HL + 14, HW + 12];
let noiseTex = null;
function grassNoise() {
  if (noiseTex) return noiseTex;
  const W = 1024, H = 512, d = new Uint8Array(W * H * 4);
  const h21 = (x, y) => { let a = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; a = Math.imul(a ^ (a >>> 13), 1274126177); return ((a ^ (a >>> 16)) >>> 0) / 4294967296; };
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y); let f = x - i, g = y - j; f = f * f * (3 - 2 * f); g = g * g * (3 - 2 * g); const a = h21(i, j), b = h21(i + 1, j), c = h21(i, j + 1), e = h21(i + 1, j + 1); return a + (b - a) * f + (c - a) * g + (a - b - c + e) * f * g; };
  const fbm = (x, y) => { let s = 0, a = 0.5; for (let k = 0; k < 4; k++) { s += a * vn(x, y); x = x * 2.07 + 1.3; y = y * 2.07 + 1.3; a *= 0.5; } return s / 0.9375; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = (i / W * 2 - 1) * NZ[0], y = (j / H * 2 - 1) * NZ[1], o = (j * W + i) * 4;
    d[o] = 255 * fbm(x * 0.045, y * 0.045); d[o + 1] = 255 * fbm(x * 0.21 + 7.3, y * 0.21 + 7.3); d[o + 2] = 255 * fbm(x * 1.1 + 3.1, y * 1.1 + 3.1); d[o + 3] = 255 * vn(x * 1.7, y * 1.7);
  }
  noiseTex = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.generateMipmaps = true; noiseTex.needsUpdate = true;
  return noiseTex;
}
const GRASS = `
  vec2 P = vW.xz;
  vec3 Vd = cameraPosition - vW; float dist = length(Vd); vec2 vh = normalize(Vd.xz + vec2(1e-4));
  float s = clamp(sin(3.14159265 * (P.x + 52.5) / 5.25) * 9.0, -1.0, 1.0);          // 20 bandes de 5,25 m
  float sheen = s * (0.3 + 0.7 * vh.y);
  vec3 col = mix(vec3(0.024, 0.080, 0.020), vec3(0.048, 0.135, 0.034), 0.5 + 0.4 * sheen);
  vec4 nz = texture2D(gNoise, (P + NZ_EXT) / (2.0 * NZ_EXT));      // les bruits, calculés une fois pour toutes (grassNoise)
  float n1 = nz.r, n2 = nz.g, n3 = nz.a;
  col *= 0.9 + 0.2 * n1;
  col = mix(col, col * vec3(1.15, 1.05, 0.75), smoothstep(0.55, 0.9, n2) * 0.15);
  col *= 0.94 + 0.12 * n3;
  float sx = P.x >= 0.0 ? 1.0 : -1.0, gx = sx * 52.5;
  float wear = (1.0 - smoothstep(0.8, 4.5, length((P - vec2(gx - sx * 2.5, 0.0)) * vec2(0.9, 0.55)))) * 0.8
             + (1.0 - smoothstep(0.2, 0.9, length(P - vec2(gx - sx * 11.0, 0.0)))) * 0.6
             + (1.0 - smoothstep(0.2, 1.0, length(P))) * 0.4;
  wear *= smoothstep(0.35, 0.8, nz.b + wear * 0.3);
  col = mix(col, vec3(0.13, 0.12, 0.05), clamp(wear, 0.0, 1.0) * 0.45);
  float d1 = texture2D(gDetail, P / 0.55).r, d2 = texture2D(gDetail, P / 1.9 + 0.37).r;
  float fd = 1.0 - smoothstep(25.0, 90.0, dist);
  col *= mix(1.0, (0.6 + 0.8 * d1) * (0.86 + 0.28 * d2), 0.6 * fd + 0.25);
  diffuseColor.rgb = col;
`;
function grassDetail() {      // brins d'herbe : gris moyen, traits plus clairs et plus sombres ; texture qui se répète sans couture
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    const r = rand(5);
    for (let i = 0; i < 7000; i++) {
      const x = r() * w, y = r() * h, l = 2 + r() * 6, dx = (r() - 0.5) * 2.5, v = r() < 0.5 ? 60 + r() * 50 : 165 + r() * 70;
      g.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.globalAlpha = 0.55; g.lineWidth = 0.8 + r() * 0.9;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { if ((ox && x > 8 && x < w - 8) || (oy && y > 10 && y < h - 10)) continue; g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + dx, y + oy - l); g.stroke(); }
    }
    g.globalAlpha = 1;
  }, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function worldShader(m, U, key, frag, where) {      // matériau standard dont la couleur se calcule d'après la position au sol (vW)
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vW;\nuniform sampler2D gDetail, gNoise;\nconst vec2 NZ_EXT = vec2(' + NZ[0].toFixed(1) + ', ' + NZ[1].toFixed(1) + ');\n' + sh.fragmentShader.replace(where || '#include <map_fragment>', frag);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
// les lignes du terrain, en vraies bandes de 12 cm (nettes même en gros plan), un peu marquées par l'herbe
function linesGeometry() {
  const pos = [], idx = [], w = 0.12, y = 0.006;
  const V = (x, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const seg = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, nx = -uz * w / 2, nz = ux * w / 2, e = w / 2;
    x0 -= ux * e; z0 -= uz * e; x1 += ux * e; z1 += uz * e;
    const a = V(x0 + nx, z0 + nz), b = V(x0 - nx, z0 - nz), c = V(x1 + nx, z1 + nz), d = V(x1 - nx, z1 - nz); idx.push(a, b, c, b, d, c);
  };
  const arc = (cx, cz, r, a0, a1) => {
    const N = Math.max(6, Math.ceil(Math.abs(a1 - a0) * r * 1.5)); let pa = -1, pb = -1;
    for (let k = 0; k <= N; k++) {
      const a = a0 + (a1 - a0) * k / N, ca = Math.cos(a), sa = Math.sin(a);
      const ia = V(cx + (r - w / 2) * ca, cz + (r - w / 2) * sa), ib = V(cx + (r + w / 2) * ca, cz + (r + w / 2) * sa);
      if (k) idx.push(pa, pb, ia, pb, ib, ia); pa = ia; pb = ib;
    }
  };
  const disc = (cx, cz, r) => { const c = V(cx, cz), N = 16; for (let k = 0; k < N; k++) { const a = k / N * 2 * Math.PI, b2 = (k + 1) / N * 2 * Math.PI; idx.push(c, V(cx + r * Math.cos(a), cz + r * Math.sin(a)), V(cx + r * Math.cos(b2), cz + r * Math.sin(b2))); } };
  seg(-HL, -HW, HL, -HW); seg(-HL, HW, HL, HW); seg(-HL, -HW, -HL, HW); seg(HL, -HW, HL, HW); seg(0, -HW, 0, HW);
  arc(0, 0, 9.15, 0, 2 * Math.PI); disc(0, 0, 0.16);
  for (const d of [-1, 1]) {
    const gx = d * HL, px = d * (HL - 16.5), sx = d * (HL - 5.5);
    seg(gx, -20.16, px, -20.16); seg(gx, 20.16, px, 20.16); seg(px, -20.16, px, 20.16);
    seg(gx, -9.16, sx, -9.16); seg(gx, 9.16, sx, 9.16); seg(sx, -9.16, sx, 9.16);
    disc(d * (HL - 11), 0, 0.16);
    const a = Math.acos(5.5 / 9.15), mid = d > 0 ? Math.PI : 0; arc(d * (HL - 11), 0, 9.15, mid - a, mid + a);
    for (const c of [-1, 1]) { let a0 = Math.atan2(0, -d), a1 = Math.atan2(-c, 0); if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; if (a0 - a1 > Math.PI) a1 += 2 * Math.PI; arc(gx, c * HW, 1, a0, a1); }
  }
  for (let t = 0; t < idx.length; t += 3) {      // chaque triangle tourné vers le haut (sinon il est invisible vu d'en haut)
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ny = (pos[c] - pos[a]) * (pos[b + 2] - pos[a + 2]) - (pos[c + 2] - pos[a + 2]) * (pos[b] - pos[a]);
    if (ny < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => i % 3 === 1 ? 1 : 0), 3)); geo.setIndex(idx); return geo;
}
/* Le public : quatre silhouettes de supporters (assis bras le long du corps, un bras levé, les deux bras levés, l'écharpe tendue), dessinées
   en trois couleurs codées : rouge = maillot, vert = peau, bleu = cheveux. Chaque spectateur reçoit ses couleurs (maillot de son équipe ou
   habit neutre, peau, cheveux) dans le processeur graphique. Case de 128 × 256 = 0,64 m × 1,6 m. */
function crowdAtlas() {
  return canvasTex(512, 256, g => {
    g.clearRect(0, 0, 512, 256);
    for (let v = 0; v < 4; v++) {
      g.setTransform(200, 0, 0, -160, v * 128 + 64, 256);      // en mètres, x au centre, y vers le haut
      const fill = (c, f) => { g.fillStyle = c; g.beginPath(); f(); g.fill(); };
      const limb = (c, x0, y0, x1, y1, r) => { g.strokeStyle = c; g.lineWidth = r; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
      fill('rgb(30,30,34)', () => g.rect(-0.21, 0.0, 0.42, 0.52));      // jambes
      const sh = g.createLinearGradient(-0.24, 0, 0.24, 0); sh.addColorStop(0, 'rgb(170,0,0)'); sh.addColorStop(0.45, 'rgb(255,0,0)'); sh.addColorStop(1, 'rgb(190,0,0)');
      fill(sh, () => { g.moveTo(-0.19, 0.5); g.lineTo(0.19, 0.5); g.lineTo(0.235, 0.97); g.quadraticCurveTo(0, 1.04, -0.235, 0.97); g.closePath(); });      // buste
      const arms = [[[-0.22, 0.95, -0.25, 0.75, -0.2, 0.55], [0.22, 0.95, 0.25, 0.75, 0.2, 0.55]],
        [[-0.22, 0.95, -0.25, 0.75, -0.2, 0.55], [0.21, 0.96, 0.29, 1.2, 0.27, 1.47]],
        [[-0.21, 0.96, -0.3, 1.2, -0.27, 1.48], [0.21, 0.96, 0.3, 1.2, 0.27, 1.48]],
        [[-0.21, 0.96, -0.3, 1.18, -0.24, 1.42], [0.21, 0.96, 0.3, 1.18, 0.24, 1.42]]][v];
      for (const [x0, y0, x1, y1, x2, y2] of arms) { limb('rgb(235,0,0)', x0, y0, x1, y1, 0.085); limb('rgb(0,225,0)', x1, y1, x2, y2, 0.07); fill('rgb(0,240,0)', () => g.arc(x2, y2, 0.045, 0, 7)); }
      if (v === 3) fill('rgb(255,0,0)', () => g.rect(-0.31, 1.4, 0.62, 0.075));      // l'écharpe
      fill('rgb(0,200,0)', () => g.rect(-0.045, 0.98, 0.09, 0.1));      // le cou
      const hd = g.createRadialGradient(-0.02, 1.2, 0.02, 0, 1.17, 0.12); hd.addColorStop(0, 'rgb(0,255,0)'); hd.addColorStop(1, 'rgb(0,185,0)');
      fill(hd, () => g.ellipse(0, 1.17, 0.088, 0.112, 0, 0, 7));      // la tête
      fill('rgb(0,0,255)', () => g.ellipse(0, 1.215, 0.092, 0.08, 0, 0, Math.PI));      // les cheveux
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }, true);
}
// le ciel et son reflet : un dôme de couleurs (ciel, tribunes, pelouse) et le soleil, qui éclairent les matières comme un vrai décor
function envMap(renderer, sunDir) {
  const s = new THREE.Scene(), geo = new THREE.SphereGeometry(50, 48, 24), p = geo.attributes.position, c = [];
  const top = lin('#3b6aa6'), hor = lin('#d9e2e6'), stand = lin('#4a4f58'), gnd = lin('#3a5d2c');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    const col = y > 0.42 ? hor.clone().lerp(top, Math.min(1, (y - 0.42) / 0.58)) : y > 0.03 ? stand.clone().lerp(hor, Math.max(0, (y - 0.3) / 0.12)) : gnd.clone();
    c.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.75).multiplyScalar(40) }));
  sun.position.copy(sunDir).multiplyScalar(45); s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.02); pm.dispose();
  return rt.texture;
}
function boardTexture() {
  const t = canvasTex(4096, 128, (g, w, h) => {
    const ads = [['#11151a', '#ffe45c', "L'ENTRAÎNEUR EN CARTON"], ['#2f6fdf', '#ffffff', 'COUPE EN CARTON'], ['#d8423a', '#ffffff', 'MATCH RAPIDE'], ['#1e7a3c', '#ffffff', 'TACTIQUE · TACTIQUE']];
    ads.forEach((a, i) => { g.fillStyle = a[0]; g.fillRect(i * w / 4, 0, w / 4, h); g.fillStyle = a[1]; g.font = '800 66px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a[2], i * w / 4 + w / 8, h / 2 + 2); });
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}

/* Tout le stade, ajouté à la scène. opt : { small (téléphone : moins de gradins et de spectateurs), sun (direction du soleil, Vector3),
   near (false : pas de tribune du côté de la caméra du match) }. Renvoie { dress(équipes) : couleurs du public, update(t, saut) }. */
function build(scene, opt) {
  opt = opt || {};
  const small = !!opt.small, SUN = opt.sun || new THREE.Vector3(-30, 55, 38).normalize();
  const std = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: rough == null ? 0.85 : rough, metalness: 0 }, extra || {}));
  // la pelouse (et ses abords, jusqu'aux tribunes), les lignes
  const U = { gDetail: { value: grassDetail() }, gNoise: { value: grassNoise() } };
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), std('#2a3a2c', 1)); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; scene.add(outer);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2 * (HL + 14), 2 * (HW + 12)), worldShader(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.45 }), U, 'pelouse', GRASS));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
  const lineM = worldShader(new THREE.MeshStandardMaterial({ color: lin('#f3f4f0'), roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), U, 'lignes',
    '#include <map_fragment>\n  diffuseColor.rgb *= 0.78 + 0.32 * texture2D(gDetail, vW.xz / 0.55).r;');
  const lines = new THREE.Mesh(linesGeometry(), lineM); lines.receiveShadow = true; scene.add(lines);
  // panneaux publicitaires
  const boards = boardTexture();
  const adMat = (rep, glow) => { const t = boards.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: lin('#ffffff'), emissiveMap: t, emissiveIntensity: glow }); };
  const board = (len, x, z, ry, rep) => { const face = adMat(rep, 0.35); const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), [std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), std('#111', 0.6), face, face]); m.position.set(x, 0.45, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; scene.add(m); };
  board(100, 0, -(HW + 3.2), 0, 100 / 32); if (opt.near !== false) board(100, 0, HW + 3.2, Math.PI, 100 / 32); board(64, -(HL + 3.6), 0, Math.PI / 2, 2); board(64, HL + 3.6, 0, -Math.PI / 2, 2);

  /* ---------- Le stade (n° 141) : deux étages de gradins, un toit avec ses projecteurs, et le public ----------
     Repère d'une tribune : x le long de la tribune, z en s'éloignant du terrain, y vers le haut. */
  const LOW = { n: small ? 12 : 16, z0: 0.6, d: 0.82, y0: 1.25, h: 0.4 }, UP = { n: small ? 10 : 14, d: 0.8, h: 0.52 };
  UP.z0 = LOW.z0 + (LOW.n - 2) * LOW.d; UP.y0 = LOW.y0 + LOW.n * LOW.h + 2.75;
  const lowTop = [LOW.z0 + LOW.n * LOW.d, LOW.y0 + LOW.n * LOW.h], upTop = [UP.z0 + UP.n * UP.d, UP.y0 + UP.n * UP.h], roofY = upTop[1] + 3.2;
  const seats = [];      // [x, y, z (repère de la tribune), ombre, tribune]
  const tiers = new THREE.Group(); scene.add(tiers);
  const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  function standGeometry(len) {
    const pos = [], nor = [], col = [], idx = [], X = len / 2;
    const quad = (a, b, c, d, n, k) => {      // a-b et a-c : deux côtés ; n : normale voulue ; k : couleur
      const i = pos.length / 3, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], ok = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0;
      for (const q of [a, b, c, d]) { pos.push(q[0], q[1], q[2]); nor.push(n[0], n[1], n[2]); col.push(k.r, k.g, k.b); }
      if (ok) idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); else idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    };
    const tread = lin('#4a5160'), riser = lin('#2b3039'), wall = lin('#22262d'), under = lin('#1a1d22');
    const steps = (T, shade) => {
      for (let i = 0; i < T.n; i++) {
        const z = T.z0 + i * T.d, y = T.y0 + i * T.h, k = shade(i);
        quad([-X, y, z], [X, y, z], [-X, y, z + T.d], [X, y, z + T.d], [0, 1, 0], tread.clone().multiplyScalar(k));
        quad([-X, y, z + T.d], [X, y, z + T.d], [-X, y + T.h, z + T.d], [X, y + T.h, z + T.d], [0, 0, -1], riser.clone().multiplyScalar(k));
      }
    };
    quad([-X, 0, LOW.z0], [X, 0, LOW.z0], [-X, LOW.y0, LOW.z0], [X, LOW.y0, LOW.z0], [0, 0, -1], wall);      // le muret devant le premier rang
    steps(LOW, i => i >= LOW.n - 3 ? 0.55 : 1);
    quad([-X, lowTop[1], lowTop[0]], [X, lowTop[1], lowTop[0]], [-X, UP.y0 - 1, lowTop[0]], [X, UP.y0 - 1, lowTop[0]], [0, 0, -1], under);      // le fond, sous l'étage
    quad([-X, UP.y0 - 1.25, UP.z0], [X, UP.y0 - 1.25, UP.z0], [-X, upTop[1] - 1.5, upTop[0]], [X, upTop[1] - 1.5, upTop[0]], [0, -0.8, 0.6], under);      // le dessous de l'étage
    steps(UP, i => 0.95 - 0.35 * i / UP.n);
    quad([-X, upTop[1], upTop[0]], [X, upTop[1], upTop[0]], [-X, roofY, upTop[0]], [X, roofY, upTop[0]], [0, 0, -1], under);      // le mur du fond
    for (const sx of [-1, 1]) {      // les deux bouts, fermés
      const side = (T) => { for (let i = 0; i < T.n; i++) { const z = T.z0 + i * T.d, y = T.y0 + i * T.h; quad([sx * X, 0, z], [sx * X, 0, z + T.d], [sx * X, y, z], [sx * X, y, z + T.d], [sx, 0, 0], wall); } };
      side(LOW); side(UP);
      quad([sx * X, 0, lowTop[0]], [sx * X, 0, upTop[0]], [sx * X, UP.y0 - 1.25, lowTop[0]], [sx * X, UP.y0 - 1.25, upTop[0]], [sx, 0, 0], wall);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); return geo;
  }
  const roofM = std('#5a6069', 0.6), fasciaM = std('#d9dde2', 0.4), lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.6) });
  let sid = 0;
  function stand(len, cx, cz, ry, ads) {
    const g = new THREE.Group(), id = sid++;
    g.add(new THREE.Mesh(standGeometry(len), concrete));
    if (ads) { const led = new THREE.Mesh(new THREE.BoxGeometry(len, 1.15, 0.25), [std('#111'), std('#111'), std('#111'), std('#111'), adMat(len / 28, 0.6), std('#111')]); led.position.set(0, UP.y0 - 0.65, UP.z0 - 0.12); g.add(led); }
    const roofD = upTop[0] - 2.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.7, roofD), roofM); roof.position.set(0, roofY, 2.5 + roofD / 2 + 1); g.add(roof);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 1.6, 0.3), fasciaM); fascia.position.set(0, roofY - 0.1, 3.5); g.add(fascia);
    for (let x = -len / 2 + 4; x < len / 2 - 3; x += 7.5) { const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.2), lampM); l.position.set(x, roofY - 0.75, 3.3); g.add(l); }
    g.position.set(cx, 0, cz); g.rotation.y = ry; tiers.add(g);
    // les places : un spectateur tous les 55 cm (80 cm sur téléphone), des places vides ici et là
    const r = rand(31 + id), sp = small ? 0.8 : 0.55;
    const put = (T, shade) => { for (let i = 0; i < T.n; i++) for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += sp) if (r() > 0.12) seats.push([x + (r() - 0.5) * 0.12, T.y0 + i * T.h, T.z0 + i * T.d + 0.42, shade(i), id, g, r()]); };
    put(LOW, i => (i >= LOW.n - 3 ? 0.6 : 1));
    put(UP, i => 0.9 - 0.35 * i / UP.n);
    return g;
  }
  const SL = HL + 5.5, SW = HW + 6;
  stand(2 * SL, 0, -SW, Math.PI, true); if (opt.near !== false) stand(2 * SL, 0, SW, 0, true); stand(2 * SW, -SL, 0, -Math.PI / 2, true); stand(2 * SW, SL, 0, Math.PI / 2, true);
  // les coins : un bloc fermé, avec un écran géant posé dessus
  const screenT = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0b0e12'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe45c'; g.font = 'italic 900 64px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('REPLAY', w / 2, h * 0.38);
    g.fillStyle = '#ffffff'; g.font = '800 30px system-ui, sans-serif'; g.fillText("L'ENTRAÎNEUR EN CARTON", w / 2, h * 0.7);
  });
  const blockM = std('#2a2f37', 0.8), screenM = new THREE.MeshBasicMaterial({ map: screenT, color: new THREE.Color(1.4, 1.4, 1.4) });
  for (const sx of [-1, 1]) for (const sz of opt.near !== false ? [-1, 1] : [-1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(28, roofY + 0.4, 28), blockM); b.position.set(sx * (SL + 14), (roofY + 0.4) / 2, sz * (SW + 14)); scene.add(b);
    const scr = new THREE.Group(); scr.position.set(sx * (SL + 7), roofY + 4.6, sz * (SW + 7)); scr.lookAt(0, roofY * 0.4, 0); scene.add(scr);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(15, 8.4, 0.6), std('#15181d', 0.6)); fr.position.z = -0.35; scr.add(fr);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.4), screenM); scr.add(sp);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.8), std('#3a3f47', 0.6)); leg.position.set(0, -4.4, -0.4); scr.add(leg);
  }
  tiers.updateMatrixWorld(true);
  /* le public : une seule silhouette répétée, posée sur les gradins face au terrain ; découpé par tronçons de 30 m de tribune,
     pour que ceux qui sont hors de l'image ne soient pas calculés */
  const NS = seats.length, crowdGeo = new THREE.PlaneGeometry(0.64, 1.15); crowdGeo.translate(0, 0.45 + 0.575 - 0.12, 0);      // le bas des jambes (caché par le rang de devant) n'est pas dessiné
  { const uv = crowdGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) < 0.5 ? 0.45 / 1.6 : 1); }
  const groups = new Map(), where = new Int32Array(NS * 2);
  seats.forEach((q, i) => { const key = q[4] + ':' + Math.floor((q[0] + 200) / 30); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
  const chunks = [...groups.values()].map((idx, c) => {
    const geo = crowdGeo.clone(), n = idx.length, aShirt = new Float32Array(n * 3), aInfo = new Float32Array(n * 4);
    geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(aShirt, 3)); geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aInfo, 4));
    idx.forEach((i, k) => { where[i * 2] = c; where[i * 2 + 1] = k; });
    return { idx, geo, aShirt, aInfo };
  });
  const crowdU = { uT: { value: 0 }, uJump: { value: 0 } };
  const crowdM = new THREE.MeshBasicMaterial({ map: crowdAtlas() });
  crowdM.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, crowdU);
    sh.vertexShader = 'attribute vec3 aShirt;\nattribute vec4 aInfo;\nuniform float uT, uJump;\nvarying vec3 vShirt, vSkin, vHair;\nvarying float vShade;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  float rr = aInfo.y, pose = aInfo.x;
  if (uJump > 0.3 && fract(rr * 2.9) < 0.6) pose = 2.0;      // après le but : bras levés
  vUv.x = (vUv.x + pose) * 0.25;
  vShirt = aShirt; vShade = aInfo.z;
  vSkin = mix(vec3(0.80, 0.52, 0.34), vec3(0.13, 0.06, 0.03), pow(fract(rr * 7.13), 1.6));
  vHair = mix(vec3(0.015, 0.012, 0.01), vec3(0.30, 0.18, 0.08), pow(fract(rr * 3.71), 2.0));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed.y += uJump * step(0.3, fract(rr * 5.3)) * max(0.0, sin(uT * 8.5 + rr * 40.0)) * 0.28;`);
    sh.fragmentShader = 'varying vec3 vShirt, vSkin, vHair;\nvarying float vShade;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
  vec4 tx = texture2D(map, vUv);
  if (tx.a < 0.45) discard;
  diffuseColor.rgb = (vShirt * tx.r + vSkin * tx.g + vHair * tx.b + vec3(0.02) * (1.0 - tx.r - tx.g - tx.b)) * vShade;`);
  };
  crowdM.customProgramCacheKey = () => 'public';
  const crowd = chunks.map(ch => new THREE.InstancedMesh(ch.geo, crowdM, ch.idx.length));
  {
    const M = new THREE.Matrix4(), L = new THREE.Matrix4(), turn = new THREE.Matrix4().makeRotationY(Math.PI);
    const sunH = new THREE.Vector3(SUN.x, 0, SUN.z).normalize();
    seats.forEach((q, i) => {
      const [x, y, z, shade, id, g, rr] = q, sc = 0.92 + 0.16 * rr;
      const c = where[i * 2], k = where[i * 2 + 1], aInfo = chunks[c].aInfo;
      L.makeScale(sc, sc, sc).premultiply(turn).setPosition(x, y, z); M.multiplyMatrices(g.matrixWorld, L); crowd[c].setMatrixAt(k, M);
      const face = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion);      // vers le terrain
      const lit = 0.5 + 0.5 * Math.max(0, face.dot(sunH));      // les tribunes face au soleil sont éclairées
      const v = (rr * 7919) % 1;      // la pose : bras le long du corps le plus souvent, un bras levé, les deux, l'écharpe
      aInfo[k * 4] = v < 0.66 ? 0 : v < 0.8 ? 1 : v < 0.88 ? 2 : 3; aInfo[k * 4 + 1] = (rr * 104729) % 1; aInfo[k * 4 + 2] = shade * lit * 0.72; aInfo[k * 4 + 3] = id;
    });
    crowd.forEach((m, c) => {      // la boule qui contient le tronçon : sert à savoir s'il est dans l'image
      m.instanceMatrix.needsUpdate = true;
      const P = new THREE.Vector3(), box = new THREE.Box3();
      for (let k = 0; k < m.count; k++) { m.getMatrixAt(k, M); box.expandByPoint(P.setFromMatrixPosition(M)); }
      chunks[c].geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); chunks[c].geo.boundingSphere.radius += 1.5;
      scene.add(m);
    });
  }
  // les couleurs du public : surtout celles des deux équipes (les supporters adverses groupés derrière un but), et des habits neutres
  const NEUTRAL = ['#e8e8e8', '#2a2d33', '#1b1c20', '#5d6470', '#1f3a68', '#8a6b4a', '#c9c2b0', '#3d5a3a', '#7a2b2b', '#3a3a3a', '#6b6f75', '#a8a29a'].map(lin);
  function dressCrowd(teams) {
    const home = lin(teams[0].color), away = lin(teams[1].color), r = rand(77);
    for (let i = 0; i < NS; i++) {
      const q = seats[i], awayZone = q[4] === 2 && Math.abs(q[0]) < 22, u = r();
      const c = awayZone ? (u < 0.75 ? away : u < 0.85 ? home : NEUTRAL[Math.floor(r() * NEUTRAL.length)]) : (u < 0.36 ? home : u < 0.42 ? away : NEUTRAL[Math.floor(r() * NEUTRAL.length)]);
      const k = 0.85 + 0.3 * r(), ch = chunks[where[i * 2]], j = where[i * 2 + 1] * 3; ch.aShirt[j] = c.r * k; ch.aShirt[j + 1] = c.g * k; ch.aShirt[j + 2] = c.b * k;
    }
    for (const ch of chunks) ch.geo.attributes.aShirt.needsUpdate = true;
  }

  dressCrowd([{ color: '#2f6fdf' }, { color: '#d8423a' }]);
  return { dress: dressCrowd, update(t, jump) { crowdU.uT.value = t; crowdU.uJump.value = jump || 0; }, crowd };
}

return { build, envMap, lin, rand, canvasTex };
});
