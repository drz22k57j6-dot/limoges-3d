# Extrait de la BDCOM 2023 (APUR) les commerces réels des rues modèles des 3 rues test, côté pair / impair, dans l'ordre des numéros.
import json, gzip, re, os
D = os.path.dirname(os.path.abspath(__file__))
d = json.load(gzip.open(f'{D}/bdcom_BDCOM_2023.json.gz'))
def typ(c):
    if c.startswith('AA'): return 'vacant'
    if c.startswith('AD') or c in ('CC102', 'CC103'): return 'sante'
    m = {'CA101': 'epicerie', 'CA102': 'epicerie', 'CA103': 'boulangerie', 'CA104': 'boulangerie', 'CA105': 'chocolatier', 'CA106': 'epicerie', 'CA107': 'superette',
         'CA108': 'primeur', 'CA109': 'boucherie', 'CA110': 'poissonnerie', 'CA111': 'caviste', 'CA112': 'fromagerie', 'CA113': 'rapide', 'CA114': 'epicerie',
         'CC101': 'pharmacie', 'CC201': 'beaute', 'CC202': 'beaute', 'CC203': 'beaute', 'CC301': 'opticien', 'CE103': 'tabac', 'CE501': 'tabac', 'CE508': 'tabac',
         'CF201': 'fleuriste', 'CF202': 'fleuriste', 'CH201': 'cafe', 'CH202': 'tabac', 'CH301': 'restaurant', 'CH302': 'rapide', 'CH303': 'rapide', 'CH401': 'cafe',
         'CH402': 'tabac', 'CH403': 'cafe', 'SA101': 'pressing', 'SA102': 'pressing', 'SA104': 'pressing', 'SA105': 'laverie', 'SA201': 'coiffeur', 'SB101': 'immobilier',
         'GM101': 'mode'}
    if c in m: return m[c]
    if c[:3] in ('CA2', 'CA3'): return 'superette'
    if c[:2] == 'CB' or c[:3] == 'CE2': return 'mode'
    if c[:2] == 'CD' or c[:3] in ('CE4', 'CF1'): return 'maison'
    if c[:3] in ('CE1',) or c == 'CE304': return 'librairie'
    if c[:3] == 'CH1' or c[:3] == 'CH5': return 'restaurant'
    if c[:3] == 'SA2': return 'beaute'
    if c[:3] == 'SB2': return 'banque'
    return 'autre'
if __name__ == '__main__':
    RUES = {"7e": (7, 'RUE', 'CLER', 'Rue Cler'), '16e': (16, 'AV', 'VICTOR HUGO', 'Avenue Victor-Hugo'), '19e': (19, 'RUE', 'MEAUX', 'Rue de Meaux')}
    out = {}
    for k, (arr, tv, lv, nom) in RUES.items():
        rows = [r for r in d if r['lib_voie'] == lv and r['typ_voie'] == tv and r['sit'] in ('R', 'A') and r['num']]
        cotes = []
        for par in (0, 1):
            adr = {}
            for r in rows:
                if r['num'] % 2 != par: continue
                key = (r['num'], r['let'] or '')
                nm = (r['ens'] or '').strip()
                adr.setdefault(key, []).append((r['seq'] or 0, {'t': typ(r['codact']), 'nom': '' if nm in ('', 'SANS ENSEIGNE', 'NC') else nm, 'code': r['codact']}))
            keys = sorted(adr)
            seq, prev = [], None
            for key in keys:
                if prev is not None:
                    for n in range(prev + 2, key[0], 2): seq.append({'num': n, 'shops': []})   # immeuble sans local commercial
                seq.append({'num': f'{key[0]}{key[1]}', 'shops': [s for _, s in sorted(adr[key], key=lambda x: x[0])]})
                prev = key[0]
            # on démarre la rue test sur le tronçon le plus commerçant (fenêtre de 10 adresses)
            best = max(range(max(1, len(seq) - 9)), key=lambda i: sum(min(3, len(a['shops'])) for a in seq[i:i + 10]))
            cotes.append(seq[best:])
        out[k] = {'rue': nom, 'cotes': cotes, 'source': 'APUR BDCOM 2023 (ODbL)'}
        print(k, nom, [len(c) for c in cotes], sum(len(a['shops']) for c in cotes for a in c), 'commerces')
    json.dump(out, open(f'{D}/../../moteur_facades/data/commerces_rues_test.json', 'w'), ensure_ascii=False, separators=(',', ':'))
