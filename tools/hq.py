"""2x upscale for UI atlases: premultiplied-alpha Lanczos + light unsharp mask (crisper on large screens)."""
import numpy as np, os
from PIL import Image, ImageFilter
def up2(img):
    img = img.convert('RGBA')
    arr = np.asarray(img).astype(np.float32) / 255; al = arr[..., 3:4]
    pm = np.concatenate([arr[..., :3] * al, al], -1)
    P = Image.fromarray((pm * 255).round().astype(np.uint8), 'RGBA').resize((img.width * 2, img.height * 2), Image.LANCZOS)
    P = P.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=1))
    q = np.asarray(P).astype(np.float32) / 255; a2 = q[..., 3:4]
    rgb = np.where(a2 > 1e-4, q[..., :3] / np.maximum(a2, 1e-4), 0)
    return Image.fromarray((np.clip(np.concatenate([rgb, a2], -1), 0, 1) * 255).round().astype(np.uint8), 'RGBA')
def cached(src):
    dst = '/home/claude/out/tex2x/' + os.path.basename(src)
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src): up2(Image.open(src)).save(dst)
    return dst
def yut_hd(src_json):
    """3D 윷 텍스처를 2배로 키운 yutmodels.json 문자열 (가까이 날아올 때도 나뭇결·무늬가 선명하게)."""
    import json, base64, io
    dst = '/home/claude/out/yutmodels_hd.json'
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src_json) and os.path.getmtime(dst) >= os.path.getmtime(__file__):
        return open(dst).read()
    M = json.load(open(src_json))
    for k, v in M['tex'].items():
        im = Image.open(io.BytesIO(base64.b64decode(v.split(',', 1)[1])))
        big = up2(im)
        b = io.BytesIO(); big.save(b, 'WEBP', quality=92, method=6)
        M['tex'][k] = 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
    s = json.dumps(M, separators=(',', ':')); open(dst, 'w').write(s); return s
