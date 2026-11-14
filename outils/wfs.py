import json, sys, urllib.request, urllib.parse, time
X,Y,R=562924,6528957,3000
layer, props, out = sys.argv[1], sys.argv[2], sys.argv[3]
feats=[]; start=0
while True:
    q=dict(SERVICE='WFS',VERSION='2.0.0',REQUEST='GetFeature',TYPENAMES=layer,COUNT='5000',STARTINDEX=str(start),
           OUTPUTFORMAT='application/json',SRSNAME='EPSG:2154',BBOX=f'{X-R},{Y-R},{X+R},{Y+R},EPSG:2154',
           PROPERTYNAME=props, SORTBY='cleabs')
    url='https://data.geopf.fr/wfs/ows?'+urllib.parse.urlencode(q)
    for a in range(4):
        try: d=json.load(urllib.request.urlopen(url,timeout=180)); break
        except Exception as e: print('retry',e); time.sleep(3)
    f=d['features']; feats+=f; print(layer,start,len(f),flush=True)
    if len(f)<5000: break
    start+=5000
json.dump({'type':'FeatureCollection','features':feats},open(out,'w'))
print('total',len(feats))
