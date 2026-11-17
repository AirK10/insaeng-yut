import pickle, json, struct, sys
import mono, unity

idx = pickle.load(open('/home/claude/tools/mono_index.pkl', 'rb'))
CLS = {(n, pid): cls for n, pid, cls, name, sz in idx}
ATLAS_TEX = {}
for n, pid, cls, name, sz in idx:
    if cls == 'UIAtlas':
        import atlas
        try:
            _, mat, sp, s = atlas.parse_atlas(n, pid)
            ATLAS_TEX[(n, pid)] = atlas.mat_texture_name(s, mat)
        except Exception:
            pass


def widget(r):
    col = [r.f32() for _ in range(4)]
    pivot = r.i32(); w = r.i32(); h = r.i32(); depth = r.i32()
    return dict(color=col, pivot=pivot, w=w, h=h, depth=depth)


def parse_sprite(s, pid):
    r, go, sc, nm = mono.mono_header(s, pid)
    d = widget(r); r.i32()
    at = r.pptr(); d['spriteName'] = r.str()
    d['fillCenter'] = r.u8(); r.align(); d['type'] = r.i32(); d['fillDir'] = r.i32(); d['fillAmount'] = r.f32()
    d['invert'] = r.u8()
    afile = mono.ext_name(s, at[0])
    d['atlas'] = ATLAS_TEX.get((afile, at[1]))
    return d


def parse_label(s, pid):
    r, go, sc, nm = mono.mono_header(s, pid)
    d = widget(r); r.i32(); r.pptr(); r.pptr()
    d['text'] = r.str(); d['fontSize'] = r.i32(); d['fontStyle'] = r.i32()
    d['_rest'] = [r.u32() for _ in range(20)]
    return d


def parse_texture(s, pid):
    r, go, sc, nm = mono.mono_header(s, pid)
    d = widget(r)
    # search for pptr to a Texture2D in the remaining bytes
    off, size, _, _ = s.objects[pid]
    end = off + size
    p = r.p
    while p + 12 <= end:
        fid, path = struct.unpack_from('<iq', s.b, p)
        if 0 <= fid <= len(s.externals) and 0 < path < 1 << 40:
            try:
                fn = mono.ext_name(s, fid); fs = mono.get(fn)
                if path in fs.objects and fs.objects[path][2] == 28:
                    d['texture'] = fs.name_of(path); break
            except Exception:
                pass
        p += 4
    return d


def load_scene(n):
    s = mono.get(n)
    gos, trs = {}, {}
    for pid, (o, sz, c, si) in s.objects.items():
        if c == 1:
            r, _, _ = s.reader(pid)
            k = r.i32(); comps = [r.pptr() for _ in range(k)]
            layer = r.u32(); name = r.str(); tag = r.u('H'); active = r.bool()
            gos[pid] = dict(name=name, comps=comps, active=active)
        elif c in (4, 224):
            r, _, _ = s.reader(pid)
            go = r.pptr(); rot = [r.f32() for _ in range(4)]; pos = [r.f32() for _ in range(3)]; sc = [r.f32() for _ in range(3)]
            k = r.i32(); ch = [r.pptr()[1] for _ in range(k)]; fa = r.pptr()[1]
            trs[pid] = dict(go=go[1], rot=rot, pos=pos, scale=sc, children=ch, father=fa, rect=(c == 224))

    def build(tid):
        t = trs[tid]; g = gos[t['go']]
        node = dict(name=g['name'], active=g['active'], pos=t['pos'], scale=t['scale'], rot=t['rot'], comps=[])
        for fid, cp in g['comps']:
            if fid != 0 or cp not in s.objects: continue
            c = s.objects[cp][2]
            if c != 114: continue
            cls = CLS.get((n, cp), '?')
            try:
                if cls == 'UISprite': node['comps'].append(dict(cls=cls, **parse_sprite(s, cp)))
                elif cls == 'UILabel': node['comps'].append(dict(cls=cls, **parse_label(s, cp)))
                elif cls == 'UITexture': node['comps'].append(dict(cls=cls, **parse_texture(s, cp)))
                else: node['comps'].append(dict(cls=cls, pid=cp))
            except Exception as e:
                node['comps'].append(dict(cls=cls, err=str(e)))
        node['children'] = [build(c) for c in t['children'] if c in trs]
        return node

    roots = [build(tid) for tid, t in trs.items() if t['father'] == 0]
    return roots


def show(node, depth=0, maxd=99, out=sys.stdout):
    if depth > maxd: return
    cs = []
    for c in node['comps']:
        if c['cls'] == 'UISprite': cs.append('SPR[%s %dx%d d%d]' % (c.get('spriteName'), c['w'], c['h'], c['depth']))
        elif c['cls'] == 'UILabel': cs.append('LBL[%r %d]' % (c['text'][:30], c['fontSize']))
        elif c['cls'] == 'UITexture': cs.append('TEX[%s]' % c.get('texture'))
        else: cs.append(c['cls'])
    p = node['pos']
    print('  ' * depth + ('' if node['active'] else '(off)') + node['name'], '(%.0f,%.0f)' % (p[0], p[1]),
          '' if node['scale'][0] == 1 else 's%.2f' % node['scale'][0], ' '.join(cs), file=out)
    for ch in node['children']: show(ch, depth + 1, maxd, out)


if __name__ == '__main__':
    n = sys.argv[1]
    roots = load_scene(n)
    json.dump(roots, open('/home/claude/tools/scene_%s.json' % n, 'w'), ensure_ascii=False)
    with open('/home/claude/tools/scene_%s.txt' % n, 'w') as f:
        for r in roots: show(r, out=f)
