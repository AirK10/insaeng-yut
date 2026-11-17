'use strict';
// ======================================================================
//  출근 하기: 친구 방 → 대기실(레디룸) → 윷놀이 게임 → 결과
// ======================================================================
// 말판 좌표: APK setting 데이터의 칸 위치를 원작 화면 비율(영상 기준 약 0.94배)로 놓는다
const BOARD_SCALE = 0.94, BOARD_DY = 6;
const nodePos = id => { const n = NODE[id]; return [n.x * BOARD_SCALE, n.y * BOARD_SCALE + BOARD_DY]; };
const READY_ITEMS = [
  { key: 'boost', name: '승점 부스터', price: 1000, cur: 'coin', desc: '1등 하면 획득 코인 1.5배' },
  { key: 'shield', name: '승점 방어권', price: 1000, cur: 'coin', desc: '져도 코인을 넉넉히 받아요' },
  { key: 'noNak', name: '낙 1회 방지', price: 2000, cur: 'coin', desc: '처음 나온 낙을 막아 줘요' },
  { key: 'combine', name: '업고 출발', price: 24, cur: 'fp', desc: '첫 출근 때 말 2개를 업고 출발' },
];
const MISSIONS = ['한번도 잡히지 않기', '상대 말 2번 잡기', '업고 퇴근하기', '모 한 번 던지기'];

// ---------------------------------------------------------------- small UI kit (canvas)
function overlayRoot(depth = 250) {
  const o = build(mkNode('overlay', { panel: depth, k: [mkSprite('dim', 'Common_scroll_white', { w: 820, h: 500, c: [0, 0, 0, 0.6], ty: 1, box: [0, 0, 820, 500] })] }));
  Stage.add(o); return o;
}
function mkButton(parent, name, label, sp, x, y, w, h, fn, fs = 19) {
  const b = build(mkNode(name, { p: [x, y], box: [0, 0, w, h], k: [
    mkSprite('bg', sp, { w, h, ty: 1, d: 5 }),
    mkLabel('lab', label, { fs, d: 6, p: [0, 1], c: [1, 1, 1, 1] })] }), parent);
  const lab = b.find('lab'); lab.widget.outline = 'rgba(0,0,0,0.45)'; lab.widget.outlineW = 3;
  b.comps.push({ t: 'BS', pr: 1.08, hv: 1, dur: 0.1 });
  onTap(b, () => { Sound.play('UI_Select'); fn(); });
  return b;
}
function frameBox(parent, w, h, title, y = 0) {
  const box = build(mkNode('box', { p: [0, y], box: [0, 0, w, h], k: [
    mkSprite('outer', 'Popup_frame_board_shadow', { w, h, ty: 1, d: 1 }),
    mkSprite('inner', 'Popup_frame_paper', { w: w - 22, h: h - 34, ty: 1, d: 2, p: [0, 6] }),
  ] }), parent);
  if (title) {
    build(mkSprite('tbar', 'Game_Popup_frame_namebar', { w: w - 26, h: 38, ty: 1, d: 3, p: [0, h / 2 - 18] }), box);
    const t = build(mkLabel('title', title, { fs: 22, d: 4, p: [0, h / 2 - 19], c: [1, 1, 1, 1] }), box);
    t.widget.outline = 'rgba(90,40,0,0.8)'; t.widget.outlineW = 3;
  }
  box.sx = box.sy = 0.6; animate(0.18, k => { box.sx = box.sy = 0.6 + 0.4 * k; }, Ease.back);
  return box;
}
function choiceMenu(title, items, sub) {
  return new Promise(resolve => {
    const o = overlayRoot();
    const h = 110 + items.length * 66 + (sub ? 20 : 0);
    const box = frameBox(o, 400, h, title);
    const close = v => { Stage.remove(o); resolve(v); };
    let y = h / 2 - 78;
    if (sub) { build(mkLabel('sub', sub, { fs: 15, d: 4, p: [0, y + 4], c: [0.55, 0.3, 0.1, 1] }), box); y -= 22; }
    items.forEach((it, i) => {
      const b = mkButton(box, 'b' + i, it.label, it.sp || 'Popup_btn_OK', 0, y - 6, 280, 54, () => close(it.value), 21);
      if (it.desc) { b.find('lab').y = 7; build(mkLabel('d', it.desc, { fs: 12, d: 6, p: [0, -13], c: [1, 1, 0.85, 1] }), b); }
      y -= 64;
    });
    const x = build(mkSprite('x', 'Popup_btn_close', { p: [185, h / 2 - 22], d: 6, box: [0, 0, 44, 46] }), box);
    onTap(x, () => { Sound.play('UI_Close'); close(null); });
    Sound.play('popup');
  });
}
function textPopup(title, desc, opt = {}) {
  return new Promise(resolve => {
    const o = overlayRoot();
    const box = frameBox(o, 400, 238, title);
    build(mkLabel('t', desc, { fs: 16, d: 4, p: [0, 40], c: [0.4, 0.21, 0, 1] }), box);
    build(mkSprite('in', 'Popup_frame_input', { w: 240, h: 40, ty: 1, d: 3, p: [0, -2] }), box);
    let inp = null;
    const close = v => { if (inp) inp._cleanup(); Stage.remove(o); resolve(v); };
    const val = () => inp && inp.value.trim();
    mkButton(box, 'c', '취소', 'Popup_btn_cancel', -74, -66, 134, 52, () => close(null));
    mkButton(box, 'ok', '확인', 'Popup_btn_OK', 74, -66, 134, 52, () => close(val()));
    Stage.after(0.22, () => {
      inp = overlayInput(0, -2, 220, 36, { placeholder: opt.placeholder || '', max: opt.max || 8, value: opt.value || '' });
      inp.focus(); inp.select && inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') close(val()); });
    });
    Sound.play('popup');
  });
}
async function ensureNickname() {
  if (S.named) return true;
  const v = await textPopup('닉네임 정하기', '친구들에게 보일 닉네임을 입력하세요 (최대 8자)', { value: S.name === '나' ? '' : S.name, placeholder: '닉네임' });
  if (!v) return false;
  S.name = v.slice(0, 8); S.named = true; save();
  if (G.screen === 'main' && G.root.find('UserName')) setNeon(G.root.find('UserName'), S.gm).setText(S.name);
  return true;
}
function codePopup() {
  return new Promise(resolve => {
    const o = overlayRoot();
    const box = frameBox(o, 400, 238, '방 참가');
    build(mkLabel('t', '친구에게 받은 방 코드 5자리를 입력하세요', { fs: 16, d: 4, p: [0, 40], c: [0.4, 0.21, 0, 1] }), box);
    build(mkSprite('in', 'Popup_frame_input', { w: 220, h: 40, ty: 1, d: 3, p: [0, -2] }), box);
    let inp = null;
    const close = v => { if (inp) inp._cleanup(); Stage.remove(o); resolve(v); };
    mkButton(box, 'c', '취소', 'Popup_btn_cancel', -74, -66, 134, 52, () => close(null));
    mkButton(box, 'ok', '참가', 'Popup_btn_OK', 74, -66, 134, 52, () => close(inp && inp.value.trim().toUpperCase()));
    Stage.after(0.22, () => {
      inp = overlayInput(0, -2, 200, 36, { placeholder: 'ABCDE', max: 5 });
      inp.style.textTransform = 'uppercase'; inp.style.letterSpacing = '4px'; inp.style.fontSize = (parseFloat(inp.style.fontSize) * 1.3) + 'px';
      inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') close(inp.value.trim().toUpperCase()); });
    });
    Sound.play('popup');
  });
}
function spinner(text) {
  const o = overlayRoot(260);
  const b = build(mkSprite('bg', 'Loading_frame_box', { w: 300, h: 70, ty: 1, d: 1 }), o);
  build(mkLabel('t', text, { fs: 17, d: 2, c: [1, 1, 1, 1] }), b);
  return () => Stage.remove(o);
}

// ---------------------------------------------------------------- entry
ON.OnClickStartButton = async () => {
  Sound.play('UI_Select');
  const v = await choiceMenu('출근 하기', [
    { label: '방 만들기', desc: '방 코드를 친구에게 알려 주세요', value: 'host', sp: 'Popup_btn_OK' },
    { label: '방 참가', desc: '친구에게 받은 방 코드 입력', value: 'join', sp: 'Popup_btn_buy' },
    { label: '컴퓨터와 연습', desc: '혼자서 연습 게임', value: 'solo', sp: 'Popup_btn_cancel' },
  ], '친구끼리만 함께할 수 있어요 (랜덤 매칭 없음)');
  if ((v === 'host' || v === 'join') && !(await ensureNickname())) return;
  if (v === 'host') createRoom(false);
  else if (v === 'join') { const code = await codePopup(); if (code) joinRoom(code); }
  else if (v === 'solo') createRoom(true);
};
async function createRoom(solo) {
  const done = spinner(solo ? '연습 방을 만드는 중…' : '방을 만드는 중…');
  try {
    await Room.host({ solo });
    if (solo) { Room.addBot(); }
    done(); bindRoom(); go(showLobby);
  } catch (e) {
    done(); Room.reset();
    popup({ title: '방 만들기 실패', text: '방을 만들지 못했어요.', sub: String(e && e.message || e).slice(0, 40) });
  }
}
async function joinRoom(code) {
  const done = spinner('방 ' + code + '에 들어가는 중…');
  try {
    bindRoom();
    await Room.join(code);
    const t0 = Date.now();
    while (!Room.lobby && Date.now() - t0 < 6000 && Room.role) await new Promise(r => setTimeout(r, 100));
    done();
    if (!Room.role) return;
    if (!Room.lobby) throw new Error('응답이 없어요');
    go(showLobby);
  } catch (e) {
    done(); Room.reset();
    popup({ title: '방 참가 실패', text: '방 ' + code + '을(를) 찾지 못했어요.', sub: '코드를 확인하거나 방장이 방을 열었는지 확인하세요' });
  }
}
function bindRoom() {
  Room.onLobby = lobby => { if (G.screen === 'lobby') renderLobby(); else if (G.screen === 'game' && !lobby.started && GameUI.over) { /* stay on result */ } };
  Room.onGame = msg => {
    if (msg.first && Room.role === 'client') payItems(true);
    if (msg.first) { GameUI.pending = [msg]; G.busy = false; go(showGame); }
    else if (G.screen !== 'game') { (GameUI.pending = GameUI.pending || []).push(msg); }
    else GameUI.enqueue(msg);
  };
  Room.onClosed = why => { go(showMain).then(() => popup({ title: '알림', text: why || '방이 닫혔어요.' })); };
  Room.onEmo = () => { };
  Room.animDelay = () => GameUI.queueTime();
}
function checkInviteLink() {
  const m = location.search.match(/[?&]room=([A-Za-z0-9]{5})/);
  if (m && !G.inviteUsed) { G.inviteUsed = true; ensureNickname().then(ok => { if (ok) joinRoom(m[1].toUpperCase()); }); }
}

// ---------------------------------------------------------------- lobby (대기실)
const SLOT_COLORS = ['Red', 'Blue', 'Yellow', 'Green'];
async function showLobby() {
  const r = instantiate('ready', 'Anchor');
  G.root = r; G.screen = 'lobby'; Stage.add(r);
  commonHide(r);
  hide(r, 'InvitePopup 8', 'HelpPopup 20', 'AletToast 6', 'InviteToastPopup 25', 'Tutorial1', 'Tutorial2', 'Tutorial3', 'Speech Bubble');
  r.findAll(n => n.name === 'Speech Bubble' || n.name === 'Toast 3-4').forEach(n => n.setActive(false));
  Sound.playBgm('waiting_room_bgm');
  refreshStatBar();
  hide(r, 'Button_Random');
  const st = r.find('Button_Start');
  st.x = 130; ['Vitamin_Card', 'Clock', 'Vitamin', 'Number', 'Glow'].forEach(n => hide(st, n));
  const tc = st.find('Ticket Count'); if (tc) tc.setActive(false);
  onTap(st, () => lobbyStart());
  onTap(r.find('Close'), () => { Sound.play('UI_Close'); Room.leave(); go(showMain); });
  // ready items
  S.readyItems = S.readyItems || {};
  READY_ITEMS.forEach((it, i) => {
    const g = r.find('Item' + (i + 1)); if (!g) return;
    const cb = g.children.find(c => c.name.startsWith('Checkbox'));
    const btn = g.children.find(c => c.name.startsWith('Item_'));
    const tog = () => { Sound.play('UI_Check'); S.readyItems[it.key] = !S.readyItems[it.key]; save(); renderLobby(); sendReadyState(); };
    onTap(cb, tog); onTap(btn, () => { tog(); toast(`${it.name}: ${it.desc}`); });
  });
  // room code + options
  const info = build(mkNode('roomInfo', { panel: 20, p: [0, 0] }), r);
  const codeBar = build(mkSprite('codebar', 'Ready_frame_titlebar_right', { w: 210, h: 40, ty: 1, d: 1, p: [-268, 214] }), info);
  const code = build(mkLabel('code', '', { fs: 18, d: 2, p: [-290, 214], c: [1, 1, 1, 1] }), info);
  code.widget.outline = 'rgba(80,40,0,0.8)'; code.widget.outlineW = 3;
  const copy = mkButton(info, 'copy', '복사', 'Popup_btn_buy', -196, 214, 58, 30, () => {
    const link = location.href.split('#')[0].replace(/[?&]room=\w+/, '') + (location.search ? '&' : '?') + 'room=' + Room.code;
    const text = `인생역전 윷놀이 방 코드: ${Room.code}\n${link}`;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('방 코드와 초대 링크를 복사했어요')).catch(() => toast('방 코드: ' + Room.code));
  }, 15);
  if (Room.lobby && Room.lobby.solo) { copy.setActive(false); codeBar.setActive(false); }
  r.findAll(n => n.widget && n.widget.kind === 'L' && /친구끼리/.test(n.widget.tx || '')).forEach(n => { n.setActive(false); const q = n.parent && n.parent.children.find(c => c !== n && c.widget && c.widget.kind === 'L' && /10\/10/.test(c.widget.tx || '')); if (q) q.setActive(false); });
  r.findAll(n => n.widget && n.widget.kind === 'L' && /^\d+\/\d+$/.test(n.widget.tx || '')).forEach(n => n.setActive(false));
  r.findAll(n => n.widget && n.widget.kind === 'S' && n.widget.sp === 'Common_btn_help_tip' && n.parent && n.parent.name !== 'Item').forEach(n => n.setActive(false));
  const pcs = mkButton(info, 'pieces', '', 'Popup_btn_cancel', 320, 172, 112, 30, () => {
    if (Room.role !== 'host') { toast('말 개수는 방장이 정해요'); return; }
    Room.lobby.pieces = Room.lobby.pieces === 2 ? 3 : 2; Room.pushLobby();
  }, 15);
  const MAPK = { random: '판: 랜덤', office: '판: 사무실', city: '판: 도시' };
  mkButton(info, 'mapKind', '', 'Popup_btn_cancel', 200, 172, 112, 30, () => {
    if (Room.role !== 'host') { toast('게임 판은 방장이 정해요'); return; }
    const order = ['random', 'office', 'city'];
    Room.lobby.mapKind = order[(order.indexOf(Room.lobby.mapKind || 'random') + 1) % 3];
    S.mapKind = Room.lobby.mapKind; save(); Room.pushLobby();
  }, 15);
  GameUI.MAPK = MAPK;
  renderLobby();
  sendReadyState();
}
function sendReadyState() {
  if (Room.role === 'client') Room.setReady(!!G.myReady, itemsToUse());
  else if (Room.role === 'host') Room.myItems = itemsToUse();
}
function itemsToUse() { const o = {}; READY_ITEMS.forEach(it => { if (S.readyItems && S.readyItems[it.key]) o[it.key] = true; }); return o; }
function renderLobby() {
  const r = G.root; if (!r || G.screen !== 'lobby' || !Room.lobby) return;
  const L = Room.lobby, me = Room.role === 'host' ? 'host' : Room.me;
  const ri = r.find('roomInfo');
  ri.find('code').setText(L.solo ? '연습 게임' : '방 코드  ' + L.code);
  ri.find('pieces').find('lab').setText('말 ' + L.pieces + '개');
  const mk = ri.find('mapKind'); if (mk) mk.find('lab').setText((GameUI.MAPK || {})[L.mapKind || 'random'] || '판: 랜덤');
  // equipment info
  const c = cardById(S.equipped) || S.cards[0];
  const info = r.find('Info');
  setCard(info.find('Card'), c, { noFx: true });
  const yi = S.yut || 0;
  info.find('Yut').setSprite(yutSprite(yi));
  info.find('YutName 0').setText(BOARD.yutTable[yi].name);
  const st = cardStats(c), ys = yutStatsOf({ yut: yi, yutLv: (S.yuts || {})[yi] || 1 });
  const yMap = [0, 1, 2, 3, 4, 6];
  for (let i = 1; i <= 6; i++) {
    const base = info.find(`A${i}_Base`), add = info.find(`A${i}_Add`), last = info.find(`A${i}_Last`);
    const v = st[i - 1], yv = ys[yMap[i - 1]] || 0;
    if (base) base.widget.fa = Math.min(1, v / STAT_MAX);
    if (last) { last.widget.fa = Math.min(1, (v + yv) / STAT_MAX); if (base) { last.widget.pv = base.widget.pv; last.x = base.x; last.y = base.y; } }
    if (add) { add.widget.ty = 3; add.widget.fa = Math.max(0, Math.min(1, (v - 100) / 100)); if (base) add.x = base.x; sangmuLayer(add, (v - 200) / 100); }
    const nb = info.find(`A${i}_Num_Base`); if (nb) { nb.setText(v); if (!nb._fit) { nb._fit = 1; nb.x = -172; Object.assign(nb.widget, { w: 22, ov: 0 }); } }
    const na = info.find(`A${i}_Num_Add`); if (na) na.setText('+' + yv);
  }
  hide(info, 'Change_Card', 'Change_Yut');
  // items
  READY_ITEMS.forEach((it, i) => {
    const g = r.find('Item' + (i + 1)); if (!g) return;
    const cb = g.children.find(c => c.name.startsWith('Checkbox'));
    cb.find('Checkmark').setActive(!!S.readyItems[it.key]);
  });
  // player slots
  const users = r.find('Users'), status = r.find('Content2 4').find('Player'), photos = r.find('Profile_Image');
  SLOT_COLORS.forEach((col, i) => {
    const slot = users.find(col), s = L.slots[i];
    const stn = status.children.find(x => x.name.endsWith(col));
    const ph = photos.find(col);
    slot.children.filter(c => c.name === 'Lock' || c.name === 'Sprite').forEach(c => c.setActive(false));
    slot.find('NoPlayer').setActive(!s);
    slot.find('NoPlayer').setText(i === 1 ? '친구가 들어오기를 기다리는 중' : '');
    slot.find('Nickname').setActive(!!s);
    slot.find('Symbol').setActive(!!(s && s.host));
    slot.find('Selection').setActive(!!(s && s.pid === me));
    const inv = slot.find('Invite');
    inv.setActive(!s && Room.role === 'host');
    if (!s && Room.role === 'host') onTap(inv, () => {
      Sound.play('UI_Select');
      if (L.solo) { Room.addBot(); return; }
      choiceMenu('빈 자리', [{ label: '초대 코드 복사', value: 'copy', sp: 'Popup_btn_OK' }, { label: '컴퓨터 추가', value: 'bot', sp: 'Popup_btn_cancel' }]).then(v => {
        if (v === 'bot') Room.addBot(); else if (v === 'copy') r.find('copy').handlers[0]();
      });
    });
    if (s) {
      setNeon(slot.find('Nickname'), s.gm).setText(s.name + (s.bot ? '' : '') + `  Lv.${s.level || 1}`);
      slot.find('Nickname').widget.pv = 3; slot.find('Nickname').x = 150;
    }
    // portrait instead of kakao photo
    if (ph) {
      const tex = ph.find('Texture'); if (tex) tex.setActive(false);
      let por = ph.find('por');
      if (!por) por = build(mkNode('por', { p: tex ? [tex.x, tex.y] : [124, 0], k: [mkSprite('img', 'Cha_Portrait_Tornado', { w: 50, h: 52, d: 4 })] }), ph);
      por.setActive(!!s);
      if (s) { const ch = CHARS.find(x => x.k === s.ch) || CHARS[0]; por.find('img').setSprite(ch.por); por.find('img').widget.w = 50; por.find('img').widget.h = 52; }
      // kick bots (host)
      if (s && Room.role === 'host' && !s.host) { por.box = [0, 0, 50, 52]; onTap(por, () => { Sound.play('UI_Close'); Room.kick(s.pid); }); }
    }
    if (stn) {
      const stat = stn.find('Status');
      const anim = stn.children.filter(x => x.name.startsWith('StatusAni'));
      stn.setActive(!!s);
      if (s) {
        const ready = s.ready || s.host;
        stat.setSprite(s.host ? `Ready_txt_standby_${col.toLowerCase()}` : ready ? `Ready_txt_ready_${col.toLowerCase()}` : 'Ready_noti_player_waiting');
        fitSprite(stat);
        if (s.host || ready) { stat.x = 300; stat.sx = stat.sy = 1; }
        else { stat.sx = stat.sy = 0.62; stat.x = 296; }
        anim.forEach((a, j) => { a.setActive(false); });
      }
    }
  });
  // start / ready button
  const btn = r.find('Button_Start'), bg = btn.find('Background');
  if (Room.role === 'host') bg.setSprite(Room.canStart() ? 'Ready_btn_game_start' : 'Ready_btn_game_start_disable');
  else bg.setSprite(G.myReady ? 'Ready_btn_ready_revocation' : 'Ready_btn_game_ready');
  fitSprite(bg);
}
function lobbyStart() {
  if (Room.role === 'client') { G.myReady = !G.myReady; Sound.play(G.myReady ? 'UI_Check' : 'UI_Close'); sendReadyState(); renderLobby(); return; }
  if (Room.lobby.slots.length < 2) { toast('친구가 들어오거나 컴퓨터를 추가해야 시작할 수 있어요'); return; }
  if (!Room.canStart()) { toast('모든 친구가 준비를 눌러야 시작할 수 있어요'); return; }
  if (!payItems()) return;
  Sound.play('game_start');
  Room.startGame();
}
function payItems(silent) {
  // deduct the checked ready items (host and clients each pay their own when the game starts)
  const want = itemsToUse(); let ok = true;
  for (const it of READY_ITEMS) {
    if (!want[it.key]) continue;
    const have = it.cur === 'coin' ? S.coin : S.fp;
    if (have < it.price) { S.readyItems[it.key] = false; ok = false; toast((it.cur === 'coin' ? '골드' : '우정포인트') + ' 부족으로 체크가 해제 되었습니다'); continue; }
  }
  if (!ok) { save(); renderLobby(); sendReadyState(); return false; }
  for (const it of READY_ITEMS) if (want[it.key]) { if (it.cur === 'coin') S.coin -= it.price; else S.fp -= it.price; }
  save(); sendReadyState();
  return true;
}

// ---------------------------------------------------------------- in-game
const GameUI = {
  root: null, st: null, me: -1, queue: [], busy: false, over: false, override: {}, selThrow: 0, gauge: null, banners: [],
  queueTime() { return this.busy ? 1.5 : 0.3; },
  enqueue(msg) { this.queue.push(msg); this.pump(); },
  async pump() {
    if (this.busy) return;
    this.busy = true; Room.busyAnim = true;
    try {
      while (this.queue.length) {
        const msg = this.queue.shift();
        if (!this.st) this.st = JSON.parse(JSON.stringify(msg.state));
        for (const e of msg.ev) { try { await this.play(e, msg.state); } catch (err) { console.warn(err); } }
        this.st = JSON.parse(JSON.stringify(msg.state));
        this.override = {};
        this.refresh();
      }
    } finally { this.busy = false; Room.busyAnim = false; }
    if (this.st && this.st.phase !== 'over' && Room.role === 'host') Room.armTimer();
  },
};
async function showGame() {
  const r = instantiate('game', 'UI Root (2D)/Camera/Anchor');
  G.root = r; G.screen = 'game'; Stage.add(r);
  const keep = ['BlackBox', 'RollPanel', 'MissionPanel', 'ResultPanel', 'ChooseFirstPanel', 'CoffeeRoulettePanel', 'ObjectInfoPanel', 'PlayerDetailInfoPanel', 'QuestionPanel', 'QuestionThumbPanel'];
  const L = Room.lobby;
  const infoName = (L && L.pieces === 3) ? 'InfoPanel_3p' : 'InfoPanel_2p';
  keep.push(infoName);
  r.children.forEach(c => c.setActive(keep.includes(c.name)));
  ['ResultPanel', 'ChooseFirstPanel', 'CoffeeRoulettePanel', 'ObjectInfoPanel', 'PlayerDetailInfoPanel', 'QuestionPanel', 'QuestionThumbPanel'].forEach(n => hide(r, n));
  Sound.playBgm('ingame_bgm');
  Sound.play('board_setting01'); Stage.after(0.5, () => Sound.play('board_setting02')); Stage.after(0.8, () => Sound.play('character_select'));
  Object.assign(GameUI, { root: r, st: null, queue: GameUI.pending || [], busy: false, over: false, override: {}, selThrow: 0, gauge: null, kaltae: {}, info: r.find(infoName), sfx3p: infoName.endsWith('3p') });
  GameUI.pending = null;
  // board layer
  const board = build(mkNode('board', { panel: 0 }), null);
  board.parent = r; r.children.unshift(board);
  const bg = buildCustom('bgdraw', drawBoardBg, { d: 0 }, board);
  const layer = buildCustom('pieces', drawBoardPieces, { d: 5, box: [0, 0, 800, 480] }, board);
  layer.onClick(() => boardClick());
  Yut3D.reset();
  const y3 = buildCustom('yut3d', g => Yut3D.draw(g), { d: 8 }, board);
  y3.update = dt => Yut3D.update(dt);
  layer.update = dt => {
    GameUI.t = (GameUI.t || 0) + dt;
    const st = GameUI.st; if (!st || !GameUI.seats) return;
    const tp = GameUI.timePanel;
    if (tp) {
      const left = st.endsAt ? Math.max(0, st.endsAt - Date.now()) : GAME_TIME, mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
      tp.find('TimeLabel').setText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
      tp.find('TurnLabel').setText(String(st.turnNo || 1));
    }
    const seat = GameUI.seats.find(s => s.pi === st.turn); if (!seat) return;
    const pn = GameUI.info.find(seat.panel); const tr = pn && pn.find('TimeRemain');
    const fgn = tr && tr.find('Foreground');
    GameUI.seats.forEach(s => { const q = GameUI.info.find(s.panel); const f = q && q.find('TimeRemain') && q.find('TimeRemain').find('Foreground'); if (f && f.widget) f.widget.fa = 0; });
    if (fgn && fgn.widget && st.phase !== 'over' && st.deadline) { fgn.widget.ty = 3; fgn.widget.fa = Math.max(0, Math.min(1, (st.deadline - Date.now()) / (st.phase === 'throw' ? 15000 : 20000))); }
  };
  // exit
  const ex = build(mkNode('exit', { panel: 60, p: [0, 0] }), r);
  const xb = build(mkSprite('x', 'Popup_btn_close', { p: [-24, 214], d: 1, box: [0, 0, 44, 46], s: [0.75, 0.75] }), ex);
  xb.x = -112; xb.y = 222; xb.sx = xb.sy = 0.62;
  onTap(xb, async () => {
    Sound.play('UI_Select');
    const ok = await popupGame('나가기', '게임을 그만두고 나갈까요?', '나가면 컴퓨터가 대신 플레이해요');
    if (ok) { Room.leave(); go(showMain); }
  });
  // roll panel
  const rp = r.find('RollPanel');
  hide(rp, 'FeverMode');
  const tm = rp.find('Timer'); tm.x = -96; tm.y = 128; tm.find('ClockIcon').x = 72; tm.find('ClockIcon').y = 49;
  buildCustom('tfill', drawTimeFill, { d: 4 }, tm.find('Foreground'));
  // 장착한 윷 묶음 (원작의 던지기 버튼)
  const bun = build(mkNode('yutBundle', { p: [-30, 62] }), rp); rp.children.unshift(rp.children.pop());
  buildCustom('img', g => {
    const st = GameUI.st; if (!st) return;
    const b = Yut3D.bundle((st.players[GameUI.me] || {}).yut || 0); if (!b) return;
    const sh = GameUI.gauge ? Math.sin((GameUI.t || 0) * 40) * 1.5 : 0, S = b.size;
    g.save(); g.transform(1, 0, 0, -1, 0, 0); g.drawImage(b, -S / 2 + sh, -S / 2, S, S); g.restore();
  }, { d: -1 }, bun);
  const pg = rp.find('PowerGauge'); const fg = pg.find('Foreground');
  buildCustom('fill', drawGaugeFill, { d: 1 }, fg);
  const rb = rp.find('RollButton');
  rb.comps = rb.comps.filter(c => c.t !== 'BM' && c.t !== 'IB');
  rb.box = [-10, 30, 200, 160];
  rb.onPress = () => gaugeStart();
  rb.onRelease = () => gaugeRelease();
  rb.handlers = []; rb.clickable = true;
  const fi = rp.find('FaceIndicator'); fi.x = -250; fi.y = 92;
  ['Face1', 'Face2', 'Face3'].forEach((n, i) => { const f = fi.find(n); f.box = [0, 0, 38, 40]; onTap(f, () => { if (GameUI.st && i < GameUI.st.throws.length) { GameUI.selThrow = i; Sound.play('UI_Select'); GameUI.refresh(); } }); });
  rp.find('FaceGroup').setActive(false);
  // keyboard
  if (!G.keyBound) {
    G.keyBound = true;
    window.addEventListener('keydown', e => { if (G.screen === 'game' && e.code === 'Space' && !e.repeat) { e.preventDefault(); gaugeStart(); } });
    window.addEventListener('keyup', e => { if (G.screen === 'game' && e.code === 'Space') { e.preventDefault(); gaugeRelease(); } });
  }
  // mission (bottom centre, tap to peek) — like the original
  const mp = r.find('MissionPanel'); const mb = mp.find('MissionButton');
  // 원작처럼 평소에는 '특명' 한 줄만 화면 아래에 보이고, 누르면 올라와서 달성 보상까지 보여 준다
  mb.y = -266; mb.stopTweens(); hide(mb, 'Ef_MissionSuccess');
  mb.children.filter(c => c.name === 'Glow').forEach(c => c.setActive(false));
  const ml = mb.find('MissionLabel'); ml.setText('');
  Object.assign(ml.widget, { fs: 15, color: [1, 0.93, 0.66, 1], ef: 1, ec: [0, 0, 0, 0.9], w: 124, ov: 0 }); ml.x = 17;
  const rl = mb.find('RewardLabel'); if (rl) Object.assign(rl.widget, { fs: 14, color: [1, 1, 1, 1], ef: 1, ec: [0, 0, 0, 0.85] });
  mb.comps = []; mb.box = [0, 0, 150, 96];
  onTap(mb, () => { const up = mb.y < -220; Sound.play('UI_Select'); const y0 = mb.y; animate(0.2, k => mb.y = y0 + ((up ? -186 : -266) - y0) * k); });
  // turn / time (top centre)
  const tp = instantiate('game', 'UI Root (GameTime)/Camera/Anchor').find('TimePanel');
  tp.parent = r; r.children.push(tp); tp.panel.depth = 12; GameUI.timePanel = tp;
  // cancel selection button
  const cancel = build(mkNode('cancelSel', { panel: 64, p: [340, -150], off: 1 }), r);
  const cbn = build(mkSprite('b', 'Game_btn_cancel', { d: 1, box: [0, 0, 96, 46] }), cancel);
  onTap(cbn, () => { Sound.play('UI_Close'); GameUI.selPiece = null; });
  Stage.after(0.1, () => GameUI.pump());
}
function popupGame(title, text, sub) {
  return new Promise(resolve => {
    const o = overlayRoot(300);
    const box = frameBox(o, 400, 220, title);
    build(mkLabel('t', text, { fs: 17, d: 4, p: [0, 26], c: [0.4, 0.21, 0, 1] }), box);
    if (sub) build(mkLabel('s', sub, { fs: 14, d: 4, p: [0, 0], c: [0.62, 0.32, 0.08, 1] }), box);
    const close = v => { Stage.remove(o); resolve(v); };
    mkButton(box, 'c', '취소', 'Popup_btn_cancel', -74, -58, 134, 52, () => close(false));
    mkButton(box, 'ok', '확인', 'Popup_btn_OK', 74, -58, 134, 52, () => close(true));
  });
}
// ---------- seat mapping ----------
function seatPanels() {
  const st = GameUI.st; if (!st) return [];
  const sfx = GameUI.sfx3p ? '3p' : '2p';
  const meId = Room.role === 'host' ? 'host' : Room.me;
  const mi = Math.max(0, st.players.findIndex(p => p.id === meId));
  GameUI.me = st.players.findIndex(p => p.id === meId);
  const order = st.players.map((p, i) => (mi + i) % st.players.length);
  const names = [`PlayerInfoPanel_${sfx}`, `EnemyInfo1Panel_${sfx}`, `EnemyInfo2Panel_${sfx}`, `EnemyInfo3Panel_${sfx}`];
  if (st.players.length === 2) names[1] = `EnemyInfo2Panel_${sfx}`;
  return order.map((pi, k) => ({ pi, panel: names[k], seat: k }));
}
function waitPos(pi, k) {
  const seat = (GameUI.seats || []).find(s => s.pi === pi); const sp = seat ? seat.panel : '';
  if (sp.startsWith('Player')) return [372 - k * 38, -66];
  if (sp.startsWith('EnemyInfo1')) return [-374 + k * 36, 112];
  if (sp.startsWith('EnemyInfo2')) return [374 - k * 36, 112];
  return [-374 + k * 36, -118];
}
// ---------- refresh all UI from state ----------
GameUI.refresh = function () {
  const st = this.st, r = this.root; if (!st || !r) return;
  this.seats = seatPanels();
  try { refreshQThumbs(); } catch (e) { console.warn(e); }
  const info = this.info;
  info.children.forEach(c => c.setActive(false));
  const standing = st.players.map((p, i) => i).sort((a, b) => {
    const A = st.players[a], B = st.players[b];
    const da = A.pieces.filter(x => x.done).length, db = B.pieces.filter(x => x.done).length;
    return (db - da) || (prog(B) - prog(A)) || (B.score - A.score);
  });
  for (const { pi, panel } of this.seats) {
    const p = st.players[pi], pn = info.find(panel); if (!pn) continue;
    pn.setActive(true);
    const col = p.color;
    const ch = CHARS.find(c => c.k === p.ch) || CHARS[0];
    const set = (n, sp) => { const x = pn.find(n); if (x) x.setSprite(sp); return x; };
    const pb = pn.find('ProfileButton');
    if (pb) {           // 프로필(초상화)을 누르면 카드·능력치
      const pp = pn.find('PortraitPanel');
      pb.comps = []; pb.box = [pp ? pp.x : -28, pp ? pp.y : 36, 66, 80]; pb.clickable = true; pb.hitTop = pn;
      if (pb._pi !== pi) { pb._pi = pi; onTap(pb, () => showPlayerDetail(pi)); }
    }
    set('NameBackground', `Game_userframe_namebar_${col}`);
    set('PortraitBack', `Game_userframe_card_bg_${p.fever ? 'rage' : col}`);
    set('LevelBack', `Game_userframe_lv_${col}`);
    set('RankBackground', `Game_userframe_ranking_${col}`);
    const por = pn.find('Portrait'); if (por) { por.setSprite(ch.por); por.widget.w = 140; por.widget.h = 146; }
    const rk = pn.find('PortraitPanel') && pn.find('PortraitPanel').find('Rank'); if (rk) { rk.setSprite('Game_rank' + Math.min(7, p.cls)); fitSprite(rk); }
    const ll = pn.find('LevelLabel'); if (ll) ll.setText(p.lv);
    setNeon(pn.find('LabelName'), p.gm).setText(p.name + (p.gone ? ' (나감)' : ''));
    gmPanel(pn, p.gm);
    pn.find('LabelScore').setText(p.score + '점');
    const stand = standing.indexOf(pi) + 1;
    const rnk = pn.children.find(c => c.name === 'Rank'); if (rnk) rnk.setSprite('Game_userframe_' + stand);
    p.pieces.forEach((pc, k) => {
      const cs = pn.find('Complete' + (k + 1)); if (!cs) return;
      cs.setActive(true);
      const sz = GameUI.sfx3p ? '3p' : '2p';
      if (pc.done) { cs.setSprite(`Game_userframe_slot_get_off_work_${sz}`); cs.setAlpha(1); if (cs._ic) cs._ic.setActive(false); return; }
      // 남은 말: 사람 모양 대신 내 캐릭터 얼굴 (원작 칸 테두리 색은 그대로)
      cs.setSprite(`Game_userframe_slot_${col}_${sz}`); cs.setAlpha(0.001);
      if (!cs._ic) cs._ic = buildCustom('chIcon', g => drawSlotIcon(g, cs), { d: 2 }, cs);
      cs._ic.setActive(true); cs._ch = p.ch; cs._col = col;
    });
    hide(pn, 'Daebak', 'Medal', 'FeverPortraitBack', 'CursorFeverGlow');
    const sh = pn.find('Shield'); if (sh) sh.setActive(!!p.items.noNak);
    const cb = pn.find('Combine'); if (cb) cb.setActive(!!p.items.combine);
    const auto = pn.find('Auto'); if (auto) auto.setActive(!!p.bot);
    const cur = pn.find('Cursor'); if (cur) { cur.setActive(st.turn === pi && st.phase !== 'over'); if (cur.active && !cur._tw) { cur._tw = 1; cur.playTweens(true, false); } }
    const rage = pn.find('0_RagemodeOn'); if (rage) { const on = !!p.fever && st.phase !== 'over'; if (on && !rage.active) { rage.setActive(true); rage.playTweens(true); } if (!on) rage.setActive(false); }
    const fe = pn.find('FeverEye'); if (fe) fe.setActive(!!p.fever);
    const yi = pn.find('YutIndicator');
    if (yi) {
      yi.setActive(st.turn === pi && st.throws.length > 0);
      ['Yut1', 'Yut2', 'Yut3'].forEach((n, i) => { const y = yi.find(n); if (y) y.setSprite(i < st.throws.length && st.turn === pi ? `Game_result_${FACE_KEY[st.throws[i]]}_thumb` : 'Game_result_slot_thumb'); });
    }
  }
  // my roll panel
  const rp = r.find('RollPanel');
  const myTurn = st.turn === this.me && st.phase !== 'over';
  const fi = rp.find('FaceIndicator');
  ['Face1', 'Face2', 'Face3'].forEach((n, i) => {
    const f = fi.find(n);
    f.setSprite(myTurn && i < st.throws.length ? `Game_result_${FACE_KEY[st.throws[i]]}_thumb` : 'Game_result_slot_thumb');
  });
  if (this.selThrow >= st.throws.length) this.selThrow = 0;
  const eff = fi.find('Effect');
  if (eff) eff.setActive(false);
  const rb = rp.find('RollButton');
  const canThrow = myTurn && st.phase === 'throw' && st.canThrow;
  rb.setActive(canThrow || !!this.gauge); rp.find('PowerGauge').setActive(canThrow || !!this.gauge);
  rp.find('Timer').setActive(canThrow || !!this.gauge); rp.find('yutBundle').setActive(canThrow || !!this.gauge);
  // 내가 던지는 동안엔 오른쪽 아래 내 점수판 대신 윷 던지기 패널 (원작과 같음)
  const mySeat = (this.seats || []).find(s => s.pi === this.me), myPn = mySeat && this.info.find(mySeat.panel);
  if (myPn) myPn.setActive(!(myTurn && st.phase === 'throw'));
  fi.setActive(myTurn);
  rb.find('Background').setAlpha(canThrow ? 1 : 0.35);
  if (canThrow && !rb._tw) { rb._tw = 1; rb.playTweens(true, false); }
  if (!canThrow) { rb._tw = 0; rb.stopTweens(false); rb.sx = rb.sy = 1; }
  // mission
  const mb = r.find('MissionButton'); if (mb) mb.find('MissionLabel').setText(MISSIONS[st.mission] || '');
};
function prog(p) { return p.pieces.reduce((a, pc) => a + (pc.done ? 30 : pc.pos < 0 ? 0 : 21 - (DIST[pc.pos] || 0)), 0); }

// ---------- throwing gauge ----------
function canIThrow() { const st = GameUI.st; return st && !GameUI.busy && st.turn === GameUI.me && st.phase === 'throw' && st.canThrow && !GameUI.over; }
const GAUGE_PERIOD = 2.8;
function gaugeStart() {
  if (!canIThrow() || GameUI.gauge) return;
  GameUI.gauge = { t0: performance.now(), level: 0 };
  Sound.play('UI_Select');
}
function gaugeRelease() {
  const g = GameUI.gauge; if (!g) return;
  GameUI.gauge = null;
  if (!canIThrow()) return;
  const power = 1 + Math.min(4, Math.floor(g.level * 5));
  GameUI.lastPower = g.level;
  const b = GameUI.root && GameUI.root.find('yutBundle'); if (b) { b.setActive(false); const rb = GameUI.root.find('RollButton'); if (rb) rb.setActive(false); }        // 윷 묶음이 손을 떠남
  Room.act({ a: 'throw', power });
}
const GA = { cx: 134, cy: 142, r: 132, a0: 14.5, span: 85.25 };      // 게이지 막대의 모양 (그림에서 잰 값)
// 남은 턴 시간 (노란 바깥 고리, 시계 아이콘 쪽에서부터 줄어듦)
function drawTimeFill(g) {
  const st = GameUI.st; if (!st || !st.deadline) return;
  const total = 15000, frac = Math.max(0, Math.min(1, (st.deadline - Date.now()) / total));
  if (frac <= 0) return;
  const f = findSprite('Game_Atlas', 'Game_yut_time_gauge'); if (!f) return;
  const [atlas, sp] = f;
  g.save(); g.transform(1, 0, 0, -1, -73, 79);
  g.beginPath(); g.moveTo(136, 146); g.arc(136, 146, 260, Math.PI + 20 * Math.PI / 180, Math.PI + (20 + 74 * frac) * Math.PI / 180, false); g.closePath(); g.clip();
  g.drawImage(IMG[atlas], sp[0], sp[1], sp[2], sp[3], 0, 0, 146, 158);
  g.restore();
}
function drawGaugeFill(g) {
  const gg = GameUI.gauge;
  let lv = 0;
  // 실제 시간 기준(화면 주사율과 무관): 끝까지 차는 데 1.4초, 한 번 왕복 2.8초
  if (gg) { const t = (performance.now() - gg.t0) / 1000; const ph = (t % GAUGE_PERIOD) / GAUGE_PERIOD; gg.level = ph < 0.5 ? ph * 2 : 2 - ph * 2; lv = gg.level; }
  else if (GameUI.lastPower !== undefined && GameUI.busy) lv = GameUI.lastPower;
  const f = findSprite('Game_Atlas', 'Game_yut_gauge'); if (!f) return;
  const [atlas, sp] = f;
  g.save();
  g.transform(1, 0, 0, -1, -79, 79);
  if (lv > 0.01) {
    g.save();
    g.beginPath(); g.moveTo(GA.cx, GA.cy); g.arc(GA.cx, GA.cy, 260, Math.PI, Math.PI + (GA.a0 + GA.span * lv) * Math.PI / 180, false); g.closePath(); g.clip();
    g.drawImage(IMG[atlas], sp[0], sp[1], sp[2], sp[3], 0, 0, 158, 158);
    g.restore();
  }
  // 게이지 5칸 = 도·개·걸·윷·모 (윷 컨트롤): 손을 뗀 칸의 눈을 노린다 (원작처럼 글씨 없이)
  g.restore();
}

// ---------- board drawing ----------
const OBJ_IMG = { 3: 'Game_Popup_img_warp', 4: 'Game_Popup_img_qcard', 5: 'Game_Popup_img_special_box', 6: 'Game_Popup_img_americano', 7: 'Game_Popup_img_toilet', 8: 'Game_Popup_img_reverse' };
// 판 위에 놓이는 작은 사물 그림 (원작 아이콘)
const OBJ_ICON = { 3: 'Game_img_emoticon_obj_warp', 5: 'Game_img_emoticon_obj_spbox', 6: 'Game_img_emoticon_obj_americano', 7: 'Game_img_emoticon_obj_toliet', 8: 'Game_img_emoticon_obj_reverse' };
const CORNER_COL = { 5: ['#7cf05a', '#35b82a', '#1f8a1c'], 15: ['#6cbcff', '#2f84dc', '#1d5cab'], 24: ['#ffdf4a', '#eaa90c', '#b97c06'], 8: ['#d6a6ff', '#a56ee0', '#7745b5'] };
const CROSS_H = [6, 7, 18, 19], CROSS_V = [9, 10, 16, 17];
function spr(g, name, cx, cy, w, h, alpha = 1, atlas) {
  const f = findSprite(atlas, name); if (!f) return;
  const [a, sp] = f;
  g.save(); g.globalAlpha *= alpha;
  g.drawImage(IMG[a], sp[0], sp[1], sp[2], sp[3], cx - w / 2, cy - h / 2, w, h);
  g.restore();
}
function sprSize(name, k = 1) { const f = findSprite(null, name); return f ? [f[1][2] * k, f[1][3] * k] : [0, 0]; }
function rrect(g, pts, r) { // rounded polygon
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
    const a = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]), b = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    const s = [p1[0] + Math.cos(a) * r, p1[1] + Math.sin(a) * r], e = [p1[0] + Math.cos(b) * r, p1[1] + Math.sin(b) * r];
    i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]);
    g.quadraticCurveTo(p1[0], p1[1], e[0], e[1]);
  }
  g.closePath();
}
const rhombus = (x, y, hw, hh) => [[x - hw, y], [x, y - hh], [x + hw, y], [x, y + hh]];
const rectPts = (x, y, w, h) => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
// a board tile with thickness: pts = top face polygon
let boardCache = null;
const isCity = st => !!st && st.mapId >= 5;
function drawManhole(g, x, y, on, t = 0) {
  const pts = rhombus(x, y, 31, 19);
  g.fillStyle = on ? '#202a30' : '#1b2328'; rrect(g, pts, 6); g.fill();
  g.save(); rrect(g, pts, 6); g.clip();
  g.strokeStyle = on ? `rgba(255,214,60,${0.75 + 0.25 * Math.sin(t * 5)})` : 'rgba(90,110,120,0.7)'; g.lineWidth = 2.2;
  for (let i = -4; i <= 4; i++) {
    g.beginPath(); g.moveTo(x + i * 7 - 20, y - 12 + i * 0); g.lineTo(x + i * 7 + 20, y + 12); g.stroke();
  }
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x - 30, y + i * 6); g.lineTo(x + 30, y + i * 6); g.stroke(); }
  g.restore();
  if (on) { g.shadowColor = 'rgba(255,220,80,0.9)'; g.shadowBlur = 12; g.strokeStyle = 'rgba(255,230,120,0.8)'; g.lineWidth = 1.5; rrect(g, pts, 6); g.stroke(); g.shadowBlur = 0; }
}
function boardStatic() {
  const st = GameUI.st, k = Math.min(2.5, Math.max(1, Stage.scale || 1));
  const key = (st ? st.mapId : -1) + ':' + k;
  if (boardCache && boardCache.key === key) return boardCache.cv;
  const cv = document.createElement('canvas'); cv.width = Math.round(800 * k); cv.height = Math.round(480 * k);
  const g = cv.getContext('2d'); g.scale(k, k); g.translate(400, 240);
  (isCity(st) ? paintCity : paintOffice)(g, st, k);
  boardCache = { key, cv };
  return cv;
}
function drawBoardBg(g) {
  g.save(); g.transform(1, 0, 0, -1, 0, 0);
  g.drawImage(boardStatic(), -400, -240, 800, 480);
  const st = GameUI.st, t = GameUI.t || 0;
  try { drawBoardFx(g, st); } catch (e) { }
  if (st) {
    const P = id => { const [x, y] = nodePos(id); return [x, -y]; };
    for (const o of [...st.objects].sort((a, b) => NODE[b.node].y - NODE[a.node].y)) {
      const [x, y] = P(o.node), ic = OBJ_ICON[o.type];
      if (o.type === OBJ.MANHOLE) { drawManhole(g, x, y, o.on, t); continue; }
      if (o.type === OBJ.TAXI) {
        const [w, h] = sprSize('Game_img_emoticon_obj_taxi', 1.0), bob = GameUI.taxiAt === o.node ? Math.abs(Math.sin(t * 14)) * 4 : 0;
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 24, 10, 0, 0, Math.PI * 2); g.fill();
        spr(g, 'Game_img_emoticon_obj_taxi', x, y - 14 - bob, w, h); continue;
      }
      if (o.type === OBJ.HYDRANT) {
        const sp = GameUI.spray && GameUI.spray.node === o.node ? GameUI.spray : null, [w, h] = sprSize('Game_img_emoticon_obj_fireplug', 1.0);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 18, 8, 0, 0, Math.PI * 2); g.fill();
        spr(g, 'Game_img_emoticon_obj_fireplug', x, y - 18, w, h);
        if (sp) {       // 물줄기
          const u = (t - sp.t0) / 1.4; if (u > 1) GameUI.spray = null;
          else for (let i = 0; i < 14; i++) { const an = -Math.PI / 2 + (i - 6.5) * 0.16, d = 20 + ((u * 3 + i * 0.37) % 1) * 46; g.fillStyle = `rgba(150,215,255,${0.75 * Math.sin(Math.PI * u)})`; g.beginPath(); g.arc(x + Math.cos(an) * d, y - 34 + Math.sin(an) * d * 0.8 + d * d * 0.012, 3.2, 0, Math.PI * 2); g.fill(); }
        }
        continue;
      }
      if (o.type === OBJ.QCARD) {
        const bob = Math.sin(t * 2.4 + o.node) * 2.5, f = findSprite('QuestionCard Atlas', 'Q_card_frame_back');
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x, y + 2, 15, 7, 0, 0, Math.PI * 2); g.fill();
        if (f) { g.save(); g.translate(x, y - 22 + bob); g.rotate(-0.18); g.drawImage(IMG[f[0]], f[1][0], f[1][1], f[1][2], f[1][3], -16, -21, 32, 43); g.restore(); }
        continue;
      }
      if (!ic) continue;
      if (o.type === OBJ.BOX) {
        if (!o.on) continue;
        const bob = Math.sin(t * 4) * 2.5, [w, h] = sprSize(ic, 0.72);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x, y + 3, 17 - bob * 0.6, 8 - bob * 0.3, 0, 0, Math.PI * 2); g.fill();
        spr(g, ic, x, y - 18 + bob, w, h);
      } else if (o.type === OBJ.WARP) {
        if (o.on) {
          const [w, h] = sprSize(ic, 0.86);
          for (let i = 0; i < 3; i++) { const u = (t * 0.8 + i / 3) % 1; g.strokeStyle = `rgba(120,255,160,${0.7 * (1 - u)})`; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y - 2 - u * 16, 20 - u * 5, 11 - u * 3, 0, 0, Math.PI * 2); g.stroke(); }
          spr(g, ic, x, y - 8, w, h, 0.95);
        } else { g.fillStyle = '#2b4753'; g.beginPath(); g.ellipse(x, y - 1, 21, 12, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3d6170'; g.beginPath(); g.ellipse(x, y + 2, 17, 8, 0, 0, Math.PI * 2); g.fill(); }
      } else if (o.type === OBJ.REVERSE) { const [w, h] = sprSize(ic, 0.9); spr(g, ic, x, y - 4, w, h); }
      else { const [w, h] = sprSize(ic, 0.74); spr(g, ic, x, y - 16, w, h); }
    }
  }
  g.restore();
}
function tokenPositions() {
  const st = GameUI.st; if (!st) return [];
  const out = [];
  st.players.forEach((p, pi) => {
    const groups = {};
    p.pieces.forEach((pc, k) => {
      if (pc.done) return;
      const ov = GameUI.override[pi + ':' + k];
      if (ov) { out.push({ pi, ks: [k], x: ov.x, y: ov.y, stack: ov.stack || 1, waiting: false, a: ov.a ?? 1, s: ov.s ?? 1 }); return; }
      if (pc.pos === -1) { const wi = p.pieces.filter((x, j) => j < k && x.pos === -1 && !x.done).length; const [x, y] = waitPos(pi, wi); out.push({ pi, ks: [k], x, y, stack: 1, waiting: true }); return; }
      (groups[pc.pos] = groups[pc.pos] || []).push(k);
    });
    Object.entries(groups).forEach(([pos, ks]) => { const [x, y] = nodePos(+pos); out.push({ pi, ks, x, y: y + 2, stack: ks.length, waiting: false }); });
  });
  const byKey = {};
  out.forEach(t => { if (t.waiting) return; const key = Math.round(t.x) + ',' + Math.round(t.y); (byKey[key] = byKey[key] || []).push(t); });
  Object.values(byKey).forEach(arr => { if (arr.length > 1) arr.forEach((t, i) => { t.x += (i - (arr.length - 1) / 2) * 26; }); });
  out.sort((a, b) => b.y - a.y);
  return out;
}
function myMoveState() {
  const st = GameUI.st; if (!st || st.turn !== GameUI.me || st.phase !== 'move' || GameUI.busy || GameUI.over) return null;
  const g = Object.create(YutGame.prototype); g.s = st;
  return g;
}
function movableFor(ti) {
  const g = myMoveState(); if (!g) return [];
  const res = [];
  g.s.players[GameUI.me].pieces.forEach((pc, k) => { if (g.legal(GameUI.me, ti, k)) res.push(k); });
  return res;
}
function movablePieces() {
  const g = myMoveState(); if (!g) return [];
  const set = new Set();
  for (let t = 0; t < g.s.throws.length; t++) movableFor(t).forEach(k => set.add(k));
  return [...set];
}
function previewDest(k, ti) {
  const st = GameUI.st; const g = Object.create(YutGame.prototype); g.s = st;
  const pc = st.players[GameUI.me].pieces[k]; let steps = FACE_STEPS[st.throws[ti]];
  const o = pc.pos >= 0 ? g.objAt(pc.pos) : null; if (o && o.type === OBJ.REVERSE) steps = -steps;
  return g.walk(pc.pos, pc.prev, steps);
}
function destMarkers() {
  // markers for the selected piece: one per distinct throw face
  const mov = movablePieces(); if (!mov.length) return [];
  let k = GameUI.selPiece;
  if (!mov.includes(k)) k = mov.length === 1 ? mov[0] : null;
  GameUI.selPieceEff = k;
  if (k === null || k === undefined) return [];
  const st = GameUI.st, seen = new Set(), out = [];
  st.throws.forEach((f, ti) => {
    if (seen.has(f) || !movableFor(ti).includes(k)) return; seen.add(f);
    const r = previewDest(k, ti);
    const [x, y] = r.done ? nodePos(0) : nodePos(r.pos);
    let tag = null;
    if (!r.done) {
      if (st.players.some((q, qi) => qi !== GameUI.me && q.pieces.some(pc => !pc.done && pc.pos === r.pos))) tag = 'catch';
      else if (st.players[GameUI.me].pieces.some((pc, j) => j !== k && !pc.done && pc.pos === r.pos && pc.pos !== st.players[GameUI.me].pieces[k].pos)) tag = 'combine';
    }
    out.push({ ti, face: f, x, y, done: r.done, k, tag });
  });
  // spread markers that share a tile
  out.forEach((m, i) => { const same = out.filter(q => q.x === m.x && q.y === m.y); if (same.length > 1) m.x += (same.indexOf(m) - (same.length - 1) / 2) * 44; });
  return out;
}
// ---- 말: 캐릭터 그림을 오려 세운 스탠드 (원작의 3D 캐릭터는 APK에 없어서 초상화로 대신) ----
const TOKEN_COL = { red: ['#ff5a45', '#b3261a'], blue: ['#4a9bff', '#1b56b8'], green: ['#4fd05a', '#1d8a2a'], yellow: ['#ffcf30', '#c28a00'] };
const STANDEE = {};
function standee(chKey, color) {
  const key = chKey + ':' + color; if (STANDEE[key]) return STANDEE[key];
  const ch = CHARS.find(c => c.k === chKey) || CHARS[0];
  const f = findSprite('CardPotrait Atlas', ch.por); if (!f) return null;
  const [a, sp] = f, w = sp[2], h = sp[3], m = 9;
  const mk = () => { const c = document.createElement('canvas'); c.width = w + m * 2; c.height = h + m * 2; return c; };
  const sil = col => { const c = mk(), x = c.getContext('2d'); x.drawImage(IMG[a], sp[0], sp[1], w, h, m, m, w, h); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };
  const out = mk(), g = out.getContext('2d');
  const ring = (c, r) => { for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; g.drawImage(c, Math.cos(an) * r, Math.sin(an) * r); } };
  ring(sil((TOKEN_COL[color] || TOKEN_COL.red)[1]), 8);
  ring(sil('#ffffff'), 5);
  g.drawImage(IMG[a], sp[0], sp[1], w, h, m, m, w, h);
  return STANDEE[key] = out;
}
function drawToken(g, t, p, hl, sel) {
  const s = (t.waiting ? 0.8 : 1) * (t.s || 1);
  const x = t.x, y = -t.y, col = TOKEN_COL[p.color] || TOKEN_COL.red;
  const H = 58 * s;
  g.save(); g.globalAlpha *= (t.a ?? 1);
  g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(x + 4, y + 5 * s, 19 * s, 8.5 * s, 0, 0, Math.PI * 2); g.fill();
  if (sel) { g.strokeStyle = '#fff36a'; g.lineWidth = 3.5; g.beginPath(); g.ellipse(x, y + 2 * s, 24 * s, 12 * s, 0, 0, Math.PI * 2); g.stroke(); }
  const st = standee(p.ch, p.color);
  const n = Math.min(3, t.stack || 1);
  if (st) {
    const w = H * st.width / st.height, sc = Stage.scale || 1;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 7 * sc; g.shadowOffsetX = 2 * sc; g.shadowOffsetY = 3 * sc;
    for (let i = n - 1; i >= 0; i--) g.drawImage(st, x - w / 2 - i * 9 * s, y - H + 5 * s - i * 4 * s, w, H);       // 업은 말은 뒤에 겹쳐 보임
    g.restore();
  }
  // round base in the player's colour
  g.fillStyle = col[1]; g.beginPath(); g.ellipse(x, y + 5 * s, 17 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
  const gr = g.createLinearGradient(x - 17 * s, 0, x + 17 * s, 0); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y + 2 * s, 17 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5; g.stroke();
  if (t.stack > 1) {
    const bx = x + 17 * s, by = y - H + 12 * s;
    g.fillStyle = '#ffe14d'; g.strokeStyle = '#7a3a00'; g.lineWidth = 2;
    g.beginPath(); g.arc(bx, by, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#7a3a00'; g.font = '13px KoPub'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x' + t.stack, bx, by + 1);
  }
  if (hl) {      // 움직일 수 있는 말: 원작의 보석 화살표
    const bob = Math.sin((GameUI.t || 0) * 6) * 4, nm = 'Game_character_arrow_' + (p.color || 'red'), [w, h] = sprSize(nm, 0.82);
    spr(g, nm, x, y - H - 10 + bob, w, h);
  }
  g.restore();
}
function drawMarker(g, m) {      // 원작의 초록 고리 + 도/개/걸/윷/모 표지
  const x = m.x, y = -m.y, pulse = 0.5 + 0.5 * Math.sin((GameUI.t || 0) * 6);
  g.save(); g.translate(x, y); g.scale(1, 0.58);
  spr(g, 'Game_direction_greenring_bottom', 0, 0, 78, 78); spr(g, 'Game_direction_greenring_top', 0, 0, 78, 78, pulse);
  g.restore();
  const nm = m.done ? 'Game_btn_leave_work' : 'Game_direction_arrow_' + FACE_KEY[m.face];
  const [w, h] = sprSize(nm, m.done ? 0.74 : 0.92);
  spr(g, nm, x, y - (m.done ? 30 : 32) - pulse * 4, w, h);
  if (m.tag && !m.done) { const tn = 'Game_direction_arrow_' + m.tag, [w2, h2] = sprSize(tn, 0.66); spr(g, tn, x + 27, y - 60 - pulse * 4, w2, h2); }
}
function drawBoardPieces(g) {
  const st = GameUI.st; if (!st) return;
  g.save(); g.transform(1, 0, 0, -1, 0, 0);
  const mov = movablePieces();
  const markers = destMarkers();
  GameUI.markers = markers;
  const toks = tokenPositions();
  GameUI.tokens = toks;
  for (const t of toks) {
    const mine = t.pi === GameUI.me;
    const hl = mine && t.ks.some(k => mov.includes(k)) && !(markers.length && t.ks.includes(GameUI.selPieceEff));
    const sel = mine && markers.length && t.ks.includes(GameUI.selPieceEff);
    drawToken(g, t, st.players[t.pi], hl, sel);
  }
  for (const m of markers) drawMarker(g, m);
  g.restore();
  // 취소 버튼: 고른 말 머리 위 (원작과 같은 자리)
  const cb = GameUI.root && GameUI.root.find('cancelSel');
  if (cb) {
    const on = markers.length > 0 && mov.length > 1;
    cb.setActive(on);
    if (on) { const t = toks.find(t => t.pi === GameUI.me && t.ks.includes(GameUI.selPieceEff)); if (t) { cb.x = t.x; cb.y = t.y + 84; } }
  }
}
function boardClick() {
  const st = GameUI.st; if (!st || !Stage.lastPt) return;
  const [x, y] = Stage.lastPt;
  // 1) destination markers
  for (const m of GameUI.markers || []) {
    if (Math.hypot(m.x - x, m.y + 34 - y) < 28 || Math.hypot(m.x - x, (m.y - y) * 1.6) < 34) {
      Sound.play('position_select'); Room.act({ a: 'move', ti: m.ti, k: m.k }); GameUI.selPiece = null; return;
    }
  }
  // 2) select one of my movable pieces
  const mov = movablePieces();
  if (mov.length) {
    let best = null, bd = 1e9;
    for (const t of GameUI.tokens || []) {
      if (t.pi !== GameUI.me) continue;
      const k = t.ks.find(k => mov.includes(k)); if (k === undefined) continue;
      const d = Math.hypot(t.x - x, (t.y + 26 - y) * 0.75);
      if (d < 36 && d < bd) { bd = d; best = k; }
    }
    if (best !== null) { Sound.play('UI_Select'); GameUI.selPiece = best; return; }
  }
  // 3) object info
  for (const o of st.objects) { const [nx, ny] = nodePos(o.node); if (Math.hypot(nx - x, ny + 8 - y) < 26) { showObjectInfo(o.type); return; } }
}
const OBJ_DESC = {
  3: ['다른 워프 지점으로 바로 이동', '"걷기조차 귀찮아!!! 바로 날아가고 싶어!"\n워프를 이용하여 바로 순간이동 합니다.\n워프의 불이 꺼져있으면 이용할 수 없습니다.', 'Game_Popup_txt_warp', 'Game_Popup_img_warp'],
  5: ['스페셜 선물 지급', '택배가 도착했습니다.!!\n크리스탈 1~5개 또는 사원~부장카드 중\n1개를 얻을 수 있습니다.', 'Game_Popup_txt_special_box', 'Game_Popup_img_special_box'],
  6: ['앞으로 1~5칸 또는 뒤로 1칸 이동', '회사원들의 유일한 벗! 아메리카노!!\n도착 시 랜덤하게 앞 뒤로 이동합니다.', 'Game_Popup_txt_americano', 'Game_Popup_img_americano'],
  7: ['맵 전체로 랜덤하게 이동', '팀장님! 화...화장실이 막힌 것 같아요...\n도착 시 맵 전체로 랜덤하게 이동합니다. 펑!!!', 'Game_Popup_txt_toilet', 'Game_Popup_img_toilet'],
  8: ['반대로 이동', '세상이 빙글빙글 도는구나~\n해당 위치의 캐릭터는 반대로 이동합니다.', 'Game_Popup_txt_reverse', 'Game_Popup_img_reverse'],
  4: ['물음표 카드에 나온 내용대로 행동', '앞으로 무슨일이 벌어지는 걸까?\n무슨 내용이 담겨 있을 지 아무도 모릅니다. 두근두근♥', 'Game_Popup_txt_qcard', 'Game_Popup_img_qcard'],
  10: ['다른 워프(맨홀)로 바로 이동', '도시의 지름길! 맨홀 워프로 다른 맨홀까지 순간이동 합니다.\n불이 꺼져있으면 이용할 수 없습니다.', 'Game_Popup_txt_warp', 'Game_Popup_img_warp'],
  11: ['다음 큰 칸까지 바로 이동', '택시~! 늦었어요, 빨리 가 주세요!\n도착하면 택시를 타고 앞쪽의 다음 큰 원 칸까지 단숨에 이동합니다.', 'Game_Popup_txt_taxi', 'Game_Popup_img_taxi'],
  12: ['시원한 물벼락!', '앗 차가워! 도착하면 소화전에서 물이 뿜어져 나와요.\n(이동에는 영향이 없어요)', 'Game_Popup_txt_fireplug', 'Game_Popup_img_fireplug'],
};
function showObjectInfo(type) {
  const d = OBJ_DESC[type]; if (!d) return;
  const p = GameUI.root.find('ObjectInfoPanel'); p.setActive(true);
  Sound.play('popup');
  p.find('EffectText').setText(d[0]);
  p.find('DescriptionText').setText(d[1]);
  const it = p.find('InnerTitle'); it.setSprite(d[2]); fitSprite(it);
  const ob = p.find('Object'); ob.setSprite(d[3]); fitSprite(ob);
  onTap(p.find('CloseButton'), () => { Sound.play('UI_Close'); p.setActive(false); });
}

// ---------- event animations ----------
function banner(sprite, opt = {}) {
  const r = GameUI.root; if (!r) return Promise.resolve();
  const n = build(mkNode('banner', { panel: 70, p: [opt.x || 0, opt.y ?? 40], k: [
    mkSprite('bar', 'Game_bar_black_alpha_big', { w: 520, h: 80, ty: 1, d: 0, c: [1, 1, 1, opt.bar === false ? 0 : 0.9] }),
    sprite ? mkSprite('t', sprite, { d: 2 }) : mkLabel('t', opt.text || '', { fs: 26, d: 2, c: [1, 0.95, 0.6, 1] }),
  ] }), r);
  if (!sprite) { const t = n.find('t'); t.widget.outline = 'rgba(60,20,0,0.9)'; t.widget.outlineW = 4; }
  if (opt.sub) build(mkLabel('s', opt.sub, { fs: 18, d: 3, p: [0, -27], c: [1, 1, 1, 1], ef: 2, ec: [0, 0, 0, 0.9] }), n);
  const t = n.find('t');
  return (async () => {
    await animate(0.18, k => { t.sx = t.sy = 1.8 - 0.8 * k; n.setAlpha(k); }, Ease.out);
    await Stage.wait(opt.hold || 0.55);
    await animate(0.18, k => n.setAlpha(1 - k), Ease.in);
    r.removeChild(n);
  })();
}
function floatText([x, y], text) {
  const r = GameUI.root; if (!r) return;
  const tw = Math.max(150, Math.round(textWidth(text, 17) + 34));      // 글자 길이에 맞춘 바탕
  const n = build(mkNode('ft', { panel: 66, p: [x, y + 40], k: [mkSprite('bg', 'Game_bar_black_alpha', { w: tw, h: 32, ty: 1, d: 0, c: [1, 1, 1, 0.88] }), mkLabel('t', text, { fs: 17, d: 1, c: [1, 0.95, 0.5, 1], ef: 2, ec: [0.15, 0.05, 0, 1] })] }), r);
  animate(1.2, k => { n.y = y + 40 + k * 30; n.setAlpha(k < 0.7 ? 1 : (1 - k) / 0.3); }, Ease.out).then(() => r.removeChild(n));
}
// 원작 목소리: 도/개/걸/윷(한번더)/모(한번더)/낙
const FACE_VOICE = { [F.DO]: 'voice_do', [F.GAE]: 'voice_gae', [F.GEOL]: 'voice_geol', [F.YUT]: 'voice_yut', [F.MO]: 'voice_mo', [F.NAK]: 'voice_nak' };
async function showFace(face) {
  if (FACE_VOICE[face]) Sound.play(FACE_VOICE[face], 1);
  const rp = GameUI.root.find('RollPanel'), fg = rp.find('FaceGroup');
  fg.setActive(true);
  const cf = fg.find('CurrentFace'); cf.setSprite('Game_result_' + FACE_KEY[face]); fitSprite(cf);
  hide(fg, 'CurrentFaceBack');
  const g1 = fg.find('CurrentFaceGlow1'), g2 = fg.find('CurrentFaceGlow2');
  [g1, g2].forEach(gg => gg && gg.setActive(face === F.YUT || face === F.MO));
  await animate(0.22, k => { fg.sx = fg.sy = 0.3 + 0.7 * k; fg.setAlpha(k); fg.rot = (1 - k) * 25; }, Ease.back);
  await Stage.wait(0.5);
  await animate(0.18, k => { fg.setAlpha(1 - k); }, Ease.in);
  fg.setActive(false); fg.setAlpha(1);
}
// 상대(또는 내) 프로필을 누르면 카드와 능력치를 보여 준다 (원작 PlayerDetailInfoPanel)
function showPlayerDetail(pi) {
  const st = GameUI.st, r = GameUI.root; if (!st || !r) return;
  const p = st.players[pi], d = r.find('PlayerDetailInfoPanel'); if (!p || !d) return;
  Sound.play('popup');
  d.setActive(true);
  if (d.panel) d.panel.depth = 80;
  let dim = d.find('pdDim');
  if (!dim) { dim = build(mkSprite('pdDim', 'Common_scroll_white', { w: 800, h: 480, ty: 1, d: -5, c: [0, 0, 0, 0.55], box: [0, 0, 800, 480] }), d); d.children.unshift(d.children.pop()); }
  const close = () => { Sound.play('UI_Close'); d.setActive(false); };
  onTap(dim, close);
  const cb = d.find('CloseButton'); if (cb) { cb.comps = []; cb.box = [0, 0, 48, 48]; onTap(cb, close); }
  hide(d, 'PocketItemBG', 'AutoPlayButton', 'MedalBonus');
  const nm = d.find('NoMedalBonus'); if (nm) nm.setActive(false);
  setNeon(d.find('PlayerNameLabel'), p.gm).setText(p.name + (!p.bot && pi === GameUI.me && p.name !== '나' ? ' (나)' : ''));
  if (!d._fit) {      // 글자가 막대에 겹치지 않게: 이름은 3px 위로, 숫자는 막대 오른쪽 끝에서 띄워 왼쪽 정렬
    d._fit = 1;
    for (let i = 1; i <= 6; i++) {
      const nl = d.find(`StatName${i}Label`); if (nl) nl.y += 3;
      const sl = d.find(`Stat${i}Label`); if (sl) { sl.x = 145; sl.widget.pv = 3; sl.widget.color = [0.29, 0.24, 0.2, 1]; sl.widget.fs = 15; }
    }
  }
  const outer = d.find('CardBackground').children.find(c => c.name === 'Card'), card = (outer && outer.children.find(c => c.name === 'Card')) || outer;
  if (card.panel) card.panel.depth = 81;
  setCard(card, { ch: p.ch, cls: p.cls, lv: p.lv }, { noFx: true });
  const cs = cardStatsOf(p), ys = yutStatsOf(p);
  const NAMES = ['코인 획득 증가', '분노모드 강화', '패배시 승점 방어', '윷 확률 증가', '모 확률 증가', '윷 컨트롤 강화'];
  for (let i = 1; i <= 6; i++) {
    const v = cs[i - 1] || 0, add = i <= 5 ? (ys[i - 1] || 0) : 0;
    const nl = d.find(`StatName${i}Label`); if (nl) { nl.setText(NAMES[i - 1]); nl.widget.color = [0.4, 0.21, 0, 1]; }
    const sl = d.find(`Stat${i}Label`); if (sl) sl.setText(v);
    const bg = d.find(`Stat${i}Background`);
    if (bg) setStatBar(bg, v, add);
    const yl = d.find(`YutStat${i}Label`); if (yl) yl.setText('+' + add);
  }
  const yl = d.find('YutLabel'); if (yl) yl.setText((BOARD.yutTable[p.yut || 0] || BOARD.yutTable[0]).name.replace(' 윷', ''));
  const sc = d.find('PlayerScoreLabel'); if (sc) sc.setText(p.score + '점');
  // bottom box: this game's record instead of the server ranking text
  let info = d.find('pdInfo');
  if (!info) info = build(mkLabel('pdInfo', '', { fs: 16, d: 30, p: [37, -152], c: [0.4, 0.21, 0, 1] }), d);
  info.setText(`${CLASS_NAMES[p.cls - 1]} · 카드레벨 ${p.lv} · ${(BOARD.yutTable[p.yut || 0] || BOARD.yutTable[0]).name} Lv.${p.yutLv || 1}\n잡은 횟수 ${p.catches || 0} · 잡힌 횟수 ${p.caught || 0}` + (p.cst ? ' · GM 카드' : ''));
  const box = d.find('InnerFrame'); if (box) animate(0.18, k => { d.sx = d.sy = 0.85 + 0.15 * k; }, Ease.back);
}
// 물음표 카드 연출 (원작 QuestionPanel 사용)
async function showQCard(q, who) {
  const r = GameUI.root, qp = r && r.find('QuestionPanel'); if (!qp || !q) return;
  if (qp.panel) qp.panel.depth = 78;
  qp.setActive(true); qp.x = 0; qp.y = 0;
  ['EffectPanel', 'UseCardWrapper', 'GoodEffectPanel', 'NormalandUseEffectPanel'].forEach(n => hide(qp, n));
  const back = qp.find('CardBack'), gw = qp.find('GetCardWrapper'), c = gw.find('QCard');
  back.stopTweens(); back.setActive(true); gw.setActive(false);
  Sound.play('get_item');
  await animate(0.45, k => { back.sx = back.sy = 0.4 + 0.6 * k; back.rot = (1 - k) * Math.PI * 2; }, Ease.out);
  back.rot = 0;
  await animate(0.12, k => { back.sx = 1 - k; }, Ease.in);
  back.setActive(false);
  gw.setActive(true); c.stopTweens(); c.rot = 0;
  const frame = q.good ? 'Q_card_frame_good' : 'Q_card_frame_normal';
  c.find('CardFrameLeft').setSprite(frame); c.find('CardFrameRight').setSprite(frame);
  c.find('Ribbon').setActive(q.good);
  c.find('QuestionCardImage').setSprite(q.pic);
  c.find('CardTitle').setText(q.title);
  c.find('CardDescription').setText(q.text + (who ? `\n(${who})` : ''));
  c.find('ButtonConfirm').setActive(false);
  const glow = qp.find(q.good ? 'GoodEffectPanel' : 'NormalandUseEffectPanel'); if (glow) { glow.setActive(true); glow.walk(n => n.playTweens && n.playTweens(true)); }
  Sound.play(q.good ? 'card_gold01' : 'card_silver01');
  let done; const closed = new Promise(res => done = res);
  const bc = c.find('ButtonClose'); bc.comps = []; bc.box = [0, 0, 138, 50]; onTap(bc, () => { Sound.play('UI_Close'); done(); });
  await animate(0.2, k => { c.sx = k; c.sy = 1; }, Ease.back);
  await Promise.race([closed, Stage.wait(2.2)]);
  await animate(0.15, k => { c.sx = c.sy = 1 - 0.3 * k; gw.setAlpha(1 - k); }, Ease.in);
  gw.setAlpha(1); c.sx = c.sy = 1;
  qp.setActive(false);
}
// 다음 턴에 쓸 물음표 카드 (프로필 옆 작은 카드)
function refreshQThumbs() {
  const r = GameUI.root, st = GameUI.st; if (!r || !st) return;
  const tp = r.find('QuestionThumbPanel'); if (!tp) return;
  tp.setActive(true); if (tp.panel) tp.panel.depth = 30; tp.children.forEach(c => c.setActive(false));
  for (const seat of GameUI.seats || []) {
    const p = st.players[seat.pi]; if (!p || p.nextFace === undefined || p.nextFace === null) continue;
    const q = QCARDS.find(c => c.face === p.nextFace); if (!q) continue;
    const nm = seat.panel.startsWith('Player') ? 'QcardThumb_player' : seat.panel.startsWith('EnemyInfo1') ? 'QcardThumb_1p' : seat.panel.startsWith('EnemyInfo2') ? 'QcardThumb_2p' : 'QcardThumb_3p';
    const th = tp.find(nm); if (!th) continue;
    th.setActive(true);
    th.walk(n => { n.stopTweens && n.stopTweens(); if (n.widget) n.widget.color[3] = 1; });
    th.find('QuestionCardImage').setSprite(q.pic + '_thumb');
    th.find('QuestionCardFrame').setSprite(q.good ? 'Q_card_frame_good_thumb' : 'Q_card_frame_normal_thumb');
    th.find('CardDescription').setText(FACE_KO[q.face]);
  }
}
// 점수판의 말 칸: 캐릭터 얼굴을 둥근 칸에 그린다
const SLOT_COL = { red: '#e8402c', blue: '#2d7de0', green: '#2fae3a', yellow: '#f0b400' };
function drawSlotIcon(g, cs) {
  const ch = CHARS.find(c => c.k === cs._ch) || CHARS[0], f = findSprite('CardPotrait Atlas', ch.por); if (!f) return;
  const w = cs.widget ? cs.widget.w : 26, h = cs.widget ? cs.widget.h : 32;
  g.save(); g.transform(1, 0, 0, -1, 0, 0);
  rrect(g, rectPts(0, 0, w, h), 6); g.fillStyle = SLOT_COL[cs._col] || '#888'; g.fill();
  rrect(g, rectPts(0, 0, w - 4, h - 4), 5); g.save(); g.clip();
  g.fillStyle = '#fff5e0'; g.fillRect(-w / 2, -h / 2, w, h);
  const [a, sp] = f;
  g.drawImage(IMG[a], sp[0] + sp[2] * 0.16, sp[1] + 2, sp[2] * 0.68, sp[3] * 0.8, -h * 0.5, -h / 2 + 1, h, h * 1.15);
  g.restore(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; rrect(g, rectPts(0, 0, w - 2, h - 2), 6); g.stroke();
  g.restore();
}
// 선 정하기 화면 (원작 ChooseFirstPanel): 엎어 둔 윷 4개 중 하나를 누르면 내 윷, 남은 시간이 지나면 자동으로 고른다
const ORDER = { stop: false, t0: 0, mine: -1 };
function openOrderPanel(s) {
  const p = GameUI.root.find('ChooseFirstPanel'); p.setActive(true); p.setAlpha(1);
  hide(p, 'YutMarks');
  p.find('Background').widget.color = [0, 0, 0, 0.55];
  p.find('SubTitle').setText('윷을 선택하세요');
  const tl = p.find('TimeLabel'); tl.setActive(true);
  Object.assign(ORDER, { stop: false, t0: Stage.t, mine: -1 });
  const tick = () => { if (ORDER.stop || !p.active) return; const left = Math.max(0, 6 - Math.floor(Stage.t - ORDER.t0)); tl.setText(String(left)); Stage.after(0.2, tick); };
  tick();
  Sound.play('turn_select01');
  for (let i = 0; i < 4; i++) {
    const y = p.find('Yut' + (i + 1)); y.setActive(true); y.sx = y.sy = 1; y.rot = 0;
    const bg = y.find('Background'); bg.setSprite('Game_image_yut');
    y.find('Checkmark').setActive(false);
    if (!y._marks) y._marks = build(mkNode('marks', { k: [43, 1, -41].map((yy, j) => mkSprite('x' + j, 'Game_image_yut_x', { p: [1.5, yy], d: 4 })) }), y);
    y._marks.setActive(true); y._marks.children.forEach(m => m.widget.color = [1, 0.55, 0.3, 1]);     // 원작: 평소엔 주황 X, 내가 고른 윷만 연두 X
    if (!y._who) y._who = build(mkNode('who', { p: [0, -112], k: [mkLabel('t', '', { fs: 15, d: 6, c: [1, 1, 1, 1], ef: 1, ec: [0, 0, 0, 1] })] }), y);
    y._who.find('t').setText('');
    y.box = [0, 0, 70, 200];
    onTap(y, () => {
      const st = GameUI.st; if (!st || st.phase !== 'order' || ORDER.mine >= 0 || ORDER.stop) return;
      if ((st.orderPicks || []).some((ix, pi) => ix === i && pi !== GameUI.me)) return;
      ORDER.mine = i; Sound.play('UI_Select');
      markOrderPick(GameUI.me, i, st);
      Room.act({ a: 'pick', idx: i });
    });
  }
  // 보는 사람이 없으면 원작처럼 위아래로 살짝 흔들어 "눌러 보라"는 느낌
  const wob = () => { if (ORDER.stop || !p.active) return; for (let i = 0; i < 4; i++) { const y = p.find('Yut' + (i + 1)); if (ORDER.mine < 0 && !y.find('Checkmark').active) y.rot = Math.sin(Stage.t * 6 + i) * 2.5; else y.rot = 0; } Stage.after(0.03, wob); };
  wob();
}
function markOrderPick(pi, idx, s, quiet) {
  const p = GameUI.root.find('ChooseFirstPanel'); const y = p && p.find('Yut' + (idx + 1)); if (!y) return;
  const st = GameUI.st; if (st && st.orderPicks) st.orderPicks[pi] = idx;
  if (pi === GameUI.me) ORDER.mine = idx;
  const ck = y.find('Checkmark'), was = ck.active;
  ck.setActive(true); y.rot = 0;
  ck.widget.color = [1, 1, 1, 1]; ck.widget.gray = pi !== GameUI.me;          // 남이 고른 윷은 회색 체크
  if (pi === GameUI.me && y._marks) y._marks.children.forEach(m => m.widget.color = [1, 1, 1, 1]);
  if (y._who) { const t = y._who.find('t'); t.setText(pi === GameUI.me ? '나' : s.players[pi].name); t.widget.color = pi === GameUI.me ? [1, 0.95, 0.4, 1] : [1, 1, 1, 1]; }
  if (!was && !quiet) { Sound.play('turn_select02'); ck.sx = ck.sy = 0.4; animate(0.2, k => { ck.sx = ck.sy = 0.4 + 0.6 * k; }, Ease.back); }
}
// 칼퇴 찬스(내 차례) / 칼퇴 경고(상대 차례): 남은 말(한 무더기)이 모 한 번이면 퇴근할 거리에 있을 때
// 원작 MessagePanel의 01_Win_chance / 02_Lose_warning 연출을 그대로 쓴다. 차례마다 한 번.
async function kaltaeCheck(pi, s) {
  const p = s && s.players[pi]; if (!p || p.gone || s.phase === 'over') return;
  const left = p.pieces.filter(pc => !pc.done); if (!left.length) return;
  const at = left[0].pos;
  if (at < 0 || left.some(pc => pc.pos !== at) || (DIST[at] ?? 99) > 5) return;
  if ((s.objects || []).some(o => o.node === at && o.type === OBJ.REVERSE)) return;   // 리버스 칸에서는 반대로 가니 퇴근 불가
  GameUI.kaltae = GameUI.kaltae || {};
  const key = pi + ':' + (s.turnNo || 0) + ':' + at + ':' + s.throws.length; if (GameUI.kaltae[key]) return; GameUI.kaltae[key] = 1;
  Sound.play('emergrncy');
  await showChanceMsg(pi === GameUI.me, p.name);
}
async function showChanceMsg(mine, name) {
  const mp = GameUI.root && GameUI.root.find('MessagePanel');
  const node = mp && mp.find(mine ? '01_Win_chance' : '02_Lose_warning');
  if (!node) { await banner(null, { text: mine ? '칼퇴 찬스!' : '칼퇴 경고!', hold: 0.6 }); return; }
  mp.setActive(true); node.setActive(true); hide(node, 'Perfect');
  let who = node._who;
  if (!who) {
    who = node._who = build(mkNode('who', { panel: 69, p: [0, -98], k: [mkLabel('t', '', { fs: 16, d: 5, c: [1, 0.96, 0.75, 1], ef: 2, ec: [0, 0, 0, 1] })] }), node);
  }
  who.find('t').setText(mine ? '모가 나오면 바로 퇴근!' : `${name}님이 모 한 번이면 퇴근해요`);
  who.setAlpha(0); animate(0.4, k => who.setAlpha(k)).then(() => Stage.after(1.3, () => animate(0.25, k => who.setAlpha(1 - k))));
  node.playTweens(true);
  await Stage.wait(2.2);
  node.setActive(false);
}
// GM 전용 점수판: 상무 카드처럼 홀로그램(무지개 반짝이) 판 + 흰·금 테두리
function gmPanel(pn, on) {
  for (const nm of ['Background', 'NameBackground']) {
    const bg = pn.find(nm); if (!bg) continue;
    if (!on) { if (bg._gm) bg._gm.setActive(false); continue; }
    if (!bg._gm) bg._gm = buildCustom('gmHolo', g => drawGmHolo(g, bg, nm === 'NameBackground'), { d: (bg.widget ? bg.widget.d : 0) + 0.5 }, bg);
    bg._gm.setActive(true);
  }
}
const GMHOLO = {};
function drawGmHolo(g, bg, bar) {
  const w = bg.widget; if (!w) return;
  const f = findSprite(null, w.sp); if (!f) return;
  const [x0, y0, ww, hh] = widgetRect(w);
  const k = 2, W = Math.round(ww * k), H = Math.round(hh * k), t = Stage.t || 0;
  const key = w.sp + W + 'x' + H;
  let c = GMHOLO[key]; if (!c) { c = GMHOLO[key] = document.createElement('canvas'); c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H);
  x.drawImage(IMG[f[0]], f[1][0], f[1][1], f[1][2], f[1][3], 0, 0, W, H);             // 점수판 모양을 그대로 마스크로
  x.globalCompositeOperation = 'source-atop';
  const hb = findSprite('CharacterCard Atlas', bar ? 'Cha_Card_Frame_07' : 'Cha_Card_BG_07');   // 상무 카드의 홀로그램 무늬
  if (hb) { x.globalAlpha = 1; x.drawImage(IMG[hb[0]], hb[1][0], hb[1][1] + hb[1][3] * 0.2, hb[1][2], hb[1][3] * 0.5, 0, 0, W, H); }
  const gr = x.createLinearGradient(0, 0, W, H);
  for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsla(${(t * 50 + i * 60) % 360},100%,68%,${bar ? 0.6 : 0.5})`);
  x.globalAlpha = 1; x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.fillStyle = bar ? 'rgba(40,0,70,0.35)' : 'rgba(30,10,60,0.18)'; x.fillRect(0, 0, W, H);   // 글씨가 잘 보이게
  const sw = ((t * 0.45) % 1.6 - 0.3) * W;                                             // 지나가는 빛
  const sg = x.createLinearGradient(sw - 60, 0, sw + 60, H);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = sg; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) {                                                        // 반짝이
    const px = ((i * 97 + t * 23) % W), py = ((i * 53) % H), a = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
    x.fillStyle = `rgba(255,255,255,${0.75 * a})`; x.beginPath(); x.arc(px, py, 1.6 * k * a + 0.5, 0, Math.PI * 2); x.fill();
  }
  g.save(); g.transform(1, 0, 0, -1, 0, 0);
  g.drawImage(c, x0, -(y0 + hh), ww, hh);
  g.strokeStyle = `hsla(${(t * 60) % 360},100%,80%,0.9)`; g.lineWidth = 1.5; g.shadowColor = '#fff2a8'; g.shadowBlur = 8 * (Stage.scale || 1);
  rrect(g, rectPts(x0 + ww / 2, -(y0 + hh / 2), ww - 3, hh - 3), 8); g.stroke();
  g.restore();
}
// 잡을 때 나는 소리 (GM 메뉴에서 들어 보고 바꿀 수 있음)
const CATCH_SOUNDS = ['voice_catch', 'character01', 'character03', 'character04', 'Company01', 'americano03', 'toilet01', 'taxi01', 'Card_Take', 'magnet'];
function catchSound() { return CATCH_SOUNDS.includes(S.catchSnd) ? S.catchSnd : 'voice_catch'; }
// "윷 컨트롤!" 알림 (원작 MsgYutControlPanel)
function showYutControl(pi) {
  const r = GameUI.root; if (!r) return;
  const seat = (GameUI.seats || []).find(s => s.pi === pi); const sp = seat ? seat.panel : 'Player';
  const pos = sp.startsWith('Player') ? [286, -138] : sp.startsWith('EnemyInfo1') ? [-286, 150] : sp.startsWith('EnemyInfo2') ? [286, 150] : [-286, -138];
  const n = build(mkNode('yutControl', { panel: 68, p: pos, k: [
    mkSprite('bg', 'Game_frame_yut_control', { w: 200, h: 50, ty: 1, d: 0 }),
    mkSprite('ic', 'Game_icon_yut_control', { d: 1, p: [-70, 2] }),
    mkSprite('tx', 'Game_txt_yut_control', { d: 2, p: [14, 0] }),
  ] }), r);
  Sound.play('UI_Check');
  animate(0.22, k => { n.sx = n.sy = 0.4 + 0.6 * k; n.setAlpha(k); }, Ease.back)
    .then(() => Stage.wait(1.1)).then(() => animate(0.2, k => n.setAlpha(1 - k), Ease.in)).then(() => r.removeChild(n));
}
function throwOrigin(pi) {
  const seat = (GameUI.seats || []).find(s => s.pi === pi); const sp = seat ? seat.panel : 'Player';
  if (sp.startsWith('Player')) return [372, -196];
  if (sp.startsWith('EnemyInfo1')) return [-360, 210];
  if (sp.startsWith('EnemyInfo2')) return [360, 210];
  return [-360, -200];
}
function setOv(pi, ks, x, y, extra = {}) { ks.forEach(k => GameUI.override[pi + ':' + k] = Object.assign({ x, y, stack: ks.length }, extra)); }
async function hopAlong(pi, ks, path, startXY) {
  let [cx, cy] = startXY;
  for (let i = 0; i < path.length; i++) {
    const [nx, ny0] = nodePos(path[i]); const ny = ny0 + 2;
    const sx = cx, sy = cy;
    Sound.play(['move01', 'move02', 'move03', 'move04', 'move05'][Math.min(4, i)], 0.7);
    await animate(0.23, k => setOv(pi, ks, sx + (nx - sx) * k, sy + (ny - sy) * k + Math.sin(k * Math.PI) * 18), Ease.linear);
    cx = nx; cy = ny;
  }
}
function curXY(pi, k) {
  const ov = GameUI.override[pi + ':' + k]; if (ov) return [ov.x, ov.y];
  const pc = GameUI.st.players[pi].pieces[k];
  if (pc.pos < -1 || !NODE[pc.pos] && pc.pos !== -1) { const [x, y] = nodePos(0); return [x, y + 2]; }
  if (pc.pos === -1) { const p = GameUI.st.players[pi]; const wi = p.pieces.filter((x, j) => j < k && x.pos === -1 && !x.done).length; return waitPos(pi, wi); }
  const [x, y] = nodePos(pc.pos); return [x, y + 2];
}
GameUI.play = async function (e, final) {
  const st = this.st;
  switch (e.e) {
    case 'orderStart': {
      if (isCity(final)) Sound.play('citymap_open');
      this.st = JSON.parse(JSON.stringify(final)); this.st.phase = 'order'; this.st.turn = -1; this.refresh();
      openOrderPanel(final);
      await Stage.wait(0.3);
      break;
    }
    case 'orderPick': markOrderPick(e.p, e.idx, final); break;
    case 'order': {
      const p = GameUI.root.find('ChooseFirstPanel');
      (final.orderPicks || []).forEach((ix, pi) => { if (ix >= 0) markOrderPick(pi, ix, final, true); });
      ORDER.stop = true; p.find('TimeLabel').setActive(false);
      await Stage.wait(0.5);
      const y = p.find('Yut' + (e.stick + 1));
      if (y) {
        for (let i = 1; i <= 4; i++) { const yy = p.find('Yut' + i); if (yy) yy.find('Checkmark').setActive(false); }   // 원작처럼 체크를 걷고 「선」 윷만 뒤집는다
        const bg = y.find('Background'); Sound.play('turn_select01');
        await animate(0.16, k => { y.sx = 1 - k; });
        bg.setSprite('Game_image_yut_1st'); if (y._marks) y._marks.setActive(false);
        await animate(0.22, k => { y.sx = k * 1.15; y.sy = 1 + 0.15 * k; }, Ease.back);
        await animate(0.12, k => { y.sx = y.sy = 1.15 - 0.15 * k; });
      }
      p.find('SubTitle').setText(e.order.map((pi, i) => `${i + 1}. ${final.players[pi].name}`).join('   '));
      const m = GameUI.root.find('MissionButton'); if (m) { m.find('MissionLabel').setText(MISSIONS[final.mission] || ''); }
      await Stage.wait(1.8);
      await animate(0.3, k => p.setAlpha(1 - k));
      p.setActive(false); p.setAlpha(1);
      this.st = JSON.parse(JSON.stringify(final)); this.st.phase = 'order'; this.refresh();
      await Stage.wait(0.3);
      break;
    }
    case 'turn': {
      st.turn = e.p; st.phase = 'throw'; st.throws = []; st.canThrow = true; this.selThrow = 0; this.selPiece = null;
      this.refresh();
      if (e.p === this.me) await banner('Game_txt_turn', { hold: 0.4 });
      await kaltaeCheck(e.p, this.st);
      break;
    }
    case 'throw': {
      Sound.play('yut01');
      const thrown = await Yut3D.throwYut({ skin: final.players[e.p].yut || 0, face: e.face, from: throwOrigin(e.p), center: nodePos(8) });
      if (!thrown) await Stage.wait(0.25);
      if (e.ctl) showYutControl(e.p);
      if (e.forced) { st.players[e.p].nextFace = null; refreshQThumbs(); floatText(throwOrigin(e.p).map((v, i) => i ? v + 40 : v * 0.8), '물음표 카드 사용!'); }
      if (e.face === F.BACKDO) Sound.play('move06_backdo', 0.8);
      if (e.face !== F.NAK) st.throws.push(e.face);
      this.refresh();
      await showFace(e.face);
      Yut3D.clear();
      if (e.face === F.YUT || e.face === F.MO) await banner('Game_txt_onemore', { hold: 0.3 });
      break;
    }
    case 'nakguard': await banner('Game_txt_nak_prevention', { hold: 0.5 }); break;
    case 'combineStart': await banner('Game_txt_combine_start', { hold: 0.5 }); break;
    case 'move': {
      const ks = e.pieces; const start = curXY(e.p, ks[0]);
      if (e.reversed) await banner(null, { text: '리버스! 반대로 이동', hold: 0.35 });
      if (e.face === F.BACKDO && !e.reversed) Sound.play('move06_backdo');
      await hopAlong(e.p, ks, e.path, start);
      if (e.done) {
        const [x, y] = e.path.length ? nodePos(e.path[e.path.length - 1]) : nodePos(0);
        const [gx, gy] = nodePos(0);
        await animate(0.25, k => setOv(e.p, ks, x + (gx - x) * k, y + (gy - y) * k + 6, { a: 1 - k, s: 1 + k }), Ease.in);
      }
      // move consumed throw locally
      const ti = st.throws.indexOf(e.face); if (ti >= 0) st.throws.splice(ti, 1);
      const p = st.players[e.p];
      ks.forEach(k => { const pc = p.pieces[k]; if (e.done) { pc.done = true; pc.pos = -2; } else if (e.path.length) pc.pos = e.path[e.path.length - 1]; });
      ks.forEach(k => delete this.override[e.p + ':' + k]);
      this.refresh();
      if (!e.done && e.path.length) {        // 소화전 칸에 서면 물줄기
        const end = e.path[e.path.length - 1], o = st.objects.find(x => x.node === end && x.type === OBJ.HYDRANT);
        if (o) { Sound.play('water_shot'); GameUI.spray = { node: end, t0: GameUI.t || 0 }; }
      }
      break;
    }
    case 'finish': {
      Sound.play('character04');
      await banner('Game_txt_kaltae', { hold: 0.5, sub: `${final.players[e.p].name} 퇴근!${e.n > 1 ? ' (업고 퇴근 x' + e.n + ')' : ''}` });
      break;
    }
    case 'catch': {
      Sound.play(catchSound());
      const tasks = e.victims.map(([qi, j]) => {
        const [sx, sy] = curXY(qi, j);
        const wi = j; const [tx, ty] = waitPos(qi, Math.min(2, wi));
        return animate(0.45, k => { GameUI.override[qi + ':' + j] = { x: sx + (tx - sx) * k, y: sy + (ty - sy) * k + Math.sin(k * Math.PI) * 70, stack: 1, s: 1 - 0.25 * k }; }, Ease.inOut);
      });
      banner('Game_txt_catch', { hold: 0.45 });
      floatText(nodePos(e.node), `${e.combo} Combo  +${e.gain}점`);
      await Promise.all(tasks);
      e.victims.forEach(([qi, j]) => { const pc = st.players[qi].pieces[j]; pc.pos = -1; delete this.override[qi + ':' + j]; });
      this.refresh();
      break;
    }
    case 'extra': await banner('Game_txt_onemore', { hold: 0.35 }); await kaltaeCheck(e.p, this.st); break;
    case 'feverOn': {
      Sound.play('emergrncy');
      await banner('Game_txt_anger_mode', { hold: 0.6, sub: final.players[e.p].name + ' 분노모드 발동!' });
      break;
    }
    case 'warp': case 'toilet': {
      Sound.play(e.e === 'warp' ? 'warp01' : 'toilet01');
      const [sx, sy] = curXY(e.p, e.pieces[0]);
      await animate(0.25, k => setOv(e.p, e.pieces, sx, sy + 40 * k, { a: 1 - k }), Ease.in);
      const [tx, ty] = nodePos(e.to);
      Sound.play(e.e === 'warp' ? 'warp02' : 'toilet02');
      await animate(0.3, k => setOv(e.p, e.pieces, tx, ty + 2 + 40 * (1 - k), { a: k }), Ease.out);
      const p = st.players[e.p]; e.pieces.forEach(k => { p.pieces[k].pos = e.to; delete this.override[e.p + ':' + k]; });
      this.refresh();
      break;
    }
    case 'americano': {
      Sound.play('americano01', 0.6);
      const cr = GameUI.root.find('CoffeeRoulettePanel'); cr.setActive(true);
      const roul = cr.find('CoffeeRoulette'), res = cr.find('CoffeeRouletteResult'), msg = cr.find('CoffeeRouletteResultMessage');
      cr.x = 0; cr.y = 40;
      roul.setActive(true); res.setActive(true); msg.setActive(true);
      res.children.forEach(c => c.setActive(false)); msg.children.forEach(c => c.setActive(false));
      const order = ['1', '2', '3', '4', '5', '-1'];
      roul.children.forEach(c => { c.stopTweens(); c.setActive(false); });
      for (let i = 0; i < 14; i++) {
        const v = order[i % 6]; roul.children.forEach(c => c.setActive(c.name === 'roulette_' + v));
        Sound.play('Tap', 0.4); await Stage.wait(0.05 + i * 0.012);
      }
      roul.setActive(false);
      const r1 = res.find('roulette_result_' + e.value); if (r1) { r1.setActive(true); r1.setAlpha(1); }
      const m1 = msg.find('roulette_result_message_' + e.value); if (m1) { m1.setActive(true); m1.y = -50; }
      Sound.play(e.value > 0 ? 'americano02' : 'americano03');
      await Stage.wait(0.7);
      cr.setActive(false);
      floatText(curXY(e.p, e.pieces[0]), e.value > 0 ? `${e.value}칸 앞으로!` : '1칸 뒤로!');
      const ks = e.pieces; await hopAlong(e.p, ks, e.path, curXY(e.p, ks[0]));
      const p = st.players[e.p]; ks.forEach(k => { if (e.done) { p.pieces[k].done = true; p.pieces[k].pos = -2; } else if (e.path.length) p.pieces[k].pos = e.path[e.path.length - 1]; delete this.override[e.p + ':' + k]; });
      this.refresh();
      break;
    }
    case 'reverseHere': await banner(null, { text: '리버스 칸!', sub: '다음에는 반대로 움직여요', hold: 0.4 }); break;
    case 'specialSpawn': { const o = st.objects.find(x => x.node === e.node && x.type === OBJ.BOX); if (o) o.on = true; break; }
    case 'timeUp': { Sound.play('emergrncy'); await banner('Game_txt_today_overtime', { hold: 0.9, sub: '시간 종료! 지금 순위로 결과가 정해져요' }); break; }
    case 'specialBox': {
      Sound.play('object_regen'); { const o = st.objects.find(x => x.node === e.node && x.type === OBJ.BOX); if (o) o.on = false; }
      const rw = e.reward;
      const txt = rw.t === 'card' ? `${CLASS_NAMES[rw.cls - 1]} 카드` : rw.t === 'dia' ? `크리스탈 ${rw.n}개` : rw.t === 'coin' ? `코인 ${fmt(rw.n)}` : '획득점수 2배!';
      await banner('Game_txt_specialbox_get', { hold: 0.7, sub: `${final.players[e.p].name}: ${txt}` });
      break;
    }
    case 'wasted': await banner(null, { text: '이동할 수 있는 말이 없어요', hold: 0.4 }); break;
    case 'warpToggle': break;
    case 'manhole': case 'taxi': {
      const isTaxi = e.e === 'taxi';
      Sound.play(isTaxi ? 'taxi01' : 'warp01');
      const [sx, sy] = curXY(e.p, e.pieces[0]);
      if (isTaxi) {
        GameUI.taxiAt = e.from;
        await Stage.wait(0.35);
        const [tx, ty] = nodePos(e.to);
        Sound.play('taxi02');
        await animate(0.55, k => setOv(e.p, e.pieces, sx + (tx - sx) * k, sy + (ty + 2 - sy) * k + Math.sin(Math.PI * k) * 40, { a: 1 }), Ease.inOut);
        GameUI.taxiAt = null;
      } else {
        await animate(0.25, k => setOv(e.p, e.pieces, sx, sy - 30 * k, { a: 1 - k, s: 1 - 0.5 * k }), Ease.in);
        const [tx, ty] = nodePos(e.to);
        Sound.play('warp02');
        await animate(0.3, k => setOv(e.p, e.pieces, tx, ty + 2 - 30 * (1 - k), { a: k, s: 0.5 + 0.5 * k }), Ease.out);
      }
      const p = st.players[e.p]; e.pieces.forEach(k => { p.pieces[k].pos = e.to; delete this.override[e.p + ':' + k]; });
      this.refresh();
      break;
    }
    case 'qcard': {
      const q = QCARDS.find(c => c.k === e.card);
      if (e.info && e.info.victim !== undefined) {           // 자석: 상대 말을 끌어온다
        await showQCard(q, final.players[e.p].name);
        Sound.play('magnet');
        const [fx, fy] = nodePos(e.info.from), [tx, ty] = nodePos(e.node);
        await animate(0.45, k => setOv(e.info.victim, e.info.pieces, fx + (tx - fx) * k, fy + (ty - fy) * k + 2, { a: 1 }), Ease.in);
        e.info.pieces.forEach(j => { st.players[e.info.victim].pieces[j].pos = e.node; delete this.override[e.info.victim + ':' + j]; });
        this.refresh();
      } else {
        await showQCard(q, final.players[e.p].name);
        if (q.face !== undefined) { st.players[e.p].nextFace = q.face; this.refresh(); }
        if (e.card === 'plus10') { st.players[e.p].score += 10; floatText(nodePos(e.node), '+10점'); this.refresh(); }
      }
      break;
    }
    case 'left': await banner(null, { text: `${final.players[e.p].name}님이 나갔어요`, sub: '컴퓨터가 대신 플레이해요', hold: 0.6 }); break;
    case 'over': {
      this.st = JSON.parse(JSON.stringify(final)); this.refresh(); this.over = true;
      if (!final.timeout && final.winner !== null && final.winner !== undefined) {      // 원작: PERFECT 칼퇴 성공
        Sound.play('tie');
        await banner('Game_txt_kaltae_big', { hold: 1.1, sub: final.winner === this.me ? '승리하셨습니다!' : `${final.players[final.winner].name}님이 칼퇴했어요` });
      } else await Stage.wait(0.6);
      await showResult(final);
      break;
    }
  }
};

// ---------- result ----------
async function showResult(st) {
  const r = GameUI.root;
  const meIdx = GameUI.me, me = st.players[meIdx];
  const res = me ? me.result : null;
  // apply rewards to my save
  if (res && !GameUI.rewarded) {
    GameUI.rewarded = true;
    S.coin += res.coin;
    let lvUp = false;
    S.exp = (S.exp || 0) + res.exp * 3;
    while (S.exp >= 100) { S.exp -= 100; S.level++; lvUp = true; S.dia += 1; }
    for (const rw of me.rewards || []) {
      if (rw.t === 'coin') S.coin += rw.n;
      else if (rw.t === 'dia') S.dia += rw.n;
      else if (rw.t === 'card') { const c = newCard(CHARS[Math.floor(Math.random() * CHARS.length)].k, Math.min(5, rw.cls)); S.cards.push(c); }
    }
    S.games = (S.games || 0) + 1; if (res.rank === 1) S.wins = (S.wins || 0) + 1;
    save();
    GameUI.lvUp = lvUp;
  }
  const won = res && res.rank === 1;
  Sound.stopBgm();
  Sound.play(won ? 'victory' : 'lose');
  const rp = r.find('ResultPanel'); rp.setActive(true);
  ['02_TitleTimeOutWin', '04_TitleWin', '05_TitlePerfectWin', '03_TitleLose', '01_TitleDraw'].forEach(n => hide(rp, n));
  const title = rp.find(won ? (st.timeout ? '02_TitleTimeOutWin' : '04_TitleWin') : '03_TitleLose'); title.setActive(true); title.playTweens(true);
  rp.find('Background').widget.color = [0, 0, 0, 0.65];
  const fp = rp.find('00_FramePanel'); fp.playTweens(true, false);
  hide(fp, 'Clock', 'CoinBoostButton', 'Baloon');
  const cb = fp.find('ConfirmButton'); cb.x = 0; hide(cb, 'BingoCardGet');
  const bars = fp.find('RankingBarPanel');
  const others = st.ranking.filter(pi => pi !== meIdx);
  // me
  const P = bars.find('Player');
  const ch = CHARS.find(c => c.k === me.ch) || CHARS[0];
  setNeon(P.find('MyNameLabel'), me.gm).setText(me.name);
  P.find('Portrait').setSprite(ch.por);
  const mr = P.find('MyRank'); mr.setSprite(res.rank === 1 ? 'Result_txt_1st_win' : 'Result_txt_user_' + res.rank); fitSprite(mr);
  P.find('MyCoinLabel').setText(fmt(res.coin));
  P.find('MyRankPointLabel').setText(me.score + '점'); P.find('MyRankLosePointLabel').setActive(false);
  P.find('MyRankPointTotalLabel').setText(`(보유: ${fmt(S.coin)})`);
  hide(P, 'MyCharacterBonus', 'IngameMedal', 'MyTrophyItem', 'TwinkleSpecialBox');
  const pm = P.find('IngameMisstion'); if (pm) pm.setActive(!!res.mission);
  const tw = P.find('TwinkleSpecialBox'); if (tw && (me.rewards || []).length) tw.setActive(true);
  ['Enemy1', 'Enemy2', 'Enemy3'].forEach((n, i) => {
    const row = bars.find(n); const pi = others[i];
    if (pi === undefined) { row.setActive(false); return; }
    row.setActive(true);
    const q = st.players[pi], qc = CHARS.find(c => c.k === q.ch) || CHARS[0];
    setNeon(row.find(n + 'NameLabel'), q.gm).setText(q.name);
    row.find(n + 'CoinLabel').setText(fmt(q.result.coin));
    row.find(n + 'RankPointLabel').setText(q.score + '점');
    const rk = row.find(n + 'Rank'); rk.setSprite(q.result.rank === 1 ? 'Result_txt_user_2' : 'Result_txt_playermate_' + Math.min(4, q.result.rank)); fitSprite(rk);
    if (q.result.rank === 1) rk.setSprite('Result_txt_1st_win'), fitSprite(rk);
    row.find('Portrait').setSprite(qc.por);
    hide(row, n + 'ThrophyItem', n + 'ThrophyItemBack', 'IngameMedal');
    const m = row.find('IngameMisstion'); if (m) m.setActive(!!q.result.mission);
    const mb = row.find(n + 'MissionBack'); if (mb) mb.setActive(!!q.result.mission);
  });
  onTap(cb, () => {
    Sound.play('UI_Select');
    rp.setActive(false);
    if (GameUI.lvUp) toast(`레벨 업! Lv.${S.level} (크리스탈 1개 보너스)`);
    backToLobby();
  });
}
function backToLobby() {
  GameUI.over = false; GameUI.rewarded = false;
  if (Room.role === 'host') {
    Room.game = null;
    if (Room.lobby) { Room.lobby.started = false; Room.lobby.slots.forEach(s => { if (!s.host && !s.bot) s.ready = false; }); Room.pushLobby(); }
    go(showLobby);
  } else if (Room.role === 'client') { G.myReady = false; go(showLobby); }
  else go(showMain);
}
