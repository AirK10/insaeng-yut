'use strict';
// ======================================================================
//  3D 윷 — APK에 들어 있는 원작 윷 모델(메시·텍스처)을 WebGL로 그려서 던지는 연출
//  · YUTMODELS: tools/yutmodels.py 가 APK에서 꺼낸 데이터 (스킨별 일반 윷 3개 + 빽도 윷 1개)
//  · 좌표: X 오른쪽, Y 위(높이), Z 화면 안쪽.  화면 = (X, Z·sinE + Y·cosE)  (말판과 같은 기울기)
// ======================================================================
const Yut3D = (() => {
  const ELEV = 37.5 * Math.PI / 180, SIN = Math.sin(ELEV), COS = Math.cos(ELEV);
  const LEN = 172;                       // 화면에서 윷 한 개의 길이(px) — 영상 기준으로 판 너비의 약 1/3
  let cv = null, gl = null, prog = null, failed = false, loc = {}, aniso = null;
  const meshes = {}, texs = {};
  let sticks = [], t = 0, alpha = 1, fade = null, cy = 0, snap = null, persp = [0, 0];

  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUv;
uniform mat3 uRot; uniform vec3 uPos; uniform float uScale; uniform vec2 uSC; uniform vec3 uView; uniform mediump float uShadow; uniform mediump vec3 uLight; uniform vec2 uPersp;
uniform vec3 uSh;   // 그림자: xy = 부드러운 가장자리용 흔들림, z = 이 겹의 깊이
varying vec3 vN; varying vec2 vUv; varying float vH; varying float vD;
void main() {
  vec3 w = uRot * (aPos * uScale) + uPos;
  vH = w.y;
  if (uShadow > 0.5) {
    float h = max(w.y, 0.0);
    w = w - uLight * (w.y / uLight.y); w.y = 0.0;
    w.xz += uSh.xy * (0.35 + h / 70.0);           // 높이 뜰수록 그림자가 넓고 흐려진다
  }
  vN = uRot * aNrm; vUv = aUv;
  float sx = w.x, sy = w.z * uSC.x + w.y * uSC.y + uView.z, d = w.z * uSC.y - w.y * uSC.x;
  vD = d;
  // 원근감: 높이 올라간 윷은 카메라 쪽으로 다가와 커 보인다 (바닥에 닿으면 1배 → 2D 말판과 그대로 맞음)
  float pf = 900.0 / max(300.0, 900.0 - max(w.y, 0.0) * 0.9);
  sx = uPersp.x + (sx - uPersp.x) * pf; sy = uPersp.y + (sy - uPersp.y) * pf;
  gl_Position = vec4(sx / uView.x, sy / uView.y, uShadow > 0.5 ? uSh.z : d / 3000.0, 1.0);
}`;
  const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform mediump float uShadow; uniform float uAlpha; uniform float uShiny; uniform mediump vec3 uLight; uniform vec3 uEye; uniform float uShA;
varying vec3 vN; varying vec2 vUv; varying float vH; varying float vD;
void main() {
  if (uShadow > 0.5) {
    float a = uShA * (1.0 - 0.75 * smoothstep(0.0, 260.0, vH)) * uAlpha;
    gl_FragColor = vec4(vec3(0.06, 0.035, 0.02) * a, a); return;
  }
  vec3 n = normalize(vN);
  vec4 c = texture2D(uTex, vUv);
  vec3 base = c.rgb;
  // 하늘(위)·바닥(아래)에서 오는 은은한 빛 + 왼쪽 위 주 조명(살짝 감싸는 확산광) + 오른쪽 뒤 보조광
  vec3 hemi = mix(vec3(0.36, 0.30, 0.25), vec3(0.74, 0.76, 0.82), n.y * 0.5 + 0.5);
  float nl = dot(n, uLight);
  float wrap = clamp((nl + 0.3) / 1.3, 0.0, 1.0);
  vec3 fillDir = normalize(vec3(0.65, 0.35, 0.45));
  float fill = max(dot(n, fillDir), 0.0);
  vec3 lit = hemi * 0.55 + vec3(1.0, 0.95, 0.86) * wrap * 0.66 + vec3(0.55, 0.62, 0.75) * fill * 0.22;
  // 하이라이트(옻칠·금속 무늬는 더 반짝) + 가장자리 반사광
  vec3 h = normalize(uLight + uEye);
  float spec = pow(max(dot(n, h), 0.0), mix(26.0, 96.0, uShiny)) * mix(0.16, 0.95, uShiny) * step(0.0, nl);
  float fres = pow(1.0 - clamp(dot(n, uEye), 0.0, 1.0), 3.0);
  vec3 col = base * lit + vec3(1.0, 0.97, 0.9) * spec + mix(vec3(0.9), base, 0.4) * fres * 0.16;
  // 부드러운 톤 매핑 + 약간의 채도 보정
  col = col / (1.0 + col * 0.18) * 1.13;
  float lum = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lum), col, 1.08);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * uAlpha, uAlpha);
}`;
  function b64(s, T) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); }
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }

  function init() {
    if (gl || failed) return !!gl;
    try {
      if (typeof YUTMODELS === 'undefined') throw new Error('no models');
      cv = document.createElement('canvas'); cv.width = 800; cv.height = 480;
      gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true }) || cv.getContext('experimental-webgl');
      if (!gl) throw new Error('no webgl');
      prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNrm'); gl.bindAttribLocation(prog, 2, 'aUv');
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      for (const u of ['uRot', 'uPos', 'uScale', 'uSC', 'uView', 'uShadow', 'uLight', 'uTex', 'uAlpha', 'uShiny', 'uEye', 'uPersp', 'uSh', 'uShA']) loc[u] = gl.getUniformLocation(prog, u);
      aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; failed = true; });
    } catch (e) { console.warn('3D 윷을 쓸 수 없어 2D로 표시합니다:', e.message); gl = null; failed = true; }
    return !!gl;
  }
  function mesh(skin, kind) {
    const key = skin + kind; if (meshes[key]) return meshes[key];
    const rec = (YUTMODELS.skins[skin] || YUTMODELS.skins[0])[kind];
    const v = b64(rec.v, Int16Array), i = b64(rec.i, Uint16Array);
    const f = new Float32Array(v.length);
    for (let k = 0; k < v.length; k += 8) { f[k] = v[k] / 30000; f[k + 1] = v[k + 1] / 30000; f[k + 2] = v[k + 2] / 30000; f[k + 3] = v[k + 3] / 32767; f[k + 4] = v[k + 4] / 32767; f[k + 5] = v[k + 5] / 32767; f[k + 6] = v[k + 6] / 8192; f[k + 7] = v[k + 7] / 8192; }
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW);
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
    rec.g.forEach(g => tex(g.tex));
    return meshes[key] = { vbo, ibo, groups: rec.g, ext: rec.ext };
  }
  function tex(name) {
    if (texs[name]) return texs[name];
    const tx = gl.createTexture(); const o = texs[name] = { tx, ok: false };
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 170, 110, 255]));
    const im = new Image();
    im.onload = () => {
      if (!gl) return;
      gl.bindTexture(gl.TEXTURE_2D, tx); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      const pot = x => (x & (x - 1)) === 0;
      if (pot(im.width) && pot(im.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); }
      else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      o.ok = true;
    };
    im.src = YUTMODELS.tex[name];
    return o;
  }
  // 미리 불러 두기 (던질 때 텍스처가 늦게 뜨지 않게)
  function preload(skin) { if (!init()) return false; try { mesh(skin, 'n'); mesh(skin, 'b'); } catch (e) { console.warn(e); failed = true; gl = null; return false; } return true; }

  // rotation = Ry(yaw) · Rz(tilt) · Rx(roll)   (column-major mat3 for GL)
  function rot(yaw, tilt, roll) {
    const cy_ = Math.cos(yaw), sy = Math.sin(yaw), cz = Math.cos(tilt), sz = Math.sin(tilt), cx = Math.cos(roll), sx = Math.sin(roll);
    const a = [cz, sz, 0, -sz * cx, cz * cx, sx, sz * sx, -cz * sx, cx];               // Rz·Rx columns
    const m = new Float32Array(9);
    for (let c = 0; c < 3; c++) { const x = a[c * 3], y = a[c * 3 + 1], z = a[c * 3 + 2]; m[c * 3] = cy_ * x + sy * z; m[c * 3 + 1] = y; m[c * 3 + 2] = -sy * x + cy_ * z; }
    return m;
  }
  const easeOut = u => 1 - Math.pow(1 - u, 3);
  // 윷 한 개의 높이: 기울어진 만큼 끝이 바닥에 닿도록 중심을 올린다
  function restHeight(s, tilt, roll) {
    const L = s.mesh.ext[0] * s.scale, H = s.mesh.ext[1] * s.scale, W = s.mesh.ext[2] * s.scale;
    const thick = Math.abs(Math.cos(roll)) * H + Math.abs(Math.sin(roll)) * W;
    return 0.5 * L * Math.abs(Math.sin(tilt)) + 0.5 * thick * Math.abs(Math.cos(tilt)) + 0.5;
  }
  function pose(s, time) {
    if (s.pv) return { p: [s.end[0], s.rest, s.end[2]], r: rot(s.pvYaw + Math.sin(time * 0.7) * 0.25, 0, s.pvRoll + time * 1.3), done: true };
    if (s.fixed) return { p: s.fixed.p, r: s.fixed.m || rot(...s.fixed.r), done: true };
    const u = Math.max(0, time - s.delay);
    const T = s.T, B1 = s.B1, B2 = s.B2, S = s.S, total = T + B1 + B2 + S;
    const k = Math.min(1, u / total);
    // 회전: 처음엔 빠르게 빙글빙글, 땅에 닿으며 점점 느려져 최종 자세로
    const e = easeOut(k);
    const tilt = (1 - e) * s.spinTilt, roll = s.roll + (1 - e) * s.spinRoll, yaw = s.yaw + (1 - e) * s.spinYaw;
    let x, z, hop;
    if (u < T) { const q = u / T; x = s.from[0] + (s.land[0] - s.from[0]) * q; z = s.from[2] + (s.land[2] - s.from[2]) * q; hop = s.from[1] * (1 - q) + Math.sin(Math.PI * q) * s.peak; }
    else if (u < T + B1) { const q = (u - T) / B1; x = s.land[0] + (s.mid[0] - s.land[0]) * q; z = s.land[2] + (s.mid[2] - s.land[2]) * q; hop = Math.sin(Math.PI * q) * s.hop1; }
    else if (u < T + B1 + B2) { const q = (u - T - B1) / B2; x = s.mid[0] + (s.end[0] - s.mid[0]) * easeOut(q); z = s.mid[2] + (s.end[2] - s.mid[2]) * easeOut(q); hop = Math.sin(Math.PI * q) * s.hop2; }
    else { x = s.end[0]; z = s.end[2]; hop = 0; }
    const y = restHeight(s, tilt, roll) + Math.max(0, hop);
    return { p: [x, y, z], r: rot(yaw, tilt, roll), done: u >= total };
  }
  function render() {
    if (!gl || !sticks.length) return false;
    const k = Math.min(2.5, Math.max(1, Stage.scale || 1)), w = Math.round(800 * k), h = Math.round(480 * k);    // 화면 해상도 그대로 (최대 2.5배)
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const L = [-0.42, 0.80, -0.43], ll = Math.hypot(...L);
    gl.uniform3f(loc.uLight, L[0] / ll, L[1] / ll, L[2] / ll);
    gl.uniform3f(loc.uEye, 0, SIN, -COS);
    gl.uniform2f(loc.uSC, SIN, COS); gl.uniform3f(loc.uView, 400, 240, cy); gl.uniform1f(loc.uAlpha, alpha); gl.uniform1i(loc.uTex, 0);
    gl.uniform2f(loc.uPersp, persp[0], persp[1]);
    const poses = sticks.map(s => pose(s, t));
    const drawSticks = () => sticks.forEach((s, i) => {
      const m = s.mesh, P = poses[i];
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      gl.uniformMatrix3fv(loc.uRot, false, P.r); gl.uniform3f(loc.uPos, P.p[0], P.p[1], P.p[2]); gl.uniform1f(loc.uScale, s.scale);
      for (const g of m.groups) {
        gl.bindTexture(gl.TEXTURE_2D, tex(g.tex).tx); gl.uniform1f(loc.uShiny, g.shiny ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, g.start * 2);
      }
    });
    // 1) 부드러운 그림자: 조금씩 어긋난 7겹을 옅게 겹친다. 겹마다 깊이를 달리해서 한 겹 안에서는 한 번만 칠해진다.
    if (!sticks[0].noShadow) {
      gl.uniform1f(loc.uShadow, 1);
      const taps = [[0, 0]].concat([0, 1, 2, 3, 4, 5].map(i => [Math.cos(i * Math.PI / 3) * 7, Math.sin(i * Math.PI / 3) * 7]));
      gl.uniform1f(loc.uShA, 1 - Math.pow(1 - 0.42, 1 / taps.length));
      taps.forEach(([ox, oz], i) => { gl.uniform3f(loc.uSh, ox, oz, 0.95 - i * 0.01); drawSticks(); });
    }
    // 2) 윷 본체
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(loc.uShadow, 0); gl.uniform3f(loc.uSh, 0, 0, 0);
    drawSticks();
    return true;
  }
  // draw into the game's 2D canvas (called from a custom widget, y-up transform active)
  // 날아가는 동안만 WebGL로 그리고, 다 떨어져 멈추면 한 장의 그림으로 굳혀서 그린다 (가벼운 컴퓨터 배려)
  function draw(g) {
    if (!sticks.length) return;
    let img = snap;
    if (!img) {
      const a0 = alpha; alpha = 1;
      const ok = render(); alpha = a0; if (!ok) return;
      img = cv;
      if (!sticks[0].pv && sticks.every(s => t >= s.delay + s.T + s.B1 + s.B2 + s.S + 0.05)) {
        snap = document.createElement('canvas'); snap.width = cv.width; snap.height = cv.height;
        snap.getContext('2d').drawImage(cv, 0, 0); img = snap;
      }
    }
    g.save(); g.globalAlpha *= alpha; g.transform(1, 0, 0, -1, 0, 0);
    g.drawImage(img, -400, -240, 800, 480);
    g.restore();
  }
  function update(dt) {
    if (!sticks.length) return;
    t += dt;
    if (fade) { fade.t += dt; alpha = Math.max(0, 1 - fade.t / fade.d); if (alpha <= 0) { sticks = []; fade = null; alpha = 1; snap = null; } }
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const toGround = (sx, sy) => [sx, 0, (sy - cy) / SIN];       // screen(px, y-up) → ground point

  /**
   * 윷 4개를 던진다.
   *  skin: 윷 번호(상점 순서), face: 0 도 1 개 2 걸 3 윷 4 모 5 빽도 6 낙
   *  from: 던지는 사람 쪽 화면 좌표 [x, y] (y 위쪽 +), center: 말판 가운데 화면 좌표
   * 반환: 윷이 다 떨어져 멈췄을 때 끝나는 Promise (윷은 clear() 할 때까지 판 위에 남아 있음)
   */
  function throwYut({ skin = 0, face = 0, from = [330, -190], center = [0, 0] }) {
    if (!preload(skin)) return Promise.resolve(false);
    cy = center[1];
    t = 0; alpha = 1; fade = null; snap = null;
    // which sticks show the flat (belly) side:  도1 개2 걸3 윷4 모0, 빽도 = only the marked stick
    const bi = Math.floor(Math.random() * 4);                 // index of the 빽도 stick
    const up = [false, false, false, false];
    const others = [0, 1, 2, 3].filter(i => i !== bi).sort(() => Math.random() - 0.5);
    const nak = face === 6;
    const f = nak ? Math.floor(Math.random() * 3) : face;
    if (f === 5) up[bi] = true;
    else if (f === 0) up[others[0]] = true;
    else if (f === 1) { if (Math.random() < 0.5) { up[bi] = true; up[others[0]] = true; } else { up[others[0]] = true; up[others[1]] = true; } }
    else if (f === 2) { if (Math.random() < 0.75) { up[bi] = true; up[others[0]] = true; up[others[1]] = true; } else others.forEach(i => up[i] = true); }
    else if (f === 3) up.fill(true);
    const [fx, , fz] = toGround(from[0], from[1]);
    const base = Math.random() * Math.PI * 2;
    const out = nak ? [Math.floor(Math.random() * 4)] : [];
    if (nak && Math.random() < 0.4) out.push((out[0] + 1 + Math.floor(Math.random() * 3)) % 4);
    persp = [center[0], center[1]];
    const dirAll = Math.atan2(-fz, center[0] - fx);
    sticks = [0, 1, 2, 3].map(i => {
      const ang = base + i * Math.PI / 2 + rnd(-0.35, 0.35), rad = rnd(52, 104);
      let lx = center[0] + Math.cos(ang) * rad * 1.2, lz = Math.sin(ang) * rad * 1.1;
      if (out.includes(i)) { const a2 = Math.atan2(-fz, -fx) + rnd(-0.5, 0.5); lx = center[0] + Math.cos(a2) * 470; lz = Math.sin(a2) * 420; }
      const dir = Math.atan2(lz - fz, lx - fx);
      const m = mesh(skin, i === bi ? 'b' : 'n');
      const s1 = rnd(16, 30), s2 = rnd(6, 14);
      return {
        mesh: m, scale: LEN, delay: i * 0.045 + rnd(0, 0.03),
        T: rnd(0.44, 0.52), B1: rnd(0.2, 0.24), B2: rnd(0.12, 0.15), S: 0.1,
        from: [fx + rnd(-24, 24), rnd(40, 70), fz + rnd(-24, 24)], land: [lx - Math.cos(dir) * (s1 + s2), 0, lz - Math.sin(dir) * (s1 + s2)],
        mid: [lx - Math.cos(dir) * s2, 0, lz - Math.sin(dir) * s2], end: [lx, 0, lz],
        peak: rnd(150, 190), hop1: rnd(34, 52), hop2: rnd(10, 18),
        roll: up[i] ? Math.PI : 0, spinRoll: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2 * (1 + Math.floor(Math.random() * 2)),
        spinTilt: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2 * (2 + Math.floor(Math.random() * 2)),
        yaw: rnd(0, Math.PI * 2), spinYaw: rnd(-1, 1) * Math.PI * 1.6,
      };
    });
    const total = Math.max(...sticks.map(s => s.delay + s.T + s.B1 + s.B2 + s.S));
    return new Promise(res => Stage.after(total, () => res(true)));
  }
  function clear(d = 0.25) { if (sticks.length && !fade) fade = { t: 0, d }; }
  function reset() { sticks = []; fade = null; alpha = 1; snap = null; }

  // 상점 미리보기: 윷 2개(앞·뒤)를 천천히 돌려서 보여 준다
  function preview({ skin = 0, center = [0, 0], scale = 1 }) {
    if (!preload(skin)) return false;
    cy = center[1]; t = 0; alpha = 1; fade = null; snap = null;
    const mk = (kind, dx, roll0) => {
      const m = mesh(skin, kind);
      return { mesh: m, scale: LEN * scale, delay: 0, T: 0.0001, B: 0.0001, from: [center[0] + dx, 0, 0], land: [center[0] + dx, 0, 0], end: [center[0] + dx, 0, 0], rest: 34 * scale, peak: 0, hop: 0, roll: roll0, spinRoll: 0, yaw: 0, spinYaw: 0, wob: 0, ph: 0, pv: true };
    };
    persp = [center[0], center[1]];
    sticks = [mk('n', 0, 0), mk('b', 0, Math.PI)];
    sticks[0].end[2] = sticks[0].land[2] = sticks[0].from[2] = 46 * scale; sticks[1].end[2] = sticks[1].land[2] = sticks[1].from[2] = -46 * scale;
    sticks.forEach((s, i) => { s.pvRoll = s.roll; s.pvYaw = i ? 0.5 : -0.4; });
    return true;
  }
  // 던지기 버튼 자리에 놓는 윷 묶음 그림 (원작처럼 장착한 윷 4개가 오른쪽 아래에 비스듬히)
  const bundles = {};
  // 화면 평면 위에서 윷이 phi 각도(화면 기준)로 놓이고 둥근 면이 카메라를 보도록 하는 회전
  function faceCam(phi) {
    const a = [Math.cos(phi), Math.sin(phi) * COS, Math.sin(phi) * SIN];          // 길이 방향
    const e = [0, SIN, -COS];                                                       // 카메라 쪽
    const c = [a[1] * e[2] - a[2] * e[1], a[2] * e[0] - a[0] * e[2], a[0] * e[1] - a[1] * e[0]];
    return new Float32Array([...a, ...e, ...c]);
  }
  function bundle(skin) {
    if (bundles[skin]) return bundles[skin];
    if (!preload(skin)) return null;
    const mN = mesh(skin, 'n'), mB = mesh(skin, 'b');
    if (![...mN.groups, ...mB.groups].every(g => tex(g.tex).ok)) return null;     // 텍스처가 다 뜬 뒤에 그린다
    const save = { sticks, t, alpha, fade, cy, snap, persp };
    const sc = LEN * 0.95;
    sticks = [0, 1, 2, 3].map(i => {
      const phi = Math.PI * (0.665 + i * 0.03), sx = -i * 15, sy = -i * 6;
      return { mesh: i === 3 ? mB : mN, scale: sc, noShadow: true, fixed: { p: [sx, 0, sy / SIN - i * 4], m: faceCam(phi) } };
    });
    t = 0; alpha = 1; fade = null; cy = 0; snap = null; persp = [0, 0];
    let out = null;
    try {
      if (render()) {
        const k = cv.width / 800, S = 300;
        out = document.createElement('canvas'); out.width = Math.round(S * k); out.height = Math.round(S * k);
        out.getContext('2d').drawImage(cv, (400 - S / 2) * k, (240 - S / 2) * k, S * k, S * k, 0, 0, out.width, out.height);
        out.size = S;
      }
    } catch (e) { console.warn(e); }
    ({ sticks, t, alpha, fade, cy, snap, persp } = save);
    if (out) bundles[skin] = out;
    return out;
  }
  return { throwYut, clear, reset, draw, update, preload, preview, bundle, get available() { return init(); }, get active() { return sticks.length > 0; } };
})();
