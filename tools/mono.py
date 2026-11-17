import unity, os, pickle, collections

_files = {}
def get(n):
    if n not in _files: _files[n] = unity.SFile(n)
    return _files[n]

def ext_name(s, fid):
    if fid == 0: return s.name
    e = s.externals[fid - 1]
    e = e.replace('library/', '').replace('Library/', '')
    if e.startswith('archive:/'): e = os.path.basename(e)
    return e

def script_names():
    out = {}
    for n in unity.all_files():
        s = get(n)
        for pid, (o, sz, c, si) in s.objects.items():
            if c == 115:
                r, _, _ = s.reader(pid)
                name = r.str(); r.i32(); r.bytes(16); cls = r.str(); ns = r.str(); asm = r.str()
                out[(n, pid)] = cls
    return out

def mono_header(s, pid):
    r, cid, size = s.reader(pid)
    go = r.pptr(); r.u8(); r.align(); sc = r.pptr(); name = r.str()
    return r, go, sc, name

if __name__ == '__main__':
    sn = script_names()
    cnt = collections.Counter()
    index = []
    for n in unity.all_files():
        s = get(n)
        for pid, (o, sz, c, si) in s.objects.items():
            if c == 114:
                r, go, sc, name = mono_header(s, pid)
                key = (ext_name(s, sc[0]), sc[1])
                cls = sn.get(key, '?')
                cnt[cls] += 1
                index.append((n, pid, cls, name, sz))
    pickle.dump(index, open('/home/claude/tools/mono_index.pkl', 'wb'))
    print(cnt.most_common(200))
