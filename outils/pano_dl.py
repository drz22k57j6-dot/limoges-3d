import json, os, urllib.request, concurrent.futures as cf
from pyproj import Transformer
t = Transformer.from_crs(4326, 2154, always_xy=True)
X0, Y0 = 562924, 6528957
fl = json.load(open('/home/claude/pano/meta.json'))
todo = []
for f in fl:
    lo, la = f['geometry']['coordinates'][:2]; x, y = t.transform(lo, la)
    if (x-X0)**2+(y-Y0)**2 < 1060**2: todo.append(f)
print('photos in pilot', len(todo), flush=True)
def get(f):
    out = f"/home/claude/pano/img/{f['id']}.jpg"
    if os.path.exists(out) and os.path.getsize(out) > 1000: return 1
    for a in range(3):
        try:
            data = urllib.request.urlopen(f['assets']['sd']['href'], timeout=60).read()
            open(out, 'wb').write(data); return 1
        except Exception as e: err = e
    return 0
with cf.ThreadPoolExecutor(12) as ex:
    n = 0
    for r in ex.map(get, todo):
        n += r
        if n % 200 == 0: print(n, flush=True)
print('done', n)
