/**
 * Tissot PRX Powermatic 80 tracker — renders listings.json (written by scraper.py).
 */

let allOffers = [];
let activeCondition = "all";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#conditionChips .chip").forEach(chip => {
    chip.addEventListener("click", () => {
      activeCondition = chip.dataset.condition;
      document.querySelectorAll("#conditionChips .chip").forEach(c => {
        const on = c === chip;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      render();
    });
  });
  ["colourFilter", "sortBySelect", "inStockToggle"].forEach(id =>
    document.getElementById(id).addEventListener("change", render));
  load();
});

async function load() {
  try {
    const res = await fetch("./listings.json");
    if (!res.ok) throw new Error("Failed to load listings");
    const data = await res.json();
    allOffers = data.offers || [];
    fillStats(data.metadata);
    fillColours();
    render();
  } catch (err) {
    console.error(err);
    document.getElementById("resultsCount").textContent = "Couldn't load listings. Refresh to try again.";
  }
}

const money = (n) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

function fillStats(meta) {
  const best = (cond) => {
    const prices = allOffers.filter(o => o.condition === cond && o.in_stock).map(o => o.price);
    return prices.length ? money(Math.min(...prices)) : "–";
  };
  document.getElementById("valBestNew").textContent = best("New");
  document.getElementById("valBestUsed").textContent = best("Pre-owned");
  document.getElementById("valModels").textContent = new Set(allOffers.filter(o => o.source === "Tissot UK").map(o => o.ref)).size;
  document.getElementById("valTotal").textContent = allOffers.length;
  const updated = meta && meta.timestamp ? new Date(meta.timestamp.replace(" ", "T")) : null;
  if (updated && !isNaN(updated)) {
    document.getElementById("lastUpdated").textContent = updated.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
}

function fillColours() {
  const select = document.getElementById("colourFilter");
  [...new Set(allOffers.map(o => o.colour).filter(Boolean))].sort().forEach(c => {
    select.append(new Option(c, c));
  });
}

function render() {
  const colour = document.getElementById("colourFilter").value;
  const inStockOnly = document.getElementById("inStockToggle").checked;
  const sort = document.getElementById("sortBySelect").value;

  const list = allOffers.filter(o =>
    (activeCondition === "all" || o.condition === activeCondition) &&
    (colour === "all" || o.colour === colour) &&
    (!inStockOnly || o.in_stock));
  list.sort((a, b) => sort === "high" ? b.price - a.price : a.price - b.price);

  document.getElementById("resultsCount").textContent = `${list.length} ${list.length === 1 ? "listing" : "listings"}`;
  document.getElementById("emptyState").hidden = list.length > 0;
  document.getElementById("offersGrid").innerHTML = list.map((o, i) => card(o, i)).join("");
}

function card(o, i) {
  const used = o.condition !== "New";
  return `
    <article class="property-card watch-card" style="--i:${Math.min(i, 8)}">
      <div class="card-media">
        ${o.image_url
          ? `<img src="${escapeHtml(o.image_url)}" alt="${escapeHtml(o.title)}" class="card-img" loading="lazy" decoding="async">`
          : `<div class="card-img-placeholder">No photo</div>`}
        <div class="badge-top-left">
          <span class="badge-recency badge-condition ${used ? "used" : "new"}">${escapeHtml(o.condition)}</span>
        </div>
        <div class="badge-top-right">
          <span class="badge-source">${escapeHtml(o.source)}</span>
        </div>
      </div>
      <div class="card-content">
        <div class="card-price-row">
          <div class="price-main">${money(o.price)}</div>
          ${o.in_stock ? "" : `<span class="stock-out">Out of stock</span>`}
        </div>
        <h3 class="card-title">${escapeHtml(o.title)}</h3>
        <div class="spec-row">
          ${o.colour ? `<span class="spec-item">${escapeHtml(o.colour)} dial</span>` : ""}
          ${o.ref ? `<span class="spec-item">${escapeHtml(o.ref)}</span>` : ""}
        </div>
        ${o.notes ? `<div class="avail-notice">${escapeHtml(o.notes)}</div>` : ""}
        <div class="card-actions" style="grid-template-columns:1fr">
          <a href="${escapeHtml(o.url)}" target="_blank" rel="noopener noreferrer" class="btn-view">
            <span>View on ${escapeHtml(o.source)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
        </div>
      </div>
    </article>`;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
