import json
import re
from datetime import datetime, timezone
import requests

URL = "https://www.superenalotto.it/archivio-estrazioni/statistiche"
HEADERS = {"User-Agent": "Mozilla/5.0 SuperEnalotto-LAB-6/2.0", "Accept": "text/html"}

def fetch():
    r = requests.get(URL, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.text

def parse_stats(html):
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\\s+", " ", text)
    rows = []
    # The official statistics table lists: number, frequency, current delay, max delay.
    pattern = re.compile(r"(?<!\\d)([1-9]|[1-8]\\d|90)\\s+(\\d{2,3})\\s+(\\d{1,3})\\s+(\\d{1,3})(?!\\d)")
    seen = set()
    for m in pattern.finditer(text):
        n, freq, delay, max_delay = map(int, m.groups())
        if n not in seen and 200 <= freq <= 400 and 0 <= delay <= 500 and 0 <= max_delay <= 500:
            seen.add(n)
            rows.append({"numero": n, "frequenza": freq, "ritardo": delay, "ritardo_massimo": max_delay})
    if len(rows) != 90:
        raise RuntimeError(f"Statistiche ufficiali incomplete: trovati {len(rows)} numeri")
    rows.sort(key=lambda x: x["numero"])
    return rows

def main():
    stats_html = fetch()
    stats = parse_stats(stats_html)
    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://www.superenalotto.it/archivio-estrazioni/statistiche",
        "stats": stats
    }
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK: aggiornate statistiche per {len(stats)} numeri")

if __name__ == "__main__":
    main()
