/**
 * Cardiff Student House Hunter (3–8 bed) - Interactive Dashboard Logic
 * Data comes from listings.json, written by scraper.py.
 */

const PAGE_SIZE = 12;
const PRICE_MAX = 220;

let allListings = [];
let activeWalkFilter = "priority"; // default: <= 10m walk priority
let visibleCount = PAGE_SIZE;
let animateFrom = 0; // cards below this index are already on screen and shouldn't re-animate
let currentResults = [];

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  initStickyToolbar();
  loadListings();
});

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
  const walkChips = document.querySelectorAll("#walkFilterChips .chip");
  walkChips.forEach(chip => {
    chip.addEventListener("click", () => setWalkFilter(chip.dataset.walk));
  });

  ["bedsFilter", "agencyFilter", "billsOnlyToggle", "sortBySelect"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => filterAndRender());
  });

  const priceRange = document.getElementById("priceRange");
  priceRange.addEventListener("input", () => {
    updatePriceDisplay();
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
}

function setWalkFilter(value) {
  activeWalkFilter = value;
  document.querySelectorAll("#walkFilterChips .chip").forEach(c => {
    const on = c.dataset.walk === value;
    c.classList.toggle("active", on);
    c.setAttribute("aria-pressed", on ? "true" : "false");
  });
  filterAndRender();
}

function updatePriceDisplay() {
  const val = parseInt(document.getElementById("priceRange").value, 10);
  document.getElementById("priceDisplay").textContent = val >= PRICE_MAX ? "Any" : `£${val} pppw`;
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("btnClearSearch").hidden = true;
  document.getElementById("bedsFilter").value = "all";
  document.getElementById("agencyFilter").value = "all";
  document.getElementById("billsOnlyToggle").checked = false;
  document.getElementById("priceRange").value = PRICE_MAX;
  document.getElementById("sortBySelect").value = "closest";
  updatePriceDisplay();
  setWalkFilter("all");
}

async function loadListings() {
  try {
    const res = await fetch("./listings.json");
    if (!res.ok) throw new Error("Failed to load listings");
    const data = await res.json();
    allListings = data.listings || [];
    updateTopStats(data.metadata, allListings);
    filterAndRender();
  } catch (err) {
    console.error("Error fetching listings:", err);
    document.getElementById("resultsCount").textContent = "Couldn't load listings. Refresh to try again.";
  }
}

function updateTopStats(metadata, listings) {
  const total = listings.length;
  const priority10m = listings.filter(p => p.is_priority_10min).length;
  const billsCount = listings.filter(p => p.bills_included).length;

  const priced = listings.filter(p => p.price_pppw > 0);
  const avg = priced.length ? Math.round(priced.reduce((acc, p) => acc + p.price_pppw, 0) / priced.length) : 0;

  document.getElementById("valTotal").textContent = total;
  document.getElementById("valPriority").textContent = priority10m;
  document.getElementById("valBills").textContent = billsCount;
  document.getElementById("valAvgPrice").textContent = `£${avg}`;

  const updated = metadata && metadata.timestamp ? new Date(metadata.timestamp.replace(" ", "T")) : null;
  if (updated && !isNaN(updated)) {
    document.getElementById("lastUpdated").textContent =
      updated.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
}

function filterAndRender(loadingMore = false) {
  if (!loadingMore) {
    visibleCount = PAGE_SIZE;
    animateFrom = 0;
  }
  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  const beds = document.getElementById("bedsFilter").value;
  const selectedAgency = document.getElementById("agencyFilter").value;
  const billsOnly = document.getElementById("billsOnlyToggle").checked;
  const maxPrice = parseInt(document.getElementById("priceRange").value, 10);
  const sortBy = document.getElementById("sortBySelect").value;

  const filtered = allListings.filter(p => {
    if (searchTerm) {
      const hay = `${p.address} ${p.title} ${p.source} ${p.notes || ''}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }

    if (activeWalkFilter === "priority") {
      if (!p.is_priority_10min) return false;
    } else if (activeWalkFilter === "5m") {
      if ((p.walk_minutes ?? Infinity) > 5) return false;
    }

    if (beds !== "all" && p.bedrooms !== Number(beds)) return false;
    if (selectedAgency !== "all" && p.source !== selectedAgency) return false;
    if (billsOnly && !p.bills_included) return false;
    if (maxPrice < PRICE_MAX && p.price_pppw > 0 && p.price_pppw > maxPrice) return false;

    return true;
  });

  if (sortBy === "closest") {
    filtered.sort((a, b) => (a.walk_minutes ?? 999) - (b.walk_minutes ?? 999));
  } else if (sortBy === "cheapest") {
    filtered.sort((a, b) => (a.price_pppw || 9999) - (b.price_pppw || 9999));
  } else if (sortBy === "newest") {
    filtered.sort((a, b) => a.recency_days - b.recency_days);
  }

  updateFilterCount(beds, selectedAgency, billsOnly, maxPrice);
  renderGrid(filtered);
}

// Badge on the mobile "Filters" button: how many panel filters are not default
function updateFilterCount(beds, agency, billsOnly, maxPrice) {
  const n = (beds !== "all") + (agency !== "all") + billsOnly + (maxPrice < PRICE_MAX);
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

function buildShareText(p) {
  return `${p.address} — ${p.walk_display} walk to uni — ${p.price_formatted} ${p.bills_included ? '(bills incl.)' : ''} — Available: ${p.available_date} — ${p.url}`;
}

function createCardHTML(p, index) {
  const walk = p.walk_minutes ?? Infinity; // null <= 5 is true in JS
  let walkClass = "walk-far";
  if (walk <= 5) walkClass = "walk-5m";
  else if (walk <= 10) walkClass = "walk-10m";
  else if (walk <= 15) walkClass = "walk-15m";

  const fresh = p.freshness_tag || "";

  // Only newly shown cards animate in, staggered, capped so long pages don't drag
  const animStyle = index < animateFrom
    ? 'style="animation:none"'
    : `style="--i:${Math.min(index - animateFrom, 8)}"`;

  const mediaHTML = p.image_url ? `
    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.address)}" class="card-img" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'card-img-placeholder',textContent:'No photo'}))">
  ` : `
    <div class="card-img-placeholder">${escapeHtml(p.address.split(',')[0])}</div>
  `;

  return `
    <article class="property-card" ${animStyle}>
      <div class="card-media">
        ${mediaHTML}
        <div class="badge-top-left">
          <span class="badge-walk ${walkClass}">${escapeHtml(p.walk_display)}</span>
        </div>
        <div class="badge-top-right">
          ${fresh ? `<span class="badge-recency ${fresh.includes('NEW') ? 'badge-new' : ''}">${escapeHtml(fresh)}</span>` : ''}
          <span class="badge-source">${escapeHtml(p.source)}</span>
        </div>
      </div>

      <div class="card-content">
        <div class="card-price-row">
          <div class="price-main">
            ${p.price_pppw ? `£${p.price_pppw} <span class="price-unit">pppw</span>` : '<span class="price-unit">Price on enquiry</span>'}
          </div>
          ${p.price_total_month ? `<div class="price-sub">£${p.price_total_month.toLocaleString()}/mo total</div>` : ''}
        </div>

        <span class="bills-tag ${p.bills_included ? '' : 'no'}">${p.bills_included ? 'Bills included' : 'Bills not included'}</span>

        <h3 class="card-title">${escapeHtml(p.title)}</h3>

        <div class="spec-row">
          <span class="spec-item">${p.bedrooms} bed</span>
          ${p.bathrooms ? `<span class="spec-item">${p.bathrooms} bath</span>` : ''}
          <span class="spec-item">${escapeHtml(p.area || 'Cardiff')}</span>
        </div>

        <div class="avail-notice">Available from <strong>${escapeHtml(p.available_date)}</strong></div>

        <div class="card-actions">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="btn-view">
            <span>View listing</span>
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
