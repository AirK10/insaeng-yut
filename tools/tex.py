import unity, os

def read_tex(s, pid):
    r, cid, size = s.reader(pid)
    assert cid == 28
    t = {}
    t['name'] = r.str()
    t['fallback'] = r.i32(); r.bool(); r.align()
    t['w'] = r.i32(); t['h'] = r.i32(); t['complete'] = r.i32(); t['fmt'] = r.i32(); t['mips'] = r.i32()
    r.bool(); r.bool(); r.align(); r.i32()  # readable, streaming mips, priority
    t['imgcount'] = r.i32(); t['dim'] = r.i32()
    r.i32(); r.i32(); r.f32(); r.i32(); r.i32(); r.i32()  # texture settings
    r.i32(); r.i32()  # lightmap fmt, colorspace
    n = r.i32(); t['data'] = r.bytes(n); r.align()
    t['so'] = r.u32(); t['ss'] = r.u32(); t['spath'] = r.str()
    if not t['data'] and t['ss']:
        p = t['spath'].replace('archive:/', '')
        p = os.path.join(unity.DATA, os.path.basename(p))
        with open(p, 'rb') as f:
            f.seek(t['so']); t['data'] = f.read(t['ss'])
    return t

def all_textures():
    out = []
    for n in unity.all_files():
        s = unity.SFile(n)
        for pid, (o, sz, c, si) in s.objects.items():
            if c == 28:
                out.append((n, pid, s))
    return out

if __name__ == '__main__':
    import collections
    fm = collections.Counter()
    for n, pid, s in all_textures():
        t = read_tex(s, pid)
        fm[t['fmt']] += 1
        print(n[:12], pid, repr(t['name']), t['w'], t['h'], 'fmt', t['fmt'], 'mips', t['mips'], len(t['data']), t['spath'][:30])
    print(fm)
