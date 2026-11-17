#!/usr/bin/env python3
"""Mesure la couverture photographique des façades de la rue Cler."""
from __future__ import annotations
import glob, json, math, os, statistics, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
FACADE_DIR = ROOT / "data" / "paris" / "facades"
OUT_JSON, OUT_MD = ROOT / "outils/photos/rapport_cler.json", ROOT / "outils/photos/rapport_cler.md"
BBOX = (2.3040, 48.8540, 2.3085, 48.8595)
ORIGIN_E, ORIGIN_N = 652087.0, 6862038.0
TO_LOCAL = Transformer.from_crs("EPSG:4326", "EPSG:2154", always_xy=True)
TO_WGS84 = Transformer.from_crs("EPSG:2154", "EPSG:4326", always_xy=True)
HEADERS = {"User-Agent": "limoges-3d-facade-coverage/1.0"}

def get_json(url, params=None):
    error = None
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=45)
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as exc:
            error = exc
            if attempt < 2: time.sleep(2 ** attempt)
    raise RuntimeError(f"Échec après 3 essais: {url}: {error}")

def parse_date(value, millis=False):
    if value in (None, ""): return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / (1000 if millis or value > 10**11 else 1), timezone.utc)
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    except (ValueError, OverflowError, OSError): return None

def date_text(dt): return dt.isoformat().replace("+00:00", "Z") if dt else None
def angle_diff(a, b): return abs((a - b + 180) % 360 - 180)

def load_facades():
    result = []
    for filename in sorted(glob.glob(str(FACADE_DIR / "*_*.json"))):
        try: payload = json.loads(Path(filename).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Fichier ignoré {filename}: {exc}", file=sys.stderr); continue
        for building in payload.get("b", []):
            bid = str(building.get("id", "inconnu"))
            for i, segment in enumerate(building.get("f", [])):
                a, b = segment.get("a"), segment.get("b")
                if not a or not b or len(a) < 2 or len(b) < 2: continue
                ax, az, bx, bz = float(a[0]), float(a[1]), float(b[0]), float(b[1])
                dx, dz = bx-ax, bz-az
                length = math.hypot(dx, dz)
                if length <= 0: continue
                x, z = (ax+bx)/2, (az+bz)/2
                lon, lat = TO_WGS84.transform(x+ORIGIN_E, ORIGIN_N-z)
                if not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]): continue
                result.append({"id":bid, "facade_id":f"{bid}:{i}", "length_m":length,
                               "x":x, "z":z, "lon":lon, "lat":lat,
                               "nx":-dz/length, "nz":dx/length})
    return result

def photo_url(feature):
    props = feature.get("properties") or {}
    for container in (feature.get("assets"), props.get("assets")):
        if isinstance(container, dict):
            for key in ("sd", "thumb"):
                item = container.get(key)
                if isinstance(item, str): return item
                if isinstance(item, dict) and item.get("href"): return item["href"]
    for link in feature.get("links", []) + props.get("links", []):
        if str(link.get("rel","")).lower() in ("sd","thumb","preview","thumbnail") and link.get("href"):
            return link["href"]
    return None

def fetch_panoramax():
    url = "https://api.panoramax.xyz/api/search"
    params = {"bbox": ",".join(map(str,BBOX)), "limit":1000}
    photos, seen = [], set()
    while url:
        data = get_json(url, params); params = None
        for f in data.get("features", []):
            props = f.get("properties") or {}
            coords = (f.get("geometry") or {}).get("coordinates")
            if not coords or len(coords)<2: continue
            orientation = props.get("pers:interior_orientation") or {}
            photos.append({"id":str(f.get("id",props.get("id",""))),
                "lon":float(coords[0]),"lat":float(coords[1]),
                "azimuth":props.get("view:azimuth"),
                "fov":orientation.get("field_of_view"),
                "date":parse_date(props.get("datetime") or props.get("date")),
                "url":photo_url(f)})
        nxt = next((urljoin(url,l["href"]) for l in data.get("links",[])
                    if l.get("rel")=="next" and l.get("href")), None)
        if nxt in seen: break
        if nxt: seen.add(nxt)
        url = nxt
    return photos

def fetch_mapillary():
    token = os.environ.get("MAPILLARY_TOKEN")
    if not token: print("MAPILLARY_TOKEN absent: Mapillary ignoré."); return []
    data = get_json("https://graph.mapillary.com/images", {
        "access_token":token,"bbox":",".join(map(str,BBOX)),
        "fields":"id,computed_geometry,computed_compass_angle,captured_at,thumb_1024_url","limit":2000})
    photos=[]
    for f in data.get("data",[]):
        coords=(f.get("computed_geometry") or {}).get("coordinates")
        if not coords or len(coords)<2: continue
        photos.append({"id":str(f.get("id","")),"lon":float(coords[0]),"lat":float(coords[1]),
            "azimuth":f.get("computed_compass_angle"),"date":parse_date(f.get("captured_at"),True),
            "url":f.get("thumb_1024_url")})
    return photos

def evaluate(facades, photos):
    for p in photos:
        E, N = TO_LOCAL.transform(p["lon"], p["lat"])
        p["x"], p["z"] = E - ORIGIN_E, -(N - ORIGIN_N)
    out={}
    for f in facades:
        matches=[]
        for p in photos:
            fov = p.get("fov")
            try:
                is_360 = fov is not None and float(fov) >= 360
            except (TypeError, ValueError):
                is_360 = False
            if p.get("azimuth") is None and not is_360: continue
            vx,vz=f["x"]-p["x"],f["z"]-p["z"]
            dist=math.hypot(vx,vz)
            if not 4 <= dist <= 35: continue
            if not is_360:
                bearing=(math.degrees(math.atan2(vx,-vz))+360)%360
                if angle_diff(float(p["azimuth"]),bearing) >= 35: continue
            if f["nx"]*(vx/dist)+f["nz"]*(vz/dist) >= -0.3: continue
            matches.append((p,dist))
        matches.sort(key=lambda x:(x[0]["date"] is not None,
            x[0]["date"] or datetime.min.replace(tzinfo=timezone.utc),-x[1]),reverse=True)
        best=matches[0] if matches else None
        out[f["facade_id"]]={"count":len(matches),"best":{
            "id":best[0]["id"],"url":best[0]["url"],"date":date_text(best[0]["date"]),
            "distance_m":round(best[1],2)} if best else None}
    return out

def main():
    facades=load_facades()
    print(f"{len(facades)} segments de façade dans la bbox.")
    try: pano=fetch_panoramax()
    except Exception as e: print(f"Panoramax indisponible: {e}",file=sys.stderr); pano=[]
    try: mapi=fetch_mapillary()
    except Exception as e: print(f"Mapillary indisponible: {e}",file=sys.stderr); mapi=[]
    pr,mr=evaluate(facades,pano),evaluate(facades,mapi)
    rows=[]; ages=[]; examples=[]
    now=datetime.now(timezone.utc)
    for f in facades:
        p,m=pr[f["facade_id"]],mr[f["facade_id"]]
        bests=[x for x in (p["best"],m["best"]) if x]
        bests.sort(key=lambda x:(x["date"] is not None,x["date"] or "",-x["distance_m"]),reverse=True)
        best=bests[0] if bests else None
        for item in bests:
            dt=parse_date(item.get("date"))
            if dt: ages.append(max(0,(now-dt).total_seconds()/(365.2425*86400)))
        rows.append({"building_id":f["id"],"facade_id":f["facade_id"],
            "length_m":round(f["length_m"],2),"panoramax_count":p["count"],
            "mapillary_count":m["count"],"best_photo":best})
        if best and len(examples)<10: examples.append((f["facade_id"],best.get("url")))
    total=len(rows); cp=sum(r["panoramax_count"]>0 for r in rows)
    cm=sum(r["mapillary_count"]>0 for r in rows)
    ca=sum(r["panoramax_count"]>0 or r["mapillary_count"]>0 for r in rows)
    pct=lambda n:round(100*n/total,1) if total else 0.0
    median=round(statistics.median(ages),2) if ages else None
    report={"zone":{"name":"Rue Cler, Paris 7e","bbox":list(BBOX)},"generated_at":date_text(now),
      "sources":{"panoramax_photos":len(pano),"panoramax_360_photos":sum(1 for p in pano if p.get("fov") is not None and str(p.get("fov")).replace('.', '', 1).isdigit() and float(p["fov"]) >= 360),"mapillary_photos":len(mapi),"total_photos":len(pano)+len(mapi)},
      "summary":{"facades":total,"covered_panoramax":cp,"covered_mapillary":cm,"covered_any":ca,
       "panoramax_percent":pct(cp),"mapillary_percent":pct(cm),"any_percent":pct(ca),
       "median_photo_age_years":median},"facades":rows}
    OUT_JSON.parent.mkdir(parents=True,exist_ok=True)
    OUT_JSON.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines=["# Couverture photo des façades — rue Cler","",
      f"Généré le {date_text(now)}. Bbox : {BBOX}.","",
      f"- Façades analysées : **{total}**",
      f"- Couvertes par Panoramax : **{cp}/{total} ({pct(cp)} %)**",
      f"- Couvertes par Mapillary : **{cm}/{total} ({pct(cm)} %)**",
      f"- Couvertes par au moins une source : **{ca}/{total} ({pct(ca)} %)**",
      f"- Âge médian des photos : **{median} ans**" if median is not None else "- Âge médian des photos : non disponible",
      f"- Photos récupérées : Panoramax {len(pano)}, dont 360° : {sum(1 for p in pano if p.get('fov') is not None and str(p.get('fov')).replace('.', '', 1).isdigit() and float(p['fov']) >= 360)} ; Mapillary {len(mapi)} ; total : {len(pano)+len(mapi)}","",
      "## 10 exemples (façade et meilleure URL)",""]
    lines += [f"- \`{fid}\` — {url or 'URL indisponible'}" for fid,url in examples]
    if not examples: lines.append("- Aucun exemple : aucune photo répondant aux critères.")
    OUT_MD.write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(f"Rapports écrits : {OUT_JSON} et {OUT_MD}")

if __name__=="__main__": main()
