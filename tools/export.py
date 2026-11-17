"""Export NGUI scenes from the Unity data into compact JSON for the web runtime."""
import pickle, json, struct, sys, math, re
import mono, unity, scene

idx = scene.idx
CLS = scene.CLS
ATLAS_TEX = scene.ATLAS_TEX

TWEENS = {'TweenAlpha', 'TweenPosition', 'TweenScale', 'TweenRotation', 'TweenColor', 'TweenRotation360',
          'TweenWidth', 'TweenHeight'}


def rd_widget(r):
    col = [round(r.f32(), 4) for _ in range(4)]
    pivot = r.i32(); w = r.i32(); h = r.i32(); depth = r.i32()
    return dict(c=col, pv=pivot, w=w, h=h, d=depth)


def rd_curve(r):
    n = r.i32(); keys = []
    for _ in range(n):
        t, v, ins, outs = r.f32(), r.f32(), r.f32(), r.f32(); r.i32(); r.f32(); r.f32()
        keys.append([round(t, 5), round(v, 5), round(ins, 5), round(outs, 5)])
    r.i32(); r.i32(); r.i32()
    return keys


def rd_tween(s, pid, cls):
    r, go, sc, nm = mono.mono_header(s, pid)
    off, size, _, _ = s.objects[pid]
    end = off + size
    d = dict(t=cls, en=s.b[off + 12])
    d['method'] = r.i32(); d['style'] = r.i32(); d['curve'] = rd_curve(r)
    r.bool(); r.align()
    d['delay'] = round(r.f32(), 4); d['dur'] = round(r.f32(), 4)
    r.bool(); r.align(); d['group'] = r.i32()
    r.pptr(); d['cb'] = r.str()
    n = r.i32()
    evs = []
    try:
        for _ in range(n):
            r.pptr(); evs.append(r.str()); r.bool(); r.align()
        rest = s.b[r.p:end]
    except Exception:
        rest = None
    if evs: d['onFin'] = evs
    TAIL = {'TweenAlpha': (2, 0), 'TweenPosition': (6, 0), 'TweenRotation': (6, 0), 'TweenScale': (6, 1),
            'TweenColor': (8, 0), 'TweenRotation360': (6, 0), 'TweenWidth': (2, 0), 'TweenHeight': (2, 0)}
    nw, trail = TAIL[cls]
    tail = s.b[end - 4 * (nw + trail):end - 4 * trail]
    if rest is None or n:
        rest = tail
    fl = [round(struct.unpack_from('<f', rest, i)[0], 4) for i in range(0, len(rest) - 3, 4)]
    ints = [struct.unpack_from('<i', rest, i)[0] for i in range(0, len(rest) - 3, 4)]
    if cls == 'TweenAlpha': d['from'], d['to'] = fl[0], fl[1]
    elif cls in ('TweenPosition', 'TweenScale', 'TweenRotation'): d['from'], d['to'] = fl[0:3], fl[3:6]
    elif cls == 'TweenColor': d['from'], d['to'] = fl[0:4], fl[4:8]
    elif cls in ('TweenWidth', 'TweenHeight'): d['from'], d['to'] = ints[0], ints[1]
    else: d['raw'] = fl
    return d


def ev_list(r):
    n = r.i32(); out = []
    for _ in range(n):
        r.pptr(); out.append(r.str()); r.bool(); r.align()
    return out


def comp(s, n, cp):
    cls = CLS.get((n, cp), '?')
    off, size, _, _ = s.objects[cp]
    en = s.b[off + 12]
    if cls == 'UISprite':
        r, go, sc, nm = mono.mono_header(s, cp)
        d = rd_widget(r); r.i32()
        at = r.pptr(); d['sp'] = r.str()
        d['fc'] = r.u8(); r.align(); d['ty'] = r.i32(); d['fd'] = r.i32(); d['fa'] = round(r.f32(), 4); d['inv'] = r.u8()
        d['at'] = ATLAS_TEX.get((mono.ext_name(s, at[0]), at[1]))
        d['t'] = 'S'
    elif cls == 'UILabel':
        r, go, sc, nm = mono.mono_header(s, cp)
        d = rd_widget(r); r.i32(); r.i32(); ttf = r.pptr(); bmf = r.pptr()
        d['tx'] = r.str(); d['fs'] = r.i32(); d['fst'] = r.i32(); r.i32()
        d['ef'] = r.i32(); d['ec'] = [round(r.f32(), 3) for _ in range(4)]
        r.i32(); d['ed'] = [round(r.f32(), 2), round(r.f32(), 2)]
        r.i32(); r.f32(); r.i32(); r.f32(); r.f32(); d['ov'] = r.i32()
        d['bm'] = 1 if bmf[1] else 0
        if bmf[1]: d['bf'] = f"{mono.ext_name(s, bmf[0])}:{bmf[1]}"
        d['t'] = 'L'
    elif cls == 'UITexture':
        d = scene.parse_texture(s, cp)
        d = dict(c=d['color'], pv=d['pivot'], w=d['w'], h=d['h'], d=d['depth'], tex=d.get('texture'), t='T')
    elif cls == 'UIPanel':
        r, go, sc, nm = mono.mono_header(s, cp)
        b = s.b[r.p:off + size]
        w = lambda i: struct.unpack_from('<i', b, i * 4)[0]
        f = lambda i: struct.unpack_from('<f', b, i * 4)[0]
        d = dict(t='P', clip=w(22), cr=[round(f(23 + i), 1) for i in range(4)], pd=w(29), a=round(f(20), 3))
    elif cls in TWEENS:
        d = rd_tween(s, cp, cls)
    elif cls == 'UIButtonMessage':
        r, go, sc, nm = mono.mono_header(s, cp)
        tg = r.pptr(); d = dict(t='BM', fn=r.str(), trig=r.i32())
    elif cls == 'UIImageButton':
        r, go, sc, nm = mono.mono_header(s, cp)
        r.pptr(); d = dict(t='IB', n=r.str(), hv=r.str(), pr=r.str(), ds=r.str())
    elif cls == 'UIButtonScale':
        r, go, sc, nm = mono.mono_header(s, cp)
        tg = r.pptr(); hv = [r.f32() for _ in range(3)]; pr = [r.f32() for _ in range(3)]
        d = dict(t='BS', hv=round(hv[0], 3), pr=round(pr[0], 3), dur=round(r.f32(), 3), tg=tg[1])
    elif cls == 'UIButton':
        r, go, sc, nm = mono.mono_header(s, cp)
        r.pptr(); [r.f32() for _ in range(12)]; r.f32()
        d = dict(t='B')
        try:
            r.f32(); r.f32(); r.f32(); r.f32(); r.i32()
            d['on'] = ev_list(r)
        except Exception:
            pass
    elif cls == 'UIPlayTween':
        r, go, sc, nm = mono.mono_header(s, cp)
        tg = r.pptr(); d = dict(t='PT', tg=tg[1], grp=r.i32(), trig=r.i32(), dir=r.i32())
    elif cls == 'UIToggle':
        d = dict(t='TG')
    else:
        d = dict(t='C', cls=cls)
    d['en'] = en
    return d


def box_collider(s, cp):
    r, _, _ = s.reader(cp)
    r.pptr(); r.pptr(); r.bool(); r.bool(); r.align()
    size = [r.f32() for _ in range(3)]; center = [r.f32() for _ in range(3)]
    return [round(center[0], 1), round(center[1], 1), round(size[0], 1), round(size[1], 1)]


def quat_z(q):
    x, y, z, w = q
    return round(math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))), 3)


def load(n):
    s = mono.get(n)
    gos, trs = {}, {}
    for pid, (o, sz, c, si) in s.objects.items():
        if c == 1:
            r, _, _ = s.reader(pid)
            k = r.i32(); comps = [r.pptr() for _ in range(k)]
            r.u32(); name = r.str(); r.u('H'); active = r.bool()
            gos[pid] = dict(name=name, comps=comps, active=active)
        elif c in (4, 224):
            r, _, _ = s.reader(pid)
            go = r.pptr(); rot = [r.f32() for _ in range(4)]; pos = [r.f32() for _ in range(3)]; sc = [r.f32() for _ in range(3)]
            k = r.i32(); ch = [r.pptr()[1] for _ in range(k)]; fa = r.pptr()[1]
            trs[pid] = dict(go=go[1], rot=rot, pos=pos, scale=sc, children=ch, father=fa)

    def build(tid):
        t = trs[tid]; g = gos[t['go']]
        node = dict(n=g['name'], id=t['go'])
        if not g['active']: node['off'] = 1
        p = [round(t['pos'][0], 2), round(t['pos'][1], 2)]
        if p != [0, 0]: node['p'] = p
        scl = [round(t['scale'][0], 4), round(t['scale'][1], 4)]
        if scl != [1, 1]: node['s'] = scl
        rz = quat_z(t['rot'])
        if abs(rz) > 0.01: node['r'] = rz
        cs = []
        for fid, cp in g['comps']:
            if fid != 0 or cp not in s.objects: continue
            c = s.objects[cp][2]
            if c == 65:
                node['box'] = box_collider(s, cp)
            elif c == 114:
                try:
                    d = comp(s, n, cp)
                    if d['t'] == 'C' and d['cls'] in ('UIDragScrollView', 'iPadCameraSetting', 'UIAnchor', 'UIStretch', 'EscapePopup', '?'):
                        continue
                    cs.append(d)
                except Exception as e:
                    cs.append(dict(t='ERR', cls=CLS.get((n, cp)), e=str(e)[:60]))
        if cs: node['c'] = cs
        kids = [build(c) for c in t['children'] if c in trs]
        if kids: node['k'] = kids
        return node

    return [build(tid) for tid, t in trs.items() if t['father'] == 0]


def find(nodes, name):
    for nd in nodes:
        if nd['n'] == name: return nd
        r = find(nd.get('k', []), name)
        if r: return r
    return None


if __name__ == '__main__':
    out = {}
    for lv in sys.argv[1:]:
        out[lv] = load(lv)
    json.dump(out, open('/home/claude/tools/export.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    print('ok')
