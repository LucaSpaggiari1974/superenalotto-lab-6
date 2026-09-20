import json
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

BASE = "https://www.superenalotto.it/archivio-estrazioni"
MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"]
HEADERS = {"User-Agent":"Mozilla/5.0 SuperEnalotto-LAB-6/1.0","Accept":"text/html"}

def fetch(url):
    r=requests.get(url,headers=HEADERS,timeout=(10,60))
    r.raise_for_status()
    return r.text

def clean(s):
    s=re.sub(r"<[^>]+>"," ",s)
    return re.sub(r"\s+"," ",s).strip()

def parse(html):
    out=[]
    for m in re.finditer(r"Concorso\s*(?:Nº|N°|N\.)?\s*(\d+)\s+del\s+([^<|]+).*?([0-9]{1,2}\s+[0-9]{1,2}\s+[0-9]{1,2}\s+[0-9]{1,2}\s+[0-9]{1,2}\s+[0-9]{1,2})",html,re.I|re.S):
        nums=[int(x) for x in re.findall(r"(?<!\d)(?:[1-9]|[1-8]\d|90)(?!\d)",m.group(3))]
        if len(nums)==6 and len(set(nums))==6:
            out.append({"concorso":int(m.group(1)),"data":clean(m.group(2)),"numeri":sorted(nums)})
    return out

def month(y,mo):
    try: return parse(fetch(f"{BASE}/{y}/{mo}"))
    except Exception as e:
        print(f"WARNING {y}/{mo}: {e}")
        return []

def main():
    now=datetime.now()
    tasks=[(y,MONTHS[m-1]) for y in range(1997,now.year+1) for m in range(12 if y==1997 else 1,(now.month if y==now.year else 12)+1)]
    draws=[]
    with ThreadPoolExecutor(max_workers=4) as p:
        for f in as_completed([p.submit(month,y,m) for y,m in tasks]): draws.extend(f.result())
    unique={d["concorso"]:d for d in draws}
    draws=[unique[k] for k in sorted(unique)]
    if len(draws)<1000: raise RuntimeError(f"Archivio insufficiente: {len(draws)} concorsi")
    freq={n:0 for n in range(1,91)}; gap={n:0 for n in range(1,91)}; mx={n:0 for n in range(1,91)}
    for d in draws:
        s=set(d["numeri"])
        for n in range(1,91):
            if n in s: freq[n]+=1; mx[n]=max(mx[n],gap[n]); gap[n]=0
            else: gap[n]+=1
    for n in range(1,91): mx[n]=max(mx[n],gap[n])
    data={"updated_at":datetime.now(timezone.utc).isoformat(),"source":"SuperEnalotto.it","concorsi_totali":len(draws),"stats":[{"numero":n,"frequenza":freq[n],"ritardo":gap[n],"ritardo_massimo":mx[n]} for n in range(1,91)],"ultime_estrazioni":list(reversed(draws[-30:]))}
    with open("data.json","w",encoding="utf-8") as f: json.dump(data,f,ensure_ascii=False,separators=(",",":"))
    print(f"OK {len(draws)}")

if __name__=="__main__": main()
