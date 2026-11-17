'use strict';
// ======================================================================
//  말판 그림 (현대식 리마스터) — 원작 배치·색·칸 모양은 그대로, 빛·그림자·질감만 새로
//  · paintOffice / paintCity: 정적인 부분 (한 번 그려서 캐시)
//  · drawBoardFx: 매 프레임 겹치는 은은한 효과 (빛 지나감, 먼지)
// ======================================================================
const BFX = { noise: null, poly: null };
function noiseCanvas() {
  if (BFX.noise) return BFX.noise;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), d = x.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return BFX.noise = c;
}
function grain(g, alpha, mode = 'overlay') {
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = mode;
  g.fillStyle = g.createPattern(noiseCanvas(), 'repeat'); g.fillRect(-420, -260, 840, 520);
  g.restore();
}
function shadowOn(g, k, blur, col, ox = 0, oy = 0) { g.shadowColor = col; g.shadowBlur = blur * k; g.shadowOffsetX = ox * k; g.shadowOffsetY = oy * k; }
function shadowOff(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0; }
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
function bbox(pts) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
function canBlur(g) { return 'filter' in g; }

// 두께 있는 칸: 접지 그림자 → 옆면 → 윗면 → 안쪽 베벨 → 광택 → 질감
function slab2(g, k, pts, r, o) {
  const th = o.th ?? 7, [x0, y0, x1, y1] = bbox(pts), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  g.save(); shadowOn(g, k, 9, 'rgba(0,0,0,0.5)', 1.5, th * 0.5 + 3); g.fillStyle = 'rgba(0,0,0,0.55)'; rrect(g, shift(pts, 0, th), r); g.fill(); g.restore();
  const sg = g.createLinearGradient(0, y0, 0, y1 + th); sg.addColorStop(0, o.side); sg.addColorStop(1, o.side2 || o.side);
  g.fillStyle = sg; for (let i = th; i >= 1; i--) { rrect(g, shift(pts, 0, i), r); g.fill(); }
  const tg = g.createLinearGradient(x0, y0, x1, y1); tg.addColorStop(0, o.top); tg.addColorStop(1, o.top2 || o.top);
  g.fillStyle = tg; rrect(g, pts, r); g.fill();
  g.save(); rrect(g, pts, r); g.clip();
  if (o.pattern) o.pattern(g, x0, y0, x1, y1);
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.7)'; rrect(g, shift(pts, 1.3, 1.8), r); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.13)'; rrect(g, shift(pts, -1.3, -1.8), r); g.stroke();
  const gl = g.createRadialGradient(cx - w * 0.22, cy - h * 0.3, 1, cx - w * 0.22, cy - h * 0.3, Math.max(w, h) * 0.75);
  gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(x0, y0, w, h);
  grain(g, 0.07);
  g.restore();
  g.lineWidth = 0.9; g.strokeStyle = o.edge || 'rgba(60,40,20,0.28)'; rrect(g, pts, r); g.stroke();
}
// 원기둥 모양 모서리 칸
function disc2(g, k, x, y, rx, ry, [c1, c2, c3], th = 10, pattern) {
  g.save(); shadowOn(g, k, 12, 'rgba(0,0,0,0.5)', 2, th * 0.6 + 4); g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.ellipse(x, y + th, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
  const sg = g.createLinearGradient(x - rx, 0, x + rx, 0);
  sg.addColorStop(0, c3); sg.addColorStop(0.3, c2); sg.addColorStop(0.55, c2); sg.addColorStop(1, c3);
  g.fillStyle = sg; for (let i = th; i >= 1; i--) { g.beginPath(); g.ellipse(x, y + i, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(x, y + th, rx, ry, 0, 0, Math.PI); g.fill();
  const tg = g.createRadialGradient(x - rx * 0.28, y - ry * 0.4, rx * 0.08, x, y, rx * 1.15);
  tg.addColorStop(0, c1); tg.addColorStop(0.75, c2); tg.addColorStop(1, c3);
  g.fillStyle = tg; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.clip();
  if (pattern) pattern(g, x - rx, y - ry, x + rx, y + ry);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y + 1.5, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.45, rx * 0.45, ry * 0.22, -0.12, 0, Math.PI * 2); g.fill();
  grain(g, 0.06);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, rx - 0.6, ry - 0.6, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
}
function startOct(g, k, x, y, cols, label, lx = 10, ly = -3) {
  const hw = 56, hh = 33, q = 0.42, th = 12;
  const pts = [[-hw * q, -hh], [hw * q, -hh], [hw, -hh * q], [hw, hh * q], [hw * q, hh], [-hw * q, hh], [-hw, hh * q], [-hw, -hh * q]].map(([a, b]) => [x + a, y + b]);
  slab2(g, k, pts, 5, { top: cols[0], top2: cols[1], side: cols[2], side2: cols[3], th, edge: 'rgba(120,40,0,0.5)' });
  g.save(); g.translate(x + lx, y + ly); g.scale(1, 0.66); g.rotate(-0.62);
  g.font = 'bold 25px KoPub, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(150,50,0,0.45)'; g.fillText(label, 1, 2); g.fillStyle = 'rgba(255,214,150,0.95)'; g.fillText(label, 0, 0);
  g.restore();
}
function boardGeom() {
  const P = id => { const [x, y] = nodePos(id); return [x, -y]; };
  const dia = [P(0), P(5), P(15), P(24)];
  const cx = 0, cy = (dia[0][1] + dia[2][1]) / 2;
  const grow = (s, dy = 0) => dia.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s + dy]);
  return { P, dia, cx, cy, grow };
}
// 안쪽 그림자 (펠트·잔디가 테두리 아래로 쏙 들어간 느낌)
function innerShadow(g, k, pts, r, blur, col, oy = 3) {
  g.save(); rrect(g, pts, r); g.clip();
  shadowOn(g, k, blur, col, 0, oy);
  // 바깥 큰 사각형 + 안쪽 판 모양 (안쪽은 비워 두고 그림자만 안으로 떨어지게)
  const sub = new Path2D(); sub.rect(-700, -500, 1400, 1000);
  const inner = new Path2D(); for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    const a1 = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]), a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const s = [p1[0] + Math.cos(a1) * r, p1[1] + Math.sin(a1) * r], e = [p1[0] + Math.cos(a2) * r, p1[1] + Math.sin(a2) * r];
    i ? inner.lineTo(s[0], s[1]) : inner.moveTo(s[0], s[1]); inner.quadraticCurveTo(p1[0], p1[1], e[0], e[1]);
  }
  inner.closePath(); sub.addPath(inner);
  g.fillStyle = '#000'; g.fill(sub, 'evenodd');
  g.restore();
}
// 배경 소품 (멀리 있어 살짝 흐리게)
function blurOn(g, px) { if (canBlur(g)) g.filter = `blur(${px}px)`; }
function blurOff(g) { if (canBlur(g)) g.filter = 'none'; }
function isoBox(g, x, y, w, d, h, [top, left, right], tape) {
  const a = 0.58;
  const T = [[x, y - h], [x + w, y - h - w * a], [x + w - d, y - h - w * a - d * a], [x - d, y - h - d * a]];
  g.fillStyle = left; g.beginPath(); [[x - d, y - d * a], [x, y], [x, y - h], [x - d, y - h - d * a]].forEach(([p, q], i) => i ? g.lineTo(p, q) : g.moveTo(p, q)); g.fill();
  g.fillStyle = right; g.beginPath(); [[x, y], [x + w, y - w * a], [x + w, y - h - w * a], [x, y - h]].forEach(([p, q], i) => i ? g.lineTo(p, q) : g.moveTo(p, q)); g.fill();
  g.fillStyle = top; g.beginPath(); T.forEach(([p, q], i) => i ? g.lineTo(p, q) : g.moveTo(p, q)); g.fill();
  if (tape) { g.strokeStyle = tape; g.lineWidth = Math.max(2, w * 0.12); g.beginPath(); g.moveTo((T[0][0] + T[1][0]) / 2, (T[0][1] + T[1][1]) / 2); g.lineTo((T[2][0] + T[3][0]) / 2, (T[2][1] + T[3][1]) / 2); g.stroke(); }
  return T;
}
function plant(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(4, 4, 20, 8, 0, 0, Math.PI * 2); g.fill();
  const pg = g.createLinearGradient(-14, 0, 14, 0); pg.addColorStop(0, '#6b3a1c'); pg.addColorStop(0.5, '#a35f2e'); pg.addColorStop(1, '#5a2f16');
  g.fillStyle = pg; g.beginPath(); g.moveTo(-14, -22); g.lineTo(14, -22); g.lineTo(10, 0); g.lineTo(-10, 0); g.closePath(); g.fill();
  g.fillStyle = '#c47a40'; g.beginPath(); g.ellipse(0, -22, 14, 5, 0, 0, Math.PI * 2); g.fill();
  const leaves = [[0, -54, 15, '#2f7f36'], [-15, -42, 12, '#27692d'], [15, -42, 12, '#27692d'], [-7, -64, 10, '#3d9944'], [9, -60, 10, '#3d9944'], [0, -40, 12, '#33883a']];
  for (const [lx, ly, r, c] of leaves) {
    const lg = g.createRadialGradient(lx - r * 0.4, ly - r * 0.4, 1, lx, ly, r);
    lg.addColorStop(0, '#7fd47a'); lg.addColorStop(0.5, c); lg.addColorStop(1, '#1b4a20');
    g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
function vignette(g, strength = 0.6) {
  const v = g.createRadialGradient(0, 10, 160, 0, 10, 520);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = v; g.fillRect(-420, -260, 840, 520);
}

// ------------------------------------------------------------------ 사무실 판
function paintOffice(g, st, k) {
  // 방: 따뜻한 조명이 비치는 나무 바닥
  let bg = g.createLinearGradient(0, -240, 0, 240); bg.addColorStop(0, '#24160d'); bg.addColorStop(0.55, '#3b2414'); bg.addColorStop(1, '#5a3418');
  g.fillStyle = bg; g.fillRect(-420, -260, 840, 520);
  g.save(); g.globalAlpha = 0.5;
  for (let i = -18; i <= 18; i++) {                       // 마루 판자 (말판과 같은 기울기)
    const x = i * 46;
    g.strokeStyle = i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(255,200,140,0.06)'; g.lineWidth = i % 2 ? 1.2 : 2;
    g.beginPath(); g.moveTo(x - 520, -300); g.lineTo(x + 520, 300); g.stroke();
  }
  g.restore();
  grain(g, 0.09);
  // 소품 (흐릿하게)
  blurOn(g, 1.6);
  isoBox(g, -378, -150, 46, 40, 34, ['#c8935a', '#8a5a30', '#a8723e'], 'rgba(230,200,140,0.8)');
  isoBox(g, -330, -168, 30, 26, 24, ['#d39f66', '#93603a', '#b07a46'], 'rgba(230,200,140,0.8)');
  isoBox(g, 330, -200, 44, 36, 30, ['#c8935a', '#8a5a30', '#a8723e'], 'rgba(230,200,140,0.8)');
  // 책상 + 모니터 (왼쪽 위)
  isoBox(g, -300, -196, 80, 40, 18, ['#6d4a32', '#3e2818', '#57391f']);
  g.fillStyle = '#1c2230'; g.fillRect(-276, -260, 34, 26); const mg = g.createLinearGradient(-274, -258, -244, -236); mg.addColorStop(0, '#7fd3ff'); mg.addColorStop(1, '#2a6fb0'); g.fillStyle = mg; g.fillRect(-273, -257, 28, 20);
  g.fillStyle = 'rgba(140,210,255,0.25)'; g.beginPath(); g.ellipse(-258, -230, 40, 16, 0, 0, Math.PI * 2); g.fill();
  // 정수기 (오른쪽)
  g.fillStyle = '#d9dde3'; g.fillRect(352, 40, 26, 46); g.fillStyle = '#9fb0c0'; g.fillRect(352, 70, 26, 16);
  const wg = g.createLinearGradient(352, 0, 378, 0); wg.addColorStop(0, 'rgba(120,190,255,0.7)'); wg.addColorStop(1, 'rgba(60,130,220,0.8)');
  g.fillStyle = wg; g.beginPath(); g.ellipse(365, 30, 13, 18, 0, 0, Math.PI * 2); g.fill();
  plant(g, -352, 196, 1.05); plant(g, 360, -96, 0.85); plant(g, 378, 214, 0.95);
  blurOff(g);
  // 바닥에 떨어지는 조명 웅덩이
  const lp = g.createRadialGradient(40, 30, 40, 40, 30, 470); lp.addColorStop(0, 'rgba(255,196,120,0.30)'); lp.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = lp; g.fillRect(-420, -260, 840, 520);

  const { P, cy, grow } = boardGeom();
  const outer = grow(1.5);
  // 탁자: 그림자 → 두께 → 윗면(나뭇결) → 모서리 하이라이트
  g.save(); shadowOn(g, k, 34, 'rgba(0,0,0,0.6)', 0, 22); g.fillStyle = '#3a2210'; rrect(g, shift(outer, 0, 12), 78); g.fill(); g.restore();
  const eg = g.createLinearGradient(0, cy - 220, 0, cy + 240); eg.addColorStop(0, '#7a4a22'); eg.addColorStop(1, '#4a2a12');
  g.fillStyle = eg; for (let i = 12; i >= 1; i -= 1) { rrect(g, shift(outer, 0, i), 78); g.fill(); }
  const wood = g.createLinearGradient(-320, cy - 220, 320, cy + 220);
  wood.addColorStop(0, '#e3b47e'); wood.addColorStop(0.45, '#cf9a62'); wood.addColorStop(1, '#ad7442');
  g.fillStyle = wood; rrect(g, outer, 78); g.fill();
  g.save(); rrect(g, outer, 78); g.clip();
  for (let i = -40; i <= 40; i++) {                       // 나뭇결
    const x = i * 13 + Math.sin(i * 1.7) * 4;
    g.strokeStyle = `rgba(${i % 3 ? '120,70,30' : '255,230,190'},${i % 3 ? 0.10 : 0.10})`; g.lineWidth = 1 + (i % 4 === 0 ? 1.4 : 0);
    g.beginPath(); g.moveTo(x - 420, cy - 300); g.bezierCurveTo(x - 140, cy - 60, x + 120, cy + 40, x + 420, cy + 300); g.stroke();
  }
  grain(g, 0.12);
  const sheen = g.createLinearGradient(-300, cy - 200, 260, cy + 200);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0)'); sheen.addColorStop(0.7, 'rgba(255,255,255,0.06)'); sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = sheen; g.fillRect(-420, -260, 840, 520);
  g.lineWidth = 5; g.strokeStyle = 'rgba(255,240,215,0.45)'; rrect(g, shift(outer, 1.5, 2.5), 78); g.stroke();
  g.restore();
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(80,40,10,0.6)'; rrect(g, outer, 78); g.stroke();
  // 펠트 (안쪽으로 들어간 판)
  const fp = grow(1.06);
  g.fillStyle = 'rgba(70,40,15,0.85)'; rrect(g, shift(grow(1.1), 0, 1), 52); g.fill();          // 펠트 둘레 홈
  g.fillStyle = 'rgba(255,225,180,0.25)'; rrect(g, shift(grow(1.1), 0, 3), 52); g.fill();
  const felt = g.createRadialGradient(0, cy - 20, 30, 0, cy, 330);
  felt.addColorStop(0, '#4e6e82'); felt.addColorStop(0.6, '#36536a'); felt.addColorStop(1, '#22384b');
  g.fillStyle = felt; rrect(g, fp, 46); g.fill();
  g.save(); rrect(g, fp, 46); g.clip(); grain(g, 0.12); g.restore();
  innerShadow(g, k, fp, 46, 14, 'rgba(0,0,0,0.65)', 4);
  BFX.poly = { pts: outer, r: 78 };

  // 칸
  const objAt = n => st && st.objects.find(o => o.node === n);
  for (const n of [...BOARD.nodes].sort((a, b) => b.y - a.y)) {
    const [x, y] = P(n.id);
    if (n.id === 0) { startOct(g, k, x, y, ['#ffb04a', '#f2650f', '#c84d06', '#8f3402'], '출근'); continue; }
    if (CORNER_COL[n.id]) { disc2(g, k, x, y, 54, 31, CORNER_COL[n.id], 11); continue; }
    const cross = CROSS_H.includes(n.id) || CROSS_V.includes(n.id);
    const pts = cross ? rectPts(x, y, 62, 37) : rhombus(x, y, 41, 25);
    const o = objAt(n.id), rad = cross ? 9 : 11;
    if (o && o.type === OBJ.AMERICANO) slab2(g, k, pts, rad, { top: '#ff8c94', top2: '#e2485a', side: '#b52c3e', side2: '#7c1424' });
    else if (o && o.type === OBJ.TOILET) slab2(g, k, pts, rad, { top: '#5fd59a', top2: '#2c9a63', side: '#1f7a4b', side2: '#0f4d2d', pattern: (g2, a, b, c, d) => { g2.strokeStyle = 'rgba(8,70,40,0.45)'; g2.lineWidth = 1; for (let i = -8; i <= 8; i++) { g2.beginPath(); g2.moveTo(x + i * 10 - 60, b - 10); g2.lineTo(x + i * 10 + 60, d + 30); g2.stroke(); g2.beginPath(); g2.moveTo(x + i * 10 + 60, b - 10); g2.lineTo(x + i * 10 - 60, d + 30); g2.stroke(); } } });
    else if (o && o.type === OBJ.REVERSE) slab2(g, k, pts, rad, { top: '#a07bff', top2: '#5d32c9', side: '#4a25a8', side2: '#2c1270' });
    else if (o && o.type === OBJ.WARP) slab2(g, k, pts, rad, { top: '#c8fff8', top2: '#7fd8d0', side: '#3fa8a2', side2: '#1f6e6a' });
    else slab2(g, k, pts, rad, { top: '#fffdf2', top2: '#efe0bb', side: '#d4bd8f', side2: '#9c8456' });
  }
  vignette(g, 0.5);
}

// ------------------------------------------------------------------ 도시 판
function brickPattern(col = 'rgba(120,125,140,0.28)', step = 8) {
  return (g, x0, y0, x1, y1) => {
    g.strokeStyle = col; g.lineWidth = 0.9; let row = 0;
    for (let y = y0 + step * 0.6; y < y1; y += step, row++) {
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      for (let x = x0 + (row % 2 ? step : 0); x < x1; x += step * 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - step); g.stroke(); }
    }
  };
}
function building(g, x, y, w, d, h, base, lit) {
  const T = isoBox(g, x, y, w, d, h, [base[0], base[1], base[2]]);
  const a = 0.58;
  for (let fy = 10; fy < h - 6; fy += 13) for (let i = 1; i <= Math.floor(w / 12); i++) {
    const px = x + i * 12 - 6, py = y - fy - (i * 12 - 6) * a;
    const on = ((i * 7 + fy * 3) % 5) < 2;
    g.fillStyle = on ? lit : 'rgba(20,30,50,0.55)';
    g.beginPath(); g.moveTo(px - 3, py); g.lineTo(px + 3, py - 3.5); g.lineTo(px + 3, py - 10.5); g.lineTo(px - 3, py - 7); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); T.forEach(([p, q], i) => i ? g.lineTo(p, q) : g.moveTo(p, q)); g.fill();
}
function tree(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(6, 4, 22, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6a4024'; g.fillRect(-3, -16, 6, 16);
  for (const [lx, ly, r] of [[0, -32, 18], [-11, -24, 12], [11, -24, 12], [0, -44, 12]]) {
    const lg = g.createRadialGradient(lx - r * 0.45, ly - r * 0.45, 1, lx, ly, r);
    lg.addColorStop(0, '#8be07e'); lg.addColorStop(0.55, '#3f9a45'); lg.addColorStop(1, '#1d5a24');
    g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
function car(g, x, y, col, s = 1, flip = false) {
  g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(2, 3, 26, 10, -0.5, 0, Math.PI * 2); g.fill();
  isoBox(g, -14, 6, 34, 16, 9, [col[0], col[2], col[1]]);
  isoBox(g, -6, -4, 18, 13, 8, ['#cfe9ff', '#5e86a8', '#86b0d0']);
  g.restore();
}
function paintCity(g, st, k) {
  g.fillStyle = '#3a3c42'; g.fillRect(-420, -260, 840, 520);
  grain(g, 0.16);
  const lane = (x0, y0, x1, y1, col, dash, w = 3) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); };
  lane(-440, -110, 70, -405, 'rgba(235,235,235,0.75)', [22, 18]); lane(-460, 210, 380, -275, 'rgba(235,235,235,0.75)', [22, 18]); lane(-210, 330, 520, -95, 'rgba(235,235,235,0.75)', [22, 18]);
  lane(-430, -54, 130, -376, 'rgba(240,190,50,0.85)', []); lane(-120, 336, 480, -6, 'rgba(240,190,50,0.85)', []);
  // 횡단보도
  g.save(); g.translate(-250, 216); g.rotate(-0.52); g.fillStyle = 'rgba(240,240,240,0.7)'; for (let i = 0; i < 6; i++) g.fillRect(-60 + i * 20, -16, 10, 32); g.restore();
  g.save(); g.translate(276, -206); g.rotate(-0.52); g.fillStyle = 'rgba(240,240,240,0.7)'; for (let i = 0; i < 6; i++) g.fillRect(-60 + i * 20, -16, 10, 32); g.restore();
  // 인도 + 건물 + 나무 + 차 (멀리 있어 살짝 흐리게)
  const walk = pts => { g.fillStyle = '#9a9ca2'; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill(); g.save(); g.clip(); g.strokeStyle = 'rgba(60,60,70,0.25)'; g.lineWidth = 1; for (let i = -30; i < 30; i++) { g.beginPath(); g.moveTo(i * 18 - 300, -300); g.lineTo(i * 18 + 300, 300); g.stroke(); g.beginPath(); g.moveTo(i * 18 + 300, -300); g.lineTo(i * 18 - 300, 300); g.stroke(); } g.restore(); };
  walk([[-420, -260], [-150, -260], [-420, -100]]); walk([[420, 260], [170, 260], [420, 110]]); walk([[420, -260], [210, -260], [420, -140]]); walk([[-420, 260], [-220, 260], [-420, 140]]);
  blurOn(g, 1.4);
  building(g, -404, -150, 70, 50, 78, ['#b8bec9', '#6f7785', '#8d95a3'], 'rgba(255,214,120,0.9)');
  building(g, 330, -168, 60, 44, 66, ['#c9b8a6', '#7a6656', '#9c8572'], 'rgba(255,220,140,0.9)');
  building(g, 340, 210, 60, 40, 56, ['#a9c0d6', '#566c84', '#7690ab'], 'rgba(255,230,160,0.9)');
  tree(g, -372, 0, 1.0); tree(g, 372, 90, 0.95); tree(g, -290, -232, 0.85); tree(g, 300, -234, 0.85); tree(g, -380, 230, 1.0);
  car(g, -306, 70, ['#e84a3c', '#a82a20', '#c63a2e'], 0.9); car(g, 300, 128, ['#4a8ce8', '#2a5aa8', '#3a72c8'], 0.85, true); car(g, 210, -230, ['#f0f0f0', '#a8a8b0', '#c8c8d0'], 0.8);
  blurOff(g);
  // TAXI 정류장
  g.save(); g.translate(-288, 146); g.rotate(-0.52); g.strokeStyle = 'rgba(240,200,60,0.9)'; g.lineWidth = 2.5; g.strokeRect(-46, -15, 92, 30);
  g.fillStyle = 'rgba(240,200,60,0.9)'; g.font = 'bold 15px KoPub, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAXI', 0, 1); g.restore();

  const { P, cy, grow } = boardGeom();
  const outer = grow(1.4);
  // 보도블록 테두리
  g.save(); shadowOn(g, k, 26, 'rgba(0,0,0,0.55)', 0, 16); g.fillStyle = '#5c5f66'; rrect(g, shift(outer, 0, 9), 40); g.fill(); g.restore();
  g.fillStyle = '#6e7178'; for (let i = 9; i >= 1; i--) { rrect(g, shift(outer, 0, i), 40); g.fill(); }
  const conc = g.createLinearGradient(-300, cy - 200, 300, cy + 200); conc.addColorStop(0, '#d0d2d6'); conc.addColorStop(1, '#9a9da3');
  g.fillStyle = conc; rrect(g, outer, 40); g.fill();
  g.save(); rrect(g, outer, 40); g.clip(); brickPattern('rgba(90,92,100,0.22)', 12)(g, -420, -260, 420, 260); grain(g, 0.1);
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.55)'; rrect(g, shift(outer, 1.2, 2), 40); g.stroke(); g.restore();
  // 잔디 (깎은 줄무늬)
  const gp = grow(1.27);
  const grass = g.createLinearGradient(0, cy - 230, 0, cy + 230); grass.addColorStop(0, '#46a83a'); grass.addColorStop(1, '#2d7c25');
  g.fillStyle = grass; rrect(g, gp, 34); g.fill();
  g.save(); rrect(g, gp, 34); g.clip();
  for (let i = -20; i <= 20; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,40,0,0.05)'; g.beginPath(); g.moveTo(i * 34 - 300, -300); g.lineTo(i * 34 - 266, -300); g.lineTo(i * 34 + 334, 300); g.lineTo(i * 34 + 300, 300); g.closePath(); g.fill(); }
  g.globalAlpha = 0.16; g.strokeStyle = '#c8ffaa'; g.lineWidth = 1;
  for (let i = 0; i < 420; i++) { const x = ((i * 131) % 760) - 380, y = ((i * 71) % 440) - 220; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y - 4); g.stroke(); }
  g.globalAlpha = 1; grain(g, 0.12);
  g.restore();
  innerShadow(g, k, gp, 34, 12, 'rgba(0,0,0,0.55)', 3);
  BFX.poly = { pts: outer, r: 40 };

  const objAt = n => st && st.objects.find(o => o.node === n);
  const CITY_CORNER = { 5: ['#8ff57a', '#3bc23a', '#1e7a24'], 15: ['#7ec0ff', '#2c7ee0', '#184f9c'], 24: ['#ffe873', '#f0b417', '#a87406'], 8: ['#e0b6ff', '#a86ef0', '#6c3bb5'] };
  for (const n of [...BOARD.nodes].sort((a, b) => b.y - a.y)) {
    const [x, y] = P(n.id);
    if (n.id === 0) { startOct(g, k, x, y, ['#ffa848', '#f2600f', '#c44a06', '#8a3002'], '출발', 26, 8); continue; }
    if (CITY_CORNER[n.id]) { disc2(g, k, x, y, 54, 31, CITY_CORNER[n.id], 11, brickPattern('rgba(0,0,0,0.12)', 9)); continue; }
    const cross = CROSS_H.includes(n.id) || CROSS_V.includes(n.id);
    const pts = cross ? rectPts(x, y, 62, 37) : rhombus(x, y, 41, 25);
    const o = objAt(n.id), rad = cross ? 6 : 8;
    if (o && o.type === OBJ.AMERICANO) slab2(g, k, pts, rad, { top: '#ff8a8e', top2: '#e2485a', side: '#a8283a', side2: '#701220' });
    else if (o && o.type === OBJ.REVERSE) slab2(g, k, pts, rad, { top: '#a07bff', top2: '#5d32c9', side: '#4a25a8', side2: '#2c1270' });
    else if (o && o.type === OBJ.QCARD) slab2(g, k, pts, rad, { top: '#fff6c0', top2: '#ffd34d', side: '#9b55d0', side2: '#5e2a8c' });
    else if (o && o.type === OBJ.TAXI) slab2(g, k, pts, rad, { top: '#b8fff6', top2: '#55cbc2', side: '#2c9c98', side2: '#16605d' });
    else if (o && o.type === OBJ.MANHOLE) slab2(g, k, pts, rad, { top: '#7ee6dd', top2: '#36aaa1', side: '#1f7f7a', side2: '#0f4d4a' });
    else slab2(g, k, pts, rad, { top: '#ffffff', top2: '#e3e5ea', side: '#b9bcc3', side2: '#80838a', pattern: brickPattern(), edge: 'rgba(60,64,80,0.3)' });
  }
  vignette(g, 0.45);
}

// ------------------------------------------------------------------ 매 프레임 효과
const DUST = Array.from({ length: 28 }, (_, i) => ({ x: ((i * 173) % 780) - 390, y: ((i * 97) % 440) - 220, r: 1 + (i % 3) * 0.7, s: 0.3 + (i % 5) * 0.12, p: i * 1.3 }));
function drawBoardFx(g, st) {
  const t = GameUI.t || 0, poly = BFX.poly; if (!poly) return;
  // 탁자 위로 천천히 지나가는 빛
  const u = ((t / 9) % 1) * 1.8 - 0.4, bx = -500 + u * 1000;
  g.save(); rrect(g, poly.pts, poly.r); g.clip();
  g.globalCompositeOperation = 'lighter';
  const sw = g.createLinearGradient(bx - 120, -200, bx + 120, 200);
  sw.addColorStop(0, 'rgba(255,240,210,0)'); sw.addColorStop(0.5, 'rgba(255,240,210,0.07)'); sw.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = sw; g.fillRect(-420, -260, 840, 520);
  g.restore();
  // 공기 중 먼지 (사무실) / 꽃가루 (도시)
  g.save(); g.globalCompositeOperation = 'lighter';
  const city = isCity(st);
  for (const d of DUST) {
    const x = d.x + Math.sin(t * 0.3 * d.s + d.p) * 18, y = ((d.y - t * 6 * d.s + 260) % 520 + 520) % 520 - 260, a = 0.18 + 0.14 * Math.sin(t * 1.3 + d.p);
    g.fillStyle = city ? `rgba(230,255,200,${a * 0.8})` : `rgba(255,220,170,${a})`;
    g.beginPath(); g.arc(x, y, d.r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
