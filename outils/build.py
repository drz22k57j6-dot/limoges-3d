import json, struct, io, math, sys, random, os, time
BUILD_STARTED = time.perf_counter()
import numpy as np, tifffile
from PIL import Image, ImageDraw
from shapely.geometry import shape, Polygon, MultiPolygon, LineString
from shapely.geometry.polygon import orient
import mapbox_earcut as earcut
# Le builder est parfois lancé en mode Python isolé (-I), qui retire le dossier script de sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toits_lidar import estimate_roof, build_roof_mesh

D = sys.argv[1]; OUTD = sys.argv[2]
import os as _o
X0, Y0, R = float(_o.environ.get('CITY_X0', 562924.0)), float(_o.environ.get('CITY_Y0', 6528957.0)), 3000.0
random.seed(1); rng = np.random.default_rng(1)

# ---------- rasters (2 m) ----------
def mosaic(prefix):
    a = np.zeros((3000, 3000), np.float32)
    for i in range(3):
        for j in range(3):
            t = tifffile.imread(f"{D}/{prefix}_{i}_{j}.tif")
            a[(2-j)*1000:(3-j)*1000, i*1000:(i+1)*1000] = t
    return a
MNT = mosaic('mnt'); MNH = mosaic('mnh')
XMIN, YMAX = X0-R, Y0+R
def raster_h(x, y, A=MNT):
    c = (np.asarray(x)-XMIN)/2-0.5; r = (YMAX-np.asarray(y))/2-0.5
    c = np.clip(c, 0, 2998.999); r = np.clip(r, 0, 2998.999)
    c0 = np.floor(c).astype(int); r0 = np.floor(r).astype(int); fc = c-c0; fr = r-r0
    return (A[r0,c0]*(1-fc)*(1-fr)+A[r0,c0+1]*fc*(1-fr)+A[r0+1,c0]*(1-fc)*fr+A[r0+1,c0+1]*fc*fr)
H0 = float(raster_h(X0, Y0))
print('ground at address', H0)

# ---------- terrain tiles ----------
tiles = []  # (x0,y0,step,Hgrid)
for i in range(3):
    for j in range(3):
        x0 = XMIN+i*2000; y0 = Y0-R+j*2000
        step = 4.0 if (i, j) == (1, 1) else 10.0
        n = int(2000/step)+1
        xs = x0+np.arange(n)*step; ys = y0+np.arange(n)*step
        gx, gy = np.meshgrid(xs, ys)  # [b,a]
        Hg = raster_h(gx, gy).astype(np.float64)
        if step < 10:  # match coarse neighbours on the border (no cracks)
            k = int(10/step)
            for edge in (Hg[0, :], Hg[-1, :], Hg[:, 0], Hg[:, -1]):
                idx = np.arange(len(edge)); base = (idx//k)*k; nxt = np.minimum(base+k, len(edge)-1)
                f = (idx-base)/k; edge[:] = edge[base]*(1-f)+edge[nxt]*f
        tiles.append((x0, y0, step, Hg, i, j))

def export_heights(path):
    hb = bytearray(struct.pack('<fI', H0, len(tiles)))
    for (x0, y0, st, Hg, i, j) in tiles:
        mn = float(Hg.min())
        hb += struct.pack('<ffffI', x0-X0, y0-Y0, st, mn, Hg.shape[0])
        hb += np.round((Hg-mn)*100).astype(np.uint16).tobytes()
    open(path, 'wb').write(hb)
export_heights(OUTD+'/relief.bin')

def mesh_h(x, y):
    x = np.atleast_1d(np.asarray(x, float)); y = np.atleast_1d(np.asarray(y, float))
    out = np.empty_like(x)
    for (x0, y0, s, Hg, i, j) in tiles:
        m = (x >= x0) & (x <= x0+2000) & (y >= y0) & (y <= y0+2000)
        if not m.any(): continue
        n = Hg.shape[0]-1
        a = np.clip((x[m]-x0)/s, 0, n-1e-9); b = np.clip((y[m]-y0)/s, 0, n-1e-9)
        a0 = np.floor(a).astype(int); b0 = np.floor(b).astype(int); fx = a-a0; fy = b-b0
        h00 = Hg[b0, a0]; h10 = Hg[b0, a0+1]; h01 = Hg[b0+1, a0]; h11 = Hg[b0+1, a0+1]
        up = fx >= fy
        out[m] = np.where(up, h00+fx*(h10-h00)+fy*(h11-h10), h00+fy*(h01-h00)+fx*(h11-h01))
    out[(x < XMIN) | (x > XMIN+6000) | (y < Y0-R) | (y > YMAX)] = np.nan
    return out

# ---------- GLB writer ----------
class GLB:
    def __init__(s):
        s.bin = bytearray(); s.g = {"asset": {"version": "2.0", "generator": "Sid Limoges builder"},
            "buffers": [], "bufferViews": [], "accessors": [], "meshes": [], "nodes": [], "materials": [],
            "textures": [], "images": [], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497},
                                                     {"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
            "scenes": [{"nodes": []}], "scene": 0, "extensionsUsed": []}
    def view(s, data, target=None):
        while len(s.bin) % 4: s.bin.append(0)
        bv = {"buffer": 0, "byteOffset": len(s.bin), "byteLength": len(data)}
        if target: bv["target"] = target
        s.bin += data; s.g["bufferViews"].append(bv); return len(s.g["bufferViews"])-1
    def acc(s, arr, typ, ctype, target=None, normalized=False, minmax=False):
        arr = np.ascontiguousarray(arr)
        v = s.view(arr.tobytes(), target)
        a = {"bufferView": v, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if normalized: a["normalized"] = True
        if minmax:
            a["min"] = [float(x) for x in arr.min(0)]; a["max"] = [float(x) for x in arr.max(0)]
        s.g["accessors"].append(a); return len(s.g["accessors"])-1
    def image(s, pil, q=85):
        b = io.BytesIO()
        if pil.mode == 'RGBA':
            pil.save(b, 'PNG', optimize=True); mime = 'image/png'
        else:
            pil.convert('RGB').save(b, 'JPEG', quality=q, optimize=True); mime = 'image/jpeg'
        v = s.view(b.getvalue()); s.g["images"].append({"bufferView": v, "mimeType": mime})
        return len(s.g["images"])-1
    def texture(s, pil, sampler=0, q=85):
        s.g["textures"].append({"sampler": sampler, "source": s.image(pil, q)}); return len(s.g["textures"])-1
    def material(s, name, color=(1, 1, 1, 1), tex=None, unlit=False, rough=0.9):
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": list(color), "metallicFactor": 0.0, "roughnessFactor": rough}}
        if tex is not None: m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": tex}
        if unlit:
            m["extensions"] = {"KHR_materials_unlit": {}}
            if "KHR_materials_unlit" not in s.g["extensionsUsed"]: s.g["extensionsUsed"].append("KHR_materials_unlit")
        s.g["materials"].append(m); return len(s.g["materials"])-1
    def prim(s, pos, idx, mat, uv=None, col=None):
        pos = np.asarray(pos, np.float32)
        at = {"POSITION": s.acc(pos, "VEC3", 5126, 34962, minmax=True)}
        if uv is not None: at["TEXCOORD_0"] = s.acc(np.asarray(uv, np.float32), "VEC2", 5126, 34962)
        if col is not None:
            c = np.asarray(col, np.float64).copy(); c[:, :3] = (c[:, :3]/255.0)**2.2*255.0  # glTF vertex colours are linear
            at["COLOR_0"] = s.acc(np.round(c).astype(np.uint8), "VEC4", 5121, 34962, normalized=True)
        idx = np.asarray(idx).reshape(-1)
        ia = s.acc(idx.astype(np.uint16 if len(pos) < 65535 else np.uint32), "SCALAR", 5123 if len(pos) < 65535 else 5125, 34963)
        return {"attributes": at, "indices": ia, "material": mat}
    def node(s, name, prims, extra=None, root=True):
        s.g["meshes"].append({"name": name, "primitives": prims})
        n = {"name": name, "mesh": len(s.g["meshes"])-1}
        if extra: n.update(extra)
        s.g["nodes"].append(n); k = len(s.g["nodes"])-1
        if root: s.g["scenes"][0]["nodes"].append(k)
        return k
    def write(s, path):
        s.g["buffers"] = [{"byteLength": len(s.bin)}]
        if not s.g["extensionsUsed"]: del s.g["extensionsUsed"]
        js = json.dumps(s.g, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        while len(s.bin) % 4: s.bin.append(0)
        total = 12+8+len(js)+8+len(s.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(s.bin), 0x004E4942)); f.write(s.bin)

G = GLB(); GT = G
def L(x, y, z):  # Lambert93 -> glTF (Y up, -Z north), origin = address
    return np.stack([np.asarray(x)-X0, np.asarray(z)-H0, -(np.asarray(y)-Y0)], -1)

# ---------- terrain ----------
ortho = {}
for (x0, y0, s, Hg, i, j) in tiles:
    n = Hg.shape[0]
    xs = x0+np.arange(n)*s; ys = y0+np.arange(n)*s
    gx, gy = np.meshgrid(xs, ys)
    pos = L(gx.ravel(), gy.ravel(), Hg.ravel())
    uv = np.stack([(gx.ravel()-x0)/2000, (y0+2000-gy.ravel())/2000], -1)
    a, b = np.meshgrid(np.arange(n-1), np.arange(n-1)); v00 = (b*n+a).ravel()
    v10 = v00+1; v01 = v00+n; v11 = v00+n+1
    idx = np.stack([v00, v10, v11, v00, v11, v01], -1)
    img = Image.open(f"{D}/ortho_{i}_{j}.jpg"); ortho[(i, j)] = np.asarray(img)
    if (i, j) != (1, 1): img = img.resize((2048, 2048), Image.LANCZOS)
    t = G.texture(img, sampler=1, q=82 if (i, j) != (1, 1) else 85)
    m = G.material(f"sol_{i}_{j}", tex=t, unlit=True)
    G.node(f"Terrain_{i}_{j}", [G.prim(pos, idx, m, uv=uv)])
print('terrain ok')
GT.write(OUTD+'/ville_terrain.glb')
G = GLB()

def ortho_rgb(x, y):
    x = np.asarray(x); y = np.asarray(y)
    i = np.clip(((x-XMIN)//2000).astype(int), 0, 2); j = np.clip(((y-(Y0-R))//2000).astype(int), 0, 2)
    px = np.clip(((x-(XMIN+i*2000))/2000*4096).astype(int), 0, 4095)
    py = np.clip(((Y0-R+(j+1)*2000-y)/2000*4096).astype(int), 0, 4095)
    out = np.zeros((len(x), 3))
    for k in range(len(x)): out[k] = ortho[(i[k], j[k])][py[k], px[k]]
    return out

# ---------- facade textures ----------
def facade(kind):
    W = 256; im = Image.new('RGB', (W, W), (255, 255, 255)); d = ImageDraw.Draw(im)
    if kind == 'res':
        d.rectangle([0, 236, W, W], fill=(232, 230, 226))           # floor slab line
        d.rectangle([70, 60, 186, 200], fill=(205, 205, 205))       # frame
        d.rectangle([80, 70, 176, 190], fill=(58, 70, 84))          # glass
        d.rectangle([80, 70, 176, 100], fill=(120, 110, 100))       # shutter box
        d.line([128, 100, 128, 190], fill=(205, 205, 205), width=5)
        d.rectangle([64, 196, 192, 206], fill=(190, 190, 190))      # sill
    else:
        d.rectangle([0, 80, W, 180], fill=(70, 84, 98))
        for xx in range(0, W, 64): d.line([xx, 80, xx, 180], fill=(170, 170, 170), width=4)
        d.rectangle([0, 236, W, W], fill=(225, 225, 225))
    return im
def facade_barre():
    # 4 bays (3 m each) x 1 floor (2.8 m) of a 1960-70s 'grand ensemble' slab:
    # tinted panels with white-framed windows, grey glazed loggias, a sage loggia. Alpha = where the building colour applies.
    W, H = 1024, 256
    im = Image.new('RGBA', (W, H), (255, 255, 255, 255)); d = ImageDraw.Draw(im)
    def panel(x0):
        d.rectangle([x0, 0, x0+255, H], fill=(255, 255, 255, 255))
        d.rectangle([x0+58, 52, x0+198, 206], fill=(246, 246, 244, 0))          # white frame
        d.rectangle([x0+68, 62, x0+188, 196], fill=(92, 104, 116, 0))           # glass
        d.rectangle([x0+68, 62, x0+188, 112], fill=(236, 236, 232, 0))          # roller shutter half down
        d.line([x0+128, 112, x0+128, 196], fill=(246, 246, 244, 0), width=5)
        d.rectangle([x0+52, 206, x0+204, 214], fill=(225, 225, 222, 0))         # sill
    def loggia(x0, frame, glass):
        d.rectangle([x0, 0, x0+255, H], fill=frame + (0,))
        for k in range(3):
            gx = x0+14+k*80; d.rectangle([gx, 30, gx+66, 216], fill=glass + (0,))
            d.line([gx+4, 40, gx+30, 200], fill=tuple(min(255, c+40) for c in glass) + (0,), width=6)  # reflection
        d.rectangle([x0, 216, x0+255, 232], fill=(170, 172, 174, 0))            # balcony rail
    panel(0); loggia(256, (128, 134, 140), (96, 112, 126)); panel(512); loggia(768, (150, 176, 166), (104, 124, 128))
    d.rectangle([0, 240, W, H], fill=(238, 238, 236, 0))                          # floor slab
    return im
def facade_tour():
    # point tower: white panels and windows, one recessed balcony column + floor stripes in the accent colour (alpha = accent)
    W, H = 1280, 256
    im = Image.new('RGBA', (W, H), (246, 246, 243, 0)); d = ImageDraw.Draw(im)
    for b in range(5):
        x0 = b*256
        if b == 2:
            d.rectangle([x0, 0, x0+255, H], fill=(255, 255, 255, 255))
            d.rectangle([x0+40, 40, x0+215, 200], fill=(70, 70, 72, 0))       # recessed balcony opening
            d.rectangle([x0+40, 170, x0+215, 200], fill=(255, 255, 255, 255))  # balcony front
            d.line([x0+60, 150, x0+200, 150], fill=(60, 60, 60, 0), width=3)
        else:
            for wx in (x0+40, x0+140):
                d.rectangle([wx, 48, wx+76, 206], fill=(235, 235, 232, 0))
                d.rectangle([wx+6, 54, wx+70, 200], fill=(88, 100, 112, 0))
                d.rectangle([wx+6, 54, wx+70, 100], fill=(228, 228, 224, 0))
    d.rectangle([0, 238, W, 252], fill=(255, 255, 255, 255))                    # accent floor stripe
    return im
def pignon():
    im = Image.new('RGB', (256, 256), (246, 246, 243)); d = ImageDraw.Draw(im)
    for y in (0, 128): d.line([0, y, 256, y], fill=(205, 205, 205), width=3)
    d.line([128, 0, 128, 256], fill=(222, 222, 222), width=2)
    return im
def facade_haussmann():
    # Paris: 4 bays (3 m) x 1 floor of a Haussmann-style stone facade: tall French windows with cream frames, wrought-iron railings,
    # stone joints. Alpha = stone (takes the building colour). Generic style, not a survey of each building.
    W, H = 1024, 256
    im = Image.new('RGBA', (W, H), (255, 255, 255, 255)); d = ImageDraw.Draw(im)
    for y in (64, 128, 192): d.line([0, y, W, y], fill=(232, 232, 232, 255), width=2)           # stone courses
    for b in range(4):
        x0 = b*256
        d.rectangle([x0+78, 22, x0+178, 238], fill=(236, 230, 214, 0))                         # moulded frame
        d.rectangle([x0+88, 30, x0+168, 236], fill=(70, 78, 86, 0))                            # glass
        d.line([x0+128, 30, x0+128, 236], fill=(236, 230, 214, 0), width=5)
        for yy in (95, 160): d.line([x0+88, yy, x0+168, yy], fill=(236, 230, 214, 0), width=4)
        d.line([x0+96, 40, x0+120, 220], fill=(110, 120, 130, 0), width=6)                    # sky reflection
        d.rectangle([x0+72, 12, x0+184, 22], fill=(244, 240, 228, 255))                       # cornice over the window
        d.rectangle([x0+80, 200, x0+176, 204], fill=(28, 28, 30, 0))                          # railing bar
        for xx in range(x0+84, x0+176, 9): d.line([xx, 204, xx, 238], fill=(28, 28, 30, 0), width=2)
    d.rectangle([0, 240, W, H], fill=(248, 244, 232, 255))                                   # floor band
    return im
if _o.environ.get('CITY_NAME') == 'paris': facade_barre = facade_haussmann
TEX_RES = G.texture(facade('res')); TEX_COM = G.texture(facade('com'))
M_BARRE = G.material('facade_barre', tex=G.texture(facade_barre())); M_TOUR = G.material('facade_tour', tex=G.texture(facade_tour())); M_PIGNON = G.material('pignon', tex=G.texture(pignon()))
M_RES = G.material('facade_logements', tex=TEX_RES); M_COM = G.material('facade_activites', tex=TEX_COM)
M_PLAIN = G.material('mur_simple')
TXD = '/home/claude/game/pub/data/tex/'
def ftex(n): return G.texture(Image.open(TXD+n+'_d.jpg').convert('RGB'), q=84)
M_ROOF_T = G.material('toit_tuiles', tex=ftex('tuiles'), rough=0.75); M_ROOF_S = G.material('toit_ardoise', tex=ftex('ardoise'), rough=0.6); M_ROOF_F = G.material('toit_plat', tex=ftex('toit_plat'), rough=0.9)
import os
FAC = json.load(open(D+'/facades.json')) if os.path.exists(D+'/facades.json') else {}
# buildings checked against reference photos supplied by the user
# buildings reconstructed in detail by the Building Appearance Engine: removed from the generic mesh only (rollback = remove from the list)
_BI = os.environ.get('BAE_INDEX', '')
DETAIL = set(json.load(open(_BI))['batiments']) if _BI and os.path.exists(_BI) else set()
DETAIL_DONE = []
STYLE = {'BATIMENT0000000224596718': ('barre', (212, 182, 162), 'référence photo utilisateur (All. Le Gréco)'),
         'BATIMENT0000000224596725': ('tour', (198, 56, 50), 'référence photo utilisateur (All. Émile Kahn)')}
INFO = []

# ---------- buildings ----------
B = json.load(open(f"{D}/bat.json"))['features']
TILES = os.environ.get('TILES_OUT', '')          # 3D Tiles export of the buildings (data/tuiles)
CH = 250.0 if TILES else 1000.0
ACC = {}; ACC1 = {}
CUR = [None]; FID = [0]; BIDS = []
def push(k, p, uv, c, idx, acc=None, cell=None):
    a = (acc if acc is not None else ACC).setdefault((cell or CUR[0], k), {'p': [], 'uv': [], 'c': [], 'i': [], 'f': [], 'n': 0}); a['p'].append(p); a['uv'].append(uv); a['c'].append(c); a['i'].append(idx+a['n']); a['f'].append(np.full(len(p), FID[0], np.uint32)); a['n'] += len(p)
def lod1(poly, zb, zt, col, rcol):
    # far version: simplified prism, vertex colours only
    q = poly.simplify(1.5)
    if q.is_empty or q.geom_type != 'Polygon': q = poly
    q = orient(q, 1.0); ex = np.asarray(q.exterior.coords)[:, :2]; n = len(ex)
    cell = (int((q.centroid.x-XMIN)//1000), int((q.centroid.y-(Y0-R))//1000))
    pos = np.vstack([L(ex[:, 0], ex[:, 1], np.full(n, zb)), L(ex[:, 0], ex[:, 1], np.full(n, zt))]); e = np.arange(n-1)
    push('lod1', pos, np.zeros((2*n, 2)), np.tile(col, (2*n, 1)), np.stack([e, e+1, n+e+1, e, n+e+1, n+e], -1).ravel(), ACC1, cell)
    V = ex[:-1]; tri = np.asarray(earcut.triangulate_float64(V, np.array([len(V)], np.uint32))).reshape(-1, 3)
    if len(tri):
        a_, b_, c_ = V[tri[:, 0]], V[tri[:, 1]], V[tri[:, 2]]
        cr = (b_[:, 0]-a_[:, 0])*(c_[:, 1]-a_[:, 1])-(b_[:, 1]-a_[:, 1])*(c_[:, 0]-a_[:, 0]); tri[cr < 0] = tri[cr < 0][:, [0, 2, 1]]
        push('lod1', L(V[:, 0], V[:, 1], np.full(len(V), zt)), np.zeros((len(V), 2)), np.tile(rcol, (len(V), 1)), tri.ravel(), ACC1, cell)

def walls(k, ring_xy, zb, zt, ground, col, ubay=3.0, u0=0.0):
    # ring closed (first==last), zt per vertex
    P = np.asarray(ring_xy); n = len(P)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    bot = L(P[:, 0], P[:, 1], np.full(n, zb)); top = L(P[:, 0], P[:, 1], zt)
    pos = np.vstack([bot, top])
    uv = np.vstack([np.stack([u0+seg/ubay, -(zb-ground)/2.8*np.ones(n)], -1), np.stack([u0+seg/ubay, -(zt-ground)/2.8], -1)])
    e = np.arange(n-1)
    idx = np.stack([e, e+1, n+e+1, e, n+e+1, n+e], -1).ravel()
    push(k, pos, uv, np.tile(col, (2*n, 1)), idx)

def roof_flat(poly, z, col):
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    V = np.vstack(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    tri = np.asarray(earcut.triangulate_float64(V, ends)).reshape(-1, 3)
    if len(tri) == 0: return
    a, b, c = V[tri[:, 0]], V[tri[:, 1]], V[tri[:, 2]]
    cr = (b[:, 0]-a[:, 0])*(c[:, 1]-a[:, 1])-(b[:, 1]-a[:, 1])*(c[:, 0]-a[:, 0])
    tri[cr < 0] = tri[cr < 0][:, [0, 2, 1]]
    push('roof_f', L(V[:, 0], V[:, 1], np.full(len(V), z)), V/4.0, np.tile(col, (len(V), 1)), tri.ravel())

wall_tint = {'Résidentiel': (236, 228, 212), 'Industriel': (200, 200, 196), 'Commercial et services': (225, 222, 215),
             'Religieux': (220, 208, 186), 'Sportif': (215, 215, 210), 'Agricole': (190, 175, 155), 'Annexe': (210, 200, 185)}
if _o.environ.get('CITY_NAME') == 'paris':   # Paris stone / render when no photo measurement: estimate, flagged as such
    wall_tint.update({'Résidentiel': (226, 214, 190), 'Indifférencié': (224, 213, 192), 'Commercial et services': (222, 214, 198)})
nb = 0; gables = 0; FOOT = []
ROOF_STATS = {"eligible":0,"lidar":0,"fallback":0,"triangles":0,"vertices":0,"reasons":{}}
for f in B:
    p = f['properties']; g = shape(f['geometry'])
    polys = list(g.geoms) if isinstance(g, MultiPolygon) else [g]
    for poly in polys:
        poly = Polygon([(x, y) for x, y, *_ in poly.exterior.coords], [[(x, y) for x, y, *_ in r.coords] for r in poly.interiors])
        poly = poly.simplify(0.25)
        if poly.is_empty or not poly.is_valid or poly.area < 6 or poly.geom_type != 'Polygon': continue
        poly = orient(poly, 1.0)
        CUR[0] = (int((poly.centroid.x-XMIN)//CH), int((poly.centroid.y-(Y0-R))//CH))
        FOOT.append([np.asarray(poly.exterior.coords)[:, :2], 0.0])
        ex = np.asarray(poly.exterior.coords)
        gh = mesh_h(ex[:, 0], ex[:, 1])
        if np.isnan(gh).any(): continue
        ground = float(np.mean(gh)); zb = float(gh.min())-0.8
        h = p.get('hauteur') or ((p.get('nombre_d_etages') or 0)*2.9) or 4.0
        h = max(2.5, float(h)); zt = ground+h; FOOT[-1][1] = zt-H0
        usage = p.get('usage_1') or 'Indifférencié'
        bid = p.get('cleabs')
        sty = STYLE.get(bid)
        if bid in DETAIL: DETAIL_DONE.append(bid); continue
        FID[0] = len(BIDS); BIDS.append(bid)   # drawn by the Building Appearance Engine (data/batiments_detail), collision kept
        if sty:
            tint = np.array(sty[1], float); src = sty[2]
        elif bid in FAC:
            tint = np.array(FAC[bid]['rgb'], float); src = FAC[bid]['src']
        else:
            tint = np.array(wall_tint.get(usage, (226, 220, 208)), float)*rng.uniform(0.92, 1.04); src = 'estimation'
        col = np.r_[np.clip(tint, 0, 255), 255].astype(np.uint8)
        small = poly.area < 35 or h < 3.2 or usage == 'Annexe'
        k = 'plain' if small else ('res' if usage in ('Résidentiel', 'Indifférencié') else 'com')
        # roof colour from orthophoto
        rp = poly.representative_point(); cx, cy = poly.centroid.x, poly.centroid.y
        sx = np.r_[rp.x, cx*0.6+ex[:-1, 0]*0.4]; sy = np.r_[rp.y, cy*0.6+ex[:-1, 1]*0.4]
        pts = [(a, b) for a, b in zip(sx, sy) if poly.contains(__import__('shapely').geometry.Point(a, b))] or [(rp.x, rp.y)]
        rc = np.median(ortho_rgb(np.array([q[0] for q in pts]), np.array([q[1] for q in pts])), 0)
        rc = np.clip(rc*1.08+6, 0, 255); rcol = np.r_[rc, 255].astype(np.uint8)
        is_tiles = rc[0] > rc[1]*1.1 and rc[0] > rc[2]*1.18
        INFO.append({'id': bid, 'usage': usage, 'hauteur_m': round(h, 1), 'mur_rgb': [int(v) for v in col[:3]], 'mur_source': src,
                     'toit_rgb': [int(v) for v in rcol[:3]], 'toit_source': 'orthophoto IGN', 'x': round(cx-X0, 1), 'z': round(-(cy-Y0), 1)})
        # Reconstruction LiDAR HD du toit : MNH relatif au sol, emprise BD TOPO exacte.
        # La même géométrie opaque est exportée dans le GLB / les tuiles détaillées ;
        # solarAnalysis.makeBvh() la récupère ensuite par scene.traverse().
        ROOF_STATS["eligible"] += 1
        roof_est = estimate_roof(poly, MNH, XMIN, YMAX, h, resolution=2.0)
        roof_pos, roof_idx, roof_step = (np.empty((0,3)), np.empty((0,), dtype=np.uint32), 2.0)
        if roof_est.get("valid"):
            roof_pos, roof_idx, roof_step = build_roof_mesh(
                poly, MNH, XMIN, YMAX, mesh_h, roof_est["eave"], roof_est["mesh_max"],
                resolution=2.0, triangle_budget=400)
        lidar_roof_ok = bool(roof_est.get("valid") and len(roof_idx) and len(roof_idx)//3 <= 400)
        if lidar_roof_ok:
            eave_tops = np.asarray(mesh_h(ex[:,0], ex[:,1]), dtype=float) + roof_est["eave"]
            # Les murs s'arrêtent à l'égout MNH, en suivant le terrain local ; conserver les façades spécialisées existantes.
            if sty and sty[0] == 'tour':
                walls('tour', ex, zb, eave_tops, ground, col, ubay=15.0)
            elif (k == 'res' and h >= (8 if _o.environ.get('CITY_NAME') == 'paris' else 12)) or (k == 'com' and h >= 8 and _o.environ.get('CITY_NAME') == 'paris') or (sty and sty[0] == 'barre'):
                for edge_i, (a_, b_) in enumerate(zip(ex[:-1], ex[1:])):
                    Ls = math.hypot(*(b_-a_))
                    if Ls < 0.5: continue
                    edge_top = np.array([eave_tops[edge_i], eave_tops[edge_i+1]])
                    if Ls < (3 if _o.environ.get('CITY_NAME') == 'paris' else 16):
                        walls('pignon', np.array([a_, b_]), zb, edge_top, ground,
                              np.array([255,255,255,255], np.uint8), ubay=3.0)
                    else:
                        walls('barre', np.array([a_, b_]), zb, edge_top, ground, col, ubay=12.0)
            else:
                walls(k, ex, zb, eave_tops, ground, col)
            for r in poly.interiors:
                ri = np.asarray(r.coords)
                inner_top = np.asarray(mesh_h(ri[:,0], ri[:,1]), dtype=float) + roof_est["eave"]
                walls(k, ri, zb, inner_top, ground, col)
            roof_uv = np.column_stack([roof_pos[:,0]/3.0, roof_pos[:,1]/3.0])
            push('roof_t' if is_tiles else 'roof_s',
                 L(roof_pos[:,0], roof_pos[:,1], roof_pos[:,2]), roof_uv,
                 np.tile(rcol, (len(roof_pos),1)), roof_idx)
            FOOT[-1][1] = float(np.nanmax(roof_pos[:,2])-H0)
            INFO[-1].update({"toit":"LiDAR HD — MNH", "hauteur_egout_m":round(roof_est["eave"],2),
                             "hauteur_faitage_m":round(roof_est["ridge"],2),
                             "triangles_toit":int(len(roof_idx)//3), "pas_maillage_m":round(float(roof_step),2)})
            ROOF_STATS["lidar"] += 1
            ROOF_STATS["triangles"] += int(len(roof_idx)//3)
            ROOF_STATS["vertices"] += int(len(roof_pos))
        else:
            ROOF_STATS["fallback"] += 1
            reason = roof_est.get("reason", "maillage vide ou budget dépassé")
            ROOF_STATS["reasons"][reason] = ROOF_STATS["reasons"].get(reason,0)+1
            INFO[-1]["toit_lidar_fallback"] = reason
        # Fallback conservé : gable heuristique si le LiDAR est absent/incohérent.
        mrr = poly.minimum_rotated_rectangle
        if lidar_roof_ok:
            pass
        elif (not poly.interiors and h <= 10 and usage in ('Résidentiel', 'Indifférencié') and 40 < poly.area < 300
                and mrr.geom_type == 'Polygon' and poly.area/mrr.area > 0.86):
            c = np.asarray(orient(mrr, 1.0).exterior.coords)[:4]
            l01 = np.hypot(*(c[1]-c[0])); l12 = np.hypot(*(c[2]-c[1]))
            if l12 > l01: c = np.roll(c, -1, axis=0); l01, l12 = l12, l01
            rh = float(np.clip(0.32*l12, 1.3, 3.5)); eave = max(zt-rh, ground+2.6); ridge = eave+rh
            m12 = (c[1]+c[2])/2; m30 = (c[3]+c[0])/2
            ring = np.array([c[0], c[1], m12, c[2], c[3], m30, c[0]])
            tops = np.array([eave, eave, ridge, eave, eave, ridge, eave])
            walls(k, ring, zb, tops, ground, col)
            ov = 0.35  # small overhang
            d = (c[1]-c[0])/l01; nrm = (m30-c[0]); nrm = nrm/np.linalg.norm(nrm)
            def ext(pt, outd): return pt+outd*ov
            e0, e1 = ext(c[0], -d-nrm), ext(c[1], d-nrm); e2, e3 = ext(c[2], d+nrm), ext(c[3], -d+nrm)
            r12 = ext(m12, d); r30 = ext(m30, -d); dz = ov*rh/(l12/2)
            V = np.array([e0, e1, r12, r30, e2, e3]); Z = np.array([eave-dz, eave-dz, ridge, ridge, eave-dz, eave-dz])
            ruv = np.stack([(V-e0)@d/2.0, np.abs((V-e0)@nrm-(l12/2+ov))/1.6], -1)
            INFO[-1]['toit'] = 'deux pentes ' + ('tuiles' if is_tiles else 'ardoise/zinc')
            push('roof_t' if is_tiles else 'roof_s', L(V[:, 0], V[:, 1], Z), ruv, np.tile(rcol, (6, 1)),
                 np.array([0, 1, 2, 0, 2, 3, 4, 5, 3, 4, 3, 2]))
            gables += 1
        else:
            if sty and sty[0] == 'tour':
                walls('tour', ex, zb, np.full(len(ex), zt), ground, col, ubay=15.0)
            elif (k == 'res' and h >= (8 if _o.environ.get('CITY_NAME') == 'paris' else 12)) or (k == 'com' and h >= 8 and _o.environ.get('CITY_NAME') == 'paris') or (sty and sty[0] == 'barre'):
                # slab: long walls get the bay facade, short gable ends are plain white
                for a_, b_ in zip(ex[:-1], ex[1:]):
                    Ls = math.hypot(*(b_-a_))
                    if Ls < 0.5: continue
                    if Ls < (3 if _o.environ.get('CITY_NAME') == 'paris' else 16): walls('pignon', np.array([a_, b_]), zb, np.full(2, zt), ground, np.array([255, 255, 255, 255], np.uint8), ubay=3.0)
                    else: walls('barre', np.array([a_, b_]), zb, np.full(2, zt), ground, col, ubay=12.0)
            else:
                walls(k, ex, zb, np.full(len(ex), zt), ground, col)
            for r in poly.interiors:
                ri = np.asarray(r.coords); walls(k, ri, zb, np.full(len(ri), zt), ground, col)
            # parapet look: roof slightly darker grey mixed with ortho
            roof_flat(poly, zt, rcol); INFO[-1]['toit'] = 'plat'
        if TILES: lod1(poly, zb, zt, col, rcol)
        nb += 1
print('buildings', nb, 'gables', gables)
print('LiDAR roofs', ROOF_STATS)
json.dump(INFO, open(OUTD+'/batiments_info.json', 'w'), ensure_ascii=False)
ROOF_STATS["triangle_budget_per_building"] = 400
json.dump(ROOF_STATS, open(OUTD+'/toits_lidar_stats.json', 'w'), ensure_ascii=False)

BMATS = (('res', M_RES), ('com', M_COM), ('plain', M_PLAIN), ('barre', M_BARRE), ('tour', M_TOUR), ('pignon', M_PIGNON), ('roof_t', M_ROOF_T), ('roof_s', M_ROOF_S), ('roof_f', M_ROOF_F))
if TILES:
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tuiles.py')).read())
    ACC = {}
    # material holders: the game takes the building materials (with their textures) from objets.glb by name
    G.node('Materiaux_batiments', [G.prim(np.zeros((3, 3)), np.array([0, 1, 2]), m, uv=np.zeros((3, 2)), col=np.full((3, 4), 255)) for k, m in BMATS])
for cell in sorted(set(c for c, k in ACC)):
    prims_b = []
    for k, m in (('res', M_RES), ('com', M_COM), ('plain', M_PLAIN), ('barre', M_BARRE), ('tour', M_TOUR), ('pignon', M_PIGNON), ('roof_t', M_ROOF_T), ('roof_s', M_ROOF_S), ('roof_f', M_ROOF_F)):
        a = ACC.get((cell, k))
        if not a: continue
        P = np.vstack(a['p']); I = np.concatenate(a['i']); UV = np.vstack(a['uv']); C = np.vstack(a['c'])
        prims_b.append(G.prim(P, I, m, uv=UV, col=C))
    G.node(f'Batiments_{cell[0]}_{cell[1]}', prims_b)
# collision footprints: [nRings][len, x,y...] in local metres (x east, z = -north)
fb = bytearray(struct.pack('<I', len(FOOT)))
for r, top in FOOT:
    q = np.stack([r[:, 0]-X0, -(r[:, 1]-Y0)], -1).astype(np.float32)
    fb += struct.pack('<If', len(q), top) + q.tobytes()
open(OUTD+'/batiments_collision.bin', 'wb').write(fb)

# ---------- roads ----------
Rd = json.load(open(f"{D}/routes.json"))['features']
W = {'Type autoroutier': 10, 'Route à 2 chaussées': 7, 'Route à 1 chaussée': 5.5, 'Rond-point': 7, 'Bretelle': 5,
     'Route empierrée': 3.5, 'Chemin': 3}
RA = {}; CL = []; NAMES = {}
from shapely import STRtree
from shapely.geometry import Point
# ---- pass 1: road centre lines, smoothed driving surface
LINES = []
for f in Rd:
    p = f['properties']; nat = p.get('nature')
    if nat not in W: continue
    pos_sol = str(p.get('position_par_rapport_au_sol') or '0')
    if pos_sol.startswith('-'): continue
    w = float(p.get('largeur_de_chaussee') or 0) or W[nat]
    g = shape(f['geometry']); lines = list(g.geoms) if g.geom_type == 'MultiLineString' else [g]
    for ln in lines:
        cz = np.asarray(ln.coords)
        ln2 = LineString(cz[:, :2])
        if ln2.length < 1: continue
        nseg = max(1, int(ln2.length/3)); ds = np.linspace(0, ln2.length, nseg+1)
        P = np.array([ln2.interpolate(t).coords[0] for t in ds])
        tg = np.gradient(P, axis=0); tg /= np.linalg.norm(tg, axis=1, keepdims=True)+1e-9
        nr = np.stack([-tg[:, 1], tg[:, 0]], -1)
        Lp = P+nr*w/2; Rp = P-nr*w/2
        zgr = mesh_h(P[:, 0], P[:, 1])
        if np.isnan(zgr).any(): continue
        zl = mesh_h(Lp[:, 0], Lp[:, 1]); zr = mesh_h(Rp[:, 0], Rp[:, 1])
        if np.isnan(zl).any() or np.isnan(zr).any(): continue
        zm = np.maximum(np.maximum(zl, zr), zgr) + 0.22
        bridge = False
        if pos_sol != '0' and cz.shape[1] == 3 and (cz[:, 2] > 0).all():
            zc = np.interp(ds, np.r_[0, np.cumsum(np.hypot(*np.diff(cz[:, :2], axis=0).T))], cz[:, 2]) + 0.3
            if np.abs(zc-zgr).max() <= 25: zm = np.maximum(zc, zgr+0.22); bridge = True
        # smooth the surface along the road (no bumps from the terrain grid), never sinking far under it
        k = 7 if len(zm) >= 7 else max(1, len(zm) | 1)
        if k > 1:
            pad = np.r_[np.full(k//2, zm[0]), zm, np.full(k//2, zm[-1])]
            sm = np.convolve(pad, np.ones(k)/k, mode='valid')
            zm = np.maximum(sm, zm-0.15)
        LINES.append(dict(P=P, nr=nr, w=w, nat=nat, pos=pos_sol, z=zm, ds=ds, name=p.get('nom_collaboratif_gauche') or '', bridge=bridge,
                          imp=int(p.get('importance') or 5) if str(p.get('importance') or '5').isdigit() else 5, sens=p.get('sens_de_circulation') or 'Double sens', voies=int(p.get('nombre_de_voies') or 0), urbain=bool(p.get('urbain'))))
print('road lines', len(LINES))

for l in LINES: l['sw'] = np.zeros((len(l['P']), 2))
# ---- pass 3: meshes
M_ROAD = G.material('bitume', tex=ftex('bitume'), rough=0.95); M_MARK = G.material('marquage', color=(0.95, 0.95, 0.92, 1))
M_SIDE = G.material('trottoir', tex=ftex('trottoir'), rough=0.9)
CURB = 0.14
for l in LINES:
    CL.append((NAMES.setdefault(l['name'], len(NAMES)), l['w'], l['P'], l['z'], l['sw']))
exec(open(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'roads_v3.py')).read())
# road axes v2: x, z, surface height, sidewalk widths left/right per vertex
rb = bytearray(struct.pack('<II', 0x52445632, len(CL)))
for nid, w, P, zs, sw in CL:
    q = np.stack([P[:, 0]-X0, -(P[:, 1]-Y0), zs-H0, sw[:, 0], sw[:, 1]], -1).astype(np.float32)
    rb += struct.pack('<IfI', nid, w, len(q)) + q.tobytes()
open(OUTD+'/routes_axes.bin', 'wb').write(rb)
json.dump(list(NAMES.keys()), open(OUTD+'/routes_noms.json', 'w'), ensure_ascii=False)
print('roads', len(CL))

# ---------- trees (LiDAR canopy, GPU instancing) ----------
mask = Image.new('L', (3000, 3000), 0); dr = ImageDraw.Draw(mask)
for f in B:
    g = shape(f['geometry'])
    for poly in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        cc = np.asarray(poly.exterior.coords)[:, :2]
        dr.polygon([((x-XMIN)/2, (YMAX-y)/2) for x, y in cc], fill=255)
for f in Rd:
    p = f['properties']; nat = p.get('nature')
    if nat not in W: continue
    w = float(p.get('largeur_de_chaussee') or 0) or W[nat]
    g = shape(f['geometry'])
    for ln in (g.geoms if g.geom_type == 'MultiLineString' else [g]):
        cc = np.asarray(ln.coords)[:, :2]
        dr.line([((x-XMIN)/2, (YMAX-y)/2) for x, y in cc], fill=255, width=max(2, int(round((w+3)/2))))
mask = np.asarray(mask.filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(5))) > 0
from numpy.lib.stride_tricks import sliding_window_view
Hp = np.pad(MNH, 3, constant_values=-99)
loc = sliding_window_view(Hp, (7, 7)).max(axis=(2, 3))
cand = (MNH >= loc-1e-6) & (MNH > 3.0) & (~mask)
rr, cc = np.nonzero(cand)
tx = XMIN+(cc+0.5)*2+rng.uniform(-0.6, 0.6, len(cc)); ty = YMAX-(rr+0.5)*2+rng.uniform(-0.6, 0.6, len(cc))
th = MNH[rr, cc].astype(float)
tz = mesh_h(tx, ty); ok = ~np.isnan(tz); tx, ty, th, tz = tx[ok], ty[ok], th[ok], tz[ok]
print('trees', len(tx))

def tree_mesh(seed, green):
    r = np.random.default_rng(seed)
    # icosphere subdiv 1
    t = (1+5**0.5)/2
    V = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
    V = list(V/np.linalg.norm(V, axis=1, keepdims=True)); mid = {}
    def m(a, b):
        k = (min(a, b), max(a, b))
        if k not in mid: v = V[a]+V[b]; V.append(v/np.linalg.norm(v)); mid[k] = len(V)-1
        return mid[k]
    F2 = []
    F2 = F
    V = np.array(V)*r.uniform(0.85, 1.12, (len(V), 1))
    crown = np.stack([V[:, 0], 0.66+V[:, 1]*0.34, V[:, 2]], -1)
    cc = np.tile([*green, 255], (len(V), 1)).astype(np.int32)
    cc[:, :3] = np.clip(cc[:, :3]*(0.8+0.35*(V[:, 1:2]+1)/2), 0, 255)
    # trunk (hexagonal prism)
    ang = np.linspace(0, 2*np.pi, 7)[:-1]
    tb = np.stack([np.cos(ang)*0.07, np.zeros(6), np.sin(ang)*0.07], -1); tt = tb.copy(); tt[:, 1] = 0.4
    TV = np.vstack([tb, tt]); TF = []
    for k in range(6):
        a, b = k, (k+1) % 6; TF += [[a, 6+b, b], [a, 6+a, 6+b]]
    pos = np.vstack([crown, TV]); idx = np.vstack([np.array(F2), np.array(TF)+len(crown)])
    col = np.vstack([cc, np.tile([92, 70, 50, 255], (12, 1))]).astype(np.uint8)
    return pos, idx, col

# trees -> compact binary with real crown colour from the orthophoto
tc = np.zeros((len(tx), 3))
for dx_ in (-1.0, 0.0, 1.0):
    for dy_ in (-1.0, 0.0, 1.0): tc += ortho_rgb(tx+dx_, ty+dy_)
tc /= 9.0
tc = np.clip(tc*1.15, 0, 255)
rad = np.clip(th*0.3, 1.3, 6.5); rot = rng.uniform(0, 2*np.pi, len(tx))
tb = bytearray(struct.pack('<I', len(tx)))
arr = np.stack([tx-X0, tz-0.2-H0, -(ty-Y0), th, rad, rot], -1).astype(np.float32)
cols = np.c_[tc, np.full(len(tx), 255)].astype(np.uint8)
tb += arr.tobytes() + cols.tobytes()
open(OUTD+'/arbres.bin', 'wb').write(tb)
print('trees bin', len(tx))

# water surfaces (BD TOPO surface_hydrographique)
Wt = json.load(open(f"{D}/eau.json"))['features']
wp, wi, wu, wn = [], [], [], 0
for f in Wt:
    g = shape(f['geometry'])
    for poly in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        poly = Polygon([(x, y) for x, y, *_ in poly.exterior.coords], [[(x, y) for x, y, *_ in r.coords] for r in poly.interiors])
        if not poly.is_valid or poly.area < 4: continue
        rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
        V = np.vstack(rings); ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
        hz = mesh_h(V[:, 0], V[:, 1])
        if np.isnan(hz).any(): continue
        z = float(np.percentile(hz, 20)) + 0.3
        tri = np.asarray(earcut.triangulate_float64(V, ends)).reshape(-1, 3)
        if not len(tri): continue
        A, Bv, C = V[tri[:, 0]], V[tri[:, 1]], V[tri[:, 2]]
        cr = (Bv[:, 0]-A[:, 0])*(C[:, 1]-A[:, 1])-(Bv[:, 1]-A[:, 1])*(C[:, 0]-A[:, 0])
        tri[cr < 0] = tri[cr < 0][:, [0, 2, 1]]
        wp.append(L(V[:, 0], V[:, 1], np.full(len(V), z))); wu.append(V/8.0); wi.append(tri.ravel()+wn); wn += len(V)
if wp:
    M_WATER = G.material('eau', tex=G.texture(Image.new('RGB', (8, 8), (255, 255, 255))), color=(0.16, 0.24, 0.22, 1), rough=0.05)
    G.node('Eau', [G.prim(np.vstack(wp), np.concatenate(wi), M_WATER, uv=np.vstack(wu))])
print('water polys', len(wp))

G.g["scenes"][0]["extras"] = {"origine": "31 allée Le Gréco, 87100 Limoges", "lambert93": [X0, Y0, H0], "rayon_m": R}
G.write(OUTD+'/ville_objets.glb')
import os
ROOF_STATS["build_seconds"] = round(time.perf_counter()-BUILD_STARTED, 2)
OUT_BYTES = {name: os.path.getsize(os.path.join(OUTD,name)) for name in os.listdir(OUTD) if os.path.isfile(os.path.join(OUTD,name))}
ROOF_STATS["output_bytes"] = int(sum(OUT_BYTES.values()))
if TILES and os.path.isdir(TILES):
    _tile_files = [os.path.join(root,name) for root,_,names in os.walk(TILES) for name in names if name.endswith('.glb')]
    ROOF_STATS["detailed_tile_bytes"] = int(sum(os.path.getsize(p) for p in _tile_files if '/d_' in p.replace('\\\\','/')))
    ROOF_STATS["lod_tile_bytes"] = int(sum(os.path.getsize(p) for p in _tile_files if '/l_' in p.replace('\\\\','/')))
json.dump(ROOF_STATS, open(OUTD+'/toits_lidar_stats.json', 'w'), ensure_ascii=False)
print('output MB', {k:round(v/1e6,2) for k,v in OUT_BYTES.items()})
