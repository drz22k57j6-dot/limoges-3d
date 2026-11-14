"""Real carriageway surface measured on the IGN orthophoto (0.5 m):
asphalt-coloured pixels in the public space (outside cadastre parcels and buildings), near the BD TOPO road
axes, joined to a minimal band along every axis (roads hidden under trees), cleaned and turned into polygons."""
import json, numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import rasterio.features, rasterio.transform
from shapely.geometry import shape, Polygon, MultiPolygon, LineString
from shapely.ops import unary_union
import shapely.wkb

D = '/home/claude/dl'
X0, Y0, R = 562924.0, 6528957.0, 3000.0
RES = 0.5; N = int(2 * R / RES)
XMIN, YMAX = X0 - R, Y0 + R
def px(x, y): return ((x - XMIN) / RES, (YMAX - y) / RES)


W = {'Type autoroutier': 10, 'Route à 2 chaussées': 7, 'Route à 1 chaussée': 5.5, 'Rond-point': 7, 'Bretelle': 5, 'Route empierrée': 3.5, 'Chemin': 3}
def polys_of(path):
    out = []
    for f in json.load(open(path))['features']:
        g = shape(f['geometry'])
        for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
            out.append(Polygon([(x, y) for x, y, *_ in p.exterior.coords], [[(x, y) for x, y, *_ in r.coords] for r in p.interiors]))
    return out
PARC = polys_of(f'{D}/parcelles.json'); BATI = polys_of(f'{D}/bat.json')
ROADS = []
for f in json.load(open(f'{D}/routes.json'))['features']:
    p = f['properties']; nat = p.get('nature')
    if nat not in W or str(p.get('position_par_rapport_au_sol') or '0').startswith('-'): continue
    w = float(p.get('largeur_de_chaussee') or 0) or W[nat]
    g = shape(f['geometry'])
    for ln in (g.geoms if g.geom_type == 'MultiLineString' else [g]): ROADS.append((LineString([(x, y) for x, y, *_ in ln.coords]), w, nat))
# Overture (OpenStreetMap) carriageways: complete network incl. service roads and parking aisles
import pyarrow.parquet as pq, shapely.wkb as swkb
from pyproj import Transformer
_tr = Transformer.from_crs(4326, 2154, always_xy=True)
OW = {'motorway': 9, 'trunk': 8, 'primary': 7, 'secondary': 6.5, 'tertiary': 6, 'residential': 5, 'unclassified': 5, 'living_street': 4.5, 'service': 3.5, 'unknown': 4}
for r in pq.read_table(f'{D}/overture_segments.parquet').to_pylist():
    if r['subtype'] != 'road' or r['class'] not in OW: continue
    if r['road_flags'] and any('is_tunnel' in (f.get('values') or []) for f in r['road_flags']): continue
    g = swkb.loads(r['geometry'])
    xs, ys = _tr.transform(*zip(*g.coords))
    ROADS.append((LineString(list(zip(xs, ys))), OW[r['class']], 'overture'))
from shapely import STRtree
from shapely.geometry import box
tP, tB, tR = STRTree = STRtree(PARC), STRtree(BATI), STRtree([r[0] for r in ROADS])
ortho = {}
def ortho_tile(i, j):
    if (i, j) not in ortho: ortho[(i, j)] = Image.open(f'{D}/ortho_{i}_{j}.jpg').convert('RGB')
    return ortho[(i, j)]
MARGIN = 60.0; T2 = 1000.0
geoms = []
st = ndi.generate_binary_structure(2, 1)
for ti in range(6):
    for tj in range(6):
        x0 = XMIN + ti * T2 - MARGIN; y1 = YMAX - tj * T2 + MARGIN; size = T2 + 2 * MARGIN; n = int(size / RES)
        def px(x, y): return ((x - x0) / RES, (y1 - y) / RES)
        # orthophoto crop (source tiles are 2 km / 4096 px)
        O = np.zeros((n, n, 3), np.uint8)
        img = Image.new('RGB', (n, n))
        for i in range(3):
            for j in range(3):
                tx0 = XMIN + i * 2000; ty1 = Y0 - R + (j + 1) * 2000
                if tx0 > x0 + size or tx0 + 2000 < x0 or ty1 < y1 - size or ty1 - 2000 > y1: continue
                src = ortho_tile(i, j); sc = 4096 / 2000.0
                cx0, cy0 = (x0 - tx0) * sc, (ty1 - y1) * sc
                crop = src.transform((n, n), Image.AFFINE, (RES * sc, 0, cx0, 0, RES * sc, cy0), resample=Image.BILINEAR)
                mask = Image.new('L', (n, n), 0); dm = ImageDraw.Draw(mask)
                ax0, ay0 = (tx0 - x0) / RES, (y1 - ty1) / RES
                dm.rectangle([ax0, ay0, ax0 + 2000 / RES, ay0 + 2000 / RES], fill=255)
                img.paste(crop, (0, 0), mask)
        Of = np.asarray(img).astype(np.int16)
        lum = Of.mean(2); sat = Of.max(2) - Of.min(2); del Of
        bb = box(x0, y1 - size, x0 + size, y1)
        def raster(polys):
            im = Image.new('L', (n, n), 0); d = ImageDraw.Draw(im)
            for poly in polys:
                d.polygon([px(x, y) for x, y in poly.exterior.coords], fill=255)
                for rr in poly.interiors: d.polygon([px(x, y) for x, y in rr.coords], fill=0)
            return np.asarray(im) > 0
        private = raster([PARC[k] for k in tP.query(bb)]); bati = raster([BATI[k] for k in tB.query(bb)])
        ai = Image.new('L', (n, n), 0); da = ImageDraw.Draw(ai); pi = Image.new('L', (n, n), 0); dp = ImageDraw.Draw(pi)
        for k in tR.query(bb):
            ln, w, nat = ROADS[k]; pts = [px(x, y) for x, y in ln.coords]
            da.line(pts, fill=255, width=1)
            if nat != 'Chemin': dp.line(pts, fill=255, width=max(2, int(round(min(w, 6) * 0.8 / RES))))
        axes = np.asarray(ai) > 0; prior = np.asarray(pi) > 0
        if not axes.any(): continue
        dist = ndi.distance_transform_edt(~axes) * RES
        asph = (sat < 26) & (lum > 38) & (lum < 168)
        shade = (sat < 22) & (lum <= 38)
        cand = ~private & ~bati & (asph | (shade & (dist < 5))) & (dist < 22)
        cand |= prior & ~bati
        cand = ndi.binary_closing(cand, structure=st, iterations=3)
        cand = ndi.binary_opening(cand, structure=st, iterations=2)
        cand |= prior & ~bati
        lab, nl = ndi.label(cand)
        touch = np.unique(lab[axes & cand]); keep = np.isin(lab, touch[touch > 0])
        holes = ndi.binary_fill_holes(keep) & ~keep
        hl, hn = ndi.label(holes)
        if hn:
            sizes = ndi.sum(holes, hl, range(1, hn + 1)) * RES * RES
            keep |= np.isin(hl, np.where(sizes < 25)[0] + 1)
        Tr = rasterio.transform.from_origin(x0, y1, RES, RES)
        inner = box(x0 + MARGIN, y1 - size + MARGIN, x0 + size - MARGIN, y1 - MARGIN)
        gs = [shape(g) for g, v in rasterio.features.shapes(keep.astype(np.uint8), mask=keep, transform=Tr, connectivity=4) if v == 1]
        part = unary_union(gs).buffer(0.6, join_style=1).buffer(-0.6, join_style=1).simplify(0.35).intersection(inner)
        open(f'{D}/chaussee_{ti}_{tj}.wkb', 'wb').write(shapely.wkb.dumps(part))
        geoms.append(part)
        print('tile', ti, tj, int(part.area), flush=True)
U = unary_union(geoms)
print('area', int(U.area))
open(f'{D}/chaussee.wkb', 'wb').write(shapely.wkb.dumps(U))
