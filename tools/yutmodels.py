"""Export the original 3D yut sticks (meshes + textures) from the APK for the WebGL throw animation."""
import json, base64, io, re, numpy as np
from PIL import Image
import unity
from mesh import read_mesh

OUT = '/home/claude/out'
# shop order: 기본·밤나무·편백·월넛·명품·지하철·블랙·바게트·레인보우·유성·파라오
SKINS = ['001_Basic_Wood', '002_Dark_Wood', '010_HinokiCypress', '013_Walnut', '009_Luxury', '007_Metro_No02', '011_Black', '015_Baguette', '012_Rainbow', '017_Meteor', '021_Egypt']
L = json.load(open('yutlink.json'))
files = {}
def sfile(n):
    if n not in files: files[n] = unity.SFile(n)
    return files[n]

def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def pick(skin, kind):
    num, name = skin.split('_', 1)
    cands = {}
    for o in L:
        top = o['path'].split('/')[0]
        if name.lower().replace('_', '') not in top.lower().replace('_', ''): continue
        if not top.lower().endswith(kind.lower()): continue
        cands.setdefault(o['file'], []).append(o)
    best = None
    for f, parts in cands.items():
        ok = all(p['mats'] and p['mats'][0] and p['mats'][0][0] != 'ERR' and p['mats'][0][1].get('_MainTex') for p in parts)
        if ok and (best is None or len(parts) >= len(best)): best = parts
    return best

def build(skin, kind):
    parts = pick(skin, kind)
    assert parts, (skin, kind)
    groups = []; main = None
    for p in parts:
        mat = p['mats'][0]; tex = mat[1]['_MainTex']
        if tex.lower().endswith('_light'): continue
        m = read_mesh(sfile(p['meshfile']), p['meshpid'])
        R = qmat(p['q']); S = np.array(p['s'])
        pos = (m['ch'][0] * S) @ R.T + np.array(p['p'])
        nrm = (m['ch'][1] / S) @ R.T; nrm /= np.maximum(1e-9, np.linalg.norm(nrm, axis=1, keepdims=True))
        belly = R @ (np.array([0, 0, -1.0]) / S); belly /= np.linalg.norm(belly)
        uv = m['ch'][4]
        idx = m['idx'].reshape(-1, 3)
        if np.prod(S) < 0: idx = idx[:, ::-1]
        g = dict(pos=pos, nrm=nrm, uv=uv, idx=idx, tex=tex, shiny=('gold' in mat[0].lower() or 'specular' in mat[0].lower()), belly=belly)
        groups.append(g)
        if main is None or len(pos) > len(main['pos']): main = g
    allp = np.concatenate([g['pos'] for g in groups])
    lo, hi = allp.min(0), allp.max(0); ext = hi - lo
    la = int(np.argmax(ext))
    # canonical frame: X = length, -Y = belly (flat side), Z = X x Y
    by = -main['belly']; by[la] = 0; by /= np.linalg.norm(by)
    bx = np.zeros(3); bx[la] = 1.0
    bz = np.cross(bx, by)
    B = np.stack([bx, by, bz])          # rows
    c = (lo + hi) / 2
    scale = 1.0 / ext[la]
    V = []; I = []; G = []; base = 0
    for g in groups:
        p = ((g['pos'] - c) @ B.T) * scale
        n = g['nrm'] @ B.T
        V.append(np.concatenate([p, n, g['uv']], axis=1)); I.append(g['idx'] + base)
        G.append(dict(tex=g['tex'], start=int(sum(len(x) for x in I[:-1]) * 3), count=int(len(g['idx']) * 3), shiny=bool(g['shiny'])))
        base += len(p)
    V = np.concatenate(V); I = np.concatenate(I)
    p = V[:, :3]
    return V, I, G, (p.max(0) - p.min(0))

def b64(a): return base64.b64encode(a.tobytes()).decode()
out = {'tex': {}, 'skins': []}
for skin in SKINS:
    rec = {'name': skin}
    for kind, key in (('Normal', 'n'), ('BackDo', 'b')):
        V, I, G, ext = build(skin, kind)
        q = np.concatenate([np.round(V[:, :3] * 30000), np.round(V[:, 3:6] * 32767), np.round(V[:, 6:8] * 8192)], axis=1)
        assert np.abs(q).max() < 32768, (skin, kind, np.abs(V[:, 6:8]).max())
        rec[key] = dict(v=b64(q.astype('<i2')), i=b64(I.astype('<u2').reshape(-1)), g=G, nv=int(len(V)), ext=[round(float(x), 4) for x in ext])
        for g in G:
            if g['tex'] not in out['tex']:
                im = Image.open(f"{OUT}/tex/{g['tex']}.png").convert('RGBA')
                if im.width > 128: im = im.resize((im.width // 2 if im.width > 256 else im.width, im.height // 2 if im.width > 256 else im.height), Image.LANCZOS)
                buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
                out['tex'][g['tex']] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        print(skin, kind, 'verts', len(V), 'tris', len(I), 'groups', [(g['tex'], g['count'], g['shiny']) for g in G], 'ext', rec[key]['ext'])
    out['skins'].append(rec)
json.dump(out, open('yutmodels.json', 'w'), separators=(',', ':'))
import os; print('yutmodels.json', os.path.getsize('yutmodels.json') // 1024, 'KB')
