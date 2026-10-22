/**
 * Cardiff Student 5-Bed House Hunter - Interactive Dashboard Logic
 */

let allListings = [];
let activeWalkFilter = "priority"; // default: <= 10m walk priority

document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  loadListings();
});

function initEventListeners() {
  // Search input
  const searchInput = document.getElementById("searchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");
  
  searchInput.addEventListener("input", () => {
    btnClearSearch.style.display = searchInput.value ? "block" : "none";
    filterAndRender();
  });

  btnClearSearch.addEventListener("click", () => {
    searchInput.value = "";
    btnClearSearch.style.display = "none";
    filterAndRender();
  });

  // Walk Filter Chips
  const walkChips = document.querySelectorAll("#walkFilterChips .chip");
  walkChips.forEach(chip => {
    chip.addEventListener("click", () => {
      walkChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeWalkFilter = chip.getAttribute("data-walk");
      filterAndRender();
    });
  });

  // Agency filter
  document.getElementById("agencyFilter").addEventListener("change", filterAndRender);

  // Bills toggle
  document.getElementById("billsOnlyToggle").addEventListener("change", filterAndRender);

  // Price Range
  const priceRange = document.getElementById("priceRange");
  const priceDisplay = document.getElementById("priceDisplay");
  priceRange.addEventListener("input", () => {
    const val = parseInt(priceRange.value);
    priceDisplay.textContent = val >= 220 ? "Any Price" : `£${val} pppw`;
    filterAndRender();
  });

  // Sort By
  document.getElementById("sortBySelect").addEventListener("change", filterAndRender);

  // Reset Filters
  document.getElementById("btnResetFilters").addEventListener("click", resetFilters);

  // Live Re-scrape Button
  document.getElementById("btnRefresh").addEventListener("click", triggerScrape);
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("btnClearSearch").style.display = "none";
  
  const chips = document.querySelectorAll("#walkFilterChips .chip");
  chips.forEach(c => c.classList.remove("active"));
  document.querySelector('[data-walk="all"]').classList.add("active");
  activeWalkFilter = "all";

  document.getElementById("agencyFilter").value = "all";
  document.getElementById("billsOnlyToggle").checked = false;
  
  const priceRange = document.getElementById("priceRange");
  priceRange.value = 220;
  document.getElementById("priceDisplay").textContent = "Any Price";

  document.getElementById("sortBySelect").value = "closest";
  filterAndRender();
}

function getApiBase() {
  const path = window.location.pathname;
  if (path.startsWith('/housing')) {
    return '/housing/api';
  }
  return '/api';
}

async function loadListings() {
  try {
    // Update CSV export link to local CSV file
    const exportBtn = document.getElementById("btnExportCsv");
    if (exportBtn) {
      exportBtn.href = "./cardiff_5bed_student_houses.csv";
    }

    // Try loading static JSON data (compatible with GitHub Pages & custom domains)
    let res = await fetch("./listings.json");
    if (!res.ok) {
      const apiBase = getApiBase();
      res = await fetch(`${apiBase}/listings`);
    }
    if (!res.ok) throw new Error("Failed to load listings");
    const data = await res.json();
    allListings = data.listings || [];
    updateTopStats(data.metadata, allListings);
    filterAndRender();
  } catch (err) {
    console.error("Error fetching listings:", err);
  }
}

async function triggerScrape() {
  const btn = document.getElementById("btnRefresh");
  const icon = btn.querySelector(".refresh-icon");
  const text = document.getElementById("refreshBtnText");
  const apiBase = getApiBase();
  
  btn.disabled = true;
  icon.classList.add("refresh-spinning");
  text.textContent = "Scraping Portals...";
  showToast("🔍 Running live scrapers across all 5 student housing portals...");

  try {
    const res = await fetch(`${apiBase}/scrape`, { method: "POST" });
    const data = await res.json();
    if (data.status === "success") {
      allListings = data.listings || [];
      updateTopStats(data.metadata, allListings);
      filterAndRender();
      showToast(`✅ Refresh complete! Found ${allListings.length} verified 5-bed houses.`);
    }
  } catch (err) {
    console.error("Scrape error:", err);
    showToast("⚠️ Scrape failed. Please check server logs.");
  } finally {
    btn.disabled = false;
    icon.classList.remove("refresh-spinning");
    text.textContent = "Re-Scrape Portals";
  }
}

function updateTopStats(metadata, listings) {
  const total = listings.length;
  const priority10m = listings.filter(p => p.is_priority_10min).length;
  const billsCount = listings.filter(p => p.bills_included).length;
  
  // Calculate avg price
  const priced = listings.filter(p => p.price_pppw > 0);
  const avg = priced.length ? Math.round(priced.reduce((acc, p) => acc + p.price_pppw, 0) / priced.length) : 0;

  document.getElementById("valTotal").textContent = total;
  document.getElementById("valPriority").textContent = priority10m;
  document.getElementById("valBills").textContent = billsCount;
  document.getElementById("valAvgPrice").textContent = `£${avg}`;
}

function filterAndRender() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
  const selectedAgency = document.getElementById("agencyFilter").value;
  const billsOnly = document.getElementById("billsOnlyToggle").checked;
  const maxPrice = parseInt(document.getElementById("priceRange").value);
  const sortBy = document.getElementById("sortBySelect").value;

  let filtered = allListings.filter(p => {
    // 1. Search term (street or title or source)
    if (searchTerm) {
      const hay = `${p.address} ${p.title} ${p.source} ${p.notes || ''}`.toLowerCase();
      if (!hay.includes(searchTerm)) return false;
    }

    // 2. Walk filter
    if (activeWalkFilter === "priority") {
      if (!p.is_priority_10min) return false;
    } else if (activeWalkFilter === "5m") {
      if (p.walk_minutes > 5) return false;
    }

    // 3. Agency filter
    if (selectedAgency !== "all" && p.source !== selectedAgency) {
      return false;
    }

    // 4. Bills filter
    if (billsOnly && !p.bills_included) {
      return false;
    }

    // 5. Max price
    if (maxPrice < 220 && p.price_pppw > 0 && p.price_pppw > maxPrice) {
      return false;
    }

    return true;
  });

  // Sort
  if (sortBy === "closest") {
    filtered.sort((a, b) => a.walk_minutes - b.walk_minutes);
  } else if (sortBy === "cheapest") {
    filtered.sort((a, b) => (a.price_pppw || 9999) - (b.price_pppw || 9999));
  } else if (sortBy === "newest") {
    filtered.sort((a, b) => a.recency_days - b.recency_days);
  }

  renderGrid(filtered);
}

function renderGrid(listings) {
  const grid = document.getElementById("propertiesGrid");
  const empty = document.getElementById("emptyState");
  const countHeader = document.getElementById("resultsCount");

  countHeader.textContent = `Showing ${listings.length} Available 5-Bed Houses`;

  if (listings.length === 0) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  grid.innerHTML = listings.map(p => createCardHTML(p)).join("");
}

function createCardHTML(p) {
  const is5m = p.walk_minutes <= 5;
  const is10m = p.walk_minutes > 5 && p.walk_minutes <= 10;
  const is15m = p.walk_minutes > 10 && p.walk_minutes <= 15;
  
  let walkClass = "walk-far";
  if (is5m) walkClass = "walk-5m";
  else if (is10m) walkClass = "walk-10m";
  else if (is15m) walkClass = "walk-15m";

  const isPriority = p.is_priority_10min;
  const priorityClass = isPriority ? "priority-card" : "";

  // Image or stylized placeholder
  const mediaHTML = p.image_url ? `
    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.address)}" class="card-img" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-img-placeholder\\'>🏠<span>Cardiff Student House</span></div>';">
  ` : `
    <div class="card-img-placeholder">
      🏠
      <span>${escapeHtml(p.address.split(',')[0])}</span>
    </div>
  `;

  // Encoded address for Google Maps directions to Cardiff University Students' Union
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(p.address + ', Cardiff')}&destination=Cardiff+University+Students+Union+CF10+3QN&travelmode=walking`;

  // WhatsApp share message payload
  const shareText = `🏡 Check out this 5-bed house for next year!\n📍 ${p.address}\n🚶‍♂️ Walk to Uni: ${p.walk_display}\n💷 Rent: ${p.price_formatted} ${p.bills_included ? '(Bills Included)' : ''}\n📅 Available: ${p.available_date}\n🔗 Link: ${p.url}`;

  return `
    <div class="property-card ${priorityClass}">
      <div class="card-media">
        ${mediaHTML}
        
        <div class="badge-top-left">
          <span class="badge-walk ${walkClass}">
            🚶‍♂️ ${escapeHtml(p.walk_display)} ${isPriority ? '★' : ''}
          </span>
        </div>

        <div class="badge-top-right">
          <span class="badge-recency ${p.freshness_tag.includes('NEW') ? 'badge-new' : ''}">
            ${escapeHtml(p.freshness_tag)}
          </span>
          <span class="badge-source">${escapeHtml(p.source)}</span>
        </div>
      </div>

      <div class="card-content">
        <div class="card-price-row">
          <div class="price-main">
            ${p.price_pppw ? `£${p.price_pppw} <span class="price-sub">pppw</span>` : 'Inquire for Price'}
          </div>
          ${p.price_total_month ? `<div class="price-sub">£${p.price_total_month.toLocaleString()}/mo total</div>` : ''}
        </div>

        ${p.bills_included ? `
          <div class="bills-tag">⚡ All Bills Included</div>
        ` : `
          <div class="price-sub" style="margin-bottom: 8px;">Exclusive of bills</div>
        `}

        <h3 class="card-title">${escapeHtml(p.title)}</h3>
        <p class="card-address">📍 ${escapeHtml(p.address)}</p>

        <div class="spec-row">
          <div class="spec-item">🛏️ 5 Bedrooms</div>
          <div class="spec-item">🚿 ${p.bathrooms || 2} Bathrooms</div>
          <div class="spec-item">📍 ${isPriority ? 'Cathays (Near Campus)' : 'Cardiff'}</div>
        </div>

        <div class="avail-notice">
          <span>📅 Available From: <strong>${escapeHtml(p.available_date)}</strong></span>
        </div>

        <div class="card-actions">
          <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="btn-view">
            <span>View & Book</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
          </a>
          <button class="btn-share" onclick="copyShareText(${JSON.stringify(shareText)})" title="Copy summary to WhatsApp / Group chat">
            <span>💬 Share</span>
          </button>
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-maps" title="View walking route to Cardiff Uni on Google Maps">
            🗺️
          </a>
        </div>
      </div>
    </div>
  `;
}

function copyShareText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Copied house details! Ready to paste into WhatsApp group chat.");
  }).catch(() => {
    showToast("Copied to clipboard!");
  });
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
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
