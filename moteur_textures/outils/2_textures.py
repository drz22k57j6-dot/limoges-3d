"""Textures PBR (couleur, normale, ORM) pour chaque matériau des monuments.
Pierre, enduit, ardoise : photos Poly Haven (CC0) teintées. Teinte : couleur mesurée sur la BD ORTHO IGN (mtex_ortho.py),
luminosité fixée par type de pierre. Or, cuivre vert-de-gris, zinc, fer, verre : textures procédurales.
Sortie : /home/claude/mtex/<monument>/<matériau>_{c,n,orm}.jpg + recettes.json"""
import json, os, zlib, numpy as np
from PIL import Image, ImageFilter
LIB = '/home/claude/tex_lib'; OUT = '/home/claude/mtex'; W = 1024
ORTHO = json.load(open(f'{OUT}/ortho_couleurs.json'))
rng = np.random.default_rng(7)

def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def target(ortho, L, warm=None, k=0.5):
    """teinte de l'orthophoto (mesurée), mélangée éventuellement avec une teinte connue, ramenée à la luminosité L"""
    c = np.array(ortho, float) if ortho is not None else np.array(warm, float)
    if warm is not None and ortho is not None: c = c / lum(c) * (1 - k) + np.array(warm, float) / lum(warm) * k
    else: c = c / lum(c)
    return np.clip(c * L, 0, 255)

def macro(seed, size):
    """variation basse fréquence (taches, nuances) : casse la répétition sur plusieurs mètres"""
    r = np.random.default_rng(seed); acc = np.zeros((size, size)); amp = 1; tot = 0
    for cells in (3, 6, 12, 24):
        n = r.random((cells, cells)); n = np.pad(n, 1, mode='wrap')
        up = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((size * (cells + 2) // cells, size * (cells + 2) // cells), Image.BICUBIC)).astype(float) / 255
        o = size // cells; acc += up[o:o + size, o:o + size] * amp; tot += amp; amp *= 0.55
    return acc / tot

def photo(name, tgt, contrast=1.0, seed=0, streaks=0.0):
    """2×2 tuiles de la photo, chacune nuancée différemment, + taches et coulures sur toute la surface (2048 px)"""
    S = 2 * W
    d = np.asarray(Image.open(f'{LIB}/{name}/diff.jpg').convert('RGB').resize((W, W), Image.LANCZOS)).astype(float)
    m = d.reshape(-1, 3).mean(0); d = (d - m) * contrast + m
    r = np.random.default_rng(seed); big = np.zeros((S, S, 3))
    for qy in range(2):
        for qx in range(2):
            g = 1 + r.normal(0, 0.035); hue = 1 + r.normal(0, 0.012, 3)
            big[qy * W:(qy + 1) * W, qx * W:(qx + 1) * W] = d * g * hue
    mac = macro(seed + 11, S); spots = np.clip((macro(seed + 23, S) - 0.62) * 4, 0, 1)
    f = (0.9 + 0.2 * mac) * (1 - 0.18 * spots)
    if streaks:
        col = np.random.default_rng(seed + 5).random(S // 8); col = np.repeat(np.convolve(col, np.ones(3) / 3, 'same'), 8)
        vert = np.linspace(1, 0.2, S)[:, None]          # coulures plus marquées en haut de la tuile
        f = f * (1 - streaks * np.clip(col[None, :] - 0.55, 0, 1) * 1.6 * vert)
    big = big * f[..., None]
    c = np.clip(big / m * tgt, 0, 255).astype(np.uint8)
    h = W // 2; n = Image.open(f'{LIB}/{name}/nor.jpg').convert('RGB').resize((h, h), Image.LANCZOS)
    nb = Image.new('RGB', (W, W)); [nb.paste(n, (x * h, y * h)) for x in range(2) for y in range(2)]
    o = np.asarray(Image.open(f'{LIB}/{name}/arm.jpg').convert('RGB').resize((W // 2, W // 2), Image.LANCZOS)).astype(float)
    ob = np.tile(o, (2, 2, 1)); ob[..., 1] = np.clip(ob[..., 1] * (0.92 + 0.16 * np.asarray(Image.fromarray((mac * 255).astype(np.uint8)).resize((W, W))) / 255), 0, 255)
    return Image.fromarray(c), nb, Image.fromarray(ob.astype(np.uint8))

def noise(scale, seed, octaves=4):
    r = np.random.default_rng(seed); acc = np.zeros((W, W)); amp = 1; tot = 0
    for o in range(octaves):
        s = max(2, W // (scale * 2 ** o)); n = r.random((s + 1, s + 1))
        n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((W + W // s, W + W // s), Image.BICUBIC))[:W, :W] / 255
        acc += n * amp; tot += amp; amp *= 0.5
    return acc / tot

def flat_normal(height=None, strength=2.0):
    if height is None: return Image.new('RGB', (W, W), (128, 128, 255))
    gx = np.roll(height, -1, 1) - np.roll(height, 1, 1); gy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    n = np.dstack([-gx * strength, gy * strength, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))

def orm(ao, rough, metal):
    f = lambda v: np.broadcast_to(np.asarray(v, float), (W, W))
    return Image.fromarray((np.dstack([f(ao), f(rough), f(metal)]) * 255).clip(0, 255).astype(np.uint8))

def gold(base=(255, 214, 128)):
    # dorure à la feuille (bronze/cuivre doré, redorés 2023-2024) : or métallique PBR, sRGB ≈ F0 de l'or (1,0.77,0.34 linéaire)
    n = noise(8, 1); c = np.array(base, float)[None, None] * (0.93 + 0.1 * n[..., None])
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), flat_normal(n, 0.4), orm(1, 0.16 + 0.12 * noise(16, 2), 1)

def verdigris(tint):
    n = noise(6, 3); s = noise(64, 4, 2)
    streak = np.asarray(Image.fromarray((s * 255).astype(np.uint8)).resize((W, W // 16)).resize((W, W), Image.BICUBIC)) / 255   # coulures verticales
    light = np.array(tint, float); dark = light * np.array([0.55, 0.62, 0.6])
    m = np.clip(0.35 + 0.5 * n + 0.4 * (streak - 0.5), 0, 1)[..., None]
    c = dark * (1 - m) + light * m
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), flat_normal(n, 1.5), orm(1, 0.62 + 0.2 * n, 0.15)

def zinc(tint, seam_m=0.55, tile_m=4.0):
    n = noise(10, 5); u = np.arange(W) / W * tile_m
    seam = (np.abs((u / seam_m) % 1 - 0.5) > 0.47).astype(float)[None, :].repeat(W, 0)    # joints debout tous les 55 cm
    c = np.array(tint, float)[None, None] * (0.9 + 0.18 * n[..., None]) * (1 - 0.18 * seam[..., None])
    h = seam * 1.0 + n * 0.1
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), flat_normal(h, 3.0), orm(1, 0.42 + 0.15 * n, 0.65)

def iron():
    n = noise(8, 6); c = np.array([42, 42, 45], float)[None, None] * (0.85 + 0.3 * n[..., None])
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), flat_normal(n, 1.0), orm(1, 0.5, 0.8)

def glass(tint=(28, 38, 50)):
    n = noise(12, 8); c = np.array(tint, float)[None, None] * (0.85 + 0.3 * n[..., None])
    return Image.fromarray(c.clip(0, 255).astype(np.uint8)), flat_normal(), orm(1, 0.06 + 0.06 * n, 0.0)

O = ORTHO
REC = {
 'arc-de-triomphe': {
   'stone': ('photo', 'white_sandstone_blocks_02', target(O['arc-de-triomphe']['stone']['rgb'], 178), 7.0),
   'trim': ('photo', 'white_plaster_02', target(O['arc-de-triomphe']['stone']['rgb'], 182), 4.0),
   'roof': ('photo', 'white_sandstone_bricks_03', target(O['arc-de-triomphe']['roof']['rgb'], 165), 6.0),
   'metal': ('iron', None, None, 2.0)},
 'sacre-coeur': {
   'stone': ('photo', 'white_sandstone_blocks_02', target(O['sacre-coeur']['stone']['rgb'], 205), 7.0),
   'trim': ('photo', 'white_plaster_02', target(O['sacre-coeur']['trim']['rgb'], 210), 4.0),
   'window': ('glass', None, (22, 30, 44), 2.0),
   'patina': ('photo', 'white_plaster_02', target(O['sacre-coeur']['patina']['rgb'], 210), 4.0)},    # mesuré clair à l'orthophoto : pierre, pas cuivre
 'opera-garnier': {
   'stone': ('photo', 'white_sandstone_bricks_03', target(O['opera-garnier']['stone']['rgb'], 168, warm=(200, 182, 145), k=0.6), 7.0),
   'trim': ('photo', 'white_plaster_02', target(O['opera-garnier']['trim']['rgb'], 175, warm=(205, 188, 152), k=0.6), 4.0),
   'roof': ('zinc', None, target(O['opera-garnier']['roof']['rgb'], 140), 4.0),
   'copper': ('verdigris', None, target(O['opera-garnier']['copper']['rgb'], 145, warm=(110, 170, 140), k=0.25), 3.0),
   'window': ('glass', None, (28, 38, 50), 2.0),
   'invalides-gold': ('gold', None, None, 1.5)},
}
STREAKS = {'arc-de-triomphe': 0.28, 'sacre-coeur': 0.12, 'opera-garnier': 0.2}   # coulures : Arc exposé à la circulation, Sacré-Cœur autonettoyant, Opéra restauré 2023-24
recettes = {}
for mon, mats in REC.items():
    os.makedirs(f'{OUT}/{mon}', exist_ok=True); recettes[mon] = {}
    for mat, (kind, src, tgt, scale) in mats.items():
        if kind == 'photo': c, n, o = photo(src, tgt, contrast=0.85, seed=zlib.crc32((mon + mat).encode()) % 997, streaks=STREAKS[mon])
        elif kind == 'gold': c, n, o = gold()
        elif kind == 'verdigris': c, n, o = verdigris(tgt)
        elif kind == 'zinc': c, n, o = zinc(tgt, tile_m=scale)
        elif kind == 'iron': c, n, o = iron()
        else: c, n, o = glass(tgt)
        for s, im in (('c', c), ('n', n), ('orm', o)): im.save(f'{OUT}/{mon}/{mat}_{s}.jpg', quality=88)
        recettes[mon][mat] = {'type': kind, 'source': src, 'teinte': None if tgt is None else [round(float(v)) for v in tgt], 'echelle_m': scale,
                              'verre': kind == 'glass', 'metal': kind in ('gold', 'iron')}
        print(mon, mat, kind, recettes[mon][mat]['teinte'])
json.dump(recettes, open(f'{OUT}/recettes.json', 'w'), indent=1, ensure_ascii=False)
