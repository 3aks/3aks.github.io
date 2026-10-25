"""
Tissot PRX Powermatic 80 (40mm) price tracker — new and pre-owned, UK.

New:       Tissot UK (official), John Lewis
Pre-owned: eBay UK via the official Browse API (needs a free developer key, see below)

Every model of this watch has a reference starting T137.407; that's how listings are matched.
Writes listings.json, read by index.html.

    pip install -r ../housing/requirements.txt
    python scraper.py

eBay: create an app at https://developer.ebay.com (free), copy the Production App ID and Cert ID, then in PowerShell:
    setx EBAY_CLIENT_ID "your-app-id"
    setx EBAY_CLIENT_SECRET "your-cert-id"
Open a new terminal afterwards. Without the keys, eBay is skipped and the rest still runs.
"""

import base64
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HERE = Path(__file__).parent
OUT_JSON = HERE / "listings.json"
DELAY = 0.5

REF = re.compile(r"t\s?137\.?407\.?\d{2}\.?\d{3}\.?\d{2}", re.I)  # T137.407.xx.xxx.xx = Powermatic 80, 40mm

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept-Language": "en-GB,en;q=0.9",
})


def get(url, **params):
    time.sleep(DELAY)
    r = session.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.text


def norm_ref(text):
    """'T137.407.11.041.00' / 't1374071104100' -> 'T137.407.11.041.00'."""
    m = REF.search(text or "")
    if not m:
        return None
    d = re.sub(r"\D", "", m[0])
    return f"T{d[0:3]}.{d[3:6]}.{d[6:8]}.{d[8:11]}.{d[11:13]}"


def offer(*, id, source, condition, title, ref, price, url, image, colour="", in_stock=True, notes=""):
    return {"id": id, "source": source, "condition": condition, "title": title, "ref": ref,
            "colour": colour, "price": round(float(price), 2), "url": url, "image_url": image or None,
            "in_stock": in_stock, "notes": notes}


# ---------------------------------------------------------------- new

def scrape_tissot():
    base = "https://www.tissotwatches.com/en-gb"
    h = get(f"{base}/search", q="prx powermatic 80 40mm")
    urls = []
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        if data.get("@type") == "ItemList":
            urls += [i["url"] for i in data.get("itemListElement", [])]
    # One page per model; "-T85…" variants are the same watch bundled with an extra strap
    urls = sorted({u for u in urls if norm_ref(u.rsplit("/", 1)[-1]) and "-T8" not in u})
    out = []
    for url in urls:
        page = get(url)
        product = next((d for d in (json.loads(b) for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S))
                        if d.get("@type") == "Product"), None)
        text = re.sub(r"\s*\|\s*(\|\s*)*", "|", re.sub(r"<[^>]+>", "|", re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S)))
        spec = lambda label: (re.search(rf"\|{label}\|([^|]+)\|", text) or [None, ""])[1].strip()
        if not product or spec(r"Case width \(mm\)") != "40.00" or "automatic" not in spec("Movement").lower():
            continue  # not the 40mm Powermatic
        image = re.search(r'<meta property="og:image" content="([^"]+)"', page)
        o = product.get("offers") or {}
        out.append(offer(
            id="tissot_" + product["sku"], source="Tissot UK", condition="New", title=product["name"],
            ref=norm_ref(product["sku"]), price=o.get("price") or 0, url=url, image=image and image[1],
            colour=spec("Dial colour"), in_stock="InStock" in str(o.get("availability")),
            notes="Official Tissot store",
        ))
    return out


def scrape_john_lewis():
    soup = BeautifulSoup(get("https://www.johnlewis.com/search", **{"search-term": "tissot prx powermatic 80"}), "html.parser")
    out = []
    for card in soup.select('[data-testid="product-card-layout"]'):
        link = card.select_one('a[data-component="pcl-Title"]')
        price = card.select_one('[data-testid="product-card-price-now"]')
        if not link or not price:
            continue
        ref = norm_ref(link["href"]) or norm_ref(link.get_text())
        if not ref:
            continue  # not a T137.407 (35mm, titanium, quartz…)
        img = card.select_one("img")
        src = img.get("src") if img else None
        out.append(offer(
            id="jl_" + link["href"].rstrip("/").rsplit("/p", 1)[-1], source="John Lewis", condition="New",
            title=link.get_text(" ", strip=True), ref=ref, price=re.sub(r"[^\d.]", "", price.get_text()),
            url=link["href"], image=("https:" + src) if src and src.startswith("//") else src,
        ))
    return out


# ---------------------------------------------------------------- pre-owned

def ebay_title_ok(title):
    """Keep watches that say 40mm or carry the T137.407 reference; drop 35mm, quartz, chrono, parts."""
    t = title.lower()
    if re.search(r"\b35\s?mm\b|quartz|chrono|\bstrap only|\bbracelet only|\bbox only|\bparts\b|\breplica|\bhomage", t):
        return False
    is_model = "prx" in t and ("powermatic" in t or "automatic" in t or "pm80" in t)
    return bool(norm_ref(title)) or (is_model and re.search(r"\b40\s?mm\b", t))


def scrape_ebay():
    cid, secret = os.environ.get("EBAY_CLIENT_ID"), os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        print("  skipped: set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to include eBay (see top of this file)")
        return None
    tok = session.post("https://api.ebay.com/identity/v1/oauth2/token", timeout=30,
                       headers={"Authorization": "Basic " + base64.b64encode(f"{cid}:{secret}".encode()).decode()},
                       data={"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"})
    tok.raise_for_status()
    r = session.get("https://api.ebay.com/buy/browse/v1/item_summary/search", timeout=30,
                    headers={"Authorization": "Bearer " + tok.json()["access_token"], "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB"},
                    params={"q": "tissot prx powermatic 80", "category_ids": "31387", "limit": 200,
                            "filter": "price:[150..1500],priceCurrency:GBP,itemLocationCountry:GB"})
    r.raise_for_status()
    out = []
    for it in r.json().get("itemSummaries", []):
        if not ebay_title_ok(it["title"]):
            continue
        auction = "AUCTION" in it.get("buyingOptions", []) and "FIXED_PRICE" not in it.get("buyingOptions", [])
        price = (it.get("currentBidPrice") if auction else None) or it["price"]
        out.append(offer(
            id="ebay_" + it["itemId"], source="eBay", condition="New" if it.get("condition") == "New" else "Pre-owned",
            title=it["title"], ref=norm_ref(it["title"]), price=price["value"], url=it["itemWebUrl"],
            image=(it.get("image") or {}).get("imageUrl"),
            notes=("Auction, current bid" if auction else it.get("condition") or ""),
        ))
    return out


# ---------------------------------------------------------------- output

def selfcheck():
    assert norm_ref("t1374071104100") == "T137.407.11.041.00"
    assert norm_ref("Tissot T137.407.11.051.00 PRX") == "T137.407.11.051.00"
    assert norm_ref("T1378074406100 titanium") is None and norm_ref("T137.410.11.041.00 quartz") is None
    assert ebay_title_ok("Tissot PRX Powermatic 80 40mm Blue Dial")
    assert ebay_title_ok("Tissot T137.407.11.041.00 Automatic")
    assert not ebay_title_ok("Tissot PRX Powermatic 80 35mm")  # wrong size
    assert not ebay_title_ok("Tissot PRX Powermatic 80 Blue")  # size not stated: can't confirm 40mm
    assert not ebay_title_ok("Tissot PRX 40mm Quartz") and not ebay_title_ok("Tissot PRX 40mm strap only")


def main():
    selfcheck()
    previous = json.loads(OUT_JSON.read_text(encoding="utf-8"))["offers"] if OUT_JSON.exists() else []
    offers, failed = [], []
    for name, fn in [("Tissot UK", scrape_tissot), ("John Lewis", scrape_john_lewis), ("eBay", scrape_ebay)]:
        print(f"Scraping {name}…", flush=True)
        try:
            found = fn()
        except Exception as e:  # one broken site shouldn't lose the others
            print(f"  FAILED: {e!r}", file=sys.stderr)
            failed.append(name)
            found = [o for o in previous if o["source"] == name]  # keep last good data
        if found is None:
            continue
        print(f"  {len(found)} listings")
        offers += found
    colours = {o["ref"]: o["colour"] for o in offers if o["source"] == "Tissot UK"}
    for o in offers:
        o["colour"] = o["colour"] or colours.get(o["ref"], "")  # retailers don't state it; the reference does
    offers.sort(key=lambda o: o["price"])
    meta = {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "total": len(offers),
            "failed_sources": failed, "model": "Tissot PRX Powermatic 80, 40mm (T137.407)"}
    OUT_JSON.write_text(json.dumps({"metadata": meta, "offers": offers}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(offers)} listings to {OUT_JSON.name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
