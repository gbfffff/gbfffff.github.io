
const _cfg            = window.TAKEOUT_CONFIG || {};
const APPS_SCRIPT_URL = _cfg.APPS_SCRIPT_URL  || "";
const FORM_URL        = _cfg.FORM_URL         || "";
const FORM_NAME_ENTRY = _cfg.FORM_NAME_ENTRY  || "";
const FORM_ORDER_ENTRY= _cfg.FORM_ORDER_ENTRY || "";
const SHEET_ID        = _cfg.SHEET_ID         || "";
const ORDERS_GID      = _cfg.ORDERS_GID       || "0";
const HISTORY_GID     = _cfg.HISTORY_GID      || "";
const RATINGS_GID     = _cfg.RATINGS_GID      || "";

// Local-only demo mode: when testing on localhost with no real Sheet
// configured yet, run the whole order/history/rating flow on fake
// in-memory data instead of hitting Google Sheets. Turns itself off the
// moment a real SHEET_ID is set in config.js.
const MOCK_MODE = !SHEET_ID &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1");
if (MOCK_MODE) console.warn("[mock] No SHEET_ID configured — running on fake local data.");

// Never true on the real prod domain -- lets local/QA testers fast-forward
// the countdown clock to test the soft-close overlay without waiting for
// the real deadline to pass.
const DEBUG_MODE = location.hostname !== "gbfffff.github.io";
let _debugNowOverride = null; // epoch ms, or null to use real time
function debugNow() { return _debugNowOverride ?? Date.now(); }

let currentFriday = null;
let takenItems    = {};
let allMenuItems  = [];
let selectedItems = [];
let trendingItems = new Set(); // base names of top-trending dishes

// ── Date helpers ────────────────────────────────────────────────────

// The "active" Friday stays fixed from the moment it's chosen all the way
// through the following Monday 5:59 AM Eastern Time. At Monday 6:00 AM ET
// it rolls forward to the next Friday -- new rotation restaurant, fresh
// countdown, and the order form/Worksheet become active for that new week.
// This keeps last week's Worksheet/menu/Rate-Your-Order visible over the
// weekend, right up until the Monday-morning handoff.
const RESET_DAY_OF_WEEK = 1; // Monday (0=Sun..6=Sat)
const RESET_HOUR_ET     = 6; // 6:00 AM

function getThisFriday() {
  const now = new Date(debugNow());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = t => Number(parts.find(p => p.type === t)?.value);
  const y = get("year"), mo = get("month"), da = get("day");
  const hh = get("hour") % 24; // some engines report "24" for midnight

  const todayUTC  = Date.UTC(y, mo - 1, da);
  const dayOfWeek = new Date(todayUTC).getUTCDay(); // 0=Sun..6=Sat
  let daysSinceReset = (dayOfWeek - RESET_DAY_OF_WEEK + 7) % 7;
  if (daysSinceReset === 0 && hh < RESET_HOUR_ET) daysSinceReset = 7; // reset day before 6am -> still last week's boundary

  const resetUTC     = todayUTC - daysSinceReset * 86400000;
  const activeFriUTC = resetUTC + 4 * 86400000; // Mon + 4 days = Friday
  const d = new Date(activeFriUTC);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toYMD(d) { return d.toISOString().slice(0, 10); }

function formatFriday(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });
}

// ── Rotation ─────────────────────────────────────────────────────────

function getRotationIndex(startDate, total) {
  const start = new Date(startDate + "T00:00:00");
  const weeks = Math.round((getThisFriday() - start) / (7 * 24 * 60 * 60 * 1000));
  return ((weeks % total) + total) % total;
}

// ── Load restaurant ─────────────────────────────────────────────────

function buildFridayCalendar(config) {
  const el       = document.getElementById("friday-calendar");
  const thisFri  = new Date(currentFriday + "T00:00:00");
  const year     = thisFri.getFullYear();
  const month    = thisFri.getMonth();
  const total    = config.restaurants.length;
  const startMs  = new Date(config.startDate + "T00:00:00").getTime();

  // Collect all Fridays in the current month
  const d = new Date(year, month, 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  const rows = [];
  while (d.getMonth() === month) {
    const ymd   = toYMD(d);
    const weeks = Math.round((d.getTime() - startMs) / (7 * 24 * 60 * 60 * 1000));
    const idx   = ((weeks % total) + total) % total;
    const name  = config.restaurants[idx].name;
    rows.push({ ymd, day: d.getDate(), mon: d.toLocaleDateString("en-US", { month: "short" }), name });
    d.setDate(d.getDate() + 7);
  }

  el.innerHTML = rows.map(r => {
    const cur = r.ymd === currentFriday;
    return `<div class="fcal-row${cur ? " fcal-current" : ""}">
      <span class="fcal-date">${r.mon} ${r.day}</span>
      <span class="fcal-name">${esc(r.name)}</span>
    </div>`;
  }).join("");
  el.style.display = "flex";
}

function buildRotationPanel(config) {
  const btn   = document.getElementById("rotation-toggle-btn");
  const panel = document.getElementById("rotation-panel");
  if (!btn || !panel || !config.restaurants?.length) return;

  const total    = config.restaurants.length;
  const curIdx   = getRotationIndex(config.startDate, total);

  panel.innerHTML = config.restaurants.map((r, i) => {
    const cur     = i === curIdx;
    const name    = r.name || r.ref || "?";
    const cuisine = r.cuisine ? `<span class="rotation-cuisine">${esc(r.cuisine)}</span>` : "";
    return `<div class="rotation-row${cur ? " rotation-row-current" : ""}" data-restaurant="${escAttr(name)}" title="View order history &amp; ratings for ${escAttr(name)}">
      <span class="rotation-idx">${i + 1}</span>
      <span class="rotation-name">${esc(name)}</span>
      ${cuisine}
    </div>`;
  }).join("");

  panel.onclick = e => {
    const row = e.target.closest(".rotation-row");
    if (!row) return;
    openMenuReport(row.dataset.restaurant);
  };

  btn.style.display = "flex";
  btn.onclick = () => {
    const open = !btn.classList.contains("open");
    btn.classList.toggle("open", open);
    panel.classList.toggle("open", open);
  };
}

// The next Tuesday 6:00 PM ET reset is always 4 days after the currently
// active Friday (Fri -> Sat -> Sun -> Mon -> Tue).
function renderWorksheetResetNotice(friday) {
  const el = document.getElementById("worksheet-reset-notice");
  if (!el) return;
  const nextReset = new Date(friday);
  nextReset.setDate(nextReset.getDate() + 3); // Fri -> Sat -> Sun -> Mon
  const label = nextReset.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  el.textContent = `This worksheet stays open until ${label}, 6:00 AM ET — then the menu switches to the next restaurant.`;
}

async function loadRestaurant() {
  const friday  = getThisFriday();
  currentFriday = toYMD(friday);
  renderWorksheetResetNotice(friday);
  const weekday = friday.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = friday.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();
  const year     = friday.getFullYear();
  document.getElementById("friday-date").innerHTML =
    `${weekday}<br>${monthDay}<br><span class="big-date-year">${year}</span>`;

  let restaurant = null;
  try {
    const res    = await fetch("restaurants.json?v=" + Date.now());
    const config = await res.json();
    _restaurantsConfig = config; // kept globally so any restaurant's menu
                                  // (not just the one on screen) can be
                                  // looked up, e.g. for the rotation-panel
                                  // report links.
    const weekParam = new URLSearchParams(location.search).get("week");
    const idx  = weekParam !== null
      ? ((parseInt(weekParam, 10) % config.restaurants.length) + config.restaurants.length) % config.restaurants.length
      : getRotationIndex(config.startDate, config.restaurants.length);
    const raw  = config.restaurants[idx];
    restaurant = raw.ref
      ? config.restaurants.find(r => r.name === raw.ref) || raw
      : raw;
    buildFridayCalendar(config);
    buildRotationPanel(config);
  } catch (e) {
    console.warn("Could not load restaurants.json", e);
  }

  currentRestaurantObj = restaurant;

  const nameEl = document.getElementById("restaurant-name");
  if (restaurant?.name) {
    nameEl.textContent = restaurant.name;
    const imgs = restaurant.menuImages || (restaurant.menuImage ? [restaurant.menuImage] : []);
    buildMenuPanel(restaurant.menu || [], restaurant.name, restaurant.menuUrl || "", imgs);
    buildMenu(restaurant.menu || []);
    buildTrafficMap(restaurant.name);
    buildOrderInfoStrip(restaurant);
  } else {
    nameEl.textContent = "TBD";
    buildMenuPanel([], "", "", []);
    buildMenu([]);
    buildTrafficMap("");
    buildOrderInfoStrip(null);
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildMenuPanel(items, restaurantName, menuUrl, menuImages, favSet, dislikeMap) {
  const card      = document.getElementById("menu-panel-card");
  const panel     = document.getElementById("menu-panel");
  const title     = document.getElementById("menu-panel-title");
  const shortcuts = document.getElementById("menu-panel-shortcuts");
  favSet     = favSet     || new Set();
  dislikeMap = dislikeMap || new Map();

  if (!items.length) { card.style.display = "none"; return; }

  const menuUrlBtn = menuUrl
    ? `<a href="${escAttr(menuUrl)}" target="_blank" rel="noopener" class="menu-title-btn">View Full Menu</a>`
    : "";
  title.innerHTML = `${esc(restaurantName)} — Menu ` +
    `<span class="menu-title-btns">${menuUrlBtn}<button type="button" id="menu-report-btn" class="menu-title-btn">Order History &amp; Ratings</button></span>`;

  card.style.display = "block";

  const imgs = Array.isArray(menuImages) ? menuImages.filter(Boolean) : [];
  const imgHtml = imgs.length
    ? `<div class="menu-img-strip">${imgs.map((src, i) =>
        `<div class="menu-img-thumb-wrap" onclick="openLightbox(${i})">
          <img class="menu-img-thumb" src="${escAttr(src)}" alt="${escAttr(restaurantName)} menu ${i+1}" loading="lazy" onerror="this.closest('.menu-img-thumb-wrap')?.remove()">
        </div>`
      ).join("")}</div>`
    : "";

  function mpiHtml(item) {
    const price       = item.price ? `<span class="mpi-price">$${Number(item.price).toFixed(2)}</span>` : "";
    const orHint      = item.orOptions?.length ? `<span class="mpi-protein-hint">choose 1: ${esc(item.orOptions.join(" or "))}</span>` : "";
    const proteinHint = (!item.orOptions?.length && item.protein) ? `<span class="mpi-protein-hint">+ protein</span>` : "";
    const desc        = item.desc ? `<span class="mpi-desc">${esc(item.desc)}</span>` : "";
    return `<div class="mpi" data-name="${escAttr(item.item)}">
      <span class="mpi-left"><span class="mpi-name">${esc(item.item)}${orHint || proteinHint}</span>${desc}</span>
      ${price}
    </div>`;
  }

  const favs     = items.filter(i => favSet.has(i.item.toLowerCase()));
  const dislikes = items.filter(i => dislikeMap.has(i.item.toLowerCase()));

  function dislikeMpiHtml(item) {
    const avg = dislikeMap.get(item.item.toLowerCase());
    const price = item.price ? `<span class="mpi-price">$${Number(item.price).toFixed(2)}</span>` : "";
    return `<div class="mpi" data-name="${escAttr(item.item)}">
      <span class="mpi-left"><span class="mpi-name">${esc(item.item)}</span><span class="mpi-desc">Avg rating: ${avg.toFixed(1)}/10</span></span>
      ${price}
    </div>`;
  }

  const favsSection = favs.length
    ? `<div class="mpi-popular-block" id="mpi-sec-favs">
        <div class="mpi-section-label">GBF Favs</div>
        <div class="mpi-grid">${favs.map(mpiHtml).join("")}</div>
       </div>`
    : "";
  const dislikesSection = dislikes.length
    ? `<div class="mpi-dislike-block" id="mpi-sec-dislikes">
        <div class="mpi-section-label">GBF Dislikes</div>
        <div class="mpi-grid">${dislikes.map(dislikeMpiHtml).join("")}</div>
       </div>`
    : "";

  // Group by category if any items have one, else flat list
  const hasCats = items.some(i => i.category);
  let bodyHtml = "";
  const shortcutSections = [];
  if (favs.length) shortcutSections.push({ label: "Favs", id: "mpi-sec-favs" });
  if (dislikes.length) shortcutSections.push({ label: "Dislikes", id: "mpi-sec-dislikes" });
  if (hasCats) {
    const catOrder = [];
    const catMap   = new Map();
    items.forEach(it => {
      const cat = it.category || "Other";
      if (!catMap.has(cat)) { catMap.set(cat, []); catOrder.push(cat); }
      catMap.get(cat).push(it);
    });
    const totalSections  = (favs.length ? 1 : 0) + (dislikes.length ? 1 : 0) + catOrder.length;
    const backToTopHtml  = totalSections > 1
      ? `<button type="button" class="mpi-back-to-top">&#9650; Back to Categories</button>`
      : "";
    bodyHtml = catOrder.map(cat => {
      const id = `mpi-sec-${slugify(cat)}`;
      shortcutSections.push({ label: cat, id });
      return `<div class="mpi-cat-block" id="${id}">
        <div class="mpi-section-label">${esc(cat)}</div>
        <div class="mpi-grid">${catMap.get(cat).map(mpiHtml).join("")}</div>
        ${backToTopHtml}
       </div>`;
    }).join("");
  } else {
    bodyHtml = `<div class="mpi-grid">${items.map(mpiHtml).join("")}</div>`;
  }

  panel.innerHTML = imgHtml + favsSection + dislikesSection + bodyHtml;

  shortcuts.innerHTML = shortcutSections.length > 1
    ? shortcutSections.map((s, i) =>
        `<button type="button" class="menu-shortcut-btn" style="z-index:${i + 1}" data-target="${escAttr(s.id)}">${esc(s.label)}</button>`
      ).join("")
    : "";

  shortcuts.onclick = e => {
    const btn = e.target.closest(".menu-shortcut-btn");
    if (!btn) return;
    document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  applyMenuTrendMarks();
  applyMenuTakenMarks();

  // Clicking a menu panel item adds it to the order.
  // Assigned via .onclick (not addEventListener) so re-rendering the panel
  // (e.g. when Favs/Dislikes data arrives later) doesn't stack duplicate
  // handlers that would double-add items on click.
  panel.onclick = e => {
    if (e.target.closest(".mpi-back-to-top")) {
      panel.scrollTo({ top: 0, behavior: "smooth" });
      shortcuts.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const row = e.target.closest(".mpi");
    if (!row) return;
    addItem(row.dataset.name);
    // don't steal focus if a protein/or-options prompt is about to appear
    const meta = allMenuItems.find(m => m.item === row.dataset.name);
    if (!meta?.protein && !meta?.orOptions?.length) document.getElementById("order-name")?.focus();
  };

  document.getElementById("menu-report-btn")?.addEventListener("click", () => {
    openMenuReport(restaurantName);
  });
}

// ── Menu search + dropdown ────────────────────────────────────────────

function buildMenu(items) {
  allMenuItems  = items;
  selectedItems = [];
  const section = document.getElementById("menu-section");

  if (!items.length) {
    section.innerHTML = `
      <label class="field-label">Order</label>
      <textarea id="order-freetext" placeholder="What would you like?"></textarea>`;
    return;
  }

  section.innerHTML = `
    <label class="field-label">Menu</label>
    <div class="menu-search-wrap">
      <input type="text" id="menu-search" placeholder="Search dishes…" autocomplete="off" />
      <div class="menu-dropdown" id="menu-dropdown"></div>
    </div>
    <div class="selected-pills" id="selected-pills"></div>
    <div id="protein-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <span style="color:var(--text-muted)">Protein for <strong id="protein-prompt-item"></strong>:</span>
      <div style="display:flex;gap:0.5rem;margin-top:0.4rem;align-items:center">
        <input type="text" id="protein-input" placeholder="e.g. Chicken, Beef, Al Pastor, Veggie…" style="flex:1;min-width:0;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit" />
        <button type="button" id="protein-add-btn" class="protein-btn protein-btn-add">Add</button>
        <button type="button" id="protein-skip-btn" class="protein-btn">Skip</button>
      </div>
    </div>
    <div id="combo-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Adding: <strong id="combo-prompt-item"></strong></div>
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
        <input type="checkbox" id="combo-checkbox" style="accent-color:var(--gold);width:15px;height:15px" />
        Make it a combo &nbsp;<span id="combo-price-label" style="color:var(--gold);font-weight:700"></span>
      </label>
      <div id="combo-side-wrap" style="display:none;margin-top:0.5rem;flex-direction:column;gap:0.4rem">
        <div style="font-size:0.75rem;color:var(--text-muted)">Side choice</div>
        <select id="combo-side-select" style="width:100%;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit"></select>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Drink (included) — type your choice</div>
        <input type="text" id="combo-drink-input" placeholder="e.g. Coke, Sprite, water…" style="width:100%;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit;box-sizing:border-box" />
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem">
        <button type="button" id="combo-add-btn" class="protein-btn protein-btn-add">Add to Order</button>
        <button type="button" id="combo-skip-btn" class="protein-btn">Cancel</button>
      </div>
    </div>
    <div id="extras-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Add protein to <strong id="extras-prompt-item"></strong>? <span style="font-size:0.72rem;opacity:0.7">(optional)</span></div>
      <div id="extras-options" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem"></div>
      <div style="display:flex;gap:0.5rem">
        <button type="button" id="extras-skip-btn" class="protein-btn">No thanks, just the salad</button>
      </div>
    </div>
    <div id="or-options-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose one for <strong id="or-options-prompt-item"></strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
      <div id="or-options-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.6rem"></div>
      <div style="display:flex;gap:0.5rem">
        <button type="button" id="or-options-add-btn" class="protein-btn protein-btn-add" disabled>Add to Order</button>
      </div>
    </div>`;

  const input    = document.getElementById("menu-search");
  const dropdown = document.getElementById("menu-dropdown");
  let focusedIdx = -1;

  function renderDropdown(q) {
    const matches = q
      ? allMenuItems.filter(m => m.item.toLowerCase().includes(q.toLowerCase()))
      : allMenuItems;

    if (!matches.length) { dropdown.style.display = "none"; return; }

    focusedIdx = -1;
    dropdown.innerHTML = matches.map(m => {
      const takers  = takenItems[m.item.toLowerCase()] || [];
      const taken   = selectedItems.includes(m.item);
      const price   = m.price ? `<span class="dd-price">$${Number(m.price).toFixed(2)}</span>` : "";
      const takenLbl = takers.length ? `<span class="dd-taken">${takers.join(", ")}</span>` : "";
      const proteinLbl  = m.protein ? `<span class="dd-protein">+ protein</span>` : "";
      const popularStar = m.popular ? `<span class="dd-popular">★</span>` : "";
      return `<div class="menu-dropdown-item${taken ? " is-selected" : ""}" data-name="${escAttr(m.item)}">
        <span class="dd-name">${popularStar}${esc(m.item)}${proteinLbl}</span>
        <span class="dd-right">${takenLbl}${price}</span>
      </div>`;
    }).join("");

    dropdown.style.display = "block";

    dropdown.querySelectorAll(".menu-dropdown-item:not(.is-selected)").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        addItem(el.dataset.name);
        input.value = "";
        dropdown.style.display = "none";
      });
    });
  }

  function moveFocus(dir) {
    const items = [...dropdown.querySelectorAll(".menu-dropdown-item:not(.is-selected)")];
    if (!items.length) return;
    items[focusedIdx]?.classList.remove("focused");
    focusedIdx = Math.max(0, Math.min(items.length - 1, focusedIdx + dir));
    items[focusedIdx].classList.add("focused");
    items[focusedIdx].scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus",   () => renderDropdown(input.value.trim()));
  input.addEventListener("click",   () => renderDropdown(input.value.trim()));
  input.addEventListener("input",   () => renderDropdown(input.value.trim()));
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown")  { e.preventDefault(); moveFocus(1); }
    if (e.key === "ArrowUp")    { e.preventDefault(); moveFocus(-1); }
    if (e.key === "Escape")     { dropdown.style.display = "none"; }
    if (e.key === "Enter") {
      e.preventDefault();
      const focused = dropdown.querySelector(".menu-dropdown-item.focused");
      if (focused) {
        addItem(focused.dataset.name);
      } else if (input.value.trim()) {
        addItem(input.value.trim());
      }
      input.value = "";
      dropdown.style.display = "none";
    }
  });
  input.addEventListener("blur", () => setTimeout(() => { dropdown.style.display = "none"; }, 150));
}

function addItem(name) {
  const meta = allMenuItems.find(m => m.item === name);
  if (meta && meta.orOptions && meta.orOptions.length) {
    showOrOptionsPrompt(name, meta);
    return;
  }
  if (meta && meta.combo) {
    showComboPrompt(name, meta);
    return;
  }
  if (meta && meta.extras && meta.extras.length) {
    showExtrasPrompt(name, meta);
    return;
  }
  if (meta && meta.protein) {
    showProteinPrompt(name);
    return;
  }
  if (!selectedItems.includes(name)) {
    selectedItems.push(name);
    renderPills();
    checkDuplicates();
  }
}

function showExtrasPrompt(baseName, meta) {
  const prompt    = document.getElementById("extras-prompt");
  const label     = document.getElementById("extras-prompt-item");
  const optionsEl = document.getElementById("extras-options");
  const skipBtn   = document.getElementById("extras-skip-btn");
  if (!prompt) return;

  label.textContent = baseName;

  optionsEl.innerHTML = meta.extras.map(e =>
    `<button type="button" class="protein-btn extras-option-btn" data-extra="${escAttr(e.name)}" data-price="${e.price}">
      ${esc(e.name)} <span style="color:var(--gold);margin-left:0.25rem">+$${Number(e.price).toFixed(2)}</span>
    </button>`
  ).join("");

  prompt.style.display = "block";

  function commit(finalName) {
    prompt.style.display = "none";
    if (!selectedItems.includes(finalName)) {
      selectedItems.push(finalName);
      renderPills();
      checkDuplicates();
    }
    cleanup();
  }
  function onOption(e) {
    const btn = e.target.closest(".extras-option-btn");
    if (!btn) return;
    commit(`${baseName} + ${btn.dataset.extra}`);
  }
  function onSkip() { commit(baseName); }
  function cleanup() {
    optionsEl.removeEventListener("click", onOption);
    skipBtn.removeEventListener("click", onSkip);
  }
  optionsEl.addEventListener("click", onOption);
  skipBtn.addEventListener("click", onSkip);
}

function showComboPrompt(baseName, meta) {
  const prompt      = document.getElementById("combo-prompt");
  const label       = document.getElementById("combo-prompt-item");
  const checkbox    = document.getElementById("combo-checkbox");
  const priceEl     = document.getElementById("combo-price-label");
  const sideWrap    = document.getElementById("combo-side-wrap");
  const sideSelect  = document.getElementById("combo-side-select");
  const drinkInput  = document.getElementById("combo-drink-input");
  const addBtn      = document.getElementById("combo-add-btn");
  const skipBtn     = document.getElementById("combo-skip-btn");
  if (!prompt) return;

  label.textContent       = baseName;
  priceEl.textContent     = `(+$${Number(meta.comboPrice).toFixed(2)})`;
  checkbox.checked        = false;
  sideWrap.style.display  = "none";
  drinkInput.value        = "";
  sideSelect.innerHTML    = (meta.comboSides || []).map(s => `<option>${s}</option>`).join("");
  prompt.style.display    = "block";

  function onCheck() {
    sideWrap.style.display = checkbox.checked ? "flex" : "none";
  }
  function commit() {
    prompt.style.display = "none";
    let finalName = baseName;
    if (checkbox.checked) {
      const drink = drinkInput.value.trim();
      finalName = drink
        ? `${baseName} + Combo (${sideSelect.value}, ${drink})`
        : `${baseName} + Combo (${sideSelect.value})`;
    }
    if (!selectedItems.includes(finalName)) {
      selectedItems.push(finalName);
      renderPills();
      checkDuplicates();
    }
    cleanup();
  }
  function cancel() { prompt.style.display = "none"; cleanup(); }
  function cleanup() {
    checkbox.removeEventListener("change", onCheck);
    addBtn.removeEventListener("click", commit);
    skipBtn.removeEventListener("click", cancel);
  }
  checkbox.addEventListener("change", onCheck);
  addBtn.addEventListener("click", commit);
  skipBtn.addEventListener("click", cancel);
}

function showProteinPrompt(baseName) {
  const prompt   = document.getElementById("protein-prompt");
  const label    = document.getElementById("protein-prompt-item");
  const input    = document.getElementById("protein-input");
  const addBtn   = document.getElementById("protein-add-btn");
  const skipBtn  = document.getElementById("protein-skip-btn");
  if (!prompt) return;

  label.textContent = baseName;
  input.value = "";
  prompt.style.display = "block";
  input.focus();

  function commit() {
    const protein = input.value.trim();
    const finalName = protein ? `${baseName} (${protein})` : baseName;
    prompt.style.display = "none";
    if (!selectedItems.includes(finalName)) {
      selectedItems.push(finalName);
      renderPills();
      checkDuplicates();
    }
    // clean up listeners
    addBtn.removeEventListener("click", onAdd);
    skipBtn.removeEventListener("click", onSkip);
    input.removeEventListener("keydown", onKey);
  }

  function onAdd()  { commit(); }
  function onSkip() { input.value = ""; commit(); }
  function onKey(e) { if (e.key === "Enter") { e.preventDefault(); commit(); } }

  addBtn.addEventListener("click",  onAdd);
  skipBtn.addEventListener("click", onSkip);
  input.addEventListener("keydown", onKey);
}

function showOrOptionsPrompt(baseName, meta) {
  const prompt = document.getElementById("or-options-prompt");
  const label  = document.getElementById("or-options-prompt-item");
  const listEl = document.getElementById("or-options-list");
  const addBtn = document.getElementById("or-options-add-btn");
  if (!prompt) return;

  label.textContent = baseName;
  listEl.innerHTML = meta.orOptions.map(opt =>
    `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
      <input type="checkbox" class="or-option-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
      ${esc(opt)}
    </label>`
  ).join("");
  addBtn.disabled = true;
  prompt.style.display = "block";

  const boxes = [...listEl.querySelectorAll(".or-option-checkbox")];

  function onChange(e) {
    const box = e.target.closest(".or-option-checkbox");
    if (!box) return;
    if (box.checked) boxes.forEach(b => { if (b !== box) b.checked = false; });
    addBtn.disabled = !boxes.some(b => b.checked);
  }

  function commit() {
    const chosen = boxes.find(b => b.checked);
    if (!chosen) return;
    const finalName = `${baseName} (${chosen.dataset.option})`;
    prompt.style.display = "none";
    if (!selectedItems.includes(finalName)) {
      selectedItems.push(finalName);
      renderPills();
      checkDuplicates();
    }
    cleanup();
  }
  function cleanup() {
    listEl.removeEventListener("change", onChange);
    addBtn.removeEventListener("click", commit);
  }
  listEl.addEventListener("change", onChange);
  addBtn.addEventListener("click", commit);
}

function renderPills() {
  const container = document.getElementById("selected-pills");
  if (!container) return;

  container.innerHTML = selectedItems.map((item, i) => {
    const taken = (takenItems[item.toLowerCase()] || []).length > 0;
    return `<span class="selected-pill${taken ? " is-taken" : ""}">
      ${esc(item)}
      <button type="button" class="pill-remove" data-idx="${i}">&times;</button>
    </span>`;
  }).join("");

  container.querySelectorAll(".pill-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedItems.splice(Number(btn.dataset.idx), 1);
      renderPills();
      checkDuplicates();
    });
  });
}

function updateMenuIndicators() {
  renderPills();
  applyMenuTakenMarks();
  // Refresh dropdown results if open so taken labels update live
  const input = document.getElementById("menu-search");
  if (input?.value.trim()) input.dispatchEvent(new Event("input"));
}

function applyMenuTakenMarks() {
  document.querySelectorAll(".mpi").forEach(el => {
    const key    = (el.dataset.name || "").toLowerCase();
    // Exact match, or a takenItems key that is a prefix of this menu item name
    // (handles menu items whose names contain commas, e.g. "Basil Chicken, Thai Style")
    let takers = takenItems[key];
    if (!takers) {
      const matchKey = Object.keys(takenItems).find(k => key.startsWith(k) || k.startsWith(key));
      takers = matchKey ? takenItems[matchKey] : [];
    }
    let badge = el.querySelector(".mpi-taken-badge");
    if (takers.length) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "mpi-taken-badge";
        el.querySelector(".mpi-left")?.appendChild(badge);
      }
      badge.textContent = "Ordered by " + takers.join(", ");
      el.classList.add("mpi-is-taken");
    } else {
      badge?.remove();
      el.classList.remove("mpi-is-taken");
    }
  });
}

function checkDuplicates() {
  const dups = selectedItems
    .map(item => ({ item, takers: takenItems[item.toLowerCase()] || [] }))
    .filter(d => d.takers.length > 0);

  const warningEl = document.getElementById("dup-warning");
  const textEl    = document.getElementById("dup-warning-text");

  if (!dups.length) { warningEl.classList.remove("show"); return; }

  textEl.textContent = dups
    .map(d => `${d.item} already ordered by ${d.takers.join(" & ")}`)
    .join(". ") + ". You can still submit.";
  warningEl.classList.add("show");
}

function buildTrafficMap() {}

function buildOrderInfoStrip(r) {
  const strip = document.getElementById("order-info-strip");
  if (!strip) return;
  if (!r) { strip.style.display = "none"; strip.innerHTML = ""; return; }

  const links = [];

  if (r.name) {
    links.push(`<span class="oi-name">${esc(r.name)}</span>`);
  }

  if (r.phone) {
    links.push(`<a class="oi-link oi-phone" href="tel:${r.phone.replace(/\D/g,'')}">&#9743; ${r.phone}</a>`);
  }

  if (r.orderUrl) {
    links.push(`<a class="oi-link" href="${escAttr(r.orderUrl)}" target="_blank" rel="noopener">Order Online</a>`);
  }

  const mapsHref = r.mapUrl
    || (r.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " restaurant")}`);
  links.push(`<a class="oi-link" href="${escAttr(mapsHref)}" target="_blank" rel="noopener">Google Maps</a>`);

  if (!links.length) { strip.style.display = "none"; return; }
  strip.innerHTML = links.join("");
  strip.style.display = "flex";
}

// ── Submit order ──────────────────────────────────────────────────────

document.getElementById("order-form").addEventListener("submit", async e => {
  e.preventDefault();
  const btn  = document.getElementById("order-btn");
  const name = document.getElementById("order-name").value.trim();
  const notes = document.getElementById("order-notes").value.trim();

  let items = "";
  const freetext = document.getElementById("order-freetext");
  if (freetext) {
    items = freetext.value.trim();
    const dupTakers = takenItems[items.toLowerCase()] || [];
    if (dupTakers.length) {
      const ok = confirm(`"${items}" was already ordered by ${dupTakers.join(" & ")}.\n\nSubmit anyway?`);
      if (!ok) return;
    }
  } else {
    // flush any text left in the search box that wasn't explicitly added
    const searchInput = document.getElementById("menu-search");
    if (searchInput?.value.trim()) addItem(searchInput.value.trim());
    items = selectedItems.join(", ");
  }

  if (!name || !items) { alert("Please enter your name and at least one item."); return; }

  console.log("[order] name:", name, "| items:", items, "| date:", currentFriday);
  console.log("[order] APPS_SCRIPT_URL:", APPS_SCRIPT_URL || "(empty!)");

  btn.disabled    = true;
  btn.textContent = "Submitting…";

  try {
    await post({ type: "order", date: currentFriday, name, items, notes });
    console.log("[order] success");
    if (DEBUG_MODE && _debugNowOverride) {
      _debugLateOverrides.set(name.toLowerCase(), _debugNowOverride);
    }
    localStorage.setItem("lastOrderName",  name);
    localStorage.setItem("lastOrderItems", items);
    localStorage.setItem("lastOrderDate",  currentFriday);
    showOrderSuccess(name, items);
    setTimeout(loadData, 4000);
  } catch (err) {
    console.error("[order] failed:", err);
    btn.disabled    = false;
    btn.textContent = "Submit Order";
    alert("Submission failed — check your Apps Script URL in config.js.");
  }
});

document.getElementById("edit-order-btn").addEventListener("click", () => {
  const savedName  = localStorage.getItem("lastOrderName")  || "";
  const savedItems = (localStorage.getItem("lastOrderItems") || "").split(",").map(s => s.trim()).filter(Boolean);
  document.getElementById("order-form").style.display    = "block";
  document.getElementById("order-success").style.display = "none";
  document.getElementById("order-name").value = savedName;
  selectedItems = savedItems;
  renderPills();
  checkDuplicates();
  document.getElementById("order-btn").textContent = "Update Order";
  document.getElementById("order-btn").disabled    = false;
});

function confirmModal(message, opts = {}) {
  const { okLabel = "Delete", okColor = "var(--red)" } = opts;
  return new Promise(resolve => {
    const modal  = document.getElementById("confirm-modal");
    const msg    = document.getElementById("confirm-modal-msg");
    const okBtn  = document.getElementById("confirm-modal-ok");
    const cancel = document.getElementById("confirm-modal-cancel");
    msg.textContent = message;
    okBtn.textContent = okLabel;
    okBtn.style.background   = okColor;
    okBtn.style.borderColor  = okColor;
    modal.style.display = "flex";
    function close(result) {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk()     { close(true);  }
    function onCancel() { close(false); }
    okBtn.addEventListener("click",  onOk);
    cancel.addEventListener("click", onCancel);
  });
}

function showOrderSuccess(name, itemsStr) {
  document.getElementById("order-form").style.display    = "none";
  document.getElementById("order-success").style.display = "block";
  const itemsEl = document.getElementById("order-success-items");
  if (itemsEl && itemsStr) {
    const list = itemsStr.split(",").map(s => s.trim()).filter(Boolean);
    itemsEl.innerHTML = `<strong>${esc(name)}</strong>: ${list.map(esc).join(", ")}`;
  }
}


async function post(payload) {
  if (!FORM_URL) throw new Error("FORM_URL not configured in config.js");
  const orderText = payload.notes
    ? `${payload.items} | Notes: ${payload.notes}`
    : payload.items;
  const body = new URLSearchParams({
    [FORM_NAME_ENTRY]:  payload.name,
    [FORM_ORDER_ENTRY]: orderText,
  });
  console.log("[post/form] submitting:", body.toString());
  await fetch(FORM_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  console.log("[post/form] sent");
}

// ── Load data ─────────────────────────────────────────────────────────

async function loadData() {
  await loadOrders();
  await Promise.all([loadTrending(), loadHistory(), loadRatings()]);
  document.getElementById("last-updated").textContent =
    `Updated ${new Date().toLocaleTimeString()}`;
}

// ── Rate Your Order ─────────────────────────────────────────────────────
// Shown once this week's order has been logged via "Order Complete" --
// checked by reading the History sheet back (so it's visible to every
// visitor, not just the admin who clicked the button).

let weekComplete   = false;
// QA-only: lets a tester force the page to behave as if this week were NOT
// finalized yet, even though a real History row exists -- so the freeze
// (order form/edit-delete lock) can be re-tested without deleting real
// sheet data. Never true on prod (gated by DEBUG_MODE).
let _debugForceReopen = false;
function isWeekEffectivelyComplete() {
  return weekComplete && !(DEBUG_MODE && _debugForceReopen);
}
let _historyRows   = [];  // all-time, all restaurants -- Timestamp, Date, Restaurant, Item, Qty, Names
let _ratingRows    = [];  // this week only -- Timestamp, Date, Restaurant, Item, Name, Rating
let _allRatingRows = [];  // all-time, all restaurants
const _ratingTouched = new Set(); // item keys the user has actually moved the slider on

// ── Mock/demo data (MOCK_MODE only) ─────────────────────────────────────

function mockOrdersCSV() {
  const now   = new Date().toISOString();
  const items = allMenuItems.slice(0, 4).map(m => m.item);
  const a = items[0] || "Sample Dish A";
  const b = items[1] || "Sample Dish B";
  const c = items[2] || "Sample Dish C";
  const rows = [
    ["Timestamp", "Name", "Order"],
    [now, "Alice", `${a}, ${b}`],
    [now, "Bob",   `${a}`],
    [now, "Cyn",   `${b} | Notes: extra spicy`],
    [now, "Dana",  `${c}`],
  ];
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// In-memory stand-ins for the History/Ratings sheets, since MOCK_MODE has
// no real Apps Script backend to write to.
let _mockHistory = [];
let _mockRatings = [];

// Once this week's order has been logged (via "Order Complete"), lock the
// order form and the Worksheet's edit/delete controls -- from that point
// the week is final and only viewing/rating should remain possible.
function applyOrderFreezeState() {
  const complete = isWeekEffectivelyComplete();
  const frozen = document.getElementById("frozen-overlay");
  if (frozen) frozen.style.display = complete ? "flex" : "none";

  // The finalized state takes priority over the deadline-closed overlay.
  const closedOverlay = document.getElementById("closed-overlay");
  if (complete && closedOverlay) closedOverlay.style.display = "none";

  const completeBtn = document.getElementById("order-complete-btn");
  if (completeBtn && !completeBtn.dataset.busy) {
    completeBtn.disabled    = complete;
    completeBtn.textContent = complete ? "Order Logged" : "Order Complete";
  }

  if (_lastOrderRows.length) renderOrdersTable();
}

async function loadHistory() {
  if (MOCK_MODE) {
    _historyRows = _mockHistory;
    weekComplete = _mockHistory.some(r => r[1] === currentFriday);
    renderRatingCard();
    refreshMenuInsights();
    applyOrderFreezeState();
    return;
  }
  if (!HISTORY_GID) { weekComplete = false; renderRatingCard(); applyOrderFreezeState(); return; }
  try {
    const csv  = await fetchCSV(HISTORY_GID);
    const rows = parseCSV(csv).slice(1); // Timestamp, Date, Restaurant, Item, Qty, Names
    _historyRows = rows;
    weekComplete = rows.some(r => (r[1] || "").trim() === currentFriday);
  } catch {
    weekComplete = false;
  }
  renderRatingCard();
  refreshMenuInsights();
  applyOrderFreezeState();
}

async function loadRatings() {
  if (MOCK_MODE) {
    _allRatingRows = _mockRatings;
    _ratingRows    = _mockRatings.filter(r => r[1] === currentFriday);
    renderRatingCard();
    refreshMenuInsights();
    return;
  }
  if (!RATINGS_GID) { _ratingRows = []; _allRatingRows = []; renderRatingCard(); return; }
  try {
    const csv  = await fetchCSV(RATINGS_GID);
    const rows = parseCSV(csv).slice(1); // Timestamp, Date, Restaurant, Item, Name, Rating
    _allRatingRows = rows;
    _ratingRows    = rows.filter(r => (r[1] || "").trim() === currentFriday);
  } catch {
    _ratingRows = [];
    _allRatingRows = [];
  }
  renderRatingCard();
  refreshMenuInsights();
}

// ── Menu insights (GBF Favs / GBF Dislikes / report lightbox) ───────────
// Aggregated from all-time History + Ratings data for whichever restaurant
// is currently on screen -- a Fav is anything ordered more than twice
// total (by anyone, ever); a Dislike is anything averaging below 3.

function computeItemStats(restaurantName) {
  const stats = new Map(); // key: lowercase item -> { label, qty, weeksOrdered, ratingSum, ratingCount }
  const name  = (restaurantName || "").trim().toLowerCase();
  if (!name) return stats;

  function entryFor(label) {
    const key = label.toLowerCase();
    if (!stats.has(key)) stats.set(key, { label, qty: 0, weeksOrdered: new Set(), ratingSum: 0, ratingCount: 0 });
    return stats.get(key);
  }

  // One History row = one restaurant+item+week (already aggregated across
  // everyone who ordered it that week by "Order Complete"). A Fav needs the
  // item ordered in more than two *separate* weeks -- multiple people
  // ordering it the same week only counts once toward that.
  _historyRows.forEach(r => {
    if ((r[2] || "").trim().toLowerCase() !== name) return;
    const item = (r[3] || "").trim();
    if (!item) return;
    const e = entryFor(item);
    e.qty += Number(r[4]) || 0;
    const week = (r[1] || "").trim();
    if (week) e.weeksOrdered.add(week);
  });

  _allRatingRows.forEach(r => {
    if ((r[2] || "").trim().toLowerCase() !== name) return;
    const item   = (r[3] || "").trim();
    const rating = Number(r[5]);
    if (!item || isNaN(rating)) return;
    const e = entryFor(item);
    e.ratingSum   += rating;
    e.ratingCount += 1;
  });

  return stats;
}

let currentRestaurantObj = null;
let _restaurantsConfig   = null;

// Resolves a restaurant by name from the full config (not just whichever
// one is currently on screen), following "ref" aliases the same way
// loadRestaurant() does for the active week's pick.
function findRestaurantByName(name) {
  if (!_restaurantsConfig?.restaurants) return null;
  const key = (name || "").trim().toLowerCase();
  const raw = _restaurantsConfig.restaurants.find(r => (r.name || "").trim().toLowerCase() === key);
  if (!raw) return null;
  return raw.ref
    ? _restaurantsConfig.restaurants.find(r => r.name === raw.ref) || raw
    : raw;
}

function refreshMenuInsights() {
  if (!currentRestaurantObj?.name) return;
  const stats    = computeItemStats(currentRestaurantObj.name);
  const favSet   = new Set();
  const dislikeMap = new Map();
  stats.forEach((s, key) => {
    if (s.weeksOrdered.size > 2) favSet.add(key);
    if (s.ratingCount > 0 && (s.ratingSum / s.ratingCount) < 3) dislikeMap.set(key, s.ratingSum / s.ratingCount);
  });
  const imgs = currentRestaurantObj.menuImages ||
    (currentRestaurantObj.menuImage ? [currentRestaurantObj.menuImage] : []);
  buildMenuPanel(currentRestaurantObj.menu || [], currentRestaurantObj.name, currentRestaurantObj.menuUrl || "", imgs, favSet, dislikeMap);
}

function alreadyRated(name, item) {
  return _ratingRows.some(r =>
    (r[3] || "").trim().toLowerCase() === item.toLowerCase() &&
    (r[4] || "").trim().toLowerCase() === name.toLowerCase()
  );
}

function renderRatingCard() {
  const card = document.getElementById("rating-card");
  if (!card) return;

  if (!isWeekEffectivelyComplete() || !_lastOrderRows.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const nameSelect = document.getElementById("rating-name-select");
  const prevName   = nameSelect.value;
  const names = [...new Set(_lastOrderRows.map(r => (r[1] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  nameSelect.innerHTML = `<option value="">Select your name…</option>` +
    names.map(n => `<option value="${escAttr(n)}">${esc(n)}</option>`).join("");
  if (names.includes(prevName)) nameSelect.value = prevName;

  renderRatingItems();
}

function renderRatingItems() {
  const listEl     = document.getElementById("rating-items-list");
  const nameSelect = document.getElementById("rating-name-select");
  const name       = nameSelect.value;

  if (!name) {
    listEl.innerHTML = `<div class="placeholder">Select your name to rate the items you had.</div>`;
    return;
  }

  const items = new Map();
  _lastOrderRows
    .filter(r => (r[1] || "").trim().toLowerCase() === name.toLowerCase())
    .forEach(r => {
      smartSplit(r[2] ?? "").forEach(item => {
        const key = item.toLowerCase();
        if (!items.has(key)) items.set(key, item);
      });
    });
  const sortedItems = [...items.values()].sort((a, b) => a.localeCompare(b));

  if (!sortedItems.length) {
    listEl.innerHTML = `<div class="placeholder">No items found for this name.</div>`;
    return;
  }

  listEl.innerHTML = sortedItems.map(item => {
    const key  = item.toLowerCase();
    const done = alreadyRated(name, item);
    if (done) {
      return `<div class="rating-item-row">
        <span class="rating-item-name">${esc(item)}</span>
        <span class="rating-item-done">&#10003; Rated</span>
      </div>`;
    }
    return `<div class="rating-item-row" data-item="${escAttr(item)}">
      <span class="rating-item-name">${esc(item)}</span>
      <div class="rating-item-input-wrap">
        <input type="range" class="rating-item-slider" min="1" max="10" step="1" value="5" data-key="${escAttr(key)}">
        <span class="rating-item-value">&mdash;</span>
      </div>
    </div>`;
  }).join("");

  listEl.querySelectorAll(".rating-item-slider").forEach(slider => {
    slider.addEventListener("input", () => {
      _ratingTouched.add(slider.dataset.key);
      slider.nextElementSibling.textContent = slider.value;
    });
  });
}

document.getElementById("rating-name-select")?.addEventListener("change", () => {
  _ratingTouched.clear();
  renderRatingItems();
});

document.getElementById("rating-submit-btn")?.addEventListener("click", async () => {
  const nameSelect = document.getElementById("rating-name-select");
  const name = nameSelect.value;
  const status = document.getElementById("rating-status");
  status.style.display = "none";

  if (!name) {
    status.style.display = "block";
    status.textContent = "Select your name first.";
    return;
  }

  const rows = [...document.querySelectorAll(".rating-item-row[data-item]")];
  const toSubmit = rows
    .map(row => ({ item: row.dataset.item, slider: row.querySelector(".rating-item-slider") }))
    .filter(r => _ratingTouched.has(r.slider.dataset.key));

  if (!toSubmit.length) {
    status.style.display = "block";
    status.textContent = "Move a slider for at least one item first.";
    return;
  }

  const btn = document.getElementById("rating-submit-btn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  const restaurant = document.getElementById("restaurant-name")?.textContent || "";
  try {
    if (MOCK_MODE) {
      const now = new Date().toISOString();
      toSubmit.forEach(r => _mockRatings.push([now, currentFriday, restaurant, r.item, name, r.slider.value]));
    } else {
      if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
      await Promise.all(toSubmit.map(r => {
        const params = new URLSearchParams({
          type: "rating",
          date: currentFriday,
          restaurant,
          item: r.item,
          name,
          rating: r.slider.value,
        });
        return fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
      }));
    }
    _ratingTouched.clear();
    status.style.display = "block";
    status.textContent = `Submitted ${toSubmit.length} rating${toSubmit.length === 1 ? "" : "s"}. Thank you!`;
    setTimeout(loadRatings, 300);
  } catch (err) {
    status.style.display = "block";
    status.textContent = "Could not submit — " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Ratings";
  }
});

function findMenuItem(name, menu) {
  menu = menu || allMenuItems;
  // Exact match first
  let m = menu.find(i => i.item === name);
  if (m) return m;
  // Case-insensitive
  const lower = name.toLowerCase();
  m = menu.find(i => i.item.toLowerCase() === lower);
  if (m) return m;
  // Menu item name starts with the order name (handles trailing Chinese chars added later)
  m = menu.find(i => i.item.toLowerCase().startsWith(lower));
  if (m) return m;
  // Order name starts with the menu item name
  m = menu.find(i => lower.startsWith(i.item.toLowerCase()));
  return m || null;
}

function smartSplit(orderText) {
  const clean = orderText.replace(/ \| Notes:.*$/, "");
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of clean) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter(Boolean);
}

function calcOrderTotal(orderText) {
  const parts = smartSplit(orderText);

  let total = 0;
  parts.filter(Boolean).forEach(part => {
    const plusIdx = part.indexOf(" + ");
    const baseName = plusIdx >= 0 ? part.slice(0, plusIdx).trim() : part.trim();
    const suffix   = plusIdx >= 0 ? part.slice(plusIdx + 3).trim() : "";
    const meta = findMenuItem(baseName);
    if (!meta) return;
    total += Number(meta.price) || 0;
    if (suffix.startsWith("Combo") && meta.comboPrice) {
      total += Number(meta.comboPrice);
    } else if (suffix && meta.extras?.length) {
      const ex = meta.extras.find(e => e.name === suffix);
      if (ex) total += Number(ex.price) || 0;
    }
  });
  return total;
}

let _lastOrderRows  = [];
let _prevOrderCount = null;
let _titleFlashTimer = null;
const _originalTitle = document.title;

function showOrderToast(message) {
  const toast = document.createElement("div");
  toast.className = "order-toast";
  toast.innerHTML = `<span class="order-toast-text"></span>`;
  toast.querySelector(".order-toast-text").textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function notifyNewOrder(count) {
  showOrderToast(count === 1 ? "New order added" : `${count} new orders added`);
  if (document.hidden) {
    if (_titleFlashTimer) clearInterval(_titleFlashTimer);
    let flip = false;
    _titleFlashTimer = setInterval(() => {
      document.title = flip ? _originalTitle : "NEW ORDER!";
      flip = !flip;
    }, 1000);
  }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && _titleFlashTimer) {
    clearInterval(_titleFlashTimer);
    _titleFlashTimer = null;
    document.title = _originalTitle;
  }
});

async function loadOrders() {
  const container = document.getElementById("orders-container");
  const countEl   = document.getElementById("order-count");

  try {
    const csv  = MOCK_MODE ? mockOrdersCSV() : await fetchCSV(ORDERS_GID);
    // Form response columns: [0] Timestamp, [1] Name, [2] Order
    // Orders can be submitted any day of the week, so we match by week window:
    // Saturday before this Friday through this Friday (inclusive)
    const friday    = new Date(currentFriday + "T23:59:59");
    const saturday  = new Date(friday);
    saturday.setDate(saturday.getDate() - 6);
    saturday.setHours(0, 0, 0, 0);
    const allRows = parseCSV(csv).slice(1).filter(r => {
      if (!r[1]) return false;
      const ts = r[0] ? new Date(r[0]) : null;
      return ts && ts >= saturday && ts <= friday;
    });
    // Keep only the latest submission per person (for edits)
    const latest = new Map();
    allRows.forEach(r => latest.set(r[1].trim().toLowerCase(), r));
    const rows = [...latest.values()].filter(r => (r[2] ?? "").trim() !== "__deleted__");

    takenItems = {};
    rows.forEach(r => {
      const name  = (r[1] ?? "").trim();
      // Split on commas that are NOT inside parentheses (handles "Gyro + Combo (Fries, Sprite)")
      const orderText = (r[2] ?? "").replace(/ \| Notes:.*$/, ""); // strip notes suffix
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of orderText) {
        if (ch === "(") { depth++; cur += ch; }
        else if (ch === ")") { depth--; cur += ch; }
        else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      if (cur.trim()) parts.push(cur.trim());
      parts.filter(Boolean).forEach(item => {
        // Strip "+ extras/combo suffix" to get base menu item name
        const base = item.replace(/\s*\+.*$/, "").trim();
        const key  = base.toLowerCase();
        if (!takenItems[key]) takenItems[key] = [];
        if (!takenItems[key].includes(name)) takenItems[key].push(name);
      });
    });

    updateMenuIndicators();
    checkDuplicates();

    countEl.textContent = rows.length;

    if (_prevOrderCount !== null && rows.length > _prevOrderCount) {
      notifyNewOrder(rows.length - _prevOrderCount);
    }
    _prevOrderCount = rows.length;

    if (!rows.length) {
      container.innerHTML = `<div class="placeholder">No orders yet.</div>`;
      return;
    }

    const itemCounts = {};
    rows.forEach(r => {
      smartSplit(r[2] ?? "").map(s => s.toLowerCase())
        .forEach(item => { itemCounts[item] = (itemCounts[item] || 0) + 1; });
    });

    const dupCount = Object.values(itemCounts).filter(n => n > 1).length;

    _lastOrderRows = rows;
    renderOrdersTable(dupCount);
  } catch {
    container.innerHTML = `<div class="placeholder error-text">Could not load orders. Make sure the sheet is published publicly.</div>`;
  }
}

function extractNotes(orderText) {
  const m = (orderText ?? "").match(/\|\s*Notes:\s*(.*)$/);
  return m ? m[1].trim() : "";
}

function renderOrdersTable(dupCount) {
  const container   = document.getElementById("orders-container");
  const rows        = _lastOrderRows;
  const withTax     = document.getElementById("tax-toggle")?.checked;
  const showPrices  = document.getElementById("show-prices-toggle")?.checked;
  const groupDupes  = document.getElementById("group-dupes-toggle")?.checked;
  const TAX         = 1.06;

  if (!rows.length) return;

  const itemCounts = {};
  rows.forEach(r => {
    smartSplit(r[2] ?? "").map(s => s.toLowerCase())
      .forEach(item => { itemCounts[item] = (itemCounts[item] || 0) + 1; });
  });

    const deadline = getOrderDeadline();
    const trs = rows.map(r => {
      const rowName    = (r[1] ?? "").trim();
      const items      = smartSplit(r[2] ?? "");
      const notes      = extractNotes(r[2] ?? "");
      const debugFakeTs = DEBUG_MODE ? _debugLateOverrides.get(rowName.toLowerCase()) : null;
      const ts         = debugFakeTs ? new Date(debugFakeTs) : (r[0] ? new Date(r[0]) : null);
      const isLate     = ts && !isNaN(ts) && ts > deadline;
      const itemHtml = items.map(item => {
        const isDup    = (itemCounts[item.toLowerCase()] || 0) > 1;
        const baseName = item.replace(/\s*\+.*$/, "").trim();
        const meta     = findMenuItem(baseName);
        const price    = (showPrices && meta?.price) ? `<span class="td-item-price">$${Number(meta.price).toFixed(2)}</span>` : "";
        const label    = isDup
          ? `<span class="dup-item" title="Ordered by multiple people">${esc(item)}</span>`
          : esc(item);
        return `<div class="td-item-row">${label}${price}</div>`;
      }).join("") + (notes ? `<div class="td-notes">Note: ${esc(notes)}</div>` : "");
      const rawTotal = calcOrderTotal(r[2] ?? "");
      const total    = withTax ? rawTotal * TAX : rawTotal;
      const totalHtml = rawTotal > 0
        ? `<span class="td-total">$${total.toFixed(2)}</span>`
        : "";
      const editBtn   = `<button type="button" class="order-row-edit-btn" title="Edit order" data-name="${escAttr(rowName)}" data-items="${escAttr(r[2] ?? "")}"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle"><path d="M7.5 1.5 L9.5 3.5 L3.5 9.5 L1 10 L1.5 7.5 Z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M6.5 2.5 L8.5 4.5" stroke="currentColor" stroke-width="1.2"/></svg></button>`;
      const deleteBtn = `<button type="button" class="order-row-delete-btn" title="Delete order" data-name="${escAttr(rowName)}">&times;</button>`;
      // Once the week is finalized (Order Complete logged), lock out edits/deletes.
      const actionsHtml = isWeekEffectivelyComplete()
        ? `<span class="td-actions-locked" title="This week's order is finalized">&#128274;</span>`
        : `${editBtn}${deleteBtn}`;

      return `<tr class="${isLate ? "tr-late" : ""}">
        <td class="td-name" title="${isLate ? "Submitted after the order deadline" : ""}">${esc(rowName)}${isLate ? `<span class="td-late-tag">(late)</span>` : ""}</td>
        <td class="td-items">${itemHtml}</td>
        ${showPrices ? `<td class="td-total-cell">${totalHtml}</td>` : ""}
        <td class="td-actions"><div class="td-actions-inner">${actionsHtml}</div></td>
      </tr>`;
    }).join("");

    const dupBanner = dupCount !== undefined && dupCount
      ? `<div class="dup-banner">${dupCount} dish${dupCount > 1 ? "es" : ""} ordered by more than one person.</div>`
      : "";

    const prevTable = container.querySelector("table");
    const prevBanner = container.querySelector(".dup-banner");
    const taxLabel = `<span style='font-size:0.65rem;opacity:0.6;visibility:${withTax ? "visible" : "hidden"}'>+tax</span>`;

    // Grand total is computed once across all orders, independent of the
    // per-row tax-toggle and the show-prices toggle (those only affect the
    // individual item/row view).
    const grandRaw     = rows.reduce((sum, r) => sum + calcOrderTotal(r[2] ?? ""), 0);
    const grandWithTax = grandRaw * TAX;
    const grandTotalHtml = `<div class="grand-total-bar">
      <span class="grand-total-label">Grand Total</span>
      <div class="grand-total-values">
        <span class="grand-total-amt">$${grandRaw.toFixed(2)}<span class="grand-total-sub">no tax</span></span>
        <span class="grand-total-amt">$${grandWithTax.toFixed(2)}<span class="grand-total-sub">+6% tax</span></span>
      </div>
    </div>`;

    let mainHtml;
    if (groupDupes) {
      // Group by item + notes together -- an item with a note and the same
      // item without one are kept as separate lines, never merged.
      const groups = new Map();
      rows.forEach(r => {
        const rowName = (r[1] ?? "").trim();
        const notes   = extractNotes(r[2] ?? "");
        smartSplit(r[2] ?? "").forEach(item => {
          const key = `${item.toLowerCase()}||${notes.toLowerCase()}`;
          if (!groups.has(key)) groups.set(key, { label: item, notes, count: 0, names: [] });
          const g = groups.get(key);
          g.count++;
          g.names.push(rowName);
        });
      });
      const sorted = [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      const groupRows = sorted.map(g => {
        const baseName  = g.label.replace(/\s*\+.*$/, "").trim();
        const meta      = findMenuItem(baseName);
        const priceHtml = (showPrices && meta?.price)
          ? `<span class="grouped-item-price">$${(meta.price * g.count).toFixed(2)}</span>`
          : "";
        const namesHtml = `<span class="grouped-item-names">${esc(g.names.join(", "))}</span>`;
        const notesHtml = g.notes ? `<span class="grouped-item-note">Note: ${esc(g.notes)}</span>` : "";
        return `<div class="grouped-item-row">
          <span class="grouped-item-qty">${g.count}</span>
          <span class="grouped-item-sep">|</span>
          <span class="grouped-item-main">
            <span class="grouped-item-name">${esc(g.label)}</span>${namesHtml}
            ${notesHtml}
          </span>
          ${priceHtml}
        </div>`;
      }).join("");
      mainHtml = `<div class="grouped-items-list">${groupRows}</div>`;
    } else {
      mainHtml = `${dupBanner}<div class="orders-table-wrap"><table>
        <colgroup>
          <col class="col-name"><col class="col-items">${showPrices ? `<col class="col-total">` : ""}<col class="col-actions">
        </colgroup>
        <thead><tr><th>Name</th><th>Items</th>${showPrices ? `<th>Total ${taxLabel}</th>` : ""}<th></th></tr></thead>
        <tbody>${trs}</tbody>
      </table></div>`;
    }

    container.innerHTML = `${mainHtml}${grandTotalHtml}`;

    container.querySelectorAll(".order-row-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const savedItems = btn.dataset.items.split(",").map(s => s.trim()).filter(Boolean);
        document.getElementById("order-form").style.display    = "block";
        document.getElementById("order-success").style.display = "none";
        document.getElementById("order-name").value = btn.dataset.name;
        selectedItems = savedItems;
        renderPills();
        checkDuplicates();
        document.getElementById("order-btn").textContent = "Update Order";
        document.getElementById("order-btn").disabled    = false;
        document.getElementById("order-name").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    container.querySelectorAll(".order-row-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.name;
        const confirmed = await confirmModal(`Delete ${name}'s order? This cannot be undone.`);
        if (!confirmed) return;
        btn.disabled = true;
        btn.textContent = "…";
        try {
          const body = new URLSearchParams({
            [FORM_NAME_ENTRY]:  name,
            [FORM_ORDER_ENTRY]: "__deleted__",
          });
          await fetch(FORM_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
          // if this was our own order, clear localStorage
          if ((localStorage.getItem("lastOrderName") || "").toLowerCase() === name.toLowerCase()) {
            localStorage.removeItem("lastOrderName");
            localStorage.removeItem("lastOrderItems");
            localStorage.removeItem("lastOrderDate");
            document.getElementById("order-form").style.display    = "block";
            document.getElementById("order-success").style.display = "none";
          }
          setTimeout(loadData, 1200);
        } catch {
          btn.disabled = false;
          btn.innerHTML = "&times;";
          alert("Delete failed.");
        }
      });
    });
}


function applyMenuTrendMarks() {
  document.querySelectorAll(".mpi").forEach(el => {
    const name = (el.dataset.name || "").toLowerCase();
    const existing = el.querySelector(".mpi-trend-mark");
    if (trendingItems.has(name)) {
      if (!existing) {
        const mark = document.createElement("span");
        mark.className = "mpi-trend-mark";
        mark.textContent = "▲";
        el.querySelector(".mpi-name")?.prepend(mark);
      }
    } else {
      existing?.remove();
    }
  });
}

async function loadTrending() {
  const card      = document.getElementById("trending-card");
  const container = document.getElementById("trending-container");
  const label     = document.getElementById("trending-restaurant-label");

  if (!restaurant || !restaurant.menu || !restaurant.menu.length) {
    card.style.display = "none";
    return;
  }

  try {
    const csv = MOCK_MODE ? mockOrdersCSV() : await fetchCSV(ORDERS_GID);
    const allRows = parseCSV(csv).slice(1).filter(r => r[1] && r[2]);
    console.log("[trending] total order rows:", allRows.length, "| restaurant:", restaurant?.name);

    // Find all past Fridays where this restaurant was active
    const total      = config.restaurants.length;
    const startMs    = new Date(config.startDate + "T12:00:00").getTime();
    const weekMs     = 7 * 24 * 60 * 60 * 1000;
    const todayMs    = Date.now();
    const activeFridays = new Set();

    for (let w = 0; w <= 104; w++) {
      const fridayMs = startMs + w * weekMs;
      if (fridayMs > todayMs + weekMs) break;
      const rotIdx = ((w % total) + total) % total;
      const raw = config.restaurants[rotIdx];
      const resolved = raw.ref ? config.restaurants.find(r => r.name === raw.ref) || raw : raw;
      if (resolved.name === restaurant.name) {
        const d = new Date(fridayMs);
        activeFridays.add(toYMD(d));
      }
    }
    console.log("[trending] activeFridays for", restaurant.name, ":", [...activeFridays]);

    // Group rows by their week-Friday, then deduplicate per person (latest entry wins)
    const byWeek = {};
    allRows.forEach(r => {
      const ts = r[0] ? new Date(r[0]) : null;
      if (!ts) return;
      const d    = new Date(ts);
      const diff = ((5 - d.getDay()) + 7) % 7;
      const fri  = new Date(d);
      fri.setDate(d.getDate() + diff);
      const friStr = toYMD(fri);
      console.log("[trending] row ts:", r[0], "→ friday:", friStr, "| match:", activeFridays.has(friStr));
      if (!activeFridays.has(friStr)) return;
      if (!byWeek[friStr]) byWeek[friStr] = new Map();
      byWeek[friStr].set(r[1].trim().toLowerCase(), r);
    });

    // Count dishes across deduplicated rows only
    const counts = {};
    let totalOrders = 0;
    Object.values(byWeek).forEach(weekMap => {
      weekMap.forEach(r => {
        (r[2] ?? "").split(",").map(s => s.trim()).filter(Boolean).forEach(item => {
          const base = item.replace(/\s*\(.*?\)\s*$/, "").trim();
          counts[base] = (counts[base] || 0) + 1;
          totalOrders++;
        });
      });
    });
    console.log("[trending] totalOrders:", totalOrders, "| counts:", counts);

    if (!totalOrders) {
      card.style.display = "none";
      return;
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const max    = sorted[0][1];
    const weeks  = activeFridays.size;

    // Mark top-trending items (top 5) for menu panel indicators
    trendingItems = new Set(sorted.slice(0, 5).map(([name]) => name.toLowerCase()));
    applyMenuTrendMarks();

    const trendHtml = sorted.map(([name, count]) =>
      `<div class="trend-row">
        <span class="trend-name">${trendingItems.has(name.toLowerCase()) ? "▲ " : ""}${esc(name)}</span>
        <div class="trend-bar-wrap"><div class="trend-bar" style="width:${Math.round(count/max*100)}%"></div></div>
        <span class="trend-count">${count}×</span>
      </div>`
    ).join("");
    const noteHtml = `<p class="trending-note">Based on ${totalOrders} items across ${weeks} visit${weeks !== 1 ? "s" : ""}.</p>`;

    // Bottom card
    label.textContent = restaurant.name;
    card.style.display = "block";
    container.innerHTML = trendHtml + noteHtml;

    // In-form section
    const formTrending = document.getElementById("form-trending");
    const formTitle    = document.getElementById("form-trending-title");
    const formList     = document.getElementById("form-trending-list");
    if (formTrending) {
      formTitle.textContent = `Trending at ${restaurant.name}`;
      formList.innerHTML = trendHtml;
      formTrending.style.display = "block";
    }

  } catch {
    card.style.display = "none";
  }
}

async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  console.log("[fetchCSV] →", url);
  const res = await fetch(url, { cache: "no-store" });
  console.log("[fetchCSV] status:", res.status, res.ok ? "OK" : "FAILED");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  console.log("[fetchCSV] rows:", text.trim().split("\n").length);
  return text;
}

function parseCSV(text) {
  return text.trim().split("\n").map(line => {
    line = line.replace(/\r$/, "");
    const cells = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur); cur = ""; }
      else { cur += ch; }
    }
    cells.push(cur);
    return cells;
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

async function init() {
  await loadRestaurant();
  await loadData();
  // restore submitted state only if the name field still matches last submitter
  if (localStorage.getItem("lastOrderDate") === currentFriday) {
    const savedName  = localStorage.getItem("lastOrderName")  || "";
    const savedItems = localStorage.getItem("lastOrderItems") || "";
    const nameField  = document.getElementById("order-name");
    // Pre-fill the name but don't lock the form — let anyone use it
    if (savedName && nameField && !nameField.value) nameField.value = savedName;
  }
  setInterval(loadData, 30_000);
}

// ── Order countdown ──────────────────────────────────────────────────
// 5×7 pixel font via SVG rects for 0-9
const PIXEL_DIGITS = {
  "0": [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
  "1": [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[1,1,1]],
  "2": [[1,1,1],[0,0,1],[0,0,1],[1,1,1],[1,0,0],[1,0,0],[1,1,1]],
  "3": [[1,1,1],[0,0,1],[0,0,1],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
  "4": [[1,0,1],[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1],[0,0,1]],
  "5": [[1,1,1],[1,0,0],[1,0,0],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
  "6": [[1,1,1],[1,0,0],[1,0,0],[1,1,1],[1,0,1],[1,0,1],[1,1,1]],
  "7": [[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
  "8": [[1,1,1],[1,0,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1],[1,1,1]],
  "9": [[1,1,1],[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1],[1,1,1]],
};
function pixelDigit(ch) {
  const P = 5; // pixel size
  const grid = PIXEL_DIGITS[ch] || PIXEL_DIGITS["8"];
  const rects = [];
  grid.forEach((row, r) => row.forEach((on, c) => {
    if (on) rects.push(`<rect x="${c*(P+1)}" y="${r*(P+1)}" width="${P}" height="${P}" fill="currentColor"/>`);
  }));
  const W = 3*(P+1)-1, H = 7*(P+1)-1;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${rects.join("")}</svg>`;
}
function pixelNum(str) {
  return `<span class="pixel-num">${str.split("").map(pixelDigit).join("")}</span>`;
}

// Shared by the countdown clock and the Worksheet's "late order" marking --
// both need the same order-by cutoff instant for this week.
function getOrderDeadline() {
  const DEFAULT_HH = 17, DEFAULT_MM = 30;
  let deadlineHH = DEFAULT_HH, deadlineMM = DEFAULT_MM;
  const saved = localStorage.getItem("orderDeadline");
  if (saved && /^\d{1,2}:\d{2}$/.test(saved)) {
    [deadlineHH, deadlineMM] = saved.split(":").map(Number);
  }
  const fri = currentFriday || toYMD((() => { const d = new Date(); while (d.getDay() !== 5) d.setDate(d.getDate() + 1); return d; })());
  const [y, mo, d] = fri.split("-").map(Number);
  const jan = new Date(y, 0, 1);
  const dstStart = new Date(y, 2, 8  + (7 - jan.getDay()) % 7);
  const dstEnd   = new Date(y, 10, 1 + (7 - new Date(y, 10, 1).getDay()) % 7);
  const friday   = new Date(y, mo - 1, d);
  const utcOffset = (friday >= dstStart && friday < dstEnd) ? 4 : 5;
  return new Date(Date.UTC(y, mo - 1, d, deadlineHH + utcOffset, deadlineMM, 0));
}

// QA-only: when someone submits an order while the Test Clock is jumped to
// a fake time, that specific person's order should be judged "late" (or
// not) against the FAKE time they submitted under, not their real submission
// timestamp. Keyed by lowercase name -> fake epoch ms at submission time.
const _debugLateOverrides = new Map();

function startCountdown() {
  const el = document.getElementById("order-countdown");
  if (!el) return;

  const DEFAULT_HH = 17, DEFAULT_MM = 30;
  let deadlineHH = DEFAULT_HH, deadlineMM = DEFAULT_MM;

  const saved = localStorage.getItem("orderDeadline");
  if (saved && /^\d{1,2}:\d{2}$/.test(saved)) {
    [deadlineHH, deadlineMM] = saved.split(":").map(Number);
  }

  function getDeadline() { return getOrderDeadline(); }

  function fmtTime() {
    const h12 = deadlineHH % 12 || 12;
    const ampm = deadlineHH >= 12 ? "PM" : "AM";
    return `${h12}:${String(deadlineMM).padStart(2,"0")} ${ampm} ET`;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  let editing = false;
  let overlayDismissed = false;
  document.getElementById("closed-overlay-unlock")?.addEventListener("click", () => {
    overlayDismissed = true;
    const overlay = document.getElementById("closed-overlay");
    if (overlay) overlay.style.display = "none";
  });

  function showEditor() {
    if (editing) return;
    editing = true;
    clearInterval(timer);
    el.innerHTML = `<span class="countdown-label" style="flex:1;align-items:flex-start;gap:0.4rem">
      <span style="font-size:0.6rem;opacity:0.7">ORDER BY (HH:MM 24h)</span>
      <input class="countdown-time-input" id="deadline-input" type="text"
        value="${pad(deadlineHH)}:${pad(deadlineMM)}" maxlength="5" placeholder="17:30">
      <span style="font-size:0.6rem;opacity:0.5">press Enter to save</span>
    </span>`;
    const inp = document.getElementById("deadline-input");
    inp.focus();
    inp.select();
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const val = inp.value.trim();
        if (/^\d{1,2}:\d{2}$/.test(val)) {
          const [hh, mm] = val.split(":").map(Number);
          if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
            deadlineHH = hh; deadlineMM = mm;
            localStorage.setItem("orderDeadline", `${hh}:${String(mm).padStart(2,"0")}`);
          }
        }
        editing = false;
        tick();
        timer = setInterval(tick, 1000);
      }
      if (e.key === "Escape") {
        editing = false;
        tick();
        timer = setInterval(tick, 1000);
      }
    });
  }

  function tick() {
    if (editing) return;
    const diff = getDeadline() - debugNow();
    if (diff <= 0) {
      el.innerHTML = `<span class="countdown-label" style="flex:1;cursor:pointer" id="deadline-label">ORDER BY<br><span class="countdown-label-time">${fmtTime()}</span></span>
        <span style="padding:0.75rem 1rem;font-weight:900;letter-spacing:0.18em;font-size:0.85rem;flex:1;text-align:center">ORDERS CLOSED</span>`;
      document.getElementById("deadline-label")?.addEventListener("click", showEditor);
      const overlay = document.getElementById("closed-overlay");
      if (overlay && !overlayDismissed) overlay.style.display = "flex";
      return;
    }
    overlayDismissed = false;
    const overlay = document.getElementById("closed-overlay");
    if (overlay) overlay.style.display = "none";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `<span class="countdown-label" style="cursor:pointer" id="deadline-label">ORDER BY<br><span class="countdown-label-time">${fmtTime()}</span></span>
      <div class="countdown-units">
        <div class="countdown-unit"><span class="countdown-num">${pad(h)}</span><span class="countdown-unit-label">hrs</span></div>
        <span class="countdown-sep">:</span>
        <div class="countdown-unit"><span class="countdown-num">${pad(m)}</span><span class="countdown-unit-label">min</span></div>
        <span class="countdown-sep">:</span>
        <div class="countdown-unit"><span class="countdown-num">${pad(s)}</span><span class="countdown-unit-label">sec</span></div>
      </div>`;
    document.getElementById("deadline-label")?.addEventListener("click", showEditor);
  }

  tick();
  let timer = setInterval(tick, 1000);
}

// ── Theme & dark mode ──────────────────────────────────────────────────
(function() {
  const SWATCH_COLORS = {
    yellow: "#fcf811", green: "#39ff14", pink: "#fc16ac", lightpink: "#ffd1e8", cyan: "#04f2d6", white: "#ffffff", offwhite: "#fafcc4", grey: "#b8c4c6"
  };
  const switcher   = document.getElementById("theme-switcher");
  const darkBtn    = document.getElementById("dark-toggle");
  const currentEl  = document.getElementById("theme-current");
  const swatches   = document.querySelectorAll(".theme-swatch");
  const themeColorMeta = document.getElementById("theme-color-meta");

  let _activeThemeName = "yellow";

  // Mobile browsers (iOS Safari, Brave, etc.) tint the address/status bar
  // using <meta name="theme-color">. Without keeping this in sync, they'll
  // just freeze on whatever color was painted at initial load and ignore
  // later in-page theme switches.
  function syncThemeColorMeta() {
    if (!themeColorMeta) return;
    const isDark = document.body.classList.contains("dark");
    themeColorMeta.setAttribute("content", isDark ? "#000000" : (SWATCH_COLORS[_activeThemeName] || "#fcf811"));
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    _activeThemeName = theme;
    currentEl.style.background = SWATCH_COLORS[theme] || "#fcf811";
    localStorage.setItem("theme", theme);
    switcher.classList.remove("open");
    syncThemeColorMeta();
  }

  function applyDark(on) {
    document.body.classList.toggle("dark", on);
    darkBtn.textContent = on ? "☀" : "☾";
    localStorage.setItem("darkMode", on ? "1" : "0");
    syncThemeColorMeta();
  }

  const themeNames = Object.keys(SWATCH_COLORS);
  const randomTheme = themeNames[Math.floor(Math.random() * themeNames.length)];
  applyTheme(localStorage.getItem("theme") || randomTheme);
  applyDark(localStorage.getItem("darkMode") === "1");

  currentEl.addEventListener("click", e => {
    e.stopPropagation();
    switcher.classList.toggle("open");
  });

  swatches.forEach(s => s.addEventListener("click", e => {
    e.stopPropagation();
    applyTheme(s.dataset.theme);
  }));

  darkBtn.addEventListener("click", () => applyDark(!document.body.classList.contains("dark")));

  document.addEventListener("click", () => switcher.classList.remove("open"));
})();

startCountdown();
init();

if (DEBUG_MODE) {
  const panel     = document.getElementById("debug-clock");
  const input     = document.getElementById("debug-clock-input");
  const statusEl  = document.getElementById("debug-clock-status");
  panel.style.display = "flex";

  function updateStatus() {
    statusEl.textContent = _debugNowOverride
      ? `→ ${new Date(_debugNowOverride).toLocaleString()}`
      : "(real time)";
  }
  updateStatus();

  document.getElementById("debug-clock-apply").addEventListener("click", async () => {
    if (!input.value) return;
    _debugNowOverride = new Date(input.value).getTime();
    updateStatus();
    // Re-run the restaurant/rotation pick (uses debugNow() via
    // getThisFriday()) and reload everything downstream of it.
    await loadRestaurant();
    await loadData();
  });
  document.getElementById("debug-clock-reset").addEventListener("click", async () => {
    _debugNowOverride = null;
    input.value = "";
    updateStatus();
    await loadRestaurant();
    await loadData();
  });

  document.getElementById("debug-force-reopen").addEventListener("change", e => {
    _debugForceReopen = e.target.checked;
    applyOrderFreezeState();
    renderRatingCard();
    if (_lastOrderRows.length) renderOrdersTable();
  });
}

document.getElementById("worksheet-info-btn")?.addEventListener("click", e => {
  e.stopPropagation();
  document.getElementById("worksheet-info-wrap")?.classList.toggle("open");
});
document.addEventListener("click", () => {
  document.getElementById("worksheet-info-wrap")?.classList.remove("open");
});

document.getElementById("tax-toggle").addEventListener("change", () => renderOrdersTable());
document.getElementById("show-prices-toggle").addEventListener("change", () => renderOrdersTable());
document.getElementById("group-dupes-toggle").addEventListener("change", () => renderOrdersTable());

document.getElementById("order-complete-btn").addEventListener("click", async () => {
  const rows = _lastOrderRows;
  const btn    = document.getElementById("order-complete-btn");
  const status = document.getElementById("order-complete-status");
  if (!rows.length) {
    status.style.display = "block";
    status.textContent = "No orders to log yet.";
    return;
  }
  const confirmed = await confirmModal("Log this week's orders for reporting? Do this once the order is finalized.", { okLabel: "Log Orders", okColor: "var(--green)" });
  if (!confirmed) return;

  // Group by item name only (ignoring notes) -- matches the same "same dish
  // regardless of notes" counting used for the duplicate banner/Grouped View,
  // since per-item rating metrics care about the dish, not per-order notes.
  const counts = new Map();
  rows.forEach(r => {
    const orderer = (r[1] || "").trim();
    smartSplit(r[2] ?? "").forEach(item => {
      const key = item.toLowerCase();
      if (!counts.has(key)) counts.set(key, { name: item, qty: 0, names: [] });
      const entry = counts.get(key);
      entry.qty++;
      if (orderer && !entry.names.includes(orderer)) entry.names.push(orderer);
    });
  });
  const items = [...counts.values()];

  btn.disabled = true;
  btn.textContent = "Logging…";
  btn.dataset.busy = "1";
  status.style.display = "none";
  const restaurant = document.getElementById("restaurant-name")?.textContent || "";
  try {
    if (MOCK_MODE) {
      const now = new Date().toISOString();
      items.forEach(it => _mockHistory.push([now, currentFriday, restaurant, it.name, it.qty, it.names.join(", ")]));
    } else {
      if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
      const params = new URLSearchParams({
        type: "history",
        date: currentFriday,
        restaurant,
        items: JSON.stringify(items),
      });
      await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
    }
    status.style.display = "block";
    status.textContent = `Logged ${items.length} item${items.length === 1 ? "" : "s"} for this week.`;
    delete btn.dataset.busy;
    await loadHistory(); // sets weekComplete + freezes the form/buttons via applyOrderFreezeState()
  } catch (err) {
    delete btn.dataset.busy;
    btn.disabled = false;
    btn.textContent = "Order Complete";
    status.style.display = "block";
    status.textContent = "Could not log — " + err.message;
  }
});

function openMenuReport(restaurantName) {
  const modal = document.getElementById("report-modal");
  const title = document.getElementById("report-modal-title");
  const tbody = document.getElementById("report-modal-tbody");
  const empty = document.getElementById("report-modal-empty");

  title.textContent = `${restaurantName} — Order History & Ratings`;

  const stats = computeItemStats(restaurantName);
  const rows = [...stats.values()].filter(s => s.qty > 0 || s.ratingCount > 0);
  rows.sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));

  // Total spent uses each item's *current* menu price (History only stores
  // qty, not price-at-the-time), so this is an approximation if prices
  // have since changed. Looked up from the target restaurant's own menu
  // (not just whichever one happens to be on screen), so this works
  // correctly when opened from the rotation list too.
  const targetMenu = findRestaurantByName(restaurantName)?.menu || allMenuItems;
  const totalEl = document.getElementById("report-modal-total");
  let totalSpent = 0;
  rows.forEach(s => {
    const meta = findMenuItem(s.label, targetMenu);
    if (meta?.price) totalSpent += Number(meta.price) * s.qty;
  });
  if (totalEl) {
    totalEl.textContent = rows.length ? `Total Spent: $${totalSpent.toFixed(2)}` : "";
    totalEl.style.display = rows.length ? "block" : "none";
  }

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    tbody.innerHTML = rows.map(s => {
      const avg = s.ratingCount ? (s.ratingSum / s.ratingCount) : null;
      const avgLabel = avg === null ? "—" : `${avg.toFixed(1)}/10`;
      const cls = s.weeksOrdered.size > 2 ? "report-fav" : (avg !== null && avg < 3 ? "report-dislike" : "");
      return `<tr>
        <td class="${cls}">${esc(s.label)}</td>
        <td>${s.qty}</td>
        <td>${avgLabel}</td>
      </tr>`;
    }).join("");
  }

  modal.classList.add("open");
}

function closeMenuReport(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("report-modal").classList.remove("open");
}

let _lbImages = [];
let _lbIndex  = 0;

function openLightbox(index) {
  const thumbs = document.querySelectorAll(".menu-img-thumb");
  _lbImages = [...thumbs].map(t => ({ src: t.src, alt: t.alt }));
  _lbIndex  = index;
  _renderLightbox();
  document.getElementById("lightbox").classList.add("open");
}
function _renderLightbox() {
  const lb  = document.getElementById("lightbox");
  const img = lb.querySelector("img");
  const counter = lb.querySelector(".lightbox-counter");
  const prev = lb.querySelector(".lightbox-nav.prev");
  const next = lb.querySelector(".lightbox-nav.next");
  img.src = _lbImages[_lbIndex].src;
  img.alt = _lbImages[_lbIndex].alt;
  const multi = _lbImages.length > 1;
  prev.hidden = !multi;
  next.hidden = !multi;
  counter.textContent = multi ? `${_lbIndex + 1} / ${_lbImages.length}` : "";
}
function closeLightbox() {
  document.getElementById("lightbox").classList.remove("open");
}
function lbPrev() { _lbIndex = (_lbIndex - 1 + _lbImages.length) % _lbImages.length; _renderLightbox(); }
function lbNext() { _lbIndex = (_lbIndex + 1) % _lbImages.length; _renderLightbox(); }
document.addEventListener("keydown", e => {
  if (!document.getElementById("lightbox").classList.contains("open")) return;
  if (e.key === "Escape")     closeLightbox();
  if (e.key === "ArrowLeft")  lbPrev();
  if (e.key === "ArrowRight") lbNext();
});

// Order count number also wiggles on hover, on top of its ambient
// auto-wiggle -- gated by a cooldown so rapidly re-entering the icon
// doesn't just replay it over and over.
let _orderCountWiggleReadyAt = 0;
document.querySelector(".order-count-icon")?.addEventListener("mouseenter", () => {
  const now = Date.now();
  if (now < _orderCountWiggleReadyAt) return;
  _orderCountWiggleReadyAt = now + 3000;
  const numEl = document.getElementById("order-count");
  if (!numEl) return;
  numEl.animate([
    { transform: "translate(-50%, -50%) rotate(0deg)    scale(1)" },
    { transform: "translate(-53%, -47%) rotate(-12deg) scale(1.12)", offset: 0.2 },
    { transform: "translate(-47%, -53%) rotate(9deg)   scale(1.08)", offset: 0.4 },
    { transform: "translate(-52%, -48%) rotate(-6deg)  scale(1.05)", offset: 0.6 },
    { transform: "translate(-49%, -51%) rotate(3deg)   scale(1.02)", offset: 0.8 },
    { transform: "translate(-50%, -50%) rotate(0deg)    scale(1)",  offset: 1 },
  ], { duration: 550, easing: "ease-in-out" });
});

// ── Confetti easter egg ───────────────────────────────────────────────
// Occasionally throws a burst of confetti pieces into the "Weekly Group
// Order" box; they fall slowly with a gentle flutter/rotation and fade out
// near the bottom. Random, infrequent bursts, not a constant effect --
// strictly confined to that box via overflow:hidden.

function spawnConfettiPiece(box, w, h) {
  const width  = 10 + Math.random() * 8;
  const height = 16 + Math.random() * 10;
  const piece  = document.createElement("div");
  piece.className = "confetti-piece";
  piece.style.width  = width + "px";
  piece.style.height = height + "px";
  // var(--ink) is black in light themes and the accent color in dark mode --
  // in light mode the box background *is* the accent color, so an
  // accent-colored piece would otherwise vanish against it.
  piece.style.background = "var(--ink)";

  const startX = Math.random() * w;
  const drift  = (Math.random() - 0.5) * 100;
  const spin   = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360);
  piece.style.left = startX + "px";
  piece.style.top  = (-height) + "px";
  box.appendChild(piece);

  const duration = 1400 + Math.random() * 900;
  const anim = piece.animate([
    { transform: "translate(0, 0) rotate(0deg)" },
    { transform: `translate(${drift * 0.3}px, ${h * 0.25}px) rotate(${spin * 0.3}deg)`,  offset: 0.1 },
    { transform: `translate(${drift * 0.6}px, ${h * 0.6}px) rotate(${spin * 0.65}deg)`,  offset: 0.55 },
    { transform: `translate(${drift}px, ${h + height + 10}px) rotate(${spin}deg)` },
  ], { duration, easing: "ease-in" });

  anim.onfinish = () => piece.remove();
}

function spawnConfettiBurst() {
  const box = document.querySelector(".header-left");
  if (!box) return;
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;

  const count = 10 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnConfettiPiece(box, w, h), i * (60 + Math.random() * 100));
  }
}

function scheduleConfetti() {
  const delay = 12000 + Math.random() * 20000; // every ~12-32s, unpredictably
  setTimeout(() => {
    spawnConfettiBurst();
    scheduleConfetti();
  }, delay);
}
scheduleConfetti();
