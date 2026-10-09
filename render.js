/* Dessin du match vu de dessus sur un contexte canvas 2D. Aucun accès au DOM : utilisable aussi hors navigateur. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MatchRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const HL = 52.5, HW = 34, MX = 4.5, MY = 3.5;
const KEEPER = ['#f2a33a', '#26282c'];

// transformation monde (mètres) → écran (pixels)
function view(W, H) {
  const s = Math.min(W / (2 * (HL + MX)), H / (2 * (HW + MY)));
  return { s, ox: W / 2, oy: H / 2 };
}
function toWorld(W, H, px, py) { const v = view(W, H); return { x: (px - v.ox) / v.s, y: (py - v.oy) / v.s }; }

function drawPitch(ctx, W, H) {
  const v = view(W, H), s = v.s, X = x => v.ox + x * s, Y = y => v.oy + y * s;
  ctx.fillStyle = '#2c6b36'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#3c8c47' : '#42954d'; ctx.fillRect(X(-HL + i * 10.5), Y(-HW), 10.5 * s + 1, 2 * HW * s); }
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, 0.14 * s); ctx.lineJoin = 'miter';
  ctx.strokeRect(X(-HL), Y(-HW), 2 * HL * s, 2 * HW * s);
  ctx.beginPath(); ctx.moveTo(X(0), Y(-HW)); ctx.lineTo(X(0), Y(HW)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(0), Y(0), 9.15 * s, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(X(0), Y(0), 0.3 * s, 0, 2 * Math.PI); ctx.fill();
  for (const d of [-1, 1]) {
    const gx = d * HL;
    ctx.strokeRect(X(Math.min(gx, gx - d * 16.5)), Y(-20.16), 16.5 * s, 40.32 * s);
    ctx.strokeRect(X(Math.min(gx, gx - d * 5.5)), Y(-9.16), 5.5 * s, 18.32 * s);
    ctx.beginPath(); ctx.arc(X(gx - d * 11), Y(0), 0.3 * s, 0, 2 * Math.PI); ctx.fill();
    const a = Math.acos(5.5 / 9.15), mid = d > 0 ? Math.PI : 0;                       // arc de cercle de la surface
    ctx.beginPath(); ctx.arc(X(gx - d * 11), Y(0), 9.15 * s, mid - a, mid + a); ctx.stroke();
    for (const c of [-1, 1]) { const a0 = Math.atan2(-c, 0), a1 = Math.atan2(0, -d); ctx.beginPath(); ctx.arc(X(gx), Y(c * HW), 1 * s, a0, a1, ((a1 - a0 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI); ctx.stroke(); }
    // but et filet
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(X(Math.min(gx, gx + d * 2.2)), Y(-3.66), 2.2 * s, 7.32 * s);
    ctx.strokeRect(X(Math.min(gx, gx + d * 2.2)), Y(-3.66), 2.2 * s, 7.32 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
  }
}

/* m : match du moteur ; alpha : interpolation 0…1 entre le pas précédent et le pas courant ;
   opts : { intents: bool, selected: id du joueur ou -1 } */
function drawMatch(ctx, W, H, m, alpha, opts) {
  opts = opts || {};
  const v = view(W, H), s = v.s, X = x => v.ox + x * s, Y = y => v.oy + y * s, L = (a, b) => a + (b - a) * alpha;
  drawPitch(ctx, W, H);
  const pos = m.players.map(p => ({ p, x: L(p.px, p.x), y: L(p.py, p.y) }));
  const b = m.ball, bx = L(b.px, b.x), by = L(b.py, b.y), bz = L(b.pz, b.z);

  // intentions : un trait vers l'endroit où chaque joueur veut aller
  if (opts.intents || opts.selected >= 0) {
    ctx.lineWidth = Math.max(1, 0.12 * s);
    for (const q of pos) {
      const p = q.p, it = p.intent, sel = p.id === opts.selected;
      if (!opts.intents && !sel) continue;
      if (it.type === 'hold' || it.type === 'control' || it.type === 'kick') continue;
      let tx = it.tx, ty = it.ty;
      // match en direct : la cible se lit dans le moteur ; match enregistré (m.icpt absent) : elle est déjà dans l'intention
      if (m.icpt && (it.type === 'chase' || it.type === 'receive' || it.type === 'claim' || it.type === 'press')) { const ic = !b.owner && m.icpt[p.id]; tx = ic ? ic.x : b.x; ty = ic ? ic.y : b.y; }
      ctx.strokeStyle = sel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)';
      ctx.setLineDash([0.6 * s, 0.6 * s]);
      ctx.beginPath(); ctx.moveTo(X(q.x), Y(q.y)); ctx.lineTo(X(tx), Y(ty)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(X(tx), Y(ty), 0.35 * s, 0, 2 * Math.PI); ctx.stroke();
    }
  }

  // joueurs
  const r = 1.05 * s;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 ' + Math.max(7, Math.round(1.15 * s)) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
  for (const q of pos) {
    const p = q.p, x = X(q.x), y = Y(q.y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x + 0.15 * s, y + 0.25 * s, r, r * 0.9, 0, 0, 2 * Math.PI); ctx.fill();
    // orientation du corps
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(x + Math.cos(p.face) * r * 1.55, y + Math.sin(p.face) * r * 1.55);
    ctx.lineTo(x + Math.cos(p.face + 0.55) * r, y + Math.sin(p.face + 0.55) * r); ctx.lineTo(x + Math.cos(p.face - 0.55) * r, y + Math.sin(p.face - 0.55) * r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.role === 'GK' ? KEEPER[p.team] : m.teams[p.team].color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
    ctx.lineWidth = Math.max(1, 0.16 * s); ctx.strokeStyle = p.id === opts.selected ? '#ffe45c' : 'rgba(255,255,255,0.92)'; ctx.stroke();
    if (p.id === opts.selected) { ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.fillText(String(p.num), x, y + 0.05 * s);
  }

  // intention de chaque joueur, écrite sous lui (le joueur sélectionné a déjà son étiquette)
  if (opts.labels) {
    ctx.font = '500 ' + Math.max(9, Math.round(0.95 * s)) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const th = Math.max(12, 1.45 * s);
    for (const q of pos) {
      const p = q.p, txt = p.intent.label;
      if (!txt || p.id === opts.selected) continue;
      const tw = ctx.measureText(txt).width + 6, x = X(q.x), y = Y(q.y) + r * 1.25;
      ctx.fillStyle = 'rgba(12,16,20,0.62)'; ctx.fillRect(x - tw / 2, y, tw, th);
      ctx.fillStyle = p.team === 0 ? '#bcd3ff' : '#ffc2bd'; ctx.fillText(txt, x, y + th / 2 + 0.5);
    }
  }

  // étiquette du joueur sélectionné : son nom et ce qu'il fait
  if (opts.selected >= 0) {
    const q = pos[opts.selected], txt = q.p.name + ' · ' + q.p.intent.label;
    ctx.font = '600 ' + Math.max(11, Math.round(1.3 * s)) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    const tw = ctx.measureText(txt).width + 12, th = Math.max(16, 1.9 * s);
    const lx = Math.min(Math.max(X(q.x) - tw / 2, 4), W - tw - 4), ly = Math.max(4, Y(q.y) - r * 1.7 - th);
    ctx.fillStyle = 'rgba(12,16,20,0.85)'; ctx.fillRect(lx, ly, tw, th);
    ctx.fillStyle = '#ffe45c'; ctx.textAlign = 'left'; ctx.fillText(txt, lx + 6, ly + th / 2 + 0.5);
  }

  // ballon : ombre au sol, ballon décalé et grossi quand il est en l'air
  const br = (0.42 + 0.05 * Math.min(bz, 8)) * s;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X(bx) + 0.1 * s, Y(by) + 0.12 * s, 0.42 * s, 0.34 * s, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = Math.max(1, 0.1 * s);
  ctx.beginPath(); ctx.arc(X(bx), Y(by) - bz * 0.45 * s, br, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  // chrono façon télé, dans la marge au-dessus du terrain : temps de jeu, score, arrêt de jeu
  if (opts.clock) {
    const c = opts.clock, txt = c.time + (c.score ? '   ' + c.score : '') + (c.dead ? '   Arrêt de jeu' : '');
    ctx.font = '700 ' + Math.max(12, Math.round(1.6 * s)) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    const tw = ctx.measureText(txt).width + 16, th = Math.max(18, Math.min(2.4 * s, MY * s - 4)), lx = X(-HL), ly = Y(-HW) - (MY * s + th) / 2;
    ctx.fillStyle = 'rgba(12,16,20,0.85)'; ctx.fillRect(lx, ly, tw, th);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, lx + 8, ly + th / 2 + 0.5);
  }
}

return { drawMatch, drawPitch, toWorld };
});
