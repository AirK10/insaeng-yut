/* Mini NGUI runtime: renders exported Unity/NGUI scene trees on a 2D canvas. */
'use strict';
const W = 800, H = 480;
const PIVOT = [[0, 1], [0.5, 1], [1, 1], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 0], [0.5, 0], [1, 0]];

// ---------- matrices (2D affine, y-up) ----------
function mMul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function mLocal(x, y, rotDeg, sx, sy) {
  const r = rotDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}
function mInv(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-9) return null;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
function mApply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

// ---------- assets ----------
const IMG = {};      // atlas name -> HTMLImageElement
const SPR = {};      // atlas name -> {name: rect}
const TEXIMG = {};
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
// 큰 화면에서는 2배 선명한 아틀라스(img2)를 쓴다. 좌표는 그대로 두고 drawImage가 자동으로 2배 위치에서 잘라 온다.
const HI_RES = (() => {
  const k = (window.devicePixelRatio || 1) * Math.min(window.innerWidth / 800, window.innerHeight / 480);
  const lowMem = navigator.deviceMemory && navigator.deviceMemory < 4;
  return k >= 1.35 && !lowMem && !/[?&]lowres/.test(location.search);
})();
(() => {
  const P = CanvasRenderingContext2D.prototype, di = P.drawImage;
  P.drawImage = function (im, a, b, c, d, e, f, g, h) {
    const k = im && im._k;
    if (!k) return di.apply(this, arguments);
    if (arguments.length === 9) return di.call(this, im, a * k, b * k, c * k, d * k, e, f, g, h);
    if (arguments.length === 3) return di.call(this, im, a, b, im.width / k, im.height / k);
    return di.apply(this, arguments);
  };
})();
async function loadAssets() {
  const jobs = [];
  for (const [name, a] of Object.entries(ATLAS)) {
    SPR[name] = a.sp;
    const hi = HI_RES && a.img2;
    jobs.push(loadImage(hi ? a.img2 : a.img).catch(() => loadImage(a.img)).then(im => { if (hi && im.width > 0 && a.w && im.width > a.w) im._k = im.width / a.w; IMG[name] = im; }));
  }
  for (const [name, src] of Object.entries(TEX)) jobs.push(loadImage(src).then(im => TEXIMG[name] = im));
  await Promise.all(jobs);
  await document.fonts.load('20px KoPub');
}
function findSprite(atlas, name) {
  if (atlas && SPR[atlas] && SPR[atlas][name]) return [atlas, SPR[atlas][name]];
  for (const a in SPR) if (SPR[a][name]) return [a, SPR[a][name]];
  return null;
}

// tint cache
const tintCache = new Map();
function tinted(atlas, sp, rgb, gray) {
  const key = atlas + '|' + sp.join(',') + '|' + rgb.map(v => Math.round(v * 255)).join(',') + (gray ? '|g' : '');
  let c = tintCache.get(key);
  if (c) return c;
  const kk = IMG[atlas]._k || 1;
  c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sp[2] * kk)); c.height = Math.max(1, Math.round(sp[3] * kk));
  const g = c.getContext('2d');
  if (gray) g.filter = 'grayscale(1) brightness(1.15)';
  g.drawImage(IMG[atlas], sp[0], sp[1], sp[2], sp[3], 0, 0, c.width, c.height);
  g.filter = 'none';
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${rgb[0] * 255},${rgb[1] * 255},${rgb[2] * 255})`;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(IMG[atlas], sp[0], sp[1], sp[2], sp[3], 0, 0, c.width, c.height);
  if (kk !== 1) c._k = kk;
  tintCache.set(key, c);
  return c;
}
function spriteSource(atlas, sp, color, gray) {
  const white = color[0] > 0.995 && color[1] > 0.995 && color[2] > 0.995;
  if (white && !gray) return [IMG[atlas], sp[0], sp[1]];
  return [tinted(atlas, sp, color, gray), 0, 0];
}

// ---------- audio ----------
const Sound = {
  ctx: null, buffers: {}, bgm: null, bgmName: null, muted: false, unlocked: false, pendingBgm: null,
  async init() {
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const jobs = Object.entries(SOUNDS).map(async ([n, src]) => {
      try {
        const bin = atob(src.split(',')[1]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        this.buffers[n] = await this.ctx.decodeAudioData(arr.buffer);
      } catch (e) { console.warn('audio', n, e); }
    });
    await Promise.all(jobs);
  },
  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
    if (this.pendingBgm) { const p = this.pendingBgm; this.pendingBgm = null; this.playBgm(p); }
  },
  play(name, vol = 1) {
    if (!this.ctx || this.muted || !this.buffers[name]) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name];
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g).connect(this.ctx.destination); s.start();
  },
  playBgm(name) {
    if (!this.ctx) return;
    if (this.bgmName === name && this.bgm) return;
    this.stopBgm();
    this.bgmName = name;
    if (this.ctx.state !== 'running') { this.pendingBgm = name; return; }
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers[name]; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = this.muted ? 0 : 0.6; s.connect(g).connect(this.ctx.destination); s.start();
    this.bgm = { s, g };
  },
  stopBgm() { if (this.bgm) { try { this.bgm.s.stop(); } catch (e) { } this.bgm = null; } this.bgmName = null; },
  setMuted(m) { this.muted = m; if (this.bgm) this.bgm.g.gain.value = m ? 0 : 0.6; },
};

// ---------- tweens ----------
function bounce(t) {
  if (t < 0.363636) return 7.5685 * t * t;
  if (t < 0.727272) { t -= 0.545454; return 7.5625 * t * t + 0.75; }
  if (t < 0.90909) { t -= 0.818181; return 7.5625 * t * t + 0.9375; }
  t -= 0.9545454; return 7.5625 * t * t + 0.984375;
}
function evalCurve(keys, t) {
  if (!keys || !keys.length) return t;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (t >= k0[0] && t <= k1[0]) {
      const dt = k1[0] - k0[0]; if (dt <= 0) return k1[1];
      const u = (t - k0[0]) / dt, u2 = u * u, u3 = u2 * u;
      const m0 = k0[3] * dt, m1 = k1[2] * dt;
      if (!isFinite(m0) || !isFinite(m1)) return u < 1 ? k0[1] : k1[1];
      return (2 * u3 - 3 * u2 + 1) * k0[1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * k1[1] + (u3 - u2) * m1;
    }
  }
  return last[1];
}
function tweenSample(tw, factor) {
  let v = factor;
  if (tw.method === 1) v = 1 - Math.sin(0.5 * Math.PI * (1 - v));
  else if (tw.method === 2) v = Math.sin(0.5 * Math.PI * v);
  else if (tw.method === 3) { const pi2 = Math.PI * 2; v = v - Math.sin(v * pi2) / pi2; }
  else if (tw.method === 4) v = 1 - bounce(1 - v);
  else if (tw.method === 5) v = bounce(v);
  return evalCurve(tw.curve, v);
}
const lerp = (a, b, t) => a + (b - a) * t;

class Tween {
  constructor(node, d) {
    Object.assign(this, d);
    this.node = node;
    this.enabled = !!d.en;
    this.started = false; this.time = 0; this.factor = 0; this.dir = 1; this.onFinish = null;
  }
  play(forward = true, reset = true) {
    this.dir = forward ? 1 : -1;
    if (reset) { this.factor = forward ? 0 : 1; this.time = 0; }
    this.started = false; this.enabled = true; this.apply();
  }
  update(dt) {
    if (!this.enabled) return;
    if (!this.started) { this.started = true; this.time = 0; }
    this.time += dt;
    if (this.time < this.delay) return;
    const dur = this.dur > 0 ? this.dur : 1e-4;
    this.factor += this.dir * dt / dur;
    let done = false;
    if (this.style === 1) { if (this.factor > 1) this.factor -= Math.floor(this.factor); }
    else if (this.style === 2) {
      if (this.factor > 1) { this.factor = 1 - (this.factor - Math.floor(this.factor)); this.dir = -1; }
      else if (this.factor < 0) { this.factor = -this.factor; this.factor -= Math.floor(this.factor); this.dir = 1; }
    } else if (this.factor >= 1 || this.factor <= 0) { this.factor = Math.min(1, Math.max(0, this.factor)); done = true; }
    this.apply();
    if (done) { this.enabled = false; const cb = this.onFinish; if (cb) cb(this); }
  }
  apply() {
    const v = tweenSample(this, this.factor), n = this.node;
    switch (this.t) {
      case 'TweenAlpha': n.setAlpha(lerp(this.from, this.to, v)); break;
      case 'TweenPosition': n.x = lerp(this.from[0], this.to[0], v); n.y = lerp(this.from[1], this.to[1], v); break;
      case 'TweenScale': n.sx = lerp(this.from[0], this.to[0], v); n.sy = lerp(this.from[1], this.to[1], v); break;
      case 'TweenRotation': n.rot = lerp(this.from[2], this.to[2], v); break;
      case 'TweenRotation360': n.rot = lerp(this.raw[2], this.raw[5], v); break;
      case 'TweenColor': { const w = n.widget; if (w) for (let i = 0; i < 4; i++) w.color[i] = lerp(this.from[i], this.to[i], v); break; }
      case 'TweenWidth': if (n.widget) n.widget.w = Math.round(lerp(this.from, this.to, v)); break;
      case 'TweenHeight': if (n.widget) n.widget.h = Math.round(lerp(this.from, this.to, v)); break;
    }
  }
}

// ---------- nodes ----------
let NODE_SEQ = 0;
class Node {
  constructor(d, parent) {
    this.name = d.n; this.parent = parent; this.uid = NODE_SEQ++;
    this.active = !d.off;
    const p = d.p || [0, 0], s = d.s || [1, 1];
    this.x = p[0]; this.y = p[1]; this.sx = s[0]; this.sy = s[1]; this.rot = d.r || 0;
    this.box = d.box || null;
    this.widget = null; this.panel = null; this.tweens = []; this.comps = [];
    this.groupAlpha = 1; this.handlers = [];
    for (const c of d.c || []) {
      if (c.t === 'S' || c.t === 'L' || c.t === 'T' || c.t === 'X') {
        this.widget = Object.assign({}, c, { color: c.c.slice(), kind: c.t, visible: !!c.en });
        if (c.t === 'S') this.widget.atlas = c.at;
      } else if (c.t === 'P') this.panel = { depth: c.pd, alpha: c.a, clip: c.clip, cr: c.cr };
      else if (c.t.startsWith('Tween')) this.tweens.push(new Tween(this, c));
      else this.comps.push(c);
    }
    this.children = (d.k || []).map(k => new Node(k, this));
    this.base = { x: this.x, y: this.y, sx: this.sx, sy: this.sy, rot: this.rot };
    this.data = d;
  }
  clone(parent) {
    const n = new Node(JSON.parse(JSON.stringify(this.data)), parent || this.parent);
    if (parent !== null) (parent || this.parent).children.push(n);
    return n;
  }
  add(child) { child.parent = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(c => c !== child); }
  byPrefix(prefix) { return this.children.find(c => c.name.startsWith(prefix)); }
  comp(t) { return this.comps.find(c => c.t === t); }
  comps_(t) { return this.comps.filter(c => c.t === t); }
  find(name) {
    if (this.name === name) return this;
    for (const c of this.children) { const r = c.find(name); if (r) return r; }
    return null;
  }
  findAll(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.findAll(pred, out); return out; }
  path(p) { let n = this; for (const part of p.split('/')) { n = n && n.children.find(c => c.name === part); } return n; }
  walk(fn) { fn(this); for (const c of this.children) c.walk(fn); }
  setActive(a) { this.active = a; return this; }
  get visibleInTree() { let n = this; while (n) { if (!n.active) return false; n = n.parent; } return true; }
  setAlpha(a) {
    if (this.widget) this.widget.color[3] = a;
    else if (this.panel) this.panel.alpha = a;
    else this.groupAlpha = a;
  }
  getAlpha() { return this.widget ? this.widget.color[3] : this.panel ? this.panel.alpha : this.groupAlpha; }
  setText(t) { if (this.widget && this.widget.kind === 'L') this.widget.tx = String(t); return this; }
  setSprite(name) { if (this.widget && this.widget.kind === 'S') { this.widget.sp = name; const f = findSprite(this.widget.atlas, name); if (f) this.widget.atlas = f[0]; } return this; }
  tween(type) { return this.tweens.find(t => t.t === type); }
  playTweens(forward = true, deep = true) {
    const list = deep ? this.findAll(() => true).flatMap(n => n.tweens) : this.tweens;
    list.forEach(t => t.play(forward));
    return list;
  }
  stopTweens(deep = true) { (deep ? this.findAll(() => true).flatMap(n => n.tweens) : this.tweens).forEach(t => t.enabled = false); }
  resetBase() { Object.assign(this, this.base); }
  onClick(fn) { this.handlers.push(fn); this.clickable = true; return this; }
}

// ---------- stage ----------
const Stage = {
  canvas: null, ctx: null, scale: 1, roots: [], t: 0, timers: [], fns: {}, pressed: null, fallback: null,
  init(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(window.innerWidth / W, window.innerHeight / H);
      canvas.style.width = (W * k) + 'px'; canvas.style.height = (H * k) + 'px';
      canvas.width = Math.round(W * k * dpr); canvas.height = Math.round(H * k * dpr);
      this.scale = k * dpr;
    };
    window.addEventListener('resize', resize); resize();
    // 화면 양옆 빈 곳: 게임 화면을 흐리게 번진 빛으로 채운다 (요즘 게임처럼)
    const amb = document.createElement('canvas'); amb.width = 96; amb.height = 58;
    amb.style.cssText = 'position:fixed;left:-10%;top:-10%;width:120%;height:120%;z-index:-1;filter:blur(36px) brightness(0.5) saturate(1.35);pointer-events:none';
    document.body.appendChild(amb); this.amb = amb.getContext('2d'); this.ambN = 0;
    const pt = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W - W / 2, H / 2 - (e.clientY - r.top) / r.height * H]; };
    canvas.addEventListener('pointerdown', e => { Sound.unlock(); this.down(...pt(e)); });
    canvas.addEventListener('pointermove', e => this.move(...pt(e)));
    window.addEventListener('pointerup', e => this.up(...pt(e)));
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.update(dt); this.render();
      if (this.amb && (this.ambN++ % 6 === 0)) { try { this.amb.drawImage(canvas, 0, 0, 96, 58); } catch (e) { } }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  add(root) { this.roots.push(root); return root; },
  remove(root) { this.roots = this.roots.filter(r => r !== root); },
  after(sec, fn) { const t = { at: this.t + sec, fn }; this.timers.push(t); return t; },
  cancel(t) { this.timers = this.timers.filter(x => x !== t); },
  wait(sec) { return new Promise(r => this.after(sec, r)); },
  on(fnName, handler) { this.fns[fnName] = handler; },
  speed: 1,
  update(dt) {
    dt *= this.speed;
    this.t += dt;
    const due = this.timers.filter(t => t.at <= this.t);
    this.timers = this.timers.filter(t => t.at > this.t);
    due.forEach(t => t.fn());
    const visit = n => { if (!n.active) return; n.tweens.forEach(t => t.update(dt)); if (n.update) n.update(dt); n.children.forEach(visit); };
    this.roots.forEach(visit);
  },
  // collect drawables
  collect() {
    const items = []; let order = 0; const hits = [];
    const visit = (n, M, alpha, panel, clip) => {
      if (!n.active) return;
      const L = mLocal(n.x, n.y, n.rot, n.sx, n.sy);
      const WM = mMul(M, L);
      n.world = WM;
      let pnl = panel, cl = clip, a = alpha * n.groupAlpha;
      if (n.panel) {
        pnl = n.panel; a *= n.panel.alpha;
        if (n.panel.clip) cl = { m: WM, r: n.panel.cr };
      }
      n.renderKey = -1;
      if (n.widget && n.widget.visible) {
        const key = pnl ? pnl.depth * 100000 + n.widget.d : n.widget.d;
        n.renderKey = key;
        items.push({ n, M: WM, a: a * n.widget.color[3], key, order: order++, clip: cl });
      }
      if (n.box || n.clickable) hits.push({ n, M: WM, panel: pnl, clip: cl });
      n.children.forEach(c => visit(c, WM, a, pnl, cl));
    };
    this.roots.forEach(r => visit(r, [1, 0, 0, 1, 0, 0], 1, null, null));
    items.sort((p, q) => p.key - q.key || p.order - q.order);
    return { items, hits };
  },
  render() {
    const g = this.ctx, k = this.scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.fillStyle = '#000'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const { items, hits } = this.collect();
    this.lastHits = hits;
    const base = [k, 0, 0, -k, W / 2 * k, H / 2 * k];
    for (const it of items) {
      if (it.a <= 0.003) continue;
      g.save();
      if (it.clip) {
        const cm = mMul(base, it.clip.m);
        g.setTransform(...cm);
        const r = it.clip.r;
        g.beginPath(); g.rect(r[0] - r[2] / 2, r[1] - r[3] / 2, r[2], r[3]); g.clip();
      }
      g.globalAlpha = Math.min(1, it.a);
      const w = it.n.widget;
      try {
        if (w.kind === 'S') drawSprite(g, mMul(base, it.M), w);
        else if (w.kind === 'L') drawLabel(g, mMul(base, it.M), w);
        else if (w.kind === 'T') drawTexture(g, mMul(base, it.M), w);
        else if (w.kind === 'X') { const MM = mMul(base, it.M); g.setTransform(MM[0], MM[1], MM[2], MM[3], MM[4], MM[5]); w.draw(g, MM); }
        if (w.custom) w.custom(g, mMul(base, it.M));
      } catch (e) { }
      g.restore();
    }
  },
  hitTest(x, y) {
    let best = null, bestKey = -Infinity;
    for (const h of this.lastHits || []) {
      const inv = mInv(h.M); if (!inv) continue;
      const [lx, ly] = mApply(inv, x, y);
      let r;
      if (h.n.box) r = [h.n.box[0] - h.n.box[2] / 2, h.n.box[1] - h.n.box[3] / 2, h.n.box[2], h.n.box[3]];
      else if (h.n.widget) r = widgetRect(h.n.widget);
      else continue;
      if (lx < r[0] || lx > r[0] + r[2] || ly < r[1] || ly > r[1] + r[3]) continue;
      if (h.clip) {
        const ci = mInv(h.clip.m); const [cx, cy] = mApply(ci, x, y); const c = h.clip.r;
        if (Math.abs(cx - c[0]) > c[2] / 2 || Math.abs(cy - c[1]) > c[3] / 2) continue;
      }
      // NGUI: own widget depth, otherwise the minimum depth among child widgets
      let key;
      if (h.n.hitTop) { key = -Infinity; h.n.hitTop.walk(n => { if (n.renderKey > key && n.visibleInTree) key = n.renderKey; }); key += 0.5; }    // 이 패널 맨 위에 있는 것처럼 눌림
      else if (h.n.widget && h.n.widget.visible && h.n.renderKey >= 0) key = h.n.renderKey;
      else {
        key = Infinity;
        h.n.walk(n => { if (n.renderKey >= 0 && n.renderKey < key && n.visibleInTree) key = n.renderKey; });
        if (key === Infinity) key = h.panel ? h.panel.depth * 100000 : 0;
      }
      if (key >= bestKey) { bestKey = key; best = h.n; }
    }
    return best;
  },
  down(x, y) {
    this.lastPt = [x, y];
    const n = this.hitTest(x, y);
    if (n && n.onPress) n.onPress(x, y);
    this.drag = { x, y, n, moved: false };
    if (n && n.onDragStart) n.onDragStart(x, y);
    if (!n || !isButton(n)) { this.pressed = null; return; }
    this.pressed = n; pressVisual(n, true);
  },
  move(x, y) {
    if (this.drag) {
      const d = this.drag;
      if (Math.abs(x - d.x) + Math.abs(y - d.y) > 6) d.moved = true;
      const dragTarget = findDragTarget(d.n);
      if (dragTarget && d.moved) {
        if (this.pressed) { pressVisual(this.pressed, false); this.pressed = null; }
        dragTarget.onDrag(x - (d.lx ?? d.x), y - (d.ly ?? d.y)); d.lx = x; d.ly = y;
      }
    }
  },
  up(x, y) {
    this.lastPt = [x, y];
    const p = this.pressed; this.pressed = null;
    if (p && p.onRelease) p.onRelease(x, y);
    const d = this.drag; this.drag = null;
    if (d) { const t = findDragTarget(d.n); if (t && t.onDragEnd) t.onDragEnd(); }
    if (!p) return;
    pressVisual(p, false);
    const n = this.hitTest(x, y);
    let q = n; while (q && q !== p) q = q.parent;
    if (q !== p) return;
    click(p);
  },
};
function findDragTarget(n) { while (n) { if (n.onDrag) return n; n = n.parent; } return null; }
function isButton(n) { return n.onPress || n.handlers.length || n.comps.some(c => c.t === 'BM' || c.t === 'IB' || c.t === 'B' || c.t === 'BS' || c.t === 'TG'); }
function pressVisual(n, down) {
  const bs = n.comp('BS');
  if (bs) {
    const tgt = n;
    if (!tgt._bsBase) tgt._bsBase = [tgt.sx, tgt.sy];
    const f = down ? bs.pr : 1;
    tgt.sx = tgt._bsBase[0] * f; tgt.sy = tgt._bsBase[1] * f;
    if (!down) tgt._bsBase = null;
  }
  const ib = n.comp('IB');
  if (ib) {
    const bg = n.children.find(c => c.widget && c.widget.kind === 'S' && (c.widget.sp === ib.n || c.widget.sp === ib.pr));
    if (bg && ib.pr && ib.pr !== ib.n) bg.setSprite(down ? ib.pr : ib.n);
  }
}
function click(n) {
  if (n.disabled) return;
  if (n.handlers.length) { n.handlers.forEach(h => h(n)); return; }
  const bms = n.comps_('BM').map(c => c.fn).filter(Boolean);
  let handled = false;
  for (const fn of bms) if (Stage.fns[fn]) { Stage.fns[fn](n); handled = true; }
  if (!handled) {
    const b = n.comp('B');
    if (b && b.on) for (const fn of b.on) if (Stage.fns[fn]) { Stage.fns[fn](n); handled = true; }
  }
  if (!handled && Stage.fallback) Stage.fallback(n, bms);
}

// ---------- drawing ----------
function widgetRect(w) {
  const pv = PIVOT[w.pv] || PIVOT[4];
  return [-pv[0] * w.w, -pv[1] * w.h, w.w, w.h];
}
function drawImg(g, M, src, sx, sy, sw, sh, x0, y0, x1, y1) {
  if (sw <= 0 || sh <= 0 || x1 === x0 || y1 === y0) return;
  // y-up local rect -> draw with flip so image is upright
  g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  g.transform(1, 0, 0, -1, x0, y1);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, x1 - x0, y1 - y0);
}
function drawSprite(g, M, w) {
  const f = findSprite(w.atlas, w.sp); if (!f) return;
  const [atlas, sp] = f;
  const [img, ox, oy] = spriteSource(atlas, sp, w.color, w.gray);
  if (ATLAS[atlas].add) g.globalCompositeOperation = 'lighter';
  let [x0, y0, ww, hh] = widgetRect(w); let x1 = x0 + ww, y1 = y0 + hh;
  const [sx, sy, sw, sh, bl, br, bt, bb, pl, pr, pt, pb] = sp;
  if (w.ty === 1 && (bl || br || bt || bb)) {
    x0 += pl; x1 -= pr; y0 += pb; y1 -= pt;
    // nine slice
    let L = bl, R = br, T = bt, B = bb;
    const dw = x1 - x0, dh = y1 - y0;
    if (L + R > dw) { const s = dw / (L + R); L *= s; R *= s; }
    if (T + B > dh) { const s = dh / (T + B); T *= s; B *= s; }
    const xs = [x0, x0 + L, x1 - R, x1], ys = [y1, y1 - T, y0 + B, y0]; // top->bottom (y-up)
    const sxs = [0, bl, sw - br, sw], sys = [0, bt, sh - bb, sh];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (i === 1 && j === 1 && !w.fc) continue;
      const sW = sxs[j + 1] - sxs[j], sH = sys[i + 1] - sys[i];
      if (sW <= 0 || sH <= 0) continue;
      drawImg(g, M, img, ox + sxs[j], oy + sys[i], sW, sH, xs[j], ys[i + 1], xs[j + 1], ys[i]);
    }
    return;
  }
  if (w.ty === 2) {
    // tiled
    g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    g.transform(1, 0, 0, -1, x0, y1);
    const key = '__pat';
    if (!w[key] || w[key].sp !== w.sp || w[key].img !== img) {
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(img, ox, oy, sw, sh, 0, 0, sw, sh);
      w[key] = { sp: w.sp, img, pat: g.createPattern(c, 'repeat') };
    }
    g.fillStyle = w[key].pat; g.fillRect(0, 0, x1 - x0, y1 - y0);
    return;
  }
  // simple / filled: padding scaled
  const fw = sw + pl + pr, fh = sh + pt + pb;
  const px = fw > 0 ? ww / fw : 1, py = fh > 0 ? hh / fh : 1;
  x0 += pl * px; x1 -= pr * px; y0 += pb * py; y1 -= pt * py;
  if (w.ty === 3 && w.fa < 1) {
    const a = Math.max(0, w.fa);
    if (w.fd === 0) { // horizontal
      if (w.inv) { const nx = x1 - (x1 - x0) * a; drawImg(g, M, img, ox + sw * (1 - a), oy, sw * a, sh, nx, y0, x1, y1); }
      else { drawImg(g, M, img, ox, oy, sw * a, sh, x0, y0, x0 + (x1 - x0) * a, y1); }
      return;
    }
    if (w.fd === 1) { // vertical (fill from bottom)
      if (w.inv) { drawImg(g, M, img, ox, oy, sw, sh * a, x0, y1 - (y1 - y0) * a, x1, y1); }
      else { drawImg(g, M, img, ox, oy + sh * (1 - a), sw, sh * a, x0, y0, x1, y0 + (y1 - y0) * a); }
      return;
    }
    // radial: clip with arc
    g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rad = Math.hypot(x1 - x0, y1 - y0);
    g.beginPath(); g.moveTo(cx, cy);
    const start = Math.PI / 2, end = start - a * Math.PI * 2 * (w.fd === 4 ? 1 : w.fd === 3 ? 0.5 : 0.25);
    g.arc(cx, cy, rad, start, end, !w.inv); g.closePath(); g.clip();
  }
  drawImg(g, M, img, ox, oy, sw, sh, x0, y0, x1, y1);
}
function drawTexture(g, M, w) {
  const im = TEXIMG[w.tex]; if (!im) return;
  const [x0, y0, ww, hh] = widgetRect(w);
  drawImg(g, M, im, 0, 0, im.width, im.height, x0, y0, x0 + ww, y0 + hh);
}
function parseBB(text, base) {
  const segs = []; const stack = [base]; let buf = '';
  const re = /\[([0-9a-fA-F]{6})\]|\[-\]|\[\/?[biu]\]|\[\/?s\]|\[\/?sub\]|\[\/?sup\]/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    buf = text.slice(last, m.index); if (buf) segs.push([buf, stack[stack.length - 1]]);
    if (m[1]) stack.push('#' + m[1]); else if (m[0] === '[-]') { if (stack.length > 1) stack.pop(); }
    last = re.lastIndex;
  }
  buf = text.slice(last); if (buf) segs.push([buf, stack[stack.length - 1]]);
  return segs;
}
function drawBitmapLabel(g, M, w, F) {
  const f = findSprite(F.atlas, F.sprite); if (!f) return false;
  const [atlas, sp] = f;
  const [img, ox, oy] = spriteSource(atlas, sp, w.color, w.gray);
  const sc = (w.fs || F.size) / F.size;
  const lines = String(w.tx).replace(/\[[0-9a-fA-F]{6}\]|\[-\]/g, '').split('\n');
  const lh = F.size * sc;
  const widths = lines.map(l => [...l].reduce((a, ch) => a + ((F.g[ch.charCodeAt(0)] || [0, 0, 0, 0, 0, 0, F.size * 0.5])[6]) * sc, 0));
  const pv = PIVOT[w.pv] || PIVOT[4];
  const total = lh * lines.length;
  let topY = pv[1] === 1 ? 0 : pv[1] === 0 ? -total : -total / 2;
  g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  g.transform(1, 0, 0, -1, 0, 0);
  if (ATLAS[atlas].add) g.globalCompositeOperation = 'lighter';
  lines.forEach((ln, i) => {
    let x = pv[0] === 0 ? 0 : pv[0] === 1 ? -widths[i] : -widths[i] / 2;
    const y = topY + lh * i;
    for (const ch of ln) {
      const gl = F.g[ch.charCodeAt(0)];
      if (!gl) { x += F.size * 0.5 * sc; continue; }
      const [gx, gy, gw, gh, gox, goy, adv] = gl;
      if (gw > 0 && gh > 0) g.drawImage(img, ox + gx - sp[8], oy + gy - sp[10], gw, gh, x + gox * sc, y + goy * sc, gw * sc, gh * sc);
      x += adv * sc;
    }
  });
  return true;
}
function drawLabel(g, M, w) {
  if (!w.tx && w.tx !== 0) return;
  if (w.bf && typeof FONTS !== 'undefined' && FONTS[w.bf] && !w.ttf) { if (drawBitmapLabel(g, M, w, FONTS[w.bf])) return; }
  const fs = w.fs || 16;
  const col = w.color;
  const baseCol = `rgb(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)})`;
  const lines = String(w.tx).split('\n');
  const font = `${w.fst === 1 ? 'bold ' : ''}${fs}px KoPub, sans-serif`;
  g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
  g.transform(1, 0, 0, -1, 0, 0); // y-down local
  g.font = font; g.textBaseline = 'middle';
  const lh = fs + (w.lsp ?? 2);
  const segsPerLine = lines.map(l => parseBB(l, baseCol));
  const widths = segsPerLine.map(s => s.reduce((a, [t]) => a + g.measureText(t).width, 0));
  const maxW = Math.max(...widths);
  let k = 1;
  if ((w.ov === 0 || w.shrink) && w.w > 0 && maxW > w.w) k = w.w / maxW;
  if (k !== 1) g.scale(k, k);
  const pv = PIVOT[w.pv] || PIVOT[4];
  const total = lh * lines.length;
  // pivot point is the origin; for fixed-size boxes align inside box
  const fixed = w.ov !== 2 && w.w > 0;
  let topY;
  if (pv[1] === 1) topY = 0; else if (pv[1] === 0) topY = -total; else topY = -total / 2;
  if (fixed && w.h > total / k) {
    if (pv[1] === 1) topY = 0; else if (pv[1] === 0) topY = -total; else topY = -total / 2;
  }
  topY /= 1; topY = topY / k * 1;
  lines.forEach((ln, i) => {
    const lw = widths[i];
    let x;
    if (pv[0] === 0) x = 0; else if (pv[0] === 1) x = -lw; else x = -lw / 2;
    if (fixed) {
      const bw = w.w / k;
      if (w.align === 'left') x = -pv[0] * bw; else if (w.align === 'right') x = (1 - pv[0]) * bw - lw;
    }
    const y = topY + lh * i + lh / 2;
    for (const [t, c] of segsPerLine[i]) {
      if (w.ef === 2 || w.outline) {
        g.lineWidth = (w.outlineW || 3); g.strokeStyle = w.outline || `rgba(${w.ec[0] * 255},${w.ec[1] * 255},${w.ec[2] * 255},${w.ec[3]})`;
        g.lineJoin = 'round'; g.strokeText(t, x, y);
      } else if (w.ef === 1) {
        g.fillStyle = `rgba(${w.ec[0] * 255},${w.ec[1] * 255},${w.ec[2] * 255},${w.ec[3]})`;
        g.fillText(t, x + (w.ed ? w.ed[0] : 1), y + (w.ed ? w.ed[1] : 1));
      }
      if (w.neon) neonFill(g, t, x, y, fs, M); else { g.fillStyle = c; g.fillText(t, x, y); }
      x += g.measureText(t).width;
    }
  });
}

// GM 전용 네온 무지개 글씨: 색이 흐르는 무지개 + 빛 번짐
function neonFill(g, t, x, y, fs, M) {
  const w = g.measureText(t).width, ph = (Stage.t || 0) * 90;
  const sc = Math.hypot(M[0], M[1]) || 1;
  const gr = g.createLinearGradient(x, 0, x + Math.max(w, 1), 0);
  for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${(ph + i * 55) % 360},100%,${62 + (i % 2) * 6}%)`);
  g.save();
  g.lineJoin = 'round';
  g.shadowColor = `hsl(${(ph + 180) % 360},100%,60%)`; g.shadowBlur = Math.max(4, fs * 0.55) * sc;
  g.lineWidth = Math.max(2, fs * 0.16); g.strokeStyle = 'rgba(20,0,40,0.9)'; g.strokeText(t, x, y);
  g.shadowBlur = Math.max(6, fs * 0.8) * sc; g.fillStyle = gr; g.fillText(t, x, y);
  g.shadowBlur = 0; g.globalAlpha *= 0.55; g.fillStyle = 'rgba(255,255,255,0.9)';
  g.save(); g.beginPath(); g.rect(x, y - fs * 0.5, w, fs * 0.32); g.clip(); g.fillText(t, x, y); g.restore();      // 위쪽 반짝임
  g.restore();
}
function setNeon(node, on) { if (node && node.widget) node.widget.neon = !!on; return node; }

// ---------- scene helpers ----------
function instantiate(sceneName, path) {
  const roots = SCENES[sceneName];
  let d = null;
  const find = (arr, n) => { for (const x of arr) { if (x.n === n) return x; const r = find(x.k || [], n); if (r) return r; } return null; };
  if (!path) d = { n: sceneName, k: roots };
  else if (path.includes('/')) {
    let cur = { k: roots };
    for (const part of path.split('/')) { cur = (cur.k || []).find(x => x.n === part); if (!cur) break; }
    d = cur;
  } else d = find(roots, path);
  if (!d) throw new Error('node not found ' + sceneName + ':' + path);
  return new Node(JSON.parse(JSON.stringify(d)), null);
}

// ---------- programmatic helpers ----------
function mkSprite(name, sp, opt = {}) {
  const f = findSprite(opt.atlas, sp); const r = f ? f[1] : [0, 0, 10, 10];
  return { n: name, p: opt.p, s: opt.s, off: opt.off ? 1 : 0, box: opt.box,
    c: [{ t: 'S', at: f ? f[0] : null, sp, w: opt.w || (r[2] + r[8] + r[9]), h: opt.h || (r[3] + r[10] + r[11]), pv: opt.pv ?? 4, d: opt.d || 0,
      c: opt.c || [1, 1, 1, 1], ty: opt.ty || 0, fc: 1, fd: 0, fa: 1, inv: 0, en: 1 }], k: opt.k };
}
function mkLabel(name, tx, opt = {}) {
  return { n: name, p: opt.p, off: opt.off ? 1 : 0,
    c: [{ t: 'L', tx, fs: opt.fs || 18, fst: 0, c: opt.c || [1, 1, 1, 1], pv: opt.pv ?? 4, w: opt.w || 0, h: opt.h || 0, d: opt.d || 0,
      ef: opt.ef || 0, ec: opt.ec || [0, 0, 0, 1], ed: [1, 1], ov: opt.ov ?? 2, en: 1 }], k: opt.k };
}
function mkCustom(name, draw, opt = {}) {
  return { n: name, p: opt.p, off: opt.off ? 1 : 0, box: opt.box, c: [{ t: 'X', c: [1, 1, 1, 1], pv: 4, w: opt.w || 0, h: opt.h || 0, d: opt.d || 0, en: 1 }], k: opt.k };
}
function buildCustom(name, draw, opt, parent) { const n = build(mkCustom(name, draw, opt), parent); n.widget.draw = draw; return n; }
function mkNode(name, opt = {}) {
  const c = [];
  if (opt.panel !== undefined) c.push({ t: 'P', pd: opt.panel, a: 1, clip: 0, cr: [0, 0, 0, 0] });
  return { n: name, p: opt.p, s: opt.s, off: opt.off ? 1 : 0, box: opt.box, c, k: opt.k || [] };
}
function build(spec, parent = null) { const n = new Node(spec, parent); if (parent) parent.children.push(n); return n; }
const Ease = { linear: t => t, out: t => 1 - (1 - t) * (1 - t), in: t => t * t, inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); } };
function animate(dur, fn, ease = Ease.out) {
  return new Promise(res => {
    const holder = { t: 0 };
    const host = { active: true, tweens: [], children: [], update(dt) {
      holder.t += dt; const k = Math.min(1, holder.t / dur); fn(ease(k), k);
      if (k >= 1) { Stage.animators.delete(host); res(); }
    } };
    fn(0, 0); Stage.animators.add(host);
  });
}
Stage.animators = new Set();
const _origUpdate = Stage.update.bind(Stage);
Stage.update = function (dt) { _origUpdate(dt); for (const a of [...this.animators]) a.update(dt * this.speed); };
// 글자 폭(디자인 픽셀) — 바탕 크기를 글자에 맞출 때
const _twCtx = document.createElement('canvas').getContext('2d');
function textWidth(t, fs = 16, bold = false) { _twCtx.font = `${bold ? 'bold ' : ''}${fs}px KoPub, sans-serif`; return Math.max(...String(t).split('\n').map(l => _twCtx.measureText(l).width)); }
