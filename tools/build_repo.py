"""Build the GitHub-ready static project (multi-file) from the extracted assets + web sources."""
import json, base64, io, os, re, shutil, sys
from PIL import Image
sys.path.insert(0, '/home/claude/tools')

T = '/home/claude/tools'; OUT = '/home/claude/out'; WEB = '/home/claude/web'
DST = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/final/insaeng-yut'
E = json.load(open(f'{T}/export.json'))
A = json.load(open(f'{T}/atlases.json'))
FONTS = json.load(open(f'{T}/fonts.json'))
GAME_FILES = ['data.js', 'gm.js', 'game.js', 'yut.js', 'net.js', 'yut3d.js', 'board.js', 'play.js', 'yutshop.js']
LEVELS = {'title': 'level0', 'main': 'level1', 'shop': 'level3', 'cards': 'level8', 'loading': 'level9', 'game': 'level7', 'ready': 'level6', 'yut': 'level5'}
KEEP = {'Title Atlas', 'Common_Popup Atlas', 'MainMenu Atlas', 'UI_Direction_atlas', 'Yut Atlas', 'CharacterCard Atlas', 'CardPotrait Atlas',
        'CharacterCard_Direction_Additive_Atlas', 'InApp_Shop Atlas', 'CardGacha Atlas', 'CardShop Atlas', 'Loading_Atlas', 'CharacterCard_additional_texture',
        'Game_Atlas', 'Game_Direction_Additive_Atlas', 'Result_Atlas', 'Result_Direction_Additive_Atlas', 'Ready_Atlas', 'YutShop Atlas', 'QuestionCard Atlas'}
fn = lambda name: re.sub(r'[^A-Za-z0-9_\-]', '_', name)

if os.path.exists(DST): shutil.rmtree(DST)
for d in ['js', 'assets/img', 'assets/data', 'assets/font', 'tools']: os.makedirs(f'{DST}/{d}', exist_ok=True)

scenes = {k: E[v] for k, v in LEVELS.items()}
def strip(n):
    for c in n.get('c', []):
        for k in ('onFin', 'cb', 'group'): c.pop(k, None)
        if c['t'].startswith('Tween') and c['t'] != 'TweenRotation360': c.pop('raw', None)
    for k in n.get('k', []): strip(k)
used, texs, chars = set(['CharacterCard_Direction_Additive_Atlas', 'Yut Atlas']), set(), set()
def walk(n):
    for c in n.get('c', []):
        if c['t'] == 'S' and c.get('at'): used.add(c['at'])
        if c['t'] == 'T' and c.get('tex'): texs.add(c['tex'])
        if c['t'] == 'L': chars.update(c['tx'])
    for k in n.get('k', []): walk(k)
for roots in scenes.values():
    for r in roots: strip(r); walk(r)

def save_img(src, name):
    im = Image.open(src)
    b1 = io.BytesIO(); im.save(b1, 'WEBP', lossless=True, method=6)
    png = open(src, 'rb').read()
    if len(png) <= len(b1.getvalue()):
        open(f'{DST}/assets/img/{name}.png', 'wb').write(png); return f'assets/img/{name}.png'
    open(f'{DST}/assets/img/{name}.webp', 'wb').write(b1.getvalue()); return f'assets/img/{name}.webp'

import hq
NO2X = {'Title Atlas', 'InApp_Shop Atlas'}
atlas_js = {}
for a in sorted(used & KEEP):
    p = f'{OUT}/tex/{fn(A[a]["tex"])}.png'
    sp = {s['name']: [s['x'], s['y'], s['w'], s['h']] + s['border'] + s['pad'] for s in A[a]['sprites']}
    ent = dict(img=save_img(p, fn(a)), add=('Additive' in a), sp=sp, w=Image.open(p).width)
    if a not in NO2X:      # 큰 화면용 2배 선명한 아틀라스 (tools/hq.py)
        im2 = Image.open(hq.cached(p)); b2 = io.BytesIO(); im2.save(b2, 'WEBP', quality=90, alpha_quality=100, method=6)
        open(f'{DST}/assets/img/{fn(a)}@2x.webp', 'wb').write(b2.getvalue()); ent['img2'] = f'assets/img/{fn(a)}@2x.webp'
    atlas_js[a] = ent
tex_js = {}
for t in sorted(texs):
    p = f'{OUT}/tex/{fn(t)}.png'
    if os.path.exists(p): tex_js[t] = save_img(p, 'tex_' + fn(t))
fonts_js = {k: v for k, v in FONTS.items() if v['atlas'] in atlas_js}

game_src = '\n'.join(open(f'{WEB}/{f}', encoding='utf-8').read() for f in GAME_FILES)
snd_js = {}
for f in sorted(os.listdir(f'{OUT}/snd')):
    if ("'" + f[:-4] + "'") not in game_src: continue
    snd_js[f[:-4]] = 'data:audio/mpeg;base64,' + base64.b64encode(open(f'{OUT}/snd/{f}', 'rb').read()).decode()

def wjs(path, text): open(f'{DST}/{path}', 'w', encoding='utf-8').write(text)
wjs('assets/data/atlas.js', '// 자동 생성 파일 (tools/build_repo.py)\nconst ATLAS=' + json.dumps(atlas_js, separators=(',', ':')) + ';\nconst TEX=' + json.dumps(tex_js) + ';\nconst FONTS=' + json.dumps(fonts_js, separators=(',', ':')) + ';\n')
wjs('assets/data/scenes.js', '// 자동 생성 파일 — APK의 NGUI 화면 배치\nconst SCENES=' + json.dumps(scenes, ensure_ascii=False, separators=(',', ':')) + ';\n')
wjs('assets/data/yutmodels.js', '// 자동 생성 파일 (tools/yutmodels.py) — APK 안의 원작 3D 윷 모델과 텍스처\nconst YUTMODELS=' + hq.yut_hd(f'{T}/yutmodels.json') + ';\n')
wjs('assets/data/sounds.js', '// 자동 생성 파일 — APK 효과음/배경음 (FSB5 Vorbis → MP3)\nconst SOUNDS=' + json.dumps(snd_js, separators=(',', ':')) + ';\n')

# font subset
chars.update(game_src)
chars.update('0123456789,.:%/+-()[]!?~ abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
for cp in range(0xAC00, 0xD7A4):
    try: chr(cp).encode('euc-kr'); chars.add(chr(cp))
    except UnicodeEncodeError: pass
from fontTools import subset
from fontTools.ttLib import TTFont
opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['*']
font = TTFont(f'{OUT}/KoPubDotumBold.ttf')
sub = subset.Subsetter(opts); sub.populate(text=''.join(sorted(chars))); sub.subset(font)
font.flavor = 'woff'; font.save(f'{DST}/assets/font/KoPubDotumBold-subset.woff')

for f in ['runtime.js'] + GAME_FILES: shutil.copy(f'{WEB}/{f}', f'{DST}/js/{f}')
scripts = ['assets/data/atlas.js', 'assets/data/scenes.js', 'assets/data/sounds.js', 'assets/data/yutmodels.js', 'js/runtime.js'] + [f'js/{f}' for f in GAME_FILES]
html = '''<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>인생역전 윷놀이</title>
<style>
@font-face{font-family:KoPub;src:url(assets/font/KoPubDotumBold-subset.woff) format('woff');}
html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none}
body{display:flex;align-items:center;justify-content:center;font-family:KoPub,sans-serif}
canvas{display:block}
#boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:16px KoPub,sans-serif;background:#000}
</style></head><body>
<canvas id="c"></canvas><div id="boot">불러오는 중…</div>
''' + '\n'.join(f'<script src="{s}"></script>' for s in scripts) + '\n</body></html>\n'
wjs('index.html', html)
open(f'{DST}/.nojekyll', 'w').close()
wjs('.gitignore', '*.apk\n.DS_Store\n__pycache__/\n')
# extraction tools (for rebuilding from the APK)
for f in ['unity.py', 'tex.py', 'decode.py', 'mono.py', 'atlas.py', 'scene.py', 'export.py', 'fonts.py', 'fsb.py', 'audio.py', 'mesh.py', 'yutlink.py', 'yutmodels.py', 'hq.py', 'build_repo.py']:
    if os.path.exists(f'{T}/{f}'): shutil.copy(f'{T}/{f}', f'{DST}/tools/{f}')
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, dn, fs in os.walk(DST) for f in fs)
print('built', DST, round(tot / 1e6, 1), 'MB', len(atlas_js), 'atlases', len(snd_js), 'sounds')
