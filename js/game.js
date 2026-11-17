'use strict';
// ======================================================================
//  인생역전 윷놀이 — 추억 보관용 오프라인판 (게임 로직)
// ======================================================================
const CHARS = [
  { k: 'Taepoong', name: '김태풍', por: 'Cha_Portrait_Tornado', nm: 'Cha_Card_Name_Taepoong', sp: [0, 5], base: 1, pers: REAL.pers[1] },
  { k: 'Handsome', name: '오스카', por: 'Cha_Portrait_Handsome', nm: 'Cha_Card_Name_Handsome', sp: [1, 3], base: 6, pers: REAL.pers[6] },
  { k: 'IdolMan', name: '나혜성', por: 'Cha_Portrait_IdolMan', nm: 'Cha_Card_Name_IdolMan', sp: [3, 4], base: 6 },
  { k: 'Noble', name: '나애리', por: 'Cha_Portrait_Noble', nm: 'Cha_Card_Name_Noble', sp: [0, 2], base: 2, pers: REAL.pers[2] },
  { k: 'Soccer', name: '백호', por: 'Cha_Portrait_Soccer', nm: 'Cha_Card_Name_Soccer', sp: [1, 4], base: 5 },
  { k: 'Nurse', name: '미미', por: 'Cha_Portrait_Nurse', nm: 'Cha_Card_Name_Nurse', sp: [2, 5], base: 3 },
  { k: 'Bigman', name: '가르시아', por: 'Cha_Portrait_Bigman', nm: 'Cha_Card_Name_Bigman', sp: [1, 2], base: 4, pers: REAL.pers[4] },
  { k: 'Madam', name: '유난희', por: 'Cha_Portrait_Madam', nm: 'Cha_Card_Name_Madam', sp: [0, 3], base: 7, pers: REAL.pers[7] },
  { k: 'Boyish', name: '강한나', por: 'Cha_Portrait_Boyish', nm: 'Cha_Card_Name_Boyish', sp: [3, 5], base: 5, pers: REAL.pers[5] },
  { k: 'Sexy', name: '오소라', por: 'Cha_Portrait_Secretary', nm: 'Cha_Card_Name_Sexy', sp: [2, 4], base: 3, pers: REAL.pers[3] },
  { k: 'Chef', name: '제프', por: 'Cha_Portrait_Chef', nm: 'Cha_Card_Name_Chef', sp: [0, 4], base: 4 },
  { k: 'Robot', name: 'RP', por: 'Cha_Portrait_Robot', nm: 'Cha_Card_Name_Robot', sp: [3, 5], base: 1 },
];
const CLASS_NAMES = ['사원', '대리', '과장', '차장', '부장', '이사', '상무'];
const STAT_MAX = 100;
// 뽑기권: 선택 횟수, 가격, 화폐, 등급 확률(사원~상무, %)
const TICKETS = {
  '1st Gacha': { name: '일반 뽑기권 (1회)', picks: 1, price: 5000, cur: 'coin', odds: [68, 18, 10, 3.5, 0.5, 0, 0] },
  '2nd Gacha': { name: '일반 뽑기권 (3회)', picks: 3, price: 10000, cur: 'coin', odds: [68, 18, 10, 3.5, 0.5, 0, 0] },
  '3rd Gacha': { name: '일반 뽑기권 (5회)', picks: 5, price: 30000, cur: 'coin', odds: [68, 18, 10, 3.5, 0.5, 0, 0] },
  '4th Gacha': { name: '고급 뽑기권 (1회)', picks: 1, price: 50, cur: 'dia', odds: [0, 0, 62, 25, 10, 3, 0] },
  '5th Gacha': { name: '고급 뽑기권 (3회)', picks: 3, price: 100, cur: 'dia', odds: [0, 0, 62, 25, 10, 3, 0] },
  '6th Gacha': { name: '고급 뽑기권 (5회)', picks: 5, price: 240, cur: 'dia', odds: [0, 0, 62, 25, 10, 3, 0] },
};

// ---------------------------------------------------------------- save
const SAVE_KEY = 'insaeng_yut_offline_v1';
let S = null;
const rnd = n => Math.floor(Math.random() * n);
function genStats(ch, cls, lv) {
  const c = CHARS.find(x => x.k === ch);
  const base = 24 + (cls - 1) * 22 + (lv - 1) * 3;
  return [0, 1, 2, 3, 4, 5].map(i => Math.min(STAT_MAX, Math.round(base * (c.sp.includes(i) ? 1.45 : 0.7 + ((c.k.charCodeAt(i % c.k.length) * 7 + i * 13) % 30) / 100))));
}
function newCard(ch, cls) { return { id: S.nextId++, ch, cls, lv: 1, t: Date.now() + S.nextId, isNew: true }; }
// 능력치·레벨업 비용·진급 비용은 게임에 내장된 데이터 테이블(card_table)을 그대로 사용 (이사·상무는 확장)
function cardStats(card) {
  if (card.cst) return [0, 1, 2, 3, 4, 5].map(i => Math.max(0, Math.min(999, Math.round(+card.cst[i] || 0))));   // GM이 능력치를 직접 정한 카드
  const ch = CHARS.find(x => x.k === card.ch), tbl = REAL.abil[ch.base];
  let a = tbl[Math.min(card.cls, 5)][Math.max(1, Math.min(10, card.lv)) - 1].slice(), ctl = 0;
  if (card.cls > 5) {
    const f = Math.pow(1.3, card.cls - 5);
    a = a.map(v => Math.round(v * f + (card.cls - 5) * 4));
    ctl = Math.round(a[4] * 0.8);
    const up = card.cls === 6 ? 1.10 : 1.30;             // 이사 +10%, 상무 +30%
    a = a.map(v => Math.round(v * up)); ctl = Math.round(ctl * up);
    const ym = card.cls === 6 ? 1.25 : 1.5;              // 이사·상무는 윷·모 확률 증가를 더 올림
    a[3] = Math.round(a[3] * ym); a[4] = Math.round(a[4] * ym);
    if (card.cls === 7) ctl += 50;                       // 윷 컨트롤 강화: 상무만 +50
  }
  return [...a, ctl];
}
// 능력치 막대: 100까지는 노란색, 101부터는 그 위를 빨간색이 1씩 덮어쓴다 (원작 방식). 윷 보너스는 뒤쪽 막대.
// 201부터는 빨간 막대 위를 상무 카드 색(흰 금빛 + 홀로그램)이 다시 1씩 덮어쓴다 (GM이 능력치를 크게 넣은 카드용).
function setStatBar(bg, v, yutAdd = 0) {
  if (!bg) return;
  let add = null;
  bg.children.forEach(b => {
    if (!b.widget || b.name === 'Add200') return;
    if (/Add$/.test(b.name)) { b.widget.ty = 3; b.widget.fa = Math.max(0, Math.min(1, (v - 100) / 100)); add = b; }
    else if (/Yut/.test(b.name)) { b.widget.ty = 3; b.widget.fa = yutAdd > 0 ? Math.max(0, Math.min(1, (v + yutAdd) / 100)) : 0; }
    else { b.widget.ty = 3; b.widget.fa = Math.max(0, Math.min(1, v / 100)); }
  });
  if (add) sangmuLayer(add, (v - 200) / 100);
}
// 빨간 막대(add) 바로 위에 상무 색 막대를 겹친다. frac = 0~1
function sangmuLayer(add, frac) {
  frac = Math.max(0, Math.min(1, frac || 0));
  const par = add.parent; if (!par) return;
  let top = add._sangmu;
  if (!top && frac > 0) {
    top = add._sangmu = buildCustom('Add200', g => drawSangmuBar(g, add, top._f || 0), { d: (add.widget.d || 0) + 0.5 }, par);
  }
  if (top) { top.x = add.x; top.y = add.y; top.sx = add.sx; top.sy = add.sy; top._f = frac; top.setActive(frac > 0 && add.active); }
}
const SANGMU_BAR = {};
function drawSangmuBar(g, src, frac) {
  const w = src.widget; if (!w || !(frac > 0)) return;
  const f = findSprite(null, w.sp); if (!f) return;
  const [x0, y0, ww, hh] = widgetRect(w);
  const k = 3, W = Math.max(2, Math.round(ww * k)), H = Math.max(2, Math.round(hh * k)), t = Stage.t || 0;
  const key = w.sp + W + 'x' + H;
  let c = SANGMU_BAR[key]; if (!c) { c = SANGMU_BAR[key] = document.createElement('canvas'); c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H);
  // 금빛 바탕 (상무 카드 테두리 색) 위에 무지개 홀로그램이 은은하게 흐르고, 빛줄기가 지나간다
  const gold = x.createLinearGradient(0, 0, 0, H);
  gold.addColorStop(0, '#fff3b0'); gold.addColorStop(0.35, '#ffd43a'); gold.addColorStop(0.7, '#f0a400'); gold.addColorStop(1, '#b86e00');
  x.fillStyle = gold; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'overlay';
  const holo = x.createLinearGradient(0, 0, W, 0);
  for (let i = 0; i <= 8; i++) holo.addColorStop(i / 8, `hsla(${(t * 70 + i * 45) % 360},100%,60%,0.55)`);
  x.fillStyle = holo; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'lighter';
  const sw = ((t * 0.6) % 1.5 - 0.25) * W, sg = x.createLinearGradient(sw - H * 2, 0, sw + H * 2, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,250,220,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = sg; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) { const px = (i * 0.27 + t * 0.15) % 1 * W, a = 0.5 + 0.5 * Math.sin(t * 5 + i * 2); x.fillStyle = `rgba(255,255,255,${0.7 * a})`; x.beginPath(); x.arc(px, H * (0.3 + 0.15 * (i % 2)), H * 0.12 * a + 0.5, 0, Math.PI * 2); x.fill(); }
  x.globalCompositeOperation = 'destination-in';                                         // 막대 모양으로 자르기
  x.drawImage(IMG[f[0]], f[1][0], f[1][1], f[1][2], f[1][3], 0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
  g.save(); g.transform(1, 0, 0, -1, 0, 0);
  g.beginPath(); g.rect(x0, -(y0 + hh), ww * frac, hh); g.clip();
  g.drawImage(c, x0, -(y0 + hh), ww, hh);
  g.restore();
}
function myYutStats() { const yi = S.yut || 0; return yutStatsOf({ yut: yi, yutLv: (S.yuts || {})[yi] || 1 }); }
function defaultSave() {
  return { v: 1, name: '나', school: '인생역전 고등학교', coin: 500000, dia: 1000, fp: 300, level: 1, exp: 0,
    nextId: 1, cards: [], equipped: null, sort: 'grade', muted: false, freeChange: 5 };
}
function load() {
  try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { S = null; }
  if (!S || S.v !== 1) {
    S = defaultSave();
    const c = newCard('Taepoong', 1); c.isNew = false; S.cards.push(c); S.equipped = c.id;
  }
  if (S.catchV !== 2) { S.catchV = 2; S.catchSnd = 'voice_catch'; }   // 원작 '요~ 흐어어' 잡기 목소리를 기본으로
  Sound.setMuted(!!S.muted);
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }
const fmt = n => Number(n).toLocaleString('en-US');
const cardById = id => S.cards.find(c => c.id === id);
const collectionScore = () => S.cards.reduce((a, c) => a + [0, 100, 300, 800, 2000, 5000, 12000, 30000][c.cls] + c.lv * 50, 0);

// ---------------------------------------------------------------- generic helpers
const G = { screen: null, root: null, busy: false };
function $(root, name) { const n = root && root.find(name); if (!n) console.warn('missing node', name); return n || new Node({ n: 'dummy', off: 1 }, null); }
function hide(root, ...names) { for (const nm of names) { const n = root.find(nm); if (n) n.setActive(false); } }
function onTap(node, fn) { node.handlers = []; node.onClick(fn); node.disabled = false; return node; }

function setCard(node, card, opt = {}) {
  // node: a node carrying the CardManager layout (Class/Frame/Star/LevelBG/NameGroup/Portrait)
  const ch = CHARS.find(c => c.k === card.ch), g = card.cls, gg = '0' + g;
  const kid = p => node.children.find(c => c.name.startsWith(p));
  const cls = kid('Class'); if (cls) cls.setSprite('Cha_Card_Class_' + gg);
  const frame = kid('Frame');
  if (frame) {
    frame.setSprite('Cha_Card_Frame_' + gg + (g === 1 ? '_3x1_20px' : g <= 4 ? '_3x1' : ''));
    const bg = frame.byPrefix('BG'); if (bg) bg.setSprite('Cha_Card_BG_' + gg);
    const idle = frame.find('IdleEffect');
    if (idle) {
      const want = g >= 6 && !opt.noFx;
      if (want && !idle.active) { idle.setActive(true); idle.playTweens(true); }
      if (!want) idle.setActive(false);
    }
  }
  const star = kid('Star');
  if (star) {
    const n = Math.max(1, Math.ceil(card.lv / 2));
    star.children.forEach(s => { const i = +s.name.replace('Star', ''); s.setActive(i <= n); });
  }
  const lvbg = kid('LevelBG');
  if (lvbg) {
    lvbg.setSprite('Cha_Card_LvBG_' + gg);
    const lab = lvbg.findAll(x => x.widget && x.widget.kind === 'L')[0];
    if (lab) lab.setText(card.lv);
  }
  const ng = kid('NameGroup');
  if (ng) {
    const nmn = ng.find('Name'); nmn.setSprite(ch.nm); fitSprite(nmn);
    ng.find('NameBGL').setSprite('Cha_Card_NameBG_' + gg);
    ng.find('NameBGR').setSprite('Cha_Card_NameBG_' + gg);
    const ni = ng.find('NameIdleEffect');
    if (ni) { const want = g === 7 && !opt.noFx; if (want && !ni.active) { ni.setActive(true); ni.playTweens(true); } if (!want) ni.setActive(false); }
  }
  const por = kid('Portrait'); if (por) por.setSprite(ch.por);
}
function styleLevel(lab) {
  // the original used a small bitmap font; emulate it with an outlined label
  const w = lab.widget; w.fs = 17; w.outline = 'rgba(40,25,10,0.9)'; w.outlineW = 3; w.color = [1, 1, 1, 1];
}

// ---------------------------------------------------------------- screen management
let fader = null;
async function fade(toBlack) {
  if (!fader) {
    fader = build(mkNode('fader', { panel: 900, k: [mkSprite('black', 'Common_scroll_white', { w: 820, h: 500, c: [0, 0, 0, 1], ty: 1, box: [0, 0, 820, 500] })] }));
  }
  Stage.remove(fader); Stage.add(fader);
  const b = fader.children[0];
  await animate(0.22, k => b.setAlpha(toBlack ? k : 1 - k), Ease.linear);
  if (!toBlack) Stage.remove(fader);
}
async function go(screenFn, ...args) {
  if (G.busy) return; G.busy = true;
  try {
    await fade(true);
    if (G.root) Stage.remove(G.root);
    G.root = null;
    if (typeof Yut3D !== 'undefined') Yut3D.reset();
    await screenFn(...args);
    if (fader) { Stage.remove(fader); Stage.add(fader); }
    await fade(false);
  } finally { G.busy = false; }
}
function commonHide(r) {
  for (const n of r.findAll(n => n.comps.some(c => ['SystemPopup', 'InviteToastPopup', 'InviteFriendPanel', 'TicketPurchasePopup', 'BingoPopupPanel', 'FriendPointPanel'].includes(c.cls)))) n.setActive(false);
  hide(r, 'Processing', 'Offer', 'Tutorial1', 'Tutorial2', 'Tutorial3', 'Tutorial4', 'Tutorial5', 'Tutorial6', 'ProcessingSell');
  r.findAll(n => n.name.startsWith('InviteToastPopup') || n.name.startsWith('InviteFriend')).forEach(n => n.setActive(false));
}
function refreshStatBar() {
  const r = G.root; if (!r) return;
  const set = (n, v) => { const x = r.find(n); if (x) x.setText(v); };
  set('Stat_Coin', fmt(S.coin)); set('Stat_Dia', fmt(S.dia)); set('Stat_Friend', fmt(S.fp));
  set('Stat_Level', S.level); set('Stat_LevelRate', Math.floor(S.exp) + '%'); set('Stat_Vitamin_Time', 'MAX');
}

// ---------------------------------------------------------------- toast & popup
async function toast(text, icon) {
  const r = G.root; if (!r) return;
  const t = r.find('GetItemToastPopup');
  if (!t) return;
  t.setActive(true); t.stopTweens();
  const lab = t.find('Contents'); if (lab) { lab.setText(text); lab.widget.fs = 17; lab.widget.ov = 0; lab.widget.w = icon ? 440 : 520; }
  const ic = t.find('Icon');
  if (ic) { if (icon) { ic.setActive(true); ic.setSprite(icon); } else ic.setActive(false); }
  if (lab) lab.x = icon ? 20 : 0;
  const my = (t._tk = (t._tk || 0) + 1);
  const y0 = t.y;
  await animate(0.3 * Math.max(0.2, (y0 - 188) / 95), k => t.y = y0 + (188 - y0) * k, Ease.out);
  await Stage.wait(1.8);
  if (t._tk !== my) return;
  await animate(0.3, k => t.y = 188 + 95 * k, Ease.in);
}
function popup({ title = '알림', text = '', sub = '', ok = 'check', cancel = false, price = null, cur = 'dia' }) {
  return new Promise(resolve => {
    const r = G.root;
    const p = r.findAll(n => n.comps.some(c => c.cls === 'SystemPopup'))[0];
    if (!p) { resolve(window.confirm(text)); return; }
    p.setActive(true);
    const box = p.children.find(c => c.name.startsWith('background box'));
    hide(box, 'Input', 'Contents');
    box.find('Title Txt 5').setText(title);
    const ct = box.find('ContentsTxt 5'); ct.setText(text); ct.y = sub ? 34 : 22;
    const cs = box.find('ContentsTxtSub 5'); cs.setText(sub); cs.setActive(!!sub); cs.y = text.includes('\n') ? -10 : -2;
    if (sub) { cs.widget.color = [0.62, 0.32, 0.08, 1]; cs.widget.fs = 15; }
    const L = box.find('btn_Left 3-4'), R = box.find('btn_right 3-5'), X = box.find('btn_close 3');
    L.setActive(cancel); R.x = cancel ? 73 : 0;
    const txt = R.find('Text 4'), pr = R.find('Price 5'), sym = R.find('Symbol 4');
    if (price != null) {
      pr.setActive(true); sym.setActive(true); pr.setText(fmt(price));
      sym.setSprite(cur === 'coin' ? 'Common_icon_coin_70' : 'Common_icon_dia_70');
      sym.widget.w = 28; sym.widget.h = cur === 'coin' ? 28 : 24;
      txt.setSprite('Popup_txt_button_buy'); txt.x = -42;
      sym.x = -5; sym.widget.w = 22; sym.widget.h = cur === 'coin' ? 22 : 19;
      pr.x = 9; pr.widget.pv = 3; pr.widget.fs = fmt(price).length > 5 ? 17 : 19;
    } else {
      pr.setActive(false); sym.setActive(false);
      txt.setSprite({ check: 'Popup_txt_button_check', yes: 'Popup_txt_button_yes', change: 'Popup_txt_button_change' }[ok] || 'Popup_txt_button_check');
      txt.x = 0;
    }
    R.find('background 3').setSprite(price != null ? 'Popup_btn_buy' : 'Popup_btn_OK');
    const f = txt.widget; const sp = findSprite(f.atlas, f.sp); if (sp) { f.w = sp[1][2] + sp[1][8] + sp[1][9]; f.h = sp[1][3] + sp[1][10] + sp[1][11]; }
    const close = v => { Sound.play(v ? 'UI_Select' : 'UI_Close'); p.setActive(false); resolve(v); };
    onTap(L, () => close(false)); onTap(R, () => close(true)); onTap(X, () => close(false));
    box.playTweens(true, false);
    Sound.play('popup');
  });
}
// 충전: GM은 GM 메뉴, 친구들은 코드를 입력하면 받는다
const GIFT_CODE = '2026';
async function chargeGate(cur) {
  Sound.play('UI_Select');
  if (S.gm) { openGmPanel(); return; }
  if (!cur) cur = await choiceMenu('충전', [{ label: '코인 받기', value: 'coin' }, { label: '크리스탈 받기', value: 'dia' }, { label: '닫기', value: null, sp: 'Popup_btn_cancel' }], '코드를 입력하면 받을 수 있어요');
  if (!cur) return;
  const v = await textPopup(cur === 'coin' ? '코인 충전' : cur === 'dia' ? '크리스탈 충전' : '우정포인트 충전', '코드를 입력하세요', { max: 12, placeholder: '코드' });
  if (v == null || v === '') return;
  if (String(v).trim() !== GIFT_CODE) { Sound.play('UI_Close'); toast('코드가 맞지 않아요'); return; }
  topUp(cur);
}
async function spend(cur, amount) {
  const have = cur === 'coin' ? S.coin : S.dia;
  if (have < amount) {
    const ok = await popup({ title: cur === 'coin' ? '코인 부족' : '크리스탈 부족', text: (cur === 'coin' ? '코인' : '크리스탈') + '이 부족해요.', sub: S.gm ? 'GM 메뉴에서 충전할까요?' : '친구와 게임을 해서 모아 보세요', cancel: S.gm, ok: S.gm ? 'yes' : 'check' });
    if (ok && S.gm) openGmPanel();
    return false;
  }
  if (cur === 'coin') S.coin -= amount; else S.dia -= amount;
  save(); refreshStatBar();
  return true;
}
function topUp(cur) {
  if (cur === 'coin') { S.coin += 300000; toast('코인 300,000개를 받았어요!', 'Common_icon_coin_70'); }
  else if (cur === 'dia') { S.dia += 1000; toast('크리스탈 1,000개를 받았어요!', 'Common_icon_dia_70'); }
  else if (cur === 'fp') { S.fp += 300; toast('우정포인트 300점을 받았어요!', 'Common_icon_social_point'); }
  Sound.play('get_item');
  save(); refreshStatBar();
}

// ---------------------------------------------------------------- global button handlers
const ON = {};
function bindHandlers() {
  const add = (fn, h) => Stage.on(fn, n => { if (!G.busy) h(n); });
  add('OnClickPlusCoin', () => chargeGate('coin'));
  add('OnClickPlusDiamond', () => chargeGate('dia'));
  add('OnClickPlusVitamin', () => { Sound.play('UI_Select'); popup({ title: '비타민', text: '오프라인판에서는 비타민이 무제한이에요!' }); });
  add('OnClickFriendPoint', () => chargeGate('fp'));
  add('ClearMainMenuPanel', () => { });
  for (const [k, v] of Object.entries(ON)) add(k, v);
  Stage.fallback = () => {
    if (G.busy) return;
    Sound.play('UI_Select');
    toast('이 기능은 오프라인판에서 지원하지 않아요');
  };
}

// ---------------------------------------------------------------- TITLE
async function showTitle() {
  const t = instantiate('title', 'Anchor');
  G.root = t; G.screen = 'title'; Stage.add(t);
  hide(t, 'SystemPopup', 'Kakao Login', 'Geust Login', 'Progress Text', 'Progress Bar');
  const touch = $(t, 'TouchScreen'); touch.setActive(false);
  $(t, 'Copyright').setText('2014 COM2US Corp. V.1.4.4');
  const logo = $(t, 'Logo');
  $(logo, 'Com2usSplash').setActive(true);
  const titleGroup = $(t, 'Title'), effect = $(t, 'TitleEffect');
  titleGroup.setActive(false); effect.setActive(false);
  // 인트로 중에도 화면을 누르면 바로 넘어간다 (초대 링크로 들어온 친구가 기다리지 않게)
  let went = false;
  const goOn = () => { if (went || G.root !== t) return; went = true; Sound.unlock(); Sound.play('UI_Select'); Sound.playBgm('title_bgm'); go(showLoading); };
  const skip = build(mkNode('skip', { panel: 90, box: [0, 0, 820, 500] }), t); onTap(skip, goOn);
  await Stage.wait(1.4);
  await animate(0.4, k => logo.setAlpha(1 - k), Ease.linear);
  logo.setActive(false);
  Sound.playBgm('title_bgm');
  titleGroup.setActive(true); effect.setActive(true);
  titleGroup.playTweens(true); effect.playTweens(true);
  await Stage.wait(2.0);
  touch.setActive(true);
  touch.box = [0, 147, 820, 500];
  onTap(touch, goOn);
  if (/[?&]room=/.test(location.search)) {
    const inv = build(mkLabel('invited', '친구 방에 초대받았어요!', { fs: 20, d: 50, p: [0, -112], c: [1, 0.95, 0.5, 1] }), t);
    inv.widget.outline = 'rgba(80,30,0,0.9)'; inv.widget.outlineW = 4;
  }
}
async function showLoading() {
  const r = instantiate('loading', 'Anchor');
  G.root = r; G.screen = 'loading'; Stage.add(r);
  commonHide(r);
  const gauge = r.find('progress_gauge'), pct = r.find('progress_count_label');
  const W0 = gauge.widget.w;
  gauge.widget.w = 0; pct.setText('0%');
  Stage.after(0.25, async () => {
    await animate(1.3, k => { gauge.widget.w = Math.round(W0 * k); gauge.setActive(k > 0.03); pct.setText(Math.round(k * 100) + '%'); }, Ease.inOut);
    await Stage.wait(0.2);
    go(showMain);
  });
}

// ---------------------------------------------------------------- MAIN MENU
async function showMain() {
  const r = instantiate('main', 'Anchor');
  G.root = r; G.screen = 'main'; Stage.add(r);
  commonHide(r);
  hide(r, 'GachaCard (25)', 'ExitPopup', 'MessageBox(13)', 'OpenSEBox(15)', 'Option', 'ImageNoticePopup', 'SpecialInappPopup',
    'Profile_Friend(9)', 'RewardPopup(16)', 'Profile_I_BG(8)', 'RankingEvent(11)', 'MyInfo_Detail', 'ShopEvent', 'RecommendPlay', 'Register School', 'BingoPannel');
  r.findAll(n => n.widget && n.widget.kind === 'L' && /QA v/.test(n.widget.tx)).forEach(n => n.setActive(false));
  Sound.playBgm('title_bgm');
  refreshStatBar();
  setNeon($(r, 'UserName'), S.gm).setText(S.name);
  const sn = $(r, 'SchoolName'); sn.setText(S.school); sn.x = -142; sn.widget.w = 92; sn.widget.ov = 0; sn.widget.pv = 3;
  const yr = r.find('Entrance'); if (yr) yr.find('Year').setText("'14");
  hide(r, 'StatEvent');
  const eq = cardById(S.equipped) || S.cards[0];
  setCard($(r, 'EffectCard'), eq);
  const yn = r.find('YutName'); if (yn) yn.setText(BOARD.yutTable[S.yut || 0].name);
  const yspr = r.find('MyInfo_Basic') && r.find('MyInfo_Basic').find('Yut'); if (yspr) { yspr.setSprite(yutSprite(S.yut || 0)); fitSprite(yspr); }
  const nNew = S.cards.filter(c => c.isNew).length;
  const badge = r.find('CharacterCardNumber_BG');
  if (badge) {
    badge.setActive(nNew > 0);
    const lab = badge.findAll(x => x.widget && x.widget.kind === 'L')[0];
    if (lab) lab.setText(nNew);
  }
  r.findAll(n => n.name === 'MyRanking_GiftNew').forEach(n => n.setActive(false));
  const myr = r.find('MyRanking');
  if (myr) {
    setNeon(myr.find('MyRanking_Name'), S.gm).setText(S.name);
    hide(myr, 'MyRanking_NoScore');
    myr.find('MyRanking_Score').setText(fmt(collectionScore()));
    myr.find('MyRanking_Year').setText("'14");
  }
  const lst = r.find('List(4)'); if (lst) lst.setActive(false);
  setupGmButton(r);
  const msg = r.find('Button_Message'); if (msg) msg.setActive(false);
  Stage.after(0.6, () => { if (G.screen === 'main') checkInviteLink(); });
}
ON.OnClickCharacterCardButton = () => { Sound.play('UI_Select'); go(showCards); };
ON.OnClickCharacterCard = () => { Sound.play('UI_Select'); go(showCards); };
ON.OnClickShopButton = () => { Sound.play('UI_Select'); go(showShop, 'select'); };
ON.OnReleaseOption = async () => {
  Sound.play('UI_Select');
  const fs = !!document.fullscreenElement;
  const v = await choiceMenu('옵션', [
    { label: S.muted ? '소리 켜기' : '소리 끄기', value: 'snd' },
    { label: fs ? '전체 화면 끄기' : '전체 화면', value: 'fs' },
    { label: '닫기', value: null, sp: 'Popup_btn_cancel' },
  ]);
  if (v === 'snd') { S.muted = !S.muted; Sound.setMuted(S.muted); save(); toast(S.muted ? '소리를 껐어요' : '소리를 켰어요'); }
  if (v === 'fs') { try { fs ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch (e) { toast('이 브라우저에서는 전체 화면을 쓸 수 없어요'); } }
};
ON.OnClickChangeNameButton = async () => {
  Sound.play('UI_Select');
  const v = await textPopup('닉네임 변경', '플레이 시 사용할 닉네임을 입력해 주세요', { value: S.name, max: 8 });
  if (v) { S.name = v.slice(0, 8); S.named = true; save(); G.root.find('UserName').setText(S.name); toast('닉네임을 바꿨어요'); }
};
ON.OnClickChangeSchool = async () => {
  Sound.play('UI_Select');
  const v = await textPopup('학교 등록', '학교 이름을 입력하세요', { value: S.school, max: 12 });
  if (v) { S.school = v.slice(0, 12); save(); G.root.find('SchoolName').setText(S.school); }
};

// ---------------------------------------------------------------- SHOP
async function showShop(mode) {
  const r = instantiate('shop', 'Anchor');
  G.root = r; G.screen = 'shop'; Stage.add(r);
  commonHide(r);
  hide(r, 'GachaCard', 'FriendsList', 'FirstPurchasePopup', 'SpecialInappPopup', 'Item 2', 'Gift');
  Sound.playBgm('shop_bgm');
  refreshStatBar();
  hide(r, 'FreeCrystal', 'BtnGift');
  setShopMode(mode || 'select');
  for (const key of Object.keys(TICKETS)) {
    const n = r.find(key); if (n) n.findAll(x => x.name === 'UI_BUTTON_PROBABILITY1').forEach(x => x.setActive(false));
  }
  const prob = r.find('Gacha 2').children.find(c => c.name === 'UI_BUTTON_PROBABILITY1');
  if (prob) onTap(prob, () => { Sound.play('UI_Select'); showOdds(); });
}
function setShopMode(mode) {
  const r = G.root; G.shopMode = mode;
  $(r, 'Selection 2').setActive(mode === 'select');
  $(r, 'Gacha 2').setActive(mode === 'gacha');
  const tt = $(r, 'Title_Text Shop 2'); tt.setSprite(mode === 'gacha' ? 'Shop_txt_character_card' : 'Shop_txt_shop');
  const f = findSprite(tt.widget.atlas, tt.widget.sp); if (f) { tt.widget.w = f[1][2]; tt.widget.h = f[1][3]; }
}
function showOdds() {
  if (S.gm) { openGmPanel(); return; }          // GM은 뽑기 화면에서 바로 확률을 바꿀 수 있다
  const o = getOdds();
  const line = arr => { const t = arr.reduce((a, b) => a + b, 0) || 1; return arr.map((v, i) => v > 0 ? `${CLASS_NAMES[i]} ${Math.round(v / t * 1000) / 10}` : null).filter(Boolean).join(' · '); };
  popup({ title: '대기자 등급별 확률 (%)', text: '일반: ' + line(o.normal), sub: '고급: ' + line(o.premium) });
}
ON.OnReleaseShopCharacter = () => { Sound.play('UI_Select'); setShopMode('gacha'); };
ON.OnReleaseShopCrystal = () => chargeGate('dia');
ON.OnReleaseShopCoin = () => chargeGate('coin');
ON.OnReleaseShopVitamin = () => { Sound.play('UI_Select'); popup({ title: '비타민', text: '오프라인판에서는 비타민이 무제한이에요!' }); };
ON.OnReleaseBack = () => {
  Sound.play('UI_Close');
  if (G.screen === 'shop' && G.shopMode === 'gacha' && !G.shopFromCards) setShopMode('select');
  else { const back = G.backTo === 'cards' ? showCards : showMain; G.backTo = null; G.shopFromCards = false; go(back); }
};
ON.OnReleaseClose = () => { Sound.play('UI_Close'); G.backTo = null; G.shopFromCards = false; go(showMain); };
ON.OnClickClose = () => { Sound.play('UI_Close'); go(showMain); };
ON.OnReleaseItem = async n => {
  if (G.screen !== 'shop') return;
  const tk = TICKETS[n.name]; if (!tk) return;
  Sound.play('UI_Select');
  const ok = await popup({ title: '캐릭터 카드 뽑기', text: tk.name + '을 구매할까요?', sub: '대기자 10명 중 ' + tk.picks + '명을 합격시킬 수 있어요', cancel: true, price: tk.price, cur: tk.cur });
  if (!ok) return;
  if (!(await spend(tk.cur, tk.price))) return;
  Sound.play('Item_Buy01');
  startGacha(tk);
};

// ---------------------------------------------------------------- CARD GACHA
function rollClass(odds) {
  const tot = odds.reduce((a, b) => a + b, 0); let x = Math.random() * tot;
  for (let i = 0; i < odds.length; i++) { x -= odds[i]; if (x < 0) return i + 1; }
  return 1;
}
function rollCandidates(tk) {
  const list = [];
  const odds = ticketOdds(tk);
  for (let i = 0; i < 10; i++) list.push({ ch: CHARS[rnd(CHARS.length)].k, cls: rollClass(odds) });
  return list;
}
const SLOT_NAMES = ['1st Card', '2nd Card', '3rd Card', '4th Card', '5th Card', '6th Card', '7th Card', '8th Card', '9th Card', '10th Card'];
async function startGacha(tk) {
  const r = G.root, P = $(r, 'GachaCard');
  G.gacha = { tk, cands: rollCandidates(tk), picksLeft: tk.picks, phase: 'preview', got: [], anim: true };
  P.setActive(true);
  P.find('BlackScreen 0').widget.color = [0, 0, 0, 0.8];
  const slots = SLOT_NAMES.map(nm => P.find(nm));
  G.gacha.slots = slots;
  slots.forEach((s, i) => {
    s.resetBase(); s.setActive(true); s._picked = false;
    onTap(s, () => pickCard(i));
    s.find('Symbol 10').setActive(false);
    s.find('Background').setActive(false);
    s.find('Card').setActive(true);
    setGachaFace(s, G.gacha.cands[i]);
    tint(s, 1);
    if (s._glow) { s.removeChild(s._glow); s._glow = null; }
  });
  updateGachaUI();
  slots.forEach(s => { s.sx = s.sy = 0; });
  Sound.play('board_setting01');
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    animate(0.25, k => { s.sx = s.sy = s.base.sx * k; }, Ease.back);
    await Stage.wait(0.04);
  }
  await Stage.wait(0.25);
  G.gacha.anim = false;
}
function setGachaFace(slot, c) { setCard(slot.find('Card'), { ch: c.ch, cls: c.cls, lv: 1 }, { noFx: true }); }
function tint(slot, v) { slot.walk(n => { if (n.widget && !(slot._glow && slot._glow.findAll(x => x === n).length)) { n.widget.color[0] = v; n.widget.color[1] = v; n.widget.color[2] = v; } }); }
function fitSprite(node) {
  const w = node.widget; const f = findSprite(w.atlas, w.sp); if (f) { w.w = f[1][2] + f[1][8] + f[1][9]; w.h = f[1][3] + f[1][10] + f[1][11]; }
}
function updateGachaUI() {
  const P = G.root.find('GachaCard'), g = G.gacha;
  const bg = P.find('ButtonGroup 1');
  const rn = P.find('RemainNumber 2'), rt = P.find('RemainNumber_Text 2');
  rt.setText(g.phase === 'preview' ? '합격시킬 수 있는 인원:' : g.phase === 'pick' ? '카드 선택 가능 횟수:' : '합격을 축하합니다!');
  rn.setText(g.phase === 'done' ? '' : (g.phase === 'preview' ? g.tk.picks + '명' : g.picksLeft + '회'));
  rt.x = g.phase === 'done' ? 0 : g.phase === 'preview' ? -22 : -16; rn.x = g.phase === 'preview' ? 82 : 77;
  rt.widget.pv = 4; if (g.phase === 'done') rt.widget.color = [1, 0.9, 0.3, 1]; else rt.widget.color = [1, 1, 1, 1];
  bg.setActive(true);
  const inv = bg.find('Button_Invite 1'), chg = bg.find('Button_Change 1'), st = bg.find('Button_Start 1');
  const chgBg = chg.find('Background'), chgTx = chg.find('Text');
  if (g.phase === 'preview') {
    inv.setActive(true); chg.setActive(true); st.setActive(true);
    inv.find('Label').setText('30');
    const free = S.freeChange > 0;
    chg.find('BuyFree').setActive(free); chg.find('BuyWithCrystal').setActive(!free);
    chg.find('BuyFree').find('Label').setText(S.freeChange + '회');
    if (free) chg.find('Free').playTweens(true, false);
    chgBg.setSprite('Card_Pick_btn_change'); chgTx.setActive(true);
    st.find('Background').setSprite('Card_Pick_btn_start'); st.x = 189;
    onTap(inv, () => changeCandidates('fp'));
    onTap(chg, () => changeCandidates(free ? 'free' : 'dia'));
    onTap(st, () => beginPicking());
  } else if (g.phase === 'pick') {
    inv.setActive(false); st.setActive(false);
    chg.setActive(true); chg.find('BuyFree').setActive(false); chg.find('BuyWithCrystal').setActive(false);
    chgTx.setActive(false); chgBg.setSprite('Card_Pick_btn_auto_select');
    onTap(chg, () => autoPick());
  } else {
    inv.setActive(false); chg.setActive(false);
    st.setActive(true); st.x = 0; st.find('Background').setSprite('Card_Pick_btn_ok');
    onTap(st, () => finishGacha());
  }
  [inv, chg, st].forEach(b => fitSprite(b.find('Background')));
}
async function changeCandidates(how) {
  const g = G.gacha; if (!g || g.phase !== 'preview' || g.anim) return;
  if (how === 'fp') {
    if (S.fp < 30) { Sound.play('UI_Select'); await popup({ title: '우정포인트 부족', text: '우정포인트가 부족해요.', sub: '친구와 게임을 하면 모을 수 있어요' }); return; }
    S.fp -= 30;
  } else if (how === 'free') S.freeChange--;
  else { if (!(await spend('dia', 1))) return; }
  save(); refreshStatBar();
  Sound.play('Card_Move');
  g.anim = true;
  g.cands = rollCandidates(g.tk);
  await Promise.all(g.slots.map((s, i) => flip(s, () => setGachaFace(s, g.cands[i]), i * 0.025)));
  g.anim = false;
  updateGachaUI();
}
function flip(slot, mid, delay = 0) {
  return (async () => {
    if (delay) await Stage.wait(delay);
    const bx = slot.base.sx;
    await animate(0.12, k => slot.sx = bx * (1 - k), Ease.in);
    mid();
    await animate(0.14, k => slot.sx = bx * k, Ease.out);
  })();
}
async function beginPicking() {
  const g = G.gacha; if (!g || g.phase !== 'preview' || g.anim) return;
  g.anim = true;
  Sound.play('UI_Select');
  G.root.find('GachaCard').find('ButtonGroup 1').setActive(false);
  Sound.play('Card_Start01');
  await Promise.all(g.slots.map((s, i) => flip(s, () => { s.find('Background').setActive(true); s.find('Card').setActive(false); }, i * 0.03)));
  await Stage.wait(0.2);
  Sound.play('Card_Start02');
  await Promise.all(g.slots.map(s => { const x0 = s.x, y0 = s.y; return animate(0.3, k => { s.x = x0 * (1 - k); s.y = y0 * (1 - k) + 12 * k; }, Ease.inOut); }));
  for (let i = g.cands.length - 1; i > 0; i--) { const j = rnd(i + 1); [g.cands[i], g.cands[j]] = [g.cands[j], g.cands[i]]; }
  for (let rep = 0; rep < 3; rep++) {
    Sound.play('Card_Move');
    await Promise.all(g.slots.map((s, i) => animate(0.11, k => { s.x = Math.sin(i * 2.1 + rep * 1.7) * 36 * k; s.rot = (i - 4.5) * 2.5 * k * (rep % 2 ? 1 : -1); }, Ease.inOut)));
    await Promise.all(g.slots.map(s => { const x0 = s.x, r0 = s.rot; return animate(0.11, k => { s.x = x0 * (1 - k); s.rot = r0 * (1 - k); }, Ease.inOut); }));
  }
  Sound.play('Card_Move');
  await Promise.all(g.slots.map(s => animate(0.3, k => { s.x = s.base.x * k; s.y = 12 * (1 - k) + s.base.y * k; s.rot = 0; }, Ease.out)));
  g.slots.forEach((s, i) => setGachaFace(s, g.cands[i]));
  g.phase = 'pick'; g.anim = false;
  updateGachaUI();
}
async function pickCard(i) {
  const g = G.gacha; if (!g || g.phase !== 'pick' || g.anim) return;
  const s = g.slots[i]; if (s._picked) return;
  s._picked = true; g.picksLeft--; g.anim = true;
  const c = g.cands[i];
  updateGachaUI();
  Sound.play('Card_Select');
  await animate(0.12, k => { s.sx = s.sy = s.base.sx * (1 + 0.15 * k); }, Ease.out);
  const bx = s.base.sx;
  s.base.sx = bx * 1.15;
  await flip(s, () => { s.find('Background').setActive(false); s.find('Card').setActive(true); });
  s.base.sx = bx;
  if (c.cls >= 4) addGlow(s, c.cls);
  const sym = s.find('Symbol 10'); sym.setActive(true);
  Sound.play(c.cls >= 5 ? 'card_gold01' : c.cls >= 3 ? 'card_silver01' : 'Card_Install');
  await animate(0.25, k => { sym.sx = sym.sy = 2.2 - 1.2 * k; sym.setAlpha(k); s.sx = s.sy = bx * (1.15 - 0.15 * k); }, Ease.out);
  g.got.push(c);
  g.anim = false;
  if (g.picksLeft <= 0) revealRest();
}
function addGlow(slot, cls) {
  const col = cls >= 6 ? [1, 0.75, 0.25, 1] : cls === 5 ? [1, 0.45, 0.85, 1] : [0.45, 0.75, 1, 1];
  const A = 'CharacterCard_Direction_Additive_Atlas';
  const g = new Node(mkNode('glow', { k: [
    mkSprite('halo', 'Card_Frame_01', { atlas: A, w: 178, h: 232, d: 10, c: col }),
    mkSprite('halo2', 'Card_Frame_01', { atlas: A, w: 164, h: 216, d: 10, c: col }),
  ].concat(cls >= 5 ? [mkSprite('tw', 'Card_Twinkle_01', { atlas: A, w: 70, h: 70, d: 31, p: [60, 92] }), mkSprite('tw2', 'Card_Twinkle_01', { atlas: A, w: 46, h: 46, d: 31, p: [-58, -70] })] : []) }), slot);
  slot.children.unshift(g); slot._glow = g;
  let t = 0;
  g.update = dt => {
    t += dt;
    g.children[0].setAlpha(0.45 + 0.35 * Math.sin(t * 5));
    g.children[1].setAlpha(0.6);
    g.children.slice(2).forEach((tw, i) => { tw.rot += dt * (90 + i * 40); const k = 0.7 + 0.4 * Math.abs(Math.sin(t * 3 + i)); tw.sx = tw.sy = k; });
  };
}
async function revealRest() {
  const g = G.gacha; g.anim = true;
  await Stage.wait(0.5);
  const rest = g.slots.filter(s => !s._picked);
  await Promise.all(rest.map((s, i) => flip(s, () => { s.find('Background').setActive(false); s.find('Card').setActive(true); tint(s, 0.42); }, i * 0.05)));
  Sound.play(g.got.some(c => c.cls >= 5) ? 'victory' : 'mission_success');
  g.phase = 'done'; g.anim = false;
  updateGachaUI();
}
async function autoPick() {
  const g = G.gacha; if (!g || g.phase !== 'pick' || g.auto) return;
  g.auto = true;
  while (g.picksLeft > 0 && G.gacha === g) {
    if (g.anim) { await Stage.wait(0.05); continue; }
    const free = g.slots.map((s, i) => [s, i]).filter(([s]) => !s._picked);
    await pickCard(free[rnd(free.length)][1]);
    await Stage.wait(0.15);
  }
}
function finishGacha() {
  const g = G.gacha; if (!g || g.phase !== 'done') return;
  Sound.play('UI_Select');
  const added = g.got.map(c => newCard(c.ch, c.cls));
  S.cards.push(...added); save();
  g.slots.forEach(s => { s._picked = false; if (s._glow) { s.removeChild(s._glow); s._glow = null; } });
  G.root.find('GachaCard').setActive(false);
  G.gacha = null;
  const best = added.reduce((a, c) => c.cls > a.cls ? c : a, added[0]);
  toast(`캐릭터 카드 ${added.length}장 획득! 최고 등급: ${CLASS_NAMES[best.cls - 1]}`, 'Shop_icon_card_thumb_' + (added.length >= 5 ? 5 : added.length >= 3 ? 3 : 1));
  Sound.play('Reward');
}

// ---------------------------------------------------------------- CHARACTER CARDS
async function showCards() {
  const r = instantiate('cards', 'Anchor');
  G.root = r; G.screen = 'cards'; Stage.add(r);
  commonHide(r);
  hide(r, 'Composite', 'SelectCard(5)', 'SellCard', 'ToastPopup', 'Touch', 'Promotion(1)', 'HelpCardAndYutPopup', 'LevelUpStatEffect(5)');
  Sound.playBgm('shop_bgm');
  refreshStatBar();
  const tn = r.find('TabName(30)');
  if (tn) tn.children.forEach(c => c.setActive(c.name.endsWith('_Off') ? c.name !== 'Inven_Off' : c.name === 'Inven_On'));
  const tabs = r.find('Tab(20)');
  if (tabs) tabs.children.forEach(t => {
    const ck = t.find('Checkmark'); if (ck) ck.setActive(t.name === 'InvenTab');
    onTap(t, () => {
      Sound.play('UI_Select');
      if (t.name === 'InvenTab') return setCardsTab('Inven');
      if (t.name === 'PromotionTab') return openPromotion(cardById(G.sel));
      if (G.cardsTab !== 'Inven') setCardsTab('Inven');
      if (t.name === 'SellTab') return sellCard();
      if (t.name === 'UpgradeTab') return levelUp();
      toast('카드 조합은 아직 없어요. 카드 진급 탭에서 같은 직급 카드 2장으로 진급할 수 있어요');
    });
  });
  G.cardsTab = 'Inven';
  const uc = r.find('UseCard(3-5)');
  uc.walk(n => { if (/SellPanel|LevelUpPanel|LevelUpEffect/.test(n.name)) n.setActive(false); });
  uc.findAll(n => n.widget && n.widget.kind === 'L' && /판매할/.test(n.widget.tx)).forEach(n => n.setActive(false));
  hide(uc, 'Tag');
  G.sel = S.equipped;
  buildInven();
  showSelected();
  onTap(uc.find('Manage_Button(41)'), () => levelUp());
  const slot = uc.find('Card_BG(40)'); slot.box = [0, 0, 136, 166];
  onTap(slot, () => {
    const c = cardById(G.sel); if (!c) return;
    const ch = CHARS.find(x => x.k === c.ch);
    Sound.play('UI_Select');
    popup({ title: `${CLASS_NAMES[c.cls - 1]} ${ch.name}`, text: wrapText(ch.pers || `${ch.name} 카드예요.`, 21), sub: `카드레벨 ${c.lv}/10 · 진급하면 더 강해져요` });
  });
}
function wrapText(t, n) {
  const out = []; let line = '';
  for (const word of t.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > n && line) { out.push(line); line = word; } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3).join('\n');
}
function sortedCards() {
  const arr = S.cards.slice();
  if (S.sort === 'grade') arr.sort((a, b) => b.cls - a.cls || b.lv - a.lv || b.t - a.t);
  else arr.sort((a, b) => b.t - a.t);
  arr.sort((a, b) => (b.id === S.equipped) - (a.id === S.equipped));
  return arr;
}
function buildInven() {
  const r = G.root, list = r.find('InvenList(7)'), grid = list.find('Grid');
  if (!G.itemTpl) G.itemTpl = grid.children.find(c => c.name === 'Item').data;
  grid.children = [];
  const cards = sortedCards();
  const CW = 104;
  cards.forEach((c, i) => {
    const it = new Node(JSON.parse(JSON.stringify(G.itemTpl)), grid); grid.children.push(it);
    it.x = i * CW; it.y = 0; it.card = c;
    ['Focus', 'Dimmed', 'Check', 'FocusPromotion'].forEach(nm => it.find(nm).setActive(false));
    setCard(it.find('Card'), c, { noFx: true });
    if (c.isNew) build(mkSprite('new', 'Main_noti_new', { p: [24, 58], d: 168 }), it);
    it.box = [0, -2, 100, 132];
    onTap(it, () => selectCard(c.id));
  });
  const viewW = 648, contentW = cards.length * CW;
  const minX = Math.min(0, viewW - contentW - 8), baseX = grid.base.x;
  G.scroll = { off: 0 };
  list.box = [0, 0, 648, 140];
  list.onDrag = dx => { G.scroll.off = Math.max(minX, Math.min(0, G.scroll.off + dx)); grid.x = baseX + G.scroll.off; };
  grid.x = baseX;
  const cnt = r.find('BG_Stripe(157)'); if (cnt) cnt.find('Label').setText(`${S.cards.length} / 200`);
  const gb = r.find('Grade_Button(154)'), nb = r.find('New_Button');
  if (gb) gb.find('Selection').setActive(S.sort === 'grade');
  if (nb) nb.find('Selection').setActive(S.sort === 'new');
  refreshFocus();
}
function refreshFocus() {
  const grid = G.root.find('InvenList(7)').find('Grid');
  grid.children.forEach(it => { if (it.card) { it.find('Focus').setActive(it.card.id === G.sel); it.find('FocusEquiped').setActive(it.card.id === S.equipped); it.find('FocusPromotion').setActive(false); it.find('Check').setActive(false); } });
}
function showSelected() {
  const r = G.root, c = cardById(G.sel) || cardById(S.equipped);
  if (!c) return;
  const uc = r.find('UseCard(3-5)');
  setCard(uc.find('EffectCard'), c);
  const mb = uc.find('Manage_Button(41)');
  const maxed = c.lv >= 10, top = maxed && c.cls >= 7;
  const bgs = mb.find('Background'), ll = mb.find('LevelUp_Label(43)'), pl = mb.find('Price_Label(44)');
  if (!mb._pl) mb._pl = [pl.x, pl.y];
  bgs.setSprite(top ? 'Card_Shop_btn_levelup_max' : maxed ? 'Card_Shop_btn_promotion' : 'Card_Shop_btn_levelup'); fitSprite(bgs);
  ll.setActive(!maxed); ll.setText('Lv.' + (c.lv + 1));
  pl.setActive(!top); pl.setText(fmt(maxed ? promoCost(c) : levelCost(c)));
  if (!mb._pv) mb._pv = pl.widget.pv;
  [pl.x, pl.y] = maxed ? [12, 0] : mb._pl; pl.widget.pv = maxed ? 3 : mb._pv;
  const info = r.find('CardInfo(1)');
  info.find('Level_Label(30)').setText(`카드레벨 ${c.lv}/10`);
  const inst = info.find('Install_Sprite(1)'); if (inst) inst.setActive(c.id === S.equipped);
  const st = cardStats(c);
  const sp = info.find('StatPoint(30)');
  const ys = myYutStats();
  const yp = info.find('YutPlus(1)');
  for (let i = 1; i <= 6; i++) {
    const add = i <= 5 ? (ys[i - 1] || 0) : 0;
    sp.find('Stat' + i).setText(st[i - 1]);
    setStatBar(info.find(`Stat_${i}_BG`), st[i - 1], add);
    const y = yp && yp.find('Stat' + i); if (y) y.walk(n => { if (n.widget && n.widget.kind === 'L') n.setText('+' + add); });
  }
  const card = uc.find('Card'); if (card) animate(0.2, k => { card.sx = card.sy = 0.9 + 0.1 * k; }, Ease.back);
}
async function selectCard(id) {
  if (G.busy) return;
  const c = cardById(id); if (!c) return;
  if (G.cardsTab === 'Promotion') return promoPick(c);
  Sound.play('Card_Select');
  if (c.isNew) {
    c.isNew = false; save();
    const it = G.root.find('InvenList(7)').find('Grid').children.find(x => x.card && x.card.id === id);
    const nb = it && it.find('new'); if (nb) nb.setActive(false);
  }
  if (G.sel === id && id !== S.equipped) {
    const ch = CHARS.find(x => x.k === c.ch);
    const ok = await popup({ title: '카드 장착', text: `${CLASS_NAMES[c.cls - 1]} ${ch.name} 카드를 장착할까요?`, cancel: true, ok: 'yes' });
    if (ok) { S.equipped = id; save(); Sound.play('Card_Install'); toast(`${ch.name} 카드를 장착했어요`); refreshFocus(); showSelected(); }
    return;
  }
  G.sel = id; refreshFocus(); showSelected();
  if (id !== S.equipped) toast('한 번 더 누르면 이 카드를 장착해요');
}
const SELL_PRICE = [0, 1000, 2000, 4000, 8000, 16000, 32000, 64000];
async function sellCard() {
  const c = cardById(G.sel);
  if (!c) return;
  if (c.id === S.equipped) { toast('장착 중인 카드는 판매할 수 없어요. 판매할 카드를 먼저 선택하세요'); return; }
  const ch = CHARS.find(x => x.k === c.ch);
  const price = SELL_PRICE[c.cls] + (c.lv - 1) * 500;
  const ok = await popup({ title: '캐릭터 카드 판매', text: `${CLASS_NAMES[c.cls - 1]} ${ch.name} 카드를 판매할까요?`, sub: `판매 금액 ${fmt(price)}코인 · 판매한 카드는 사라져요`, cancel: true, ok: 'yes' });
  if (!ok) return;
  S.cards = S.cards.filter(x => x.id !== c.id); S.coin += price; G.sel = S.equipped; save();
  Sound.play('Card_Sell'); toast(`카드를 판매하고 ${fmt(price)}코인을 받았어요`);
  refreshStatBar(); buildInven(); showSelected();
}
const levelCost = c => Math.round(REAL.price[Math.min(c.cls, 5)][c.lv] * Math.pow(1.5, Math.max(0, c.cls - 5)));
const promoCost = c => [0, ...REAL.rankup, 80000, 160000][c.cls] || 0;
// ---------- 카드 진급 (원작 방식): 진급할 카드(Lv.10) + 같은 직급 Lv.10 재료 카드 1장 + 코인
const PROMO = { target: null, mat: null, pick: 'target' };
function setCardsTab(name) {
  const r = G.root; G.cardsTab = name;
  const tn = r.find('TabName(30)');
  if (tn) tn.children.forEach(c => { const [k, on] = c.name.split('_'); c.setActive(on === 'On' ? k === name : k !== name); });
  const tabs = r.find('Tab(20)');
  if (tabs) tabs.children.forEach(t => { const ck = t.find('Checkmark'); if (ck) ck.setActive(t.name === name + 'Tab'); });
  r.find('Promotion(1)').setActive(name === 'Promotion');
  r.find('UseCard(3-5)').setActive(name === 'Inven'); r.find('CardInfo(1)').setActive(name === 'Inven');
  if (name === 'Inven') { refreshFocus(); showSelected(); }
}
function openPromotion(pre) {
  PROMO.target = null; PROMO.mat = null; PROMO.pick = 'target';
  setCardsTab('Promotion');
  if (pre && pre.lv >= 10 && pre.cls < 7 && !pre.cst) { PROMO.target = pre.id; PROMO.pick = 'mat'; }
  renderPromotion();
  toast(PROMO.target ? '아래에서 재료 카드를 선택하세요 (같은 직급 Lv.10)' : '아래에서 진급할 카드를 선택하세요 (Lv.10)');
}
function promoPick(c) {
  const ch = CHARS.find(x => x.k === c.ch);
  Sound.play('Card_Select');
  if (c.cst) return toast('GM이 만든 카드는 진급에 쓸 수 없어요');
  if (PROMO.pick === 'target' || !PROMO.target) {
    if (c.cls >= 7) return toast('상무는 최고 직급이에요!');
    if (c.lv < 10) return toast(`카드레벨 10이 되어야 진급할 수 있어요 (지금 ${c.lv})`);
    PROMO.target = c.id; PROMO.mat = null; PROMO.pick = 'mat';
  } else {
    const t = cardById(PROMO.target);
    if (c.id === PROMO.target) return toast('진급할 카드와 다른 카드를 재료로 골라 주세요');
    if (c.cls !== t.cls) return toast(`재료는 같은 직급(${CLASS_NAMES[t.cls - 1]}) 카드만 돼요`);
    if (c.lv < 10) return toast('재료 카드도 카드레벨 10이어야 해요');
    if (c.id === S.equipped) return toast('장착 중인 카드는 재료로 쓸 수 없어요');
    PROMO.mat = c.id;
  }
  renderPromotion();
}
function renderPromotion() {
  const r = G.root, P = r.find('Promotion(1)');
  hide(P, 'Effect');
  const t = cardById(PROMO.target), m = cardById(PROMO.mat);
  // focus marks in the inventory
  const grid = r.find('InvenList(7)').find('Grid');
  grid.children.forEach(it => { if (it.card) { it.find('Focus').setActive(false); it.find('FocusPromotion').setActive(it.card.id === PROMO.target); it.find('Check').setActive(it.card.id === PROMO.mat); it.find('FocusEquiped').setActive(it.card.id === S.equipped); } });
  // left: card to promote
  const sc = P.find('BG_SelectCard(0)');
  const scCard = sc.find('Card'); scCard.setActive(!!t); if (t) setCard(scCard, t, { noFx: true });
  sc.find('SelectInfo_Label(10)').setActive(!t);
  sc.find('SelectCard_Focus').setActive(PROMO.pick === 'target');
  sc.box = [0, 0, 128, 166]; onTap(sc, () => { Sound.play('UI_Select'); PROMO.pick = 'target'; PROMO.mat = null; renderPromotion(); toast('아래에서 진급할 카드를 선택하세요 (Lv.10)'); });
  // middle: stats now → after
  const fr = P.find('BG_Frame(0)');
  const cur = t ? cardStats(t) : [0, 0, 0, 0, 0, 0], nxt = t ? cardStats({ ch: t.ch, cls: t.cls + 1, lv: 1 }) : cur;
  fr.find('Current_Label(10)').setText(t ? CLASS_NAMES[t.cls - 1] : '-'); fr.find('Next_Label(10)').setText(t ? CLASS_NAMES[t.cls] : '-');
  const cv = fr.find('ChangeValue'), spn = fr.find('StatPoint(10)'), sb = fr.find('StatBar(1)');
  for (let i = 1; i <= 6; i++) {
    const d = nxt[i - 1] - cur[i - 1];
    spn.find('Stat' + i).setText(t ? nxt[i - 1] : '-');
    setStatBar(sb.find(`Stat_${i}_BG`), t ? nxt[i - 1] : 0);
    const ar = cv.find(i + '_Arrow'), va = cv.find(i + '_Value');
    ar.setActive(!!t && d > 0); va.setActive(!!t && d !== 0); va.setText((d > 0 ? '' : '') + d);
  }
  // right: material card + promote button
  const bm = P.find('BG_Material(0)');
  const exe = bm.find('ExePromotion(1)'), sel = bm.find('SelectMaterial(1)');
  exe.setActive(!!(t && m)); sel.setActive(!(t && m));
  bm.find('Material_Focus').setActive(!!t && PROMO.pick === 'mat' && !m);
  const sbtn = sel.find('SelectMaterial_Button(1)');
  sbtn.setActive(false);
  sel.find('SelectMaterialInfo_Label(10)').setText(t ? `아래에서 재료 카드를 선택\n[${CLASS_NAMES[t.cls - 1]} · LV.10]` : '진급할 카드와 동일한 직급\n[LV.10]만 선택');
  if (t && m) {
    setCard(exe.find('Card'), m, { noFx: true });
    const pb = exe.find('Promotion_Button'); hide(pb, 'Tag');
    pb.find('Price(10)').setText(fmt(promoCost(t)));
    pb.box = [0, 0, 164, 46]; onTap(pb, () => doPromotion());
    const cb = exe.find('Card_BG'); cb.box = [0, 0, 88, 114]; onTap(cb, () => { Sound.play('UI_Select'); PROMO.mat = null; PROMO.pick = 'mat'; renderPromotion(); });
  }
  const rb = P.find('ResetButton'); if (rb) { rb.setActive(!!t); rb.box = [0, 0, 40, 40]; onTap(rb, () => { Sound.play('UI_Close'); PROMO.target = PROMO.mat = null; PROMO.pick = 'target'; renderPromotion(); }); }
}
async function doPromotion() {
  const t = cardById(PROMO.target), m = cardById(PROMO.mat); if (!t || !m || G.busy) return;
  Sound.play('UI_Select');
  const ok = await popup({ title: '카드 진급', text: `${CLASS_NAMES[t.cls - 1]} → ${CLASS_NAMES[t.cls]} 진급할까요?`, sub: '재료 카드는 사라지고, 카드 레벨은 1로 돌아가요', cancel: true, price: promoCost(t), cur: 'coin' });
  if (!ok || !(await spend('coin', promoCost(t)))) return;
  G.busy = true;
  S.cards = S.cards.filter(x => x.id !== m.id);
  t.cls++; t.lv = 1; t.isNew = false; G.sel = t.id; save();
  Sound.play('Card_Promotion');
  PROMO.target = PROMO.mat = null; PROMO.pick = 'target';
  buildInven(); renderPromotion();
  // show the promoted card in the left slot while celebrating
  const scCard = G.root.find('Promotion(1)').find('BG_SelectCard(0)').find('Card'); scCard.setActive(true); setCard(scCard, t);
  G.root.find('Promotion(1)').find('SelectInfo_Label(10)').setActive(false);
  await celebrate('Card_Shop_txt_celebrate_promotion');
  G.busy = false;
  toast(`${CLASS_NAMES[t.cls - 1]}(으)로 진급했어요!`);
  renderPromotion();
}
async function celebrate(sprite) {
  const r = G.root;
  const n = build(mkNode('celebrate', { panel: 150, k: [mkSprite('t', sprite, { d: 1 })] }), r);
  const t = n.children[0];
  await animate(0.35, k => { t.sx = t.sy = 2.5 - 1.5 * k; t.setAlpha(k); }, Ease.back);
  await Stage.wait(0.8);
  await animate(0.3, k => { t.setAlpha(1 - k); t.y = 20 * k; }, Ease.in);
  r.removeChild(n);
}
async function levelUp() {
  const c = cardById(G.sel); if (!c) return;
  if (c.cst) { Sound.play('UI_Select'); toast('GM이 만든 카드는 능력치가 고정이라 강화할 수 없어요'); return; }
  if (c.lv >= 10) { Sound.play('UI_Select'); if (c.cls >= 7) return toast('상무는 최고 직급이에요!'); return openPromotion(c); }
  Sound.play('UI_Select');
  const ok = await popup({ title: '카드 레벨업', text: `카드 레벨을 ${c.lv + 1}로 올릴까요?`, cancel: true, price: levelCost(c), cur: 'coin' });
  if (!ok || !(await spend('coin', levelCost(c)))) return;
  c.lv++; save();
  Sound.play('Card_LevelUp');
  showSelected();
  const it = G.root.find('InvenList(7)').find('Grid').children.find(x => x.card && x.card.id === c.id);
  if (it) setCard(it.find('Card'), c, { noFx: true });
  toast(`카드 레벨 ${c.lv} 달성!`);
}
ON.OnReleaseGradeOrder = () => { Sound.play('UI_Select'); S.sort = 'grade'; save(); buildInven(); };
ON.OnReleaseDateOrder = () => { Sound.play('UI_Select'); S.sort = 'new'; save(); buildInven(); };
ON.OnReleaseAddCard = () => { Sound.play('UI_Select'); G.backTo = 'cards'; G.shopFromCards = true; go(showShop, 'gacha'); };
ON.OnReleaseHelp = () => {
  Sound.play('UI_Select');
  popup({ title: '도움말', text: '카드를 누르면 정보를 볼 수 있고,\n한 번 더 누르면 장착해요.', sub: '레벨업 버튼으로 카드를 키울 수 있어요' });
};

// ---------------------------------------------------------------- boot
(async function boot() {
  await loadAssets();
  await Sound.init();
  load();
  bindHandlers();
  document.getElementById('boot').remove();
  Stage.init(document.getElementById('c'));
  const h = location.hash;
  if (h.startsWith('#dbg=')) {
    const [sc, path] = decodeURIComponent(h.slice(5)).split(':');
    window.__dbg = Stage.add(instantiate(sc, path || undefined)); return;
  }
  if (h === '#main') { await showMain(); return; }
  if (h === '#shop') { await showShop('gacha'); return; }
  if (h === '#cards') { await showCards(); return; }
  if (h === '#solo') { await showMain(); createRoom(true); return; }
  showTitle();
})();
