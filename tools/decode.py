import numpy as np, struct
from PIL import Image

ETC_MOD = [[2, 8, -2, -8], [5, 17, -5, -17], [9, 29, -9, -29], [13, 42, -13, -42],
           [18, 60, -18, -60], [24, 80, -24, -80], [33, 106, -33, -106], [47, 183, -47, -183]]
ETC2_DIST = [3, 6, 11, 16, 23, 32, 41, 64]
EAC_MOD = [[-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12], [-2, -5, -8, -13, 1, 4, 7, 12],
           [-2, -4, -6, -13, 1, 3, 5, 12], [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10],
           [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10], [-2, -6, -8, -10, 1, 5, 7, 9],
           [-2, -5, -8, -10, 1, 4, 7, 9], [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9],
           [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9], [-4, -6, -8, -9, 3, 5, 7, 8],
           [-3, -5, -7, -9, 2, 4, 6, 8]]


def c(v): return 0 if v < 0 else 255 if v > 255 else v
def ext4(v): return (v << 4) | v
def ext5(v): return (v << 3) | (v >> 2)
def ext6(v): return (v << 2) | (v >> 4)
def ext7(v): return (v << 1) | (v >> 6)


def etc_block(b, etc2):
    """returns 16 (r,g,b) tuples indexed [x*4+y]... we return 4x4 array [y][x]"""
    hi = struct.unpack('>I', b[0:4])[0]
    lo = struct.unpack('>I', b[4:8])[0]
    out = np.zeros((4, 4, 3), np.int32)
    diff = (hi >> 1) & 1
    flip = hi & 1

    def pix_idx(x, y):
        i = x * 4 + y
        msb = (lo >> (16 + i)) & 1
        lsb = (lo >> i) & 1
        return msb * 2 + lsb

    if not diff:
        r1, r2 = ext4((hi >> 28) & 15), ext4((hi >> 24) & 15)
        g1, g2 = ext4((hi >> 20) & 15), ext4((hi >> 16) & 15)
        b1, b2 = ext4((hi >> 12) & 15), ext4((hi >> 8) & 15)
    else:
        R, G, B = (hi >> 27) & 31, (hi >> 19) & 31, (hi >> 11) & 31
        dr, dg, db = (hi >> 24) & 7, (hi >> 16) & 7, (hi >> 8) & 7
        dr, dg, db = [d - 8 if d >= 4 else d for d in (dr, dg, db)]
        R2, G2, B2 = R + dr, G + dg, B + db
        if etc2 and not (0 <= R2 <= 31):
            # T mode
            ra = ((hi >> 27) & 3) << 2 | ((hi >> 24) & 3)
            c0 = (ext4(ra), ext4((hi >> 20) & 15), ext4((hi >> 16) & 15))
            c1 = (ext4((hi >> 12) & 15), ext4((hi >> 8) & 15), ext4((hi >> 4) & 15))
            d = ETC2_DIST[((hi >> 2) & 3) << 1 | (hi & 1)]
            pal = [c0, tuple(c(x + d) for x in c1), c1, tuple(c(x - d) for x in c1)]
            for x in range(4):
                for y in range(4): out[y, x] = pal[pix_idx(x, y)]
            return out
        if etc2 and not (0 <= G2 <= 31):
            # H mode
            r0 = (hi >> 27) & 15
            g0 = ((hi >> 24) & 7) << 1 | ((hi >> 20) & 1)
            b0 = ((hi >> 19) & 1) << 3 | ((hi >> 15) & 7)
            r1_ = (hi >> 11) & 15; g1_ = (hi >> 7) & 15; b1_ = (hi >> 3) & 15
            c0 = (ext4(r0), ext4(g0), ext4(b0)); c1 = (ext4(r1_), ext4(g1_), ext4(b1_))
            v0 = (c0[0] << 16) | (c0[1] << 8) | c0[2]; v1 = (c1[0] << 16) | (c1[1] << 8) | c1[2]
            di = (hi & 4) | ((hi & 1) << 1) | (1 if v0 >= v1 else 0)
            d = ETC2_DIST[di]
            pal = [tuple(c(x + d) for x in c0), tuple(c(x - d) for x in c0), tuple(c(x + d) for x in c1), tuple(c(x - d) for x in c1)]
            for x in range(4):
                for y in range(4): out[y, x] = pal[pix_idx(x, y)]
            return out
        if etc2 and not (0 <= B2 <= 31):
            # planar
            v = (hi << 32) | lo
            ro = ext6((v >> 57) & 63)
            go = ext7(((v >> 56) & 1) << 6 | ((v >> 49) & 63))
            bo = ext6(((v >> 48) & 1) << 5 | ((v >> 43) & 3) << 3 | ((v >> 39) & 7))
            rh = ext6(((v >> 34) & 31) << 1 | ((v >> 32) & 1))
            gh = ext7((v >> 25) & 127)
            bh = ext6((v >> 19) & 63)
            rv = ext6((v >> 13) & 63)
            gv = ext7((v >> 6) & 127)
            bv = ext6(v & 63)
            for x in range(4):
                for y in range(4):
                    out[y, x] = (c((x * (rh - ro) + y * (rv - ro) + 4 * ro + 2) >> 2),
                                 c((x * (gh - go) + y * (gv - go) + 4 * go + 2) >> 2),
                                 c((x * (bh - bo) + y * (bv - bo) + 4 * bo + 2) >> 2))
            return out
        r1, g1, b1 = ext5(R), ext5(G), ext5(B)
        r2, g2, b2 = ext5(R2 & 31), ext5(G2 & 31), ext5(B2 & 31)
    t1 = (hi >> 5) & 7; t2 = (hi >> 2) & 7
    for x in range(4):
        for y in range(4):
            sub2 = (y >= 2) if flip else (x >= 2)
            base = (r2, g2, b2) if sub2 else (r1, g1, b1)
            m = ETC_MOD[t2 if sub2 else t1][[0, 1, 2, 3][pix_idx(x, y)]]
            # index mapping: msb,lsb -> 00:+a 01:+b 10:-a 11:-b
            out[y, x] = (c(base[0] + m), c(base[1] + m), c(base[2] + m))
    return out


def eac_alpha(b):
    v = struct.unpack('>Q', b)[0]
    base = v >> 56; mul = (v >> 52) & 15; tbl = EAC_MOD[(v >> 48) & 15]
    out = np.zeros((4, 4), np.int32)
    for i in range(16):
        idx = (v >> (45 - 3 * i)) & 7
        x, y = i // 4, i % 4
        out[y, x] = c(base + tbl[idx] * mul)
    return out


def decode_etc(data, w, h, alpha):
    bw, bh = (w + 3) // 4, (h + 3) // 4
    img = np.zeros((bh * 4, bw * 4, 4), np.uint8); img[..., 3] = 255
    step = 16 if alpha else 8
    p = 0
    for by in range(bh):
        for bx in range(bw):
            if alpha:
                img[by * 4:by * 4 + 4, bx * 4:bx * 4 + 4, 3] = eac_alpha(data[p:p + 8])
                img[by * 4:by * 4 + 4, bx * 4:bx * 4 + 4, :3] = etc_block(data[p + 8:p + 16], True)
            else:
                img[by * 4:by * 4 + 4, bx * 4:bx * 4 + 4, :3] = etc_block(data[p:p + 8], True)
            p += step
    return img[:h, :w]


def to_image(t):
    w, h, f, d = t['w'], t['h'], t['fmt'], t['data']
    if f == 4:
        a = np.frombuffer(d[:w * h * 4], np.uint8).reshape(h, w, 4)
    elif f == 3:
        a = np.frombuffer(d[:w * h * 3], np.uint8).reshape(h, w, 3)
        a = np.dstack([a, np.full((h, w), 255, np.uint8)])
    elif f == 13:  # RGBA4444
        v = np.frombuffer(d[:w * h * 2], '<u2').reshape(h, w).astype(np.uint16)
        a = np.dstack([(v >> 12) & 15, (v >> 8) & 15, (v >> 4) & 15, v & 15]).astype(np.uint8) * 17
    elif f == 1:
        v = np.frombuffer(d[:w * h], np.uint8).reshape(h, w)
        a = np.dstack([np.full((h, w), 255, np.uint8)] * 3 + [v])
    elif f == 34:
        a = decode_etc(d, w, h, False)
    elif f == 47:
        a = decode_etc(d, w, h, True)
    else:
        return None
    return Image.fromarray(np.ascontiguousarray(a), 'RGBA').transpose(Image.FLIP_TOP_BOTTOM)
