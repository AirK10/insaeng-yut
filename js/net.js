'use strict';
// ======================================================================
//  친구 전용 온라인 방 (매칭 없음 — 방 코드를 아는 친구만 들어올 수 있음)
//  · 기본: PeerJS(WebRTC) — 서버 없이 GitHub Pages 같은 정적 호스팅에서 동작
//  · 테스트용: 같은 브라우저의 여러 탭끼리 BroadcastChannel (주소 끝에 ?local)
// ======================================================================
const ROOM_PREFIX = 'insaengyut2014-';
const PEER_CDN = ['https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function ensurePeerJs() {
  if (window.Peer) return true;
  for (const u of PEER_CDN) { try { await loadScript(u); if (window.Peer) return true; } catch (e) { } }
  return false;
}
const useLocal = () => /[?&]local\b/.test(location.search) || location.hash.includes('local');
const randCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

// ---------- transports ----------
class LocalHost {
  constructor(code) { this.code = code; this.ch = new BroadcastChannel(ROOM_PREFIX + code); this.peers = new Set(); this.onMsg = null; this.onJoin = null; this.onLeave = null;
    this.ch.onmessage = e => {
      const m = e.data; if (!m || m.to !== 'host') return;
      if (m.kind === 'hello') { this.peers.add(m.from); this.onJoin && this.onJoin(m.from); }
      else if (m.kind === 'bye') { this.peers.delete(m.from); this.onLeave && this.onLeave(m.from); }
      else if (m.kind === 'data') this.onMsg && this.onMsg(m.from, m.data);
    };
    this.ch.postMessage({ to: '*', kind: 'hostup' });
  }
  ready() { return Promise.resolve(); }
  send(pid, data) { this.ch.postMessage({ to: pid, kind: 'data', data }); }
  broadcast(data) { for (const p of this.peers) this.send(p, data); }
  close() { this.ch.postMessage({ to: '*', kind: 'hostdown' }); this.ch.close(); }
}
class LocalClient {
  constructor(code) { this.id = 'L' + Math.random().toString(36).slice(2, 8); this.ch = new BroadcastChannel(ROOM_PREFIX + code); this.onMsg = null; this.onClose = null;
    this.ch.onmessage = e => {
      const m = e.data; if (!m) return;
      if (m.kind === 'hostdown') { this.onClose && this.onClose(); return; }
      if (m.to !== this.id) return;
      if (m.kind === 'data') this.onMsg && this.onMsg(m.data);
    };
    window.addEventListener('beforeunload', () => this.close());
  }
  ready() { this.ch.postMessage({ to: 'host', kind: 'hello', from: this.id }); return new Promise(r => setTimeout(r, 150)); }
  send(data) { this.ch.postMessage({ to: 'host', kind: 'data', from: this.id, data }); }
  close() { try { this.ch.postMessage({ to: 'host', kind: 'bye', from: this.id }); this.ch.close(); } catch (e) { } }
}
class PeerHost {
  constructor(code) { this.code = code; this.conns = new Map(); this.onMsg = null; this.onJoin = null; this.onLeave = null; }
  ready() {
    return new Promise((res, rej) => {
      this.peer = new Peer(ROOM_PREFIX + this.code, { debug: 0 });
      this.peer.on('open', () => res());
      this.peer.on('error', e => rej(e));
      this.peer.on('connection', conn => {
        conn.on('open', () => { this.conns.set(conn.peer, conn); this.onJoin && this.onJoin(conn.peer); });
        conn.on('data', d => this.onMsg && this.onMsg(conn.peer, typeof d === 'string' ? JSON.parse(d) : d));
        const gone = () => { if (this.conns.delete(conn.peer)) this.onLeave && this.onLeave(conn.peer); };
        conn.on('close', gone); conn.on('error', gone);
      });
    });
  }
  send(pid, data) { const c = this.conns.get(pid); if (c && c.open) c.send(JSON.stringify(data)); }
  broadcast(data) { const s = JSON.stringify(data); for (const c of this.conns.values()) if (c.open) c.send(s); }
  close() { try { this.peer.destroy(); } catch (e) { } }
}
class PeerClient {
  constructor(code) { this.code = code; this.onMsg = null; this.onClose = null; }
  ready() {
    return new Promise((res, rej) => {
      this.peer = new Peer({ debug: 0 });
      const t = setTimeout(() => rej(new Error('timeout')), 15000);
      this.peer.on('error', e => { clearTimeout(t); rej(e); });
      this.peer.on('open', id => {
        this.id = id;
        this.conn = this.peer.connect(ROOM_PREFIX + this.code, { reliable: true });
        this.conn.on('open', () => { clearTimeout(t); res(); });
        this.conn.on('data', d => this.onMsg && this.onMsg(typeof d === 'string' ? JSON.parse(d) : d));
        this.conn.on('close', () => this.onClose && this.onClose());
        this.conn.on('error', () => this.onClose && this.onClose());
      });
    });
  }
  send(data) { if (this.conn && this.conn.open) this.conn.send(JSON.stringify(data)); }
  close() { try { this.peer.destroy(); } catch (e) { } }
}

// ---------- room / session ----------
const Room = {
  role: null, code: null, tr: null, me: null, lobby: null, game: null, onLobby: null, onGame: null, onClosed: null, onEmo: null,
  profile() {
    const c = cardById(S.equipped) || S.cards[0];
    const pr = { name: S.name, ch: c.ch, cls: c.cls, lv: c.lv, cst: c.cst || null, yut: S.yut || 0, yutLv: (S.yuts && S.yuts[S.yut || 0]) || 1, level: S.level, gm: !!S.gm };
    if (S.gm) { pr.gmOdds = S.odds || 'default'; pr.gmCatch = catchSound(); }        // GM의 뽑기 확률·잡기 소리를 같은 방 친구들에게 전달
    return pr;
  },
  // 대기실에 있는 동안 내 정보(카드·윷·GM 확률)가 바뀌면 다시 알림
  refreshProfile() {
    if (!this.lobby || this.lobby.started) return;
    if (this.role === 'host') { const me = this.lobby.slots.find(s => s.host); if (me) { delete me.gmOdds; Object.assign(me, this.profile()); } this.pushLobby(); }
    else if (this.role === 'client' && this.tr) this.tr.send({ t: 'profile', profile: this.profile() });
  },
  async host(opts = {}) {
    this.role = 'host'; this.code = opts.code || randCode();
    if (opts.solo) { this.tr = { ready() { return Promise.resolve(); }, send() { }, broadcast() { }, close() { } }; }
    else if (useLocal()) this.tr = new LocalHost(this.code);
    else { if (!(await ensurePeerJs())) throw new Error('PeerJS를 불러오지 못했어요 (인터넷 연결 확인)'); this.tr = new PeerHost(this.code); }
    await this.tr.ready();
    this.me = 'host';
    this.lobby = { code: this.code, pieces: 2, mapKind: S.mapKind || 'random', slots: [Object.assign({ pid: 'host', ready: true, host: true, items: {} }, this.profile())], started: false, solo: !!opts.solo };
    this.tr.onJoin = pid => { };
    this.tr.onLeave = pid => this.hostLeave(pid);
    this.tr.onMsg = (pid, m) => this.hostMsg(pid, m);
    this.pushLobby();
  },
  async join(code) {
    this.role = 'client'; this.code = code.toUpperCase().trim();
    if (useLocal()) this.tr = new LocalClient(this.code);
    else { if (!(await ensurePeerJs())) throw new Error('PeerJS를 불러오지 못했어요 (인터넷 연결 확인)'); this.tr = new PeerClient(this.code); }
    this.tr.onMsg = m => this.clientMsg(m);
    this.tr.onClose = () => { if (this.role) { const cb = this.onClosed; this.reset(); cb && cb('방장이 방을 닫았거나 연결이 끊겼어요.'); } };
    await this.tr.ready();
    this.me = this.tr.id;
    this.tr.send({ t: 'hello', profile: this.profile() });
  },
  reset() { if (this.tr) try { this.tr.close(); } catch (e) { } this.tr = null; this.role = null; this.lobby = null; this.game = null; if (this.timer) clearInterval(this.timer); this.timer = null; },
  leave() { this.reset(); },
  // ----- host side -----
  pushLobby() {
    const g = this.lobby.slots.find(s => s.gmOdds); this.lobby.gmOdds = g ? g.gmOdds : null; this.lobby.gmCatch = g ? g.gmCatch : null;
    applyGmOdds(this.lobby);
    this.tr.broadcast({ t: 'lobby', lobby: this.lobby }); this.onLobby && this.onLobby(this.lobby);
  },
  hostMsg(pid, m) {
    const L = this.lobby;
    if (m.t === 'hello') {
      if (L.started) { this.tr.send(pid, { t: 'deny', why: '이미 게임이 시작된 방이에요.' }); return; }
      if (L.slots.length >= 4) { this.tr.send(pid, { t: 'deny', why: '방이 꽉 찼어요 (최대 4명).' }); return; }
      L.slots = L.slots.filter(s => s.pid !== pid);
      L.slots.push(Object.assign({ pid, ready: false, items: {} }, m.profile));
      this.tr.send(pid, { t: 'welcome', pid });
      Sound.play('Come');
      this.pushLobby();
    } else if (m.t === 'profile') { const s = L.slots.find(x => x.pid === pid); if (s && !L.started) { delete s.gmOdds; Object.assign(s, m.profile); this.pushLobby(); } }
    else if (m.t === 'ready') { const s = L.slots.find(x => x.pid === pid); if (s) { s.ready = !!m.v; s.items = m.items || {}; this.pushLobby(); } }
    else if (m.t === 'act' && this.game) this.hostAct(pid, m);
    else if (m.t === 'emo') this.tr.broadcast({ t: 'emo', pid, id: m.id }), this.onEmo && this.onEmo(pid, m.id);
  },
  hostLeave(pid) {
    const L = this.lobby; if (!L) return;
    if (this.game) {
      const pi = this.game.s.players.findIndex(p => p.id === pid);
      if (pi >= 0) { this.game.leave(pi); this.broadcastGame(); }
    } else { L.slots = L.slots.filter(s => s.pid !== pid); this.pushLobby(); }
  },
  addBot() {
    const L = this.lobby; if (L.slots.length >= 4) return;
    const used = L.slots.map(s => s.ch);
    const pool = CHARS.filter(c => !used.includes(c.k));
    const c = pool[Math.floor(Math.random() * pool.length)] || CHARS[0];
    L.slots.push({ pid: 'bot' + Math.random().toString(36).slice(2, 6), name: c.name + '(컴)', ch: c.k, cls: 1 + Math.floor(Math.random() * 3), lv: 1 + Math.floor(Math.random() * 5), yut: Math.floor(Math.random() * BOARD.yutTable.length), yutLv: 1 + Math.floor(Math.random() * 3), ready: true, bot: true, items: {} });
    this.pushLobby();
  },
  kick(pid) { const L = this.lobby; const s = L.slots.find(x => x.pid === pid); if (!s || s.host) return; L.slots = L.slots.filter(x => x.pid !== pid); if (!s.bot) this.tr.send(pid, { t: 'deny', why: '방장이 내보냈어요.' }); this.pushLobby(); },
  canStart() { const L = this.lobby; return L.slots.length >= 2 && L.slots.every(s => s.ready); },
  startGame() {
    const L = this.lobby; if (!this.canStart()) return false;
    L.started = true;
    const me = L.slots.find(s => s.host); me.items = this.myItems || {};
    this.game = new YutGame({ pieces: L.pieces, mapKind: L.mapKind, players: L.slots.map(s => ({ id: s.pid, name: s.name, ch: s.ch, cls: s.cls, lv: s.lv, cst: s.cst || null, gm: !!s.gm, yut: s.yut, yutLv: s.yutLv, bot: !!s.bot, items: s.items })) });
    this.game.startOrder();
    this.armTimer();
    this.broadcastGame(true);
    return true;
  },
  broadcastGame(first) {
    const ev = this.game.flush();
    const msg = { t: 'game', state: this.game.s, ev, first: !!first };
    this.tr.broadcast(msg);
    this.onGame && this.onGame(msg);
    this.scheduleBots();
  },
  hostAct(pid, m) {
    const g = this.game; if (!g) return;
    const pi = g.s.players.findIndex(p => p.id === pid);
    if (pi < 0) return;
    if (m.a === 'pick') { if (g.pickOrder(pi, m.idx)) { if (g.s.phase !== 'order') this.armTimer(); this.broadcastGame(); } return; }
    if (g.s.turn !== pi) return;
    let ok = false;
    if (m.a === 'throw') ok = g.doThrow(pi, m.power);
    else if (m.a === 'move') ok = g.doMove(pi, m.ti, m.k);
    if (ok) { this.armTimer(); this.broadcastGame(); }
  },
  // local actions by the host's own player
  act(m) {
    if (this.role === 'host') this.hostAct('host', m);
    else if (this.tr) this.tr.send(Object.assign({ t: 'act' }, m));
  },
  emo(id) { if (this.role === 'host') { this.tr.broadcast({ t: 'emo', pid: 'host', id }); this.onEmo && this.onEmo('host', id); } else this.tr && this.tr.send({ t: 'emo', id }); },
  armTimer() {
    const g = this.game; if (!g) return;
    g.s.deadline = Date.now() + (g.s.phase === 'order' ? 7000 : g.s.phase === 'throw' ? 15000 : 20000);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 500);
  },
  tick() {
    const g = this.game; if (!g || g.s.phase === 'over') return;
    if (g.s.endsAt && Date.now() > g.s.endsAt && !this.busyAnim) { g.timeUp(); this.broadcastGame(); return; }
    if (Date.now() > g.s.deadline + 400 && !this.busyAnim) {
      if (g.s.phase === 'order') { g.s.players.forEach((p, i) => g.pickOrder(i)); this.armTimer(); this.broadcastGame(); return; }
      this.autoAct(g.s.turn);
    }
  },
  autoAct(pi) {
    const g = this.game; if (!g || g.s.phase === 'over' || g.s.turn !== pi) return;
    let ok = false;
    if (g.s.phase === 'throw') ok = g.doThrow(pi, g.autoThrowPower());
    else if (g.s.phase === 'move') { const mv = g.bestMove(pi); if (mv) ok = g.doMove(pi, mv[0], mv[1]); }
    if (ok) { this.armTimer(); this.broadcastGame(); }
  },
  scheduleBots() {
    const g = this.game; if (!g || g.s.phase === 'over') return;
    if (g.s.phase === 'order') {             // 컴퓨터는 1~3초 고민하다가 윷을 하나 고른다
      if (this._ordBots === g) return; this._ordBots = g;
      g.s.players.forEach((p, i) => {
        if (!p.bot) return;
        setTimeout(() => { if (this.game === g && g.s.phase === 'order' && g.s.orderPicks[i] < 0 && g.pickOrder(i)) { if (g.s.phase !== 'order') this.armTimer(); this.broadcastGame(); } }, 1400 + Math.random() * 1800);
      });
      return;
    }
    const p = g.s.players[g.s.turn];
    if (!p.bot) return;
    const seq = g.s.seq;
    const go = () => {
      if (this.game !== g || g.s.seq !== seq) return;
      if (this.busyAnim) { setTimeout(go, 200); return; }
      setTimeout(() => { if (this.game === g && g.s.seq === seq && !this.busyAnim) this.autoAct(g.s.turn); else go(); }, 500 + Math.random() * 500);
    };
    setTimeout(go, 300);
  },
  // ----- client side -----
  clientMsg(m) {
    if (m.t === 'welcome') this.me = m.pid;
    else if (m.t === 'deny') { const cb = this.onClosed; this.reset(); cb && cb(m.why); }
    else if (m.t === 'lobby') { this.lobby = m.lobby; applyGmOdds(m.lobby); this.onLobby && this.onLobby(m.lobby); }
    else if (m.t === 'game') { this.onGame && this.onGame(m); }
    else if (m.t === 'emo') this.onEmo && this.onEmo(m.pid, m.id);
  },
  setReady(v, items) { if (this.role === 'client') this.tr.send({ t: 'ready', v, items }); },
};
