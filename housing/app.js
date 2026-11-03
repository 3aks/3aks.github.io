/**
 * Student House Hunter (3–9 bed) - Interactive Dashboard Logic
 * Shared by the Cardiff page and /housing/warwick/. Data comes from ./listings.json,
 * written by scraper.py; per-city settings live on <body> data attributes.
 */

const PAGE_SIZE = 12;
const PRICE_MAX = 220;
const DISTANCE_MAX = Number(document.getElementById("distanceRange").max); // metres; the top stop means "any distance"
const WEEKS_PER_MONTH = 52 / 12;
const UNIT_KEY = "housing.priceUnit";

// Walk-time colour bands in minutes (green, gold, purple) and the "near" threshold the stats count
const WALK_BANDS = (document.body.dataset.walkBands || "5,10,15").split(",").map(Number);
const PRIORITY_WALK = Number(document.body.dataset.priorityWalk || WALK_BANDS[1]);

let allListings = [];
let activeWalkFilter = document.querySelector("#walkFilterChips .chip.active")?.dataset.walk || "all";
let priceUnit = readUnit(); // "pppw" or "pppm"; prices are stored per week and converted for display
let visibleCount = PAGE_SIZE;
let animateFrom = 0; // cards below this index are already on screen and shouldn't re-animate
let currentResults = [];

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  initStickyToolbar();
  initGalleries();
  setPriceUnit(priceUnit, false);
  loadListings();
});

function readUnit() {
  try {
    return localStorage.getItem(UNIT_KEY) === "pppm" ? "pppm" : "pppw";
  } catch {
    return "pppw";
  }
}

function initEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");

  searchInput.addEventListener("input", () => {
    btnClearSearch.hidden = !searchInput.value;
    filterAndRender();
  });

  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    btnClearSearch.hidden = true;
    searchInput.focus();
    filterAndRender();
  });

  // Walk filter chips
  document.querySelectorAll("#walkFilterChips .chip").forEach(chip => {
    chip.addEventListener("click", () => setWalkFilter(chip.dataset.walk));
  });

  // Bedroom chips: any combination can be on; none on means any size
  document.querySelectorAll("#bedsFilter .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
      updateBedsDisplay();
      filterAndRender();
    });
  });

  document.querySelectorAll("#priceUnit button").forEach(btn => {
    btn.addEventListener("click", () => setPriceUnit(btn.dataset.unit));
  });

  ["agencyFilter", "billsOnlyToggle", "sortBySelect"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => filterAndRender());
  });

  const priceRange = document.getElementById("priceRange");
  priceRange.addEventListener("input", () => {
    updatePriceDisplay();
    filterAndRender();
  });

  document.getElementById("distanceRange").addEventListener("input", () => {
    updateDistanceDisplay();
    filterAndRender();
  });

  // Mobile filter panel
  const btnFilters = document.getElementById("btnFilters");
  const panel = document.getElementById("filterPanel");
  btnFilters.addEventListener("click", () => {
    const open = !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    btnFilters.setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.getElementById("btnResetFilters").addEventListener("click", resetFilters);

  // Copy buttons are rendered per card; one delegated listener handles them all
  document.getElementById("propertiesGrid").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-share");
    if (!btn) return;
    const listing = currentResults.find(p => p.id === btn.dataset.id);
    if (listing) copyShareText(buildShareText(listing));
  });
}

function initStickyToolbar() {
  const toolbar = document.getElementById("toolbar");
  const sentinel = document.createElement("div");
  toolbar.before(sentinel);
  new IntersectionObserver(([entry]) => {
    toolbar.classList.toggle("stuck", !entry.isIntersecting);
  }).observe(sentinel);

  // Scrolling down through results tucks the toolbar and closes filters; scrolling up brings it back
  const panel = document.getElementById("filterPanel");
  const btnFilters = document.getElementById("btnFilters");
  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) < 8) return;
    lastY = y;
    const typing = toolbar.contains(document.activeElement) && document.activeElement.matches("input, select");
    if (delta > 0 && toolbar.classList.contains("stuck") && !typing) {
      toolbar.classList.add("tucked");
      panel.classList.remove("open");
      btnFilters.setAttribute("aria-expanded", "false");
    } else if (delta < 0) {
      toolbar.classList.remove("tucked");
    }
  }, { passive: true });
}

/* ---------------------------------------------------------------- photo galleries */

// Each card's photos sit in a horizontal scroll-snap strip: swipe on touch, arrows on hover.
// Scroll events don't bubble, so one capturing listener on the grid keeps every card's dots in step.
function initGalleries() {
  const grid = document.getElementById("propertiesGrid");
  const pending = new Set();
  grid.addEventListener("scroll", (e) => {
    if (!e.target.classList?.contains("gallery-track")) return;
    if (!pending.size) requestAnimationFrame(() => { pending.forEach(syncGallery); pending.clear(); });
    pending.add(e.target);
  }, { capture: true, passive: true });

  grid.addEventListener("click", (e) => {
    const arrow = e.target.closest(".gallery-arrow");
    if (!arrow) return;
    const track = arrow.parentElement.querySelector(".gallery-track");
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: track.clientWidth * Number(arrow.dataset.step), behavior: smooth ? "smooth" : "auto" });
  });
}

function syncGallery(track) {
  const slides = track.children.length;
  const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
  const media = track.parentElement;
  media.querySelectorAll(".gallery-dot").forEach((dot, i) => dot.classList.toggle("on", i === index));
  media.querySelector(".gallery-arrow.prev")?.toggleAttribute("hidden", index <= 0);
  media.querySelector(".gallery-arrow.next")?.toggleAttribute("hidden", index >= slides - 1);
}

function galleryHTML(p) {
  const photos = (p.images && p.images.length ? p.images : [p.image_url]).filter(Boolean);
  if (!photos.length) {
    return `<div class="card-img-placeholder">${escapeHtml(p.address.split(',')[0])}</div>`;
  }
  const alt = escapeHtml(p.address);
  const slides = photos.map((src, i) => `
    <div class="gallery-slide">
      <img src="${escapeHtml(src)}" alt="${i === 0 ? alt : `${alt}, photo ${i + 1}`}" class="card-img" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('broken')">
    </div>`).join("");
  if (photos.length === 1) return `<div class="gallery-track">${slides}</div>`;
  return `
    <div class="gallery-track" tabindex="0" aria-label="${photos.length} photos of ${alt}">${slides}</div>
    <button class="gallery-arrow prev" type="button" data-step="-1" aria-label="Previous photo" hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
    </button>
    <button class="gallery-arrow next" type="button" data-step="1" aria-label="Next photo">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </button>
    <div class="gallery-dots" aria-hidden="true">${photos.map((_, i) => `<span class="gallery-dot${i === 0 ? ' on' : ''}"></span>`).join("")}</div>`;
}

/* ---------------------------------------------------------------- filters */

function setWalkFilter(value) {
  activeWalkFilter = value;
  document.querySelectorAll("#walkFilterChips .chip").forEach(c => {
    const on = c.dataset.walk === value;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
  filterAndRender();
}

function setPriceUnit(unit, rerender = true) {
  priceUnit = unit;
  try { localStorage.setItem(UNIT_KEY, unit); } catch { /* private mode: the choice just isn't remembered */ }
  document.querySelectorAll("#priceUnit button").forEach(btn => {
    btn.setAttribute("aria-pressed", btn.dataset.unit === unit ? "true" : "false");
  });
  document.getElementById("priceUnit").dataset.unit = unit;
  updatePriceDisplay();
  if (rerender) {
    updateTopStats();
    animateFrom = visibleCount; // same cards, new numbers: no entrance animation
    filterAndRender(true);
  }
}

// Weekly price shown in the chosen unit, rounded to whole pounds per month
function money(pppw) {
  if (!pppw) return null;
  return priceUnit === "pppm" ? Math.round(pppw * WEEKS_PER_MONTH) : Math.round(pppw * 100) / 100;
}

function selectedBeds() {
  return [...document.querySelectorAll('#bedsFilter .chip[aria-pressed="true"]')].map(c => Number(c.dataset.beds));
}

function updateBedsDisplay() {
  const beds = selectedBeds();
  document.getElementById("bedsDisplay").textContent = beds.length ? `${beds.join(", ")} bed` : "Any";
}

function updatePriceDisplay() {
  const val = parseInt(document.getElementById("priceRange").value, 10);
  document.getElementById("priceDisplay").textContent = val >= PRICE_MAX ? "Any" : `£${money(val)} ${priceUnit}`;
}

function updateDistanceDisplay() {
  const val = parseInt(document.getElementById("distanceRange").value, 10);
  document.getElementById("distanceDisplay").textContent = val >= DISTANCE_MAX ? "Any" : formatDistance(val);
}

function formatDistance(m) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("btnClearSearch").hidden = true;
  document.querySelectorAll("#bedsFilter .chip").forEach(c => c.setAttribute("aria-pressed", "false"));
  document.getElementById("agencyFilter").value = "all";
  document.getElementById("billsOnlyToggle").checked = false;
  document.getElementById("priceRange").value = PRICE_MAX;
  document.getElementById("distanceRange").value = DISTANCE_MAX;
  document.getElementById("sortBySelect").value = "closest";
  updateBedsDisplay();
  updatePriceDisplay();
  updateDistanceDisplay();
  setWalkFilter("all");
}

async function loadListings() {
  try {
    const res = await fetch("./listings.json", { cache: "no-cache" }); // always the latest scrape
    if (!res.ok) throw new Error("Failed to load listings");
    const data = await res.json();
    allListings = data.listings || [];
    fillAgencyFilter(allListings);
    updateTopStats();
    updateLastUpdated(data.metadata);
    filterAndRender();
  } catch (err) {
    console.error("Error fetching listings:", err);
    document.getElementById("resultsCount").textContent = "Couldn't load listings. Refresh to try again.";
  }
}

// Agencies come from the data, busiest first, so each city's page lists its own agents
function fillAgencyFilter(listings) {
  const counts = new Map();
  listings.forEach(p => [p, ...(p.also_on || [])].forEach(o => counts.set(o.source, (counts.get(o.source) || 0) + 1)));
  const select = document.getElementById("agencyFilter");
  [...counts].sort((a, b) => b[1] - a[1]).forEach(([name, n]) => {
    select.add(new Option(`${name} (${n})`, name));
  });
}

function updateTopStats() {
  const listings = allListings;
  const priced = listings.filter(p => p.price_pppw > 0);
  const avg = priced.length ? priced.reduce((acc, p) => acc + p.price_pppw, 0) / priced.length : 0;

  document.getElementById("valTotal").textContent = listings.length;
  document.getElementById("valPriority").textContent = listings.filter(p => (p.walk_minutes ?? Infinity) <= PRIORITY_WALK).length;
  document.getElementById("valBills").textContent = listings.filter(p => p.bills_included).length;
  document.getElementById("valAvgPrice").textContent = `£${Math.round(money(avg) || 0)}`;
  document.getElementById("labelAvgPrice").textContent = `Avg ${priceUnit}`;
}

function updateLastUpdated(metadata) {
  const updated = metadata && metadata.timestamp ? new Date(metadata.timestamp.replace(" ", "T") + "Z") : null;
  if (updated && !isNaN(updated)) {
    document.getElementById("lastUpdated").textContent = timeAgo(updated);
  }
}

function timeAgo(when) {
  const mins = Math.round((Date.now() - when) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function filterAndRender(loadingMore = false) {
  if (!loadingMore) {
    visibleCount = PAGE_SIZE;
    animateFrom = 0;
  }
  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  const beds = selectedBeds();
  const selectedAgency = document.getElementById("agencyFilter").value;
  const billsOnly = document.getElementById("billsOnlyToggle").checked;
  const maxPrice = parseInt(document.getElementById("priceRange").value, 10);
  const maxDistance = parseInt(document.getElementById("distanceRange").value, 10);
  const sortBy = document.getElementById("sortBySelect").value;

  const filtered = allListings.filter(p => {
    if (searchTerm) {
      const hay = `${p.address} ${p.title} ${p.area || ''} ${p.source} ${p.notes || ''}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }

    if (activeWalkFilter !== "all" && (p.walk_minutes ?? Infinity) > Number(activeWalkFilter)) return false;

    // The same house can be offered by several sites: a filter passes if any offer matches
    const offers = [p, ...(p.also_on || [])];
    if (beds.length && !beds.includes(p.bedrooms)) return false;
    if (selectedAgency !== "all" && !offers.some(o => o.source === selectedAgency)) return false;
    if (billsOnly && !offers.some(o => o.bills_included)) return false;
    if (maxPrice < PRICE_MAX && !offers.some(o => !o.price_pppw || o.price_pppw <= maxPrice)) return false;
    if (maxDistance < DISTANCE_MAX && (p.distance_m ?? Infinity) > maxDistance) return false;

    return true;
  });

  if (sortBy === "closest") {
    filtered.sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
  } else if (sortBy === "cheapest") {
    filtered.sort((a, b) => (a.price_pppw || 9999) - (b.price_pppw || 9999));
  } else if (sortBy === "newest") {
    filtered.sort((a, b) => a.recency_days - b.recency_days);
  }

  updateFilterCount(beds, selectedAgency, billsOnly, maxPrice, maxDistance);
  renderGrid(filtered);
}

// Badge on the mobile "Filters" button: how many panel filters are not default
function updateFilterCount(beds, agency, billsOnly, maxPrice, maxDistance) {
  const n = (beds.length > 0) + (agency !== "all") + billsOnly + (maxPrice < PRICE_MAX) + (maxDistance < DISTANCE_MAX);
  const badge = document.getElementById("filterCount");
  badge.hidden = n === 0;
  badge.textContent = n;
}

function renderGrid(listings) {
  const grid = document.getElementById("propertiesGrid");
  const empty = document.getElementById("emptyState");
  const countHeader = document.getElementById("resultsCount");
  currentResults = listings;

  countHeader.textContent = `${listings.length} ${listings.length === 1 ? "house" : "houses"}`;

  if (listings.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    removeLoadMoreBtn();
    return;
  }

  empty.hidden = true;
  const toShow = listings.slice(0, visibleCount);
  grid.innerHTML = toShow.map((p, i) => createCardHTML(p, i)).join("");

  if (listings.length > visibleCount) {
    showLoadMoreBtn(listings.length - visibleCount);
  } else {
    removeLoadMoreBtn();
  }
}

function showLoadMoreBtn(remaining) {
  removeLoadMoreBtn();
  const btn = document.createElement("button");
  btn.className = "btn-load-more";
  btn.id = "btnLoadMore";
  btn.type = "button";
  btn.textContent = `Show ${Math.min(remaining, PAGE_SIZE)} more`;
  btn.addEventListener("click", () => {
    animateFrom = visibleCount;
    visibleCount += PAGE_SIZE;
    filterAndRender(true);
  });
  document.getElementById("propertiesGrid").after(btn);
}

function removeLoadMoreBtn() {
  const existing = document.getElementById("btnLoadMore");
  if (existing) existing.remove();
}

function priceText(p) {
  return p.price_pppw ? `£${money(p.price_pppw)} ${priceUnit}` : "Price on enquiry";
}

function buildShareText(p) {
  const distance = p.distance_m != null ? `${formatDistance(p.distance_m)} (${p.walk_display}) to uni` : "distance unknown";
  return `${p.address} — ${distance} — ${priceText(p)}${p.bills_included ? ' (bills incl.)' : ''} — Available: ${p.available_date} — ${p.url}`;
}

function createCardHTML(p, index) {
  const walk = p.walk_minutes ?? Infinity; // null <= 5 is true in JS
  let walkClass = "walk-far";
  if (walk <= WALK_BANDS[0]) walkClass = "walk-5m";
  else if (walk <= WALK_BANDS[1]) walkClass = "walk-10m";
  else if (walk <= WALK_BANDS[2]) walkClass = "walk-15m";

  const fresh = p.freshness_tag || "";

  // Only newly shown cards animate in, staggered, capped so long pages don't drag
  const animStyle = index < animateFrom
    ? 'style="animation:none"'
    : `style="--i:${Math.min(index - animateFrom, 8)}"`;

  const walkLabel = p.distance_m != null && walk <= 60 ? `${formatDistance(p.distance_m)} &middot; ${escapeHtml(p.walk_display)}` : escapeHtml(p.walk_display);
  // The other unit goes underneath, so both are always one glance away
  const subPrice = !p.price_pppw ? ""
    : priceUnit === "pppm" ? `£${Math.round(p.price_pppw * 100) / 100} pppw`
    : p.price_total_month ? `£${p.price_total_month.toLocaleString()}/mo total` : "";

  return `
    <article class="property-card" ${animStyle}>
      <div class="card-media">
        ${galleryHTML(p)}
        <div class="badge-top-left">
          <span class="badge-walk ${walkClass}">${walkLabel}</span>
        </div>
        <div class="badge-top-right">
          ${fresh ? `<span class="badge-recency ${fresh.includes('NEW') ? 'badge-new' : ''}">${escapeHtml(fresh)}</span>` : ''}
          <span class="badge-source">${escapeHtml(p.source)}</span>
        </div>
      </div>

      <div class="card-content">
        <div class="card-price-row">
          <div class="price-main">
            ${p.price_pppw ? `£${money(p.price_pppw).toLocaleString()} <span class="price-unit">${priceUnit}</span>` : '<span class="price-unit">Price on enquiry</span>'}
          </div>
          ${subPrice ? `<div class="price-sub">${subPrice}</div>` : ''}
        </div>

        <span class="bills-tag ${p.bills_included ? '' : 'no'}">${p.bills_included ? 'Bills included' : 'Bills not included'}</span>

        <h3 class="card-title">${escapeHtml(p.title)}</h3>

        <div class="spec-row">
          <span class="spec-item">${p.bedrooms} bed</span>
          ${p.bathrooms ? `<span class="spec-item">${p.bathrooms} bath</span>` : ''}
          <span class="spec-item">${escapeHtml(p.area || document.body.dataset.city || '')}</span>
        </div>

        <div class="avail-notice">Available from <strong>${escapeHtml(p.available_date)}</strong></div>

        ${p.also_on?.length ? `
          <div class="also-on">Also on ${p.also_on.map(o => `
            <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(o.source)}${o.price_pppw ? ` £${money(o.price_pppw)}` : ''}${o.bills_included ? ' bills incl.' : ''}</a>`).join(', ')}
          </div>` : ''}

        <div class="card-actions">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="btn-view">
            <span>View</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
          <button class="btn-share" type="button" data-id="${escapeHtml(p.id)}" aria-label="Copy details for ${escapeHtml(p.address)}">Copy</button>
        </div>
      </div>
    </article>
  `;
}

function copyShareText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copied house details");
  }).catch(() => {
    showToast("Couldn't copy. Long-press the link instead.");
  });
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
