/* Fabrique mouvements.js : de vrais mouvements filmés (base de capture de mouvement de l'université Carnegie Mellon, mocap.cs.cmu.edu,
   libre d'utilisation, y compris dans un jeu) transposés sur le squelette des joueurs 3D (mannequin Xbot, voir players3d.js).
   Usage : node tools/mouvements.js        (télécharge les fichiers une fois dans tools/node_modules/.cache/cmu, puis écrit mouvements.js)

   Comment : un fichier .asf décrit le squelette de l'acteur (os, longueurs, axes), un fichier .amc ses angles image par image (120 par seconde).
   On calcule la rotation de chaque os dans l'espace (cinématique directe), puis on la recopie sur l'os correspondant du mannequin.
   Les deux squelettes sont debout bras à l'horizontale quand toutes leurs rotations sont nulles ; seule la direction de repos des os
   diffère un peu (jambes de l'acteur écartées de 20°, pied plus ou moins incliné…) : une rotation fixe par os rattrape cet écart.
   Deux sortes de mouvements :
   - les frappes (un seul geste) : alignées pour que le pied parte vers l'avant au contact ; on garde le chemin du bassin au sol (le replay
     pose le joueur dessus, pied d'appui planté) et l'endroit du pied qui frappe, pour le mettre sur le ballon ;
   - les boucles (course arrière, pas chassés) : on cherche la foulée la plus régulière, on retire l'avancée et on raccorde la fin au début.
   Les pieds sont posés au sol en calculant leur hauteur sur le squelette du mannequin. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(__dirname, 'node_modules', '.cache'), DIR = path.join(CACHE, 'cmu');
const R3 = require(path.join(ROOT, 'render3d.js')), LIBF = path.join(CACHE, 'three-r128.min.js');
const P3 = require(path.join(ROOT, 'players3d.js')), GLB = path.join(CACHE, path.basename(P3.MODEL));
fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(LIBF)) execFileSync('curl', ['-sS', '-o', LIBF, R3.LIB]);
if (!fs.existsSync(GLB)) execFileSync('curl', ['-sS', '-o', GLB, P3.MODEL]);
const THREE = require(LIBF), V = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4, deg = Math.PI / 180;
const fetch = f => { const out = path.join(DIR, path.basename(f)); if (!fs.existsSync(out) || fs.statSync(out).size < 1000) execFileSync('curl', ['-sS', '--max-time', '120', '-o', out, 'http://mocap.cs.cmu.edu/subjects/' + f]); return fs.readFileSync(out, 'utf8'); };

/* Les mouvements choisis (les prises ont été regardées une à une, voir le journal n° 143).
   frappe : sujet, prise, de … à … secondes autour du contact ; boucle : sujet, prise, morceau où chercher la foulée, vitesse minimale */
const CLIPS = {
  tir: { kind: 'frappe', subj: 10, take: '10_05' },           // frappe puissante du cou-de-pied, après deux pas d'élan (pied à 18 m/s)
  frappe: { kind: 'frappe', subj: 10, take: '10_01' },        // même geste, un peu moins appuyé : longs ballons, dégagements, centres
  passe: { kind: 'frappe', subj: 143, take: '143_24' },       // petite frappe posée, presque à l'arrêt : passes
  saut: { kind: 'saut', subj: 16, take: '16_02' },            // saut sur deux pieds (25 cm) : les têtes
  recul: { kind: 'boucle', subj: 76, take: '76_11', from: 0.8, to: 3.6, minV: 0.7, dirTo: 180 },      // grands pas rapides en arrière, buste penché vers l'avant
  cote: { kind: 'boucle', subj: 78, take: '78_29', minV: 0, dirTo: -90 },                            // pas chassés vers la droite, fléchi (défense)
};
const KICK = [-0.8, 0.8], FPS_KICK = 60, FPS_LOOP = 30;

// ---------- lecture des fichiers ----------
function parseASF(txt) {
  const bones = { root: { name: 'root', dir: new V(), len: 0, C: new M4(), Ci: new M4(), dofs: [], kids: [] } };
  let unit = 1, cur = null, sec = '';
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    if (l[0] === ':') { sec = l.split(/\s+/)[0]; continue; }
    const w = l.split(/\s+/);
    if (sec === ':units' && w[0] === 'length') unit = +w[1];
    if (sec === ':bonedata') {
      if (w[0] === 'begin') cur = { kids: [], dofs: [] };
      else if (w[0] === 'end') { cur.C = new M4().makeRotationFromEuler(new THREE.Euler(cur.axis[0] * deg, cur.axis[1] * deg, cur.axis[2] * deg, 'ZYX')); cur.Ci = cur.C.clone().invert(); bones[cur.name] = cur; cur = null; }
      else if (w[0] === 'name') cur.name = w[1];
      else if (w[0] === 'direction') cur.dir = new V(+w[1], +w[2], +w[3]).normalize();
      else if (w[0] === 'length') cur.len = +w[1];
      else if (w[0] === 'axis') cur.axis = [+w[1], +w[2], +w[3]];
      else if (w[0] === 'dof') cur.dofs = w.slice(1);
    }
    if (sec === ':hierarchy' && w[0] !== 'begin' && w[0] !== 'end') for (const k of w.slice(1)) bones[w[0]].kids.push(k);
  }
  return { bones, scale: 0.0254 / unit };      // longueurs en (1 / unit) pouces → mètres
}
function parseAMC(txt) {
  const frames = []; let f = null;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#' || l[0] === ':') continue;
    if (/^\d+$/.test(l)) { f = {}; frames.push(f); continue; }
    const w = l.split(/\s+/); f[w[0]] = w.slice(1).map(Number);
  }
  return frames;
}
// cinématique directe (convention des fichiers Acclaim : M = M_parent · C · Rz·Ry·Rx · C⁻¹) : rotation monde et début / fin de chaque os
function fk(asf, fr) {
  const out = {}, S = asf.scale;
  const go = (name, parentM, start) => {
    const b = asf.bones[name], v = fr[name] || [];
    let M;
    if (name === 'root') { start = new V(v[0], v[1], v[2]).multiplyScalar(S); M = new M4().makeRotationFromEuler(new THREE.Euler(v[3] * deg, v[4] * deg, v[5] * deg, 'ZYX')); }
    else {
      const r = [0, 0, 0]; b.dofs.forEach((d, k) => { r['xyz'.indexOf(d[1])] = (v[k] || 0) * deg; });
      M = parentM.clone().multiply(b.C).multiply(new M4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2], 'ZYX'))).multiply(b.Ci);
    }
    const end = start.clone().add(b.dir.clone().applyMatrix4(new M4().extractRotation(M)).multiplyScalar(b.len * S));
    out[name] = { q: new Q().setFromRotationMatrix(M), start, end };
    for (const k of b.kids) go(k, M, end);
  };
  go('root', null, null);
  return out;
}
// le squelette du mannequin, lu dans le fichier .glb : position de repos de chaque os par rapport à son parent (m) ; rotations de repos nulles
function xbot(file) {
  const b = fs.readFileSync(file), len = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + len).toString()), by = {};
  for (const n of J.nodes) { const q = n.rotation || [0, 0, 0, 1]; if (/mixamorig/.test(n.name) && Math.abs(q[3]) < 0.9999) throw new Error('le mannequin n\'a plus des rotations de repos nulles : ' + n.name); by[n.name.replace(/^mixamorig:?/, '')] = { t: new V().fromArray(n.translation || [0, 0, 0]).multiplyScalar(0.01) }; }
  return by;
}

// ---------- transposition ----------
// os du mannequin ← os de l'acteur, et l'enfant qui donne la direction de l'os du mannequin
const MAP = [['Hips', 'root', null], ['Spine', 'lowerback', 'Spine1'], ['Spine1', 'upperback', 'Spine2'], ['Spine2', 'thorax', 'Neck'], ['Neck', 'lowerneck', 'Head'], ['Head', 'head', 'HeadTop_End']];
for (const [s, c] of [['Left', 'l'], ['Right', 'r']]) MAP.push(
  [s + 'Shoulder', c + 'clavicle', s + 'Arm'], [s + 'Arm', c + 'humerus', s + 'ForeArm'], [s + 'ForeArm', c + 'radius', s + 'Hand'], [s + 'Hand', c + 'hand', s + 'HandMiddle1'],
  [s + 'UpLeg', c + 'femur', s + 'Leg'], [s + 'Leg', c + 'tibia', s + 'Foot'], [s + 'Foot', c + 'foot', s + 'ToeBase'], [s + 'ToeBase', c + 'toes', s + 'Toe_End']);
const PARENT = { Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck' };
for (const s of ['Left', 'Right']) Object.assign(PARENT, { [s + 'Shoulder']: 'Spine2', [s + 'Arm']: s + 'Shoulder', [s + 'ForeArm']: s + 'Arm', [s + 'Hand']: s + 'ForeArm', [s + 'UpLeg']: 'Hips', [s + 'Leg']: s + 'UpLeg', [s + 'Foot']: s + 'Leg', [s + 'ToeBase']: s + 'Foot' });
const BONES = MAP.map(m => m[0]);
const X = xbot(GLB);
function retargeter(asf) {
  const Ainv = {};
  for (const [m, c, kid] of MAP) Ainv[m] = kid ? new Q().setFromUnitVectors(asf.bones[c].dir.clone(), X[kid].t.clone().normalize()).invert() : new Q();
  const legC = (asf.bones.lfemur.len + asf.bones.ltibia.len) * asf.scale, legX = X.LeftLeg.t.length() + X.LeftFoot.t.length();
  return { Ainv, ratio: legX / legC };      // ratio : échelle des déplacements du bassin (longueur de jambe)
}
// rotations locales des os du mannequin pour une image ; yaw : rotation autour de la verticale appliquée à tout le corps
function pose(R, F, yaw) {
  const Y = new Q().setFromAxisAngle(new V(0, 1, 0), yaw), W = {}, out = {};
  for (const [m, c] of MAP) W[m] = Y.clone().multiply(F[c].q).multiply(R.Ainv[m]);
  for (const m of BONES) { const p = PARENT[m]; out[m] = p ? W[p].clone().invert().multiply(W[m]) : W[m].clone(); }
  return out;
}
// position monde des os du mannequin (bassin à hips) : pour poser les pieds au sol et trouver le pied qui frappe
function world(po, hips) {
  const W = {}, Pw = {};
  for (const m of BONES) { const p = PARENT[m]; if (!p) { W[m] = po[m]; Pw[m] = hips.clone(); continue; } W[m] = W[p].clone().multiply(po[m]); Pw[m] = Pw[p].clone().add(X[m].t.clone().applyQuaternion(W[p])); }
  const pt = {};
  for (const s of ['Left', 'Right']) {
    pt[s + 'Tip'] = Pw[s + 'ToeBase'].clone().add(X[s + 'Toe_End'].t.clone().applyQuaternion(W[s + 'ToeBase']));
    pt[s + 'Heel'] = Pw[s + 'Foot'].clone().add(new V(0, -0.085, -0.03).applyQuaternion(W[s + 'Foot']));
    pt[s + 'Ball'] = Pw[s + 'ToeBase'];
  }
  Object.defineProperty(pt, 'Head', { value: Pw.Head.clone().add(new V(0, 0.1, 0.04).applyQuaternion(W.Head)), enumerable: false });      // le front (hors des points des pieds)
  return pt;
}
const lowest = pt => Math.min(...Object.values(pt).map(v => v.y));
const yawOf = q => { const f = new V(0, 0, 1).applyQuaternion(q); return Math.atan2(f.x, f.z); };

function kickClip(spec) {
  const asf = parseASF(fetch(spec.subj + '/' + String(spec.subj).padStart(2, '0') + '.asf')), R = retargeter(asf);
  const P = parseAMC(fetch(spec.subj + '/' + spec.take + '.amc')).map(f => fk(asf, f));
  // le contact : le bout du pied le plus rapide de toute la prise
  let best = { v: 0 };
  for (let i = 1; i < P.length; i++) for (const s of ['l', 'r']) { const v = P[i][s + 'toes'].end.distanceTo(P[i - 1][s + 'toes'].end) * 120; if (v > best.v) best = { v, i, s }; }
  if (best.s !== 'r') throw new Error(spec.take + ' : frappe du pied gauche, non prévue');
  // le pied est le plus rapide juste après le ballon (il remonte) : le contact est le bas de l'arc, juste avant, quand le pied file déjà
  let k = best.i;
  for (let j = best.i - 36; j <= best.i; j++) { const v = P[j].rtoes.end.distanceTo(P[j - 1].rtoes.end) * 120; if (v > 0.45 * best.v && P[j].rfoot.end.y < P[k].rfoot.end.y) k = j; } d = P[k].rtoes.end.clone().sub(P[k - 2].rtoes.end);
  const yaw = -Math.atan2(d.x, d.z), Y = new Q().setFromAxisAngle(new V(0, 1, 0), yaw), c0 = P[k].root.start;      // le pied part vers l'avant (+z)
  const n = Math.round((KICK[1] - KICK[0]) * FPS_KICK) + 1, frames = [];
  for (let j = 0; j < n; j++) {
    const f = Math.max(0, Math.min(P.length - 1, Math.round(k + (KICK[0] + j / FPS_KICK) * 120)));
    const po = pose(R, P[f], yaw), g = P[f].root.start.clone().sub(c0).applyQuaternion(Y).multiplyScalar(R.ratio);
    frames.push({ po, y: P[f].root.start.y * R.ratio, path: [g.x, g.z] });
  }
  // pieds au sol : le point le plus bas de la prise touche le sol
  const low = Math.min(...frames.map(F => lowest(world(F.po, new V(0, F.y, 0))))); frames.forEach(F => { F.y -= low; });
  const at = Math.round(-KICK[0] * FPS_KICK), C = world(frames[at].po, new V(0, frames[at].y, 0));
  const foot = C.RightBall.clone().lerp(C.RightTip, 0.3);      // le pied qui frappe au contact (le cou-de-pied), par rapport au bassin (au sol)
  return { fps: FPS_KICK, contact: at / FPS_KICK, foot: [+foot.x.toFixed(3), +foot.z.toFixed(3)], speed: +best.v.toFixed(1), frames, info: spec.take + ' : contact à ' + (k / 120).toFixed(2) + ' s (' + Math.round((best.i - k) / 0.12) + ' ms avant le pied le plus rapide, ' + best.v.toFixed(1) + ' m/s), plante du pied à ' + Math.round(P[k].rfoot.end.y * 100 - Math.min(...P.map(q => q.rfoot.end.y)) * 100) + ' cm du sol' };
}
// le saut : le « contact » est le sommet (bassin le plus haut) ; on garde le chemin du bassin et la tête au sommet, pour la mettre sur le ballon
function jumpClip(spec) {
  const asf = parseASF(fetch(spec.subj + '/' + String(spec.subj).padStart(2, '0') + '.asf')), R = retargeter(asf);
  const P = parseAMC(fetch(spec.subj + '/' + spec.take + '.amc')).map(f => fk(asf, f));
  let k = 0; P.forEach((p, i) => { if (p.root.start.y > P[k].root.start.y) k = i; });
  const yaw = -yawOf(P[k].root.q), Y = new Q().setFromAxisAngle(new V(0, 1, 0), yaw), c0 = P[k].root.start;
  const n = Math.round((KICK[1] - KICK[0]) * FPS_KICK) + 1, frames = [];
  for (let j = 0; j < n; j++) {
    const f = Math.max(0, Math.min(P.length - 1, Math.round(k + (KICK[0] + j / FPS_KICK) * 120)));
    const g = P[f].root.start.clone().sub(c0).applyQuaternion(Y).multiplyScalar(R.ratio);
    frames.push({ po: pose(R, P[f], yaw), y: P[f].root.start.y * R.ratio, path: [g.x, g.z] });
  }
  const low = Math.min(...frames.map(F => lowest(world(F.po, new V(0, F.y, 0))))); frames.forEach(F => { F.y -= low; });
  const at = Math.round(-KICK[0] * FPS_KICK), C = world(frames[at].po, new V(0, frames[at].y, 0));
  return { fps: FPS_KICK, contact: at / FPS_KICK, head: [+C.Head.x.toFixed(3), +C.Head.y.toFixed(3), +C.Head.z.toFixed(3)], frames,
    info: spec.take + ' : sommet à ' + (k / 120).toFixed(2) + ' s, pieds à ' + Math.round(lowest(C) * 100) + ' cm du sol, tête à ' + C.Head.y.toFixed(2) + ' m' };
}
function loopClip(spec) {
  const asf = parseASF(fetch(spec.subj + '/' + String(spec.subj).padStart(2, '0') + '.asf')), R = retargeter(asf);
  const P = parseAMC(fetch(spec.subj + '/' + spec.take + '.amc')).map(f => fk(asf, f)), n = P.length;
  const i0 = Math.round((spec.from || 0) * 120), i1 = Math.min(n - 1, Math.round((spec.to || n / 120) * 120));
  // la foulée la plus régulière : deux images dont les chevilles, genoux et poignets sont au même endroit par rapport au bassin
  const sig = i => { const p = P[i], r = p.root.start, Yi = new Q().setFromAxisAngle(new V(0, 1, 0), -yawOf(p.root.q)); return ['ltibia', 'rtibia', 'lfemur', 'rfemur', 'lradius', 'rradius'].map(b => p[b].end.clone().sub(r).applyQuaternion(Yi)); };
  const S = P.map((_, i) => sig(i)), dist = (i, j) => S[i].reduce((a, v, b) => a + v.distanceTo(S[j][b]), 0);
  const spd = i => P[Math.min(n - 1, i + 6)].root.start.clone().sub(P[Math.max(0, i - 6)].root.start).setY(0).length() * 10;
  let best = { d: 1e9 };
  for (let T = 40; T <= 120; T++) for (let s = i0; s + T + 12 <= i1; s += 2) { if (spd(s) < spec.minV || spd(s + T) < spec.minV) continue; const d = dist(s, s + T) + dist(s + 6, s + T + 6); if (d < best.d) best = { d, s, T }; }
  const { s, T } = best, K = 12;
  let cx = 0, cz = 0; for (let i = s; i < s + T; i++) { const y = yawOf(P[i].root.q); cx += Math.sin(y); cz += Math.cos(y); }
  // bassin tourné vers l'avant en moyenne ; puis, si demandé, tout le mouvement tourné pour que le déplacement aille dans la direction voulue
  // (l'acteur recule en diagonale : on le fait reculer droit, le bassin reste un peu de biais, comme un défenseur qui temporise)
  let yaw0 = Math.atan2(cx, cz);
  const mv = P[s + T].root.start.clone().sub(P[s].root.start).applyQuaternion(new Q().setFromAxisAngle(new V(0, 1, 0), -yaw0));
  if (spec.dirTo != null) yaw0 += Math.atan2(mv.x, mv.z) - spec.dirTo * deg;
  const Y = new Q().setFromAxisAngle(new V(0, 1, 0), -yaw0);
  const vel = P[s + T].root.start.clone().sub(P[s].root.start).multiplyScalar(120 / T).applyQuaternion(Y); vel.y = 0;
  const raw = i => { const h = P[i].root.start.clone().sub(P[s].root.start).applyQuaternion(Y).sub(vel.clone().multiplyScalar((i - s) / 120)).multiplyScalar(R.ratio); h.y = P[i].root.start.y * R.ratio; return { po: pose(R, P[i], -yaw0), h }; };
  const N = Math.round(T / 120 * FPS_LOOP), frames = [];
  for (let j = 0; j < N; j++) {
    const i = Math.round(s + j * T / N), r = raw(i);
    if (i - s < K) {      // raccord : on part de la suite de la foulée (au-delà de la fin) et on rejoint la prise en douceur
      const w = (i - s) / K, w2 = w * w * (3 - 2 * w), e = raw(i + T);
      for (const b in r.po) r.po[b] = e.po[b].clone().slerp(r.po[b], w2);
      r.h.lerp(e.h, 1 - w2);
    }
    frames.push({ po: r.po, y: r.h.y, sway: [r.h.x, r.h.z] });
  }
  const low = Math.min(...frames.map(F => lowest(world(F.po, new V(0, F.y, 0))))); frames.forEach(F => { F.y -= low; });
  return { fps: FPS_LOOP, loop: true, speed: +(vel.length() * R.ratio).toFixed(2), dir: Math.round(Math.atan2(vel.x, vel.z) / deg), frames,
    info: spec.take + ' : foulée de ' + (T / 120).toFixed(2) + ' s à ' + (s / 120).toFixed(2) + ' s, ' + (vel.length() * R.ratio).toFixed(2) + ' m/s, direction ' + Math.round(Math.atan2(vel.x, vel.z) / deg) + '°' };
}

// ---------- écriture : nombres entiers sur 16 bits, en base 64 (quaternions × 32767, longueurs en millimètres) ----------
const b64 = a => Buffer.from(new Int16Array(a).buffer).toString('base64');
const out = { bones: BONES, clips: {} };
for (const [name, spec] of Object.entries(CLIPS)) {
  const c = spec.kind === 'frappe' ? kickClip(spec) : spec.kind === 'saut' ? jumpClip(spec) : loopClip(spec), q = [], h = [], p = [];
  for (const F of c.frames) {
    for (const b of BONES) { const v = F.po[b]; if (v.w < 0) v.set(-v.x, -v.y, -v.z, -v.w); q.push(...v.toArray().map(x => Math.round(x * 32767))); }
    const sw = F.sway || [0, 0]; h.push(Math.round(sw[0] * 1000), Math.round(F.y * 1000), Math.round(sw[1] * 1000));
    if (F.path) p.push(Math.round(F.path[0] * 1000), Math.round(F.path[1] * 1000));
  }
  const o = { fps: c.fps, n: c.frames.length, q: b64(q), hips: b64(h) };
  if (c.loop) Object.assign(o, { loop: true, speed: c.speed, dir: c.dir }); else Object.assign(o, { contact: c.contact, path: b64(p) }, c.foot ? { foot: c.foot } : { head: c.head });
  out.clips[name] = o;
  console.log(name.padEnd(7) + c.info + ', ' + c.frames.length + ' images');
}
const src = `/* Mouvements filmés pour les joueurs 3D (n° 143) : fabriqué par tools/mouvements.js, ne pas modifier à la main.
   Source : base de capture de mouvement de l'université Carnegie Mellon (mocap.cs.cmu.edu), créée grâce au financement NSF EIA-0196217.
   Transposés sur le squelette du mannequin de players3d.js : pour chaque mouvement, images par seconde (fps), nombre d'images (n),
   rotations locales des os (q : quaternions × 32767, os dans l'ordre de « bones »), bassin (hips : écart latéral, hauteur, écart avant, en mm) ;
   frappes et saut : instant du contact ou du sommet (s), pied qui frappe au contact par rapport au bassin (foot, m) ou front au sommet (head : x, hauteur, z, m),
   chemin du bassin au sol (path, mm) ;
   boucles : vitesse de l'acteur (m/s) et direction du déplacement (degrés : 0 en avant, 90 vers sa gauche, −90 vers sa droite). */
(function (root, data) { if (typeof module === 'object' && module.exports) module.exports = data; else root.Mouvements3D = data; })(typeof self !== 'undefined' ? self : this,
${JSON.stringify(out)});
`;
fs.writeFileSync(path.join(ROOT, 'mouvements.js'), src);
console.log('mouvements.js écrit (' + Math.round(src.length / 1024) + ' ko)');
