"""Masque « où pousse l'herbe » pour l'herbe 3D (style Larkhollow), 2 m/pixel sur les 6 × 6 km.
Sources : BD ORTHO (couleur), LiDAR HD MNH (hauteur de végétation), BD TOPO bâtiments + surfaces en eau, chaussée v3.
Sortie : herbe_masque.jpg (R = bord de route / sentier → herbe courte, G = densité d'herbe, B = sol nu).
Usage : python3 -I herbe_masque.py <dl> <chaussee_v3.wkb> <sortie.jpg>"""
import sys, json, numpy as np, tifffile, shapely
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import shape
Image.MAX_IMAGE_PIXELS = None
D, CH, OUT = sys.argv[1:4]
import os as _o
X0, Y0, R = float(_o.environ.get('CITY_X0', 562924.0)), float(_o.environ.get('CITY_Y0', 6528957.0)), 3000.0
XMIN, YMAX, PX = X0 - R, Y0 + R, 2.0
N = int(2 * R / PX)                                  # 3000
# ortho mosaic averaged to 2 m
rgb = np.zeros((N, N, 3), np.float32)
for i in range(3):
    for j in range(3):
        im = Image.open(f'{D}/ortho_{i}_{j}.jpg').convert('RGB').resize((1000, 1000), Image.BOX)
        rgb[(2 - j) * 1000:(3 - j) * 1000, i * 1000:(i + 1) * 1000] = np.asarray(im, np.float32)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
lum = (r + g + b) / 3; mx = rgb.max(-1); mn = rgb.min(-1); sat = (mx - mn) / np.maximum(mx, 1)
green = (g >= r * 0.98) & (g >= b * 1.04) & (lum > 35) & (lum < 215)
dry = (r > g) & (g > b * 1.08) & (sat > 0.12) & (sat < 0.42) & (lum > 70) & (lum < 200)      # dry yellowish grass
bare = (r > g * 1.05) & (sat > 0.18) & (lum > 60) & (lum < 190) & ~dry
# vegetation height (2 m LiDAR)
mnh = np.zeros((N, N), np.float32)
for i in range(3):
    for j in range(3): mnh[(2 - j) * 1000:(3 - j) * 1000, i * 1000:(i + 1) * 1000] = tifffile.imread(f'{D}/mnh_{i}_{j}.tif')
dens = np.where(green, 1.0, np.where(dry, 0.75, 0.0)).astype(np.float32)
dens = np.where((mnh > 3.0) & (dens > 0), 0.35, dens)          # under tree crowns: sparse shaded grass
dens = np.where((mnh > 0.8) & (mnh <= 3.0), dens * 0.5, dens)  # bushes / hedges
# exclusion: buildings, water, carriageway
def raster(geoms, buf=0.0):
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    for gm in geoms:
        if buf: gm = gm.buffer(buf)
        for p in (gm.geoms if hasattr(gm, 'geoms') else [gm]):
            if p.geom_type != 'Polygon' or p.is_empty: continue
            d.polygon([((x - XMIN) / PX, (YMAX - y) / PX) for x, y in np.asarray(p.exterior.coords)[:, :2]], fill=255)
            for h in p.interiors: d.polygon([((x - XMIN) / PX, (YMAX - y) / PX) for x, y in np.asarray(h.coords)[:, :2]], fill=0)
    return np.asarray(im) > 127
bats = [shape(f['geometry']) for f in json.load(open(f'{D}/bat.json'))['features']]
eau = [shape(f['geometry']) for f in json.load(open(f'{D}/eau.json'))['features']]
road = shapely.from_wkb(open(CH, 'rb').read())
mb = raster(bats, 0.3); mw = raster(eau); mr = raster([road], 0.4)
dens[mb | mw | mr] = 0
# R: verge next to the carriageway (short scrappy grass), 0..1 over 3 m
verge = raster([road], 3.0) & ~mr
rch = np.where(verge, 0.7, 0.0)
bch = np.where(bare & ~mr & ~mb, 0.8, 0.0)
out = np.stack([rch, dens, bch], -1)
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(0.7))
img.save(OUT, quality=90)
print('herbe %', round(float((dens > 0.5).mean() * 100), 1), 'taille', img.size)
