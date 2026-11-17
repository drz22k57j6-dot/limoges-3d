# Fusionne les sorties par arrondissement (dossiers sorties/<ar>/<secteur>.json) dans data/paris/facades/.
import json, os, glob, sys
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'paris', 'facades')
os.makedirs(OUT, exist_ok=True); sect = {}
for f in glob.glob(f'{SRC}/**/*_*.json', recursive=True):
    k = os.path.basename(f)[:-5]
    sect.setdefault(k, []).extend(json.load(open(f))['b'])
idx = {'secteurs': {}, 'source': 'IGN BD TOPO, APUR BDCOM 2023'}
for k, L in sect.items():
    vu = set(); L = [b for b in L if not (b['id'] in vu or vu.add(b['id']))]
    json.dump({'b': L}, open(f'{OUT}/{k}.json', 'w'), ensure_ascii=False, separators=(',', ':')); idx['secteurs'][k] = len(L)
json.dump(idx, open(f'{OUT}/index.json', 'w'), separators=(',', ':'))
print(len(sect), 'secteurs,', sum(idx['secteurs'].values()), 'bâtiments')
