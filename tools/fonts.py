import pickle, json, mono, scene
idx = pickle.load(open('/home/claude/tools/mono_index.pkl', 'rb'))
def parse_font(n, pid):
    s = mono.get(n); r, go, sc, nm = mono.mono_header(s, pid)
    mat = r.pptr(); uv = [r.f32() for _ in range(4)]
    size, base, w, h = r.i32(), r.i32(), r.i32(), r.i32(); sprite = r.str()
    cnt = r.i32(); glyphs = {}
    for _ in range(cnt):
        g = [r.i32() for _ in range(9)]; k = r.i32(); kern = [r.i32() for _ in range(k)]
        glyphs[g[0]] = g[1:8]
    atlas = r.pptr()
    at = scene.ATLAS_TEX.get((mono.ext_name(s, atlas[0]), atlas[1]))
    return dict(size=size, base=base, sprite=sprite, atlas=at, g=glyphs)
if __name__ == '__main__':
    F = {}
    for n, pid, cls, name, sz in idx:
        if cls == 'UIFont':
            try:
                f = parse_font(n, pid); F[f'{n}:{pid}'] = f
                print(n[:10], pid, f['sprite'], f['atlas'], f['size'], len(f['g']), ''.join(chr(c) for c in sorted(f['g'])))
            except Exception as e: print('ERR', n, pid, e)
    json.dump(F, open('/home/claude/tools/fonts.json', 'w'), ensure_ascii=False)
