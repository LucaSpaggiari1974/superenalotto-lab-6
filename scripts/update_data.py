import json
from datetime import datetime, timezone
from io import StringIO

import pandas as pd
import requests

STATS_URL = "https://www.superenalotto.it/archivio-estrazioni/statistiche"
ARCHIVE_URL = "https://www.superenalotto.it/archivio-estrazioni"

HEADERS = {"User-Agent": "SuperEnalotto-LAB-6 data updater"}

def get_html(url):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text

def clean(v):
    if pd.isna(v):
        return None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v

def find_stats_table(html):
    tables = pd.read_html(StringIO(html))
    for df in tables:
        cols = [str(c).strip().upper() for c in df.columns]
        if "FREQ." in cols and "ATTUALE" in cols and "MAX" in cols:
            return df
    raise RuntimeError("Tabella statistiche non trovata")

def find_archive_table(html):
    tables = pd.read_html(StringIO(html))
    for df in tables:
        text = " ".join(str(c).lower() for c in df.columns)
        if "combinazione vincente" in text:
            return df
    raise RuntimeError("Tabella archivio estrazioni non trovata")

def parse_stats(html):
    df = find_stats_table(html)
    df.columns = [str(c).strip().upper() for c in df.columns]
    out = []
    for _, row in df.iterrows():
        n = clean(row.get("N."))
        if n is None:
            continue
        try:
            n = int(n)
        except Exception:
            continue
        out.append({
            "numero": n,
            "frequenza": clean(row.get("FREQ.")),
            "ritardo": clean(row.get("ATTUALE")),
            "ritardo_massimo": clean(row.get("MAX"))
        })
    out = [x for x in out if 1 <= x["numero"] <= 90]
    if len(out) < 90:
        raise RuntimeError(f"Statistiche incomplete: {len(out)} numeri")
    return sorted(out, key=lambda x: x["numero"])

def parse_archive(html):
    df = find_archive_table(html)
    df.columns = [str(c).strip() for c in df.columns]
    draws = []
    for _, row in df.iterrows():
        values = [str(v).strip() for v in row.tolist()]
        if not values:
            continue
        first = values[0]
        if "Concorso" not in first and "Nº" not in first and "N." not in first:
            continue
        nums = []
        for v in values:
            if v.isdigit() and 1 <= int(v) <= 90:
                nums.append(int(v))
        if len(nums) >= 6:
            draws.append({
                "descrizione": first,
                "numeri": sorted(nums[:6])
            })
    return draws[:30]

def main():
    stats_html = get_html(STATS_URL)
    archive_html = get_html(ARCHIVE_URL)

    stats = parse_stats(stats_html)
    draws = parse_archive(archive_html)

    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SuperEnalotto.it",
        "stats": stats,
        "ultime_estrazioni": draws
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

if __name__ == "__main__":
    main()
