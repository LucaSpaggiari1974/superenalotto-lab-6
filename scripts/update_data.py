import json
import re
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

STATS_URL = "https://www.superenalotto.it/archivio-estrazioni/statistiche"
ARCHIVE_URL = "https://www.superenalotto.it/archivio-estrazioni"
MONTHS = [
    "gennaio","febbraio","marzo","aprile","maggio","giugno",
    "luglio","agosto","settembre","ottobre","novembre","dicembre"
]
HISTORY_TARGET = 180

def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()

def numbers_from(text):
    return [int(x) for x in re.findall(r"(?<!\d)(?:[1-9]|[1-8]\d|90)(?!\d)", text)]

def open_page(page, url, wait_ms=3500):
    page.goto(url, wait_until="commit", timeout=30000)
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30000)
    except PlaywrightTimeoutError:
        pass
    page.wait_for_timeout(wait_ms)

def scrape_stats(page):
    open_page(page, STATS_URL, wait_ms=5000)
    rows = []
    for row in page.locator("table tr").all():
        cells = [clean(x) for x in row.locator("th,td").all_inner_texts()]
        if len(cells) < 4:
            continue
        m = re.fullmatch(r"(\d{1,2})", cells[0])
        if not m:
            continue
        n = int(m.group(1))
        if not 1 <= n <= 90:
            continue
        nums = []
        for cell in cells[1:]:
            mm = re.fullmatch(r"(\d{1,3})", cell)
            if mm:
                nums.append(int(mm.group(1)))
        if len(nums) >= 3 and 200 <= nums[0] <= 400 and nums[1] <= 500 and nums[2] <= 500:
            rows.append({"numero": n, "frequenza": nums[0], "ritardo": nums[1], "ritardo_massimo": nums[2]})
    unique = {r["numero"]: r for r in rows}
    if len(unique) != 90:
        raise RuntimeError(f"Statistiche ufficiali incomplete: trovati {len(unique)} numeri")
    return [unique[n] for n in range(1, 91)]

def parse_draw_rows(page):
    draws = []
    for row in page.locator("table tr").all():
        cells = [clean(x) for x in row.locator("th,td").all_inner_texts()]
        if len(cells) < 2:
            continue
        m = re.search(r"Concorso\s*[Nnº°]*\s*(\d+)\s+del\s+(.+?\d{4})$", cells[0])
        if not m:
            continue
        nums = numbers_from(cells[1])
        if len(nums) != 6 or len(set(nums)) != 6:
            continue
        draws.append({
            "numero_concorso": int(m.group(1)),
            "descrizione": cells[0],
            "numeri": sorted(nums),
        })
    return draws

def scrape_draws(page):
    # L'archivio ufficiale permette di espandere progressivamente lo storico
    # con il controllo "Mostra gli altri 15 concorsi". Usiamo solo la fonte
    # ufficiale e deduplichiamo per numero di concorso.
    all_draws = {}
    open_page(page, ARCHIVE_URL, wait_ms=3500)

    for _ in range(12):
        for d in parse_draw_rows(page):
            all_draws[d["numero_concorso"]] = d
        if len(all_draws) >= HISTORY_TARGET:
            break
        try:
            buttons = page.get_by_text(re.compile(r"Mostra gli altri 15 concorsi", re.I))
            if buttons.count() == 0:
                break
            button = buttons.last
            if not button.is_visible():
                break
            button.click(timeout=5000)
            page.wait_for_timeout(900)
        except Exception as exc:
            print(f"Avviso: impossibile espandere lo storico: {exc}")
            break

    if len(all_draws) < HISTORY_TARGET:
        raise RuntimeError(f"Storico ufficiale insufficiente: trovati {len(all_draws)} concorsi, richiesti almeno {HISTORY_TARGET}")

    return sorted(all_draws.values(), key=lambda d: d["numero_concorso"], reverse=True)[:HISTORY_TARGET]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1440, "height": 1200},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
            locale="it-IT",
        )
        try:
            stats = scrape_stats(page)
            draws = scrape_draws(page)
        finally:
            browser.close()

    data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": STATS_URL,
        "source_archivio": ARCHIVE_URL,
        "storico_concorsi": len(draws),
        "stats": stats,
        "ultime_estrazioni": [
            {"descrizione": d["descrizione"], "numeri": d["numeri"]}
            for d in draws
        ],
    }
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK: {len(stats)} statistiche e {len(draws)} estrazioni aggiornate")

if __name__ == "__main__":
    main()
