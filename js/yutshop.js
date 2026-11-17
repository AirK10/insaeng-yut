'use strict';
// ======================================================================
//  윷 상점 — APK 데이터(yut_shop_table / yut_table)의 윷 10종
// ======================================================================
const YUT_SPRITE = [1, 2, 10, 13, 9, 7, 11, 15, 12, 17, 20];  // 기본·밤나무·편백·월넛·명품·지하철·블랙·바게트·레인보우·유성·파라오
// 파라오 윷: APK에 3D 모델과 아이콘은 들어 있지만 상점 표(yut_shop_table)에는 없어서, 유성 윷보다 한 단계 위로 추가
(function addPharaohYut() {
  if (BOARD.yutTable.some(y => y.id === 60021)) return;
  BOARD.yutTable.push({ name: '파라오 윷', id: 60021, price: 150000, unlock: 45, desc: '' });
  const rows = []; let price = 0;
  for (let lv = 1; lv <= 10; lv++) {
    const k = lv / 10, r = v => Math.max(1, Math.round(v * k));
    rows.push([r(10), r(22), 0, r(22), r(22), 0, r(10), 0, price]);
    price = lv === 1 ? 7000 : Math.round(price * 1.5 / 100) * 100;
  }
  rows.forEach((row, i) => { row[8] = i === 0 ? 0 : Math.round(7000 * Math.pow(1.5, i - 1) / 100) * 100; });
  BOARD.yutLevels.push(rows);
})();
const YUT_ABIL = ['코인 추가 획득', '분노모드 윷·모 확률', '패배 시 손해 감소', '윷 확률 증가', '모 확률 증가', '승리 보너스', '낙 확률 감소', '스페셜박스 확률'];
const yutSprite = i => 'Yut' + YUT_SPRITE[i];
function yutPrice(i) { const y = BOARD.yutTable[i]; return i === 4 ? 30000 : y.price; }
function yutOwned(i) { S.yuts = S.yuts || { 0: 1 }; return S.yuts[i] || 0; }
function yutLevelRow(i, lv) { const L = BOARD.yutLevels[i]; return L[Math.max(0, Math.min(L.length - 1, lv - 1))]; }

async function showYutShop() {
  const r = instantiate('yut', 'Anchor');
  G.root = r; G.screen = 'yut'; Stage.add(r);
  commonHide(r);
  hide(r, 'HelpCardAndYutPopup', 'Offer', 'Tutorial1');
  Sound.playBgm('shop_bgm');
  refreshStatBar();
  S.yuts = S.yuts || { 0: 1 }; S.yut = S.yut || 0;
  G.ysel = S.yut;
  buildYutList();
  showYutInfo();
  onTap(r.find('Buy_Button(24)'), () => buyYut());
  onTap(r.find('Upgrade_Button(24)'), () => upgradeYut());
  const help = r.find('Button_Help(35)'); if (help) onTap(help, () => { Sound.play('UI_Select'); popup({ title: '윷 상점', text: '윷을 누르면 정보를 보고, 가진 윷은\n한 번 더 누르면 장착해요.', sub: '장착한 윷의 능력은 게임에서 적용돼요' }); });
}
function buildYutList() {
  const r = G.root, list = r.find('List(1)'), grid = list.find('Grid');
  if (!G.yutTpl) G.yutTpl = grid.children.find(c => c.name === 'Item').data;
  grid.children = [];
  const CW = 148;
  BOARD.yutTable.forEach((y, i) => {
    const it = new Node(JSON.parse(JSON.stringify(G.yutTpl)), grid); grid.children.push(it);
    it.x = i * CW; it.yi = i;
    it.find('Name').setText(y.name);
    const ys = it.find('Yut'); ys.setSprite(yutSprite(i)); fitSprite(ys);
    hide(it, 'Invite');
    const lv = yutOwned(i);
    const sym = it.find('Symbol'), val = it.find('Value');
    if (lv) { sym.setActive(false); val.setText(i === S.yut ? '장착중' : `Lv.${lv}`); val.x = 0; val.widget.pv = 4; val.widget.color = i === S.yut ? [1, 0.85, 0.2, 1] : [1, 1, 1, 1]; }
    else { sym.setActive(true); val.setText(fmt(yutPrice(i))); }
    it.find('Focus').setActive(i === G.ysel);
    it.box = [0, 0, 138, 132];
    onTap(it, () => selectYut(i));
  });
  const minX = Math.min(0, 760 - BOARD.yutTable.length * CW), baseX = grid.base.x;
  let off = G.yutScroll || 0; grid.x = baseX + off;
  list.box = [0, 0, 800, 140];
  list.onDrag = dx => { off = Math.max(minX, Math.min(0, off + dx)); G.yutScroll = off; grid.x = baseX + off; };
}
function selectYut(i) {
  Sound.play('Card_Select');
  if (G.ysel === i && yutOwned(i) && S.yut !== i) {
    S.yut = i; save(); Sound.play('Card_Install'); toast(`${BOARD.yutTable[i].name}을(를) 장착했어요`);
  }
  G.ysel = i; buildYutList(); showYutInfo();
}
function showYutInfo() {
  const r = G.root, i = G.ysel, y = BOARD.yutTable[i], lv = yutOwned(i);
  const info = r.find('Info(3)');
  const sf = info.find('SelectYutFrame(23)');
  hide(sf, 'LevelUpEffect');
  const ys = sf.find('Yut'); ys.setSprite(yutSprite(i)); fitSprite(ys);
  // 3D 미리보기 (원작 모델). WebGL을 못 쓰면 그림 아이콘 그대로
  if (Yut3D.available) {
    if (!r.find('yut3dPreview')) {
      const pv = build(mkNode('yut3dPreview', { panel: 40 }), r);
      const lay = buildCustom('draw', g => Yut3D.draw(g), { d: 1 }, pv); lay.update = dt => Yut3D.update(dt);
    }
    const place = () => { if (G.screen !== 'yut' || !sf.world) return; ys.setActive(false); Yut3D.preview({ skin: G.ysel, center: [sf.world[4], sf.world[5] - 2], scale: 0.4 }); };
    if (sf.world) place(); else Stage.after(0.05, place);
  }
  sf.find('BuyNeed').setActive(!lv);
  const lvg = sf.find('Level');
  lvg.setActive(!!lv);
  if (lv) { lvg.find('Level_Label').setText(`${lv}/10`); lvg.find('Level_ProgressBar(31)').widget.fa = lv / 10; }
  let lvLab = sf.find('lvLab');
  if (!lvLab) lvLab = build(mkLabel('lvLab', '', { fs: 14, d: 12, p: [0, -24], c: [0.45, 0.25, 0.05, 1] }), sf);
  lvLab.setText(lv ? (i === S.yut ? '장착중' : '보유') : '');
  const st = info.find('Stat Frame');
  st.find('Name').setText(y.name);
  const bi = st.find('BuyInfo_Text');
  bi.setText(lv ? (lv >= 10 ? '최고 레벨이에요!' : `다음 레벨 업그레이드 ${fmt(yutLevelRow(i, lv + 1)[8])}코인`) : (i === 4 ? `원래는 친구초대 전용 · ${fmt(yutPrice(i))}코인` : y.unlock > 1 ? `원래는 ${y.unlock}레벨 해금 · ${fmt(y.price)}코인` : `${fmt(y.price)}코인으로 구매`));
  // abilities (non-zero at max level)
  const maxRow = yutLevelRow(i, 10), curRow = yutLevelRow(i, Math.max(1, lv));
  const abil = YUT_ABIL.map((n, k) => ({ n, k, max: maxRow[k], cur: lv ? curRow[k] : 0 })).filter(a => a.max > 0).slice(0, 5);
  for (let s = 1; s <= 5; s++) {
    const a = abil[s - 1];
    const txt = st.find('StatText(25)').find('Stat' + s), pct = st.find('StatPercent').find('Stat' + s), pts = st.find(`StatPoint${s}(${25 + s})`);
    txt.setText(a ? a.n : '능력치 없음'); txt.widget.color = a ? [1, 1, 1, 1] : [0.6, 0.5, 0.4, 1];
    pct.setText(a ? `${a.cur}/${a.max}%` : '');
    if (pts) pts.children.forEach((g, gi) => { const on = a && gi < Math.round(a.cur / a.max * 20); g.setSprite(on ? 'YUT_Shop_frame_stat_gauge' : 'YUT_Shop_frame_stat_slot'); });
  }
  // explanation
  const ex = info.find('Advice Frame'); const lab = ex && ex.find('Label');
  if (lab) { lab.setText(abil.map(a => `· ${a.n} 최대 ${a.max}%`).join('\n') + (y.desc ? '\n· ' + y.desc : '')); lab.widget.pv = 0; }
  // buttons
  const buy = info.find('Buy_Button(24)'), up = info.find('Upgrade_Button(24)');
  buy.setActive(!lv); up.setActive(!!lv);
  if (!lv) { buy.find('Value').setText(fmt(yutPrice(i))); hide(buy, 'Tag'); }
  else {
    up.find('Level').setText(Math.min(10, lv + 1));
    up.find('Price').setText(lv >= 10 ? 'MAX' : fmt(yutLevelRow(i, lv + 1)[8]));
    hide(up, 'Tag');
  }
}
async function buyYut() {
  const i = G.ysel, y = BOARD.yutTable[i];
  if (yutOwned(i)) return;
  Sound.play('UI_Select');
  const ok = await popup({ title: '윷 구매', text: `${y.name}을 구매할까요?`, cancel: true, price: yutPrice(i), cur: 'coin' });
  if (!ok || !(await spend('coin', yutPrice(i)))) return;
  S.yuts[i] = 1; S.yut = i; save();
  Sound.play('Item_Buy01'); toast(`${y.name}을(를) 구매하고 장착했어요`);
  buildYutList(); showYutInfo();
}
async function upgradeYut() {
  const i = G.ysel, lv = yutOwned(i); if (!lv) return;
  if (lv >= 10) { Sound.play('UI_Select'); toast('이미 최고 레벨이에요'); return; }
  const price = yutLevelRow(i, lv + 1)[8];
  Sound.play('UI_Select');
  const ok = await popup({ title: '윷 업그레이드', text: `${BOARD.yutTable[i].name}을 ${lv + 1}레벨로 올릴까요?`, cancel: true, price, cur: 'coin' });
  if (!ok || !(await spend('coin', price))) return;
  S.yuts[i] = lv + 1; save();
  Sound.play('Yut_LevelUp');
  const fx = G.root.find('LevelUpEffect'); if (fx) { fx.setActive(true); fx.playTweens(true); Stage.after(1.2, () => fx.setActive(false)); }
  buildYutList(); showYutInfo();
  toast(`업그레이드 완료! Lv.${lv + 1}`);
}
ON.OnClickYutButton = () => { Sound.play('UI_Select'); go(showYutShop); };
ON.OnClickChangeYutButton = () => { Sound.play('UI_Select'); go(showYutShop); };
