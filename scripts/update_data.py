import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import pandas as pd
import requests
from io import StringIO

BASE = "https://www.superenalotto.it/archivio-estrazioni"
HEADERS = {"User-Agent": "SuperEnalotto-LAB-6 data updater"}

MONTHS = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
]

def fetch_month(year, month):
    url = f"{BASE}/{year}/{month}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        tables = pd.read_html(StringIO(r.text), flavor="lxml")
        for df in tables:
            if len(df.columns) < 2:
                continue
            cols = [str(c).strip().lower() for c in df.columns]
            if "combinazione vincente" not in " ".join(cols):
                continue
            out = []
            for _, row in df.iterrows():
                values = [str(v).strip() for v in row.tolist()]
                if not values or "Concorso" not in values[0]:
                    continue
                m = re.search(r"Concorso\s*(?:Nº|N°|N\.)?\s*(\d+)\s+del\s+(.+)", values[0], re.I)
                if not m:
                    continue
                nums = [int(x) for x in re.findall(r"\b(?:[1-9]|[1-8]\d|90)\b", values[1])]
                if len(nums) != 6:
                    continue
                out.append({
                    "concorso": int(m.group(1)),
                    "data": m.group(2),
                    "numeri": sorted(nums),
                })
            if out:
                return out
        return []
    except Exception as e:
        print(f"WARNING {year}/{month}: {e}")
        return []

def get_all_draws():
    tasks = []
    start_year = 1997
    now = datetime.now()
    for year in range(start_year, now.year + 1):
        first_month = 12 if year == 1997 else 1
        last_month = now.month if year == now.year else 12
        for month_num in range(first_month, last_month + 1):
            tasks.append((year, MONTHS[month_num - 1]))

    draws = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fetch_month, y, m) for y, m in tasks]
        for future in as_completed(futures):
            draws.extend(future.result())

    unique = {}
    for d in draws:
        unique[d["concorso"]] = d
    return [unique[k] for k in sorted(unique)]

def build_stats(draws):
    if len(draws) < 1000:
        raise RuntimeError(f"Archivio insufficiente: solo {len(draws)} concorsi recuperati")

    freq = {n: 0 for n in range(1, 91)}
    current_gap = {n: 0 for n in range(1, 91)}
    max_gap = {n: 0 for n in range(1, 91)}

    for draw in draws:
        nums = set(draw["numeri"])
        for n in range(1, 91):
            if n in nums:
                freq[n] += 1
                max_gap[n] = max(max_gap[n], current_gap[n])
                current_gap[n] = 0
            else:
                current_gap[n] += 1

    for n in range(1, 91):
        max_gap[n] = max(max_gap[n], current_gap[n])

    return [
        {
            "numero": n,
            "frequenza": freq[n],
            "ritardo": current_gap[n],
            "ritardo_massimo": max_gap[n],
        }
        for n in range(1, 91)
    ]

def main():
    draws = get_all_draws()
    stats = build_stats(draws)

    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SuperEnalotto.it",
        "concorsi_totali": len(draws),
        "stats": stats,
        "ultime_estrazioni": list(reversed(draws[-30:])),
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"OK: {len(draws)} concorsi, data.json aggiornato")

if __name__ == "__main__":
    main()
