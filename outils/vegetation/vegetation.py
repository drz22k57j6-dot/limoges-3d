#!/usr/bin/env python3
"""Génération des arbres, haies et massifs de Paris."""
import json, math, time
from collections import Counter, defaultdict
from pathlib import Path
import requests
from pyproj import Transformer
from shapely.geometry import shape, Polygon, MultiPolygon, GeometryCollection, LineString
from shapely.ops import transform

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"data/paris/vegetation"
REPORT=ROOT/"outils/vegetation/rapport.md"
TREE_URL="https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/les-arbres/exports/json"
WFS_URL="https://data.geopf.fr/wfs/ows"
TREE_PARAMS={"select":"idbase,libellefrancais,genre,espece,circonferenceencm,hauteurenm,stadedeveloppement,geo_point_2d"}
BBOX=(643000,6857000,661000,6867500)
WGS=Transformer.from_crs(4326,2154,always_xy=True)
SPECIES={0:"autre",1:"platane",2:"marronnier",3:"tilleul",4:"érable",5:"sophora",6:"frêne",7:"chêne",8:"févier",9:"micocoulier",10:"orme",11:"cerisier/prunus",12:"charme",13:"pin",14:"conifère",15:"peuplier",16:"bouleau"}
GENERA=[(1,("platanus",)),(2,("aesculus",)),(3,("tilia",)),(4,("acer",)),(5,("styphnolobium","sophora")),(6,("fraxinus",)),(7,("quercus",)),(8,("gleditsia",)),(9,("celtis",)),(10,("ulmus",)),(11,("prunus",)),(12,("carpinus",)),(13,("pinus",)),(14,("taxus","thuja","cupressus")),(15,("populus",)),(16,("betula",))]
FACT={1:.65,2:.7,3:.55,4:.6,5:.7,14:.35,15:.3}
S=requests.Session()
S.headers["User-Agent"]="limoges-3d-vegetation/1.0"

def get_json(url,params):
    err=None
    for n in range(3):
        try:
            r=S.get(url,params=params,timeout=300); r.raise_for_status(); return r.json()
        except Exception as e:
            err=e
            if n<2: time.sleep(5*(n+1))
    raise RuntimeError(f"Échec après 3 essais: {err}")

def clamp(v,a,b): return max(a,min(b,v))
def species(g):
    g=str(g or "").lower()
    return next((c for c,names in GENERA if any(n in g for n in names)),0)
def stage(v):
    s=str(v or "").lower()
    if "jeune" in s:return 0
    if "adulte" in s:return 1
    if "mature" in s:return 2
    return 3
def sector(x,z): return f"{math.floor((x+10000)/1000)}_{math.floor((-z+6000)/1000)}"
def height(raw,circ,st):
    try:
        h=float(raw)
        if 1<=h<=45:return clamp(h,2,40),False
    except (TypeError,ValueError):pass
    try:c=float(circ)
    except (TypeError,ValueError):c=0
    h=({0:6,1:15,2:24,3:12}[st] if c<=0 else clamp(4+c/18,2,40))
    if st==0:h=clamp(h,4,8)
    elif st==1:h=clamp(h,10,20)
    elif st==2:h=clamp(h,18,30)
    return clamp(h,2,40),True
def tree(row):
    p=row.get("geo_point_2d") or {}
    if isinstance(p,str):
        try:p=json.loads(p)
        except Exception:return None
    try:E,N=WGS.transform(float(p["lon"]),float(p["lat"]))
    except (KeyError,TypeError,ValueError):return None
    x,z=E-652087,-(N-6862038)
    st=stage(row.get("stadedeveloppement")); h,est=height(row.get("hauteurenm"),row.get("circonferenceencm"),st)
    try:trunk=clamp(float(row["circonferenceencm"])/314,.05,2.5)
    except (KeyError,TypeError,ValueError):trunk=clamp(h*.025,.05,2.5)
    code=species(row.get("genre")); crown=clamp(FACT.get(code,.55)*h,1.5,25)
    try:seed=int(float(row["idbase"]))
    except (KeyError,TypeError,ValueError):seed=abs(hash((round(x,1),round(z,1))))%2147483647
    return sector(x,z),[round(x,1),round(z,1),code,round(h,1),round(crown,1),round(trunk,2),st,seed],est

def polygons(g):
    if g.geom_type=="Polygon":yield g
    elif isinstance(g,(MultiPolygon,GeometryCollection)):
        for part in g.geoms:yield from polygons(part)
def game_geom(g):return transform(lambda x,y,z=None:(x-652087,-(y-6862038)),g)
def hedge_axis(g):
    if g.geom_type=="LineString":return g.simplify(.5)
    ps=list(polygons(g))
    if not ps:return None
    p=max(ps,key=lambda q:q.area); r=p.minimum_rotated_rectangle; c=list(r.exterior.coords)
    edges=[(math.hypot(c[i+1][0]-c[i][0],c[i+1][1]-c[i][1]),c[i],c[i+1]) for i in range(4)]
    _,a,b=max(edges,key=lambda e:e[0]); dx,dy=b[0]-a[0],b[1]-a[1]; d=math.hypot(dx,dy) or 1
    reach=max(p.bounds[2]-p.bounds[0],p.bounds[3]-p.bounds[1])*2+10
    axis=LineString([(p.centroid.x-dx/d*reach,p.centroid.y-dy/d*reach),(p.centroid.x+dx/d*reach,p.centroid.y+dy/d*reach)])
    cut=axis.intersection(p)
    if cut.geom_type=="LineString":return cut.simplify(.5)
    ls=[v for v in getattr(cut,"geoms",[]) if v.geom_type=="LineString"]
    return max(ls,key=lambda v:v.length) if ls else None
def wfs():
    seen=set(); xmin,ymin,xmax,ymax=BBOX
    for xx in range(xmin,xmax,2000):
      for yy in range(ymin,ymax,2000):
        tile=(xx,yy,min(xx+2000,xmax),min(yy+2000,ymax)); start=0
        while True:
          params={"service":"WFS","version":"2.0.0","request":"GetFeature","typeNames":"BDTOPO_V3:zone_de_vegetation","outputFormat":"application/json","srsName":"EPSG:2154","bbox":",".join(map(str,tile))+",EPSG:2154","count":5000,"startIndex":start}
          data=get_json(WFS_URL,params); fs=data.get("features",[])
          for f in fs:
            fid=f.get("id") or json.dumps(f.get("properties",{}),sort_keys=True)
            if fid not in seen:seen.add(fid);yield f
          if len(fs)<5000:break
          start+=len(fs)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    data=get_json(TREE_URL,TREE_PARAMS)
    if not isinstance(data,list):raise RuntimeError("Export arbres non conforme")
    sectors=defaultdict(lambda:{"a":[],"h":[],"m":[]}); counts=Counter(); estimated=trees=0
    for row in data:
        v=tree(row)
        if not v:continue
        key,rec,est=v;sectors[key]["a"].append(rec);counts[rec[2]]+=1;trees+=1;estimated+=int(est)
    hedges=massifs=0
    for f in wfs():
        props=f.get("properties") or {}; nature=str(props.get("nature") or props.get("NATURE") or "").lower()
        if not f.get("geometry"):continue
        try:g=shape(f["geometry"])
        except Exception:continue
        if "haie" in nature:
            line=hedge_axis(g)
            if line is None or line.length<.5:continue
            ps=list(polygons(g)); width=1.0
            if ps:
                r=max(ps,key=lambda p:p.area).minimum_rotated_rectangle; cc=list(r.exterior.coords)
                lens=[math.hypot(cc[i+1][0]-cc[i][0],cc[i+1][1]-cc[i][1]) for i in range(4)]
                if lens:width=max(.3,min(lens))
            gl=game_geom(line); pt=gl.interpolate(.5,normalized=True)
            coords=[[round(x,1),round(y,1)] for x,y in gl.coords]
            sectors[sector(pt.x,pt.y)]["h"].append([coords,round(width,1),1.5]);hedges+=1
        elif any(t in nature for t in ("lande ligneuse","bois","forêt fermée de feuillus","forêt fermée de mixte")):
            h=2.0 if "lande ligneuse" in nature else 12.0
            for p in polygons(g):
                p=p.simplify(1,preserve_topology=True)
                if p.is_empty or p.area<1:continue
                gp=game_geom(p);coords=[[round(x,1),round(y,1)] for x,y in list(gp.exterior.coords)[:-1]]
                if len(coords)<3:continue
                pt=gp.representative_point();sectors[sector(pt.x,pt.y)]["m"].append([coords,h]);massifs+=1
    total=0; sector_counts={}
    for key,obj in sectors.items():
        obj["a"].sort(key=lambda a:(a[0],a[1],a[7]))
        path=OUT/f"{key}.json";path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
        total+=path.stat().st_size;sector_counts[key]=len(obj["a"])
    index={"secteurs":dict(sorted(sector_counts.items())),"especes":{str(k):v for k,v in sorted(SPECIES.items())},"source":"Ville de Paris (ODbL), IGN BD TOPO (Licence Ouverte)"}
    ip=OUT/"index.json";ip.write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");total+=ip.stat().st_size
    lines=["# Rapport – végétation de Paris","",f"- Arbres : **{trees}**",f"- Hauteurs estimées : **{estimated} ({(100*estimated/trees if trees else 0):.1f} %)**",f"- Haies : **{hedges}**",f"- Massifs : **{massifs}**",f"- Secteurs : **{len(sectors)}**",f"- Taille totale : **{total} octets ({total/1048576:.2f} Mio)**","","## Arbres par espèce","","| Code | Espèce | Nombre |","|---:|---|---:|"]
    lines += [f"| {c} | {name} | {counts.get(c,0)} |" for c,name in sorted(SPECIES.items())]
    lines += ["","Sources : Ville de Paris (ODbL) ; IGN BD TOPO V3 (Licence Ouverte).",""]
    REPORT.parent.mkdir(parents=True,exist_ok=True);REPORT.write_text("\n".join(lines),encoding="utf-8")
    print(f"OK: {trees} arbres, {hedges} haies, {massifs} massifs, {len(sectors)} secteurs")
if __name__=="__main__":main()
