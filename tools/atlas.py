import pickle, json, re, os
import mono, unity
from PIL import Image

index = pickle.load(open('/home/claude/tools/mono_index.pkl', 'rb'))

def mat_texture_name(s, pptr):
    """Material -> main texture name (search texenv for _MainTex)."""
    fn = mono.ext_name(s, pptr[0]); ms = mono.get(fn)
    r, cid, size = ms.reader(pptr[1])
    name = r.str(); shader = r.pptr(); kw = r.str()
    r.u32(); r.u8(); r.align(); r.i32()  # lightmap flags, gpu instancing, custom render queue
    n = r.i32()
    for _ in range(n): r.str(); r.str()  # stringTagMap
    n = r.i32()
    for _ in range(n): r.str()  # disabled shader passes
    n = r.i32()
    for _ in range(n):
        k = r.str(); tp = r.pptr(); r.f32(); r.f32(); r.f32(); r.f32()
        if k == '_MainTex' and tp[1]:
            tfn = mono.ext_name(ms, tp[0]); ts = mono.get(tfn)
            return ts.name_of(tp[1])
    return None

def parse_atlas(n, pid):
    s = mono.get(n)
    r, go, sc, name = mono.mono_header(s, pid)
    mat = r.pptr()
    cnt = r.i32(); sprites = []
    for _ in range(cnt):
        nm = r.str(); vals = [r.i32() for _ in range(12)]
        sprites.append(dict(name=nm, x=vals[0], y=vals[1], w=vals[2], h=vals[3], border=vals[4:8], pad=vals[8:12]))
    return name, mat, sprites, s

if __name__ == '__main__':
    allat = {}
    for (n, pid, cls, name, sz) in index:
        if cls == 'UIAtlas':
            try:
                aname, mat, sprites, s = parse_atlas(n, pid)
                tn = mat_texture_name(s, mat) if mat[1] else None
            except Exception as e:
                print('ERR', n, pid, e); continue
            print(n, pid, repr(aname), 'tex=', tn, len(sprites))
            allat[aname or tn] = dict(tex=tn, sprites=sprites)
    json.dump(allat, open('/home/claude/tools/atlases.json', 'w'), ensure_ascii=False)
