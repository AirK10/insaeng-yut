'use strict';
// ======================================================================
//  GM 로그인 / GM 패널
//  (주의: 브라우저 안에서만 확인하는 간단한 잠금이라 코드를 고치면 우회할 수 있어요.
//   친구끼리 쓰는 비공개 게임용입니다.)
// ======================================================================
const GM_HASH = 'd54b488342725b6418f46dd6d3ab74c0ec25885a68d192dca2f0049317b79608'; // sha256('insaeng-yut|<id>|<pw>')

function sha256(ascii) {
  const rr = (v, a) => (v >>> a) | (v << (32 - a));
  const maxWord = Math.pow(2, 32); let result = '';
  const words = []; const len = ascii.length * 8;
  const hash = [], k = []; let primeCounter = 0; const isComposite = {};
  for (let c = 2; primeCounter < 64; c++) {
    if (!isComposite[c]) {
      for (let i = 0; i < 313; i += c) isComposite[i] = c;
      hash[primeCounter] = (Math.pow(c, .5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
    }
  }
  const bytes = unescape(encodeURIComponent(ascii)); ascii = bytes + '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
  const bl = bytes.length * 8;
  words[words.length] = ((bl / maxWord) | 0); words[words.length] = (bl | 0);
  let H = hash.slice(0, 8);
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16); const old = H;
    H = H.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = H[0], e = H[4];
      const t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ ((~e) & H[6])) + k[i] +
        (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
      H = [(t1 + t2) | 0].concat(H); H[4] = (H[4] + t1) | 0; H.pop();
    }
    for (let i = 0; i < 8; i++) H[i] = (H[i] + old[i]) | 0;
  }
  for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (H[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
  return result;
}

// ---------- DOM overlay helpers (text input over the canvas) ----------
function stageToPage(x, y) {
  const r = Stage.canvas.getBoundingClientRect();
  return [r.left + (x + W / 2) / W * r.width, r.top + (H / 2 - y) / H * r.height, r.width / W];
}
function overlayInput(x, y, w, h, opt = {}) {
  const el = document.createElement('input');
  el.type = opt.type || 'text'; el.placeholder = opt.placeholder || ''; el.value = opt.value || '';
  el.autocomplete = 'off'; el.spellcheck = false; el.maxLength = opt.max || 20;
  const place = () => {
    const [px, py, k] = stageToPage(x, y);
    Object.assign(el.style, { position: 'fixed', left: (px - w / 2 * k) + 'px', top: (py - h / 2 * k) + 'px', width: (w * k) + 'px', height: (h * k) + 'px',
      font: `${Math.round(16 * k)}px KoPub, sans-serif`, border: 'none', background: 'transparent', color: '#5a3410', textAlign: 'center', outline: 'none', zIndex: 10 });
  };
  place(); window.addEventListener('resize', place);
  el._cleanup = () => { window.removeEventListener('resize', place); el.remove(); };
  document.body.appendChild(el);
  return el;
}

// ---------- login popup ----------
function loginPopup() {
  return new Promise(resolve => {
    const r = G.root;
    const p = r.findAll(n => n.comps.some(c => c.cls === 'SystemPopup'))[0];
    p.setActive(true);
    const box = p.children.find(c => c.name.startsWith('background box'));
    hide(box, 'Contents', 'ContentsTxtSub 5');
    box.find('Title Txt 5').setText('로그인');
    const ct = box.find('ContentsTxt 5'); ct.setText(''); ct.setActive(false);
    const inp = box.find('Input'); inp.setActive(true); inp.y = 44; inp.find('Label').setText('');
    let inp2 = box.find('Input2');
    if (!inp2) { inp2 = new Node(JSON.parse(JSON.stringify(inp.data)), box); inp2.name = 'Input2'; box.children.push(inp2); }
    inp2.setActive(true); inp2.y = 2; inp2.x = inp.x; inp2.find('Label').setText('');
    let cap = box.find('loginCaption');
    if (!cap) cap = build(mkLabel('loginCaption', '', { fs: 14, d: 6, p: [0, -26], c: [0.62, 0.32, 0.08, 1] }), box);
    cap.setText('GM 계정으로 로그인하면 GM 메뉴가 열려요');
    const L = box.find('btn_Left 3-4'), R = box.find('btn_right 3-5'), X = box.find('btn_close 3');
    L.setActive(true); R.x = 73;
    R.find('Price 5').setActive(false); R.find('Symbol 4').setActive(false);
    const txt = R.find('Text 4'); txt.setSprite('Popup_txt_button_check'); txt.x = 0; fitSprite(txt);
    R.find('background 3').setSprite('Popup_btn_OK');
    box.playTweens(true, false); Sound.play('popup');
    // DOM inputs placed over the two input frames (box is at y=-3)
    let id, pw;
    Stage.after(0.25, () => {
      id = overlayInput(inp.x, box.y + inp.y, 300, 30, { placeholder: '아이디' });
      pw = overlayInput(inp.x, box.y + inp2.y, 300, 30, { type: 'password', placeholder: '비밀번호' });
      id.focus();
      pw.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      id.addEventListener('keydown', e => { if (e.key === 'Enter') pw.focus(); });
    });
    const close = v => {
      if (id) id._cleanup(); if (pw) pw._cleanup();
      inp2.setActive(false); cap.setActive(false); inp.setActive(false); ct.setActive(true);
      p.setActive(false); resolve(v);
    };
    const submit = () => {
      if (!id) return;
      const ok = sha256(`insaeng-yut|${id.value.trim()}|${pw.value}`) === GM_HASH;
      if (ok) { Sound.play('mission_success'); close(true); }
      else { Sound.play('UI_Close'); cap.setText('아이디 또는 비밀번호가 맞지 않아요'); cap.widget.color = [0.85, 0.1, 0.1, 1]; pw.value = ''; pw.focus(); }
    };
    onTap(L, () => { Sound.play('UI_Close'); close(false); });
    onTap(X, () => { Sound.play('UI_Close'); close(false); });
    onTap(R, submit);
  });
}

// ---------- GM button on the main menu (replaces 인생역전빙고) ----------
function setupGmButton(r) {
  const btn = r.find('Button_Bingo'); if (!btn) return;
  btn.comps = btn.comps.filter(c => c.t !== 'BM' && c.t !== 'IB');
  const bg = btn.find('Background');
  hide(btn, 'Sprite', 'BingoCardNumber_BG');
  bg.setSprite(S.gm ? 'Popup_btn_buy' : 'Popup_btn_cancel'); bg.widget.ty = 1; bg.widget.w = 92; bg.widget.h = 40;
  let lab = btn.find('gmLabel');
  if (!lab) lab = build(mkLabel('gmLabel', '', { fs: 18, d: 12, p: [0, 1], c: [1, 1, 1, 1] }), btn);
  lab.setText(S.gm ? 'GM' : '로그인');
  lab.widget.outline = S.gm ? 'rgba(150,60,0,0.9)' : 'rgba(60,60,60,0.9)'; lab.widget.outlineW = 3;
  btn.box = [0, 0, 92, 44];
  onTap(btn, async () => {
    if (G.busy) return;
    Sound.play('UI_Select');
    if (S.gm) { openGmPanel(); return; }
    const ok = await loginPopup();
    if (ok) { S.gm = true; save(); setupGmButton(r); const un = r.find('UserName'); if (un) setNeon(un, true); toast('GM으로 로그인했어요. GM 버튼을 눌러 보세요!'); }
  });
}

// ---------- GM panel (HTML overlay styled like the game popups) ----------
function openGmPanel() {
  if (document.getElementById('gm')) return;
  const wrap = document.createElement('div'); wrap.id = 'gm';
  const odds = getOdds();
  const row = (key, label) => `<tr><th>${label}</th>${odds[key].map((v, i) => `<td><input data-k="${key}" data-i="${i}" type="number" min="0" step="0.1" value="${v}"></td>`).join('')}<td class="sum" data-sum="${key}"></td></tr>`;
  wrap.innerHTML = `
  <div class="gm-box">
    <div class="gm-title">GM 메뉴</div>
    <div class="gm-x" data-act="close">✕</div>
    <div class="gm-sec">
      <h3>캐릭터 카드 뽑기 확률 (대기자 1명당, %)</h3>
      <table><tr><th></th>${CLASS_NAMES.map(c => `<th>${c}</th>`).join('')}<th>합계</th></tr>
      ${row('normal', '일반 뽑기권')}${row('premium', '고급 뽑기권')}</table>
      <div class="gm-row"><button data-act="odds-save">확률 저장</button><button data-act="odds-reset" class="gray">기본값으로</button></div>
    </div>
    <div class="gm-sec">
      <h3>재화 충전</h3>
      <div class="gm-row"><span>코인</span><input id="gm-coin" type="number" value="1000000"><button data-act="coin">충전</button>
      <span>크리스탈</span><input id="gm-dia" type="number" value="10000"><button data-act="dia">충전</button></div>
      <div class="gm-row"><span>우정포인트</span><input id="gm-fp" type="number" value="1000"><button data-act="fp">충전</button>
      <button data-act="reset-cur" class="gray">재화 0으로</button></div>
    </div>
    <div class="gm-sec">
      <h3>카드 만들기 (능력치 직접 조정 가능)</h3>
      <div class="gm-row"><select id="gm-ch">${CHARS.map(c => `<option value="${c.k}">${c.name}</option>`).join('')}</select>
      <select id="gm-cls">${CLASS_NAMES.map((c, i) => `<option value="${i + 1}">${c}</option>`).join('')}</select>
      <span>레벨</span><input id="gm-lv" type="number" min="1" max="10" value="1" style="width:50px">
      <button data-act="card">만들기</button><button data-act="card-fill" class="gray">기본 능력치로</button></div>
      <div class="gm-stats">${['코인 획득 증가', '분노모드 강화', '패배시 승점 방어', '윷 확률 증가', '모 확률 증가', '윷 컨트롤 강화'].map((n, i) => `<label>${n}<input class="gm-st" data-st="${i}" type="number" min="0" max="999" value="0"></label>`).join('')}</div>
      <div class="gm-hint">능력치는 상대값이에요. 100을 넘겨도(막대가 빨갛게 덮여요) 확정이 되지는 않아요. 숫자를 바꾸지 않으면 원래 능력치 카드로 만들어요.</div>
    </div>
    <div class="gm-sec">
      <h3>말 잡는 소리</h3>
      <div class="gm-row"><select id="gm-snd">${CATCH_SOUNDS.map((s, i) => `<option value="${s}"${s === catchSound() ? ' selected' : ''}>${s === 'voice_catch' ? '원작 목소리 (요~ 흐어어)' : '소리 ' + (i + 1) + ' (' + s + ')'}</option>`).join('')}</select>
      <button data-act="snd-play" class="gray">들어 보기</button><button data-act="snd-save">이 소리로</button></div>
    </div>
    <div class="gm-row gm-foot"><span id="gm-msg"></span><button data-act="logout" class="gray">GM 로그아웃</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const msg = t => { const m = wrap.querySelector('#gm-msg'); m.textContent = t; };
  const sums = () => ['normal', 'premium'].forEach(k => {
    const s = [...wrap.querySelectorAll(`input[data-k="${k}"]`)].reduce((a, e) => a + (+e.value || 0), 0);
    const el = wrap.querySelector(`[data-sum="${k}"]`); el.textContent = Math.round(s * 10) / 10; el.className = 'sum' + (s > 0 ? '' : ' bad');
  });
  wrap.addEventListener('input', sums); sums();
  const stIn = [...wrap.querySelectorAll('.gm-st')];
  const pickCard = () => ({ ch: wrap.querySelector('#gm-ch').value, cls: +wrap.querySelector('#gm-cls').value, lv: Math.min(10, Math.max(1, Math.floor(+wrap.querySelector('#gm-lv').value || 1))) });
  const fillStats = () => { const d = cardStats(pickCard()); stIn.forEach((el, i) => { el.value = d[i]; }); };
  ['#gm-ch', '#gm-cls', '#gm-lv'].forEach(q => wrap.querySelector(q).addEventListener('change', fillStats));
  fillStats();
  wrap.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act; if (!act) return;
    Sound.play('UI_Select');
    const num = id => Math.max(0, Math.floor(+wrap.querySelector(id).value || 0));
    if (act === 'close') { wrap.remove(); refreshStatBar(); return; }
    if (act === 'odds-save') {
      const o = { normal: [], premium: [] };
      wrap.querySelectorAll('input[data-k]').forEach(el => { o[el.dataset.k][+el.dataset.i] = Math.max(0, +el.value || 0); });
      if (o.normal.every(v => !v) || o.premium.every(v => !v)) { msg('확률 합계가 0이면 저장할 수 없어요'); return; }
      S.odds = o; save(); msg('확률을 저장했어요. 같은 방에 들어온 친구들에게도 이 확률이 적용돼요');
      if (typeof Room !== 'undefined' && Room.role) Room.refreshProfile && Room.refreshProfile();
    }
    if (act === 'odds-reset') { delete S.odds; save(); wrap.remove(); openGmPanel(); document.querySelector('#gm-msg').textContent = '기본 확률로 되돌렸어요'; }
    if (act === 'coin') { S.coin += num('#gm-coin'); save(); refreshStatBar(); msg(`코인 ${fmt(num('#gm-coin'))}개 충전 완료 (보유 ${fmt(S.coin)})`); }
    if (act === 'dia') { S.dia += num('#gm-dia'); save(); refreshStatBar(); msg(`크리스탈 ${fmt(num('#gm-dia'))}개 충전 완료 (보유 ${fmt(S.dia)})`); }
    if (act === 'fp') { S.fp += num('#gm-fp'); save(); refreshStatBar(); msg(`우정포인트 ${fmt(num('#gm-fp'))}점 충전 완료`); }
    if (act === 'reset-cur') { S.coin = 0; S.dia = 0; S.fp = 0; save(); refreshStatBar(); msg('재화를 0으로 만들었어요'); }
    if (act === 'snd-play') { Sound.play(wrap.querySelector('#gm-snd').value); return; }
    if (act === 'snd-save') { S.catchSnd = wrap.querySelector('#gm-snd').value; save(); msg('말 잡는 소리를 바꿨어요. 같은 방 친구들에게도 적용돼요'); if (typeof Room !== 'undefined' && Room.role && Room.refreshProfile) Room.refreshProfile(); }
    if (act === 'card-fill') { fillStats(); msg('이 캐릭터·직급·레벨의 기본 능력치로 채웠어요'); }
    if (act === 'card') {
      const pc = pickCard();
      const c = newCard(pc.ch, pc.cls); c.lv = pc.lv;
      const want = stIn.map(el => Math.max(0, Math.min(999, Math.round(+el.value || 0)))), def = cardStats(pc);
      const custom = want.some((v, i) => v !== def[i]);
      if (custom) c.cst = want;
      S.cards.push(c); save();
      if (G.screen === 'cards' && typeof buildInven === 'function') buildInven();
      msg(`${CLASS_NAMES[c.cls - 1]} ${CHARS.find(x => x.k === c.ch).name} 카드(Lv.${c.lv})를 만들었어요` + (custom ? ` · 능력치 ${want.join('/')}` : ''));
    }
    if (act === 'logout') { S.gm = false; save(); wrap.remove(); if (G.screen === 'main') { setupGmButton(G.root); setNeon(G.root.find('UserName'), false); } toast('GM에서 로그아웃했어요'); }
  });
}
// 뽑기 확률: GM은 자기가 정한 값, 친구들은 GM과 같은 방에 들어갔을 때 받은 값(없으면 기본값)
function getOdds() {
  const base = { normal: TICKETS['1st Gacha'].odds.slice(), premium: TICKETS['4th Gacha'].odds.slice() };
  const o = S.gm ? S.odds : S.oddsGM;
  return o && o.normal && o.premium ? { normal: o.normal.slice(), premium: o.premium.slice() } : base;
}
function applyGmOdds(L) {
  if (!L || L.gmOdds === undefined || L.gmOdds === null || S.gm) return;
  if (L.gmCatch && L.gmCatch !== S.catchSnd) { S.catchSnd = L.gmCatch; save(); }
  if (L.gmOdds === 'default') { if (S.oddsGM) { delete S.oddsGM; save(); } return; }
  if (JSON.stringify(S.oddsGM) !== JSON.stringify(L.gmOdds)) { S.oddsGM = L.gmOdds; save(); toast('GM이 정한 뽑기 확률을 받았어요'); }
}
function ticketOdds(tk) { const o = getOdds(); return tk.cur === 'coin' ? o.normal : o.premium; }

const GM_CSS = `
#gm{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;z-index:20;font-family:KoPub,sans-serif;overflow:auto;padding:14px 0;box-sizing:border-box}
#gm .gm-box{position:relative;background:#fbeed2;border:6px solid #7a4a1c;border-radius:16px;box-shadow:0 6px 0 #4a2a0c,0 10px 30px rgba(0,0,0,.5);padding:46px 22px 16px;color:#5a3410;min-width:620px;max-width:94vw;margin:auto}
#gm .gm-title{position:absolute;left:50%;top:-4px;transform:translateX(-50%);background:linear-gradient(#b0641e,#8a4610);color:#fff;padding:8px 60px;border-radius:0 0 14px 14px;font-size:20px;text-shadow:0 2px 0 #5a2a00}
#gm .gm-x{position:absolute;right:10px;top:8px;width:30px;height:30px;border-radius:50%;background:#555;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px}
#gm .gm-sec{background:#fff8e8;border:2px dashed #d8b47a;border-radius:10px;padding:10px 12px;margin-bottom:10px}
#gm h3{margin:0 0 8px;font-size:15px;color:#a3500a}
#gm table{border-collapse:collapse;width:100%}#gm th{font-size:13px;padding:2px 3px;color:#7a4a1c;font-weight:normal}
#gm td input{width:52px}#gm input,#gm select{font:14px KoPub,sans-serif;padding:4px 6px;border:2px solid #d8b47a;border-radius:6px;background:#fff;color:#5a3410;width:110px}
#gm .sum{font-size:13px;color:#2a7a2a;text-align:center}#gm .sum.bad{color:#c00}
#gm .gm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:14px}
#gm button{font:15px KoPub,sans-serif;color:#fff;background:linear-gradient(#ffa42a,#f07a00);border:none;border-bottom:3px solid #b05000;border-radius:8px;padding:6px 14px;cursor:pointer}
#gm button.gray{background:linear-gradient(#9a9a9a,#777);border-bottom-color:#555}
#gm .gm-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin-top:8px;font-size:13px}#gm .gm-stats label{display:flex;justify-content:space-between;align-items:center;gap:6px}#gm .gm-stats input{width:64px}
#gm .gm-hint{font-size:12px;color:#8a6a3a;margin-top:6px}
#gm .gm-foot{justify-content:space-between}#gm #gm-msg{color:#2a7a2a;font-size:14px}`;
(function () { const st = document.createElement('style'); st.textContent = GM_CSS; document.head.appendChild(st); })();
