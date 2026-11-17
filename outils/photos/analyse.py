#!/usr/bin/env python3
"""Analyse visuelle des façades de la rue Cler depuis Panoramax/Mapillary."""
from __future__ import annotations
import glob, json, math, os, re, statistics, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
import numpy as np
import requests
import torch
from PIL import Image, ImageFilter
from pyproj import Transformer
from pytesseract import image_to_string
from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

ROOT=Path(__file__).resolve().parents[2]
FACADE_DIR=ROOT/"data/paris/facades"
REPORT_IN=ROOT/"outils/photos/rapport_cler.json"
OUT_DIR=ROOT/"data/paris/facades_photos"
OUT_JSON=OUT_DIR/"cler.json"
OUT_MD=ROOT/"outils/photos/analyse_cler.md"
WARP_DIR=ROOT/"redressees"
MODEL_NAME="nvidia/segformer-b2-finetuned-ade-512-512"
ORIGIN_E,ORIGIN_N=652087.0,6862038.0
TO_L93=Transformer.from_crs("EPSG:4326","EPSG:2154",always_xy=True)
HEADERS={"User-Agent":"limoges-3d-facade-analysis/1.0"}
MAX_IMAGE_BYTES=30*1024*1024
OUT_W_MAX,OUT_H,PPM=1600,200,40
CAMERA_H=2.0
KEYWORDS={
 "mur":("wall","building","house"),
 "ouverture":("window","windowpane","door","glass"),
 "auvent":("awning",),
 "enseigne":("signboard","sign"),
 "sol":("sidewalk","road","floor","ground"),
 "obstacle":("car","truck","bus","person","bicycle","motorbike","motorcycle","tree","plant","pole"),
}

def get_json(url,params=None):
 err=None
 for attempt in range(3):
  try:
   r=requests.get(url,params=params,headers=HEADERS,timeout=50); r.raise_for_status(); return r.json()
  except (requests.RequestException,ValueError) as exc:
   err=exc
   if attempt<2: time.sleep(2**attempt)
 raise RuntimeError(f"API inaccessible après 3 essais ({url}): {err}")

def photo_url(feature):
 props=feature.get("properties") or {}
 for container in (feature.get("assets"),props.get("assets")):
  if isinstance(container,dict):
   for key in ("sd","thumb","thumbnail"):
    item=container.get(key)
    if isinstance(item,str): return item
    if isinstance(item,dict) and item.get("href"): return item["href"]
 for link in feature.get("links",[])+props.get("links",[]):
  if str(link.get("rel","")).lower() in ("sd","thumb","preview","thumbnail") and link.get("href"): return link["href"]
 return None

def parse_date(value):
 if not value: return None
 try:
  if isinstance(value,(int,float)): return datetime.fromtimestamp(value/(1000 if value>10**11 else 1),timezone.utc)
  dt=datetime.fromisoformat(str(value).replace("Z","+00:00"))
  return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
 except (ValueError,OverflowError,OSError): return None

def load_facades():
 result={}
 for filename in sorted(glob.glob(str(FACADE_DIR/"*_*.json"))):
  try: payload=json.loads(Path(filename).read_text(encoding="utf-8"))
  except (OSError,json.JSONDecodeError) as exc:
   print(f"Fichier façade ignoré {filename}: {exc}",file=sys.stderr); continue
  for building in payload.get("b",[]):
   bid=str(building.get("id","inconnu"))
   for index,seg in enumerate(building.get("f",[])):
    a,b=seg.get("a"),seg.get("b")
    if not a or not b or len(a)<2 or len(b)<2: continue
    ax,az,bx,bz=map(float,(a[0],a[1],b[0],b[1]))
    dx,dz=bx-ax,bz-az; length=math.hypot(dx,dz)
    if length<=0.01: continue
    fid=f"{bid}:{index}"
    result[fid]={"facade_id":fid,"a":(ax,az),"b":(bx,bz),"length":length,"nx":-dz/length,"nz":dx/length}
 return result

def fetch_panoramax():
 url="https://api.panoramax.xyz/api/search"
 params={"bbox":"2.304,48.854,2.3085,48.8595","limit":1000}
 photos=[]; seen=set()
 while url:
  data=get_json(url,params); params=None
  for feature in data.get("features",[]):
   props=feature.get("properties") or {}; coords=(feature.get("geometry") or {}).get("coordinates")
   if not coords or len(coords)<2: continue
   orientation=props.get("pers:interior_orientation") or {}
   photos.append({"id":str(feature.get("id",props.get("id",""))),"lon":float(coords[0]),"lat":float(coords[1]),
    "azimuth":props.get("view:azimuth"),"fov":orientation.get("field_of_view") or props.get("view:field_of_view"),
    "date":props.get("datetime") or props.get("date"),"url":photo_url(feature),"source":"Panoramax (CC BY-SA)"})
  nxt=next((urljoin(url,x["href"]) for x in data.get("links",[]) if x.get("rel")=="next" and x.get("href")),None)
  if nxt in seen: break
  if nxt: seen.add(nxt)
  url=nxt
 return photos

def photo_from_report(item):
 pos=item.get("position") or item.get("geometry") or {}
 coords=pos.get("coordinates") if isinstance(pos,dict) else None
 lon=item.get("lon",item.get("longitude")); lat=item.get("lat",item.get("latitude"))
 if coords and len(coords)>=2: lon,lat=coords[0],coords[1]
 if lon is None or lat is None: return None
 return {"id":str(item.get("id","")),"lon":float(lon),"lat":float(lat),
  "azimuth":item.get("azimuth",item.get("compass_angle")),"fov":item.get("fov",item.get("field_of_view")),
  "date":item.get("date",item.get("datetime")),"url":item.get("url") or item.get("image_url"),
  "source":item.get("source") or "Panoramax (CC BY-SA)"}

def deduplicate(photos):
 seen=set(); out=[]
 for p in photos:
  key=(p.get("source"),p.get("id"),p.get("url"))
  if key not in seen and p.get("url"): seen.add(key); out.append(p)
 return out

def load_photos(report):
 photos=[]
 for facade in report.get("facades",[]):
  for item in facade.get("photos",[]):
   p=photo_from_report(item)
   if p: photos.append(p)
 if photos:
  print(f"{len(photos)} photos détaillées lues depuis rapport_cler.json."); return deduplicate(photos)
 print("rapport_cler.json ne contient pas les métadonnées géographiques détaillées ; récupération Panoramax.")
 return deduplicate(fetch_panoramax())

def choose_photos(facades,photos):
 selected={}
 for p in photos:
  try:
   e,n=TO_L93.transform(p["lon"],p["lat"]); p["x"],p["z"]=e-ORIGIN_E,-(n-ORIGIN_N)
  except Exception: continue
 for fid,f in facades.items():
  mx=(f["a"][0]+f["b"][0])/2; mz=(f["a"][1]+f["b"][1])/2; candidates=[]
  for p in photos:
   if "x" not in p: continue
   vx,vz=p["x"]-mx,p["z"]-mz; dist=math.hypot(vx,vz)
   if not 4<=dist<=35 or dist==0: continue
   if f["nx"]*(vx/dist)+f["nz"]*(vz/dist)<=0: continue
   candidates.append(p)
  candidates.sort(key=lambda p:(parse_date(p.get("date")) is not None,
   parse_date(p.get("date")) or datetime.min.replace(tzinfo=timezone.utc),
   -math.hypot(p["x"]-mx,p["z"]-mz)),reverse=True)
  selected[fid]=candidates[:3]
 return selected

def download_image(url):
 if not url: return None
 for attempt in range(3):
  try:
   with requests.get(url,headers=HEADERS,timeout=45,stream=True) as r:
    r.raise_for_status(); chunks=[]; size=0
    for chunk in r.iter_content(131072):
     size+=len(chunk)
     if size>MAX_IMAGE_BYTES: raise ValueError("image trop volumineuse")
     chunks.append(chunk)
   from io import BytesIO
   return Image.open(BytesIO(b"".join(chunks))).convert("RGB")
  except Exception as exc:
   print(f"Téléchargement photo essai {attempt+1}/3: {exc}",file=sys.stderr)
   if attempt<2: time.sleep(2**attempt)
 return None

def wrap_angle(deg): return (deg+180.0)%360.0-180.0

def rectify(image,facade,photo):
 width=max(1,min(OUT_W_MAX,int(math.ceil(facade["length"]*PPM)))); height=OUT_H
 a=np.asarray(facade["a"],dtype=np.float64); b=np.asarray(facade["b"],dtype=np.float64)
 t=(np.arange(width,dtype=np.float64)+0.5)/width
 x=a[0]+(b[0]-a[0])*t; z=a[1]+(b[1]-a[1])*t
 heights=4.0-((np.arange(height,dtype=np.float64)+0.5)/height)*5.0
 xx=np.broadcast_to(x[None,:],(height,width)); zz=np.broadcast_to(z[None,:],(height,width))
 hh=np.broadcast_to(heights[:,None],(height,width))
 dx=xx-float(photo["x"]); dn=-(zz-float(photo["z"]))
 horizontal=np.maximum(np.hypot(dx,dn),1e-5)
 yaw=(np.degrees(np.arctan2(dx,dn))+360.0)%360.0
 pitch=np.degrees(np.arctan2(hh-CAMERA_H,horizontal))
 sw,sh=image.size; fov=photo.get("fov")
 try: is360=fov is not None and float(fov)>=360.0
 except (TypeError,ValueError): is360=False
 try: az=float(photo.get("azimuth"))%360.0
 except (TypeError,ValueError): az=0.0
 if is360:
  u=((yaw-az)%360.0)/360.0*sw+sw/2.0; v=(0.5-pitch/180.0)*sh; u%=sw
 else:
  hfov=60.0
  try:
   if fov is not None and 1.0<float(fov)<180.0: hfov=float(fov)
  except (TypeError,ValueError): pass
  vfov=math.degrees(2*math.atan(math.tan(math.radians(hfov/2))*sh/sw))
  rel=np.radians(wrap_angle(yaw-az))
  u=(0.5+np.tan(rel)/(2*math.tan(math.radians(hfov/2))))*sw
  v=(0.5-np.tan(np.radians(pitch))/(2*math.tan(math.radians(vfov/2))))*sh
 valid=(u>=0)&(u<sw)&(v>=0)&(v<sh)
 ux=np.clip(np.rint(u).astype(np.int32),0,sw-1); vy=np.clip(np.rint(v).astype(np.int32),0,sh-1)
 rgb=np.asarray(image)[vy,ux].copy()
 return Image.fromarray(np.dstack((rgb,np.where(valid,255,0).astype(np.uint8))),"RGBA"),valid

def labels_to_groups(model):
 names={int(k):str(v).lower() for k,v in model.config.id2label.items()}
 groups={name:set() for name in KEYWORDS}
 for idx,label in names.items():
  for group,words in KEYWORDS.items():
   if any(word in label for word in words): groups[group].add(idx)
 return groups,names

def rgb_to_lab(rgb):
 arr=np.asarray(rgb,dtype=np.float64)/255.0
 lin=np.where(arr<=0.04045,arr/12.92,((arr+0.055)/1.055)**2.4)
 xyz=lin@np.array([[.4124564,.3575761,.1804375],[.2126729,.7151522,.0721750],[.0193339,.1191920,.9503041]])
 xyz/=np.array([.95047,1.0,1.08883]); d=6/29
 f=np.where(xyz>d**3,np.cbrt(xyz),xyz/(3*d*d)+4/29)
 return np.stack((116*f[...,1]-16,500*(f[...,0]-f[...,1]),200*(f[...,1]-f[...,2])),axis=-1)

def lab_to_hex(lab):
 L,aa,bb=map(float,lab); fy=(L+16)/116; f=np.array([fy+aa/500,fy,fy-bb/200]); d=6/29
 xyz=np.where(f>d,f**3,3*d*d*(f-4/29))*np.array([.95047,1.0,1.08883])
 mat=np.array([[3.2404542,-1.5371385,-.4985314],[-.9692660,1.8760108,.0415560],[.0556434,-.2040259,1.0572252]])
 lin=xyz@mat.T; rgb=np.where(lin<=.0031308,12.92*lin,1.055*np.maximum(lin,0)**(1/2.4)-.055)
 vals=np.clip(np.rint(rgb*255),0,255).astype(int)
 return "#%02x%02x%02x"%tuple(vals)

def median_hex(rgb):
 if rgb is None or len(rgb)==0: return None
 return lab_to_hex(np.median(rgb_to_lab(np.asarray(rgb,dtype=np.uint8)),axis=0))

def kmeans2(values,iterations=20):
 values=np.asarray(values,dtype=np.float64)
 if len(values)<2: return np.zeros(len(values),dtype=int),values[:1]
 centers=np.stack((values[np.argmin(values[:,0])],values[np.argmax(values[:,0])]))
 labels=np.zeros(len(values),dtype=int)
 for iteration in range(iterations):
  new=np.argmin(((values[:,None,:]-centers[None,:,:])**2).sum(axis=2),axis=1)
  if iteration and np.array_equal(new,labels): break
  labels=new
  for k in (0,1):
   if np.any(labels==k): centers[k]=values[labels==k].mean(axis=0)
 return labels,centers

def intervals(mask,metres_per_col):
 idx=np.flatnonzero(mask)
 if not len(idx): return []
 groups=np.split(idx,np.where(np.diff(idx)>1)[0]+1)
 return [[round(float(g[0]*metres_per_col),2),round(float((g[-1]+1)*metres_per_col),2)] for g in groups if len(g)]

def analyze_one(model,processor,groups,facade,photo,fid,photo_index):
 image=download_image(photo.get("url"))
 if image is None: return None
 rectified,valid=rectify(image,facade,photo); image.close()
 arr=np.asarray(rectified.convert("RGB")); pil=Image.fromarray(arr)
 inputs=processor(images=pil,return_tensors="pt")
 with torch.inference_mode():
  logits=model(**inputs).logits
  seg=torch.nn.functional.interpolate(logits,size=(OUT_H,arr.shape[1]),mode="bilinear",align_corners=False).argmax(dim=1)[0].cpu().numpy()
 masks={name:np.isin(seg,list(ids)) if ids else np.zeros(seg.shape,dtype=bool) for name,ids in groups.items()}
 visible=valid&(np.asarray(rectified.getchannel("A"))>0); obstacle=masks["obstacle"]; usable=visible&~obstacle
 rgb=arr.copy()
 floor_px=rgb[usable&masks["sol"]]
 if len(floor_px):
  med=np.median(floor_px,axis=0); target=float(np.mean(med))
  gains=np.clip(target/np.maximum(med,1.0),.7,1.4)
  rgb=np.clip(rgb.astype(np.float32)*gains[None,None,:],0,255).astype(np.uint8)
 wallmask=usable[:160]&masks["mur"][:160]; wallrgb=rgb[:160][wallmask]; facade_color=None; facade_lab=None
 if len(wallrgb):
  lum=wallrgb@np.array([.2126,.7152,.0722]); wallrgb=wallrgb[lum>=np.median(lum)]
  if len(wallrgb):
   facade_lab=np.median(rgb_to_lab(wallrgb),axis=0); facade_color=lab_to_hex(facade_lab)
 r0,r1=20,OUT_H; bandusable=usable[r0:r1]
 bandm={k:v[r0:r1] for k,v in masks.items()}
 nonfront=bandusable&~bandm["mur"]&~bandm["ouverture"]&~bandm["auvent"]
 storefront_color=median_hex(rgb[r0:r1][nonfront])
 open_cols=np.zeros(arr.shape[1],dtype=bool); door_cols=np.zeros(arr.shape[1],dtype=bool)
 for col in range(arr.shape[1]):
  vis=bandusable[:,col]
  if vis.sum() and (bandm["ouverture"][:,col]&vis).sum()/vis.sum()>.5:
   open_cols[col]=True
   door_cols[col]=bool(bandm["ouverture"][-24:,col].any())
 doors=intervals(door_cols,facade["length"]/arr.shape[1])
 windows=intervals(open_cols&~door_cols,facade["length"]/arr.shape[1])
 awning=usable&masks["auvent"]; awn_count=int(awning.sum()); awn_present=awn_count/max(1,int(bandusable.sum()))>.04
 awn_rgb=rgb[awning]; awn_color=median_hex(awn_rgb) if awn_present else None
 striped=False; color2=None; awn_width=None
 if awn_present and len(awn_rgb)>=20:
  _,centers=kmeans2(awn_rgb.reshape(-1,3)); col_labels=[]
  for col in range(arr.shape[1]):
   ys=np.flatnonzero(awning[:,col])
   if len(ys):
    pix=rgb[ys,col]; labs=np.argmin(((pix[:,None,:]-centers[None,:,:])**2).sum(axis=2),axis=1)
    col_labels.append((col,int(np.bincount(labs,minlength=2).argmax())))
  runs=[v for _,v in col_labels]
  transitions=sum(runs[i]!=runs[i-1] for i in range(1,len(runs)))
  striped=transitions>=2
  if striped: color2=lab_to_hex(np.median(rgb_to_lab(np.asarray([centers[1]],dtype=np.uint8)),axis=0))
  awn_width=round(awn_count/max(1,OUT_H)/PPM,2)
 signmask=usable&masks["enseigne"]; sign_text=""
 if signmask.any():
  ys,xs=np.where(signmask); y0,y1=ys.min(),ys.max()+1; x0,x1=xs.min(),xs.max()+1
  crop=rgb[y0:y1,x0:x1].copy(); local=signmask[y0:y1,x0:x1]; crop[~local]=255
  sign_text=re.sub(r"\s+"," ",image_to_string(Image.fromarray(crop),lang="fra")).strip()[:240]
 # Masquer les pixels segmentés comme personnes/véhicules/obstacles avant artefact.
 blurred=np.asarray(Image.fromarray(rgb).filter(ImageFilter.GaussianBlur(radius=12)))
 base=np.asarray(rectified).copy(); base[obstacle,:3]=blurred[obstacle]
 Image.fromarray(base,"RGBA").save(WARP_DIR/f"{fid.replace(':','_')}_{re.sub(r'[^A-Za-z0-9_-]','_',str(photo.get('id') or photo_index))}.png",optimize=True)
 return {"facade_lab":facade_lab,"facade_color":facade_color,"storefront_color":storefront_color,
  "awning_present":bool(awn_present),"awning_color":awn_color,"awning_color2":color2,"awning_striped":bool(striped),
  "awning_width":awn_width,"windows":windows,"doors":doors,"sign":sign_text,
  "visible_ratio":float(usable.sum()/max(1,visible.sum()))}

def combine(results,photos,facade):
 usable=[r for r in results if r]
 if not usable: return None
 labs=[r["facade_lab"] for r in usable if r["facade_lab"] is not None]
 facade_color=lab_to_hex(np.median(np.asarray(labs),axis=0)) if labs else None
 storefront=[list(bytes.fromhex(r["storefront_color"][1:])) for r in usable if r["storefront_color"]]
 storefront_color=median_hex(np.asarray(storefront,dtype=np.uint8)) if storefront else None
 awn_yes=sum(r["awning_present"] for r in usable)>len(usable)/2
 awnvals=[list(bytes.fromhex(r["awning_color"][1:])) for r in usable if r["awning_color"]]
 awn_color=median_hex(np.asarray(awnvals,dtype=np.uint8)) if awnvals else None
 striped=sum(r["awning_striped"] for r in usable)>len(usable)/2
 second=[list(bytes.fromhex(r["awning_color2"][1:])) for r in usable if r["awning_color2"]]
 color2=median_hex(np.asarray(second,dtype=np.uint8)) if second else None
 widths=[r["awning_width"] for r in usable if r["awning_width"] is not None]
 def merge(key):
  vals=sorted((x[0],x[1]) for r in usable for x in r[key]); merged=[]
  for lo,hi in vals:
   if merged and lo<=merged[-1][1]+.15: merged[-1][1]=max(merged[-1][1],hi)
   else: merged.append([lo,hi])
  return [[round(x,2),round(y,2)] for x,y in merged]
 signs=[r["sign"] for r in usable if r["sign"]]
 confidence=min(1.0,len(usable)/3.0)*statistics.mean(r["visible_ratio"] for r in usable)
 return {"couleur_facade":facade_color,
  "auvent":{"present":bool(awn_yes),"couleur":awn_color,"raye":bool(striped),"couleur2":color2,
            "largeur_m":round(statistics.median(widths),2) if widths else None},
  "devanture":{"couleur":storefront_color,"vitrines":merge("windows"),"portes":merge("doors")},
  "enseigne":max(signs,key=len) if signs else "","confiance":round(float(confidence),3),
  "photos":[str(p.get("id","")) for p in photos[:len(usable)]],"source":"Panoramax (CC BY-SA)"}

def main():
 if not REPORT_IN.exists(): raise FileNotFoundError(f"Rapport introuvable : {REPORT_IN}")
 report=json.loads(REPORT_IN.read_text(encoding="utf-8"))
 facades=load_facades(); report_ids={str(x.get("facade_id")) for x in report.get("facades",[])}
 facades={k:v for k,v in facades.items() if k in report_ids}
 print(f"{len(facades)} façades chargées.")
 photos=load_photos(report); selected=choose_photos(facades,photos)
 print(f"{len(photos)} photos ; {sum(bool(v) for v in selected.values())} façades avec candidate.")
 torch.set_num_threads(max(1,min(4,os.cpu_count() or 1)))
 processor=SegformerImageProcessor.from_pretrained(MODEL_NAME)
 model=SegformerForSemanticSegmentation.from_pretrained(MODEL_NAME); model.eval()
 groups,names=labels_to_groups(model)
 print("Classes :",{k:[names[i] for i in sorted(v)] for k,v in groups.items()})
 WARP_DIR.mkdir(parents=True,exist_ok=True); output={}
 for index,(fid,facade) in enumerate(facades.items(),1):
  chosen=selected.get(fid,[]); results=[]; used=[]
  for pi,photo in enumerate(chosen):
   try:
    result=analyze_one(model,processor,groups,facade,photo,fid,pi)
    if result: results.append(result); used.append(photo)
   except Exception as exc: print(f"Photo ignorée {fid}/{photo.get('id')}: {exc}",file=sys.stderr)
  combined=combine(results,used,facade)
  if combined: output[fid]=combined
  if index%20==0: print(f"Progression {index}/{len(facades)}")
 OUT_DIR.mkdir(parents=True,exist_ok=True)
 OUT_JSON.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 total=len(facades); color_n=sum(bool(x.get("couleur_facade")) for x in output.values())
 awn_n=sum(bool(x["auvent"]["present"]) for x in output.values()); sign_n=sum(bool(x.get("enseigne")) for x in output.values())
 conf=[x["confiance"] for x in output.values()]; avg=round(statistics.mean(conf),3) if conf else 0.0
 pct=lambda n:round(100*n/total,1) if total else 0.0
 lines=["# Analyse visuelle des façades — rue Cler","",f"Généré le {datetime.now(timezone.utc).isoformat()}.","",
  f"- Façades analysées : **{len(output)}/{total}**",
  f"- Avec couleur de façade : **{color_n}/{total} ({pct(color_n)} %)**",
  f"- Avec auvent détecté : **{awn_n}/{total} ({pct(awn_n)} %)**",
  f"- Avec enseigne lue : **{sign_n}/{total} ({pct(sign_n)} %)**",
  f"- Confiance moyenne : **{avg:.3f}**","","## 10 exemples",""]
 for fid,item in list(output.items())[:10]:
  lines.append(f"- \`{fid}\` — couleur {item.get('couleur_facade') or 'n/d'} ; auvent {'oui' if item['auvent']['present'] else 'non'} ; enseigne {item.get('enseigne') or 'non lue'} ; confiance {item['confiance']:.3f}")
 OUT_MD.write_text("\n".join(lines)+"\n",encoding="utf-8")
 print(f"Résultats : {OUT_JSON} ; {OUT_MD} ; artefacts : {WARP_DIR}")

if __name__=="__main__": main()
