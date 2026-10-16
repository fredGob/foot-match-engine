/* Joueurs 3D animés avec de vrais mouvements enregistrés (demande de Frédéric, n° 129) : un mannequin tout prêt (« Xbot » des exemples de
   three.js, mouvements capturés sur un vrai acteur : immobile, marche, course), chargé depuis internet une seule fois, cloné pour chaque joueur
   et habillé aux couleurs de son équipe (maillot et manches, short, chaussettes, peau, cheveux, chaussures ; gants pour le gardien).
   La course suit la vitesse du joueur dans le match : on mélange immobile, marche et course, et la cadence s'accélère avec lui.
   Utilisé par la vue 3D du match (render3d.js) et par le replay des buts (replay3d.js). Sans internet, ils gardent leurs joueurs faits main. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Players3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const JS = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
const LIBS = [JS + 'loaders/GLTFLoader.js', JS + 'utils/SkeletonUtils.js'];
const MODEL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Xbot.glb';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

let gltf = null, loading = false, failed = null;
const waiters = [];
function script(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => ko(new Error('chargement impossible : ' + src)); document.head.appendChild(s); });
}
// charge le chargeur de modèles, l'outil de copie des squelettes et le mannequin ; rappelle cb(erreur ou null)
function load(cb) {
  if (gltf) return cb(null);
  if (failed) return cb(failed);
  waiters.push(cb); if (loading) return; loading = true;
  const done = e => { loading = false; failed = e; const w = waiters.splice(0); w.forEach(f => f(e)); };
  (THREE.GLTFLoader ? Promise.resolve() : script(LIBS[0]))
    .then(() => THREE.SkeletonUtils ? null : script(LIBS[1]))
    .then(() => new Promise((ok, ko) => new THREE.GLTFLoader().load(MODEL, ok, undefined, () => ko(new Error('mannequin 3D introuvable')))))
    .then(g => { gltf = g; done(null); }, e => done(e));
}
const ready = () => !!gltf;

/* La tenue : le mannequin est d'une seule pièce ; on le colorie selon la hauteur et l'écartement de chaque point dans sa pose de départ
   (debout, bras tendus à l'horizontale, 1,80 m) : chaussures, chaussettes, genoux, short, maillot et manches, avant-bras et mains, cou, tête, cheveux. */
function kitMaterial(kit, shade) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, skinning: true });
  const U = {};
  for (const k of ['shirt', 'shorts', 'socks', 'skin', 'hair', 'boots', 'hands']) U['k_' + k] = { value: kit[k].clone().multiplyScalar(shade) };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBind = position;');
    sh.fragmentShader = 'varying vec3 vBind;\nuniform vec3 k_shirt, k_shorts, k_socks, k_skin, k_hair, k_boots, k_hands;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float y = vBind.y, ax = abs(vBind.x);
      vec3 c = k_skin;
      if (y < 0.085) c = k_boots;
      else if (y < 0.47) c = k_socks;
      else if (y < 0.66) c = k_skin;
      else if (y < 0.99) c = ax < 0.27 ? k_shorts : k_skin;
      else if (y < 1.54 && !(y > 1.46 && ax < 0.085)) c = ax < 0.43 ? k_shirt : (ax > 0.66 ? k_hands : k_skin);
      else if (y > 1.70 || (y > 1.57 && vBind.z < -0.05)) c = k_hair;
      diffuseColor.rgb = c;`);
  };
  m.customProgramCacheKey = () => 'kit';
  return m;
}
// le numéro (et le nom) dans le dos
function backTexture(name, num, ink) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (name) { const nm = String(name).split(' ').pop().toUpperCase().slice(0, 12); g.font = '700 ' + (nm.length > 8 ? 13 : 16) + 'px system-ui, sans-serif'; g.fillText(nm, 64, 18); }
  g.font = '800 76px system-ui, sans-serif'; g.fillText(String(num), 64, 76);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

/* un joueur : kit = couleurs (THREE.Color) { shirt, shorts, socks, skin, hair, boots, hands } ; opts = { num, name, ink, shadow }.
   Renvoie un groupe à poser au sol, qui regarde vers +x (comme les joueurs faits main) ; joueurs3d.animate(g, vitesse, dt) le fait courir. */
function make(kit, opts) {
  opts = opts || {};
  const body = THREE.SkeletonUtils.clone(gltf.scene);
  body.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.material = kitMaterial(kit, /Joints/.test(o.name) ? 0.82 : 1);
    o.castShadow = opts.shadow !== false; o.receiveShadow = false; o.frustumCulled = false;
  });
  body.rotation.y = Math.PI / 2;      // le mannequin regarde vers +z ; on le tourne vers +x
  const g = new THREE.Group(); g.add(body);
  // numéro dans le dos, accroché au haut du dos (il suit le buste)
  const spine = body.getObjectByName('mixamorigSpine2') || body.getObjectByName('mixamorig:Spine2');
  if (spine && opts.num != null) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: backTexture(opts.name, opts.num, opts.ink || '#ffffff'), transparent: true, depthWrite: false }));
    plate.position.set(0, 6, -14.5); plate.rotation.y = Math.PI; spine.add(plate);      // le squelette est en centimètres
  }
  const mixer = new THREE.AnimationMixer(body), clip = n => gltf.animations.find(a => a.name === n);
  const A = { idle: mixer.clipAction(clip('idle')), walk: mixer.clipAction(clip('walk')), run: mixer.clipAction(clip('run')) };
  for (const k in A) { A[k].play(); A[k].setEffectiveWeight(0); }
  A.walk.time = Math.random() * A.walk.getClip().duration; A.run.time = Math.random() * A.run.getClip().duration;
  const bone = n => body.getObjectByName('mixamorig' + n) || body.getObjectByName('mixamorig:' + n);
  g.userData = { rigged: true, body, mixer, A, sp: 0, bones: { hips: bone('Hips'), spine: bone('Spine1'), lUp: bone('LeftUpLeg'), rUp: bone('RightUpLeg'), lLeg: bone('LeftLeg'), rLeg: bone('RightLeg'), lArm: bone('LeftArm'), rArm: bone('RightArm'), lFore: bone('LeftForeArm'), rFore: bone('RightForeArm'), head: bone('Head') } };
  return g;
}
// la course suit la vitesse v (m/s) du joueur dans le match ; dt : temps de jeu écoulé (0 en pause, petit au ralenti)
function animate(g, v, dt) {
  const u = g.userData, A = u.A;
  const idle = clamp(1 - v / 0.7, 0, 1), run = clamp((v - 2.2) / 1.8, 0, 1), walk = Math.max(0, 1 - idle - run);
  A.idle.setEffectiveWeight(idle); A.walk.setEffectiveWeight(walk); A.run.setEffectiveWeight(run);
  A.walk.setEffectiveTimeScale(clamp(v / 1.4, 0.6, 1.9));
  A.run.setEffectiveTimeScale(clamp(v / 4.6, 0.75, 1.55));
  u.mixer.update(Math.max(0, dt));
}

return { load, ready, make, animate, LIBS, MODEL };
});
