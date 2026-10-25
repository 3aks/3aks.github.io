"""
Cardiff student house scraper — 3 to 9 bedroom houses for the next academic year.

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

import io

import requests
from bs4 import BeautifulSoup
from PIL import Image

HERE = Path(__file__).parent
OUT_JSON = HERE / "listings.json"
OUT_CSV = HERE / "cardiff_student_houses.csv"

BEDROOMS = range(3, 10)  # 3–9 bed
# Only houses with a confirmed Jul–Sep 2027 start; "available now" and undated listings are dropped
MOVE_IN = (date(2027, 7, 1), date(2027, 9, 30))
UNI = (51.488357, -3.177434)  # Cardiff University Students' Union, Park Place
OSRM = "https://routing.openstreetmap.de/routed-foot"  # free walking-route server, no key
CSL_PLACEHOLDER = (51.48868, -3.17751)  # pin CSL shows when a house has no location of its own
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

def metres_between(a, b):
    """Great-circle distance between two (lat, lng) points."""
    dlat = math.radians(b[0] - a[0])
    dlng = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlng / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def estimate_metres(lat, lng):
    """Straight-line distance to the SU x1.3 for streets; fallback when routing is unavailable."""
    if lat is None or lng is None:
        return None
    metres = metres_between(UNI, (lat, lng))
    if metres > 15000:  # placeholder coords some listings ship with (UK centroid, 90,90)
        return None
    return round(metres * 1.3)


def walk_minutes(metres):
    return max(1, round(metres / 80)) if metres is not None else None  # 80 m/min walking pace


POSTCODE = re.compile(r"CF\d{1,2}\s*\d[A-Z]{2}")
SOURCE_RANK = ["Cardiff Student Letting", "CPS Homes", "Housr", "UniHomes"]  # letting agents before portals


def street_key(address):
    """'Flat 3, 15 Northcote Street, CF24' -> 'northcote street'."""
    a = re.sub(r"^(?:top\s+)?flat[^,]*,\s*", "", address.strip().lower())
    return re.sub(r"^\d+[a-z]?\s+", "", a).split(",")[0].strip()


def dhash(img):
    """64-bit difference hash: survives resizing and recompression, so it matches the same photo across sites."""
    px = img.convert("L").resize((9, 8)).tobytes()  # 72 greyscale bytes, row by row
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


_photo_hashes = {}


def photo_hash(url):
    if not url:
        return None
    if url not in _photo_hashes:
        try:
            r = session.get(url, timeout=20)
            r.raise_for_status()
            _photo_hashes[url] = dhash(Image.open(io.BytesIO(r.content)))
        except Exception:  # broken or non-image photo: just can't use it as evidence
            _photo_hashes[url] = None
    return _photo_hashes[url]


def same_photo(a, b, max_bits=6):
    ha, hb = photo_hash(a["image_url"]), photo_hash(b["image_url"])
    return ha is not None and hb is not None and bin(ha ^ hb).count("1") <= max_bits


RENT_ONLY = {"Cardiff Student Letting", "CPS Homes", "Housr"}  # UniHomes prices include a bills premium


def rents_agree(a, b, tolerance=0.03):
    """Neighbouring houses on one street can share a pin; the same house has the same rent everywhere."""
    if a["source"] not in RENT_ONLY or b["source"] not in RENT_ONLY or not a["price_pppw"] or not b["price_pppw"]:
        return True
    return abs(a["price_pppw"] - b["price_pppw"]) <= tolerance * max(a["price_pppw"], b["price_pppw"])


def pin(p):
    return (p["source"], round(p["lat"], 5), round(p["lng"], 5)) if p["lat"] is not None else None


def merge_duplicates(listings, within=15):
    """One card per house: merge listings from DIFFERENT sites with the same street and bedrooms when their
    main photos match, or else their pins are within 15 m and neither pin is shared by another house on the
    same site (shared street pins can't tell neighbours apart). The rest become also_on links, so nothing is lost."""
    pin_count = {}
    for p in listings:
        pin_count[pin(p)] = pin_count.get(pin(p), 0) + 1

    def unambiguous_pin_match(a, b):
        return (a["lat"] is not None and b["lat"] is not None
                and pin_count[pin(a)] == 1 and pin_count[pin(b)] == 1
                and metres_between((a["lat"], a["lng"]), (b["lat"], b["lng"])) <= within
                and rents_agree(a, b))

    groups = {}
    for p in sorted(listings, key=lambda p: SOURCE_RANK.index(p["source"])):
        groups.setdefault((street_key(p["address"]), p["bedrooms"]), []).append(p)
    out = []
    for members in groups.values():
        clusters = []
        for p in members:
            open_ = [c for c in clusters if p["source"] not in {q["source"] for q in c}]
            home = (next((c for c in open_ if same_photo(c[0], p)), None)  # photo first: strongest evidence
                    or next((c for c in open_ if unambiguous_pin_match(c[0], p)), None))
            if home:
                home.append(p)
            else:
                clusters.append([p])
        for primary, *others in clusters:
            primary["also_on"] = [{k: q[k] for k in ("source", "url", "price_pppw", "bills_included")} for q in others]
            out.append(primary)
    return out


def refine_coords(listings):
    """Move houses onto their postcode's centre (postcodes.io, free, no key) when the site gave
    CSL's placeholder pin, or one street-level pin shared by houses with different postcodes."""
    for p in listings:
        p["postcode"] = (POSTCODE.search(p["address"]) or [None])[0]
    pins = {}
    for p in listings:
        if p["lat"] is not None:
            pins.setdefault((p["source"], round(p["lat"], 5), round(p["lng"], 5)), set()).add(p["postcode"])

    def is_placeholder(p):
        return p["lat"] is not None and metres_between(CSL_PLACEHOLDER, (p["lat"], p["lng"])) < 20

    def street_pin(p):
        return p["lat"] is not None and len(pins[(p["source"], round(p["lat"], 5), round(p["lng"], 5))]) > 1

    bad = [p for p in listings if is_placeholder(p) or (p["postcode"] and street_pin(p))]
    lookup = [p for p in bad if p["postcode"]]
    for i in range(0, len(lookup), 100):  # postcodes.io bulk limit
        chunk = lookup[i:i + 100]
        try:
            r = session.post("https://api.postcodes.io/postcodes", json={"postcodes": [p["postcode"] for p in chunk]}, timeout=30)
            r.raise_for_status()
            results = r.json()["result"]
        except (requests.RequestException, KeyError, ValueError) as e:
            print(f"  postcode lookup failed: {e!r}", file=sys.stderr)
            results = [{}] * len(chunk)
        for p, res in zip(chunk, results):
            if res.get("result"):
                p["lat"], p["lng"] = res["result"]["latitude"], res["result"]["longitude"]
    for p in bad:
        if is_placeholder(p):
            p["lat"] = p["lng"] = None  # still unknown: better no walk time than a fake 1 min
        p["distance_m"] = estimate_metres(p["lat"], p["lng"])
    for p in listings:
        del p["postcode"]
    print(f"  moved {len(bad)} houses from a placeholder or street-level pin to their postcode")


def route_distances(listings, batch=90):
    """Real walking distances to the SU from OSRM (OpenStreetMap foot routing), many houses per request."""
    todo = [p for p in listings if p["distance_m"] is not None]
    for i in range(0, len(todo), batch):
        chunk = todo[i:i + batch]
        coords = ";".join(f"{lng},{lat}" for lat, lng in [UNI] + [(p["lat"], p["lng"]) for p in chunk])
        try:
            r = session.get(f"{OSRM}/table/v1/driving/{coords}", params={"sources": 0, "annotations": "distance"}, timeout=60)
            r.raise_for_status()
            distances = r.json()["distances"][0][1:]
        except (requests.RequestException, KeyError, ValueError) as e:  # keep the estimates for this batch
            print(f"  routing failed for {len(chunk)} houses, using estimates: {e!r}", file=sys.stderr)
            continue
        for p, d in zip(chunk, distances):
            if d is not None:
                p["distance_m"], p["distance_routed"] = round(d), True
        time.sleep(1)  # shared community server: keep it gentle
    for p in listings:
        p["walk_minutes"] = walk_minutes(p["distance_m"])


def says_bills_included(text):
    """CSL states it in the badge or description; anything else (silence included) means not included."""
    if re.search(r"(?i)bills?\s+(?:are\s+)?not\s+inclu|\bno\s+bills\b|excl\w*\s+(?:of\s+)?bills", text):
        return False
    return bool(re.search(r"(?i)\bbills?\s+(?:are\s+)?inclu", text))


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
        "lat": lat, "lng": lng, "distance_m": estimate_metres(lat, lng), "distance_routed": False,
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
                bills=says_bills_included(detail), available=parse_date(avail[1] if avail else None),
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

def starts_in_window(available):
    return bool(available) and MOVE_IN[0] <= date.fromisoformat(available) <= MOVE_IN[1]


def finalise(listings, previous):
    """Keep Jul–Sep 2027 starts only, route walking distances, add labels and keep first-seen dates."""
    today = date.today()
    first_seen = {p["id"]: p.get("first_detected") for p in previous}
    kept = [p for p in listings if starts_in_window(p.get("available"))]
    before = len(kept)
    kept = merge_duplicates(kept)  # before refining: cross-site copies share the site's original pin
    print(f"  merged {before - len(kept)} cross-site duplicates into {len(kept)} houses")
    for p in kept:
        p.setdefault("distance_m", estimate_metres(p.get("lat"), p.get("lng")))  # older saved data
    refine_coords(kept)
    print(f"Routing walking distances for {len(kept)} houses…", flush=True)
    route_distances(kept)
    for p in kept:
        m = p["walk_minutes"]
        p["walk_display"] = f"{m} min walk" if m is not None else "Walk time unknown"
        p["is_priority_10min"] = m is not None and m <= 10
        p["available_date"] = date.fromisoformat(p["available"]).strftime("%d/%m/%Y")
        p["first_detected"] = first_seen.get(p["id"]) or today.isoformat()
        days = (today - date.fromisoformat(p["first_detected"])).days
        p["recency_days"] = days
        p["freshness_tag"] = "NEW TODAY" if days == 0 else "NEW THIS WEEK" if days <= 7 else ""
        p["price_formatted"] = f"£{p['price_pppw']:g} pppw" if p["price_pppw"] else "Price on enquiry"
    kept.sort(key=lambda p: (p["distance_m"] is None, p["distance_m"] or 0))
    return kept


def write_csv(listings):
    cols = [("Address", "address"), ("Bedrooms", "bedrooms"), ("Bathrooms", "bathrooms"),
            ("Walking distance to SU (m)", "distance_m"), ("Walk to SU (min)", "walk_minutes"),
            ("Price PPPW (£)", "price_pppw"),
            ("Total Monthly (£)", "price_total_month"), ("Bills Included", "bills_included"),
            ("Available", "available_date"), ("Agent", "source"), ("URL", "url")]
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow([c for c, _ in cols])
        for p in listings:
            w.writerow(["Yes" if p[k] is True else "No" if p[k] is False else p[k] for _, k in cols])


def selfcheck():
    assert pppw_from_pcm(3100, 5) == 143.08
    assert estimate_metres(*UNI) == 0 and walk_minutes(0) == 1
    assert 1500 <= estimate_metres(51.4757, -3.1791) <= 2200  # Cardiff Central station, ~1.4 km straight
    assert estimate_metres(90.0, 90.0) is None and estimate_metres(55.378051, -3.435973) is None
    assert walk_minutes(800) == 10 and walk_minutes(None) is None
    assert starts_in_window("2027-07-01") and starts_in_window("2027-09-30")
    assert not starts_in_window(None) and not starts_in_window("2027-06-30") and not starts_in_window("2027-10-01")
    assert not starts_in_window(date.today().isoformat())  # "available now"
    assert street_key("Flat 3, 15 Northcote Street, CF24") == "northcote street"
    assert street_key("49 Woodville Road, Cathays, CF24") == street_key("Woodville Road, Cathays, CF24 4DW")
    assert says_bills_included("Book an Appointment Bills Included Description")
    assert says_bills_included("Utility Bills Included (excl TV licence)")
    assert not says_bills_included("Bills not included") and not says_bills_included("A lovely house near uni")
    # Same photo resized and recompressed still matches; a different photo doesn't
    photo = Image.linear_gradient("L").rotate(90).resize((400, 300)).convert("RGB")  # left-right gradient
    buf = io.BytesIO()
    photo.resize((200, 150)).save(buf, "JPEG", quality=60)
    assert bin(dhash(photo) ^ dhash(Image.open(buf))).count("1") <= 6
    assert bin(dhash(photo) ^ dhash(photo.transpose(Image.Transpose.FLIP_LEFT_RIGHT))).count("1") > 6
    base = dict(address="Llandough Street, Cathays", bedrooms=6, lat=51.4900, lng=-3.1780, url="u",
                price_pppw=137, bills_included=False, image_url=None)
    merged = merge_duplicates([dict(base, source="UniHomes", price_pppw=160, bills_included=True),
                               dict(base, source="CPS Homes"), dict(base, source="CPS Homes", lat=51.4902),  # 2nd CPS house: own card
                               dict(base, source="Housr", lng=-3.1781)])
    assert len(merged) == 2 and merged[0]["source"] == "CPS Homes"
    assert {a["source"] for a in merged[0]["also_on"]} == {"Housr", "UniHomes"}
    # Two houses sharing one street pin on both sites: no photo match, so no guessing — they stay apart
    twins = [dict(base, source="CPS Homes", url="c1"), dict(base, source="CPS Homes", url="c2"),
             dict(base, source="Housr", url="h1")]
    assert len(merge_duplicates(twins)) == 3
    # Two houses near each other: each Housr copy pairs with the CPS house whose rent matches
    pair = merge_duplicates([dict(base, source="CPS Homes", url="c115", price_pppw=115.38),
                             dict(base, source="CPS Homes", url="c123", price_pppw=123.46, lat=51.49005),
                             dict(base, source="Housr", url="h123", price_pppw=123, lat=51.49003),
                             dict(base, source="Housr", url="h115", price_pppw=115, lat=51.49002)])
    assert {(p["url"], p["also_on"][0]["url"]) for p in pair} == {("c115", "h115"), ("c123", "h123")}
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
