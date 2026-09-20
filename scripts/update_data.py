import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests

BASE = "https://www.superenalotto.it/archivio-estrazioni"
HEADERS = {"User-Agent": "Mozilla/5.0 SuperEnalotto-LAB-6 data updater", "Accept": "text/html,application/xhtml+xml"}
MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"]
ROW_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.I | re.S)
CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")

def clean_html(value):
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.I)
    value = TAG_RE.sub(" ", value)
    return re.sub(r"\s+", " ", value).strip()

def parse_draws(html):
    draws = []
    for row_html in ROW_RE.findall(html):
        cells = [clean_html(x) for x in CELL_RE.findall(row_html)]
        if len(cells) < 2:
            continue
        m = re.search(r"Concorso\s*(?:Nº|N°|N\.)?\s*(\d+)\s+del\s+(.+)", cells[0], re.I)
        if not m:
            continue
        nums = [int(x) for x in re.findall(r"(?<!\d)(?:[1-9]|[1-8]\d|90)(?!\d)", cells[1])]
        if len(nums) != 6 or len(set(nums)) != 6:
            continue
        draws.append({"concorso": int(m.group(1)), "data": m.group(2).strip(), "numeri": sorted(nums)})
    return draws

def fetch_month(year, month, attempts=4):
    url = f"{BASE}/{year}/{month}"
    for attempt in range(1, attempts + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=(10, 75))
            if r.status_code == 404:
                return []
            r.raise_for_status()
            draws = parse_draws(r.text)
            if draws:
                return draws
            raise RuntimeError("nessuna estrazione riconosciuta")
        except Exception as e:
            if attempt == attempts:
                print(f"WARNING {year}/{month}: {e}")
                return []
            time.sleep(2 * attempt)
    return []

def get_all_draws():
    now = datetime.now()
    tasks = []
    for year in range(1997, now.year + 1):
        first_month = 12 if year == 1997 else 1
        last_month = now.month if year == now.year else 12
        for month_num in range(first_month, last_month + 1):
            tasks.append((year, MONTHS[month_num - 1]))
    draws = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_month, y, m) for y, m in tasks]
        for future in as_completed(futures):
            draws.extend(future.result())
    unique = {d["concorso"]: d for d in draws}
    result = [unique[k] for k in sorted(unique)]
    if len(result) < 1000:
        raise RuntimeError(f"Archivio insufficiente: solo {len(result)} concorsi recuperati")
    return result

def build_stats(draws):
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
    return [{"numero": n, "frequenza": freq[n], "ritardo": current_gap[n], "ritardo_massimo": max_gap[n]} for n in range(1, 91)]

def main():
    draws = get_all_draws()
    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SuperEnalotto.it",
        "concorsi_totali": len(draws),
        "stats": build_stats(draws),
        "ultime_estrazioni": list(reversed(draws[-30:])),
    }
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(draws)} concorsi, data.json aggiornato")

if __name__ == "__main__":
    main()
