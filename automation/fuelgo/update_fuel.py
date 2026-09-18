#!/usr/bin/env python3
from __future__ import annotations
import csv, io, json, math, re, sys, time, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[2]
DATA_DIR=ROOT/"fuelgo"/"data"
INDEX=DATA_DIR/"index.json"
ANAG="https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv"
PRICES="https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"
UA="Webinsolito-FuelGo/1.0 (+https://webinsolito.github.io/webinsolito/fuelgo/)"
FUEL_MAP={"benzina":"benzina","gasolio":"gasolio","gpl":"gpl","metano":"metano"}

def fetch(url):
    last=None
    for attempt in range(4):
        try:
            req=Request(url,headers={"User-Agent":UA,"Accept":"text/csv,*/*"})
            with urlopen(req,timeout=45) as r:
                return r.read()
        except Exception as e:
            last=e
            if attempt<3: time.sleep(2**attempt)
    raise last

def decode(raw):
    for enc in ("utf-8-sig","cp1252","latin-1"):
        try:return raw.decode(enc)
        except UnicodeDecodeError:pass
    return raw.decode("utf-8","replace")

def clean_key(s):
    return re.sub(r"[^a-z0-9]+","",unicodedata.normalize("NFKD",s or "").encode("ascii","ignore").decode().lower())

def extract_date(text):
    head="\n".join(text.splitlines()[:12])
    m=re.search(r"(20\d{2}-\d{2}-\d{2})",head)
    return m.group(1) if m else None

def rows(text):
    lines=text.splitlines()
    idx=None
    for i,line in enumerate(lines[:30]):
        if "idimpianto" in clean_key(line):
            idx=i;break
    if idx is None: raise ValueError("Header idimpianto non trovato")
    reader=csv.DictReader(io.StringIO("\n".join(lines[idx:])),delimiter="|")
    for raw in reader:
        yield {clean_key(k):(v or "").strip() for k,v in raw.items() if k}

def fnum(v):
    try:
        x=float(str(v).replace(",",".").strip())
        return x if math.isfinite(x) else None
    except:return None

def valid_coord(lat,lon):
    return lat is not None and lon is not None and -90<=lat<=90 and -180<=lon<=180 and not (abs(lat)<.01 and abs(lon)<.01)

def dt_key(v):
    for fmt in ("%d/%m/%Y %H:%M:%S","%d/%m/%Y %H:%M","%Y-%m-%d %H:%M:%S"):
        try:return datetime.strptime(v,fmt)
        except:pass
    return datetime.min

def main():
    a_text=decode(fetch(ANAG));p_text=decode(fetch(PRICES))
    a_date=extract_date(a_text);p_date=extract_date(p_text)
    stations={}
    for r in rows(a_text):
        sid=r.get("idimpianto")
        if not sid:continue
        lat=fnum(r.get("latitudine"));lon=fnum(r.get("longitudine"))
        if not valid_coord(lat,lon):lat=lon=None
        stations[sid]={
            "id":int(sid) if sid.isdigit() else sid,
            "b":r.get("bandiera") or r.get("gestore") or "",
            "n":r.get("nomeimpianto") or "",
            "a":r.get("indirizzo") or "",
            "c":r.get("comune") or "",
            "p":r.get("provincia") or "",
            "lat":round(lat,6) if lat is not None else None,
            "lon":round(lon,6) if lon is not None else None,
            "f":{}
        }
    best={}
    for r in rows(p_text):
        sid=r.get("idimpianto");desc=(r.get("desccarburante") or "").strip().lower()
        if sid not in stations or desc not in FUEL_MAP:continue
        price=fnum(r.get("prezzo"))
        if price is None or price<=0 or price>10:continue
        mode="self" if r.get("isself")=="1" else "served"
        dt=r.get("dtcomu") or ""
        key=(sid,FUEL_MAP[desc],mode)
        old=best.get(key)
        if old is None or dt_key(dt)>dt_key(old[1]):best[key]=(round(price,3),dt)
    for (sid,fuel,mode),(price,dt) in best.items():
        s=stations[sid]
        s["f"].setdefault(fuel,{})[mode]=[price,dt]
    compact=[s for s in stations.values() if s["f"]]
    compact.sort(key=lambda s:(s["p"],s["c"],s["b"],str(s["id"])))
    if len(compact)<1000:
        raise SystemExit(f"Solo {len(compact)} impianti validi: rifiuto sovrascrittura")
    def slug(s):
        x=unicodedata.normalize("NFKD",s or "").encode("ascii","ignore").decode().lower()
        x=re.sub(r"[^a-z0-9]+","-",x).strip("-")
        return x or "senza-provincia"
    groups={}
    for s in compact: groups.setdefault(s["p"] or "Senza provincia",[]).append(s)
    DATA_DIR.mkdir(parents=True,exist_ok=True)
    prov_dir=DATA_DIR/"provinces";prov_dir.mkdir(parents=True,exist_ok=True)
    keep=set();index_prov=[]
    for pname,items in sorted(groups.items()):
        fname=slug(pname)+".json";keep.add(fname)
        coords=[(s["lat"],s["lon"]) for s in items if s["lat"] is not None and s["lon"] is not None]
        cities=sorted({s["c"] for s in items if s["c"]})
        entry={"name":pname,"file":fname,"cities":cities,"count":len(items),"minLat":None,"maxLat":None,"minLon":None,"maxLon":None}
        if coords:
            entry.update({"minLat":min(x[0] for x in coords),"maxLat":max(x[0] for x in coords),"minLon":min(x[1] for x in coords),"maxLon":max(x[1] for x in coords)})
        (prov_dir/fname).write_text(json.dumps({"province":pname,"stations":items},ensure_ascii=False,separators=(",",":"))+"\n","utf-8")
        index_prov.append(entry)
    for old in prov_dir.glob("*.json"):
        if old.name not in keep: old.unlink()
    legacy=DATA_DIR/"stations.json"
    if legacy.exists(): legacy.unlink()
    payload={"schema":2,"generated_at":datetime.now(timezone.utc).isoformat(),"source":"Ministero delle Imprese e del Made in Italy","license":"IODL 2.0","source_date_anagrafica":a_date,"source_date_prices":p_date,"count":len(compact),"provinces":index_prov}
    INDEX.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n","utf-8")
    print(json.dumps({"stations":len(compact),"provinces":len(index_prov),"anagrafica":a_date,"prices":p_date},ensure_ascii=False))

if __name__=="__main__":
    main()
