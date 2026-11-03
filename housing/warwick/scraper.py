"""
Warwick student house scraper — 3 to 9 bedroom houses near the University of Warwick for 2027/28.

Sources: Rightmove and OnTheMarket student lets, Accommodation for Students and UniHomes (Coventry and Leamington Spa).
Rightmove and AFS carry the local letting agents' own listings with the agent's name, so the page shows who lets each house.
Everything else (dedupe, walking routes, CSV) comes from the Cardiff scraper in ../scraper.py.
Canley, Cannon Park and Tile Hill sit next to campus, so the page sorts by the walk to the Piazza.

    pip install -r ../requirements.txt
    python scraper.py
"""

import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
# Load ../scraper.py by path: both files are called scraper.py, so a plain import would find this one
_spec = importlib.util.spec_from_file_location("housing_base", HERE.parent / "scraper.py")
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

base.UNI = (52.3797, -1.5615)  # the Piazza, central campus (next to Warwick Arts Centre)
base.CSL_PLACEHOLDER = (0.0, 0.0)  # Cardiff-only quirk: nothing here sits on it
base.SOURCE_RANK = ["Rightmove", "OnTheMarket", "Accommodation for Students", "UniHomes"]  # agent-named listings lead a merged card
base.RENT_ONLY = set()  # AFS and UniHomes both quote bills-inclusive prices on some houses

AFS = "https://www.accommodationforstudents.com"
AFS_TOWNS = ["Coventry", "Leamington Spa"]  # names AFS recognises; unknown ones fall back to the whole UK
NEAR_CAMPUS = {"Coventry", "Leamington Spa", "Kenilworth", "Warwick"}


def afs_page(town, page):
    h = base.get(f"{AFS}/search-results", location=town, page=page)
    data = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)[1])
    found = data["props"]["pageProps"]["initialListings"]
    props = [r["property"] for g in found["listings"]["groups"] for r in g["results"]]
    return props, found.get("pageCount") or 1


# Many portal addresses stop at "Street, Coventry, CV4": name the student area from the postcode district instead
DISTRICTS = {"CV4": "Canley & Tile Hill", "CV5": "Earlsdon", "CV1": "City Centre", "CV3": "Cheylesmore",
             "CV8": "Kenilworth", "CV31": "Leamington Spa", "CV32": "Leamington Spa", "CV33": "Leamington Spa"}
VAGUE = {"", "coventry", "leamington spa", "royal leamington spa", "warwickshire", "west midlands"}


def outcodes_near(points):
    """Postcode district for each (lat, lng), from postcodes.io's free bulk reverse lookup."""
    found = []
    for i in range(0, len(points), 100):  # bulk limit
        chunk = points[i:i + 100]
        try:
            r = base.session.post("https://api.postcodes.io/postcodes", timeout=30, json={"geolocations": [
                {"latitude": lat, "longitude": lng, "radius": 500, "limit": 1} for lat, lng in chunk]})
            r.raise_for_status()
            found += [(res.get("result") or [{}])[0].get("outcode") for res in r.json()["result"]]
        except Exception as e:  # areas are a nicety: keep the houses either way
            print(f"  area lookup failed: {e!r}", file=sys.stderr)
            found += [None] * len(chunk)
    return found


def label_areas(listings):
    vague = [p for p in listings if p["area"].strip().lower() in VAGUE]
    for p in vague:
        district = re.search(r"\b(CV\d{1,2})(?:\s+\d[A-Z]{2})?\s*$", p["address"].upper())
        p["area"] = DISTRICTS.get(district[1], "") if district else ""
    unnamed = [p for p in vague if not p["area"] and p["lat"] is not None]
    for p, outcode in zip(unnamed, outcodes_near([(p["lat"], p["lng"]) for p in unnamed])):
        p["area"] = DISTRICTS.get(outcode, "")
    for p in vague:  # no coordinates either: the town at least
        p["area"] = p["area"] or p["address"].split(",")[-1].strip().title()
    return listings


def first_start(contracts):
    """Earliest contract start in the 2027 move-in window, else the earliest start at all."""
    starts = sorted(base.parse_date(c.get("startDate")) for c in contracts or [] if c.get("startDate"))
    return next((d for d in starts if base.starts_in_window(d.isoformat())), starts[0] if starts else None)


def scrape_afs():
    out, seen = [], set()
    for town in AFS_TOWNS:
        page, pages = 1, 1
        while page <= min(pages, 40):
            props, pages = afs_page(town, page)
            for p in props:
                occupancy = p.get("occupancy") or {}
                beds = occupancy.get("total") or 0
                if occupancy.get("available") != beds:  # some rooms already taken: not a whole house for a group
                    continue
                a, terms = p.get("address") or {}, p.get("terms") or {}
                if (p["id"] in seen or p.get("propertyType") != "house" or p.get("isPbsaProperty")
                        or beds not in base.BEDROOMS or a.get("city") not in NEAR_CAMPUS):
                    continue
                seen.add(p["id"])
                street = " ".join(x for x in (a.get("address1"), a.get("address2")) if x and not x.isdigit()) or a.get("address2") or ""
                area = a.get("area") or a.get("city") or town
                pppw = ((terms.get("rentPpw") or {}).get("value")) or 0
                coords = p.get("coordinates") or {}
                agent = ((p.get("accommodationProvider") or {}).get("name") or "").strip() or "Accommodation for Students"
                bills = terms.get("billsIncluded") == "all"
                out.append(base.listing(
                    id=f"afs_{p['id']}", source=agent, title=f"{beds} bed house, {street}",
                    address=", ".join(x for x in (street, area, a.get("postcode")) if x), area=area,
                    bedrooms=beds, bathrooms=p.get("numberOfBathrooms"),
                    price_pppw=pppw, price_pcm=pppw * beds * 52 / 12, bills=bills,
                    available=first_start(p.get("contracts")), url=AFS + p["url"],
                    image=None, images=[i["url"] for i in p.get("images") or [] if i.get("url")],
                    lat=coords.get("lat"), lng=coords.get("lon"),
                    notes="Bills included: " + ", ".join(terms.get("bills") or []) + "." if bills else "",
                ))
                out[-1]["via"] = "Accommodation for Students"
            page += 1
    return out


def scrape_rightmove():
    # Canley's 3-mile radius takes in Cannon Park, Tile Hill, Westwood Heath and Earlsdon
    found = (base.scrape_rightmove(69493, 3.0) + base.scrape_rightmove(782, 1.0)  # Leamington Spa
             + base.scrape_rightmove(728, 0.5))  # Kenilworth
    return list({p["id"]: p for p in found}.values())  # the circles overlap a little


def scrape_onthemarket():
    found = base.scrape_onthemarket("canley", 3) + base.scrape_onthemarket("leamington-spa", 1)
    return list({p["id"]: p for p in found}.values())


def scrape_unihomes():
    return base.scrape_unihomes("coventry") + base.scrape_unihomes("leamington-spa")


def selfcheck():
    assert base.walk_minutes(base.estimate_metres(*base.UNI)) == 1
    canley = base.estimate_metres(52.3958, -1.5501)  # Canley, by Prior Deram Walk: ~2 km straight
    assert 2000 <= canley <= 3200, canley
    assert first_start([{"startDate": "2027-07-01T00:00:00"}, {"startDate": "2026-11-04T00:00:00"}]).isoformat() == "2027-07-01"
    assert first_start([]) is None
    vague = dict(area="", address="Charter Avenue, Coventry, CV4")
    assert label_areas([vague])[0]["area"] == "Canley & Tile Hill"
    assert label_areas([dict(area="Cannon Park", address="Charter Avenue, Cannon Park, CV4 8EB")])[0]["area"] == "Cannon Park"
    assert label_areas([dict(area="Coventry", address="Earlsdon Street, Coventry, CV5 6EJ")])[0]["area"] == "Earlsdon"


def main():
    selfcheck()
    sources = [("Rightmove", scrape_rightmove), ("OnTheMarket", scrape_onthemarket),
               ("UniHomes", scrape_unihomes), ("Accommodation for Students", scrape_afs)]
    return base.run([(name, lambda fn=fn: label_areas(fn())) for name, fn in sources],
                    HERE / "listings.json", HERE / "warwick_student_houses.csv")


if __name__ == "__main__":
    sys.exit(main())
