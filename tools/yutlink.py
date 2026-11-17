import unity, collections, json, sys
from mesh import read_mesh
files = {n: unity.SFile(n) for n in unity.all_files()}
def resolve(s, fid, pid):
    if fid == 0: return s, pid
    ext = s.externals[fid - 1]; base = ext.split('/')[-1]
    for n, f in files.items():
        if n.lower() == base.lower(): return f, pid
    return None, pid
def mat_info(s, pid):
    r, cid, size = s.reader(pid)
    name = r.str(); r.pptr(); r.str(); r.u32(); r.bool(); r.bool(); r.align(); r.i32()
    for _ in range(r.u32()): r.str(); r.str()
    for _ in range(r.u32()): r.str()
    tex = {}
    for _ in range(r.u32()):
        k = r.str(); p = r.pptr(); r.bytes(16)
        f, tp = resolve(s, *p) if p[1] else (None, 0)
        tex[k] = f.name_of(tp) if f and tp in f.objects else None
    floats = {}
    for _ in range(r.u32()): k = r.str(); floats[k] = round(r.f32(), 3)
    cols = {}
    for _ in range(r.u32()): k = r.str(); cols[k] = [round(r.f32(), 3) for _ in range(4)]
    return name, tex, cols
out = []
for n, s in files.items():
    gos = collections.defaultdict(dict)
    for pid, (o, sz, c, si) in s.objects.items():
        if c == 33:
            r, _, _ = s.reader(pid); go = r.pptr(); m = r.pptr(); gos[go[1]]['mesh'] = m
        elif c == 23:
            r, _, _ = s.reader(pid); go = r.pptr(); r.bytes(8); r.u32(); r.i32(); r.bytes(4); r.bytes(32)
            mats = [r.pptr() for _ in range(r.u32())]; gos[go[1]]['mats'] = mats
        elif c == 4:
            r, _, _ = s.reader(pid); go = r.pptr(); q = [r.f32() for _ in range(4)]; p = [r.f32() for _ in range(3)]; sc = [r.f32() for _ in range(3)]
            ch = [r.pptr()[1] for _ in range(r.u32())]; fa = r.pptr()[1]
            gos[go[1]].update(tr=pid, q=q, p=p, s=sc, children=ch, father=fa)
    trs = {g['tr']: gid for gid, g in gos.items() if 'tr' in g}
    for gid, g in gos.items():
        if 'mesh' not in g: continue
        ms, mp = resolve(s, *g['mesh'])
        mname = ms.name_of(mp) if ms and mp in ms.objects else None
        mats = []
        for mt in g.get('mats', []):
            f, p = resolve(s, *mt)
            try: mats.append(mat_info(f, p) if f and p in f.objects else None)
            except Exception as e: mats.append(('ERR', str(e)[:40]))
        # path
        path = []; cur = gid
        while cur is not None and cur in gos:
            path.append(s.name_of(cur)); fa = gos[cur].get('father'); cur = trs.get(fa)
        out.append(dict(file=n, go=gid, path='/'.join(reversed(path)), mesh=mname, meshfile=ms.name if ms else None, meshpid=mp, mats=mats, q=g.get('q'), p=g.get('p'), s=g.get('s')))
json.dump(out, open('yutlink.json', 'w'), ensure_ascii=False)
for o in out:
    print(o['file'][:14], '|', o['path'][:60], '|', o['mesh'], '|', [(m[0], m[1].get('_MainTex')) if m and m[0] != 'ERR' else m for m in o['mats']])
