"""
Cardiff student house scraper — 3 to 8 bedroom houses for the next academic year.

Sources: Cardiff Student Letting (CSL), UniHomes, Housr, CPS Homes.
Writes listings.json (read by index.html) and cardiff_student_houses.csv.

    pip install -r requirements.txt
    python scraper.py
"""

import csv
import html
import json
import math
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).parent
OUT_JSON = HERE / "listings.json"
OUT_CSV = HERE / "cardiff_student_houses.csv"

BEDROOMS = range(3, 9)  # 3–8 bed
YEAR_START = date(2027, 6, 1)  # listings available before this aren't for 2027/28
UNI = (51.488357, -3.177434)  # Cardiff University Students' Union, Park Place
DELAY = 0.4  # seconds between requests, to stay polite

session = requests.Session()
session.headers["User-Agent"] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)


def get(url, **params):
    time.sleep(DELAY)
    r = session.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.text


# ---------------------------------------------------------------- helpers

def walk_minutes(lat, lng):
    """Straight-line distance to the SU, x1.3 for real streets, at 80 m/min."""
    if lat is None or lng is None:
        return None
    dlat = math.radians(lat - UNI[0])
    dlng = math.radians(lng - UNI[1])
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(UNI[0])) * math.cos(math.radians(lat)) * math.sin(dlng / 2) ** 2
    metres = 6371000 * 2 * math.asin(math.sqrt(a))
    if metres > 15000:  # placeholder coords some listings ship with (UK centroid, 90,90)
        return None
    return max(1, round(metres * 1.3 / 80))


def pppw_from_pcm(pcm, beds):
    return round(pcm * 12 / 52 / beds, 2) if pcm and beds else 0


def parse_date(text):
    """'01/07/2027', '2027-07-01', or 'Available from 3rd July 2027' -> date."""
    if not text:
        return None
    text = str(text).strip()
    for fmt, src in (("%d/%m/%Y", text[:10]), ("%Y-%m-%d", text[:10])):
        try:
            return datetime.strptime(src, fmt).date()
        except ValueError:
            pass
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", text)
    if m:
        try:
            return datetime.strptime(" ".join(m.groups()), "%d %b %Y").date()
        except ValueError:
            pass
    return None


def listing(*, id, source, title, address, bedrooms, bathrooms, price_pppw, price_pcm,
            bills, available, url, image, lat, lng, area="", notes=""):
    return {
        "id": id, "source": source, "title": title, "address": address, "area": area,
        "bedrooms": bedrooms, "bathrooms": bathrooms or None,
        "price_pppw": price_pppw or 0, "price_total_month": round(price_pcm) if price_pcm else None,
        "bills_included": bool(bills),
        "available": available.isoformat() if available else None,
        "url": url, "image_url": image or None,
        "lat": lat, "lng": lng, "walk_minutes": walk_minutes(lat, lng),
        "notes": notes,
    }


# ---------------------------------------------------------------- sources

def scrape_csl():
    base = "https://www.cardiffstudentletting.com"
    out = []
    for beds in BEDROOMS:
        soup = BeautifulSoup(get(f"{base}/listings", **{"tenants[]": beds, "list_number": 201, "offset": 0}), "html.parser")
        for card in soup.select(".info-section"):
            link = card.select_one('h3 a[href*="/properties/"]')
            if not link:
                continue
            url = link["href"]
            price = card.select_one(".real-estate-item-price")
            pcm = float(re.sub(r"[^\d.]", "", price.get_text().split("Monthly")[0]) or 0) if price else 0
            baths = card.select_one('img[src*="bath"] + div')
            avail = re.search(r"Available From:\s*([\d/]+)", card.get_text())
            img = card.select_one(".real-estate-item-image img")

            try:
                detail = get(url)  # coordinates and bills live on the detail page
            except requests.RequestException as e:  # one broken page shouldn't drop the whole agency
                print(f"  skipped details for {url}: {e}", file=sys.stderr)
                detail = ""
            coords = re.search(r"L\.marker\(\[([-\d.]+),\s*([-\d.]+)\],\s*\{icon:\s*resIcon", detail)
            lat, lng = (float(coords[1]), float(coords[2])) if coords else (None, None)

            lines = [s.strip() for s in link.get_text("\n").splitlines() if s.strip()]  # street, area, city, postcode
            address = ", ".join(lines)
            out.append(listing(
                id="csl_" + url.rstrip("/").rsplit("/", 1)[-1], source="Cardiff Student Letting",
                title=f"{beds} bed house, {lines[0]}", address=address,
                area=lines[1] if len(lines) > 2 else "", bedrooms=beds,
                bathrooms=int(baths.get_text(strip=True)) if baths and baths.get_text(strip=True).isdigit() else None,
                price_pppw=pppw_from_pcm(pcm, beds), price_pcm=pcm,
                bills="Bills Included" in detail, available=parse_date(avail[1] if avail else None),
                url=url, image=img["src"] if img else None, lat=lat, lng=lng,
                notes="Students' Union agency. No agency fees.",
            ))
    return out


def unihomes_page(h):
    m = re.search(r":initial-properties=\"JSON\.parse\('(.*?)'\)\"", h, re.S)
    if not m:
        return [], 0
    raw = html.unescape(m[1]).replace("\\'", "'")
    props = json.loads(json.loads('"' + raw.replace('"', '\\"') + '"'))
    total = re.search(r':initial-property-count="(\d+)"', h)
    return props, int(total[1]) if total else 0


def scrape_unihomes():
    out = []
    for beds in BEDROOMS:
        seen, page, total = set(), 1, 1
        while len(seen) < total and page <= 40:
            props, total = unihomes_page(get("https://www.unihomes.co.uk/student-accommodation/cardiff", bedrooms=beds, page=page))
            new = [p for p in props if p["id"] not in seen]
            if not new:
                break
            for p in new:
                seen.add(p["id"])
                if p.get("type") != "house":
                    continue
                lat, lng = float(p["latitude"]), float(p["longitude"])
                out.append(listing(
                    id=f"uni_{p['id']}", source="UniHomes",
                    title=f"{p['bedroomCount']} bed house, {p['addressShort']}",
                    address=f"{p['addressShort']}, {p.get('postcode') or ''}".strip(", "),
                    area=p["addressShort"].split(",")[-1].strip(),
                    bedrooms=p["bedroomCount"], bathrooms=p.get("bathroomCount"),
                    price_pppw=float(p["price"] or 0), price_pcm=float(p["price"] or 0) * p["bedroomCount"] * 52 / 12,
                    bills=True,  # every UniHomes listing is bills-inclusive
                    available=parse_date(p.get("availableFrom")),
                    url=p["path"], image=p.get("mainImage"), lat=lat, lng=lng,
                    notes="Bills included: gas, electricity, water, internet, TV licence.",
                ))
            page += 1
    return out


HOUSR_PUSH = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')


def housr_page(h):
    """Full property objects from the Next.js payload; map pins (no title) are skipped."""
    text = "".join(json.loads('"' + p + '"') for p in HOUSR_PUSH.findall(h))
    dec, out = json.JSONDecoder(), {}
    for m in re.finditer(r'\{"id":\d+,"title":', text):
        try:
            o, _ = dec.raw_decode(text, m.start())
        except ValueError:
            continue
        if "price_pw" in o and o.get("title"):
            out[o["id"]] = o
    total = re.search(r"(\d+)<!-- --> <!-- -->results", h)
    return list(out.values()), int(total[1]) if total else 0


def scrape_housr():
    out = []
    for beds in BEDROOMS:
        seen, page, total = set(), 1, 1
        while len(seen) < total and page <= 40:
            props, total = housr_page(get("https://www.housr.com/en-gb/student-accommodation/cardiff",
                                          minBedrooms=beds, maxBedrooms=beds, page=page))
            new = [p for p in props if p["id"] not in seen]
            if not new:
                break
            for p in new:
                seen.add(p["id"])
                if not p.get("is_group_house"):  # skip single rooms in halls
                    continue
                images = p.get("images_full") or p.get("images") or []
                addr = p.get("address") or p["title"]
                out.append(listing(
                    id=f"housr_{p['id']}", source="Housr", title=f"{p['bedrooms']} bed house, {p['title']}",
                    address=addr, area=addr.split(",")[1].strip() if addr.count(",") >= 2 else "",
                    bedrooms=p["bedrooms"], bathrooms=p.get("bathrooms"),
                    price_pppw=p["price_pw"], price_pcm=p["price_pm"] * p["bedrooms"] if p.get("price_pm") else None,
                    bills=False, available=parse_date(p.get("available_from")),
                    url=f"https://www.housr.com/en-gb/student-accommodation/cardiff/property/{p['id']}",
                    image=images[0] if images else None,
                    lat=float(p["lat"]), lng=float(p["lng"]),
                    notes=f"Optional Housr bills package: £{p['total_price']} pppw all-in." if p.get("total_price") else "",
                ))
            page += 1
    return out


def scrape_cps():
    base = "https://www.cpshomes.co.uk"
    h = get(f"{base}/renting/properties/all")
    start = h.index("ldpc.init(") + len("ldpc.init(")
    data, _ = json.JSONDecoder().raw_decode(h, start)
    out = []
    for p in data["MapList"]:  # MapList holds every letting; List is only page 1
        beds = p.get("Bedrooms") or 0
        if beds not in BEDROOMS or p.get("Status") != "Available" or p.get("Style") == "Flat":
            continue
        ref, photo = p["Reference"], p.get("Photo") or ""
        parts = photo.split("/")
        image = f"{base}/_resources/files/{parts[1]}/{parts[2]}/{parts[3]}" if len(parts) >= 4 else None
        pcm = p["Price"] if p.get("PriceType") == "PCM" else (p["Price"] or 0) * 52 / 12
        out.append(listing(
            id=f"cps_{ref}", source="CPS Homes", title=f"{beds} bed house, {p['Title']}",
            address=p["Title"], area=p.get("Area") or "", bedrooms=beds, bathrooms=p.get("Bathrooms"),
            price_pppw=pppw_from_pcm(pcm, beds), price_pcm=pcm, bills=False,
            available=parse_date(p.get("Available")),
            url=f"{base}/renting/properties/{p.get('Area') or 'Cardiff'}/{ref}", image=image,
            lat=p.get("Latitude"), lng=p.get("Longitude"),
        ))
    return out


# ---------------------------------------------------------------- output

def finalise(listings, previous):
    """Drop last-year lets, add walk labels and keep first-seen dates across runs."""
    today = date.today()
    first_seen = {p["id"]: p.get("first_detected") for p in previous}
    kept = []
    for p in listings:
        avail = date.fromisoformat(p["available"]) if p.get("available") else None
        if avail and avail < YEAR_START:
            continue
        m = p.get("walk_minutes")
        p["walk_display"] = f"{m} min walk" if m is not None else "Walk time unknown"
        p["is_priority_10min"] = m is not None and m <= 10
        p["available_date"] = avail.strftime("%d/%m/%Y") if avail else "TBC"
        p["first_detected"] = first_seen.get(p["id"]) or today.isoformat()
        days = (today - date.fromisoformat(p["first_detected"])).days
        p["recency_days"] = days
        p["freshness_tag"] = "NEW TODAY" if days == 0 else "NEW THIS WEEK" if days <= 7 else ""
        p["price_formatted"] = f"£{p['price_pppw']:g} pppw" if p["price_pppw"] else "Price on enquiry"
        kept.append(p)
    kept.sort(key=lambda p: (p["walk_minutes"] is None, p["walk_minutes"] or 0))
    return kept


def write_csv(listings):
    cols = [("Address", "address"), ("Bedrooms", "bedrooms"), ("Bathrooms", "bathrooms"),
            ("Walk to Cardiff Uni (min)", "walk_minutes"), ("Price PPPW (£)", "price_pppw"),
            ("Total Monthly (£)", "price_total_month"), ("Bills Included", "bills_included"),
            ("Available", "available_date"), ("Agent", "source"), ("URL", "url")]
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([c for c, _ in cols])
        for p in listings:
            w.writerow(["Yes" if p[k] is True else "No" if p[k] is False else p[k] for _, k in cols])


def selfcheck():
    assert pppw_from_pcm(3100, 5) == 143.08
    assert walk_minutes(*UNI) == 1
    assert 18 <= walk_minutes(51.4757, -3.1791) <= 28  # Cardiff Central station, ~1.4 km
    assert walk_minutes(90.0, 90.0) is None and walk_minutes(55.378051, -3.435973) is None
    assert parse_date("Available from 3rd July 2027") == date(2027, 7, 3)
    assert parse_date("01/07/2027 12:00:00 AM") == date(2027, 7, 1)
    assert parse_date("2027-07-01") == date(2027, 7, 1)
    assert parse_date(None) is None


def main():
    selfcheck()
    previous = []
    if OUT_JSON.exists():
        previous = json.loads(OUT_JSON.read_text(encoding="utf-8")).get("listings", [])

    results, counts, failed = [], {}, []
    for name, fn in [("Cardiff Student Letting", scrape_csl), ("UniHomes", scrape_unihomes),
                     ("Housr", scrape_housr), ("CPS Homes", scrape_cps)]:
        print(f"Scraping {name}…", flush=True)
        try:
            found = fn()
        except Exception as e:  # one broken site shouldn't lose the others
            print(f"  FAILED: {e!r}", file=sys.stderr)
            failed.append(name)
            found = [p for p in previous if p["source"] == name]  # keep last good data
        counts[name] = len(found)
        print(f"  {len(found)} houses")
        results += found

    listings = finalise(results, previous)
    meta = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_properties": len(listings),
        "bedrooms": f"{BEDROOMS.start}-{BEDROOMS.stop - 1}",
        "source_breakdown": {s: sum(p["source"] == s for p in listings) for s in counts},
        "failed_sources": failed,
    }
    OUT_JSON.write_text(json.dumps({"metadata": meta, "listings": listings}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_csv(listings)
    print(f"Saved {len(listings)} houses to {OUT_JSON.name} and {OUT_CSV.name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
