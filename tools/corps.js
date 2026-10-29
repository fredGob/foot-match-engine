/* Fabrique corps.js : le corps réaliste des joueurs des ralentis (n° 145 ; remarque de Frédéric : « ce qui me gêne, c'est l'aspect Playmobil
   des joueurs sur le ralenti » ; ses choix : le corps d'abord, un humain libre fait avec MakeHuman, réaliste aussi sur téléphone).
   Usage : node tools/corps.js        (télécharge une fois les fichiers MakeHuman dans tools/node_modules/.cache/makehuman, puis écrit corps.js)

   D'où viennent les pièces : MakeHuman (makehumancommunity.org), tout en CC0 (libre, même sans citer) :
   - le corps de base (« hm08 ») et ses déformations (homme, 25 ans, musclé, mince ; mélange des trois origines), le squelette « game_engine »
     et ses poids (quelle part de chaque point suit chaque os) : extension MPFB 2.0.0-a2 ;
   - le corps allégé (« male_generic », 13 652 points), les yeux (« low-poly »),
     les sourcils (« eyebrow001 »), deux coupes de cheveux courts (« short02 », « short04 »), le haut et le pantalon de « male_casualsuit04 »
     (maillot et short), les chaussures « shoes02 » (sans leur tige : chaussures basses) : « makehuman_system_assets ».
   Comment : chaque pièce est posée sur le corps déformé (chaque point est une combinaison de trois points du corps, plus un décalage), puis
   mise à l'échelle (hanche à 0,972 m du sol, comme le mannequin). Le pantalon est coupé à mi-cuisse et élargi (short ample) ; on retire
   les points du corps cachés sous le maillot, le short et les chaussures. Les chaussettes sont peintes sur le bas de la jambe.
   Le squelette reste celui du mannequin des mouvements (Xbot) : mêmes os, mêmes rotations, mais ses articulations sont placées comme celles
   de MakeHuman (épaules, coudes, genoux…). Le corps est lié dans sa pose d'origine (bras le long du corps) : pour chaque os des bras et des
   jambes, une rotation amène la direction de repos du mannequin (bras à l'horizontale) sur celle de MakeHuman ; le reste garde sa forme.
   corps.js garde, pour chaque os, sa position de repos et sa rotation dans cette pose, et pour chaque pièce ses points (entiers sur 16 bits),
   ses os et poids (4 par point), sa partie de la tenue (peau, maillot, short…), sa distance au bord du col et des manches, et trois jeux
   de triangles : ordinateur, téléphone, joueurs lointains (allégés avec meshoptimizer, le visage presque intact sur ordinateur).
   Les données binaires sont compressées (gzip) ; le navigateur les décompresse au chargement (players3d.js). */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CACHE = path.join(__dirname, 'node_modules', '.cache'), DIR = path.join(CACHE, 'makehuman');
const R3 = require(path.join(ROOT, 'render3d.js')), LIBF = path.join(CACHE, 'three-r128.min.js');
const P3 = require(path.join(ROOT, 'players3d.js')), GLB = path.join(CACHE, path.basename(P3.MODEL));
fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(LIBF)) execFileSync('curl', ['-sS', '-o', LIBF, R3.LIB]);
if (!fs.existsSync(GLB)) execFileSync('curl', ['-sS', '-o', GLB, P3.MODEL]);
const THREE = require(LIBF), V = THREE.Vector3, Q = THREE.Quaternion, M3 = THREE.Matrix4;

// --- les fichiers MakeHuman ---
const ZIPS = {
  mpfb: { url: 'http://download.tuxfamily.org/makehuman/releases/mpfb-2.0.0-a2.zip', file: 'mpfb.zip',
    parts: ['mpfb/data/3dobjs/base.obj', 'mpfb/data/mesh_metadata/basemesh_vertex_groups.json', 'mpfb/data/rigs/standard/rig.game_engine.json', 'mpfb/data/rigs/standard/weights.game_engine.json', 'mpfb/data/targets/macrodetails/*'] },
  sys: { url: 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip', file: 'makehuman_system_assets_cc0.zip',
    parts: ['proxymeshes/male_generic/*', 'eyes/low-poly/*', 'eyebrows/eyebrow001/*', 'hair/short02/*', 'hair/short04/*', 'clothes/male_casualsuit04/*', 'clothes/shoes02/*'] }
};
for (const k in ZIPS) {
  const z = ZIPS[k], zf = path.join(DIR, z.file), out = path.join(DIR, k);
  if (fs.existsSync(path.join(out, '.ok'))) continue;
  if (!fs.existsSync(zf)) { console.log('Téléchargement de', z.url, '(une seule fois)'); execFileSync('curl', ['-sS', '-L', '--max-time', '1200', '-o', zf, z.url], { stdio: 'inherit' }); }
  fs.mkdirSync(out, { recursive: true });
  execFileSync('unzip', ['-q', '-o', zf, ...z.parts, '-x', '*.png', '*.jpg', '*.thumb', '-d', out]);
  fs.writeFileSync(path.join(out, '.ok'), '');
}
const D = path.join(DIR, 'mpfb/mpfb/data'), SYS = path.join(DIR, 'sys');

// --- lecture des fichiers ---
function readObj(file) {
  const v = [], faces = [];
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (l.startsWith('v ')) { const w = l.trim().split(/\s+/); v.push([+w[1], +w[2], +w[3]]); }
    else if (l.startsWith('f ')) faces.push(l.trim().split(/\s+/).slice(1).map(s => +s.split('/')[0] - 1));
  }
  return { v, faces };
}
function applyTarget(pos, file, w) {
  for (const l of zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n')) {
    if (!l || l[0] === '#') continue;
    const a = l.trim().split(/\s+/), i = +a[0];
    pos[i][0] += w * a[1]; pos[i][1] += w * a[2]; pos[i][2] += w * a[3];
  }
}
// les déformations « macro » de MakeHuman (même calcul que MPFB : chaque réglage se partage entre deux fichiers voisins)
function macroTargets(o) {
  const parts = (val, list) => { const out = []; for (const [lo, hi, a, b] of list) if (val > lo && val < hi) { const p = (val - lo) / (hi - lo); if (a) out.push([a, 1 - p]); if (b) out.push([b, p]); } return out; };
  const G = parts(o.gender, [[-0.01, 1.01, 'female', 'male']]);
  const A = parts(o.age, [[-0.01, 0.1874998, 'baby', 'child'], [0.1874999, 0.49998, 'child', 'young'], [0.49999, 1.01, 'young', 'old']]);
  const Mu = parts(o.muscle, [[-0.01, 0.49998, 'minmuscle', 'averagemuscle'], [0.49999, 1.01, 'averagemuscle', 'maxmuscle']]);
  const W = parts(o.weight, [[-0.01, 0.49998, 'minweight', 'averageweight'], [0.49999, 1.01, 'averageweight', 'maxweight']]);
  const P = parts(o.proportions, [[-0.01, 0.4999, 'uncommonproportions', ''], [0.5, 1.01, '', 'idealproportions']]);
  const T = [];
  for (const r in o.race) for (const a of A) for (const g of G) { const w = o.race[r] * g[1] * a[1]; if (w > 0.01) T.push([r + '-' + g[0] + '-' + a[0], w]); }
  for (const g of G) for (const a of A) for (const m of Mu) for (const w of W) {
    const k = g[1] * a[1] * m[1] * w[1]; if (k > 0.01) T.push(['universal-' + [g[0], a[0], m[0], w[0]].join('-'), k]);
    for (const p of P) { const k2 = k * p[1]; if (k2 > 0.01) T.push(['proportions/' + [g[0], a[0], m[0], w[0], p[0]].join('-'), k2]); }
  }
  return T;
}
// une pièce posée sur le corps (.proxy, .mhclo) : trois points du corps, leurs parts, un décalage (mis à l'échelle du corps)
function readFit(file) {
  const out = { verts: [], del: [] }; let st = '';
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const w = l.trim().split(/\s+/);
    if (!l.trim()) { st = ''; continue; }
    if (w[0] === '#' || w[0] === 'material' || /^vertexboneweights/.test(w[0])) continue;
    if (st === 'v' && /^\d+$/.test(w[0])) { out.verts.push(w.length === 1 ? { r: [+w[0], +w[0], +w[0]], w: [1, 0, 0], d: [0, 0, 0] } : { r: [+w[0], +w[1], +w[2]], w: [+w[3], +w[4], +w[5]], d: [+w[6], +w[7], +w[8]] }); continue; }
    if (st === 'd' && /^\d+$/.test(w[0])) { let seq = false, v0 = 0; for (const s of w) { if (s === '-') { seq = true; continue; } const v1 = +s; if (seq) { for (let k = v0; k <= v1; k++) out.del.push(k); seq = false; } else out.del.push(v1); v0 = v1; } continue; }
    st = '';
    if (w[0] === 'verts') st = 'v';
    else if (w[0] === 'delete_verts') st = 'd';
    else if (/^[xyz]_scale$/.test(w[0])) out[w[0]] = [+w[1], +w[2], +w[3]];
    else if (w[0] === 'obj_file') out.obj = path.join(path.dirname(file), w[1]);
  }
  out.mesh = readObj(out.obj);
  return out;
}

// --- le corps déformé ---
const base = readObj(path.join(D, '3dobjs/base.obj'));
const pos = base.v.map(p => p.slice());
const SHAPE = { gender: 1, age: 0.5, muscle: 0.8, weight: 0.35, proportions: 1, race: { caucasian: 0.34, african: 0.33, asian: 0.33 } };
for (const [n, w] of macroTargets(SHAPE)) applyTarget(pos, path.join(D, 'targets/macrodetails', n + '.target.gz'), w);
const VG = JSON.parse(fs.readFileSync(path.join(D, 'mesh_metadata/basemesh_vertex_groups.json')));
const groupVerts = name => { const out = []; for (const [a, b] of VG[name]) for (let i = a; i <= b; i++) out.push(i); return out; };
const NBODY = groupVerts('body').length;
// les articulations MakeHuman
const RIG = JSON.parse(fs.readFileSync(path.join(D, 'rigs/standard/rig.game_engine.json')));
const mean = ids => { const s = new V(); ids.forEach(i => s.add(new V().fromArray(pos[i]))); return s.multiplyScalar(1 / ids.length); };
const jpt = h => h.strategy === 'CUBE' ? mean(groupVerts(h.cube_name)) : h.strategy === 'MEAN' ? mean(h.vertex_indices) : mean([h.vertex_index != null ? h.vertex_index : h.vertex_indices[0]]);
// échelle : décimètres → mètres, plante des pieds au sol, hanches à 0,972 m (comme le mannequin)
let sole = 1e9; for (let i = 0; i < NBODY; i++) sole = Math.min(sole, pos[i][1]);
const hipRaw = (jpt(RIG.thigh_l.head).y + jpt(RIG.thigh_r.head).y) / 2, K = 0.972 / (hipRaw - sole);
const T = p => new V(p[0] * K, (p[1] - sole) * K, p[2] * K);
const MJ = {}; for (const b in RIG) MJ[b] = { head: T(jpt(RIG[b].head).toArray()), tail: T(jpt(RIG[b].tail).toArray()) };
// les poids MakeHuman de chaque point du corps
const WMH = (() => { const w = JSON.parse(fs.readFileSync(path.join(D, 'rigs/standard/weights.game_engine.json'))).weights, per = {}; for (const b in w) for (const [i, x] of w[b]) (per[i] = per[i] || {})[b] = (per[i][b] || 0) + x; return per; })();
function fit(F) {
  const sc = ['x_scale', 'y_scale', 'z_scale'].map((k, a) => F[k] ? Math.abs(pos[F[k][0]][a] - pos[F[k][1]][a]) / F[k][2] : 1);
  return F.verts.map(v => {
    const p = [0, 1, 2].map(a => v.w[0] * pos[v.r[0]][a] + v.w[1] * pos[v.r[1]][a] + v.w[2] * pos[v.r[2]][a] + v.d[a] * sc[a]);
    const w = {}; v.r.forEach((r, k) => { const b = WMH[r] || {}; for (const n in b) w[n] = (w[n] || 0) + b[n] * v.w[k]; });
    return { p: T(p), w, ref: v.r[0], y0: T(pos[v.r[0]]).y };
  });
}

// --- le squelette du mannequin (Xbot) ---
const X = (() => {
  const b = fs.readFileSync(GLB), len = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + len).toString());
  const nodes = J.nodes.map(n => ({ name: n.name.replace(/^mixamorig:?/, ''), t: new V().fromArray(n.translation || [0, 0, 0]).multiplyScalar(0.01), kids: n.children || [] }));
  nodes.forEach(n => n.kids.forEach(k => { nodes[k].parent = n; }));
  const by = {}; nodes.forEach(n => { by[n.name] = n; let p = n, w = new V(); while (p && p.name !== 'Armature') { w.add(p.t); p = p.parent; } n.w = w; });
  const bones = J.skins[0].joints.map(i => nodes[i].name);
  return { by, bones };
})();
const BONES = X.bones;
const parentOf = n => { const p = X.by[n].parent; return p && BONES.includes(p.name) ? p.name : null; };
// os du mannequin ← os de MakeHuman
const TO_X = { Root: 'Hips', pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head' };
const FINGER = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky' };
for (const [s, S] of [['l', 'Left'], ['r', 'Right']]) {
  Object.assign(TO_X, { ['clavicle_' + s]: S + 'Shoulder', ['upperarm_' + s]: S + 'Arm', ['lowerarm_' + s]: S + 'ForeArm', ['hand_' + s]: S + 'Hand', ['thigh_' + s]: S + 'UpLeg', ['calf_' + s]: S + 'Leg', ['foot_' + s]: S + 'Foot', ['ball_' + s]: S + 'ToeBase' });
  for (const f in FINGER) for (let k = 1; k <= 3; k++) TO_X[f + '_0' + k + '_' + s] = S + 'Hand' + FINGER[f] + k;
}
const FROM_X = {}; for (const m in TO_X) if (m !== 'Root') FROM_X[TO_X[m]] = m;
// la direction de chaque os : dans le mannequin au repos (vers l'os enfant), et dans MakeHuman
const XKID = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End' };
for (const S of ['Left', 'Right']) {
  Object.assign(XKID, { [S + 'Shoulder']: S + 'Arm', [S + 'Arm']: S + 'ForeArm', [S + 'ForeArm']: S + 'Hand', [S + 'Hand']: S + 'HandMiddle1', [S + 'UpLeg']: S + 'Leg', [S + 'Leg']: S + 'Foot', [S + 'Foot']: S + 'ToeBase', [S + 'ToeBase']: S + 'Toe_End' });
  for (const f of Object.values(FINGER)) for (let k = 1; k <= 3; k++) XKID[S + 'Hand' + f + k] = S + 'Hand' + f + (k + 1);
}
const xdir = n => X.by[XKID[n]].w.clone().sub(X.by[n].w).normalize();
const mhdir = n => { const m = MJ[FROM_X[n]]; const tail = /Hand$/.test(n) ? MJ[FROM_X[n + 'Middle1']].head : m.tail; return tail.clone().sub(m.head).normalize(); };
// rotation qui amène (a1, b1) sur (a2, b2) : a sur a exactement, b au mieux
function frame(a1, b1, a2, b2) {
  const basis = (a, b) => { const e1 = a.clone().normalize(), e2 = b.clone().addScaledVector(e1, -b.dot(e1)).normalize(), e3 = e1.clone().cross(e2); return new M3().makeBasis(e1, e2, e3); };
  return new Q().setFromRotationMatrix(basis(a2, b2).multiply(basis(a1, b1).invert()));
}
// os tournés dans la pose de liaison : bras, mains, doigts, jambes, pieds ; le reste (bassin, dos, cou, tête, clavicules) garde la forme de MakeHuman
const POSED = n => /(Arm|ForeArm|Hand|Hand(Thumb|Index|Middle|Ring|Pinky)[123]|UpLeg|Leg|Foot|ToeBase)$/.test(n) && !/Shoulder/.test(n);
const W = {};      // rotation (monde) de chaque os dans la pose de liaison
for (const n of BONES) {
  if (!FROM_X[n] || !POSED(n)) { W[n] = new Q(); continue; }
  const S = /^Left/.test(n) ? 'Left' : 'Right', s = S === 'Left' ? 'l' : 'r';
  if (/(ForeArm|Hand)/.test(n)) {      // avant-bras, main et doigts : la paume garde son orientation (vecteur index → auriculaire)
    const px = X.by[S + 'HandIndex1'].w.clone().sub(X.by[S + 'HandPinky1'].w), pm = MJ['index_01_' + s].head.clone().sub(MJ['pinky_01_' + s].head);
    W[n] = frame(xdir(n), px, mhdir(n), pm);
  } else W[n] = new Q().setFromUnitVectors(xdir(n), mhdir(n));
}
// position de chaque os dans la pose de liaison
const P = {};
const hipMidMH = MJ.thigh_l.head.clone().add(MJ.thigh_r.head).multiplyScalar(0.5), hipMidX = X.by.LeftUpLeg.w.clone().add(X.by.RightUpLeg.w).multiplyScalar(0.5);
P.Hips = hipMidMH.clone().add(X.by.Hips.w.clone().sub(hipMidX));
for (const n of BONES) if (n !== 'Hips' && FROM_X[n]) P[n] = MJ[FROM_X[n]].head.clone();
// position de repos (dans l'os parent, en m) et rotation locale de liaison de chaque os
const REST = {}, BIND = {};
const order = []; (function walk(n) { order.push(n); BONES.filter(k => parentOf(k) === n).forEach(walk); })('Hips');
for (const n of order) {
  const p = parentOf(n), Wp = p ? W[p] : new Q();
  if (!P[n]) P[n] = P[p].clone().add(X.by[n].t.clone().applyQuaternion(Wp));      // os sans équivalent (bouts des doigts, des orteils, de la tête) : écart du mannequin
  REST[n] = p ? P[n].clone().sub(P[p]).applyQuaternion(Wp.clone().invert()) : P[n].clone();
  BIND[n] = Wp.clone().invert().multiply(W[n]);
}

// --- les pièces ---
const SM = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PART = { skin: 0, shirt: 1, shorts: 2, socks: 3, boots: 4, hair: 5, hands: 6, trim: 7, iris: 8, sclera: 9, arms: 10, brows: 11, scalp: 12 };
const wx = w => { const o = {}; for (const m in w) { const x = TO_X[m]; if (x && w[m] > 0) o[x] = (o[x] || 0) + w[m]; } return o; };
const sumW = (w, re) => Object.keys(w).filter(k => re.test(k)).reduce((s, k) => s + w[k], 0);
// une pièce : points { p, w (os du mannequin), part }, faces (polygones) → triangles
function piece(verts, faces) {
  const keep = new Map(), out = { v: [], idx: [] };
  for (const f of faces) {
    const ids = f.map(i => { if (!keep.has(i)) { keep.set(i, out.v.length); out.v.push(verts[i]); } return keep.get(i); });
    for (let i = 1; i + 1 < ids.length; i++) out.idx.push(ids[0], ids[i], ids[i + 1]);
  }
  return out;
}
// Catmull-Clark (un niveau) : lisse une pièce faite de quadrilatères ; poids et parties suivent
function subdivide(verts, faces) {
  const nv = verts.length, edges = new Map(), ek = (a, b) => a < b ? a * 1e6 + b : b * 1e6 + a;
  const mixW = (list) => { const o = {}; let t = 0; for (const [w, k] of list) { for (const n in w) o[n] = (o[n] || 0) + w[n] * k; t += k; } for (const n in o) o[n] /= t; return o; };
  const fc = faces.map(f => ({ p: f.reduce((s, i) => s.add(verts[i].p), new V()).multiplyScalar(1 / f.length), w: mixW(f.map(i => [verts[i].w, 1])), part: verts[f[0]].part }));
  faces.forEach((f, fi) => f.forEach((v, i) => { const u = f[(i + 1) % f.length], k = ek(v, u); let e = edges.get(k); if (!e) edges.set(k, e = { a: v, b: u, f: [] }); e.f.push(fi); }));
  const vE = verts.map(() => []), vF = verts.map(() => []);
  faces.forEach((f, fi) => f.forEach(v => vF[v].push(fi)));
  const NV = verts.map(v => ({ ...v }));
  for (const e of edges.values()) {
    vE[e.a].push(e); vE[e.b].push(e);
    e.mid = verts[e.a].p.clone().add(verts[e.b].p).multiplyScalar(0.5);
    const p = e.f.length === 2 ? verts[e.a].p.clone().add(verts[e.b].p).add(fc[e.f[0]].p).add(fc[e.f[1]].p).multiplyScalar(0.25) : e.mid.clone();
    e.i = NV.length; NV.push({ p, w: mixW([[verts[e.a].w, 1], [verts[e.b].w, 1]]), part: verts[e.a].part === verts[e.b].part ? verts[e.a].part : Math.min(verts[e.a].part, verts[e.b].part) });
  }
  for (let v = 0; v < nv; v++) {
    const E = vE[v], bd = E.filter(e => e.f.length < 2);
    if (bd.length >= 2) { NV[v].p = verts[v].p.clone().multiplyScalar(0.75).add(bd[0].mid.clone().add(bd[1].mid).multiplyScalar(0.125)); continue; }
    const m = E.length, Fa = vF[v].reduce((s, fi) => s.add(fc[fi].p), new V()).multiplyScalar(1 / vF[v].length), R = E.reduce((s, e) => s.add(e.mid), new V()).multiplyScalar(1 / m);
    NV[v].p = Fa.add(R.multiplyScalar(2)).add(verts[v].p.clone().multiplyScalar(m - 3)).multiplyScalar(1 / m);
  }
  const NF = [];
  faces.forEach((f, fi) => { const c = NV.length; NV.push({ p: fc[fi].p, w: fc[fi].w, part: fc[fi].part }); f.forEach((v, i) => { const nx = f[(i + 1) % f.length], pv = f[(i + f.length - 1) % f.length]; NF.push([v, edges.get(ek(v, nx)).i, c, edges.get(ek(pv, v)).i]); }); });
  return { verts: NV, faces: NF };
}
// composantes connexes d'un maillage (le haut et le pantalon de la tenue sont deux morceaux)
function components(n, faces) {
  const par = Array.from({ length: n }, (_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (const f of faces) for (let i = 1; i < f.length; i++) { const a = find(f[0]), b = find(f[i]); if (a !== b) par[a] = b; }
  return Array.from({ length: n }, (_, i) => find(i));
}
// bords ouverts (arêtes d'une seule face), regroupés en boucles
function borderLoops(faces) {
  const cnt = new Map(), ek = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  for (const f of faces) f.forEach((v, i) => { const k = ek(v, f[(i + 1) % f.length]); cnt.set(k, (cnt.get(k) || 0) + 1); });
  const adj = new Map();
  for (const [k, c] of cnt) if (c === 1) { const [a, b] = k.split(',').map(Number); (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const seen = new Set(), loops = [];
  for (const s of adj.keys()) { if (seen.has(s)) continue; const L = [], st = [s]; while (st.length) { const v = st.pop(); if (seen.has(v)) continue; seen.add(v); L.push(v); for (const u of adj.get(v)) if (!seen.has(u)) st.push(u); } loops.push(L); }
  return loops;
}

const SUIT = readFit(path.join(SYS, 'clothes/male_casualsuit04/male_casualsuit04.mhclo'));
const SHOE = readFit(path.join(SYS, 'clothes/shoes02/shoes02.mhclo'));
const HEM = MJ.calf_l.head.y + 0.13;      // bas du short : 13 cm au-dessus du genou
const SOCK = MJ.calf_l.head.y - 0.075;    // haut des chaussettes : sous le genou
// les pièces de la tenue
const suitV = fit(SUIT), comp = components(suitV.length, SUIT.mesh.faces);
const topRoot = comp[suitV.reduce((b, v, i) => v.p.y > suitV[b].p.y ? i : b, 0)];
const shirtFaces = SUIT.mesh.faces.filter(f => comp[f[0]] === topRoot), pantsFaces = SUIT.mesh.faces.filter(f => comp[f[0]] !== topRoot);
// le maillot : le bas un peu évasé (il tombe par-dessus le short) ; le col et le bout des manches sont de la couleur du short
suitV.forEach(v => { v.w = wx(v.w); v.part = PART.shirt; });
const shirtLoops = faces => borderLoops(faces).map(L => ({ L, c: L.reduce((s, i) => s.add(suitV[i].p), new V()).multiplyScalar(1 / L.length) }));
const isTrim = l => l.c.y > MJ.neck_01.head.y - 0.12 || Math.abs(l.c.x) > 0.2;      // le col et les deux manches (pas le bas du maillot)
const hemLoop = shirtLoops(shirtFaces).filter(l => !isTrim(l)).sort((a, b) => a.c.y - b.c.y)[0];
const hemY = Math.min(...hemLoop.L.map(i => suitV[i].p.y)), hemZ = hemLoop.c.z;
new Set(shirtFaces.flat()).forEach(i => { const v = suitV[i], k = 0.012 * SM(hemY + 0.09, hemY, v.p.y), o = new V(v.p.x, 0, v.p.z - hemZ); if (k > 0 && o.lengthSq() > 1e-8) v.p.addScaledVector(o.normalize(), k); });
// distance (mm) de chaque point au bord du col ou des manches : le shader y trace la bande de couleur, d'un trait net
function markEdges(verts, faces) {
  const loops = borderLoops(faces).map(L => ({ L, c: L.reduce((s, i) => s.add(verts[i].p), new V()).multiplyScalar(1 / L.length) })).filter(isTrim);
  const pts = loops.flatMap(l => l.L.map(i => verts[i].p));
  new Set(faces.flat()).forEach(i => { const d = Math.min(...pts.map(q => q.distanceTo(verts[i].p))); verts[i].edge = Math.min(254, Math.round(d * 1000)); });
}
// le short : le pantalon coupé à mi-cuisse, élargi (plus ample vers le bas) ; la ceinture rentre un peu sous le maillot
const shortsFaces = pantsFaces.filter(f => f.every(i => suitV[i].p.y > HEM));
for (const f of shortsFaces) for (const i of f) {
  const v = suitV[i]; if (v.done) continue; v.done = true; v.part = PART.shorts;
  const S = v.p.x > 0 ? 'l' : 'r', a = MJ['thigh_' + S].head, b = MJ['calf_' + S].head, ab = b.clone().sub(a), t = Math.min(1, Math.max(0, v.p.clone().sub(a).dot(ab) / ab.lengthSq()));
  const axis = a.clone().addScaledVector(ab, t), out = v.p.clone().sub(axis); out.y = 0;
  const crotch = MJ.thigh_l.head.y - 0.08, k = 0.006 * SM(hemY - 0.02, hemY - 0.08, v.p.y) + 0.022 * SM(crotch, HEM, v.p.y);
  if (out.lengthSq() > 1e-8) v.p.addScaledVector(out.normalize(), k);
  const inw = 0.014 * SM(hemY - 0.04, hemY + 0.02, v.p.y), o2 = new V(v.p.x, 0, v.p.z - hemZ);
  if (inw > 0 && o2.lengthSq() > 1e-8) v.p.addScaledVector(o2.normalize(), -inw);
}
// les chaussures, sans leur tige (chaussures basses)
const shoeV = fit(SHOE), shoeComp = components(shoeV.length, SHOE.mesh.faces), shoeSize = {};
shoeComp.forEach(c => { shoeSize[c] = (shoeSize[c] || 0) + 1; });
const big = Math.max(...Object.values(shoeSize));
const shoeFaces = SHOE.mesh.faces.filter(f => shoeSize[shoeComp[f[0]]] === big);
shoeV.forEach(v => { v.w = wx(v.w); v.part = PART.boots; });
const shoeTop = Math.max(...shoeFaces.flat().map(i => shoeV[i].p.y));
// points du corps cachés : sous le maillot, sous le short (au-dessus de son bas), dans les chaussures
const hidden = new Set();
for (const r of SUIT.del) { const y = T(pos[r]).y; if (y > HEM + 0.03) hidden.add(r); }
for (const r of SHOE.del) { const y = T(pos[r]).y; if (y < shoeTop - 0.02) hidden.add(r); }
// le crâne (coupe très courte) : les points du corps couverts par la coupe « short02 »
const HAIR2 = readFit(path.join(SYS, 'hair/short02/short02.mhclo')), hair2V = fit(HAIR2);
const scalp = new Set();
for (let i = 0; i < NBODY; i++) { const p = T(pos[i]); if (p.y < MJ.head.head.y + 0.035) continue; if (hair2V.some(h => h.p.distanceToSquared(p) < 0.012 * 0.012)) scalp.add(i); }
// le corps : peau, chaussettes (bas de la jambe), mains, bras (manches longues du gardien), crâne
function body(proxy) {
  const F = readFit(path.join(SYS, 'proxymeshes', proxy, proxy + '.proxy')), V0 = fit(F);
  V0.forEach(v => {
    const w = v.w; v.w = wx(w);
    const hand = sumW(v.w, /Hand/), arm = sumW(v.w, /(Arm|ForeArm)$/);
    v.part = hand > 0.5 ? PART.hands : arm > 0.5 ? PART.arms : v.y0 < SOCK && sumW(v.w, /(Leg|Foot|ToeBase)$/) > 0.5 ? PART.socks : scalp.has(v.ref) ? PART.scalp : PART.skin;
  });
  const faces = F.mesh.faces.filter(f => !f.every(i => hidden.has(F.verts[i].r[0])));
  return piece(V0, faces);
}
// les yeux : iris (devant) et blanc
function eyes() {
  const F = readFit(path.join(SYS, 'eyes/low-poly/low-poly.mhclo')), V0 = fit(F), c = components(V0.length, F.mesh.faces), ctr = {};
  V0.forEach((v, i) => { (ctr[c[i]] = ctr[c[i]] || { s: new V(), n: 0 }); ctr[c[i]].s.add(v.p); ctr[c[i]].n++; });
  V0.forEach((v, i) => { const o = ctr[c[i]], cc = o.s.clone().multiplyScalar(1 / o.n), d = v.p.clone().sub(cc).normalize(); v.w = { Head: 1 }; v.part = d.z > 0.8 ? PART.iris : PART.sclera; });
  return piece(V0, F.mesh.faces);
}
function simple(file, part) { const F = readFit(path.join(SYS, file)), V0 = fit(F); V0.forEach(v => { v.w = wx(v.w); v.part = part; }); return piece(V0, F.mesh.faces); }

/* Allègement par zones (meshoptimizer) : chaque zone garde sa part de triangles, les bords entre zones ne bougent pas (pas de trou).
   Deux jeux de triangles sur les mêmes points : ordinateur (« idx ») et téléphone (« tel », plus léger). */
let MS = null;
function zones(pc, zoneOf, ratios) {
  const posA = new Float32Array(pc.v.length * 3); pc.v.forEach((v, i) => { posA[i * 3] = v.p.x; posA[i * 3 + 1] = v.p.y; posA[i * 3 + 2] = v.p.z; });
  const by = {};
  for (let t = 0; t < pc.idx.length; t += 3) { const tri = pc.idx.slice(t, t + 3), z = zoneOf ? zoneOf(tri.map(i => pc.v[i])) : 'tout'; (by[z] = by[z] || []).push(...tri); }
  const out = [];
  for (const z in by) {
    const r = ratios[z] != null ? ratios[z] : ratios.tout;
    if (r >= 1) { out.push(...by[z]); continue; }
    const [res] = MS.simplify(new Uint32Array(by[z]), posA, 3, Math.floor(by[z].length * r / 3) * 3, 0.05, ['LockBorder']);
    out.push(...res);
  }
  return out;
}
function lods(pc, zoneOf, ordi, tel, loin) {
  // chaque version est tirée de la précédente : elle n'utilise que des points de la version fine (qui ont tous leur éclairage)
  const rel = (x, y) => { const r = {}; for (const z in x) r[z] = Math.min(1, x[z] / (y[z] != null ? y[z] : y.tout)); return r; };
  const a = zones(pc, zoneOf, ordi), b = zones({ v: pc.v, idx: a }, zoneOf, rel(tel, ordi)), c = loin ? zones({ v: pc.v, idx: b }, zoneOf, rel(loin, tel)) : b;
  const map = new Map(), v = [], re = i => { if (!map.has(i)) { map.set(i, v.length); v.push(pc.v[i]); } return map.get(i); };
  return { v, idx: a.map(re), tel: b.map(re), loin: c.map(re) };
}
// zones du corps : le visage (devant de la tête), le reste de la tête et le cou, les mains, le reste
const faceZone = vs => {
  const z = v => v.part === PART.hands ? 'mains' : (v.w.Head || 0) > 0.5 && v.p.z > P.Head.z + 0.02 && v.p.y < P.Head.y + 0.14 ? 'visage' : sumW(v.w, /^(Head|Neck)$/) > 0.3 ? 'tete' : 'tout';
  const k = vs.map(z); return ['visage', 'tete', 'mains', 'tout'].find(x => k.includes(x));
};

// --- écriture ---
const BI = {}; BONES.forEach((n, i) => { BI[n] = i; });
// toutes les données binaires vont dans un seul bloc (compressé en gzip, puis en base 64) ; chaque pièce garde ses positions dans le bloc
const BLOB = [];
let blobLen = 0;
const put = a => { const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength), pad = (4 - b.length % 4) % 4, at = blobLen; BLOB.push(b, Buffer.alloc(pad)); blobLen += b.length + pad; return [at, b.length]; };
function encode(pc) {
  const n = pc.v.length, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  pc.v.forEach(v => v.p.toArray().forEach((x, a) => { lo[a] = Math.min(lo[a], x); hi[a] = Math.max(hi[a], x); }));
  const P16 = new Int16Array(n * 3), SK = new Uint8Array(n * 8), PT = new Uint8Array(n), ED = new Uint8Array(n);
  pc.v.forEach((v, i) => {
    v.p.toArray().forEach((x, a) => { P16[i * 3 + a] = Math.round((x - lo[a]) / (hi[a] - lo[a] || 1) * 65535) - 32768; });
    const l = Object.entries(v.w).filter(e => e[1] > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4), t = l.reduce((s, e) => s + e[1], 0) || 1;
    if (!l.length) throw new Error('point sans os');
    // poids sur 255, somme exacte : on arrondit vers le bas, puis le reste va aux plus grandes parts perdues
    const q = l.map(e => Math.floor(e[1] / t * 255)), rest = l.map((e, k) => e[1] / t * 255 - q[k]);
    for (let r = 255 - q.reduce((a, b) => a + b, 0); r > 0; r--) { const k = rest.indexOf(Math.max(...rest)); q[k]++; rest[k] = -1; }
    l.forEach((e, k) => { SK[i * 8 + k] = BI[e[0]]; SK[i * 8 + 4 + k] = q[k]; });
    PT[i] = v.part; ED[i] = v.edge != null ? v.edge : 255;
  });
  if (n >= 65536) throw new Error('trop de points');
  const o = { n, tris: pc.idx.length / 3, box: [...lo, ...hi].map(x => +x.toFixed(4)), pos: put(P16), skin: put(SK), part: put(PT), edge: put(ED), idx: put(new Uint16Array(pc.idx)) };
  if (pc.tel) { o.trisTel = pc.tel.length / 3; o.tel = put(new Uint16Array(pc.tel)); }
  if (pc.loin) { o.trisLoin = pc.loin.length / 3; o.loin = put(new Uint16Array(pc.loin)); }
  return o;
}
(async () => {
  MS = require('meshoptimizer').MeshoptSimplifier; await MS.ready;
  const pieces = {
    corps: lods(body('male_generic'), faceZone, { visage: 1, tete: 0.5, mains: 0.5, tout: 0.6 }, { visage: 0.4, tete: 0.3, mains: 0.3, tout: 0.3 }, { visage: 0.1, tete: 0.1, mains: 0.08, tout: 0.12 }),
    maillot: (() => { const r = subdivide(suitV, shirtFaces); markEdges(r.verts, r.faces); return lods(piece(r.verts, r.faces), null, { tout: 1 }, { tout: 0.45 }, { tout: 0.15 }); })(),
    short: lods(piece(suitV, shortsFaces), null, { tout: 1 }, { tout: 0.6 }, { tout: 0.3 }),
    chaussures: lods(piece(shoeV, shoeFaces), null, { tout: 0.6 }, { tout: 0.3 }, { tout: 0.1 }),
    yeux: eyes(),
    sourcils: simple('eyebrows/eyebrow001/eyebrow001.mhclo', PART.brows),
    cheveux1: (() => { hair2V.forEach(v => { v.w = wx(v.w); v.part = PART.hair; }); return lods(piece(hair2V, HAIR2.mesh.faces), null, { tout: 1 }, { tout: 0.65 }, { tout: 0.2 }); })(),
    cheveux2: lods(simple('hair/short04/short04.mhclo', PART.hair), null, { tout: 1 }, { tout: 0.7 }, { tout: 0.3 })
  };
  // le numéro dans le dos : sur le maillot, au milieu du dos, dans le repère de l'os du haut du dos (Spine2)
  const sp = P.Spine2, ny = sp.y + 0.07, back = suitV.filter(v => Math.abs(v.p.x) < 0.03 && Math.abs(v.p.y - ny) < 0.03 && v.p.z < sp.z).reduce((m, v) => Math.min(m, v.p.z), 0);
  const plate = [0, ny - sp.y, back - 0.012 - sp.z].map(x => +(x * 100).toFixed(2));
  const out = {
    bones: BONES, rest: BONES.map(n => REST[n].toArray().map(x => +x.toFixed(4))), bind: BONES.map(n => BIND[n].toArray().map(x => +x.toFixed(5))),
    plate, chaussette: +SOCK.toFixed(3), part: PART, tenue: ['corps', 'maillot', 'short', 'chaussures', 'yeux', 'sourcils'], coupes: ['cheveux1', 'cheveux2'],
    pieces: {}
  };
  for (const k in pieces) { out.pieces[k] = encode(pieces[k]); console.log(k.padEnd(12), 'points', String(out.pieces[k].n).padStart(6), 'triangles', String(out.pieces[k].tris).padStart(6), 'téléphone', String(out.pieces[k].trisTel || out.pieces[k].tris).padStart(6), 'loin', String(out.pieces[k].trisLoin || out.pieces[k].tris).padStart(6)); }
  const raw = Buffer.concat(BLOB), gz = zlib.gzipSync(raw, { level: 9 });
  out.gz = gz.toString('base64'); out.taille = raw.length;
  const js = '/* Corps réaliste des joueurs des ralentis (n° 145), fabriqué par tools/corps.js : ne pas modifier à la main.\n' +
    '   Corps, yeux, sourcils, cheveux, maillot, short et chaussures : MakeHuman (makehumancommunity.org), sous licence CC0. */\n' +
    '(function (root) { const D = ' + JSON.stringify(out) + ';\n  if (typeof module === \'object\' && module.exports) module.exports = D; else root.Corps3D = D; })(typeof self !== \'undefined\' ? self : this);\n';
  fs.writeFileSync(path.join(ROOT, 'corps.js'), js);
  const tot = k => out.tenue.reduce((s, n) => s + (out.pieces[n][k] || out.pieces[n].tris), 0);
  console.log('données :', (raw.length / 1024).toFixed(0), 'ko, compressées', (gz.length / 1024).toFixed(0), 'ko');
  console.log('corps.js :', (js.length / 1024).toFixed(0), 'ko ; triangles par joueur : ordinateur', tot('tris'), ', téléphone', tot('trisTel'), ', de loin', tot('trisLoin'), '(plus les cheveux)');
})();
