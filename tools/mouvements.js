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
   Les pieds sont posés au sol en calculant leur hauteur sur le squelette du mannequin.

   Depuis le n° 144, aussi le pack de football gratuit d'Anderson Rohr (« Free mocap pack 05: Soccer », andersonrohr.gumroad.com/l/mocap_pack5,
   gratuit à 0 €, utilisable dans un jeu, même commercial, sans obligation de le citer ; interdit de redistribuer les fichiers eux-mêmes) :
   ses fichiers FBX (squelette « Rokoko_Default ») ne sont PAS dans le dépôt. Pour refaire ces mouvements, les télécharger, puis copier
   le contenu du dossier mocap/Rokoko_Default dans tools/node_modules/.cache/rohr (ou donner le dossier : ROHR=dossier node tools/mouvements.js).
   Sans eux, l'outil reprend tels quels les mouvements du pack déjà présents dans mouvements.js.
   Les FBX sont lus dans le navigateur d'essai (three.js et son lecteur FBX), image par image (60 par seconde). Le squelette Rokoko est debout
   bras à l'horizontale, face vers l'avant comme le mannequin, mais ses os ont des rotations de repos : on recopie la rotation de chaque os
   depuis sa pose de repos. Un mouvement du pied gauche est retourné en miroir (le jeu le retourne à nouveau pour le pied gauche). */
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
  // passe CMU 143_24 (petite frappe posée) : remplacée au n° 144 par la passe de l'intérieur du pied du pack Rohr
  saut: { kind: 'saut', subj: 16, take: '16_02' },            // saut sur deux pieds (25 cm) : les têtes
  // pack d'Anderson Rohr (n° 144) : file = nom du FBX ; « geste » : instant de l'événement (at), morceau gardé (from, to), en secondes
  passe: { kind: 'frappe', src: 'rohr', file: '08_Side_Foot_Kick' },                 // vraie passe de l'intérieur du pied (remplace 143_24)
  penalty: { kind: 'frappe', src: 'rohr', file: '10_Penalty_Kick_01' },              // penalty (deux derniers pas d'élan, frappe)
  // 09_Power_Kick (frappe puissante, pied gauche) : regardée, moins ample que le tir CMU 10_05 : pas reprise
  touche: { kind: 'geste', src: 'rohr', file: '07_Throw_In', at: 6.583, from: 4.6, to: 7.4 },           // ballon tenu au-dessus de la tête (dès 2 s dans le fichier), lancer à 6,58 s
  plongeon: { kind: 'geste', src: 'rohr', file: '15_Goalkeeper_Save_01', at: 5.33, from: 4.3, to: 7.0 },  // gardien : plongeon vers sa gauche (sommet à 5,33 s)
  arret: { kind: 'geste', src: 'rohr', file: '16_Goalkeeper_Save_02', at: 3.3, from: 2.4, to: 4.35 },    // gardien : ballon capté à hauteur de poitrine
  sol: { kind: 'geste', src: 'rohr', file: '17_Goalkeeper_Save_03', at: 7.25, from: 6.0, to: 8.85 },    // gardien : arrêt au ras du sol
  tacle: { kind: 'geste', src: 'rohr', file: '18_Defending_01', at: 4.85, from: 4.0, to: 5.9, foot: 'Right' },   // tacle debout : pied droit lancé vers le ballon
  fete1: { kind: 'geste', src: 'rohr', file: '12_Goal_Celebration_01', at: 0.15, from: 0.15, to: 3.4 },  // célébrations du buteur : glissade à genoux
  fete2: { kind: 'geste', src: 'rohr', file: '13_Goal_Celebration_02', at: 0.15, from: 0.15, to: 3.45 }, // bras au ciel
  fete3: { kind: 'geste', src: 'rohr', file: '14_Goal_Celebration_03', at: 0.15, from: 0.15, to: 3.1 },  // saut et coup de poing
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
  Object.defineProperty(pt, 'Hands', { value: Pw.LeftHand.clone().lerp(Pw.RightHand, 0.5).add(new V(0, 0, 0)), enumerable: false });      // le milieu des deux mains
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

// ---------- le pack d'Anderson Rohr (FBX, squelette Rokoko), n° 144 ----------
const ROHR = process.env.ROHR || path.join(CACHE, 'rohr'), ROHR_JSON = path.join(CACHE, 'rohr-json');
const RK = ['Hips', 'Spine1', 'Spine2', 'Spine3', 'Spine4', 'Neck', 'Head', 'HeadTip'];
for (const s of ['Left', 'Right']) RK.push(s + 'Shoulder', s + 'Arm', s + 'ForeArm', s + 'Hand', s + 'Finger3Metacarpal', s + 'Thigh', s + 'Shin', s + 'Foot', s + 'Toe', s + 'ToeTip');
// os du mannequin ← os Rokoko, et l'enfant Rokoko qui donne sa direction de repos (le mannequin : comme pour la base CMU)
const RMAP = [['Hips', 'Hips', null], ['Spine', 'Spine2', 'Spine3'], ['Spine1', 'Spine3', 'Spine4'], ['Spine2', 'Spine4', 'Neck'], ['Neck', 'Neck', 'Head'], ['Head', 'Head', 'HeadTip']];
for (const s of ['Left', 'Right']) RMAP.push([s + 'Shoulder', s + 'Shoulder', s + 'Arm'], [s + 'Arm', s + 'Arm', s + 'ForeArm'], [s + 'ForeArm', s + 'ForeArm', s + 'Hand'], [s + 'Hand', s + 'Hand', s + 'Finger3Metacarpal'],
  [s + 'UpLeg', s + 'Thigh', s + 'Shin'], [s + 'Leg', s + 'Shin', s + 'Foot'], [s + 'Foot', s + 'Foot', s + 'Toe'], [s + 'ToeBase', s + 'Toe', s + 'ToeTip']);
const XKID = Object.fromEntries(MAP.map(m => [m[0], m[2]]));
// lit les FBX dans le navigateur d'essai : rotations et positions dans l'espace des os utiles, image par image (60 par seconde) ; gardé en cache
async function rohrRead(files) {
  fs.mkdirSync(ROHR_JSON, { recursive: true });
  const todo = files.filter(f => { const src = path.join(ROHR, f + '.fbx'), js = path.join(ROHR_JSON, f + '.json'); return fs.existsSync(src) && (!fs.existsSync(js) || fs.statSync(js).mtimeMs < fs.statSync(src).mtimeMs); });
  if (todo.length) {
    for (const u of ['loaders/FBXLoader.js', 'libs/fflate.min.js', 'curves/NURBSCurve.js', 'curves/NURBSUtils.js']) { const f = path.join(CACHE, path.basename(u)); if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '-o', f, 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/' + u]); }
    let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
    const b = await pw.chromium.launch(), p = await b.newPage();
    await p.setContent('<html><body></body></html>');
    for (const f of ['three-r128.min.js', 'fflate.min.js', 'NURBSUtils.js', 'NURBSCurve.js', 'FBXLoader.js']) await p.addScriptTag({ content: fs.readFileSync(path.join(CACHE, f), 'utf8') });
    for (const f of todo) {
      const r = await p.evaluate(([b64, BONES]) => {
        const o = new THREE.FBXLoader().parse(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer, '');
        const by = {}; o.traverse(x => { if (x.isBone) by[x.name] = x; });      // le dernier os d'un nom : le plus profond (le fichier double certains os)
        const V = new THREE.Vector3(), Qn = new THREE.Quaternion();
        const grab = () => { o.updateMatrixWorld(true); const q = {}, pp = {}; for (const n of BONES) { q[n] = by[n].getWorldQuaternion(Qn).toArray().map(v => +v.toFixed(5)); pp[n] = by[n].getWorldPosition(V).toArray().map(v => +v.toFixed(2)); } return { q, p: pp }; };
        const rest = grab(), clip = o.animations[0], mixer = new THREE.AnimationMixer(o); mixer.clipAction(clip).play();
        const fps = 60, n = Math.floor(clip.duration * fps) + 1, frames = [];
        for (let i = 0; i < n; i++) { mixer.setTime(i / fps); frames.push(grab()); }
        return { fps, n, rest, frames };
      }, [fs.readFileSync(path.join(ROHR, f + '.fbx')).toString('base64'), RK]);
      fs.writeFileSync(path.join(ROHR_JSON, f + '.json'), JSON.stringify(r));
    }
    await b.close();
  }
  const out = {};
  for (const f of files) { const js = path.join(ROHR_JSON, f + '.json'); if (fs.existsSync(js)) out[f] = JSON.parse(fs.readFileSync(js, 'utf8')); }
  return out;
}
// la transposition : rotation de chaque os depuis sa pose de repos, puis l'écart de direction de repos entre les deux squelettes
function rohrRetarget(J) {
  const R = J.rest, Ainv = {}, Rinv = {}, P = n => new V().fromArray(R.p[n]);
  for (const [m, s, kid] of RMAP) { Rinv[m] = new Q().fromArray(R.q[s]).invert(); Ainv[m] = kid ? new Q().setFromUnitVectors(P(kid).sub(P(s)).normalize(), X[XKID[m]].t.clone().normalize()).invert() : new Q(); }
  const ratio = (X.LeftLeg.t.length() + X.LeftFoot.t.length()) / ((P('LeftThigh').distanceTo(P('LeftShin')) + P('LeftShin').distanceTo(P('LeftFoot'))) / 100);
  // hauteur : le sol de l'acteur, à l'échelle, plus l'écart de hauteur du bassin debout entre les deux squelettes
  const lift = (X.Hips.t.y + 0.003) - R.p.Hips[1] / 100 * ratio;
  return { Ainv, Rinv, ratio, lift };
}
const swapLR = n => /^Left/.test(n) ? 'Right' + n.slice(4) : /^Right/.test(n) ? 'Left' + n.slice(5) : n;
function rohrPose(R, F, yaw, mirror) {
  const Y = new Q().setFromAxisAngle(new V(0, 1, 0), yaw), W = {}, po = {};
  for (const [m, s] of RMAP) W[m] = Y.clone().multiply(new Q().fromArray(F.q[s])).multiply(R.Rinv[m]).multiply(R.Ainv[m]);
  for (const m of BONES) { const p = PARENT[m]; po[m] = p ? W[p].clone().invert().multiply(W[m]) : W[m].clone(); }
  if (!mirror) return po;
  const out = {}; for (const m of BONES) { const q = po[swapLR(m)]; out[m] = new Q(q.x, -q.y, -q.z, q.w); }      // miroir gauche ↔ droite
  return out;
}
// un point de l'acteur (m, à l'échelle du mannequin), tourné de yaw, retourné en miroir si besoin
function rohrPt(R, F, n, yaw, mirror) { const v = new V().fromArray(F.p[n]).multiplyScalar(R.ratio / 100).applyAxisAngle(new V(0, 1, 0), yaw); if (mirror) v.x = -v.x; return v; }
function rohrClip(name, spec, J) {
  const R = rohrRetarget(J), F = J.frames, n = J.n, fps = J.fps;
  let k, mirror = false, yaw;
  if (spec.kind === 'frappe') {      // le contact : le pied le plus rapide (hors début et fin du fichier), puis le bas de l'arc juste avant
    const sp = (i, s) => new V().fromArray(F[i].p[s + 'ToeTip']).distanceTo(new V().fromArray(F[i - 1].p[s + 'ToeTip'])) / 100 * fps;
    let best = { v: 0 };
    for (let i = 20; i < n - 20; i++) for (const s of ['Left', 'Right']) { const v = sp(i, s); if (v > best.v) best = { v, i, s }; }
    k = best.i;
    for (let j = best.i - 18; j <= best.i; j++) if (sp(j, best.s) > 0.45 * best.v && F[j].p[best.s + 'Toe'][1] < F[k].p[best.s + 'Toe'][1]) k = j;
    mirror = best.s === 'Left';
    const d = new V().fromArray(F[k].p[best.s + 'ToeTip']).sub(new V().fromArray(F[k - 2].p[best.s + 'ToeTip']));
    yaw = -Math.atan2(d.x, d.z);      // le pied part vers l'avant
    spec.info = 'contact à ' + (k / fps).toFixed(2) + ' s, pied ' + (mirror ? 'gauche (retourné)' : 'droit') + ' à ' + best.v.toFixed(1) + ' m/s';
  } else {      // un geste : l'instant donné ; le bassin tourné vers l'avant au début du morceau (un gardien face au tireur avant de plonger,
    k = Math.round(spec.at * fps);      // un défenseur face à l'attaquant avant de tacler : pendant le geste, son bassin tourne)
    const k0 = Math.round(spec.from * fps);
    yaw = -yawOf(new Q().fromArray(F[k0].q.Hips).multiply(new Q().fromArray(J.rest.q.Hips).invert()));
    spec.info = 'événement à ' + spec.at.toFixed(2) + ' s';
  }
  // les frappes à 60 images par seconde (ralenti autour du contact), les autres gestes à 30 (le fichier reste léger)
  const step = spec.kind === 'frappe' ? 1 : 2;
  let i0 = spec.kind === 'frappe' ? Math.max(1, Math.round(k + KICK[0] * fps)) : Math.max(1, Math.round(spec.from * fps)), i1 = spec.kind === 'frappe' ? Math.min(n - 2, Math.round(k + KICK[1] * fps)) : Math.min(n - 2, Math.round(spec.to * fps));
  i0 += (k - i0) % step;      // l'instant de l'événement tombe sur une image gardée
  const c0 = rohrPt(R, F[k], 'Hips', yaw, mirror), frames = [];
  for (let i = i0; i <= i1; i += step) {
    const h = rohrPt(R, F[i], 'Hips', yaw, mirror);
    frames.push({ po: rohrPose(R, F[i], yaw, mirror), y: h.y + R.lift, path: [h.x - c0.x, h.z - c0.z] });
  }
  const at = (k - i0) / step, C = world(frames[at].po, new V(0, frames[at].y, 0)), o = { fps: fps / step, contact: at * step / fps, frames, info: spec.file + ' : ' + spec.info };
  if (spec.kind === 'frappe') { const f = C.RightBall.clone().lerp(C.RightTip, 0.3); o.foot = [+f.x.toFixed(3), +f.z.toFixed(3)]; }
  else {
    o.hands = [+C.Hands.x.toFixed(3), +C.Hands.y.toFixed(3), +C.Hands.z.toFixed(3)];
    if (spec.foot) { const s = mirror ? swapLR(spec.foot) : spec.foot, f = C[s + 'Ball'].clone().lerp(C[s + 'Tip'], 0.3); o.foot = [+f.x.toFixed(3), +f.z.toFixed(3)]; }
  }
  return o;
}

// ---------- écriture : nombres entiers sur 16 bits, en base 64 (quaternions × 32767, longueurs en millimètres) ----------
const b64 = a => Buffer.from(new Int16Array(a).buffer).toString('base64');
(async () => {
const out = { bones: BONES, clips: {} };
const RJ = await rohrRead([...new Set(Object.values(CLIPS).filter(c => c.src === 'rohr').map(c => c.file))]);
let before = null; try { before = require(path.join(ROOT, 'mouvements.js')); } catch (e) {}
for (const [name, spec] of Object.entries(CLIPS)) {
  if (spec.src === 'rohr' && !RJ[spec.file]) {      // FBX absents : on garde le mouvement déjà écrit
    if (before && before.clips[name]) { out.clips[name] = before.clips[name]; console.log(name.padEnd(7) + spec.file + ' : FBX absent, mouvement repris de mouvements.js'); }
    else console.log(name.padEnd(7) + spec.file + ' : FBX absent (voir l\'en-tête de ce fichier), mouvement non écrit');
    continue;
  }
  const c = spec.src === 'rohr' ? rohrClip(name, spec, RJ[spec.file]) : spec.kind === 'frappe' ? kickClip(spec) : spec.kind === 'saut' ? jumpClip(spec) : loopClip(spec), q = [], h = [], p = [];
  for (const F of c.frames) {
    for (const b of BONES) { const v = F.po[b]; if (v.w < 0) v.set(-v.x, -v.y, -v.z, -v.w); q.push(...v.toArray().map(x => Math.round(x * 32767))); }
    const sw = F.sway || [0, 0]; h.push(Math.round(sw[0] * 1000), Math.round(F.y * 1000), Math.round(sw[1] * 1000));
    if (F.path) p.push(Math.round(F.path[0] * 1000), Math.round(F.path[1] * 1000));
  }
  const o = { fps: c.fps, n: c.frames.length, q: b64(q), hips: b64(h) };
  if (c.loop) Object.assign(o, { loop: true, speed: c.speed, dir: c.dir });
  else { Object.assign(o, { contact: +c.contact.toFixed(4), path: b64(p) }); for (const k of ['foot', 'head', 'hands']) if (c[k]) o[k] = c[k]; }
  out.clips[name] = o;
  console.log(name.padEnd(7) + c.info + ', ' + c.frames.length + ' images');
}
const src = `/* Mouvements filmés pour les joueurs 3D (n° 143) : fabriqué par tools/mouvements.js, ne pas modifier à la main.
   Sources : base de capture de mouvement de l'université Carnegie Mellon (mocap.cs.cmu.edu), créée grâce au financement NSF EIA-0196217 ;
   « Free mocap pack 05: Soccer » d'Anderson Rohr (passe, penalty, frappe, touche, gardien, tacle, célébrations ; n° 144).
   Transposés sur le squelette du mannequin de players3d.js : pour chaque mouvement, images par seconde (fps), nombre d'images (n),
   rotations locales des os (q : quaternions × 32767, os dans l'ordre de « bones »), bassin (hips : écart latéral, hauteur, écart avant, en mm) ;
   frappes, saut et gestes : instant du contact, du sommet ou de l'événement (s), pied qui frappe au contact par rapport au bassin (foot, m),
   front au sommet (head : x, hauteur, z, m) ou milieu des mains à l'événement (hands : x, hauteur, z, m),
   chemin du bassin au sol (path, mm) ;
   boucles : vitesse de l'acteur (m/s) et direction du déplacement (degrés : 0 en avant, 90 vers sa gauche, −90 vers sa droite). */
(function (root, data) { if (typeof module === 'object' && module.exports) module.exports = data; else root.Mouvements3D = data; })(typeof self !== 'undefined' ? self : this,
${JSON.stringify(out)});
`;
fs.writeFileSync(path.join(ROOT, 'mouvements.js'), src);
console.log('mouvements.js écrit (' + Math.round(src.length / 1024) + ' ko)');
})();
