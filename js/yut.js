'use strict';
// ======================================================================
//  윷놀이 규칙 엔진 (방장 컴퓨터에서만 실행 — 결과를 친구들에게 보냄)
//  말판·확률·사물 데이터는 APK 안의 setting/map/YG 데이터 테이블을 사용
// ======================================================================
const F = { DO: 0, GAE: 1, GEOL: 2, YUT: 3, MO: 4, BACKDO: 5, NAK: 6 };
const FACE_STEPS = [1, 2, 3, 4, 5, -1];
const FACE_KEY = ['do', 'gae', 'gul', 'yut', 'mo', 'backdo', 'nak'];
const FACE_KO = ['도', '개', '걸', '윷', '모', '빽도', '낙'];
// 사물 종류(map 데이터 type) — 원본 플레이 영상으로 확인: 3 워프, 5 택배(스페셜박스), 6 아메리카노, 7 화장실, 8 리버스
const OBJ = { WARP: 3, QCARD: 4, BOX: 5, AMERICANO: 6, TOILET: 7, REVERSE: 8, MANHOLE: 10, TAXI: 11, HYDRANT: 12 };
const OBJ_KO = { 3: '워프', 4: '물음표 카드', 5: '택배', 6: '아메리카노', 7: '화장실', 8: '리버스', 10: '맨홀', 11: '택시', 12: '소화전' };
// 물음표 카드 (도시 맵). APK의 QuestionCard 그림(빽도·도·낙 / 윷·+10·자석)과 확률표(보통 60·좋음 30)를 바탕으로 구성
const QCARDS = [
  { k: 'backdo', w: 2400, good: false, face: 5, title: "'빽도' 카드", text: "다음 턴 '빽도'", pic: 'Q_card_pic_normal_BackDo' },
  { k: 'do', w: 2400, good: false, face: 0, title: "'도' 카드", text: "다음 턴 '도'", pic: 'Q_card_pic_normal_Do' },
  { k: 'nak', w: 1200, good: false, face: 6, title: "'낙' 카드", text: "다음 턴 '낙'", pic: 'Q_card_pic_normal_Nack' },
  { k: 'yut', w: 1400, good: true, face: 3, title: "'윷' 카드", text: "다음 턴 '윷'", pic: 'Q_card_pic_good_Yut' },
  { k: 'plus10', w: 1400, good: true, title: '+10 카드', text: '획득점수 +10점', pic: 'Q_card_pic_good_Plus10' },
  { k: 'magnet', w: 1200, good: true, title: '자석 카드', text: '3칸 안의 상대 말을\n끌어와서 잡아요', pic: 'Q_card_pic_good_Magnet' },
];
const OFFICE_MAPS = [1, 2, 3, 4], CITY_MAPS = [5, 6, 7];
const GAME_TIME = 20 * 60 * 1000;
const COLORS = ['red', 'blue', 'green', 'yellow'];

const NODE = {}; BOARD.nodes.forEach(n => NODE[n.id] = n);
const PRED = {};
BOARD.nodes.forEach(n => n.to.forEach(([, nx]) => { if (nx >= 0) (PRED[nx] = PRED[nx] || []).includes(n.id) || PRED[nx].push(n.id); }));
if (NODE[5].shortcut !== undefined) [[5, 6], [15, 16], [8, 9]].forEach(([a, b]) => { (PRED[b] = PRED[b] || []).includes(a) || PRED[b].push(a); });

function stepForward(pos, prev, first) {
  if (pos === -1) return { pos: 1, prev: 0 };
  if (pos === 0) return { done: true };
  const nd = NODE[pos];
  let next;
  if (first && nd.shortcut !== undefined) next = nd.shortcut;
  else { const e = nd.to.find(t => t[0] === prev); next = e ? e[1] : nd.to[nd.to.length - 1][1]; }
  return { pos: next, prev: pos };
}
function stepBack(pos, prev) {
  if (pos <= -1) return null;
  const to = (prev !== null && prev !== undefined && prev >= 0) ? prev : (PRED[pos] || [0])[0];
  const pp = (PRED[to] || []).filter(x => x !== pos);
  return { pos: to, prev: to === 0 ? null : (pp[0] ?? null) };
}
// distance to finish (for AI + ranking)
const DIST = (() => {
  const d = {};
  for (const n of BOARD.nodes) {
    let pos = n.id, prev = (PRED[n.id] || [null])[0], k = 0, first = true;
    while (k < 40) { const r = stepForward(pos, prev, first); first = false; k++; if (r.done) break; pos = r.pos; prev = r.prev; }
    d[n.id] = k;
  }
  d[-1] = 21; return d;
})();

function wpick(weights) {
  const t = weights.reduce((a, b) => a + Math.max(0, b), 0); let x = Math.random() * t;
  for (let i = 0; i < weights.length; i++) { x -= Math.max(0, weights[i]); if (x < 0) return i; }
  return weights.length - 1;
}

class YutGame {
  constructor(cfg) {
    const mapIds = cfg.mapKind === 'office' ? OFFICE_MAPS : cfg.mapKind === 'city' ? CITY_MAPS : [...OFFICE_MAPS, ...CITY_MAPS];
    const mapId = cfg.mapId ?? mapIds[Math.floor(Math.random() * mapIds.length)];
    const mp = BOARD.maps.find(m => m.id === mapId);
    this.s = {
      v: 1, mapId, nPieces: cfg.pieces || 2, turn: 0, round: 1, phase: 'order', throws: [], canThrow: true, fever: false,
      objects: mp.obj.map(([node, type, en]) => ({ node, type, on: !!en })),
      specialBox: null, deadline: 0, seq: 0, turnNo: 1, combo: 0, endsAt: 0, timeout: false, winner: null, ranking: null, mission: cfg.mission ?? Math.floor(Math.random() * 4),
      players: cfg.players.map((p, i) => ({
        id: p.id, name: p.name, ch: p.ch, cls: p.cls, lv: p.lv, cst: p.cst || null, yut: p.yut || 0, yutLv: p.yutLv || 1, bot: !!p.bot, gm: !!p.gm,
        color: COLORS[i % 4], seat: i, items: Object.assign({ noNak: false, combine: false, boost: false, shield: false }, p.items || {}),
        pieces: Array.from({ length: cfg.pieces || 2 }, () => ({ pos: -1, prev: null, done: false })),
        score: 0, caught: 0, catches: 0, mos: 0, stackFinish: 0, fever: 0, rewards: [], gone: false,
      })),
      order: null, log: [],
    };
    this.ev = [];
  }
  get state() { return this.s; }
  emit(e) { this.ev.push(e); }
  flush() { const e = this.ev; this.ev = []; this.s.seq++; return e; }
  cur() { return this.s.players[this.s.turn]; }

  // ---------- order (선 정하기) ----------
  // 원작처럼 엎어 둔 윷 4개 중 하나씩 고르고, 「선」이 적힌 윷을 고른 사람이 먼저 한다.
  startOrder() {
    const s = this.s;
    s.phase = 'order'; s.orderPicks = s.players.map(() => -1); s.order = null;
    this.emit({ e: 'orderStart' });
  }
  pickOrder(pi, idx) {
    const s = this.s; if (s.phase !== 'order' || !s.players[pi] || s.orderPicks[pi] >= 0) return false;
    const free = [0, 1, 2, 3].filter(i => !s.orderPicks.includes(i));
    if (!free.includes(idx)) idx = free[Math.floor(Math.random() * free.length)];
    s.orderPicks[pi] = idx;
    this.emit({ e: 'orderPick', p: pi, idx });
    if (s.orderPicks.every(x => x >= 0)) this.finishOrder();
    return true;
  }
  finishOrder() {
    const s = this.s, n = s.players.length;
    const first = Math.floor(Math.random() * n);
    const order = Array.from({ length: n }, (_, i) => (first + i) % n);
    s.order = order; s.turn = order[0]; s.phase = 'throw'; s.canThrow = true; s.throws = []; s.endsAt = Date.now() + GAME_TIME; s.combo = 0;
    this.emit({ e: 'order', order, stick: s.orderPicks[first] });
    this.emit({ e: 'turn', p: s.turn });
  }
  nextIdx(i) { const o = this.s.order; let k = o.indexOf(i); for (let n = 0; n < o.length; n++) { k = (k + 1) % o.length; if (!this.s.players[o[k]].gone || n === o.length - 1) return o[k]; } return o[k]; }

  // ---------- throwing ----------
  faceProbs(p, power) {
    const s = this.s;
    const empty = Math.max(1, 3 - s.throws.length);
    const row = BOARD.yutProb.find(r => r.empty_slot_count === empty && r.power_gauge === power) || BOARD.yutProb[0];
    const st = cardStatsOf(p);
    const ys = yutStatsOf(p);
    const w = (s.fever ? row.fever_probability : row.normal_probability).slice();
    // 능력치는 상대값: 100을 넘어도 확정이 되지 않고, 높아질수록 조금씩만 더 오른다 (v / (v + 100))
    w[F.YUT] += 1200 * sat(st[3] + ys[3]); w[F.MO] += 1200 * sat(st[4] + ys[4]);
    if (s.fever) { w[F.YUT] += 1600 * sat(st[1] + ys[1]); w[F.MO] += 1600 * sat(st[1] + ys[1]); }
    if (empty === 1) { w[F.YUT] = Math.min(w[F.YUT], row.normal_probability[F.YUT] + 400); w[F.MO] = Math.min(w[F.MO], row.normal_probability[F.MO] + 400); }
    const nak = Math.max(150, row.fail_probability - ys[6] * 40);
    return { w, nak };
  }
  // 윷 컨트롤: 게이지 칸(1 도 · 2 개 · 3 걸 · 4 윷 · 5 모)을 노렸을 때 그 눈이 그대로 나올 확률.
  // '윷 컨트롤 강화' 능력치의 상대값이라 아무리 높아도 100%가 되지 않는다.
  controlChance(p, power) {
    const c = cardStatsOf(p)[5] || 0; if (c <= 0) return 0;
    return (c / (c + 140)) * (power >= 4 ? 0.55 : 0.85);
  }
  doThrow(pi, power) {
    const s = this.s, p = s.players[pi];
    if (s.phase !== 'throw' || s.turn !== pi || !s.canThrow || s.throws.length >= 3) return false;
    power = Math.max(1, Math.min(5, Math.round(power || 3)));
    const { w, nak } = this.faceProbs(p, power);
    let face, ctl = false, forced = false;
    if (p.nextFace !== undefined && p.nextFace !== null) { face = p.nextFace; p.nextFace = null; forced = true; }      // 물음표 카드로 정해진 눈
    else if (Math.random() < this.controlChance(p, power)) { face = power - 1; ctl = true; }
    else if (Math.random() * 10000 < nak) {
      if (p.items.noNak) { p.items.noNak = false; this.emit({ e: 'nakguard', p: pi }); face = wpick(w); }
      else face = F.NAK;
    } else face = wpick(w);
    if (face === F.MO) p.mos++;
    this.emit({ e: 'throw', p: pi, face, power, fever: s.fever, ctl, forced });
    if (face === F.NAK) { s.canThrow = false; }
    else {
      s.throws.push(face);
      s.canThrow = (face === F.YUT || face === F.MO) && s.throws.length < 3;
    }
    this.afterAction();
    return true;
  }

  // ---------- moving ----------
  legal(pi, ti, k) {
    const s = this.s, p = s.players[pi], f = s.throws[ti], pc = p.pieces[k];
    if (f === undefined || !pc || pc.done) return false;
    if (pc.pos === -1) {
      if (f === F.BACKDO) return false;
      // only one waiting piece needs to be offered
      const firstWait = p.pieces.findIndex(x => x.pos === -1 && !x.done);
      return firstWait === k;
    }
    // for stacks only the lowest index piece of the stack is the handle
    const lead = p.pieces.findIndex(x => !x.done && x.pos === pc.pos);
    return lead === k;
  }
  anyLegal(pi) {
    const s = this.s, p = s.players[pi];
    for (let t = 0; t < s.throws.length; t++) for (let k = 0; k < p.pieces.length; k++) if (this.legal(pi, t, k)) return true;
    return false;
  }
  objAt(node) { return this.s.objects.find(o => o.node === node); }
  doMove(pi, ti, k) {
    const s = this.s, p = s.players[pi];
    if (s.phase !== 'move' || s.turn !== pi || !this.legal(pi, ti, k)) return false;
    const face = s.throws.splice(ti, 1)[0];
    const pc = p.pieces[k];
    let group;
    if (pc.pos === -1) {
      group = [k];
      if (p.items.combine) { const other = p.pieces.findIndex((x, j) => j !== k && x.pos === -1 && !x.done); if (other >= 0) group.push(other); p.items.combine = false; this.emit({ e: 'combineStart', p: pi }); }
    } else group = p.pieces.map((x, j) => (!x.done && x.pos === pc.pos) ? j : -1).filter(j => j >= 0);
    let steps = FACE_STEPS[face];
    const startObj = pc.pos >= 0 ? this.objAt(pc.pos) : null;
    const reversed = startObj && startObj.type === OBJ.REVERSE;
    if (reversed) steps = -steps;
    const r = this.walk(pc.pos, pc.prev, steps);
    this.emit({ e: 'move', p: pi, pieces: group, path: r.path, face, reversed, done: r.done });
    this.place(pi, group, r);
    let extra = false;
    if (!r.done) {
      const res = this.land(pi, group, r.pos, false, face);
      extra = res.extra;
    }
    this.checkWin(pi);
    if (extra && s.phase !== 'over') { s.canThrow = true; this.emit({ e: 'extra', p: pi }); }
    this.afterAction();
    return true;
  }
  walk(pos, prev, steps) {
    const path = [];
    if (steps > 0) {
      for (let i = 0; i < steps; i++) {
        const r = stepForward(pos, prev, i === 0);
        if (r.done) return { path, done: true, pos: -2, prev: null };
        pos = r.pos; prev = r.prev; path.push(pos);
      }
    } else {
      for (let i = 0; i < -steps; i++) {
        const r = stepBack(pos, prev); if (!r) break;
        pos = r.pos; prev = r.prev; path.push(pos);
      }
    }
    return { path, done: false, pos, prev };
  }
  place(pi, group, r) {
    const p = this.s.players[pi];
    for (const j of group) {
      const pc = p.pieces[j];
      if (r.done) { pc.done = true; pc.pos = -2; pc.prev = null; }
      else { pc.pos = r.pos; pc.prev = r.prev; }
    }
    if (r.done) {
      const pts = BOARD.actionPt.filter(a => a.ingame_action_type < 100).map(a => a.game_point);
      p.score += pts[Math.min(group.length, pts.length) - 1] || 5;
      if (group.length > 1) p.stackFinish++;
      this.emit({ e: 'finish', p: pi, n: group.length });
    }
  }
  land(pi, group, node, viaObject, face, depth = 0) {
    const s = this.s, me = s.players[pi];
    let extra = false;
    // catch
    const victims = [];
    s.players.forEach((q, qi) => {
      if (qi === pi) return;
      q.pieces.forEach((pc, j) => { if (!pc.done && pc.pos === node) victims.push([qi, j]); });
    });
    if (victims.length) {
      for (const [qi, j] of victims) { const pc = s.players[qi].pieces[j]; pc.pos = -1; pc.prev = null; }
      const byPlayer = {};
      victims.forEach(([qi]) => byPlayer[qi] = (byPlayer[qi] || 0) + 1);
      for (const qi of Object.keys(byPlayer)) {
        const q = s.players[qi]; q.caught++;
        if (q.caught % 2 === 0) { q.fever = 1; this.emit({ e: 'feverOn', p: +qi }); }
      }
      const pts = BOARD.actionPt.filter(a => a.ingame_action_type > 100).map(a => a.game_point);
      s.combo = (s.combo || 0) + 1;
      const gain = (pts[Math.min(victims.length, pts.length) - 1] || 1) * s.combo;
      me.score += gain;
      me.catches += victims.length;
      this.emit({ e: 'catch', p: pi, node, victims, combo: s.combo, gain });
      if (!viaObject && face !== F.YUT && face !== F.MO) extra = true;
    }
    // 택배 (special box) on the map
    const bx = s.objects.find(o => o.type === OBJ.BOX && o.node === node && o.on);
    if (bx) {
      bx.on = false;
      const fx = BOARD.specialFx[wpick(BOARD.specialFx.map(x => x.probability))];
      const reward = fx.type === 'Card' ? { t: 'card', cls: fx.value + 1 } : fx.type === 'Cash' ? { t: 'dia', n: fx.value } : fx.type === 'Gold' ? { t: 'coin', n: fx.value * 100 } : { t: 'score', n: fx.value };
      if (reward.t === 'score') me.score *= 2; else me.rewards.push(reward);
      this.emit({ e: 'specialBox', p: pi, node, reward });
    }
    if (depth > 0 || viaObject) return { extra };
    const o = this.objAt(node);
    if (!o) return { extra };
    if ((o.type === OBJ.WARP || o.type === OBJ.MANHOLE) && o.on) {
      const dsts = s.objects.filter(x => x.type === o.type && x.node !== node);
      const dst = dsts[Math.floor(Math.random() * dsts.length)];
      if (dst) { this.emit({ e: o.type === OBJ.MANHOLE ? 'manhole' : 'warp', p: pi, pieces: group, from: node, to: dst.node }); this.teleport(pi, group, dst.node); const r = this.land(pi, group, dst.node, true, face, depth + 1); extra = extra || r.extra; }
    } else if (o.type === OBJ.TAXI) {
      // 택시: 앞쪽의 다음 모서리(큰 원)까지 바로 이동
      const pc = me.pieces[group[0]];
      let r = null;
      for (let n = 1; n <= 10; n++) { const t = this.walk(pc.pos, pc.prev, n); if (t.done || [5, 15, 24, 8].includes(t.pos)) { r = t; break; } }
      if (r && !r.done) {
        this.emit({ e: 'taxi', p: pi, pieces: group, from: node, to: r.pos });
        this.place(pi, group, r);
        const rr = this.land(pi, group, r.pos, true, face, depth + 1); extra = extra || rr.extra;
      }
    } else if (o.type === OBJ.QCARD) {
      const q = QCARDS[wpick(QCARDS.map(c => c.w))];
      let info = null;
      if (q.face !== undefined) me.nextFace = q.face;
      else if (q.k === 'plus10') me.score += 10;
      else if (q.k === 'magnet') {
        // 앞뒤 3칸 안에 있는 가장 가까운 상대 말(들)을 끌어와 잡는다
        let best = null;
        s.players.forEach((q2, qi) => {
          if (qi === pi) return;
          q2.pieces.forEach((pc2, j) => {
            if (pc2.done || pc2.pos < 0) return;
            const d = Math.min(...[1, 2, 3].filter(n => { const a = this.walk(node, me.pieces[group[0]].prev, n); const b = this.walk(pc2.pos, pc2.prev, n); return (!a.done && a.pos === pc2.pos) || (!b.done && b.pos === node); }), 99);
            if (d < 99 && (!best || d < best.d)) best = { qi, pos: pc2.pos, d };
          });
        });
        if (best) {
          const vict = [];
          s.players[best.qi].pieces.forEach((pc2, j) => { if (!pc2.done && pc2.pos === best.pos) vict.push(j); });
          info = { from: best.pos, victim: best.qi, pieces: vict };
          this.emit({ e: 'qcard', p: pi, node, card: q.k, info });
          vict.forEach(j => { s.players[best.qi].pieces[j].pos = node; });
          const r = this.land(pi, group, node, true, face, depth + 1); extra = extra || r.extra;
          return { extra };
        }
      }
      this.emit({ e: 'qcard', p: pi, node, card: q.k, info });
    } else if (o.type === OBJ.TOILET) {
      const choices = BOARD.toiletTo.filter(n => n !== node);
      const dst = choices[Math.floor(Math.random() * choices.length)];
      this.emit({ e: 'toilet', p: pi, pieces: group, from: node, to: dst });
      this.teleport(pi, group, dst); const r = this.land(pi, group, dst, true, face, depth + 1); extra = extra || r.extra;
    } else if (o.type === OBJ.AMERICANO) {
      const vals = [1, 2, 3, 4, 5, -1];
      const v = vals[wpick(BOARD.lunchbox.slice(0, 6))];
      const pc = me.pieces[group[0]];
      const r = this.walk(pc.pos, pc.prev, v);
      this.emit({ e: 'americano', p: pi, pieces: group, value: v, path: r.path, done: r.done });
      this.place(pi, group, r);
      if (!r.done) { const rr = this.land(pi, group, r.pos, true, face, depth + 1); extra = extra || rr.extra; }
    } else if (o.type === OBJ.REVERSE) {
      this.emit({ e: 'reverseHere', p: pi, node });
    }
    return { extra };
  }
  teleport(pi, group, node) {
    const p = this.s.players[pi];
    for (const j of group) { p.pieces[j].pos = node; p.pieces[j].prev = (PRED[node] || [null])[0]; }
  }
  checkWin(pi) {
    const s = this.s, p = s.players[pi];
    if (p.pieces.every(x => x.done)) {
      s.phase = 'over'; s.winner = pi;
      this.finishGame();
    }
  }
  progress(p) { return p.pieces.reduce((a, pc) => a + (pc.done ? 30 : 21 - DIST[pc.pos] || 0), 0); }
  finishGame() {
    const s = this.s;
    const others = s.players.map((p, i) => i).filter(i => i !== s.winner)
      .sort((a, b) => {
        const A = s.players[a], B = s.players[b];
        return (B.pieces.filter(x => x.done).length - A.pieces.filter(x => x.done).length) || (this.progress(B) - this.progress(A)) || (B.score - A.score);
      });
    s.ranking = [s.winner, ...others];
    const n = s.players.length;
    const tbl = BOARD.coin.find(c => c.player_count === Math.max(2, n) && c.channel_type === 1) || { winner_coin: 500, loser_coin: 100 };
    s.ranking.forEach((pi, r) => {
      const p = s.players[pi];
      const mission = this.missionOk(p);
      let coin = r === 0 ? tbl.winner_coin : tbl.loser_coin;
      if (n >= 4 && r === 0) coin = Math.max(coin, 1000);
      coin *= 10;
      if (mission) coin *= 2;
      const cs = cardStatsOf(p), ys = yutStatsOf(p);
      coin = Math.round(coin * (1 + (ys[0] || 0) / 100) * (1 + 0.5 * sat(cs[0])));        // 코인 획득 증가
      if (r > 0) coin = Math.round(coin * (1 + sat(cs[2] + (ys[2] || 0))));               // 패배시 승점 방어
      if (p.items.boost && r === 0) coin = Math.round(coin * 1.5);
      if (p.items.shield && r > 0) coin = Math.max(coin, Math.round(tbl.winner_coin * 10 / 2));
      p.result = { rank: r + 1, coin, exp: r === 0 ? 20 : 10, mission };
    });
    s.canThrow = false; s.throws = [];
    this.emit({ e: 'over', ranking: s.ranking });
  }
  missionOk(p) {
    switch (this.s.mission) {
      case 0: return p.caught === 0;
      case 1: return p.catches >= 2;
      case 2: return p.stackFinish >= 1;
      case 3: return p.mos >= 1;
    }
    return false;
  }

  // ---------- turn handling ----------
  afterAction() {
    const s = this.s;
    if (s.phase === 'over') return;
    if (s.canThrow) { s.phase = 'throw'; return; }
    if (s.throws.length && this.anyLegal(s.turn)) { s.phase = 'move'; return; }
    if (s.throws.length) this.emit({ e: 'wasted', p: s.turn, throws: s.throws.slice() });
    this.endTurn();
  }
  endTurn() {
    const s = this.s;
    const prev = s.turn;
    s.players[prev].fever = s.players[prev].fever ? Math.max(0, s.players[prev].fever - 1) : 0;
    s.throws = []; s.canThrow = true; s.combo = 0; s.turnNo = (s.turnNo || 1) + 1;
    s.turn = this.nextIdx(prev);
    if (s.order && s.turn === s.order[0]) {
      s.round++;
      for (const o of s.objects) if (o.type === OBJ.WARP || o.type === OBJ.MANHOLE) o.on = !o.on;
      this.emit({ e: 'warpToggle' });
      for (const o of s.objects) {
        if (o.type !== OBJ.BOX || o.on || Math.random() * 100 >= BOARD.specialBox.prob) continue;
        const occupied = s.players.some(q => q.pieces.some(pc => pc.pos === o.node));
        if (!occupied) { o.on = true; this.emit({ e: 'specialSpawn', node: o.node }); }
      }
    }
    s.fever = !!s.players[s.turn].fever;
    s.phase = 'throw';
    this.emit({ e: 'turn', p: s.turn });
  }
  timeUp() {
    const s = this.s; if (s.phase === 'over') return;
    const st = s.players.map((p, i) => i).sort((a, b) => {
      const A = s.players[a], B = s.players[b];
      return (B.pieces.filter(x => x.done).length - A.pieces.filter(x => x.done).length) || (this.progress(B) - this.progress(A)) || (B.score - A.score);
    });
    s.phase = 'over'; s.winner = st[0]; s.timeout = true;
    this.emit({ e: 'timeUp' });
    this.finishGame();
  }
  leave(pi) {
    const s = this.s; const p = s.players[pi]; if (!p || p.gone) return;
    p.gone = true; p.bot = true;
    this.emit({ e: 'left', p: pi });
  }

  // ---------- AI / auto ----------
  autoThrowPower() { return 2 + Math.floor(Math.random() * 3); }
  bestMove(pi) {
    const s = this.s, p = s.players[pi];
    let best = null, bestV = -1e9;
    for (let t = 0; t < s.throws.length; t++) for (let k = 0; k < p.pieces.length; k++) {
      if (!this.legal(pi, t, k)) continue;
      const pc = p.pieces[k], face = s.throws[t];
      let steps = FACE_STEPS[face];
      const so = pc.pos >= 0 ? this.objAt(pc.pos) : null;
      if (so && so.type === OBJ.REVERSE) steps = -steps;
      const r = this.walk(pc.pos, pc.prev, steps);
      let v = 0;
      const stack = pc.pos === -1 ? 1 : p.pieces.filter(x => !x.done && x.pos === pc.pos).length;
      if (r.done) v += 120 * stack;
      else {
        const vic = s.players.reduce((a, q, qi) => a + (qi === pi ? 0 : q.pieces.filter(x => !x.done && x.pos === r.pos).length), 0);
        v += vic * 80;
        v += (21 - DIST[r.pos]) * 2 - (21 - (DIST[pc.pos] ?? 21));
        if (p.pieces.some((x, j) => j !== k && !x.done && x.pos === r.pos)) v += 25;
        const o = this.objAt(r.pos); if (o) v += (o.type === OBJ.WARP || o.type === OBJ.MANHOLE) && o.on ? 15 : o.type === OBJ.AMERICANO ? 6 : o.type === OBJ.TOILET ? -4 : o.type === OBJ.TAXI ? 12 : o.type === OBJ.QCARD ? 3 : 0;
        if (s.objects.some(x => x.type === OBJ.BOX && x.on && x.node === r.pos)) v += 30;
        // danger: opponents within 1..5 behind
        const danger = s.players.some((q, qi) => qi !== pi && q.pieces.some(x => !x.done && x.pos >= 0 && [1, 2, 3, 4, 5].some(n => this.walk(x.pos, x.prev, n).pos === r.pos)));
        if (danger) v -= 18;
      }
      if (face === F.BACKDO) v -= 5;
      v += Math.random() * 3;
      if (v > bestV) { bestV = v; best = [t, k]; }
    }
    return best;
  }
}
// card/yut stats for a player config
const sat = (v, k = 100) => { v = Math.max(0, +v || 0); return v / (v + k); };
function cardStatsOf(p) {
  try { return cardStats({ ch: p.ch, cls: p.cls, lv: p.lv, cst: p.cst }); } catch (e) { return [0, 0, 0, 0, 0, 0]; }
}
function yutStatsOf(p) {
  const lv = BOARD.yutLevels[p.yut || 0]; if (!lv) return [0, 0, 0, 0, 0, 0, 0, 0];
  const row = lv[Math.max(0, Math.min(lv.length - 1, (p.yutLv || 1) - 1))];
  return row.slice(0, 8);
}
