import unity, struct, numpy as np

FMT = {0: ('f', 4), 1: ('e', 2), 2: ('B', 1), 3: ('B', 1), 4: ('b', 1), 5: ('H', 2), 6: ('h', 2), 7: ('B', 1), 8: ('b', 1), 9: ('H', 2), 10: ('h', 2), 11: ('I', 4), 12: ('i', 4)}

def packed(r):  # PackedBitVector (float): numItems, range, start, data, bitSize
    n = r.u32(); rg = r.f32(); st = r.f32(); d = r.bytes(r.u32()); r.align(); bs = r.u8(); r.align(); return n
def packed_i(r):
    n = r.u32(); d = r.bytes(r.u32()); r.align(); bs = r.u8(); r.align(); return n
def packed_q(r):
    n = r.u32(); d = r.bytes(r.u32()); r.align(); return n

def read_mesh(s, pid):
    r, cid, size = s.reader(pid); assert cid == 43
    m = {'name': r.str()}
    subs = []
    for _ in range(r.u32()):
        fb, ic, topo, bv, fv, vc = r.u32(), r.u32(), r.i32(), r.u32(), r.u32(), r.u32(); r.bytes(24)
        subs.append(dict(firstByte=fb, indexCount=ic, topo=topo, baseVertex=bv, firstVertex=fv, vertexCount=vc))
    m['subs'] = subs
    # BlendShapeData
    n = r.u32(); r.bytes(n * 40)
    n = r.u32(); r.bytes(n * 12)
    for _ in range(r.u32()): r.str(); r.bytes(12)
    n = r.u32(); r.bytes(n * 4)
    n = r.u32(); r.bytes(n * 64)       # bind poses
    n = r.u32(); r.bytes(n * 4)        # bone name hashes
    r.u32()                            # root bone hash
    m['compression'] = r.u8(); r.bool(); r.bool(); r.bool(); r.align()
    m['indexFormat'] = r.i32()
    n = r.u32(); ib = r.bytes(n); r.align()
    vc = r.u32(); m['vcount'] = vc
    chans = [(r.u8(), r.u8(), r.u8(), r.u8()) for _ in range(r.u32())]
    m['chans'] = chans
    n = r.u32(); vd = r.bytes(n); r.align()
    m['idx'] = np.frombuffer(ib, dtype='<u2' if m['indexFormat'] == 0 else '<u4').astype(np.int32)
    # streams
    nstream = max([c[0] for c in chans if c[3]] + [0]) + 1
    strides = [0] * nstream
    for st, off, fmt, dim in chans:
        if dim: strides[st] = max(strides[st], off + FMT[fmt][1] * (dim & 0xF))
    strides = [(x + 3) // 4 * 4 for x in strides]
    offs = []; o = 0
    for i in range(nstream):
        offs.append(o); o += strides[i] * vc; o = (o + 15) // 16 * 16
    out = {}
    for ci, (st, off, fmt, dim) in enumerate(chans):
        dim &= 0xF
        if not dim: continue
        ch, sz = FMT[fmt]
        a = np.zeros((vc, dim), dtype=np.float32)
        base = offs[st]
        raw = np.frombuffer(vd, dtype=np.uint8)
        view = np.lib.stride_tricks.as_strided(raw[base + off:], shape=(vc, sz * dim), strides=(strides[st], 1)) if vc else raw[:0]
        a = np.ascontiguousarray(view).view('<' + ch).astype(np.float32).reshape(vc, dim) if vc else a
        if fmt in (2, 3): a = a / 255.0
        out[ci] = a
    m['ch'] = out; m['vdsize'] = len(vd); m['strides'] = strides
    return m

if __name__ == '__main__':
    for n in unity.all_files():
        s = unity.SFile(n)
        for pid, (o, sz, c, si) in s.objects.items():
            if c == 43 and not n.startswith('unity'):
                try:
                    m = read_mesh(s, pid)
                    p = m['ch'].get(0)
                    print(n[:12], pid, m['name'], 'v', m['vcount'], 'i', len(m['idx']), 'subs', len(m['subs']), 'cmp', m['compression'], 'ch', [(i, c) for i, c in enumerate(m['chans']) if c[3]], 'bb', None if p is None or not len(p) else (p.min(0).round(2).tolist(), p.max(0).round(2).tolist()))
                except Exception as e:
                    print(n[:12], pid, 'ERR', repr(e)[:100])
