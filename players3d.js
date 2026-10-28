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
    .then(g => { try { g.built = swapBody(g.scene); } catch (e) { console.warn('corps de footballeur : ' + e.message); } try { moves = buildMoves(g); } catch (e) { console.warn('mouvements filmés : ' + e.message); } gltf = g; done(null); }, e => done(e));
}
const ready = () => !!gltf;

/* Les mouvements filmés (n° 143, mouvements.js, fabriqué par tools/mouvements.js) : frappes (tir, frappe longue, passe), saut, course arrière et
   pas chassés de vrais acteurs (base de l'université Carnegie Mellon). Ils deviennent des clips three.js, joués par le même mélangeur que la
   marche et la course du mannequin. Chaque mouvement existe aussi en miroir (gauche ↔ droite) : frappe du pied gauche, pas chassés vers la gauche.
   Un miroir : on échange les os gauches et droits, et on retourne chaque rotation (x, −y, −z, w) ; le bassin passe de l'autre côté (−x). */
let moves = null;
function decode(str) {      // entiers sur 16 bits en base 64 (petit-boutiste)
  const b = atob(str), a = new Int16Array(b.length >> 1);
  for (let i = 0; i < a.length; i++) a[i] = (b.charCodeAt(2 * i) | (b.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
  return a;
}
function buildMoves(g) {
  const D = typeof self !== 'undefined' && self.Mouvements3D; if (!D) return null;
  const hipsTrack = g.animations[0].tracks.find(t => /Hips\.position$/.test(t.name));
  const pre = hipsTrack ? hipsTrack.name.replace(/Hips\.position$/, '') : 'mixamorig';      // nom des os dans les pistes (« mixamorig »)
  const swap = n => /^Left/.test(n) ? 'Right' + n.slice(4) : /^Right/.test(n) ? 'Left' + n.slice(5) : n;
  const out = {}, NB = D.bones.length;
  for (const name in D.clips) {
    const c = D.clips[name], q = decode(c.q), h = decode(c.hips), n = c.n, nk = n + (c.loop ? 1 : 0);      // boucle : la première image recopiée à la fin
    const times = new Float32Array(nk); for (let i = 0; i < nk; i++) times[i] = i / c.fps;
    const pair = [false, true].map(mir => {
      const tracks = D.bones.map((bn, k) => {
        const src = mir ? D.bones.indexOf(swap(bn)) : k, v = new Float32Array(nk * 4);
        for (let i = 0; i < nk; i++) { const o = ((i % n) * NB + src) * 4; v[i * 4] = q[o] / 32767; v[i * 4 + 1] = (mir ? -1 : 1) * q[o + 1] / 32767; v[i * 4 + 2] = (mir ? -1 : 1) * q[o + 2] / 32767; v[i * 4 + 3] = q[o + 3] / 32767; }
        return new THREE.QuaternionKeyframeTrack(pre + bn + '.quaternion', times, v);
      });
      const hp = new Float32Array(nk * 3);      // le bassin, en centimètres comme le squelette
      for (let i = 0; i < nk; i++) { const o = (i % n) * 3; hp[i * 3] = (mir ? -1 : 1) * h[o] / 10; hp[i * 3 + 1] = h[o + 1] / 10; hp[i * 3 + 2] = h[o + 2] / 10; }
      tracks.push(new THREE.VectorKeyframeTrack(pre + 'Hips.position', times, hp));
      return new THREE.AnimationClip(name + (mir ? '-miroir' : ''), (nk - 1) / c.fps, tracks);
    });
    const m = { clips: pair, fps: c.fps, n, loop: !!c.loop, duration: (n - 1) / c.fps, speed: c.speed, dir: c.dir, contact: c.contact, foot: c.foot, head: c.head, hands: c.hands };
    if (c.path) { const p = decode(c.path); m.path = Array.from(p, v => v / 1000); }      // chemin du bassin au sol (m), image par image : x vers sa gauche, z vers l'avant
    out[name] = m;
  }
  return out;
}
// où est le bassin (au sol) dans une frappe filmée, à l'instant t du clip (s) : [x vers sa gauche, z vers l'avant], par rapport au contact
function pathAt(name, t, left) {
  const m = moves && moves[name]; if (!m || !m.path) return [0, 0];
  const x = clamp(t * m.fps, 0, m.n - 1), i = Math.min(m.n - 2, Math.floor(x)), a = x - i, P = m.path;
  return [(left ? -1 : 1) * (P[i * 2] + (P[i * 2 + 2] - P[i * 2]) * a), P[i * 2 + 1] + (P[i * 2 + 3] - P[i * 2 + 1]) * a];
}

/* Le corps de footballeur (n° 131, demande de Frédéric : « on dirait des filles avec des tailles très fines », il veut « la qualité de PES6 »).
   Le mannequin téléchargé ne sert plus que pour son squelette et ses mouvements enregistrés : son corps (taille de guêpe, hanches larges,
   boules aux articulations) est remplacé par un corps d'homme sportif modelé ici, lié au même squelette. Le corps est fait de tubes : chaque
   tube est une suite d'anneaux (centre, largeur, épaisseur), et chaque point suit un ou plusieurs os (mélange aux articulations, sans cassure).
   La tenue est en vraies pièces : maillot à manches courtes avec col et poignets, short ample, chaussettes montantes, crampons.
   Mesures en mètres, dans la pose de départ du mannequin : debout, bras tendus à l'horizontale, x vers sa gauche, z vers l'avant. */
const PART = { skin: 0, shirt: 1, shorts: 2, socks: 3, boots: 4, hair: 5, hands: 6, trim: 7, eyes: 8 };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function buildBody(sk, segs) {
  const V = THREE.Vector3, BI = {}, BP = {};
  sk.bones.forEach((b, i) => { const n = b.name.replace(/^mixamorig:?/, ''); BI[n] = i; BP[n] = new V().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); });
  for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightUpLeg', 'RightLeg', 'RightFoot']) if (!BP[n]) throw new Error('os absent : ' + n);
  const pos = [], ski = [], skw = [], part = [], hairy = [], idx = [];
  const vert = (p, pt, w) => {      // les cheveux du crâne sont une couleur à part (« hairy ») : la limite peau-cheveux ne crée pas de bande parasite      // w : { os: poids } ; on garde les quatre plus forts
    const l = Object.entries(w).filter(e => e[1] > 1e-3 && BI[e[0]] != null).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const t = l.reduce((a, e) => a + e[1], 0) || 1; while (l.length < 4) l.push([null, 0]);
    pos.push(p.x, p.y, p.z); part.push(pt < 0 ? PART.skin : pt); hairy.push(pt < 0 ? 1 : 0);
    l.forEach(e => { ski.push(e[0] ? BI[e[0]] : 0); skw.push(e[1] / t); });
    return pos.length / 3 - 1;
  };
  /* un tube : rings = [{ c: centre, a, b (demi-largeur sur u, demi-épaisseur sur v), part }], u et v : les deux axes de l'anneau,
     n : forme (2 = ovale, plus grand = plus carré), w(point, anneau) : les os qui le portent, cap0 / cap1 : fermer les bouts ; partOf(point) facultatif */
  const tube = (rings, u, v, n, w, cap0, cap1, partOf, N) => {
    N = N || segs; const first = [];
    // sens des faces : vers l'extérieur du tube quel que soit le sens de parcours
    const d = rings[rings.length - 1].c.clone().sub(rings[0].c), out = d.clone().cross(v).dot(u) > 0;
    rings.forEach((r, i) => {
      const row = [];
      for (let k = 0; k < N; k++) {
        const t = k / N * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
        const p = r.c.clone().addScaledVector(u, r.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)).addScaledVector(v, r.b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n));
        const pt = partOf ? partOf(p, r) : r.part;
        if (pt < 0) { const o = p.clone().sub(r.c); o.y = 0; p.addScaledVector(o.normalize(), 0.008); p.y += 0.006; }      // les cheveux : un peu de volume (n° 141)
        row.push(vert(p, pt, w(p, r)));
      }
      first.push(row);
    });
    for (let i = 0; i + 1 < first.length; i++) for (let k = 0; k < N; k++) {
      const a = first[i][k], b = first[i][(k + 1) % N], c = first[i + 1][k], d = first[i + 1][(k + 1) % N];
      if (out) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const cap = (row, r, flip) => {
      const cp = partOf ? partOf(r.c, r) : r.part, cc = r.c.clone(); if (cp < 0) cc.y += 0.012;
      const ctr = vert(cc, cp, w(r.c, r));
      for (let k = 0; k < N; k++) { const a = row[k], b = row[(k + 1) % N]; if (flip === out) idx.push(ctr, b, a); else idx.push(ctr, a, b); }
    };
    if (cap0) cap(first[0], rings[0], false);
    if (cap1) cap(first[first.length - 1], rings[rings.length - 1], true);
  };
  const X = new V(1, 0, 0), Y = new V(0, 1, 0), Z = new V(0, 0, 1);
  // mélange le long d'une chaîne d'os, selon une coordonnée (hauteur ou écartement)
  const chain = (list, x) => {      // list : [[os, coordonnée de l'os], ...] dans l'ordre croissant
    if (x <= list[0][1]) return { [list[0][0]]: 1 };
    for (let i = 0; i + 1 < list.length; i++) if (x <= list[i + 1][1]) { const t = (x - list[i][1]) / (list[i + 1][1] - list[i][1]); return { [list[i][0]]: 1 - t, [list[i + 1][0]]: t }; }
    return { [list[list.length - 1][0]]: 1 };
  };
  const spine = [['Hips', BP.Hips.y], ['Spine', BP.Spine.y], ['Spine1', BP.Spine1.y], ['Spine2', BP.Spine2.y], ['Neck', BP.Neck.y]];

  /* le buste et le bassin : hauteur, demi-largeur, demi-épaisseur, avancée ; maillot au-dessus de 1,01 m, short en dessous */
  const T = [[0.90, 0.120, 0.090, 0.01], [0.93, 0.168, 0.112, 0.012], [0.985, 0.172, 0.112, 0.012], [1.005, 0.170, 0.110, 0.012], [1.012, 0.166, 0.108, 0.012],
    [1.06, 0.160, 0.104, 0.012], [1.12, 0.156, 0.102, 0.014], [1.19, 0.162, 0.108, 0.018], [1.26, 0.174, 0.116, 0.022], [1.32, 0.184, 0.118, 0.022],
    [1.37, 0.192, 0.112, 0.016], [1.41, 0.194, 0.100, 0.006], [1.445, 0.176, 0.086, -0.004], [1.47, 0.140, 0.074, -0.010], [1.49, 0.096, 0.066, -0.014], [1.50, 0.070, 0.060, -0.016]];
  const torsoW = p => {
    const w = chain(spine, p.y), ax = Math.abs(p.x), side = p.x > 0 ? 'Left' : 'Right';
    const sh = smooth(0.09, 0.19, ax) * smooth(1.30, 1.42, p.y);      // le haut des épaules suit un peu les bras
    if (sh > 0) { for (const n in w) w[n] *= 1 - 0.55 * sh; w[side + 'Shoulder'] = 0.4 * sh; w[side + 'Arm'] = 0.15 * sh; }
    const lg = smooth(0.02, 0.10, ax) * smooth(1.0, 0.92, p.y);      // le bas du short suit un peu les cuisses
    if (lg > 0) { for (const n in w) w[n] *= 1 - 0.45 * lg; w[side + 'UpLeg'] = 0.45 * lg; }
    return w;
  };
  tube(T.map(r => ({ c: new V(0, r[0], r[3]), a: r[1], b: r[2], part: r[0] < 1.009 ? PART.shorts : PART.shirt })), X, Z, 2.6, torsoW, true, false);
  // le col : un petit anneau autour du bas du cou
  tube([[1.47, 0.084, 0.072], [1.495, 0.078, 0.066], [1.512, 0.072, 0.062], [1.514, 0.064, 0.054]].map(r => ({ c: new V(0, r[0], -0.018), a: r[1], b: r[2], part: PART.trim })), X, Z, 2, p => chain(spine, p.y), false, false);

  for (const sd of [1, -1]) {
    const S = sd > 0 ? 'Left' : 'Right', lx = BP[S + 'UpLeg'].x, kneeY = BP[S + 'Leg'].y, ank = BP[S + 'Foot'];
    /* la jambe : hauteur, demi-largeur, demi-épaisseur, avancée ; peau, puis chaussette sous le genou */
    const L = [[1.00, 0.088, 0.092, 0.012], [0.92, 0.088, 0.090, 0.016], [0.82, 0.082, 0.084, 0.016], [0.72, 0.072, 0.074, 0.014], [0.62, 0.060, 0.062, 0.010],
      [0.56, 0.052, 0.056, 0.012], [0.52, 0.050, 0.054, 0.010], [0.47, 0.052, 0.058, -0.004], [0.469, 0.054, 0.060, -0.004], [0.42, 0.058, 0.066, -0.014], [0.36, 0.057, 0.064, -0.014],
      [0.28, 0.048, 0.052, -0.008], [0.20, 0.038, 0.040, -0.004], [0.13, 0.032, 0.034, -0.008], [0.09, 0.034, 0.040, -0.012]];
    const legW = p => { const w = chain([[S + 'Foot', 0.085], [S + 'Leg', 0.13], [S + 'Leg', kneeY - 0.035], [S + 'UpLeg', kneeY + 0.04], [S + 'UpLeg', 0.95], ['Hips', 1.06]], p.y); if (p.y > 0.95) { w[S + 'UpLeg'] = (w[S + 'UpLeg'] || 0) + (w.Hips || 0) * 0.5; w.Hips = (w.Hips || 0) * 0.5; } return w; };
    tube(L.map(r => ({ c: new V(lx + sd * 0.004, r[0], r[3]), a: r[1], b: r[2], part: r[0] < 0.4695 ? PART.socks : PART.skin })), X, Z, 2.1, legW, false, false);
    // la jambe du short : ample, elle descend à mi-cuisse
    const SH = [[1.02, 0.100, 0.112], [0.99, 0.106, 0.116], [0.90, 0.106, 0.112], [0.80, 0.104, 0.108], [0.752, 0.103, 0.106], [0.745, 0.098, 0.100]];
    tube(SH.map(r => ({ c: new V(lx + sd * 0.012, r[0], 0.014), a: r[1], b: r[2], part: PART.shorts })), X, Z, 2.2, p => ({ [S + 'UpLeg']: 0.5 + 0.5 * smooth(1.0, 0.80, p.y), Hips: 0.5 * smooth(0.80, 1.0, p.y) }), false, false);
    /* le crampon : du talon à la pointe (z), demi-largeur, demi-hauteur, hauteur du centre */
    const F = [[-0.075, 0.026, 0.030, 0.058], [-0.06, 0.036, 0.046, 0.056], [-0.02, 0.040, 0.052, 0.054], [0.03, 0.042, 0.040, 0.042], [0.08, 0.045, 0.031, 0.033], [0.13, 0.042, 0.024, 0.027], [0.165, 0.032, 0.018, 0.022], [0.185, 0.016, 0.010, 0.020]];
    const toeZ = BP[S + 'ToeBase'] ? BP[S + 'ToeBase'].z : 0.085;
    tube(F.map(r => ({ c: new V(ank.x, r[3], r[0]), a: r[1], b: r[2], part: PART.boots })), X, Y, 2.4, p => chain([[S + 'Foot', toeZ - 0.03], [S + 'ToeBase', toeZ + 0.03]], p.z), true, true);

    /* le bras (le long de x) : écartement, demi-hauteur, demi-épaisseur ; manche courte jusqu'à 0,32 m, puis peau */
    const arm = BP[S + 'Arm'], fore = BP[S + 'ForeArm'], hand = BP[S + 'Hand'];
    const ay = arm.y, az = arm.z, ex = Math.abs(fore.x), wx = Math.abs(hand.x);
    const A = [[0.20, 0.058, 0.060], [0.21, 0.064, 0.064],      // le haut du bras est caché par la manche : le tube commence dessous [0.27, 0.054, 0.056], [0.33, 0.050, 0.052], [0.39, 0.045, 0.046],
      [ex, 0.042, 0.042], [ex + 0.06, 0.044, 0.046], [ex + 0.14, 0.038, 0.040], [wx - 0.03, 0.030, 0.033], [wx, 0.028, 0.032]];
    const armW = p => chain([[S + 'Shoulder', 0.10], [S + 'Arm', 0.19], [S + 'Arm', ex - 0.035], [S + 'ForeArm', ex + 0.035], [S + 'ForeArm', wx - 0.04], [S + 'Hand', wx + 0.01]], Math.abs(p.x));
    tube(A.map(r => ({ c: new V(sd * r[0], ay - 0.004, az), a: r[1], b: r[2], part: PART.skin })), Y, Z, 2, armW, true, false);
    // la manche (un peu plus large que le bras) et son poignet
    const M = [[0.09, 0.074, 0.076, PART.shirt], [0.12, 0.080, 0.080, PART.shirt], [0.19, 0.080, 0.080, PART.shirt], [0.26, 0.072, 0.072, PART.shirt], [0.305, 0.068, 0.068, PART.shirt], [0.306, 0.068, 0.068, PART.trim], [0.325, 0.066, 0.066, PART.trim], [0.326, 0.060, 0.060, PART.trim]];
    tube(M.map(r => ({ c: new V(sd * r[0], ay - 0.002, az), a: r[1], b: r[2], part: r[3] })), Y, Z, 2, armW, true, false);
    // la main, paume vers le bas
    const H = [[wx - 0.005, 0.028, 0.034], [wx + 0.03, 0.032, 0.046], [wx + 0.075, 0.030, 0.046], [wx + 0.11, 0.024, 0.040], [wx + 0.135, 0.012, 0.024]];
    tube(H.map(r => ({ c: new V(sd * r[0], ay - 0.008, az + 0.004), a: r[1], b: r[2], part: PART.hands })), Y, Z, 2.2, () => ({ [S + 'Hand']: 1 }), false, true);
    // l'oreille, l'œil, le sourcil
    const hd = BP.Head;
    tube([[0.074, 0.006, 0.022], [0.083, 0.024, 0.026], [0.088, 0.020, 0.022], [0.090, 0.004, 0.006]].map(r => ({ c: new V(sd * r[0], hd.y + 0.095, hd.z - 0.005), a: r[1], b: r[2], part: PART.skin })), Y, Z, 2, () => ({ Head: 1 }), false, true, null, 8);
    tube([[0, 0.009, 0.006], [0.004, 0.009, 0.006], [0.006, 0.001, 0.001]].map(r => ({ c: new V(sd * 0.032, hd.y + 0.112, hd.z + 0.088 + r[0]), a: r[1], b: r[2], part: PART.eyes })), X, Y, 2, () => ({ Head: 1 }), false, true, null, 8);
    tube([[0, 0.018, 0.004], [0.004, 0.018, 0.004], [0.006, 0.002, 0.001]].map(r => ({ c: new V(sd * 0.033, hd.y + 0.128, hd.z + 0.086 + r[0]), a: r[1], b: r[2], part: PART.hair })), X, Y, 2, () => ({ Head: 1 }), false, true, null, 8);
  }

  // le cou
  const neckW = p => chain([['Spine2', 1.45], ['Neck', 1.53], ['Neck', 1.57], ['Head', 1.62]], p.y);
  tube([[1.46, 0.068, 0.062], [1.51, 0.064, 0.060], [1.56, 0.060, 0.058], [1.61, 0.056, 0.056]].map(r => ({ c: new V(0, r[0], -0.012), a: r[1], b: r[2], part: PART.skin })), X, Z, 2, neckW, false, false);
  /* la tête : hauteur au-dessus de l'os de la tête, demi-largeur, demi-profondeur, avancée ; cheveux courts sur le dessus et l'arrière */
  const hd = BP.Head;
  const Hd = [[-0.014, 0.034, 0.030, 0.060], [0.0, 0.056, 0.064, 0.038], [0.025, 0.070, 0.086, 0.022], [0.06, 0.078, 0.098, 0.012], [0.10, 0.082, 0.102, 0.008],
    [0.135, 0.083, 0.104, 0.004], [0.165, 0.080, 0.101, 0.0], [0.195, 0.070, 0.090, -0.004], [0.215, 0.052, 0.068, -0.006], [0.23, 0.022, 0.032, -0.006]];
  const hairOf = p => (p.y > hd.y + 0.168 || (p.y > hd.y + 0.07 && p.z < hd.z - 0.02) || (p.y > hd.y + 0.14 && Math.abs(p.x) > 0.06)) ? -1 : PART.skin;
  tube(Hd.map(r => ({ c: new V(0, hd.y + r[0], hd.z + r[3]), a: r[1], b: r[2], part: PART.skin })), X, Z, 2.1, () => ({ Head: 1 }), true, true, hairOf);
  // le nez
  tube([[0.0, 0.010, 0.006], [0.012, 0.012, 0.012], [0.022, 0.006, 0.008]].map(r => ({ c: new V(0, hd.y + 0.085 + r[0] * 0.3, hd.z + 0.104 + r[0] * 0.6), a: r[1], b: r[2], part: PART.skin })), X, Y, 2, () => ({ Head: 1 }), true, true, null, 8);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ski, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skw, 4));
  geo.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
  geo.setAttribute('hairy', new THREE.Float32BufferAttribute(hairy, 1));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
// remplace le corps du mannequin par le corps de footballeur ; renvoie la hauteur du dos pour le numéro
function swapBody(scene) {
  scene.updateMatrixWorld(true);
  const old = []; scene.traverse(o => { if (o.isSkinnedMesh) old.push(o); });
  if (!old.length) throw new Error('mannequin sans corps');
  const src = old[0];
  const mk = segs => {
    const m = new THREE.SkinnedMesh(buildBody(src.skeleton, segs), new THREE.MeshStandardMaterial({ skinning: true }));
    m.name = 'Footballeur' + segs; m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
    src.parent.add(m); m.bind(src.skeleton, src.bindMatrix); m.bindMatrixInverse.copy(src.bindMatrixInverse);
    return m;
  };
  const hi = mk(18), lo = mk(10);      // deux finesses : 18 côtés par anneau sur ordinateur, 10 sur téléphone
  old.forEach(o => o.parent.remove(o));
  return { tris: [hi, lo].map(m => m.geometry.index.count / 3) };
}

/* La tenue du corps de footballeur : chaque point porte sa pièce (attribut « part ») ; le col et les poignets prennent la couleur du short,
   ou une couleur plus sombre du maillot si le short est de la même couleur. La peau est un peu plus brillante que le tissu. */
function bodyMaterial(kit) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, skinning: true });
  const trim = kit.shorts.clone(); if (Math.abs(trim.r - kit.shirt.r) + Math.abs(trim.g - kit.shirt.g) + Math.abs(trim.b - kit.shirt.b) < 0.15) trim.copy(kit.shirt).multiplyScalar(0.55);
  const U = { k_trim: { value: trim }, k_eyes: { value: new THREE.Color(0x15110e) }, k_rim: { value: new THREE.Color(0.30, 0.27, 0.22).multiplyScalar(kit.rim != null ? kit.rim : 0.5) } };      // k_rim : liseré de lumière sur les bords (n° 141)
  for (const k of ['shirt', 'shorts', 'socks', 'skin', 'hair', 'boots', 'hands']) U['k_' + k] = { value: kit[k].clone() };
  if (kit.hands.equals(kit.skin)) U.k_hands.value.multiplyScalar(0.82);
  U.k_skin.value.multiplyScalar(0.82);      // peau un peu plus mate : sous le soleil, elle paraissait blanche (n° 141)
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float part, hairy;\nvarying float vPart, vHairy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = part; vHairy = hairy;');
    sh.fragmentShader = 'varying float vPart, vHairy;\nuniform vec3 k_shirt, k_shorts, k_socks, k_skin, k_hair, k_boots, k_hands, k_trim, k_eyes, k_rim;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      int pt = int(vPart + 0.5);
      vec3 c = pt == 1 ? k_shirt : pt == 2 ? k_shorts : pt == 3 ? k_socks : pt == 4 ? k_boots : pt == 5 ? k_hair : pt == 6 ? k_hands : pt == 7 ? k_trim : pt == 8 ? k_eyes : k_skin;
      if (vHairy > 0.5) c = k_hair;
      diffuseColor.rgb = c;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += k_rim * rimF * rimF * rimF;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      int pr = int(vPart + 0.5);
      if (vHairy > 0.5) pr = 5;
      roughnessFactor = pr == 0 ? 0.55 : pr == 4 ? 0.35 : pr == 5 ? 0.9 : 0.78;`);
  };
  m.customProgramCacheKey = () => 'corps';
  return m;
}

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
  const small = opts.small != null ? opts.small : opts.shadow === false, drop = [];
  body.traverse(o => {
    if (!o.isSkinnedMesh) return;
    if (/^Footballeur/.test(o.name)) { if (o.name !== 'Footballeur' + (small ? 10 : 18)) { drop.push(o); return; } o.material = bodyMaterial(kit); }
    else o.material = kitMaterial(kit, /Joints/.test(o.name) ? 0.82 : 1);
    o.castShadow = opts.shadow !== false; o.receiveShadow = false; o.frustumCulled = false;
  });
  drop.forEach(o => o.parent.remove(o));
  body.rotation.y = Math.PI / 2;      // le mannequin regarde vers +z ; on le tourne vers +x
  const g = new THREE.Group(); g.add(body);
  // numéro dans le dos, accroché au haut du dos (il suit le buste)
  const spine = body.getObjectByName('mixamorigSpine2') || body.getObjectByName('mixamorig:Spine2');
  if (spine && opts.num != null) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: backTexture(opts.name, opts.num, opts.ink || '#ffffff'), transparent: true, depthWrite: false }));
    if (gltf.built) { plate.scale.setScalar(0.85); plate.position.set(0, 3, -10.2); }      // collé au dos du corps de footballeur
    else plate.position.set(0, 6, -14.5);
    plate.rotation.y = Math.PI; spine.add(plate);      // le squelette est en centimètres
  }
  const mixer = new THREE.AnimationMixer(body), clip = n => gltf.animations.find(a => a.name === n);
  const A = { idle: mixer.clipAction(clip('idle')), walk: mixer.clipAction(clip('walk')), run: mixer.clipAction(clip('run')) };
  for (const k in A) { A[k].play(); A[k].setEffectiveWeight(0); }
  A.walk.time = Math.random() * A.walk.getClip().duration; A.run.time = Math.random() * A.run.getClip().duration;
  const M = {};      // mouvements filmés : [droite, miroir] ; les frappes ne défilent pas d'elles-mêmes (le replay fixe leur instant)
  if (moves) for (const k in moves) M[k] = moves[k].clips.map(c => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); if (!moves[k].loop) a.timeScale = 0; else a.time = Math.random() * c.duration; return a; });
  const bone = n => body.getObjectByName('mixamorig' + n) || body.getObjectByName('mixamorig:' + n);
  g.userData = { rigged: true, body, mixer, A, M, sp: 0, turn: 0, bones: { hips: bone('Hips'), spine: bone('Spine1'), lUp: bone('LeftUpLeg'), rUp: bone('RightUpLeg'), lLeg: bone('LeftLeg'), rLeg: bone('RightLeg'), lArm: bone('LeftArm'), rArm: bone('RightArm'), lFore: bone('LeftForeArm'), rFore: bone('RightForeArm'), head: bone('Head'), lHand: bone('LeftHand'), rHand: bone('RightHand') } };
  return g;
}
/* la course suit la vitesse v (m/s) du joueur dans le match ; dt : temps de jeu écoulé (0 en pause, petit au ralenti).
   o (facultatif, n° 143) : { dir : direction du déplacement par rapport au regard (rad ; 0 en avant, > 0 vers sa gauche, ±π en arrière),
   move : { name, t, w, left } : un geste filmé (frappe, saut) à l'instant t du clip, de poids w (0 à 1), du pied gauche ou non }.
   En avant : marche et course du mannequin ; en arrière : la course arrière filmée ; de côté : les pas chassés filmés. */
function animate(g, v, dt, o) {
  const u = g.userData, A = u.A, M = u.M || {};
  o = o || {};
  // un geste posé par-dessus (touche) : on remet d'abord les os comme le mouvement les avait laissés. En pause, le mélangeur ne réécrit
  // pas un os dont la valeur n'a pas changé : sans cela, le geste s'ajouterait à lui-même à chaque image.
  if (u.posed) { for (const [b, q] of u.posed) b.quaternion.copy(q); u.posed = null; }
  const idle = clamp(1 - v / 0.7, 0, 1), run = clamp((v - 2.2) / 1.8, 0, 1), walk = Math.max(0, 1 - idle - run);
  let fw = 1, bk = 0, sd = 0;
  if (o.dir != null && M.recul && M.cote) { const a = Math.abs(o.dir); bk = smooth(1.95, 2.45, a); fw = 1 - smooth(0.8, 1.3, a); sd = Math.max(0, 1 - fw - bk); }
  const mv = o.move && M[o.move.name] ? o.move : null, gw = mv ? clamp(mv.w, 0, 1) : 0, keep = 1 - gw;
  A.idle.setEffectiveWeight(idle * keep); A.walk.setEffectiveWeight(walk * fw * keep); A.run.setEffectiveWeight(run * fw * keep);
  A.walk.setEffectiveTimeScale(clamp(v / 1.4, 0.6, 1.9));
  A.run.setEffectiveTimeScale(clamp(v / 4.6, 0.75, 1.55));
  if (M.recul) {
    const mvW = (walk + run) * keep;
    M.recul[0].setEffectiveWeight(mvW * bk); M.recul[0].setEffectiveTimeScale(clamp(v / moves.recul.speed, 0.6, 2.4));
    const right = o.dir != null && o.dir < 0;      // pas chassés vers la droite (prise filmée) ou vers la gauche (miroir)
    M.cote[0].setEffectiveWeight(right ? mvW * sd : 0); M.cote[1].setEffectiveWeight(right ? 0 : mvW * sd);
    M.cote[0].setEffectiveTimeScale(clamp(v / moves.cote.speed, 0.45, 1.5)); M.cote[1].setEffectiveTimeScale(clamp(v / moves.cote.speed, 0.45, 1.5));
    M.recul[1].setEffectiveWeight(0);
  }
  for (const k in M) {
    if (moves[k].loop) continue;
    M[k].forEach((a, i) => {
      const on = mv && mv.name === k && !!mv.left === (i === 1);
      a.setEffectiveWeight(on ? gw : 0);
      if (on) a.time = clamp(mv.t, 0, moves[k].duration - 1e-3);
    });
  }
  u.mixer.update(Math.max(0, dt));
}
/* Le cap affiché et la direction du déplacement (n° 143). face : regard du joueur dans le moteur (rad, même convention que le moteur) ;
   vx, vz : sa vitesse (m/s, x et y du moteur). Le moteur tourne le joueur dans le sens de sa course dès 1,4 m/s, sauf celui qui presse :
   il regarde le ballon et peut reculer ou se déplacer de côté. Lent, il garde ce regard (course arrière, pas chassés) ; vite (plus de 3,5 m/s),
   il se retourne et court face à sa course, comme un vrai défenseur. Renvoie { face : cap affiché, dir : direction pour animate }. */
function heading(g, face, vx, vz, dt) {
  const u = g.userData, v = Math.hypot(vx, vz), c = Math.cos(face), s = Math.sin(face);
  const rel = v > 0.4 ? Math.atan2(-(c * vz - s * vx), c * vx + s * vz) : 0;      // > 0 : vers sa gauche
  const k = smooth(3.0, 3.8, v) * smooth(0.8, 1.2, Math.abs(rel));
  u.turn = dt > 0 ? u.turn + (k - u.turn) * Math.min(1, dt * 5) : k;
  return { face: face - rel * u.turn, dir: rel * (1 - u.turn) };
}

/* La touche (remarque de Frédéric : « en 3D, les touches sont faites au pied ») : le tireur tient le ballon à deux mains au-dessus de la tête,
   l'amène derrière la tête, puis le lance en ramenant les bras vers l'avant. r : temps (s) depuis le lâcher, négatif avant
   (−9 : il tient le ballon sans savoir quand il le lâchera) ; k : part du geste (0 à 1, pour le prendre et le reposer en douceur).
   Rotation des os comme dans le replay : bras gauche z > 0 (droit z < 0) = bras levé ; buste x > 0 = penché en avant. */
function throwPose(g, r, k) {
  const u = g.userData, B = u.bones; if (!B || !(k > 0)) return;
  if (!u.posed) u.posed = [B.lArm, B.rArm, B.lFore, B.rFore, B.spine].map(b => [b, b.quaternion.clone()]);
  const wind = smooth(-0.6, -0.12, r), fwd = smooth(-0.12, 0.1, r), done = (1 - smooth(0.2, 0.55, r)) * k;
  const arm = (2.6 + 0.15 * wind - 0.45 * fwd) * done;      // bras levés, puis ramenés vers l'avant au lâcher (sans s'écarter sur les côtés)
  const bend = (0.75 + 0.55 * wind) * (1 - fwd) * done;    // coudes pliés : le ballon au-dessus, puis derrière la tête
  B.lArm.rotation.z += arm; B.rArm.rotation.z -= arm;
  B.lFore.rotation.z += bend; B.rFore.rotation.z -= bend;
  B.spine.rotation.x += (-0.3 * wind * (1 - fwd) + 0.4 * fwd) * done;      // cambré en arrière, puis vers l'avant
}
// où sont les mains (milieu des deux poignets, en mètres dans la scène) : le ballon de touche s'y pose. À appeler une fois le joueur placé.
function handsAt(g) {
  const B = g.userData.bones; if (!B || !B.lHand || !B.rHand) return null;
  g.updateMatrixWorld(true);
  const a = B.lHand.getWorldPosition(new THREE.Vector3()), b = B.rHand.getWorldPosition(new THREE.Vector3());
  return a.add(b).multiplyScalar(0.5);
}

return { load, ready, make, animate, heading, throwPose, handsAt, pathAt, moves: () => moves, LIBS, MODEL };
});
