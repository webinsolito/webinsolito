#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, re, sys, time, unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"bresciago"/"data"/"events.json"
HEADERS={"User-Agent":"Webinsolito-BresciaGo/1.0 (+https://webinsolito.github.io/webinsolito/bresciago/)"}
TIMEOUT=20
MONTHS={"gennaio":1,"febbraio":2,"marzo":3,"aprile":4,"maggio":5,"giugno":6,"luglio":7,"agosto":8,"settembre":9,"ottobre":10,"novembre":11,"dicembre":12}
SOURCES=[
 {"name":"Comune di Brescia","listing":"https://comune.brescia.it/it/eventi","host":"comune.brescia.it","contains":"/it/events/","pages":1,"area":"Brescia","delay":1.0},
 {"name":"Visit Brescia","listing":"https://www.visitbrescia.it/eventi/","host":"www.visitbrescia.it","contains":"/eventi/","pages":1,"area":"Brescia e provincia","delay":0.08},
]
session=requests.Session();session.headers.update(HEADERS)
retry=Retry(total=2,connect=2,read=2,status=1,backoff_factor=0.8,status_forcelist=[429,500,502,503,504],allowed_methods=frozenset(["GET"]),respect_retry_after_header=False)
session.mount("https://",HTTPAdapter(max_retries=retry))

def get(url):
    r=session.get(url,timeout=TIMEOUT);r.raise_for_status();return r.text

def norm(s):
    s=unicodedata.normalize("NFKD",s or "").encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+"," ",s).strip()

def iso_date(v):
    if not v:return None
    v=str(v).strip()
    try:return datetime.fromisoformat(v.replace("Z","+00:00")).date().isoformat()
    except Exception:pass
    m=re.search(r"(\d{2})/(\d{2})/(\d{4})",v)
    if m:return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m=re.search(r"(\d{1,2})\s+("+"|".join(MONTHS)+r")\s+(\d{4})",v,re.I)
    if m:return date(int(m.group(3)),MONTHS[m.group(2).lower()],int(m.group(1))).isoformat()
    return None

def flatten_jsonld(obj):
    if isinstance(obj,list):
        for x in obj: yield from flatten_jsonld(x)
    elif isinstance(obj,dict):
        if "@graph" in obj: yield from flatten_jsonld(obj["@graph"])
        yield obj

def jsonld_events(soup):
    out=[]
    for tag in soup.find_all("script",attrs={"type":"application/ld+json"}):
        try:data=json.loads(tag.string or tag.get_text() or "{}")
        except Exception:continue
        for obj in flatten_jsonld(data):
            typ=obj.get("@type")
            types=typ if isinstance(typ,list) else [typ]
            if any(str(x).lower()=="event" for x in types):out.append(obj)
    return out

def collect_links(src):
    urls=set()
    for page in range(src["pages"]):
        u=src["listing"] if page==0 else src["listing"]+("?page="+str(page) if "?" not in src["listing"] else "&page="+str(page))
        try:soup=BeautifulSoup(get(u),"html.parser")
        except Exception as e:
            print(f"WARN listing {src['name']} {u}: {e}",file=sys.stderr);continue
        for a in soup.find_all("a",href=True):
            full=urljoin(u,a["href"]).split("#")[0]
            p=urlparse(full)
            if p.netloc!=src["host"]:continue
            if src["contains"] not in p.path:continue
            if full.rstrip("/")==src["listing"].rstrip("/"):continue
            if src["name"]=="Visit Brescia" and p.path.rstrip("/")=="/eventi":continue
            urls.add(full)
    return sorted(urls)[:90]

def category(text):
    t=norm(text)
    rules=[
      ("Famiglia",r"\bbimb|bambin|family|famigl|laborator"),
      ("Sport",r"sport|trail|corsa|\brun\b|bike|gara|podistic|running|mtb|ciclist"),
      ("Cibo",r"enogastr|\bcibo\b|sapori|\bvino\b|\bwine\b|ristor|mercato della terra|franciacorta in cantina|degust|formagg"),
      ("Mercatini",r"mercat|antiquar|\bfiera\b"),
      ("Musica",r"\bmusica|concert|\bjazz\b|\bopera\b|pianist|festival le ?x ?giornate"),
      ("Cultura",r"cultur|muse|mostra|\barte\b|teatro|cinema|visita guidata|bibliotec|castello|storia|patrimonio"),
    ]
    for c,rx in rules:
        if re.search(rx,t):return c
    return "Altro"

def clean_description(s):
    if not s:return ""
    s=BeautifulSoup(str(s),"html.parser").get_text(" ",strip=True)
    return re.sub(r"\s+"," ",s)[:220]

def place_from_location(loc):
    if isinstance(loc,list):loc=loc[0] if loc else {}
    if isinstance(loc,str):return loc
    if not isinstance(loc,dict):return ""
    name=loc.get("name") or ""
    addr=loc.get("address")
    if isinstance(addr,str):address=addr
    elif isinstance(addr,dict):
        address=", ".join(str(addr.get(k) or "") for k in ("streetAddress","addressLocality") if addr.get(k))
    else:address=""
    return ", ".join(x for x in (name,address) if x)[:180]

def image_from_obj(obj,soup):
    im=obj.get("image") if obj else None
    if isinstance(im,list):im=im[0] if im else None
    if isinstance(im,dict):im=im.get("url")
    if isinstance(im,str):return im
    tag=soup.find("meta",attrs={"property":"og:image"})
    return tag.get("content","") if tag else ""

def fallback_dates(text):
    m=re.search(r"Quando\s+(\d{2}/\d{2}/\d{4})\s*[-–]\s*(\d{2}/\d{2}/\d{4})",text,re.I)
    if m:return iso_date(m.group(1)),iso_date(m.group(2))
    m=re.search(r"Da\s+(\d{1,2}\s+(?:"+"|".join(MONTHS)+r")\s+\d{4})\s+a\s+(\d{1,2}\s+(?:"+"|".join(MONTHS)+r")\s+\d{4})",text,re.I)
    if m:return iso_date(m.group(1)),iso_date(m.group(2))
    m=re.search(r"\b(\d{1,2}\s+(?:"+"|".join(MONTHS)+r")\s+\d{4})\b",text,re.I)
    if m:
        d=iso_date(m.group(1));return d,d
    m=re.search(r"\b(\d{2}/\d{2}/\d{4})\b",text)
    if m:
        d=iso_date(m.group(1));return d,d
    return None,None

def fallback_place(text,src):
    m=re.search(r"Luogo\s+(.{3,140}?)\s+Quando",text,re.I)
    if m:return re.sub(r"\s+"," ",m.group(1)).strip(" -•,")[:180]
    return src["area"]

def price_guess(text):
    t=norm(text)
    if re.search(r"\bingresso libero\b|\bgratuit[oaie]\b|\bfree\b",t):return 0
    return None

def time_guess(text):
    m=re.search(r"(?:ore|dalle ore|alle ore)\s*(\d{1,2})[.:](\d{2})",text,re.I)
    if not m:return ""
    return f"{int(m.group(1)):02d}:{m.group(2)}"

def parse_detail(url,src):
    soup=BeautifulSoup(get(url),"html.parser")
    text=re.sub(r"\s+"," ",soup.get_text(" ",strip=True))
    objs=jsonld_events(soup)
    obj=objs[0] if objs else {}
    h1=soup.find("h1")
    ogt=soup.find("meta",attrs={"property":"og:title"})
    title=(obj.get("name") if isinstance(obj,dict) else None) or (ogt.get("content","").strip() if ogt else "") or (h1.get_text(" ",strip=True) if h1 else "")
    title=re.sub(r"\s+"," ",title).strip()
    title=re.sub(r"\s*[|\-–]\s*Visit Brescia\s*$","",title,flags=re.I).strip()
    start=iso_date(obj.get("startDate")) if isinstance(obj,dict) else None
    end=iso_date(obj.get("endDate")) if isinstance(obj,dict) else None
    if not start:
        start,end2=fallback_dates(text);end=end or end2
    if not start or not title:return None
    end=end or start
    desc=clean_description(obj.get("description") if isinstance(obj,dict) else "")
    if not desc:
        md=soup.find("meta",attrs={"name":"description"}) or soup.find("meta",attrs={"property":"og:description"})
        desc=clean_description(md.get("content","") if md else "")
    place=place_from_location(obj.get("location")) if isinstance(obj,dict) else ""
    if not place:place=fallback_place(text,src)
    image=image_from_obj(obj,soup)
    cat=category(" ".join([title,desc]))
    price=price_guess(" ".join([title,desc]))
    t=time_guess(text)
    key=hashlib.sha1((norm(title)+"|"+start).encode()).hexdigest()[:14]
    return{
      "id":"auto-"+key,"title":title,"date":start,"end_date":end,"time":t,
      "place":place,"area":src["area"],"cat":cat,"price":price,"url":url,
      "note":desc,"source":src["name"],"image":image
    }

def load_existing():
    try:return json.loads(OUT.read_text("utf-8"))
    except Exception:return {"events":[]}

def main():
    today=date.today();max_date=today+timedelta(days=240)
    events=[];statuses=[]
    for src in SOURCES:
        links=collect_links(src);parsed=0;errors=0
        for url in links:
            try:
                time.sleep(src.get("delay",0))
                e=parse_detail(url,src)
                if not e:continue
                ed=date.fromisoformat(e["end_date"] or e["date"]);sd=date.fromisoformat(e["date"])
                if ed<today-timedelta(days=1) or sd>max_date:continue
                events.append(e);parsed+=1
            except Exception as ex:
                errors+=1;print(f"WARN detail {url}: {ex}",file=sys.stderr)
        statuses.append({"name":src["name"],"ok":parsed>0,"links":len(links),"events":parsed,"errors":errors})
    dedup={}
    for e in events:
        title_key=re.sub(r"\b20\d{2}\b","",norm(e["title"])).replace(" ","")
        k=(title_key,e["date"])
        old=dedup.get(k)
        if not old or (len(e.get("note") or "")+len(e.get("place") or ""))>(len(old.get("note") or "")+len(old.get("place") or "")):
            dedup[k]=e
        elif old and e["source"] not in old["source"]:
            old["source"]=old["source"]+" + "+e["source"]
    events=sorted(dedup.values(),key=lambda e:(e["date"],e.get("time") or "",e["title"].lower()))
    if len(events)<3:
        previous=load_existing().get("events",[])
        previous=[e for e in previous if e.get("end_date",e.get("date",""))>=today.isoformat()]
        if len(previous)>len(events):
            print(f"WARN only {len(events)} fresh events; preserving {len(previous)} previous future events",file=sys.stderr)
            events=previous
    if len(events)<1:
        raise SystemExit("No valid events collected; refusing to overwrite feed")
    payload={
      "schema":1,
      "generated_at":datetime.now(timezone.utc).isoformat(),
      "count":len(events),
      "sources":statuses,
      "events":events
    }
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n","utf-8")
    print(json.dumps({"events":len(events),"sources":statuses},ensure_ascii=False))

if __name__=="__main__":main()
