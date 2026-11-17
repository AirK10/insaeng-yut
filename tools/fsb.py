import struct, zlib, ctypes, ctypes.util, os, sys

FREQ = {1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050, 6: 24000, 7: 32000, 8: 44100, 9: 48000}


def parse_fsb5(b):
    assert b[:4] == b'FSB5'
    ver, nsamp, shsize, namesize, datasize, mode = struct.unpack_from('<6I', b, 4)
    hdr = 0x3c if ver == 1 else 0x40
    p = hdr
    samples = []
    for i in range(nsamp):
        v = struct.unpack_from('<Q', b, p)[0]; p += 8
        more = v & 1; freq = FREQ.get((v >> 1) & 15); ch = ((v >> 5) & 1) + 1
        off = ((v >> 6) & 0xFFFFFFF) * 16; ns = v >> 34
        info = dict(freq=freq, ch=ch, off=off, nsamples=ns)
        while more:
            c = struct.unpack_from('<I', b, p)[0]; p += 4
            more = c & 1; size = (c >> 1) & 0xFFFFFF; typ = c >> 25
            body = b[p:p + size]; p += size
            if typ == 1: info['ch'] = body[0]
            elif typ == 2: info['freq'] = struct.unpack_from('<I', body)[0]
            elif typ == 3: info['loop'] = struct.unpack_from('<II', body)
            elif typ == 11: info['crc'] = struct.unpack_from('<I', body)[0]
        samples.append(info)
    data_start = hdr + shsize + namesize
    for i, s in enumerate(samples):
        end = samples[i + 1]['off'] if i + 1 < len(samples) else datasize
        s['data'] = b[data_start + s['off']:data_start + end]
    return mode, samples


# ---- libvorbis via ctypes ----
lv = ctypes.CDLL('libvorbis.so.0'); le = ctypes.CDLL('libvorbisenc.so.2')

class ogg_packet(ctypes.Structure):
    _fields_ = [('packet', ctypes.POINTER(ctypes.c_ubyte)), ('bytes', ctypes.c_long), ('b_o_s', ctypes.c_long),
                ('e_o_s', ctypes.c_long), ('granulepos', ctypes.c_int64), ('packetno', ctypes.c_int64)]

VI = ctypes.c_char * 512; VD = ctypes.c_char * 1024; VC = ctypes.c_char * 256

def headers_for(ch, rate, q):
    vi = VI(); vc = VC(); vd = VD()
    lv.vorbis_info_init(vi)
    r = le.vorbis_encode_init_vbr(vi, ctypes.c_long(ch), ctypes.c_long(rate), ctypes.c_float(q))
    if r != 0:
        lv.vorbis_info_clear(vi); return None
    lv.vorbis_comment_init(vc)
    lv.vorbis_analysis_init(vd, vi)
    a, bb, c = ogg_packet(), ogg_packet(), ogg_packet()
    lv.vorbis_analysis_headerout(vd, vc, ctypes.byref(a), ctypes.byref(bb), ctypes.byref(c))
    out = [ctypes.string_at(p.packet, p.bytes) for p in (a, bb, c)]
    lv.vorbis_dsp_clear(vd); lv.vorbis_comment_clear(vc); lv.vorbis_info_clear(vi)
    return out

_cache = {}
def find_setup(ch, rate, crc):
    key = (ch, rate)
    if key not in _cache:
        d = {}
        for qi in range(-10, 101):
            h = headers_for(ch, rate, qi / 100)
            if h: d.setdefault(zlib.crc32(h[2]) & 0xffffffff, h)
        _cache[key] = d
    return _cache[key].get(crc)


# ---- ogg writer ----
def ogg_crc(data):
    crc = 0
    for byte in data:
        crc ^= byte << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04c11db7) & 0xffffffff if crc & 0x80000000 else (crc << 1) & 0xffffffff
    return crc

_T = []
for i in range(256):
    c = i << 24
    for _ in range(8): c = ((c << 1) ^ 0x04c11db7) & 0xffffffff if c & 0x80000000 else (c << 1) & 0xffffffff
    _T.append(c)
def ogg_crc_fast(data):
    crc = 0
    for byte in data: crc = ((crc << 8) & 0xffffffff) ^ _T[((crc >> 24) ^ byte) & 0xff]
    return crc

def ogg_page(serial, seq, gran, flags, packets):
    segs = []
    for p in packets:
        n = len(p)
        while n >= 255: segs.append(255); n -= 255
        segs.append(n)
    hdr = struct.pack('<4sBBqIII', b'OggS', 0, flags, gran, serial, seq, 0) + bytes([len(segs)]) + bytes(segs)
    body = b''.join(packets)
    page = bytearray(hdr + body)
    struct.pack_into('<I', page, 22, ogg_crc_fast(page))
    return bytes(page)


def packet_blocksize(pkt, mode_bits, mode_blockflags):
    # first bit: packet type 0, next mode_bits bits mode number
    v = int.from_bytes(pkt[:4].ljust(4, b'\0'), 'little') >> 1
    m = v & ((1 << mode_bits) - 1)
    return mode_blockflags[m]


def parse_setup_modes(setup, ch):
    """Read mode blockflags from setup header (bit-reader, from end: modes are last)."""
    # Simplest robust approach: parse from the end. Modes section: count-1 (6 bits), each mode: blockflag(1) windowtype(16) transformtype(16) mapping(8); framing bit.
    bits = []
    for byte in setup:
        for i in range(8): bits.append((byte >> i) & 1)
    # find framing bit: last set bit
    end = len(bits) - 1
    while bits[end] == 0: end -= 1
    # try mode counts from 1..64 going backwards
    best = None
    for count in range(1, 65):
        start = end - count * 41 - 6
        if start < 0: break
        val = sum(bits[start + i] << i for i in range(6))
        if val == count - 1:
            ok = True; flags = []
            for m in range(count):
                o = start + 6 + m * 41
                wt = sum(bits[o + 1 + i] << i for i in range(16)); tt = sum(bits[o + 17 + i] << i for i in range(16))
                if wt or tt: ok = False; break
                flags.append(bits[o])
            if ok: best = flags
    if best is None: raise ValueError('modes not found')
    return best


def to_ogg(sample, hdrs):
    ident, comment, setup = hdrs
    bs0 = 1 << (ident[28] & 15); bs1 = 1 << (ident[28] >> 4)
    flags = parse_setup_modes(setup, sample['ch'])
    mode_bits = (len(flags) - 1).bit_length()
    serial = 0x1234
    pages = [ogg_page(serial, 0, 0, 2, [ident]), ogg_page(serial, 1, 0, 0, [comment, setup])]
    d = sample['data']; p = 0; pkts = []
    while p + 2 <= len(d):
        n = struct.unpack_from('<H', d, p)[0]; p += 2
        if n == 0: break
        pkts.append(d[p:p + n]); p += n
    gran = 0; prev = None; seq = 2; buf = []; bufsize = 0
    total = sample['nsamples']
    for i, pk in enumerate(pkts):
        bs = bs1 if packet_blocksize(pk, mode_bits, flags) else bs0
        if prev is not None: gran += prev // 4 + bs // 4
        prev = bs
        buf.append(pk); bufsize += len(pk)
        last = i == len(pkts) - 1
        if bufsize > 4000 or last:
            g = min(gran, total) if last else gran
            pages.append(ogg_page(serial, seq, g, 4 if last else 0, buf)); seq += 1; buf = []; bufsize = 0
    return b''.join(pages)


if __name__ == '__main__':
    b = open(sys.argv[1], 'rb').read()
    mode, ss = parse_fsb5(b)
    for s in ss:
        print(mode, {k: v for k, v in s.items() if k != 'data'}, len(s['data']))
        h = find_setup(s['ch'], s['freq'], s.get('crc'))
        print('setup found' if h else 'NO SETUP')
        if h and len(sys.argv) > 2:
            open(sys.argv[2], 'wb').write(to_ogg(s, h))
