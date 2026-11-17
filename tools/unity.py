"""Minimal Unity 2018.4 serialized-file reader (format v17, no type trees)."""
import struct, os, glob, re

DATA = '/home/claude/apk/x/assets/bin/Data'

CLASS = {1:'GameObject',4:'Transform',21:'Material',28:'Texture2D',43:'Mesh',48:'Shader',49:'TextAsset',
         74:'AnimationClip',83:'AudioClip',91:'AnimatorController',95:'Animator',114:'MonoBehaviour',115:'MonoScript',
         128:'Font',213:'Sprite',224:'RectTransform',222:'CanvasRenderer',687078895:'SpriteAtlas',142:'AssetBundle',
         150:'PreloadData',212:'SpriteRenderer',198:'ParticleSystem',199:'ParticleSystemRenderer',23:'MeshRenderer',33:'MeshFilter',
         137:'SkinnedMeshRenderer',111:'Animation',82:'AudioSource',20:'Camera',108:'Light',223:'Canvas'}


class Reader:
    def __init__(self, b, pos=0, end='<'):
        self.b, self.p, self.e = b, pos, end
    def u(self, fmt):
        v = struct.unpack_from(self.e + fmt, self.b, self.p); self.p += struct.calcsize(fmt); return v[0]
    def i32(self): return self.u('i')
    def u32(self): return self.u('I')
    def i64(self): return self.u('q')
    def f32(self): return self.u('f')
    def bool(self): return self.u('?')
    def u8(self): return self.u('B')
    def align(self, n=4): self.p = (self.p + n - 1) // n * n
    def bytes(self, n): v = self.b[self.p:self.p + n]; self.p += n; return v
    def str(self):
        n = self.i32(); s = self.b[self.p:self.p + n].decode('utf-8', 'replace'); self.p += n; self.align(); return s
    def cstr(self):
        e = self.b.index(b'\0', self.p); s = self.b[self.p:e].decode('utf-8', 'replace'); self.p = e + 1; return s
    def pptr(self): return (self.i32(), self.i64())


def load_bytes(name):
    path = os.path.join(DATA, name)
    if os.path.exists(path):
        return open(path, 'rb').read()
    parts = sorted(glob.glob(path + '.split*'), key=lambda x: int(x.rsplit('split', 1)[1]))
    return b''.join(open(p, 'rb').read() for p in parts)


class SFile:
    def __init__(self, name):
        self.name = name
        b = self.b = load_bytes(name)
        r = Reader(b, 0, '>')
        self.meta_size, self.file_size, self.version, self.data_off = r.u32(), r.u32(), r.u32(), r.u32()
        endian = b[16]
        r = Reader(b, 20, '>' if endian else '<')
        self.unity = r.cstr(); self.platform = r.i32(); self.tt = r.bool()
        assert not self.tt
        n = r.i32(); self.types = []
        for _ in range(n):
            cid = r.i32(); stripped = r.bool(); sidx = r.u('h')
            if cid == 114: r.bytes(16)
            r.bytes(16)
            self.types.append((cid, sidx))
        n = r.i32(); self.objects = {}
        for _ in range(n):
            r.align(); pid = r.i64(); start = r.u32(); size = r.u32(); t = r.i32()
            self.objects[pid] = (self.data_off + start, size, self.types[t][0], self.types[t][1])
        n = r.i32(); self.scripts = [(r.i32(), (r.align(), r.i64())[1]) for _ in range(n)]
        n = r.i32(); self.externals = []
        for _ in range(n):
            r.cstr(); r.bytes(16); r.i32(); self.externals.append(r.cstr())

    def reader(self, pid):
        off, size, cid, _ = self.objects[pid]
        return Reader(self.b, off, '<'), cid, size

    def name_of(self, pid):
        r, cid, size = self.reader(pid)
        if cid in (21, 28, 43, 48, 49, 74, 83, 128, 213, 91, 687078895, 115, 142, 150):
            try:
                n = r.i32()
                if 0 <= n < 512: return r.b[r.p:r.p + n].decode('utf-8', 'replace')
            except Exception: pass
        if cid == 1:
            try:
                n = r.i32(); r.p += n * 12; r.i32(); return r.str()
            except Exception: pass
        if cid == 114:
            try:
                r.pptr(); r.u8(); r.align(); r.pptr(); return r.str()
            except Exception: pass
        return ''


def all_files():
    names = set()
    for f in os.listdir(DATA):
        p = os.path.join(DATA, f)
        if os.path.isdir(p) or f.endswith('.resource') or f.endswith('.resS') or f == 'boot.config': continue
        names.add(re.sub(r'\.split\d+$', '', f))
    return sorted(names)
