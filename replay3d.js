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

const HL = 52.5, HW = 34, GW = 3.66, GH = 2.44, GD = 2.0;
const KEEPER = ['#f2a33a', '#26282c'];
const SKIN = ['#e9c39b', '#c99a6e', '#8d5a3b', '#f1d0b0', '#6b4128', '#d9a77f'];
const HAIR = ['#1d1a17', '#3b2a1e', '#6b4a2b', '#0f0f10', '#a07a4a', '#2a2522'];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

// texture dessinée sur un canvas ; couleurs en sRGB (le rendu travaille en couleurs linéaires, comme un appareil photo)
function canvasTex(w, h, draw, data) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 16; if (!data) t.encoding = THREE.sRGBEncoding; return t;
}
const lin = c => new THREE.Color(c).convertSRGBToLinear();

// l'ombre douce sous chaque joueur (en plus de son ombre au soleil) : elle le pose au sol
function blobTexture() {
  return canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
/* ---------- L'image façon caméra de télévision (ordinateur seulement ; n° 141, idées reprises d'une visite 3D haut de gamme) ----------
   La scène est dessinée en « haute dynamique » (lumières au-delà du blanc) dans une image à part, avec sa profondeur. Puis :
   1. l'ombrage de contact (occlusion ambiante) : là où deux surfaces se touchent (pieds et pelouse, bras et buste, gradins sous le toit),
      la lumière du ciel arrive moins ; calculé à demi-résolution, puis adouci sans baver sur les contours ;
   2. le halo : les zones les plus lumineuses (maillots blancs au soleil, lignes, filet, projecteurs) débordent un peu, comme sur une caméra ;
   3. la passe finale : flou de profondeur des longues focales, halo, rendu des couleurs « neutre » (plus fidèle aux couleurs que l'ancien,
      qui jaunissait la pelouse), étalonnage (saturation et contraste un peu plus forts), grain fin. Le vignettage est dans la page (CSS). */
const VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const DEPTH = `
uniform sampler2D tD; uniform float near, far; uniform vec2 pInv;
float lz(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
vec3 vpos(vec2 uv) { float z = lz(texture2D(tD, uv).x); return vec3((uv * 2.0 - 1.0) * pInv * z, -z); }
`;
const AO_FRAG = DEPTH + `
uniform vec2 res; uniform float p11, radius, power;
varying vec2 vUv;
void main() {
  vec3 P = vpos(vUv);
  float rpx = radius * p11 * 0.5 * res.y / -P.z;
  if (-P.z > 140.0 || rpx < 0.8) { gl_FragColor = vec4(1.0); return; }
  rpx = min(rpx, 48.0);
  vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float a0 = 6.2832 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = (float(i) + 0.5) / 12.0, a = a0 + float(i) * 2.39996;
    vec3 v = vpos(vUv + vec2(cos(a), sin(a)) * sqrt(fi) * rpx / res) - P;
    float vv = dot(v, v), d = sqrt(vv);
    occ += max(0.0, dot(v, N) - 0.015 - 0.002 * -P.z) / (vv + 0.02) * (1.0 - smoothstep(radius, radius * 2.0, d));
  }
  gl_FragColor = vec4(vec3(pow(clamp(1.0 - occ * radius * power / 12.0, 0.0, 1.0), 1.4)), 1.0);
}`;
const BLUR_FRAG = DEPTH + `
uniform sampler2D tA; uniform vec2 res;
varying vec2 vUv;
void main() {
  float zc = lz(texture2D(tD, vUv).x), s = 0.0, w = 0.0;
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
    vec2 uv = vUv + vec2(float(x), float(y)) * 1.5 / res;
    float k = exp(-abs(lz(texture2D(tD, uv).x) - zc) / (0.03 * zc)) * (1.0 - 0.1 * float(x * x + y * y) / 8.0);
    s += texture2D(tA, uv).r * k; w += k;
  }
  gl_FragColor = vec4(vec3(s / max(w, 1e-4)), 1.0);
}`;
const GLOW_FRAG = `
uniform sampler2D tC; uniform vec2 res; uniform float thr;
varying vec2 vUv;
void main() {
  vec2 o = 0.5 / res;
  vec3 c = (texture2D(tC, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tC, vUv + vec2(o.x, -o.y)).rgb + texture2D(tC, vUv + vec2(-o.x, o.y)).rgb + texture2D(tC, vUv + o).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c * smoothstep(thr, thr * 1.6, l), vec3(8.0)), 1.0);
}`;
const POST_FRAG = DEPTH + `
uniform sampler2D tC, tA, tG; uniform vec2 res; uniform float focus, blur, nearK, maxB, time, exposure, aoOn, glow;
varying vec2 vUv;
float coc(float z) { float c = 1.0 - focus / z; return min(maxB, blur * (c > 0.0 ? c : -c * nearK)); }      // nearK : moins de flou devant le point
vec3 sc(vec2 uv) { return texture2D(tC, uv).rgb * mix(1.0, texture2D(tA, uv).r, aoOn); }
vec3 neutral(vec3 c) {      // rendu des couleurs « Khronos PBR Neutral »
  float x = min(c.r, min(c.g, c.b)), off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
  float peak = max(c.r, max(c.g, c.b)); if (peak < 0.76) return c;
  float d = 0.24, np = 1.0 - d * d / (peak + d - 0.76); c *= np / peak;
  return mix(c, vec3(np), 1.0 - 1.0 / (0.15 * (peak - np) + 1.0));
}
void main() {
  float zc = lz(texture2D(tD, vUv).x), cc = coc(zc);
  vec3 col = sc(vUv);
  if (cc > 0.6) {
    vec3 acc = col; float ws = 1.0;
    for (int i = 0; i < 28; i++) {
      float fi = float(i) + 0.5, r = sqrt(fi / 28.0) * cc, a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r / res;
      float zt = lz(texture2D(tD, uv).x), w = zt >= zc ? 1.0 : smoothstep(r - 1.5, r + 0.5, coc(zt));
      acc += sc(uv) * w; ws += w;
    }
    col = acc / ws;
  }
  col += glow * (textureLod(tG, vUv, 1.0).rgb * 0.35 + textureLod(tG, vUv, 2.5).rgb * 0.3 + textureLod(tG, vUv, 4.0).rgb * 0.22 + textureLod(tG, vUv, 5.5).rgb * 0.13);
  col = neutral(col * exposure);
  col = mix(col * 12.92, 1.055 * pow(max(col, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  float avg = (col.r + col.g + col.b) / 3.0;
  col += (col - avg) * 0.06;                     // saturation
  col = (col - 0.5) * 1.06 + 0.5;                // contraste
  col += (fract(sin(dot(gl_FragCoord.xy + fract(time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
function makePost(renderer) {
  if (!renderer.capabilities.isWebGL2 || !THREE.WebGLMultisampleRenderTarget) return null;
  const HF = THREE.HalfFloatType, LF = THREE.LinearFilter;
  const rt = new THREE.WebGLMultisampleRenderTarget(4, 4, { format: THREE.RGBAFormat, type: HF, minFilter: LF, magFilter: LF });
  rt.samples = 4; rt.texture.generateMipmaps = false;
  rt.depthTexture = new THREE.DepthTexture(4, 4); rt.depthTexture.type = THREE.UnsignedIntType;
  const half = o => new THREE.WebGLRenderTarget(4, 4, Object.assign({ format: THREE.RGBAFormat, minFilter: LF, magFilter: LF, depthBuffer: false }, o));
  const aoA = half(), aoB = half(), glowRT = half({ type: HF, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true });
  const D = { tD: { value: rt.depthTexture }, near: { value: 0.3 }, far: { value: 800 }, pInv: { value: new THREE.Vector2(1, 1) } };
  const halfRes = { value: new THREE.Vector2(2, 2) }, fullRes = { value: new THREE.Vector2(4, 4) };
  const mk = (frag, U) => new THREE.ShaderMaterial({ uniforms: Object.assign({}, D, U), vertexShader: VS, fragmentShader: frag, depthTest: false, depthWrite: false, extensions: { derivatives: true } });
  const aoM = mk(AO_FRAG, { res: halfRes, p11: { value: 1 }, radius: { value: 0.55 }, power: { value: 1.25 } });
  const blurM = mk(BLUR_FRAG, { tA: { value: aoA.texture }, res: halfRes });
  const glowM = mk(GLOW_FRAG, { tC: { value: rt.texture }, res: halfRes, thr: { value: 1.7 } });
  const U = { tC: { value: rt.texture }, tA: { value: aoB.texture }, tG: { value: glowRT.texture }, res: fullRes, focus: { value: 20 }, blur: { value: 0 }, nearK: { value: 0.3 }, maxB: { value: 12 }, time: { value: 0 }, exposure: { value: 1.0 }, aoOn: { value: 1 }, glow: { value: 0.35 } };
  const finalM = mk(POST_FRAG, U);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalM); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(sc, cam); };
  const P = {
    U, ao: true,
    size(w, h) { rt.setSize(w, h); fullRes.value.set(w, h); const hw = Math.max(1, Math.round(w / 2)), hh = Math.max(1, Math.round(h / 2)); for (const r of [aoA, aoB, glowRT]) r.setSize(hw, hh); halfRes.value.set(hw, hh); },
    // dessine la scène puis les passes ; camera : pour la profondeur
    render(scene, camera) {
      const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;      // la passe finale fait le rendu des couleurs
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.toneMapping = tm;
      D.near.value = camera.near; D.far.value = camera.far; D.pInv.value.set(1 / camera.projectionMatrix.elements[0], 1 / camera.projectionMatrix.elements[5]);
      aoM.uniforms.p11.value = camera.projectionMatrix.elements[5];
      if (P.ao) { pass(aoM, aoA); pass(blurM, aoB); }
      U.aoOn.value = P.ao ? 1 : 0;
      pass(glowM, glowRT);
      pass(finalM, null);
    },
  };
  return P;
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
function skyTexture() { return canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d68a3'); gr.addColorStop(0.45, '#86acd6'); gr.addColorStop(0.8, '#d9dfe0'); gr.addColorStop(1, '#f1dcb4'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
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
  const small = !!opt.small;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(small ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture(); scene.fog = new THREE.Fog(lin('#c6cfd4'), 150, 380);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.3, 800);
  // soleil de fin d'après-midi, rasant : de longues ombres nettes autour de l'action ; le ciel éclaire et se reflète (n° 141)
  const SUN = new THREE.Vector3(-30, 55, 38).normalize();
  try { scene.environment = Stade3D.envMap(renderer, SUN); } catch (e) { scene.environment = null; }
  scene.add(new THREE.HemisphereLight(lin('#d6e4ff'), lin('#3b5a30'), scene.environment ? 0.25 : 0.75));
  const sun = new THREE.DirectionalLight(lin('#ffe6c2'), 2.2); sun.castShadow = true;
  const SM = small ? 2048 : 4096; sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 5, far: 160 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(lin('#b8ccff'), 0.3); fill.position.set(40, 30, -60); scene.add(fill);
  const post = small ? null : (() => { try { return makePost(renderer); } catch (e) { return null; } })();
  const dof = { focus: 20, blur: 0, nearK: 0.3 };

  const std = (c, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: lin(c), roughness: rough == null ? 0.85 : rough, metalness: 0 }, extra || {}));
  const stade = Stade3D.build(scene, { small, sun: SUN });      // pelouse, lignes, panneaux, tribunes, public (stade3d.js)
  // les ombres douces au pied des joueurs
  const blobM = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const blobG = new THREE.PlaneGeometry(1.15, 1.15); blobG.rotateX(-Math.PI / 2);
  const blobs = [];

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
  const gest = {};      // les gestes de chaque joueur (index → liste), préparés pour l'action en cours
  let clip = null, hooks = null, segs = [], si = 0, t = 0, raf = 0, last = 0, cam = null, ballLast = null, hasGest = false, keeperTouchedLast = false, keeperFilmed = false, kickLeg = 0, diveSide = 0, diveDir = 0, diveReach = 0, diveAmt = 0, W = 1, H = 1;
  function resize(w, h) {
    W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (post) { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); post.size(v.x, v.y); }
  }
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
  /* ---------- Les gestes de foot (n° 133, choix de Frédéric : faits à la main, dans le replay seulement) ----------
     Le moteur note chaque touche de l'action (clip.touches : instant, joueur, geste, hauteur du ballon). Pour chaque joueur, on joue le geste
     de la touche la plus proche dans le temps, par-dessus la course enregistrée : on tourne les os (hanche, genou, buste, bras), et pour
     les gestes au sol (tacle glissé, plongeon) on bascule tout le corps. r : temps depuis la touche (négatif avant). Rotation des os :
     cuisse x > 0 = jambe en arrière, x < 0 = jambe en avant ; genou x > 0 = genou plié ; buste x > 0 = penché en avant ;
     bras gauche z > 0 (droit z < 0) = bras levé. Corps entier : pitch > 0 = basculé en arrière, roll = sur le côté. */
  const WIN = { pass: [-0.34, 0.36], lob: [-0.46, 0.5], clear: [-0.46, 0.5], shot: [-0.5, 0.6], punt: [-0.55, 0.55], throw: [-2.5, 0.6], ctrl: [-0.28, 0.32],
    head: [-0.45, 0.5], block: [-0.3, 0.5], tackle: [-0.32, 1.0], miss: [-0.32, 1.0], save: [-0.25, 1.4], catch: [-0.3, 0.8] };
  const env = (r, w) => smooth(w[0], w[0] + 0.14, r) * (1 - smooth(w[1] - 0.22, w[1], r));
  const legBones = (B, leg) => leg === 0 ? [B.rUp, B.rLeg, B.lUp, B.lLeg] : [B.lUp, B.lLeg, B.rUp, B.rLeg];
  // frappe du pied : élan (jambe armée), frappe, accompagnement ; amp : ampleur (passe courte < centre < tir), lean : buste en arrière
  function strike(B, r, leg, w, amp, lean) {
    const [up, kn, up2, kn2] = legBones(B, leg), t0 = -0.3 * amp - 0.05, t1 = 0.04;
    let hip, knee;
    if (r < -0.1) { const k = smooth(t0, -0.1, r); hip = lerp(0, 0.95 * amp, k); knee = lerp(0.3, 1.25 + 0.5 * amp, k); }
    else if (r < t1) { const k = smooth(-0.1, t1, r); hip = lerp(0.95 * amp, -1.3 * amp, k); knee = lerp(1.25 + 0.5 * amp, 0.1, k); }
    else { const k = smooth(t1, 0.3, r); hip = lerp(-1.3 * amp, -1.5 * amp, k); knee = lerp(0.1, 0.45, k); }
    up.rotation.x += hip * w; kn.rotation.x += knee * w;
    up2.rotation.x += -0.15 * w; kn2.rotation.x += 0.35 * w;      // jambe d'appui fléchie
    B.lArm.rotation.z += (0.45 + 0.4 * amp) * w; B.rArm.rotation.z -= (0.45 + 0.4 * amp) * w;      // bras écartés pour l'équilibre
    B.spine.rotation.x -= lean * w;
  }
  // passe courte de l'intérieur du pied : petite élan, jambe tournée vers l'extérieur
  function sidefoot(B, r, leg, w) {
    const [up, kn] = legBones(B, leg);
    strike(B, r, leg, w, 0.5, 0.05);
    up.rotation.y += (leg === 0 ? -0.55 : 0.55) * w; kn.rotation.x += 0.15 * w;
  }
  function control(B, r, leg, w, z) {
    const [up, kn, up2, kn2] = legBones(B, leg), k = smooth(-0.22, 0, r) * (1 - smooth(0.05, 0.3, r));
    if (z > 1.15) { B.spine.rotation.x -= 0.4 * k * w; B.lArm.rotation.z += 0.7 * k * w; B.rArm.rotation.z -= 0.7 * k * w; B.head.rotation.x += 0.35 * k * w; }      // poitrine
    else if (z > 0.45) { up.rotation.x -= 1.15 * k * w; kn.rotation.x += 1.2 * k * w; kn2.rotation.x += 0.25 * k * w; }      // cuisse
    else { up.rotation.x -= 0.4 * k * w; kn.rotation.x += 0.55 * k * w; up.rotation.y += (leg === 0 ? -0.45 : 0.45) * k * w; kn2.rotation.x += 0.3 * k * w; B.spine.rotation.x += 0.12 * k * w; }      // pied, amorti
    B.head.rotation.x += 0.3 * k * w;      // il regarde le ballon
  }
  function headGest(u, B, r, w, z) {
    const jump = clamp((z - 1.6) / 0.7, 0, 1) * 0.5;
    u.body.position.y = jump * w * Math.max(0, Math.cos(r * 3.4));
    B.spine.rotation.x += (r < 0 ? lerp(-0.4, 0.5, smooth(-0.3, 0, r)) : 0.5) * w;      // il se cambre, puis donne le coup de tête
    B.lLeg.rotation.x += 0.7 * w * (jump > 0.1 ? 1 : 0.3); B.rLeg.rotation.x += 0.9 * w * (jump > 0.1 ? 1 : 0.3);
    B.lArm.rotation.z += 1.0 * w; B.rArm.rotation.z -= 1.0 * w;
  }
  function blockGest(B, r, leg, w) {
    const [up, kn, , kn2] = legBones(B, leg);
    up.rotation.x -= 0.85 * w; kn.rotation.x += 0.15 * w; up.rotation.z += (leg === 0 ? -0.35 : 0.35) * w; kn2.rotation.x += 0.45 * w;
    B.spine.rotation.x += 0.15 * w; B.lArm.rotation.z += 0.3 * w; B.rArm.rotation.z -= 0.3 * w;
  }
  // tacle : glissé si le défenseur arrive lancé, sinon debout (la jambe tendue vers le ballon)
  function tackleGest(B, r, leg, w, slide, T) {
    const [up, kn, up2, kn2] = legBones(B, leg);
    if (!slide) {
      const k = smooth(-0.3, -0.02, r) * (1 - smooth(0.25, 0.55, r));
      up.rotation.x -= 1.05 * k * w; kn.rotation.x += 0.1 * k * w; kn2.rotation.x += 0.55 * k * w; up2.rotation.x += 0.2 * k * w;
      B.spine.rotation.x += 0.3 * k * w; B.lArm.rotation.z += 0.5 * k * w; B.rArm.rotation.z -= 0.5 * k * w;
      return;
    }
    const k = smooth(-0.3, -0.04, r) * (1 - smooth(0.55, 0.95, r));      // il se jette, glisse, puis se relève
    up.rotation.x -= 1.25 * k * w; kn.rotation.x += 0.05 * k * w;      // jambe du tacle, tendue devant
    up2.rotation.x -= 0.2 * k * w; kn2.rotation.x += 1.6 * k * w;      // l'autre repliée dessous
    B.spine.rotation.x += 0.35 * k * w;
    (leg === 0 ? B.lArm : B.rArm).rotation.z += (leg === 0 ? -1 : 1) * 0.6 * k * w;      // une main vers le sol
    T.pitch += 1.05 * k * w; T.lift -= 0.08 * k * w; T.fwd += 0.55 * k * w;
  }
  // gardien : plongeon si le ballon est loin de lui sur le côté, sinon il le prend face à lui (haut, poitrine, ou au sol)
  function keeperGest(B, r, w, g, T) {
    if (g.dive) {
      const k = smooth(-0.22, 0.02, r) * (1 - smooth(0.9, 1.4, r));
      B.lArm.rotation.z += 2.6 * k * w; B.rArm.rotation.z -= 2.6 * k * w; B.lLeg.rotation.x += 0.35 * k * w; B.rLeg.rotation.x += 0.35 * k * w;
      T.kmag += 1.35 * g.amt * k * w; T.kdir = g.dir; T.lift += 0.42 * g.amt * Math.sin(Math.PI * Math.min(1, smooth(-0.22, 0.25, r))) * w; T.lat += g.dir * g.reach * k * w;
      return;
    }
    const k = smooth(-0.25, 0, r) * (1 - smooth(0.4, 0.8, r));
    if (g.z > 1.5) { B.lArm.rotation.z += 2.4 * k * w; B.rArm.rotation.z -= 2.4 * k * w; }
    else if (g.z > 0.5) { B.lArm.rotation.z += 0.9 * k * w; B.rArm.rotation.z -= 0.9 * k * w; B.spine.rotation.x += 0.35 * k * w; B.lFore.rotation.z += 0.8 * k * w; B.rFore.rotation.z -= 0.8 * k * w; }
    else { B.spine.rotation.x += 0.75 * k * w; B.lLeg.rotation.x += 0.7 * k * w; B.rLeg.rotation.x += 0.7 * k * w; B.lUp.rotation.x -= 0.5 * k * w; B.rUp.rotation.x -= 0.5 * k * w; }
  }
  // le geste du joueur i à l'instant tt (le plus proche), appliqué au squelette ; renvoie la bascule du corps entier
  function pick(i, tt) {
    const L = gest[i]; if (!L) return null;
    let g = null, best = 9;
    for (const x of L) { const r = tt - x.t, w = x.win || WIN[x.k]; if (r >= w[0] && r <= w[1] && Math.abs(r) < best) { best = Math.abs(r); g = x; } }
    return g;
  }
  // pendant une frappe ou un contrôle, la foulée ralentit (le pied d'appui se pose) : on joue la course d'un joueur plus lent
  const CALM = { pass: 0.65, lob: 0.75, clear: 0.75, shot: 0.75, punt: 0.9, throw: 1, ctrl: 0.55, head: 0.6, block: 0.6, tackle: 0.5, miss: 0.5, save: 0.9, catch: 0.9 };
  function calmSpeed(g, tt, v) { return g && !g.mv ? v * (1 - CALM[g.k] * env(tt - g.t, WIN[g.k])) : v; }
  function gesture(g, u, tt) {
    const T = { pitch: 0, roll: 0, lift: 0, fwd: 0, lat: 0, kmag: 0, kdir: 0 };      // kmag, kdir : plongeon du gardien (ampleur, côté du ballon)
    if (!g) return T;
    if (g.mv) {      // geste filmé (n° 143) : joué par le mélangeur, voir render ; pour une tête, on ajoute le coup de tête (le buste se cambre puis frappe)
      if (g.mv.name === 'saut') { const r = tt - g.t, w = filmW(g, r) / g.mv.amt, B = u.bones; B.spine.rotation.x += (r < 0 ? lerp(-0.3, 0.35, smooth(-0.25, 0, r)) : 0.35) * w; B.head.rotation.x += (r < 0 ? lerp(-0.25, 0.3, smooth(-0.2, 0, r)) : 0.3) * w; }
      return T;
    }
    const r = tt - g.t, w = env(r, WIN[g.k]), B = u.bones;
    switch (g.k) {
      case 'pass': sidefoot(B, r, g.leg, w); break;
      case 'lob': case 'clear': strike(B, r, g.leg, w, 0.85, 0.3); break;
      case 'shot': strike(B, r, g.leg, w, 1, 0.2); break;
      case 'punt': strike(B, r, g.leg, w, 1, 0.35); break;
      case 'throw': P3().throwPose({ userData: u }, r, w); break;      // touche : même geste que dans la vue du match (n° 142)
      case 'ctrl': control(B, r, g.leg, w, g.z); break;
      case 'head': headGest(u, B, r, w, g.z); break;
      case 'block': blockGest(B, r, g.leg, w); break;
      case 'tackle': case 'miss': tackleGest(B, r, g.leg, w, g.slide, T); break;
      case 'save': case 'catch': keeperGest(B, r, w, g, T); break;
    }
    return T;
  }
  // prépare les gestes de l'action : la jambe (côté du ballon), le tacle glissé ou non, le plongeon du gardien
  function prepareGestures(c) {
    for (const k in gest) delete gest[k];
    throws.length = 0;
    if (!c.touches) return false;
    for (const [t, i, k, z] of c.touches) {
      if (t < c.t0 - 1 || t > c.t1 || !c.players[i]) continue;
      const S = c.at(t), p = S.players[i], A = c.at(t - 0.25).players[i];
      const lz = (S.ball.x - p.x) * -Math.sin(p.face) + (S.ball.y - p.y) * Math.cos(p.face);
      const g = { t, k, z, leg: lz >= 0 ? 0 : 1, slide: (k === 'tackle' || k === 'miss') && Math.max(p.v, A.v) > 3.6 };
      if (k === 'save' || k === 'catch') {
        const B2 = c.at(t + 0.02).ball, dy = B2.y - p.y, side = Math.cos(p.face) >= 0 ? 1 : -1;
        g.dive = Math.abs(dy) > 0.85 || (k === 'save' && Math.abs(dy) > 0.5);
        g.dir = Math.sign(dy || 1); g.side = g.dir * side; g.reach = clamp(Math.abs(dy) - 0.6, 0, 1.8); g.amt = clamp(Math.abs(dy) / 1.6, 0.35, 1);
      }
      filmed(c, g, i, S, p);
      (gest[i] || (gest[i] = [])).push(g);
      if (k === 'throw') { const nx = c.touches.find(x => x[0] > t + 0.05); throws.push({ t, i, fly: Math.min(0.8, nx ? nx[0] - t : 0.8) }); }      // le ballon vole jusqu'à la touche suivante
    }
    return true;
  }
  const P3 = () => (typeof self !== 'undefined' && self.Players3D && self.Players3D.ready()) ? self.Players3D : null;
  /* Les gestes filmés (n° 143, 144) : tir, frappe longue (long ballon, dégagement, centre), passe, penalty, tête haute, touche, tacle debout,
     arrêts du gardien et célébration du buteur sont joués par de vrais acteurs (mouvements.js). Le joueur suit le chemin de l'acteur
     (pied d'appui planté), ancré pour que son pied, son front ou ses mains arrivent sur le ballon à l'instant du contact, et il se tourne
     vers là où part le ballon (frappes), vers le ballon (tacle) ou face au ballon qui arrive (gardien). L'écart avec la place du joueur
     dans le moteur se résorbe peu à peu jusqu'au contact. g.win : fenêtre du geste (s autour du contact) ; mv.out : sortie ; mv.inT : entrée. */
  const FILMED = { shot: 'tir', lob: 'frappe', clear: 'frappe', punt: 'frappe', pass: 'passe', head: 'saut', throw: 'touche', tackle: 'tacle', miss: 'tacle', save: 'gardien', catch: 'gardien' };
  const KICKS = { tir: 1, frappe: 1, passe: 1, penalty: 1 };
  // fenêtre de chaque geste : [début, fin] autour du contact, sortie, entrée
  const FWIN = { touche: [-2.5, 0.85, 0.45, 0.3], tacle: [-0.55, 0.9, 0.5, 0.2], plongeon: [-0.8, 1.6, 1.1, 0.25], arret: [-0.7, 1.0, 0.6, 0.25], sol: [-0.9, 1.5, 1.0, 0.25],
    fete1: [0, 3.2, 3.0, 0.3], fete2: [0, 3.2, 3.0, 0.3], fete3: [0, 2.9, 2.7, 0.3] };
  function filmed(c, g, i, S, p) {
    const M = P3() && P3().moves(); if (!M) return;
    let name = FILMED[g.k]; if (!name) return;
    if (name === 'tir' && c.sp === 'penalty' && c.shotT != null && Math.abs(g.t - c.shotT) < 0.15) name = 'penalty';
    if (name === 'saut' && g.z < 1.6) return;      // tête basse : pas de saut (geste fait main)
    if (name === 'tacle' && g.slide) return;      // tacle glissé : fait main (le pack n'en a pas)
    if (name === 'gardien') name = 'arret';      // précisé plus bas (plongeon, ballon capté, arrêt au sol), selon le ballon
    if (!M[name]) return;
    // le moteur note la touche au pas où le ballon part : à l'image d'avant (0,05 s plus tôt), il est encore au pied. C'est l'instant du contact.
    // (pas pour la touche : le ballon quitte les mains à l'instant noté, comme le dessine le replay)
    if (name !== 'touche') { g.t = Math.round((g.t - 0.05) * 100) / 100; S = c.at(g.t); p = S.players[i]; }
    let m = M[name]; const B = S.ball, B1 = c.at(g.t + 0.1).ball, B0 = c.at(g.t - 0.1).ball, moving = Math.hypot(B1.x - B.x, B1.y - B.y) > 0.05;
    let F = p.face, left = false, at = null, bk = 0;
    if (KICKS[name] || name === 'saut') { if (moving) F = Math.atan2(B1.y - B.y, B1.x - B.x); left = name !== 'saut' && g.leg === 1; at = name === 'saut' ? [m.head[0], m.head[2]] : m.foot; bk = name === 'saut' ? 0.12 : 0.13; }
    else if (name === 'tacle') { F = Math.atan2(B.y - p.y, B.x - p.x); left = g.leg === 1; at = m.foot; bk = 0.13; }
    else if (name === 'touche') { if (moving) F = Math.atan2(B1.y - B.y, B1.x - B.x); }
    else {      // gardien : face au ballon qui arrive
      const vx = B.x - B0.x, vy = B.y - B0.y; if (Math.hypot(vx, vy) > 0.05) F = Math.atan2(-vy, -vx);
      const kp = keeperMove(M, F, B.x - p.x, B.y - p.y, B.z, g.dive); name = kp.name; left = kp.left; m = M[name]; at = [m.hands[0], m.hands[2]];
    }
    film(c, g, i, name, F, left, at ? [at[0], at[1], B.x - Math.cos(F) * bk, B.y - Math.sin(F) * bk] : [0, 0, p.x, p.y]);
    if (m.hands && name !== 'touche') g.mv.lift = name === 'sol' ? 0 : clamp(B.z - m.hands[1], -0.6, 0.35);      // le gardien monte ou descend un peu vers le ballon
    if (name === 'saut') g.mv.amt = clamp((g.z - 1.55) / 0.45, 0.35, 1);      // saut plus ou moins franc selon la hauteur du ballon
  }
  /* le geste du gardien selon le ballon : au ras du sol (moins de 0,55 m), l'arrêt au sol, ou le plongeon s'il est loin sur le côté ;
     plus haut, le plongeon si le ballon est loin de lui, sinon le ballon capté. Le geste filmé part d'un côté (ses mains au contact) :
     retourné en miroir si le ballon est de l'autre côté. dx, dy : ballon moins gardien ; F : son regard */
  function keeperMove(M, F, dx, dy, z, dive) {
    const lat = dx * Math.sin(F) - dy * Math.cos(F);      // > 0 : à sa gauche
    const name = z < 0.55 ? (Math.abs(lat) < 2.2 ? 'sol' : 'plongeon') : dive || Math.abs(lat) > 0.85 ? 'plongeon' : 'arret';
    const hx = M[name].hands[0];
    return { name, left: Math.abs(hx) > 0.05 && Math.sign(hx) !== Math.sign(lat || 1) };
  }
  /* prépare un geste filmé : name (mouvement), F (direction du regard au contact), left (miroir), pin = [x, z du point du corps qui doit arriver
     sur la cible (repère de l'acteur : x vers sa gauche, z vers l'avant), cible x, cible y (repère du terrain)] */
  function film(c, g, i, name, F, left, pin) {
    const m = P3().moves()[name], fx = (left ? -1 : 1) * pin[0], fz = pin[1], w = FWIN[name];
    const prev = (gest[i] || []).reduce((a, x) => x !== g && x.t < g.t ? Math.max(a, x.t) : a, -1e9);
    // une passe : l'acteur accompagne haut (jambe à la taille) ; le joueur, lui, raccourcit le geste après le ballon
    g.mv = { name, left, F, contact: m.contact, post: name === 'passe' ? 0.55 : 1, out: w ? [w[2], w[1]] : name === 'passe' ? [0.12, 0.34] : [0.32, 0.6], inT: w ? w[3] : 0.2, amt: 1, lift: 0,
      ax: pin[2] - (fz * Math.cos(F) + fx * Math.sin(F)), ay: pin[3] - (fz * Math.sin(F) - fx * Math.cos(F)) };
    g.win = w ? [Math.max(w[0], Math.min(-0.3, prev - g.t + 0.12)), w[1]] : [Math.max(-0.62, Math.min(-0.3, prev - g.t + 0.12)), 0.62];
    if (w && w[0] === 0) g.win[0] = 0;      // célébration : elle commence à l'instant donné
    // au début du geste, l'écart entre le joueur du moteur et le chemin de l'acteur : il se résorbe peu à peu jusqu'au contact
    const P0 = c.at(g.t + g.win[0]).players[i], M0 = filmPos(g, g.win[0]);
    g.mv.dx = P0.x - M0[0]; g.mv.dy = P0.y - M0[1]; g.mv.df = Math.atan2(Math.sin(P0.face - F), Math.cos(P0.face - F));
  }
  // où est le joueur sur le chemin de l'acteur, r secondes après le contact
  function filmPos(g, r) {
    const M = g.mv, pa = P3().pathAt(M.name, filmT(g, r), M.left);
    return [M.ax + pa[1] * Math.cos(M.F) + pa[0] * Math.sin(M.F), M.ay + pa[1] * Math.sin(M.F) - pa[0] * Math.cos(M.F)];
  }
  // le poids d'un geste filmé à l'instant r (s depuis le contact) : entrée en mv.inT, sortie selon mv.out
  const filmW = (g, r) => g.mv.amt * smooth(g.win[0], g.win[0] + g.mv.inT, r) * (1 - smooth(g.mv.out[0], g.mv.out[1], r));
  const filmT = (g, r) => g.mv.contact + (r > 0 ? r * g.mv.post : r);      // instant du clip
  // la part de l'écart de départ qui reste (1 au début du geste, 0 au contact)
  const filmDrift = (g, r) => g.win[0] >= 0 ? 0 : 1 - smooth(g.win[0], -0.03, r);
  // le gardien qui monte ou descend vers le ballon : autour du contact seulement
  const filmLift = (g, r) => g.mv.lift * smooth(-0.45, -0.1, r) * (1 - smooth(0.25, 0.7, r));
  /* Deux gestes ajoutés par le replay lui-même (n° 144) : le gardien battu plonge quand même (vers l'endroit où le ballon passe la ligne,
     ses mains n'y arrivent que si c'est à sa portée), et le buteur célèbre son but. */
  function extraGestures(c) {
    const M = P3() && P3().moves(); if (!M || c.shotT == null) return false;
    let diving = false;
    if (c.keeper >= 0 && !keeperTouchedLast && M.plongeon) {
      const te = Math.min(c.goalT, c.shotT + clamp((c.goalT - c.shotT) * 0.75, 0.25, 0.9)), S = c.at(te), K = S.players[c.keeper], T = c.at(c.goalT).ball;
      const sh = c.scorer >= 0 ? c.at(c.shotT).players[c.scorer] : null, F = sh ? Math.atan2(sh.y - K.y, sh.x - K.x) : K.face;
      const dx = T.x - K.x, dy = T.y - K.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(1, 1.9 / d);      // ses mains vont vers le ballon, 1,9 m au plus
      const kp = keeperMove(M, F, dx, dy, T.z, true), g = { t: te, k: 'dive', z: T.z, extra: true }, m = M[kp.name];
      film(c, g, c.keeper, kp.name, F, kp.left, [m.hands[0], m.hands[2], K.x + dx * reach, K.y + dy * reach]);
      g.mv.lift = kp.name === 'sol' ? 0 : clamp(T.z - m.hands[1], -0.6, 0.35);
      (gest[c.keeper] || (gest[c.keeper] = [])).push(g); diving = true;
    }
    if (c.scorer >= 0 && !c.own && M.fete1) {
      const name = ['fete1', 'fete2', 'fete3'][Math.abs(Math.round(c.goalT * 10) + c.scorer) % 3], te = c.goalT + 0.35, P = c.at(te).players[c.scorer], g = { t: te, k: 'fete', z: 0, extra: true };
      film(c, g, c.scorer, name, P.face, false, [0, 0, P.x, P.y]);
      (gest[c.scorer] || (gest[c.scorer] = [])).push(g);
    }
    return diving;
  }
  const lerpA = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  const throws = [];      // touches de l'action : le ballon dans les mains du tireur, puis lancé en cloche (n° 142)
  function setup(c) {
    for (const f of figs) scene.remove(f); figs.length = 0;
    c.players.forEach((q, i) => {
      const k = (q.num * 7 + q.team * 3 + i) >>> 0, gk = q.role === 'GK', shirt = gk ? KEEPER[q.team] : c.teams[q.team].color;
      const shorts = q.team === 0 ? '#f2f4f7' : '#1b1f24', socks = gk ? shirt : q.team === 0 ? '#2f6fdf' : '#d8423a';
      if (P3()) {      // vrais mouvements (n° 129)
        const f = P3().make({ shirt: lin(shirt), shorts: lin(shorts), socks: lin(socks), skin: lin(SKIN[k % SKIN.length]), hair: lin(HAIR[(k >> 2) % HAIR.length]), boots: lin('#141619'), hands: lin(gk ? '#f2f2f2' : SKIN[k % SKIN.length]) }, { num: q.num, name: q.name, ink: gk ? '#11151a' : '#ffffff', shadow: !opt.small });
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
    // les gestes de toute l'action (n° 133) ; le gardien qui n'a pas touché le dernier tir plonge quand même (ci-dessous)
    hasGest = prepareGestures(c);
    if (hasGest && c.keeper >= 0) keeperTouchedLast = (gest[c.keeper] || []).some(g => c.shotT != null && g.t >= c.shotT - 0.05);
    keeperFilmed = hasGest && extraGestures(c);      // plongeon filmé du gardien battu, célébration du buteur (n° 144)
    for (const N of nets) { N.s = 0; N.vs = 0; updateNet(N); }
    stade.dress(c.teams);
    while (blobs.length < c.players.length) { const b = new THREE.Mesh(blobG, blobM); b.renderOrder = 2; scene.add(b); blobs.push(b); }
    blobs.forEach((b, i) => { b.visible = i < c.players.length; });
  }
  // vitesse du ralenti selon le moment de l'action
  function rate(s, tt) {
    if (s.cam === 'buteur') return 0.42;
    const a = clip.shotT - 1.3, b = clip.goalT + 0.5;
    return tt < a - 0.4 ? 1 : tt < a ? lerp(1, 0.32, (tt - a + 0.4) / 0.4) : tt < b ? 0.32 : lerp(0.32, 0.7, Math.min(1, (tt - b) / 0.5));
  }
  /* Qualité qui s'adapte (n° 141, comme la visite 3D de référence) : si les images mettent trop de temps à venir (plus de 45 ms en moyenne),
     on retire d'abord l'ombrage de contact, puis toute la passe « caméra de télévision » (d'un coup si c'est très lent). Le choix reste pour les replays suivants. */
  const perf = { n: 0, sum: 0, slow: 0 };
  const quality = () => { document.body.dataset.replayQualite = post.on === false ? 'simple' : 'sans-ombrage'; };
  function watchPerf(ms) {
    if (!post || post.on === false || ++perf.n <= 3) return;      // les premières images comptent les chargements
    if (ms > 300) { if (++perf.slow >= 2) { post.on = false; quality(); } return; }      // deux images de suite à plus de 0,3 s : tout de suite au plus simple
    perf.slow = 0; if (perf.n <= 5) return;
    perf.sum += ms;
    if (perf.n < 5 + 12) return;
    const avg = perf.sum / 12;
    if (avg > 45) { if (post.ao && avg < 120) post.ao = false; else post.on = false; quality(); }
    perf.n = 5; perf.sum = 0;
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); watchPerf(now - last); last = now;      // appareil très lent : le replay saute des images plutôt que de durer
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
    const c = clip, S = c.at(tt), S0 = c.at(tt - 0.1);
    S.players.forEach((p, i) => {
      const f = figs[i], u = f.userData;
      if (!gdt) u.sp = p.v; else u.sp += (Math.min(p.v, 10) - u.sp) * Math.min(1, gdt * 10);
      const g = u.rigged && hasGest ? pick(i, tt) : null;
      let x = p.x, z = p.y, roll = 0, lift = 0, pitch = 0, kmag = 0, kdir = 0, face = p.face, filmY = 0;
      if (u.rigged) {
        u.body.position.y = 0;
        // course arrière, pas chassés, ou il se retourne pour courir (n° 143)
        const q0 = S0.players[i], H = P3().heading(f, p.face, (p.x - q0.x) / 0.1, (p.y - q0.y) / 0.1, gdt);
        const o = { dir: H.dir }; face = H.face;
        if (g && g.mv) {      // frappe filmée : le joueur suit le chemin de l'acteur, pied sur le ballon au contact
          const r = tt - g.t, M = g.mv, w = filmW(g, r), d = filmDrift(g, r), fp = filmPos(g, r), back = r > 0 ? w / M.amt : 1;
          x += (fp[0] + M.dx * d - x) * back; z += (fp[1] + M.dy * d - z) * back;      // avant le contact : chemin de l'acteur ; après : retour au moteur
          face = lerpA(face, M.F + M.df * d, back); o.move = { name: M.name, t: filmT(g, r), w, left: M.left };
          if (M.lift) filmY = filmLift(g, r);
        }
        P3().animate(f, calmSpeed(g, tt, u.sp), gdt, o);
      } else gait(u, u.sp, gdt);
      if (u.rigged && hasGest) {      // les gestes de toute l'action (n° 133)
        const G = gesture(g, u, tt);
        roll = G.roll; lift = G.lift; pitch = G.pitch; z += G.lat; kmag = G.kmag; kdir = G.kdir;
        x += Math.cos(p.face) * G.fwd; z += Math.sin(p.face) * G.fwd;
        if (i === c.keeper && c.shotT != null && !keeperTouchedLast && !keeperFilmed) {      // le but : il plonge sans toucher le ballon (fait main, sans mouvements filmés)
          const k = smooth(c.shotT + 0.06, c.shotT + 0.06 + Math.max(0.3, (c.goalT - c.shotT) * 0.9), tt) * (1 - smooth(c.goalT + 1.4, c.goalT + 2.2, tt));
          diveR(u, k);
          const m = 1.3 * diveAmt * k; if (m > kmag) { kmag = m; kdir = diveDir; }      // le plus ample des deux plongeons, jamais leur somme (n° 140)
          lift = Math.max(lift, 0.45 * diveAmt * Math.sin(Math.PI * Math.min(1, k)) * (tt < c.goalT + 0.3 ? 1 : 0.4));
          z += diveDir * diveReach * k;
        }
      } else if (i === c.scorer && c.shotT != null && !c.own) { if (c.head) (u.rigged ? headerR : header)(u, tt - c.shotT); else (u.rigged ? kickR : kick)(u, tt - c.shotT, kickLeg); }
      if (i === c.keeper && c.shotT != null && !(u.rigged && hasGest)) {
        const k = smooth(c.shotT + 0.06, c.shotT + 0.06 + Math.max(0.3, (c.goalT - c.shotT) * 0.9), tt) * (1 - smooth(c.goalT + 1.4, c.goalT + 2.2, tt));
        (u.rigged ? diveR : dive)(u, k);
        kmag = 1.3 * diveAmt * k; kdir = diveDir; lift = 0.45 * diveAmt * Math.sin(Math.PI * Math.min(1, k)) * (tt < c.goalT + 0.3 ? 1 : 0.4);
        z += diveDir * diveReach * k;      // il s'étire vers le ballon, au-delà de ce que le moteur lui fait parcourir
      }
      // plongeon (n° 140, remarque de Frédéric : « un salto arrière ») : dans le moteur, le gardien regarde dans le sens où il se déplace,
      // donc le long de sa ligne quand il se jette. On le tourne face au jeu, puis il bascule sur le côté du ballon, 83° au plus.
      let yaw = -face;
      if (kmag > 0.01) {
        const F = p.x > 0 ? Math.PI : 0, a = Math.min(1, kmag / 0.5), dA = Math.atan2(Math.sin(F - p.face), Math.cos(F - p.face));
        yaw = -(p.face + dA * a);
        roll += kdir * Math.sign(Math.cos(F)) * Math.min(1.45, kmag);
      }
      f.position.set(x, lift + filmY, z); f.rotation.set(roll, yaw, pitch); f.scale.setScalar(u.rigged ? 1.03 : 1.12);
      const bl = blobs[i], spread = 1 + 0.6 * Math.min(1, Math.abs(roll) + Math.abs(pitch));      // couché (plongeon, tacle) : l'ombre s'étale
      bl.position.set(x, 0.01, z); bl.scale.setScalar(spread * (1 + lift));
    });
    // le ballon : dans le but, il s'arrête dans le filet, qui se creuse
    let bx = S.ball.x, by = Math.max(0, S.ball.z), bz = S.ball.y;
    const th = hasGest && throws.find(g => tt > g.t - 2.5 && tt < g.t + g.fly && figs[g.i] && figs[g.i].userData.rigged);
    if (th) {      // touche : dans les mains au-dessus de la tête, puis lancé ; il retombe là où le moteur le fait rouler
      const h = P3().handsAt(figs[th.i]);
      if (tt < th.t) { bx = h.x; by = h.y + 0.04 - BR; bz = h.z; }
      else { const u = (tt - th.t) / th.fly; by += (2.15 - BR) * (1 - u) * (1 + 1.2 * u); }
    }
    const N = nets.find(n => n.d === Math.sign(bx));
    if (N && Math.abs(bx) > HL && Math.abs(bz) < GW + 0.2 && by < GH) {
      const push = clamp(Math.abs(bx) - (HL + GD - 0.3), 0, 0.7);
      for (let st = gdt; st > 1e-6; st -= 0.03) { const h = Math.min(0.03, st); N.vs += (90 * (push - N.s) - 9 * N.vs) * h; N.s += N.vs * h; }      // petits pas : le filet reste stable même si les images sont lentes
      N.hy = clamp(by + BR, 0.3, GH - 0.4); N.hz = clamp(bz, -GW + 0.4, GW - 0.4);
      bx = N.d * Math.min(Math.abs(bx), HL + GD - 0.2 + Math.max(0, N.s) * 0.9);
    } else if (N) for (let st = gdt; st > 1e-6; st -= 0.03) { const h = Math.min(0.03, st); N.vs += (-90 * N.s - 9 * N.vs) * h; N.s += N.vs * h; }
    for (const n of nets) updateNet(n);
    if (ballLast) { const dx = bx - ballLast.x, dz = bz - ballLast.z, dd = Math.hypot(dx, dz); if (dd > 1e-4 && dd < 5) ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / dd, 0, -dx / dd), dd / BR)); }
    ballLast = { x: bx, z: bz };
    ball.position.set(bx, by + BR, bz);
    placeCamera(s.cam, S, bx, by, bz, dt);
    stade.update(tt, c.goalT != null ? smooth(c.goalT + 0.15, c.goalT + 0.7, tt) : 0);      // le public saute après le but
    if (post && post.on !== false) {
      const P = post.U, k = H / 720;
      P.focus.value = dof.focus; P.blur.value = dof.blur * k; P.nearK.value = dof.nearK; P.maxB.value = 12 * k; P.time.value = tt;
      post.render(scene, camera);
    } else renderer.render(scene, camera);
  }
  // les deux caméras ; elles glissent en douceur (temps réel : au ralenti, elles restent bien sur l'action)
  function placeCamera(kind, S, bx, by, bz, dt) {
    const c = clip, gx = c.side * HL, k = cam ? 1 - Math.exp(-dt * (kind === 'buteur' ? 5 : 3)) : 1;
    let pos, look, fov;
    if (kind === 'pres') {      // gros plan de côté sur un joueur (essais et captures des gestes)
      const F = figs[c.focus].position, fa = -figs[c.focus].rotation.y, p = { x: F.x, y: F.z }, sx = -Math.sin(fa), sz = Math.cos(fa);      // le joueur tel qu'il est affiché
      pos = [p.x + sx * 4.2 + Math.cos(fa) * 1.6, 1.5, p.y + sz * 4.2 + Math.sin(fa) * 1.6]; look = [p.x, 0.75, p.y]; fov = 38;
    } else if (kind === 'buteur') {
      const p = S.players[c.scorer], dx = gx - p.x, dy = -p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const after = smooth(c.shotT - 0.1, c.shotT + 0.4, t);
      pos = [p.x - ux * 4.6 - uy * 1.2, 2.0, p.y - uy * 4.6 + ux * 1.2];
      const ahead = [p.x + ux * 7, 0.9, p.y + uy * 7];
      look = [lerp(lerp(bx, ahead[0], 0.5), bx, after), lerp(lerp(by + 0.3, ahead[1], 0.5), by + 0.4, after), lerp(lerp(bz, ahead[2], 0.5), bz, after)];
      look[0] += 0.05 * Math.sin(t * 1.7); look[1] += 0.035 * Math.sin(t * 2.3 + 1); look[2] += 0.05 * Math.sin(t * 1.3 + 2);      // caméra à l'épaule : elle bouge à peine (n° 141)
      fov = 42;
    } else {
      // caméra télé de replay : plus basse et plus près que celle du match, légèrement tournée vers le but
      const k = 0.25 * smooth(c.shotT - 2, c.shotT, t);
      look = [lerp(bx, gx, k), 0.6 + by * 0.5, lerp(bz, 0, k) * 0.9];
      pos = [clamp(bx, -HL + 2, HL - 2) - c.side * 8, 9, bz * 0.6 + 21];
      fov = lerp(30, 25, smooth(c.shotT - 3, c.shotT - 0.8, t));      // le cadreur resserre le plan avant le tir (n° 141)
    }
    if (!cam) cam = { pos: pos.slice(), look: look.slice() };
    for (let i = 0; i < 3; i++) { cam.pos[i] += (pos[i] - cam.pos[i]) * k; cam.look[i] += (look[i] - cam.look[i]) * k; }
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]); camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    figs.forEach((f, i) => { f.visible = i === c.scorer || (kind === 'pres' && i === c.focus) || Math.hypot(f.position.x - cam.pos[0], f.position.z - cam.pos[2]) > 3; if (blobs[i]) blobs[i].visible = f.visible; });      // pas de joueur collé à l'objectif
    sun.position.set(cam.look[0] - 30, 55, cam.look[2] + 38); sun.target.position.set(cam.look[0], 0, cam.look[2]);
    // le flou de profondeur : net sur l'action (le ballon pour la caméra du buteur, qui fait le point du tireur vers le but)
    const fx = kind === 'buteur' ? bx : cam.look[0], fy = kind === 'buteur' ? by + 0.3 : cam.look[1], fz = kind === 'buteur' ? bz : cam.look[2];
    const fd = Math.max(3, Math.hypot(fx - cam.pos[0], fy - cam.pos[1], fz - cam.pos[2]));
    dof.focus = dof.focus && cam.f ? dof.focus + (fd - dof.focus) * k : fd; cam.f = true;
    dof.blur = kind === 'buteur' ? 7 : kind === 'pres' ? 5 : 3; dof.nearK = kind === 'buteur' ? 0.45 : kind === 'pres' ? 0.5 : 0.12;
  }
  /* clip : { t0, t1, shotT, goalT, side (but en x = side × 52,5), scorer, keeper (index des joueurs, -1 sinon), own (contre son camp), head,
             teams: [{ color }], players: [{ team, role, num, name }], at(t) → { players: [{ x, y, face, v }], ball: { x, y, z } } }
     touches (n° 133, facultatif) : [[instant, joueur, geste, hauteur du ballon], ...] (journal du moteur, voir engine.js noteTouch)
     hooks : { onAngle(nom), onEnd() } */
  function play(c, h) {
    stop(); clip = c; hooks = h || {};
    segs = [{ cam: 'tele', from: c.t0, to: c.t1 }];
    if (c.scorer >= 0 && !c.own && c.shotT != null) segs.push({ cam: 'buteur', from: Math.max(c.t0, c.shotT - 2.2), to: Math.min(c.t1, c.goalT + 1.3) });
    setup(c); si = 0; t = segs[0].from; cam = null; ballLast = null; last = performance.now(); perf.n = 0; perf.sum = 0; perf.slow = 0;
    if (hooks.onAngle) hooks.onAngle(segs[0].cam);
    render(t, 0, 0, segs[0]);
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  // une seule image, à l'instant tt, avec la caméra « nom » (pour les essais et les captures)
  function still(c, tt, kind, focus) { stop(); clip = c; c.focus = focus; hooks = {}; setup(c); t = tt; cam = null; ballLast = null; render(tt, 0, 0, { cam: kind }); }
  self.__rp3 = { scene, renderer, camera, post, stade };
  return { play, stop, resize, still, playing: () => !!raf };
}

return { create };
});
