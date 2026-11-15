import re, urllib.request, sys, json
import pyarrow.parquet as pq, fsspec
from concurrent.futures import ThreadPoolExecutor
BASE = 'https://overturemaps-us-west-2.s3.amazonaws.com'
REL = 'release/2026-10-21.0'
typ = sys.argv[1]; theme = sys.argv[2]; out = sys.argv[3]
lst = urllib.request.urlopen(f'{BASE}/?list-type=2&prefix={REL}/theme={theme}/type={typ}/', timeout=60).read().decode()
keys = re.findall(r'<Key>([^<]+)</Key>', lst)
print(len(keys), 'files', flush=True)
import os
if os.environ.get('CITY_X0'):
    from pyproj import Transformer
    _t = Transformer.from_crs(2154, 4326, always_xy=True); _cx, _cy = float(os.environ['CITY_X0']), float(os.environ['CITY_Y0'])
    _a = _t.transform(_cx - 3100, _cy - 3100); _b = _t.transform(_cx + 3100, _cy + 3100)
    X0, Y0, X1, Y1 = _a[0], _a[1], _b[0], _b[1]
else:
    X0, Y0, X1, Y1 = 1.1945, 45.8195, 1.2727, 45.8735
fs = fsspec.filesystem('https')
def scan(k):
    f = pq.ParquetFile(fs.open(f'{BASE}/{k}', block_size=2**20))
    names = f.schema_arrow.names
    md = f.metadata; rows = []
    # bbox column stats per row group
    col = {}
    for i in range(md.row_group(0).num_columns):
        p = md.row_group(0).column(i).path_in_schema
        if p in ('bbox.xmin', 'bbox.xmax', 'bbox.ymin', 'bbox.ymax'): col[p] = i
    hits = []
    for g in range(md.num_row_groups):
        rg = md.row_group(g); st = {p: rg.column(i).statistics for p, i in col.items()}
        if st['bbox.xmin'].min > X1 or st['bbox.xmax'].max < X0 or st['bbox.ymin'].min > Y1 or st['bbox.ymax'].max < Y0: continue
        hits.append(g)
    if not hits: return None
    t = f.read_row_groups(hits)
    b = t.column('bbox').to_pylist()
    m = [bb['xmax'] >= X0 and bb['xmin'] <= X1 and bb['ymax'] >= Y0 and bb['ymin'] <= Y1 for bb in b]
    import pyarrow as pa
    return t.filter(pa.array(m))
tables = []
with ThreadPoolExecutor(16) as ex:
    for k, t in zip(keys, ex.map(scan, keys)):
        if t is not None and t.num_rows: tables.append(t); print(k[-20:], t.num_rows, flush=True)
import pyarrow as pa
T = pa.concat_tables(tables, promote_options='default')
pq.write_table(T, out)
print('rows', T.num_rows)
