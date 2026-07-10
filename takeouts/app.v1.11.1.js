
const _cfg            = window.TAKEOUT_CONFIG || {};
const APPS_SCRIPT_URL = _cfg.APPS_SCRIPT_URL  || "";
const FORM_URL        = _cfg.FORM_URL         || "";
const FORM_NAME_ENTRY = _cfg.FORM_NAME_ENTRY  || "";
const FORM_ORDER_ENTRY= _cfg.FORM_ORDER_ENTRY || "";
const SHEET_ID        = _cfg.SHEET_ID         || "";
const ORDERS_GID      = _cfg.ORDERS_GID       || "0";
const HISTORY_GID     = _cfg.HISTORY_GID      || "";
const RATINGS_GID     = _cfg.RATINGS_GID      || "";
const OVERRIDES_GID   = _cfg.OVERRIDES_GID    || "";
const PLINKO_SCORES_GID = _cfg.PLINKO_SCORES_GID || "";

// Local-only demo mode: when testing on localhost with no real Sheet
// configured yet, run the whole order/history/rating flow on fake
// in-memory data instead of hitting Google Sheets. Turns itself off the
// moment a real SHEET_ID is set in config.js.
const MOCK_MODE = !SHEET_ID &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1");
if (MOCK_MODE) console.warn("[mock] No SHEET_ID configured — running on fake local data.");

// Never true on the real prod page -- lets local/QA testers fast-forward
// the countdown clock (and other QA-only tools) without waiting for real
// time to pass. True on localhost/any non-prod hostname, and also true on
// the QA folder even though it shares prod's hostname (gbfffff.github.io).
const DEBUG_MODE = location.hostname !== "gbfffff.github.io" ||
  location.pathname.includes("/takeouts-qa/");
let _debugNowOverride = null; // epoch ms, or null to use real time
function debugNow() { return _debugNowOverride ?? Date.now(); }

// Shown in the footer on QA/localhost only (see DEBUG_MODE above). Bump
// APP_VERSION and add an entry here whenever a meaningful batch of changes
// ships -- newest entry first.
//
// Cache-busting: app.js/gate.js/plinko-comments.js/styles.css are renamed
// with the version baked into the filename (e.g. app.v1.9.1.js) rather than
// a "?v=" query param, so a stale browser cache can't serve old code under
// any circumstance. Bumping the version means: rename all four files (in
// BOTH takeouts/ and takeouts-qa/) to the new version, then update the
// <script>/<link> tags in both index.html files to match. config.js is
// exempt -- it's regenerated fresh by the deploy workflow every push, so it
// stays on the simpler "?v=" query-param scheme.
const APP_VERSION = "1.11.1";
const CHANGELOG = [
  { version: "1.11.1", date: "2026-07-09", notes: [
    "Drop Game gold tray: the floor bar now fully retracts (whole floor drops open) instead of a narrow one-corner ramp, and stays open a several-second beat longer before closing",
    "Gold no longer jams or freezes mid-fall in the tray -- it overlaps freely instead of fighting for space, and the win comment now waits for every gold ball to actually settle before showing",
    "Live tray-fill counter (e.g. 40 / 150) next to the bag tally, so you can see progress toward the next bag",
    "Wheel of Fortune is bigger on mobile (no longer shrunk by a vertical-only margin), has a shorter pointer flapper, and its glow now lives in the pointer's own fill -- tinted to the current theme's complementary color instead of a fixed red",
    "Wheel wedge labels stay clear of the hub instead of crowding the center on longer names",
    "Drop Game win/lose comment now centers on the peg + slot area only, not pulled down by the tray strip below it",
  ]},
  { version: "1.11.0", date: "2026-07-09", notes: [
    "Drop Game: removed Roulette (Wheel of Fortune stays); UI overhaul with a compact accessory row (preset/Edit Items/Shuffle/Clear All) and a big Spin bar docked against the wheel",
    "Drop Game gold reward overhauled: difficulty-scaled payout (fewer slots/balls/colors = bigger prize), a session gold-ball counter, and a real gold tray with a hinged floor bar that opens a ramp for the shower and closes once it settles",
    "Gold tray bags up at 150 balls into a running bag count (hover the bag icon to see the conversion); tray gold persists across resets instead of clearing every round",
    "Plinko performance: capped canvas pixel ratio, spatial-hash peg collisions, and skipped ball-ball checks between two already-settled balls -- much lighter on mobile",
    "Click anywhere on the Plinko machine to reset once a round has settled, not just the restart button",
    "Access code entry is now masked (password-style) instead of showing typed characters in plain text",
  ]},
  { version: "1.10.0", date: "2026-07-09", notes: [
    "New Wheel of Fortune and Roulette game modes for the Drop Game -- same arrow toggle now cycles Drop Game -> Wheel -> Roulette; both spin the same hand-typed (or preset) picks",
    "Wheel/Roulette presets: Restaurant Picker, Food (Popular Picks / Meat Types), Event, and Names, each editable and save-able as your own named presets",
    "Wheel/Roulette items are editable in place, with a collapsible \"Edit Items\" panel for adding/saving/deleting so the always-visible controls stay uncluttered",
    "Confetti + the Drop Game's stamped win-comment style now show on a Wheel/Roulette result",
    "Plinko Restaurant Picker now names the winning restaurant in that same stamped win style instead of just a slot number",
  ]},
  { version: "1.9.1", date: "2026-07-09", notes: [
    "Rate Your Order: an item is now marked rated on the History sheet itself (Rated/RatedAt columns, one row per person per item) once that specific person rates it, instead of relying only on per-browser localStorage -- fixes rating prompts reappearing on other devices",
    "Rate Your Order: each name is now its own collapsible row -- rating happens right under the name you clicked (and clicking it again collapses it), instead of one shared list at the bottom",
  ]},
  { version: "1.9.0", date: "2026-07-08", notes: [
    "New Item Stats trend view: click any item in the Order History & Ratings report to see its rating history as a line chart, plus times-ordered/price/avg-rating stats",
    "Anonymous voting: ratings no longer store who submitted them -- the Ratings sheet drops the Name column entirely, even in the raw sheet",
    "Drop Game reward: landing a ball in a colored slot pays out real gold balls (scaled by board height) that fall through the same pegs; win/lose comment overlays styled like the menu's category labels, loaded from an editable plinko-comments.js",
    "Restaurant Picker mode is now a pure number picker, fully separate from the colors/reward/comment layer",
    "\"GBF Dislikes\" renamed to \"GBF Hates\"; new \"GBF Controversies\" section for items ordered 3+ weeks with a below-average rating",
    "Wider site (860px -> 1200px) with proportionally larger headings; wider report modal with a proper name/item/price grid",
    "Theme picker: swapped Cyan for Tiffany Blue, added Emerald Green and Juicy Yellow; fixed a mobile fixed-position bug and a flex-wrap bug that made the closed picker balloon to 10 rows tall",
  ]},
  { version: "1.8.0", date: "2026-07-08", notes: [
    "Drop Game: resizable Plinko board above the footer -- drag-and-release ball physics, ball-ball collisions, multi-ball drops, colored winning-slot sliders, bounceable divider tips",
    "Full menus for Ah'Haan, Sardis, and Mi La Cay, including priced protein/size pickers and pick-N-sides combos",
    "Two new themes (Newspaper, Wrinkled Paper); dark mode background is now a subtle grain instead of flat black",
    "Category shortcut buttons switched to EB Garamond; header stripe divider scrolls in randomized bursts; added a static footer stripe",
    "Menu panel and Drop Game board are vertically resizable; menu grid drops to one column earlier to avoid a squeezed two-column layout",
  ]},
  { version: "1.7.1", date: "2026-07-07", notes: [
    "Restaurant badge is now a centered black box with a subtle theme-colored arrow; clicking slides down the hidden Override Restaurant button",
    "Override calendar tooltip floats above everything instead of clipping at the table edge",
    "Report modal's Past Orders date groups start collapsed",
    "Custom GBF monogram favicon",
  ]},
  { version: "1.7.0", date: "2026-07-07", notes: [
    "Restaurant rotation override (PIN + reason, global via new Overrides sheet): red flag + reason tooltip on the calendar, cancels any earlier completion, and starts a clean ordering round",
    "Deadline no longer blocks the form: Submit turns orange '(Late)' past the cutoff with a confirm step instead of the Orders Closed overlay",
    "Rounds are timestamp-bounded: reopened/overridden weeks clear the Worksheet and accept fresh orders; old rows stay in the sheet",
    "Report modal: collapsible Item Stats, per-person Past Orders (name/item/price/individual rating) with Names/Tax/Ratings toggles, Total Spent moved to bottom",
    "Rate Your Order lists only people with unrated completed items; rated items and fully-rated names disappear (data lives in reports)",
    "Order Completed & Closed overlay restyled to thin see-through stripes; removed the unrequested Trending Dishes section",
  ]},
  { version: "1.6.0", date: "2026-07-06", notes: [
    "Rate Your Order redesigned: name table with per-person status (N to rate / All rated) instead of a dropdown",
    "Review view shows already-given ratings; scoped to the latest rotation only (pending items still never expire)",
    "GBF Favs threshold lowered to 2+ distinct weeks ordered (was 3+)",
    "Traffic gauge points now trace the real 270-to-College-Park route (geocoded from restaurant map links), with eastbound-495 segments weighted double",
    "Traffic gauge thresholds tightened (Good >=92%, OK >=60%) and now shows only Accident/Road Closed incidents with distinct icons",
    "Traffic no longer auto-refreshes on a timer -- only on page load or the Refresh button, to conserve API credits",
    "Separate TomTom API keys for QA vs prod (TOMTOM_KEY_QA / TOMTOM_KEY_PROD)",
  ]},
  { version: "1.5.0", date: "2026-07-06", notes: [
    "Rate Your Order is now an all-time, per-person queue grouped by order date instead of current-week-only",
    "Reset/Reopen New Round now clears both the finalized-week lock and the deadline-passed overlay",
    "Traffic map now defaults to the Dark base style",
  ]},
  { version: "1.4.0", date: "2026-07-06", notes: [
    "Add Traffic card: TomTom-powered Good/OK/Bad gauge and live road-conditions map for 495/270/95",
    "Add map style switcher (Light/Dark/TomTom Day/TomTom Night) and legend in a collapsible Map Tools panel",
    "Add PIN-gated Reset/Reopen New Round button after Order Complete is logged",
  ]},
  { version: "1.3.0", date: "2026-07-06", notes: [
    "Add QA deployment (takeouts-qa/) alongside prod, with its own config/secrets",
    "Weekly rotation now resets Monday 6:00 AM ET instead of the prior Wednesday boundary",
    "Add GBF Favs/Dislikes menu insights and an Order History & Ratings report",
    "Add order-freeze + Rate Your Order flow after Order Complete is logged",
    "Add Test Clock and Force Reopen QA tools (DEBUG_MODE only)",
  ]},
  { version: "1.2.0", date: "2026-07-05", notes: [
    "Add access-code gate, Grouped Worksheet view, and Grand Total bar",
    "Add category shortcuts, cuisine tags, and the rotation-schedule slidedown",
    "Extract inline styles/scripts into styles.css, gate.js, and app.js",
  ]},
  { version: "1.1.0", date: "2026-07-05", notes: [
    "Add menu categorization, required protein/or-options selection",
    "Add show-prices toggle, duplicate-order grouping, and new-order notifications",
  ]},
];

let currentFriday = null;
let takenItems    = {};
let allMenuItems  = [];
let selectedItems = [];

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
    const info = getOverrideInfo(r.ymd);
    // No flag if there's no override, or if the override just matches the
    // originally-scheduled restaurant (effectively a no-op swap).
    const isRealOverride = info && info.restaurant.trim().toLowerCase() !== r.name.trim().toLowerCase();
    const tooltip = `Overridden to: ${info?.restaurant || ""}${info?.reason ? " — " + info.reason : ""}`;
    const flag = isRealOverride
      ? ` <span class="fcal-override-flag" data-tip="${escAttr(tooltip)}">&#9888;</span>`
      : "";
    return `<div class="fcal-row${cur ? " fcal-current" : ""}">
      <span class="fcal-date">${r.mon} ${r.day}</span>
      <span class="fcal-name">${esc(r.name)}${flag}</span>
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
  el.innerHTML = `<span class="worksheet-reset-notice-text">This worksheet stays open until ${esc(label)}, 6:00 AM ET — then the menu switches to the next restaurant.</span>`;
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

  await loadOverrides();

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

    // A manual override (unpredictable event forcing a restaurant swap) is
    // keyed by date and visible to everyone -- it wins over the normal
    // rotation-index pick for the active Friday. An explicit ?week= preview
    // wins over even that, since it's a deliberate "show me week N" ask.
    if (weekParam === null) {
      const overrideName = getOverrideRestaurant(currentFriday);
      if (overrideName) {
        const match = findRestaurantByName(overrideName);
        if (match) restaurant = match;
      }
    }

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
  resizeRestaurantToggleBtn();
}

// The black box behind the restaurant name (which hides the Override
// Restaurant slidedown) is always 2.5x as wide as its content, no matter how
// long or short the restaurant's name is -- reset to auto first so a shorter
// new name doesn't inherit the previous name's stretched width.
function resizeRestaurantToggleBtn() {
  const btn = document.getElementById("restaurant-toggle-btn");
  if (!btn) return;
  btn.style.width = "auto";
  const natural = btn.getBoundingClientRect().width;
  btn.style.width = `${natural * 2.5}px`;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildMenuPanel(items, restaurantName, menuUrl, menuImages, favSet, dislikeMap, controversialMap) {
  const card      = document.getElementById("menu-panel-card");
  const panel     = document.getElementById("menu-panel");
  const title     = document.getElementById("menu-panel-title");
  const shortcuts = document.getElementById("menu-panel-shortcuts");
  favSet     = favSet     || new Set();
  dislikeMap = dislikeMap || new Map();
  controversialMap = controversialMap || new Map();

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
    const price       = item.price ? `<span class="mpi-price">$${Number(item.price).toFixed(2)}</span>`
      : (item.sizes ? `<span class="mpi-price">$${Math.min(...Object.values(item.sizes).map(Number)).toFixed(2)}+</span>` : "");
    const orHint      = item.orOptions?.length ? `<span class="mpi-protein-hint">choose 1: ${esc(item.orOptions.join(" or "))}</span>` : "";
    const sidesHint   = item.sidesPick ? `<span class="mpi-protein-hint">+ ${item.sidesPick.count} sides</span>` : "";
    const sauceHint   = item.saucePick ? `<span class="mpi-protein-hint">+ ${item.saucePick.count} sauces</span>` : "";
    const sizeHint    = item.sizes ? `<span class="mpi-protein-hint">choose ${Object.keys(item.sizes).join("/")}</span>` : "";
    const proteinHint = (!item.orOptions?.length && item.protein) ? `<span class="mpi-protein-hint">+ protein</span>` : "";
    const desc        = item.desc ? `<span class="mpi-desc">${esc(item.desc)}</span>` : "";
    return `<div class="mpi" data-name="${escAttr(item.item)}">
      <span class="mpi-left"><span class="mpi-name">${esc(item.item)}${orHint || sidesHint}${sauceHint}${!orHint && !sidesHint ? sizeHint || proteinHint : ""}</span>${desc}</span>
      ${price}
    </div>`;
  }

  const favs          = items.filter(i => favSet.has(i.item.toLowerCase()));
  const dislikes      = items.filter(i => dislikeMap.has(i.item.toLowerCase()));
  const controversial = items.filter(i => controversialMap.has(i.item.toLowerCase()));

  function avgRatingMpiHtml(item, avgMap) {
    const avg = avgMap.get(item.item.toLowerCase());
    const price = item.price ? `<span class="mpi-price">$${Number(item.price).toFixed(2)}</span>` : "";
    return `<div class="mpi" data-name="${escAttr(item.item)}">
      <span class="mpi-left"><span class="mpi-name">${esc(item.item)}</span><span class="mpi-desc">Avg rating: ${avg.toFixed(1)}/10</span></span>
      ${price}
    </div>`;
  }

  function sectionLabelHtml(text) {
    return `<div class="mpi-section-label">${esc(text)}</div>`;
  }

  const favsSection = favs.length
    ? `<div class="mpi-popular-block" id="mpi-sec-favs">
        ${sectionLabelHtml("GBF Favs")}
        <div class="mpi-grid">${favs.map(mpiHtml).join("")}</div>
       </div>`
    : "";
  const dislikesSection = dislikes.length
    ? `<div class="mpi-dislike-block" id="mpi-sec-dislikes">
        ${sectionLabelHtml("GBF Hates")}
        <div class="mpi-grid">${dislikes.map(i => avgRatingMpiHtml(i, dislikeMap)).join("")}</div>
       </div>`
    : "";
  const controversialSection = controversial.length
    ? `<div class="mpi-controversial-block" id="mpi-sec-controversial">
        ${sectionLabelHtml("GBF Controversies")}
        <div class="mpi-grid">${controversial.map(i => avgRatingMpiHtml(i, controversialMap)).join("")}</div>
       </div>`
    : "";

  // Group by category if any items have one, else flat list
  const hasCats = items.some(i => i.category);
  let bodyHtml = "";
  const shortcutSections = [];
  if (favs.length) shortcutSections.push({ label: "Favs", id: "mpi-sec-favs" });
  if (dislikes.length) shortcutSections.push({ label: "Hates", id: "mpi-sec-dislikes" });
  if (controversial.length) shortcutSections.push({ label: "Controversies", id: "mpi-sec-controversial" });
  if (hasCats) {
    const catOrder = [];
    const catMap   = new Map();
    items.forEach(it => {
      const cat = it.category || "Other";
      if (!catMap.has(cat)) { catMap.set(cat, []); catOrder.push(cat); }
      catMap.get(cat).push(it);
    });
    const totalSections  = (favs.length ? 1 : 0) + (dislikes.length ? 1 : 0) + (controversial.length ? 1 : 0) + catOrder.length;
    const backToTopHtml  = totalSections > 1
      ? `<button type="button" class="mpi-back-to-top">&#9650; Back to Categories</button>`
      : "";
    bodyHtml = catOrder.map(cat => {
      const id = `mpi-sec-${slugify(cat)}`;
      shortcutSections.push({ label: cat, id });
      return `<div class="mpi-cat-block" id="${id}">
        ${sectionLabelHtml(cat)}
        <div class="mpi-grid">${catMap.get(cat).map(mpiHtml).join("")}</div>
        ${backToTopHtml}
       </div>`;
    }).join("");
  } else {
    bodyHtml = `<div class="mpi-grid">${items.map(mpiHtml).join("")}</div>`;
  }

  panel.innerHTML = imgHtml + favsSection + dislikesSection + controversialSection + bodyHtml;

  // Random Pick always shows (even with just one/no category) -- it's a
  // standalone tool, not a category jump link, so it doesn't depend on
  // there being multiple sections to jump between.
  const randomBtnHtml = `<button type="button" id="menu-random-pick-btn" class="menu-shortcut-btn menu-random-btn">Random Pick</button>`;
  const categoryBtnsHtml = shortcutSections.length > 1
    ? shortcutSections.map((s, i) =>
        `<button type="button" class="menu-shortcut-btn" style="z-index:${i + 1}" data-target="${escAttr(s.id)}">${esc(s.label)}</button>`
      ).join("")
    : "";
  shortcuts.innerHTML = categoryBtnsHtml + randomBtnHtml;

  shortcuts.onclick = e => {
    if (e.target.closest("#menu-random-pick-btn")) {
      // Today's restaurant's own menu only -- never the wider rotation.
      openRandomPickLightbox(items);
      return;
    }
    const btn = e.target.closest(".menu-shortcut-btn");
    if (!btn) return;
    document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
    </div>
    <div id="sides-pick-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose <strong id="sides-pick-count"></strong> sides for <strong id="sides-pick-item"></strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
      <div id="sides-pick-list" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;max-height:220px;overflow-y:auto"></div>
      <div style="display:flex;gap:0.5rem">
        <button type="button" id="sides-pick-add-btn" class="protein-btn protein-btn-add" disabled>Add to Order</button>
      </div>
    </div>
    <div id="size-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose an option for <strong id="size-prompt-item"></strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
      <div id="size-prompt-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.6rem"></div>
      <div style="display:flex;gap:0.5rem">
        <button type="button" id="size-prompt-add-btn" class="protein-btn protein-btn-add" disabled>Add to Order</button>
      </div>
    </div>
    <div id="sauce-pick-prompt" style="display:none;margin-top:0.5rem;padding:0.6rem 0.75rem;background:var(--bg);border:2px solid #000;border-radius:6px;font-size:0.85rem">
      <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose <strong id="sauce-pick-count"></strong> sauces for <strong id="sauce-pick-item"></strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
      <div id="sauce-pick-list" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;max-height:220px;overflow-y:auto"></div>
      <div style="display:flex;gap:0.5rem">
        <button type="button" id="sauce-pick-add-btn" class="protein-btn protein-btn-add" disabled>Add to Order</button>
      </div>
    </div>`;

  const input    = document.getElementById("menu-search");
  const dropdown = document.getElementById("menu-dropdown");
  let focusedIdx = -1;

  function renderDropdown(q) {
    const matches = q
      ? allMenuItems.filter(m => foldDiacritics(m.item).toLowerCase().includes(foldDiacritics(q).toLowerCase()))
      : allMenuItems;

    if (!matches.length) { dropdown.style.display = "none"; return; }

    focusedIdx = -1;
    dropdown.innerHTML = matches.map(m => {
      const takers  = takenItems[m.item.toLowerCase()] || [];
      const taken   = selectedItems.includes(m.item);
      const price   = m.price ? `<span class="dd-price">$${Number(m.price).toFixed(2)}</span>`
        : (m.sizes ? `<span class="dd-price">$${Math.min(...Object.values(m.sizes).map(Number)).toFixed(2)}+</span>` : "");
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
  if (meta && meta.sizes) {
    showSizePrompt(name, meta);
    return;
  }
  if (meta && meta.sidesPick) {
    showSidesPickPrompt(name, meta);
    return;
  }
  if (meta && meta.saucePick) {
    showSaucePickPrompt(name, meta);
    return;
  }
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

// For combo entrees that include "at least N regular sides" -- the picks are
// free (included in the base price), so the compact menu display just says
// "+ N sides" instead of listing every option inline.
function showSidesPickPrompt(baseName, meta) {
  const prompt = document.getElementById("sides-pick-prompt");
  const label  = document.getElementById("sides-pick-item");
  const count  = document.getElementById("sides-pick-count");
  const listEl = document.getElementById("sides-pick-list");
  const addBtn = document.getElementById("sides-pick-add-btn");
  if (!prompt) return;

  const n = meta.sidesPick.count || 2;
  label.textContent = baseName;
  count.textContent = n;
  listEl.innerHTML = meta.sidesPick.options.map(opt =>
    `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
      <input type="checkbox" class="sides-pick-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
      ${esc(opt)}
    </label>`
  ).join("");
  addBtn.disabled = true;
  prompt.style.display = "block";

  const boxes = [...listEl.querySelectorAll(".sides-pick-checkbox")];

  function onChange(e) {
    const box = e.target.closest(".sides-pick-checkbox");
    if (!box) return;
    const checked = boxes.filter(b => b.checked);
    if (checked.length > n) box.checked = false;
    addBtn.disabled = boxes.filter(b => b.checked).length !== n;
  }

  function commit() {
    const chosen = boxes.filter(b => b.checked).map(b => b.dataset.option);
    if (chosen.length !== n) return;
    const finalName = `${baseName} (${chosen.join(", ")})`;
    prompt.style.display = "none";
    cleanup();
    if (meta.saucePick) {
      showSaucePickPrompt(finalName, meta);
      return;
    }
    if (!selectedItems.includes(finalName)) {
      selectedItems.push(finalName);
      renderPills();
      checkDuplicates();
    }
  }
  function cleanup() {
    listEl.removeEventListener("change", onChange);
    addBtn.removeEventListener("click", commit);
  }
  listEl.addEventListener("change", onChange);
  addBtn.addEventListener("click", commit);
}

// Sauce choices are included free with chicken orders but are tracked as
// their own order lines (rather than folded into the dish name) so the
// Worksheet's "Group Duplicates" view can tally them across everyone's
// orders, e.g. "6x Sauce: Aji Amarillo Aoli".
function showSaucePickPrompt(finalDishName, meta) {
  const prompt = document.getElementById("sauce-pick-prompt");
  const label  = document.getElementById("sauce-pick-item");
  const count  = document.getElementById("sauce-pick-count");
  const listEl = document.getElementById("sauce-pick-list");
  const addBtn = document.getElementById("sauce-pick-add-btn");
  if (!prompt) {
    if (!selectedItems.includes(finalDishName)) {
      selectedItems.push(finalDishName);
      renderPills();
      checkDuplicates();
    }
    return;
  }

  const n = meta.saucePick.count || 2;
  label.textContent = finalDishName;
  count.textContent = n;
  listEl.innerHTML = meta.saucePick.options.map(opt =>
    `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
      <input type="checkbox" class="sauce-pick-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
      ${esc(opt)}
    </label>`
  ).join("");
  addBtn.disabled = true;
  prompt.style.display = "block";

  const boxes = [...listEl.querySelectorAll(".sauce-pick-checkbox")];

  function onChange(e) {
    const box = e.target.closest(".sauce-pick-checkbox");
    if (!box) return;
    const checked = boxes.filter(b => b.checked);
    if (checked.length > n) box.checked = false;
    addBtn.disabled = boxes.filter(b => b.checked).length !== n;
  }

  function commit() {
    const chosen = boxes.filter(b => b.checked).map(b => b.dataset.option);
    if (chosen.length !== n) return;
    prompt.style.display = "none";
    if (!selectedItems.includes(finalDishName)) selectedItems.push(finalDishName);
    chosen.forEach(sauce => selectedItems.push(`Sauce: ${sauce}`));
    renderPills();
    checkDuplicates();
    cleanup();
  }
  function cleanup() {
    listEl.removeEventListener("change", onChange);
    addBtn.removeEventListener("click", commit);
  }
  listEl.addEventListener("change", onChange);
  addBtn.addEventListener("click", commit);
}

// For standalone Sides A La Carte items: one canonical item, priced
// automatically from the Regular/Large size chosen (no duplicate menu rows).
function showSizePrompt(baseName, meta) {
  const prompt = document.getElementById("size-prompt");
  const label  = document.getElementById("size-prompt-item");
  const listEl = document.getElementById("size-prompt-list");
  const addBtn = document.getElementById("size-prompt-add-btn");
  if (!prompt) return;

  label.textContent = baseName;
  listEl.innerHTML = Object.entries(meta.sizes).map(([size, price]) =>
    `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
      <input type="radio" name="size-prompt-radio" class="size-prompt-radio" data-size="${escAttr(size)}" style="accent-color:var(--gold);width:15px;height:15px">
      ${esc(size)} <span style="color:var(--text-dim);font-size:0.8rem">$${Number(price).toFixed(2)}</span>
    </label>`
  ).join("");
  addBtn.disabled = true;
  prompt.style.display = "block";

  const boxes = [...listEl.querySelectorAll(".size-prompt-radio")];

  function onChange() {
    addBtn.disabled = !boxes.some(b => b.checked);
  }

  function commit() {
    const chosen = boxes.find(b => b.checked);
    if (!chosen) return;
    const finalName = `${baseName} (${chosen.dataset.size})`;
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

  if (debugNow() > getOrderDeadline().getTime()) {
    const proceed = await confirmModal(
      "This order is late — it may not reach the handler and isn't guaranteed to be included. Submit anyway?",
      { okLabel: "Submit Anyway", okColor: "#ff8c00" }
    );
    if (!proceed) return;
  }

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
  await Promise.all([loadHistory(), loadRatings()]);
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
// Production "Reset / Reopen New Round" button (PIN-gated) -- session-only,
// lets an organizer reopen ordering after Order Complete was logged too
// early, without touching the History sheet.
let _pinForceReopen = false;
const _reopenPin = atob("MjA3NDA=");
function isWeekEffectivelyComplete() {
  return weekComplete && !(DEBUG_MODE && _debugForceReopen) && !_pinForceReopen;
}
let _historyRows   = [];  // all-time, all restaurants -- Timestamp, Date, Restaurant, Item, Qty, Names
let _allRatingRows = [];  // all-time, all restaurants -- Timestamp, Date, Restaurant, Item, Rating (no Name column, kept anonymous)
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
let _mockOverrides = [];

// Once this week's order has been logged (via "Order Complete"), lock the
// order form and the Worksheet's edit/delete controls -- from that point
// the week is final and only viewing/rating should remain possible.
function applyOrderFreezeState() {
  const complete = isWeekEffectivelyComplete();
  const frozen = document.getElementById("frozen-overlay");
  if (frozen) frozen.style.display = complete ? "flex" : "none";

  const completeBtn = document.getElementById("order-complete-btn");
  if (completeBtn && !completeBtn.dataset.busy) {
    completeBtn.disabled    = complete;
    completeBtn.textContent = complete ? "Order Logged" : "Order Complete";
  }

  const reopenBtn = document.getElementById("reopen-round-btn");
  if (reopenBtn) reopenBtn.style.display = complete ? "flex" : "none";

  if (_lastOrderRows.length) renderOrdersTable();
}

// Manual restaurant-rotation override -- append-only, like History/Ratings,
// so an admin re-overriding the same week just adds another row and the
// latest one wins. An empty Restaurant value means "explicitly cleared,
// fall back to the normal rotation."
let _overrideRows = []; // Timestamp, Date, Restaurant, Reason

// Overrides submitted this session, always merged back in on refetch -- the
// Sheet's CSV export lags several seconds behind a write, so the immediate
// refetch right after applying an override would otherwise come back
// WITHOUT it, leaving the old round's orders/freeze visible until a later
// reload. Duplicates once the sheet catches up are harmless (latest-row-
// wins semantics, and both rows say the same thing).
let _optimisticOverrides = [];

async function loadOverrides() {
  if (MOCK_MODE) { _overrideRows = _mockOverrides; return; }
  if (!OVERRIDES_GID) { _overrideRows = [..._optimisticOverrides]; return; }
  try {
    const csv = await fetchCSV(OVERRIDES_GID);
    _overrideRows = parseCSV(csv).slice(1).concat(_optimisticOverrides);
  } catch {
    _overrideRows = [..._optimisticOverrides];
  }
}

function getOverrideRestaurant(date) {
  return getOverrideInfo(date)?.restaurant || null;
}

// Latest override row for a date, with its reason -- or null if there's no
// active override (either none was ever set, or the latest one was an
// explicit "clear"). Picked by timestamp, not array position, since
// _overrideRows can mix fetched sheet rows with session-optimistic ones.
function getOverrideInfo(date) {
  const rows = _overrideRows.filter(r => (r[1] || "").trim() === date);
  if (!rows.length) return null;
  const latest = rows.reduce((best, r) =>
    new Date(r[0]).getTime() >= new Date(best[0]).getTime() ? r : best);
  const restaurant = (latest[2] || "").trim();
  if (!restaurant) return null;
  return { restaurant, reason: (latest[3] || "").trim() };
}

// A finalized round's own History log timestamp -- or a restaurant override
// -- acts as the "round boundary" for a date. No new Orders/Drivers sheet
// column needed. Before any completion/override, everything shows (round
// 1). After either one, only orders submitted after that moment count as
// the new round -- old rows stay untouched in the sheet, just hidden. An
// override needs this too: switching restaurants means old orders were for
// a DIFFERENT restaurant's menu entirely, not just an earlier round of the
// same one.
function latestTimestampFor(rows, date) {
  return rows
    .filter(r => (r[1] || "").trim() === date)
    .map(r => new Date(r[0]).getTime())
    .filter(t => !isNaN(t))
    .reduce((a, b) => Math.max(a, b), 0);
}

function getRoundCutoff(date) {
  return Math.max(latestTimestampFor(_historyRows, date), latestTimestampFor(_overrideRows, date));
}

// The week counts as complete only if the most recent completion (History
// log) is NEWER than the most recent restaurant override for the date. An
// override starts a brand-new ordering session, cancelling any earlier
// completion for everyone -- persistently, across reloads and devices --
// until a fresh Order Complete is logged for the new round.
function computeWeekComplete() {
  const histTs = latestTimestampFor(_historyRows, currentFriday);
  const ovTs   = latestTimestampFor(_overrideRows, currentFriday);
  return histTs > 0 && histTs > ovTs;
}

async function loadHistory() {
  if (MOCK_MODE) {
    _historyRows = _mockHistory;
    weekComplete = computeWeekComplete();
    renderRatingCard();
    refreshMenuInsights();
    applyOrderFreezeState();
    return;
  }
  if (!HISTORY_GID) { weekComplete = false; renderRatingCard(); applyOrderFreezeState(); return; }
  try {
    const csv  = await fetchCSV(HISTORY_GID);
    const rows = parseCSV(csv).slice(1); // Timestamp, Date, Restaurant, Item, Qty, Names, Rated, RatedAt
    _historyRows = rows;
    weekComplete = computeWeekComplete();
  } catch {
    weekComplete = false;
  }
  renderRatingCard();
  refreshMenuInsights();
  applyOrderFreezeState();
}

// Ratings submitted this session, kept separately and always merged into
// _allRatingRows on refetch -- the Sheet's CSV export can lag several
// seconds behind a write, so a refetch alone could return data WITHOUT the
// just-submitted rows and make already-rated items pop back into the
// pending list. Duplicates (once the sheet catches up) are harmless.
let _optimisticRatings = [];

async function loadRatings() {
  if (MOCK_MODE) {
    _allRatingRows = _mockRatings;
    renderRatingCard();
    refreshMenuInsights();
    return;
  }
  if (!RATINGS_GID) { _allRatingRows = []; renderRatingCard(); return; }
  try {
    const csv  = await fetchCSV(RATINGS_GID);
    const rows = parseCSV(csv).slice(1); // Timestamp, Date, Restaurant, Item, Rating (no Name column, kept anonymous)
    _allRatingRows = rows.concat(_optimisticRatings);
  } catch {
    _allRatingRows = [..._optimisticRatings];
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
    // Rating is always the LAST column -- tolerates the pre-redeploy
    // period where the live Apps Script might still be writing the old
    // 6-column schema (Timestamp, Date, Restaurant, Item, Name, Rating)
    // instead of the current 5-column one, without needing to know which.
    const rating = Number(r[r.length - 1]);
    if (!item || isNaN(rating)) return;
    const e = entryFor(item);
    e.ratingSum   += rating;
    e.ratingCount += 1;
  });

  return stats;
}

// One point per date this item has any ratings, averaged if more than one
// person rated it that same day -- sorted chronologically for the trend
// line. Ratings have no name column, so this is as granular as it gets.
function computeItemRatingTrend(restaurant, item) {
  const name = (restaurant || "").trim().toLowerCase();
  const itemLower = (item || "").trim().toLowerCase();
  const byDate = new Map(); // date -> { sum, count }
  _allRatingRows.forEach(r => {
    if ((r[2] || "").trim().toLowerCase() !== name) return;
    if ((r[3] || "").trim().toLowerCase() !== itemLower) return;
    const date = (r[1] || "").trim();
    const rating = Number(r[r.length - 1]); // last column, tolerant of old/new schema
    if (!date || isNaN(rating)) return;
    if (!byDate.has(date)) byDate.set(date, { sum: 0, count: 0 });
    const e = byDate.get(date);
    e.sum += rating;
    e.count += 1;
  });
  return [...byDate.entries()]
    .map(([date, e]) => ({ date, avg: e.sum / e.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  const controversialMap = new Map();
  stats.forEach((s, key) => {
    const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null;
    if (s.weeksOrdered.size >= 2) favSet.add(key);
    if (avg !== null && avg < 3) dislikeMap.set(key, avg);
    // Ordered more than twice (3+ separate weeks) but still averaging below
    // a middling 5/10 -- popular enough to keep coming back to, yet split
    // opinion on whether it's actually good.
    if (s.weeksOrdered.size > 2 && avg !== null && avg < 5) controversialMap.set(key, avg);
  });
  const imgs = currentRestaurantObj.menuImages ||
    (currentRestaurantObj.menuImage ? [currentRestaurantObj.menuImage] : []);
  buildMenuPanel(currentRestaurantObj.menu || [], currentRestaurantObj.name, currentRestaurantObj.menuUrl || "", imgs, favSet, dislikeMap, controversialMap);
}

// The History sheet's Rated column (index 6) is the source of truth --
// History rows are per-orderer (one row per person per item, not
// aggregated), so a rating only flips ITS rater's own row, and the prompt
// keeps asking anyone else who separately ordered the same dish. A rating
// task is keyed by date+restaurant+item+name to match that per-person
// semantics (this key never touches the Ratings sheet itself, which stays
// anonymous). The History CSV export can lag behind a just-submitted
// rating by a few minutes though, so a local optimistic overlay in
// localStorage covers that gap until the next refetch confirms it
// server-side.
function ratedKey(date, restaurant, item, name) {
  return `${date}|${restaurant.trim().toLowerCase()}|${item.toLowerCase()}|${name.trim().toLowerCase()}`;
}
function getLocallyRatedKeys() {
  try { return new Set(JSON.parse(localStorage.getItem("ratedItemKeys") || "[]")); }
  catch { return new Set(); }
}
function markLocallyRated(keys) {
  const set = getLocallyRatedKeys();
  keys.forEach(k => set.add(k));
  localStorage.setItem("ratedItemKeys", JSON.stringify([...set]));
}
function isRated(date, restaurant, item, name) {
  return getLocallyRatedKeys().has(ratedKey(date, restaurant, item, name));
}
// History row's Rated column (index 6), tolerant of "1"/"TRUE"/1/true.
function isHistoryRowRated(r) {
  const v = (r[6] ?? "").toString().trim().toLowerCase();
  return v === "1" || v === "true";
}

// Pending ratings for a person, across all-time History (not just the
// current week) -- grouped by "date|restaurant" so old unrated dishes stay
// reachable indefinitely instead of disappearing once the week rotates.
// Sorted most-recent first.
function getPendingRatings(name) {
  const lname = name.trim().toLowerCase();
  const groups = new Map(); // "date|restaurant" -> Map(itemLower -> item)
  _historyRows.forEach(r => {
    const date       = (r[1] || "").trim();
    const restaurant = (r[2] || "").trim();
    const item       = (r[3] || "").trim();
    const names      = (r[5] || "").split(",").map(n => n.trim().toLowerCase());
    if (!date || !item || item.startsWith("Sauce: ") || !names.includes(lname)) return;
    // Server-confirmed (Rated column) or optimistically-just-submitted
    // (localStorage, ahead of the History CSV catching up) both count.
    if (isHistoryRowRated(r) || isRated(date, restaurant, item, name)) return;
    const key = `${date}|${restaurant}`;
    // Same item can appear in multiple History rows for the same date+
    // restaurant (e.g. a reopened round re-logging the same dish) -- only
    // one rating task per item should show, not one per History row.
    if (!groups.has(key)) groups.set(key, new Map());
    const itemMap = groups.get(key);
    itemMap.set(item.toLowerCase(), item);
  });
  return [...groups.entries()]
    .map(([key, itemMap]) => [key, [...itemMap.values()]])
    .sort((a, b) => b[0].localeCompare(a[0]));
}

function fmtRatingDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pendingCountFor(name) {
  return getPendingRatings(name).reduce((sum, [, items]) => sum + items.length, 0);
}

let _selectedRatingName = "";
// Set right before a re-render so the confirmation message survives the
// rebuild of the (same, still-open) person's block; cleared whenever a
// name is opened/closed so it never leaks into a different person's view.
let _ratingStatusMsg = "";

function renderRatingCard() {
  const card = document.getElementById("rating-card");
  if (!card) return;

  // Only people with something left to rate appear -- once someone's fully
  // rated, their row disappears too, and with no one pending the whole card
  // hides. Rated data lives on in the sheet for the Rotation & Data reports.
  const names = [...new Set(_historyRows.flatMap(r => (r[5] || "").split(",").map(n => n.trim()).filter(Boolean)))]
    .map(n => ({ name: n, pending: pendingCountFor(n) }))
    .filter(n => n.pending > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!names.length) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  if (!names.some(n => n.name === _selectedRatingName)) _selectedRatingName = "";

  // Each name is its own accordion row -- clicking it opens/rates right
  // underneath that row, and clicking the same (already open) name again
  // collapses it back, instead of a single shared list at the bottom.
  const tableEl = document.getElementById("rating-names-table");
  tableEl.innerHTML = names.map(({ name: n, pending }) => {
    const active = n === _selectedRatingName;
    return `<div class="rating-name-block${active ? " active" : ""}">
      <div class="rating-name-row${active ? " active" : ""}" data-name="${escAttr(n)}">
        <span class="rating-name">${esc(n)}</span>
        <span class="rating-name-status">${pending} to rate</span>
        <button type="button" class="btn-secondary rating-name-btn">${active ? "Close" : "Rate"}</button>
      </div>
      ${active ? renderRatingItemsHtml(n) : ""}
    </div>`;
  }).join("");

  tableEl.querySelectorAll(".rating-name-row").forEach(row => {
    row.addEventListener("click", () => {
      const clicked = row.dataset.name;
      _selectedRatingName = clicked === _selectedRatingName ? "" : clicked;
      _ratingTouched.clear();
      _ratingStatusMsg = "";
      renderRatingCard();
    });
  });

  bindRatingItemEvents();
}

function renderRatingItemsHtml(name) {
  const groups = getPendingRatings(name);
  const statusHtml = _ratingStatusMsg
    ? `<div class="rating-status">${esc(_ratingStatusMsg)}</div>` : "";

  // Rated items disappear entirely -- the data lives in the Ratings sheet
  // and surfaces only through the Rotation & Data restaurant reports.
  if (!groups.length) {
    return `<div class="rating-name-content">
      <div class="placeholder">${esc(name)} is all caught up &mdash; nothing to rate.</div>
      ${statusHtml}
    </div>`;
  }

  const groupsHtml = groups.map(([groupKey, items]) => {
    const [date, restaurant] = groupKey.split("|");
    const rows = items.slice().sort((a, b) => a.localeCompare(b)).map(item => {
      const key = `${groupKey}|${item.toLowerCase()}`;
      return `<div class="rating-item-row" data-date="${escAttr(date)}" data-restaurant="${escAttr(restaurant)}" data-item="${escAttr(item)}">
        <span class="rating-item-name">${esc(item)}</span>
        <div class="rating-item-input-wrap">
          <input type="range" class="rating-item-slider" min="1" max="10" step="1" value="5" data-key="${escAttr(key)}">
          <span class="rating-item-value">&mdash;</span>
        </div>
      </div>`;
    }).join("");
    return `<div class="rating-date-group">
      <div class="rating-date-header">${esc(fmtRatingDate(date))} &mdash; ${esc(restaurant)}</div>
      ${rows}
    </div>`;
  }).join("");

  return `<div class="rating-name-content">
    <div class="rating-items-list">${groupsHtml}</div>
    <button type="button" class="btn btn-primary rating-submit-btn">Submit Ratings</button>
    ${statusHtml}
  </div>`;
}

function bindRatingItemEvents() {
  const tableEl = document.getElementById("rating-names-table");

  tableEl.querySelectorAll(".rating-item-slider").forEach(slider => {
    slider.addEventListener("input", () => {
      _ratingTouched.add(slider.dataset.key);
      slider.nextElementSibling.textContent = slider.value;
    });
  });

  const submitBtn = tableEl.querySelector(".rating-submit-btn");
  submitBtn?.addEventListener("click", () => submitRatings(submitBtn));
}

async function submitRatings(btn) {
  const name = _selectedRatingName;
  const block = btn.closest(".rating-name-content");

  if (!name) return;

  const rows = [...block.querySelectorAll(".rating-item-row[data-item]")];
  const toSubmit = rows
    .map(row => ({
      date: row.dataset.date,
      restaurant: row.dataset.restaurant,
      item: row.dataset.item,
      slider: row.querySelector(".rating-item-slider"),
    }))
    .filter(r => _ratingTouched.has(r.slider.dataset.key));

  if (!toSubmit.length) {
    _ratingStatusMsg = "Move a slider for at least one item first.";
    renderRatingCard();
    return;
  }

  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const now = new Date().toISOString();
    if (MOCK_MODE) {
      toSubmit.forEach(r => {
        _mockRatings.push([now, r.date, r.restaurant, r.item, r.slider.value]);
        const lname = name.trim().toLowerCase();
        const histRow = _mockHistory.find(h =>
          h[1] === r.date && h[2] === r.restaurant && h[3] === r.item &&
          (h[5] || "").split(",").map(n => n.trim().toLowerCase()).includes(lname));
        if (histRow) { histRow[6] = 1; histRow[7] = now; }
      });
    } else {
      if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
      await Promise.all(toSubmit.map(r => {
        const params = new URLSearchParams({
          type: "rating",
          date: r.date,
          restaurant: r.restaurant,
          item: r.item,
          rating: r.slider.value,
          // Only used server-side to find which History row to mark rated
          // (one row per person per item) -- never written to the Ratings
          // sheet itself, so ratings stay anonymous there.
          raterName: name,
        });
        return fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
      }));
      // Apply optimistically -- and remember in _optimisticRatings so a
      // later refetch against a still-stale CSV export can't revive the
      // just-rated items (loadRatings always merges these back in).
      toSubmit.forEach(r => {
        const row = [now, r.date, r.restaurant, r.item, r.slider.value];
        _allRatingRows.push(row);
        _optimisticRatings.push(row);
      });
    }
    // Optimistic overlay until the History sheet's Rated column catches up
    // (Apps Script write + CSV export can lag a few minutes).
    markLocallyRated(toSubmit.map(r => ratedKey(r.date, r.restaurant, r.item, name)));
    _ratingTouched.clear();
    _ratingStatusMsg = `Submitted ${toSubmit.length} rating${toSubmit.length === 1 ? "" : "s"}. Thank you!`;
    renderRatingCard();
    setTimeout(loadRatings, 2000);
  } catch (err) {
    _ratingStatusMsg = "Could not submit — " + err.message;
    renderRatingCard();
  }
}

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
  if (m) return m;
  // Diacritic-folded match -- covers hand-typed History/Ratings rows (e.g.
  // backfilled past orders) where accents/tone marks were retyped slightly
  // differently, or in a different Unicode normalization form, than the
  // menu's own text.
  const folded = foldDiacritics(lower);
  m = menu.find(i => foldDiacritics(i.item.toLowerCase()) === folded);
  return m || null;
}

// Resolves the price for one order-line item. meta.sizes is a generic
// {optionName: price} map -- Regular/Large for Sides A La Carte, but also
// Chicken/Steak, Fish/+Seafood, etc. for entrees priced by protein choice
// ("Pollo o Lomo Saltado (Steak)" -> meta.sizes.Steak). Falls through to the
// flat price for everything else, including non-price-affecting parenthetical
// suffixes like an orOptions choice or a "(SideA, SideB)" sidesPick tag.
function resolveItemPrice(itemText, menu) {
  const m = itemText.match(/^(.*)\s\((.+)\)$/);
  if (m) {
    const meta = findMenuItem(m[1].trim(), menu);
    if (meta?.sizes && Object.prototype.hasOwnProperty.call(meta.sizes, m[2])) {
      return Number(meta.sizes[m[2]]) || 0;
    }
  }
  const baseName = itemText.replace(/\s*\(.*\)\s*$/, "").trim();
  const meta = findMenuItem(baseName, menu) || findMenuItem(itemText, menu);
  return Number(meta?.price) || 0;
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
    const meta = findMenuItem(baseName.replace(/\s*\(.*\)\s*$/, "").trim()) || findMenuItem(baseName);
    if (!meta) return;
    total += resolveItemPrice(baseName);
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
    const roundCutoff = getRoundCutoff(currentFriday);
    const allRows = parseCSV(csv).slice(1).filter(r => {
      if (!r[1]) return false;
      const ts = r[0] ? new Date(r[0]) : null;
      if (!ts || ts < saturday || ts > friday) return false;
      if (roundCutoff && ts.getTime() <= roundCutoff) return false;
      return true;
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
        if (item.startsWith("Sauce: ")) return; // free sauce picks aren't order collisions
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
        const meta     = findMenuItem(baseName.replace(/\s*\(.*\)\s*$/, "").trim()) || findMenuItem(baseName);
        const itemPrice = resolveItemPrice(baseName);
        const price    = (showPrices && itemPrice) ? `<span class="td-item-price">$${itemPrice.toFixed(2)}</span>` : "";
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
        const groupItemPrice = resolveItemPrice(baseName);
        const priceHtml = (showPrices && groupItemPrice)
          ? `<span class="grouped-item-price">$${(groupItemPrice * g.count).toFixed(2)}</span>`
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

// Strips accents/tone marks (Vietnamese, etc.) so menu search matches
// "Bun" against "Bún" -- NFD splits a letter from its combining diacritics,
// but "đ" is a distinct base letter (not a combining composition), so it
// needs its own explicit fold.
function foldDiacritics(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

// CSS `resize: vertical` has no touch affordance at all on mobile browsers
// (no handle renders, nothing to drag) -- this wires an explicit drag bar
// with Pointer Events, which unify mouse and touch, as a mobile-friendly
// stand-in that works alongside the native corner grabber on desktop.
function makeManualResizable(el, grip, minH, maxH) {
  if (!el || !grip) return;
  let startY = 0, startH = 0, active = false;
  grip.addEventListener("pointerdown", e => {
    active = true;
    startY = e.clientY;
    startH = el.getBoundingClientRect().height;
    grip.classList.add("dragging");
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener("pointermove", e => {
    if (!active) return;
    const h = Math.max(minH, Math.min(maxH, startH + (e.clientY - startY)));
    el.style.height = `${h}px`;
  });
  function end() { active = false; grip.classList.remove("dragging"); }
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}
makeManualResizable(document.getElementById("menu-panel"), document.getElementById("menu-panel-grip"), 160, 2000);
makeManualResizable(document.getElementById("plinko-board"), document.getElementById("plinko-board-grip"), 290, 3000);
// Same grip also resizes the Wheel board (only one of the two is ever
// visible at once) so switching modes doesn't reset size.
makeManualResizable(document.getElementById("wheel-board"), document.getElementById("plinko-board-grip"), 290, 3000);

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

// The deadline no longer hard-blocks the form -- it just warns via the
// Submit button's own styling, gated by a confirm step at actual submit
// time (see the order-form submit handler).
function updateLateWarning(isLate) {
  const btn = document.getElementById("order-btn");
  if (btn) btn.classList.toggle("late", isLate);
}

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
    updateLateWarning(diff <= 0);
    if (diff <= 0) {
      el.innerHTML = `<span class="countdown-label" style="flex:1;cursor:pointer" id="deadline-label">ORDER BY<br><span class="countdown-label-time">${fmtTime()}</span></span>
        <span style="padding:0.75rem 1rem;font-weight:900;letter-spacing:0.18em;font-size:0.85rem;flex:1;text-align:center">ORDERS CLOSED</span>`;
      document.getElementById("deadline-label")?.addEventListener("click", showEditor);
      return;
    }
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
    white: "#ffffff", offwhite: "#fafcc4", wrinkled: "#f0ead6", newspaper: "#e8e4d2",
    lightpink: "#ffd1e8", yellow: "#fcf811", juicyyellow: "#ffd500", grey: "#b8c4c6",
    green: "#39ff14", emerald: "#10b981", cyan: "#0abab5", pink: "#fc16ac"
  };
  const switcher   = document.getElementById("theme-switcher");
  const darkBtn    = document.getElementById("dark-toggle");
  const currentEl  = document.getElementById("theme-current");
  const swatches   = document.querySelectorAll(".theme-swatch");
  const themeColorMeta = document.getElementById("theme-color-meta");

  // `position: fixed; bottom: ...` alone is unreliable on mobile browsers --
  // the dynamic address-bar/toolbar showing or hiding changes the *visible*
  // (visual) viewport without necessarily reflowing what `vh`/fixed-bottom
  // are computed against, so the widget can end up floating well above the
  // real bottom of the screen. window.visualViewport tracks the actually-
  // visible area directly, so anchor to that instead whenever it exists.
  if (switcher && window.visualViewport) {
    const MARGIN = 20; // ~1.25rem
    const vv = window.visualViewport;
    function pinToVisualViewport() {
      const rightGap  = window.innerWidth  - (vv.offsetLeft + vv.width);
      const bottomGap = window.innerHeight - (vv.offsetTop + vv.height);
      switcher.style.right  = `${rightGap + MARGIN}px`;
      switcher.style.bottom = `${bottomGap + MARGIN}px`;
    }
    vv.addEventListener("resize", pinToVisualViewport);
    vv.addEventListener("scroll", pinToVisualViewport);
    window.addEventListener("resize", pinToVisualViewport);
    pinToVisualViewport();
  }

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
    document.dispatchEvent(new CustomEvent("themechange"));
  }

  function applyDark(on) {
    document.body.classList.toggle("dark", on);
    darkBtn.textContent = on ? "☀" : "☾";
    localStorage.setItem("darkMode", on ? "1" : "0");
    syncThemeColorMeta();
    document.dispatchEvent(new CustomEvent("themechange"));
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

// Exposes the current theme's true color-wheel complement (same HSL
// hue+180 math as the Drop Game's colored slots) as a CSS custom property,
// so any stylesheet rule can pick it up with var(--theme-complement)
// instead of a fixed hover color -- used by the menu search dropdown.
(function() {
  function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
  function updateThemeComplement() {
    const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#fcf811";
    const [h, s, l] = hexToHsl(accent);
    const complement = hslToHex((h + 180) % 360, Math.max(s, 55), l);
    document.documentElement.style.setProperty("--theme-complement", complement);

    // Every theme sets --accent equal to --bg, so anything colored with
    // --accent directly (like the secret-game toggle arrow) is literally
    // invisible against the page background. This keeps the SAME hue --
    // it's meant to read as "the theme color, just visible" -- but pulls
    // saturation down and pins lightness to a mid-range band so it always
    // contrasts against a bg that could be anywhere from pastel-light to
    // neon-bright.
    const darkerTone = hslToHex(h, Math.max(35, s * 0.5), Math.min(48, Math.max(35, l)));
    document.documentElement.style.setProperty("--theme-arrow", darkerTone);
  }
  document.addEventListener("themechange", updateThemeComplement);
  updateThemeComplement();
})();

startCountdown();
init();

// Version tag and Changelog slidedown both show everywhere, prod included,
// so anyone can see what shipped and when.
{
  const versionEl = document.getElementById("build-version");
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;
}

{
  const toggleBtn = document.getElementById("changelog-toggle-btn");
  const clPanel   = document.getElementById("changelog-panel");
  if (toggleBtn && clPanel) {
    toggleBtn.style.display = "inline-flex";
    clPanel.innerHTML = CHANGELOG.map(entry => `
      <div class="changelog-entry">
        <div class="changelog-entry-header"><span>v${esc(entry.version)}</span><span>${esc(entry.date)}</span></div>
        <ul>${entry.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      </div>
    `).join("");
    toggleBtn.addEventListener("click", () => {
      const open = !toggleBtn.classList.contains("open");
      toggleBtn.classList.toggle("open", open);
      clPanel.classList.toggle("open", open);
    });
  }
}

if (DEBUG_MODE) {
  const panel     = document.getElementById("debug-clock");
  const input     = document.getElementById("debug-clock-input");
  const statusEl  = document.getElementById("debug-clock-status");
  const toggleBtn = document.getElementById("debug-clock-toggle");
  const body      = document.getElementById("debug-clock-body");
  panel.style.display = "flex";

  const startOpen = localStorage.getItem("debugClockOpen") === "1";
  toggleBtn.classList.toggle("open", startOpen);
  body.classList.toggle("open", startOpen);
  toggleBtn.addEventListener("click", () => {
    const open = !toggleBtn.classList.contains("open");
    toggleBtn.classList.toggle("open", open);
    body.classList.toggle("open", open);
    localStorage.setItem("debugClockOpen", open ? "1" : "0");
  });

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

// Restaurant-badge slidedown: the Override Restaurant button stays hidden
// until the badge (or its small arrow) is clicked.
document.getElementById("restaurant-toggle-btn")?.addEventListener("click", () => {
  const btn   = document.getElementById("restaurant-toggle-btn");
  const panel = document.getElementById("restaurant-tools-panel");
  const open  = !btn.classList.contains("open");
  btn.classList.toggle("open", open);
  panel?.classList.toggle("open", open);
});

// Floating override tooltip: positioned via JS and appended to <body> so
// .friday-calendar's overflow:hidden can't clip it at the table edge.
document.addEventListener("mouseover", e => {
  const tip = document.getElementById("override-flag-tooltip");
  if (!tip) return;
  const flag = e.target.closest?.(".fcal-override-flag");
  if (!flag) { tip.style.display = "none"; return; }

  tip.textContent = flag.dataset.tip || "";
  tip.style.display = "block";
  const fr = flag.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  let left = fr.left + fr.width / 2 - tr.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
  let top = fr.top - tr.height - 8;
  if (top < 8) top = fr.bottom + 8;
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
});

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
      items.forEach(it => _mockHistory.push([now, currentFriday, restaurant, it.name, it.qty, it.names.join(", "), 0, ""]));
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
    // A prior PIN reopen only unlocks for one new round -- once that round
    // is logged, let the normal freeze take over again instead of staying
    // permanently unlocked for the rest of this tab's session.
    _pinForceReopen = false;
    await loadHistory(); // sets weekComplete + freezes the form/buttons via applyOrderFreezeState()
  } catch (err) {
    delete btn.dataset.busy;
    btn.disabled = false;
    btn.textContent = "Order Complete";
    status.style.display = "block";
    status.textContent = "Could not log — " + err.message;
  }
});

function promptPin(message) {
  return new Promise(resolve => {
    const modal = document.getElementById("pin-modal");
    const msg   = document.getElementById("pin-modal-msg");
    const input = document.getElementById("pin-modal-input");
    const error = document.getElementById("pin-modal-error");
    const okBtn = document.getElementById("pin-modal-ok");
    const cancel = document.getElementById("pin-modal-cancel");

    if (msg && message) msg.textContent = message;
    input.value = "";
    error.style.display = "none";
    modal.style.display = "flex";
    input.focus();

    function close(result) {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKeydown);
      resolve(result);
    }
    function onOk() {
      if (input.value === _reopenPin) { close(true); }
      else { error.style.display = "block"; input.value = ""; input.focus(); }
    }
    function onCancel() { close(false); }
    function onKeydown(e) { if (e.key === "Enter") onOk(); }

    okBtn.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKeydown);
  });
}

document.getElementById("reopen-round-btn").addEventListener("click", async () => {
  const unlocked = await promptPin("Enter PIN to reopen ordering for a new round.");
  if (!unlocked) return;

  _pinForceReopen = true;

  const status = document.getElementById("order-complete-status");
  status.style.display = "block";
  status.textContent = "Reopened for a new ordering round.";
  applyOrderFreezeState();
  await loadRestaurant();
  await loadData();
});

function promptOverridePicker() {
  return new Promise(resolve => {
    const modal  = document.getElementById("override-modal");
    const list   = document.getElementById("override-modal-list");
    const cancel = document.getElementById("override-modal-cancel");

    const names = [...new Set((_restaurantsConfig?.restaurants || []).map(r => r.name).filter(Boolean))];
    list.innerHTML = names.map(n => `
      <button type="button" class="btn-secondary override-modal-item" data-name="${escAttr(n)}" style="margin-top:0">${esc(n)}</button>
    `).join("") + `
      <button type="button" class="btn-secondary override-modal-item" data-name="" style="margin-top:0">Clear override (use scheduled rotation)</button>
    `;

    modal.style.display = "flex";

    function close(result) {
      modal.style.display = "none";
      list.removeEventListener("click", onItemClick);
      cancel.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onItemClick(e) {
      const btn = e.target.closest(".override-modal-item");
      if (!btn) return;
      close(btn.dataset.name);
    }
    function onCancel() { close(null); }

    list.addEventListener("click", onItemClick);
    cancel.addEventListener("click", onCancel);
  });
}

function promptOverrideReason(label) {
  return new Promise(resolve => {
    const modal  = document.getElementById("override-reason-modal");
    const msg    = document.getElementById("override-reason-msg");
    const input  = document.getElementById("override-reason-input");
    const okBtn  = document.getElementById("override-reason-ok");
    const cancel = document.getElementById("override-reason-cancel");

    msg.textContent = `Override this week's restaurant to ${label}? Everyone will see this change.`;
    input.value = "";
    modal.style.display = "flex";
    input.focus();

    function close(result) {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk() { close(input.value.trim()); }
    function onCancel() { close(null); }

    okBtn.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
  });
}

document.getElementById("override-restaurant-btn")?.addEventListener("click", async () => {
  const unlocked = await promptPin("Enter PIN to override this week's restaurant.");
  if (!unlocked) return;

  const picked = await promptOverridePicker();
  if (picked === null) return; // cancelled

  const label = picked || "the scheduled rotation";
  const reason = await promptOverrideReason(label);
  if (reason === null) return; // cancelled

  try {
    if (MOCK_MODE) {
      _mockOverrides.push([new Date().toISOString(), currentFriday, picked, reason]);
    } else {
      if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
      const params = new URLSearchParams({ type: "override", date: currentFriday, restaurant: picked, reason });
      await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
      // Remember it locally too -- the immediate refetch below usually hits
      // a still-stale CSV export that doesn't include this write yet, which
      // would leave the old round's orders/freeze visible until a later
      // reload. loadOverrides() merges these back in on every refetch.
      _optimisticOverrides.push([new Date().toISOString(), currentFriday, picked, reason]);
    }
    await loadRestaurant();
    await loadData();
  } catch (err) {
    alert("Could not apply override — " + err.message);
  }
});

const TAX_RATE = 1.06;
let _reportRestaurant = null;
let _reportMenu = null;
// Which Past Orders date groups are expanded. null = "not initialized yet";
// on first render all dates default open, and the set then persists across
// checkbox-driven re-renders so toggling an option never collapses a group
// the user had open.
let _openReportDates = null;

function openMenuReport(restaurantName) {
  ensureReportListeners();

  const modal = document.getElementById("report-modal");
  const title = document.getElementById("report-modal-title");
  title.textContent = `${restaurantName} — Order History & Ratings`;

  _openReportDates = null;
  _reportRestaurant = restaurantName;
  // Looked up from the target restaurant's own menu (not just whichever one
  // happens to be on screen), so this works correctly from the rotation list.
  _reportMenu = findRestaurantByName(restaurantName)?.menu || allMenuItems;

  refreshReportModal();
  modal.classList.add("open");

  // Item Stats opens expanded by default now, instead of requiring a click
  // every time the report is opened.
  document.getElementById("report-stats-toggle-btn")?.classList.add("open");
  document.getElementById("report-stats-panel")?.classList.add("open");
}

function refreshReportModal() {
  if (!_reportRestaurant) return;
  // The checkboxes only shape the Past Orders section (per-person view) and
  // the Total Spent line -- the Item Stats table always shows its all-time
  // aggregate columns as-is.
  const showTax     = document.getElementById("report-show-tax")?.checked;
  const showNames   = document.getElementById("report-show-names")?.checked;

  const tbody = document.getElementById("report-modal-tbody");
  const empty = document.getElementById("report-modal-empty");

  const stats = computeItemStats(_reportRestaurant);
  const rows = [...stats.values()].filter(s => s.qty > 0 || s.ratingCount > 0);
  rows.sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));

  const groups = computeDateBreakdown();

  // Total spent sums the per-person breakdown (each person's dish at the
  // item's *current* menu price -- an approximation if prices have since
  // changed), so duplicate History logs don't inflate it.
  const totalEl = document.getElementById("report-modal-total");
  let totalSpent = groups.reduce((sum, g) => sum + g.subtotal, 0);
  if (showTax) totalSpent *= TAX_RATE;
  if (totalEl) {
    totalEl.textContent = groups.length ? `Total Spent: $${totalSpent.toFixed(2)}${showTax ? " (+6% tax)" : ""}` : "";
    totalEl.style.display = groups.length ? "block" : "none";
  }

  if (!rows.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    tbody.innerHTML = rows.map(s => {
      const avg = s.ratingCount ? (s.ratingSum / s.ratingCount) : null;
      const avgLabel = avg === null ? "—" : `${avg.toFixed(1)}/10`;
      const cls = s.weeksOrdered.size >= 2 ? "report-fav" : (avg !== null && avg < 3 ? "report-dislike" : "");
      return `<tr class="report-item-row" data-item="${escAttr(s.label)}">
        <td class="${cls}">${esc(s.label)}</td>
        <td>${s.qty}</td>
        <td>${avgLabel}</td>
      </tr>`;
    }).join("");
    tbody.querySelectorAll(".report-item-row").forEach(tr => {
      tr.addEventListener("click", () => openItemDetail(_reportRestaurant, tr.dataset.item));
    });
  }

  renderReportHistory(groups, showNames, showTax);
}

// Per-date breakdown for the "Past Orders" section: one entry PER PERSON
// per item (from History's Names column), not aggregated by item -- so each
// person's dish shows individually with its price and THAT person's own
// rating for that date, not an average. The same person+item across
// duplicate History logs (re-completed rounds) dedupes to one entry. Old
// pre-Names History rows fall back to a nameless aggregated entry.
function computeDateBreakdown() {
  const name = _reportRestaurant.trim().toLowerCase();
  const byDate = new Map(); // date -> Map("person|item" -> {person, item, qty})
  _historyRows.forEach(r => {
    if ((r[2] || "").trim().toLowerCase() !== name) return;
    const date   = (r[1] || "").trim();
    const item   = (r[3] || "").trim();
    const qty    = Number(r[4]) || 0;
    const people = (r[5] || "").split(",").map(n => n.trim()).filter(Boolean);
    if (!date || !item) return;
    if (!byDate.has(date)) byDate.set(date, new Map());
    const entries = byDate.get(date);
    if (people.length) {
      people.forEach(p => {
        const key = `${p.toLowerCase()}|${item.toLowerCase()}`;
        if (!entries.has(key)) entries.set(key, { person: p, item, qty: 1 });
      });
    } else {
      const key = `|${item.toLowerCase()}`;
      if (!entries.has(key)) entries.set(key, { person: "", item, qty: 0 });
      entries.get(key).qty += qty;
    }
  });

  return [...byDate.entries()].map(([date, entries]) => {
    const items = [...entries.values()].map(e => {
      const resolvedPrice = resolveItemPrice(e.item, _reportMenu);
      const price = resolvedPrice || null;
      // Ratings have no name column (kept anonymous even in the raw sheet),
      // so a per-person rating can no longer be looked up here at all.
      return { person: e.person, item: e.item, qty: e.qty || 1, price };
    }).sort((a, b) => a.person.localeCompare(b.person) || a.item.localeCompare(b.item));
    const subtotal = items.reduce((sum, it) => sum + (it.price ? it.price * it.qty : 0), 0);
    return { date, items, subtotal };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function renderReportHistory(groups, showNames, showTax) {
  const container = document.getElementById("report-modal-history");
  const titlebar  = document.getElementById("report-history-titlebar");
  if (!container) return;

  if (titlebar) titlebar.style.display = groups.length ? "flex" : "none";
  if (!groups.length) { container.innerHTML = ""; return; }

  // First render for this restaurant: all date groups start collapsed; the
  // set then remembers what the user opens across checkbox re-renders.
  if (_openReportDates === null) _openReportDates = new Set();

  container.innerHTML = groups.map(g => {
    const subtotal = showTax ? g.subtotal * TAX_RATE : g.subtotal;
    const open = _openReportDates.has(g.date);
    // Flat rows sorted by username (computeDateBreakdown already sorts by
    // person, then item): name and item sit flat on one line, price right.
    // Ratings are never shown here (they're per-person) to keep them
    // anonymous -- only the Item Stats' all-time average is ever exposed.
    const rows = g.items.map(it => {
      const qtyLabel    = it.qty > 1 ? ` &times;${it.qty}` : "";
      const price       = it.price !== null ? it.price * it.qty * (showTax ? TAX_RATE : 1) : null;
      const priceLabel  = price !== null ? `$${price.toFixed(2)}` : "";
      // Name/item/price are always 3 fixed grid columns (25%/60%/15%) --
      // the name cell is still rendered (just left empty) when the Names
      // checkbox is off, so hiding it doesn't shift item/price out of
      // their columns.
      return `<div class="report-history-item">
        <span class="rhi-user">${showNames && it.person ? esc(it.person) : ""}</span>
        <span class="rhi-item">${esc(it.item)}${qtyLabel}</span>
        <span class="report-history-item-meta">${priceLabel}</span>
      </div>`;
    }).join("");
    return `<div class="report-history-group">
      <button type="button" class="report-history-header${open ? " open" : ""}" data-date="${escAttr(g.date)}">
        <span>${esc(fmtRatingDate(g.date))}</span>
        <span>${subtotal ? `$${subtotal.toFixed(2)} ` : ""}<span class="report-history-arrow">&#9660;</span></span>
      </button>
      <div class="report-history-body${open ? " open" : ""}">${rows}</div>
    </div>`;
  }).join("");

  container.querySelectorAll(".report-history-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const open = !btn.classList.contains("open");
      btn.classList.toggle("open", open);
      btn.nextElementSibling.classList.toggle("open", open);
      if (open) _openReportDates.add(btn.dataset.date);
      else _openReportDates.delete(btn.dataset.date);
    });
  });
}

// The report modal's markup sits after this <script> tag in index.html, so
// top-level getElementById calls here would run before it exists in the DOM
// and silently no-op. Attach lazily instead, on the first actual open.
let _reportListenersReady = false;
function ensureReportListeners() {
  if (_reportListenersReady) return;
  _reportListenersReady = true;

  document.getElementById("report-show-names")?.addEventListener("change", refreshReportModal);
  document.getElementById("report-show-tax")?.addEventListener("change", refreshReportModal);

  document.getElementById("report-stats-toggle-btn")?.addEventListener("click", () => {
    const btn   = document.getElementById("report-stats-toggle-btn");
    const panel = document.getElementById("report-stats-panel");
    const open  = !btn.classList.contains("open");
    btn.classList.toggle("open", open);
    panel.classList.toggle("open", open);
  });
}

function closeMenuReport(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("report-modal").classList.remove("open");
}

// ── Item detail: rating trend chart ─────────────────────────────────────
function openItemDetail(restaurant, item) {
  document.getElementById("item-detail-title").textContent = item;

  const trend = computeItemRatingTrend(restaurant, item);
  const stats = computeItemStats(restaurant).get((item || "").trim().toLowerCase());
  const avgPrice = resolveItemPrice(item, _reportMenu);

  const bits = [];
  if (stats) bits.push(`<span class="item-detail-stat"><strong>${stats.qty}</strong> ordered</span>`);
  if (avgPrice) bits.push(`<span class="item-detail-stat"><strong>$${avgPrice.toFixed(2)}</strong> price</span>`);
  if (stats?.ratingCount) {
    bits.push(`<span class="item-detail-stat"><strong>${(stats.ratingSum / stats.ratingCount).toFixed(1)}/10</strong> avg rating</span>`);
  }
  document.getElementById("item-detail-stats").innerHTML = bits.join("");

  renderItemTrendChart(trend);
  document.getElementById("item-detail-modal").classList.add("open");
}

function closeItemDetail(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("item-detail-modal").classList.remove("open");
}

function renderItemTrendChart(trend) {
  const svg   = document.getElementById("item-detail-chart");
  const empty = document.getElementById("item-detail-empty");
  if (!trend.length) {
    svg.innerHTML = "";
    svg.style.display = "none";
    empty.style.display = "block";
    return;
  }
  svg.style.display = "block";
  empty.style.display = "none";

  const W = 480, H = 220, padL = 28, padR = 16, padT = 16, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = trend.length;
  const xAt = i => n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
  const yAt = v => padT + plotH - (v / 10) * plotH;

  const ink = getComputedStyle(document.body).getPropertyValue("--ink").trim() || "#000";

  // Recessive gridlines + a muted-ink axis label at 0/2/4/6/8/10 -- the
  // line itself is the only thing meant to draw the eye.
  let gridSvg = "";
  [0, 2, 4, 6, 8, 10].forEach(v => {
    gridSvg += `<line x1="${padL}" y1="${yAt(v)}" x2="${W - padR}" y2="${yAt(v)}" stroke="${ink}" stroke-opacity="0.15"/>`;
    gridSvg += `<text x="${padL - 6}" y="${yAt(v) + 3}" text-anchor="end" font-size="9" fill="${ink}" fill-opacity="0.6">${v}</text>`;
  });

  const pathD = trend.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.avg).toFixed(1)}`).join(" ");

  let dotsSvg = "", hitsSvg = "";
  trend.forEach((p, i) => {
    const cx = xAt(i).toFixed(1), cy = yAt(p.avg).toFixed(1);
    dotsSvg += `<circle cx="${cx}" cy="${cy}" r="4" fill="${ink}"/>`;
    hitsSvg += `<circle cx="${cx}" cy="${cy}" r="11" fill="transparent" class="item-detail-hit" data-date="${escAttr(fmtRatingDate(p.date))}" data-rating="${p.avg.toFixed(1)}"/>`;
  });

  // Sparse date labels (first/middle/last) rather than one per point, which
  // collides badly once there's more than a handful of dates.
  const labelIdxs = n <= 4 ? trend.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  let xLabelSvg = "";
  labelIdxs.forEach(i => {
    xLabelSvg += `<text x="${xAt(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="${ink}" fill-opacity="0.6">${esc(fmtRatingDate(trend[i].date))}</text>`;
  });

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `${gridSvg}
    <path d="${pathD}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dotsSvg}
    ${xLabelSvg}
    ${hitsSvg}`;

  const tooltip = document.getElementById("item-detail-tooltip");
  svg.querySelectorAll(".item-detail-hit").forEach(hit => {
    hit.addEventListener("mouseenter", () => {
      tooltip.textContent = `${hit.dataset.date} — ${hit.dataset.rating}/10`;
      tooltip.style.display = "block";
      const wrap = document.getElementById("item-detail-chart-wrap").getBoundingClientRect();
      const hr = hit.getBoundingClientRect();
      const tr = tooltip.getBoundingClientRect();
      let left = hr.left - wrap.left + hr.width / 2 - tr.width / 2;
      left = Math.max(4, Math.min(left, wrap.width - tr.width - 4));
      tooltip.style.left = `${left}px`;
      tooltip.style.top  = `${hr.top - wrap.top - tr.height - 8}px`;
    });
    hit.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
  });
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

// ── Random Pick lightbox ─────────────────────────────────────────────
// Slot-machine-style picker scoped to whatever menu it was opened with --
// always today's restaurant (buildMenuPanel passes its own `items`), never
// the wider rotation.
let _randomPickAllItems = []; // everything on today's menu, unfiltered
let _randomPickItems = [];    // the working set the spin actually draws from
let _randomPickChosen = null;
let _randomPickTimer = null;

function openRandomPickLightbox(items) {
  _randomPickAllItems = (items || []).filter(i => i?.item);
  _randomPickItems = _randomPickAllItems;
  if (!_randomPickItems.length) return;

  // Narrowing to a category is optional -- defaults to "All Categories" so
  // picking one is never required, it just rolls with the whole menu until
  // you do. Skipped entirely if nothing on the menu even has a category.
  const categorySelect = document.getElementById("random-pick-category");
  const categories = [...new Set(_randomPickAllItems.map(i => i.category).filter(Boolean))];
  if (categories.length) {
    categorySelect.innerHTML = `<option value="">All Categories</option>` +
      categories.map(c => `<option value="${escAttr(c)}">${esc(c)}</option>`).join("");
    categorySelect.value = "";
    categorySelect.style.display = "";
  } else {
    categorySelect.innerHTML = "";
    categorySelect.style.display = "none";
  }

  const nameEl = document.getElementById("random-pick-name");
  const labelEl = document.getElementById("random-pick-label");
  const actionsEl = document.getElementById("random-pick-actions");
  actionsEl.style.display = "none";
  labelEl.textContent = "Picking something for you…";
  nameEl.classList.remove("settled");
  document.getElementById("random-pick-lightbox").classList.add("open");

  _runRandomPickSpin();
}

// Re-rolls from just the chosen category (or the whole menu again for "All
// Categories") -- changing the dropdown re-spins immediately rather than
// waiting for another click.
function randomPickCategoryChanged() {
  const selected = document.getElementById("random-pick-category").value;
  _randomPickItems = selected
    ? _randomPickAllItems.filter(i => i.category === selected)
    : _randomPickAllItems;
  if (!_randomPickItems.length) _randomPickItems = _randomPickAllItems;
  _runRandomPickSpin();
}

function _runRandomPickSpin() {
  clearTimeout(_randomPickTimer);
  const nameEl = document.getElementById("random-pick-name");
  const labelEl = document.getElementById("random-pick-label");
  const actionsEl = document.getElementById("random-pick-actions");
  nameEl.classList.remove("settled");
  labelEl.textContent = "Picking something for you…";
  actionsEl.style.display = "none";
  document.getElementById("random-pick-stats-link").style.display = "none";

  // Picks the real final answer up front, then just spends the animation
  // cycling through random names before landing on it -- the deceleration
  // is purely cosmetic, every item has an equal chance from the start.
  const items = _randomPickItems;
  _randomPickChosen = items[Math.floor(Math.random() * items.length)];

  // While cycling, long names made the box keep flashing/resizing as it
  // rotated through wildly different lengths -- truncated during the spin
  // only, then the real full name is what it actually settles on.
  const RANDOM_PICK_SPIN_MAX_LEN = 24;
  function spinLabel(name) {
    return name.length > RANDOM_PICK_SPIN_MAX_LEN
      ? name.slice(0, RANDOM_PICK_SPIN_MAX_LEN - 1).trimEnd() + "…"
      : name;
  }

  const totalSteps = 30 + Math.floor(Math.random() * 7);
  let step = 0;
  function tick() {
    const isLast = step >= totalSteps;
    nameEl.textContent = isLast
      ? _randomPickChosen.item
      : spinLabel(items[Math.floor(Math.random() * items.length)].item);
    if (isLast) {
      labelEl.textContent = "Tonight's pick:";
      nameEl.classList.add("settled");
      actionsEl.style.display = "flex";
      document.getElementById("random-pick-stats-link").style.display = "block";
      return;
    }
    step++;
    // Deceleration curve: starts fast (~50ms) and stretches out toward
    // ~700ms by the last few steps -- a longer, more dramatic wind-down
    // than a quick flick, reading as a wheel slowing to a stop.
    const delay = 50 + Math.pow(step / totalSteps, 2) * 650;
    _randomPickTimer = setTimeout(tick, delay);
  }
  tick();
}

function closeRandomPickLightbox() {
  clearTimeout(_randomPickTimer);
  document.getElementById("random-pick-lightbox").classList.remove("open");
}

// Wired via inline onclick (not addEventListener) -- this script tag loads
// before the lightbox markup further down the page, so looking these
// buttons up by ID at parse time would silently find nothing.
function randomPickAdd() {
  if (!_randomPickChosen) return;
  addItem(_randomPickChosen.item);
  closeRandomPickLightbox();
  document.getElementById("order-name")?.focus();
}

// Item Stats (the rating-trend chart) is its own modal at a lower z-index
// than this lightbox -- close this one first so it isn't hidden behind it.
function randomPickViewStats() {
  if (!_randomPickChosen || !currentRestaurantObj?.name) return;
  const item = _randomPickChosen.item;
  closeRandomPickLightbox();
  _reportMenu = currentRestaurantObj.menu || allMenuItems;
  openItemDetail(currentRestaurantObj.name, item);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && document.getElementById("random-pick-lightbox").classList.contains("open")) {
    closeRandomPickLightbox();
  }
});
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

// Stripe divider runs its (fast, constant-speed) scroll animation in short
// random bursts, then pauses for a random gap before the next burst --
// toggling play-state (rather than jumping background-position from JS)
// keeps the stripes always evenly spaced while moving.
function scheduleStripeToggle() {
  const el = document.querySelector(".stripe-divider");
  if (!el) return;
  const idle = 10000 + Math.random() * 10000; // ~10-20s paused
  setTimeout(() => {
    el.classList.add("stripe-running");
    const runFor = 5000 + Math.random() * 5000; // ~5-10s of quick movement
    setTimeout(() => {
      el.classList.remove("stripe-running");
      scheduleStripeToggle();
    }, runFor);
  }, idle);
}
scheduleStripeToggle();

// ── Drop Game (Plinko) ──────────────────────────────────────────────────
// A Galton board: drag the ball along the top and release it anywhere to
// drop it through a grid of pegs into a slot at the bottom. One slot is
// marked as the winner each round. The board resizes with the panel (drag
// handle, like the menu panel) -- taller boards fit more peg rows, which is
// the knob that actually controls pace: more rows means more collisions to
// fall through, so the ball takes longer to reach bottom.
(function() {
  const toggleBtn = document.getElementById("plinko-toggle-btn");
  const panel     = document.getElementById("plinko-panel");
  const board     = document.getElementById("plinko-board");
  const canvas    = document.getElementById("plinko-canvas");
  if (!toggleBtn || !panel || !board || !canvas) return;

  const ctx = canvas.getContext("2d");
  // Capped at 2: a 3x phone renders 2.25x the pixels of 2x for no visible
  // gain on a physics toy, and the canvas fill cost is most of the mobile
  // frame budget.
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  // getComputedStyle() forces a style recalc -- calling it every single
  // animation frame (as draw() used to) is one of the more expensive
  // things a mobile browser can be asked to do 60x/sec for values that
  // only ever change on an explicit theme switch. Cache them instead and
  // only recompute on the "themechange" event (and once up front).
  let cachedInkColor = "#000", cachedAccentColor = "#fcf811";
  function refreshThemeColors() {
    const bodyStyle = getComputedStyle(document.body);
    cachedInkColor = bodyStyle.getPropertyValue("--ink").trim() || "#000";
    cachedAccentColor = bodyStyle.getPropertyValue("--accent").trim() || "#fcf811";
  }
  refreshThemeColors();
  document.addEventListener("themechange", () => { refreshThemeColors(); draw(); });

  const BALL_R    = 9;
  const PEG_R     = 4;
  const COL_SPACE = 34;   // target horizontal spacing between peg columns
  const BASE_ROW_SPACE = 30; // vertical spacing between peg rows
  const TOP_MARGIN = 40;  // gap above first peg row (the ball's drag lane)
  const SLOT_H    = 70;   // height reserved for the slot area at the bottom
  const TRAY_H    = 60;   // gold-ball tray below the slots -- rewards collect here, visibly held
  const BAR_H     = 10;   // the slot baseline is a real bar (a hinged plate), not a hairline
  const TRAY_CAPACITY = 50; // tray holds this many gold balls before they're bagged
  const GRAVITY   = 0.32;
  const RESTITUTION = 0.62;
  const MIN_COLORED = 1, MAX_COLORED = 6, MAX_BALLS = 12;
  // On a narrow (mobile-width) board the auto-fit peg grid only produces
  // ~12 slots, each too thin to tell many colors apart or fit several
  // balls falling at once -- cap both harder at that width.
  const MOBILE_SLOT_THRESHOLD = 12;
  const MOBILE_MAX_BALLS = 2;
  const MOBILE_MAX_COLORED = 3;
  function maxBallsForSlots() {
    return slotCount > 0 && slotCount <= MOBILE_SLOT_THRESHOLD ? MOBILE_MAX_BALLS : MAX_BALLS;
  }
  function maxColoredForSlots() {
    const cap = slotCount > 0 && slotCount <= MOBILE_SLOT_THRESHOLD ? MOBILE_MAX_COLORED : MAX_COLORED;
    return Math.min(cap, slotCount);
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let cssW = 0, cssH = 0;
  let pegs = [];
  // Spatial hash over the peg field: cell -> pegs in it. A ball only ever
  // needs the pegs in its own 3x3 cell neighborhood, so per-frame collision
  // work stops scaling with the TOTAL peg count (which is what made big
  // boards + a 100-ball gold shower chug on phones).
  const PEG_CELL = 48;
  let pegGrid = new Map();
  function buildPegGrid() {
    pegGrid = new Map();
    for (const p of pegs) {
      const key = `${Math.floor(p.x / PEG_CELL)},${Math.floor(p.y / PEG_CELL)}`;
      let bucket = pegGrid.get(key);
      if (!bucket) { bucket = []; pegGrid.set(key, bucket); }
      bucket.push(p);
    }
  }
  function pegsNear(x, y) {
    const cx = Math.floor(x / PEG_CELL), cy = Math.floor(y / PEG_CELL);
    const out = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = pegGrid.get(`${gx},${gy}`);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }
  let slotCount = 0, slotW = 0, pegsBottomY = 0, floorY = 0, trayFloorY = 0;

  // ── The hinged floor bar ──
  // The slot baseline is a physical bar. During a gold shower it hinges
  // open: one side swings down into a ramp and its free end pulls back
  // from the wall, opening a gap the gold rolls down through into the
  // tray. Once every gold ball is down, it swings shut again.
  let rampProgress = 0;      // 0 = shut (flat bar in place), 1 = fully open (bar retracted)
  let rampTarget = 0;
  let goldShowerActive = false; // a shower is in progress this round
  let showerStartedAt = 0;   // watchdog reference for a shower that never finishes
  let roundOver = false;     // outcome already shown for this round
  let barCloseTimer = null; // pending "swing the bar shut" timeout -- must be
    // cancelled on any reset, otherwise it can fire late and force-clear
    // goldShowerActive/rampTarget for a LATER, unrelated round (the board
    // settles well before this delay elapses, so a player can reset and
    // drop again while the old timer is still pending) -- that stale write
    // could yank the bar shut and resolve a still-in-progress shower early,
    // showing its comment before that round actually finished.

  // The bar is a flat plate that simply retracts out of the way rather than
  // tilting open -- so its resting surface is always just floorY; only
  // inRampGap (below) changes as it opens.
  function rampYAt(x) {
    return floorY;
  }
  function inRampGap(x) {
    // Once the bar's swung mostly open, the WHOLE floor drops away -- gold
    // falls straight through wherever it happens to be instead of having to
    // slide all the way to one narrow corner first (that single-file
    // bottleneck was reading as "stuck").
    return rampProgress >= 0.6;
  }
  // Regular balls always rest on the bar. Gold rests on the bar too while
  // it's shut -- but through the gap, or once it's below the bar, its
  // floor is the tray's.
  function floorFor(b) {
    if (!b.isReward) return rampYAt(b.x);
    const br = b.r || BALL_R;
    if (b.y - br > rampYAt(b.x) + BAR_H) return trayFloorY;
    if (inRampGap(b.x)) return trayFloorY;
    return rampYAt(b.x);
  }
  let pegRowCount = 0; // how many peg rows the board currently has -- taller board (resized), more rows
  let coloredSlots = null;  // how many slots get a distinct color; null = not yet chosen
  let coloredSlotIndices = new Set(); // which slot indices (scattered, not left-to-right) are colored

  function pickColoredIndices(n) {
    const all = Array.from({ length: slotCount }, (_, i) => i);
    return new Set(shuffled(all).slice(0, n));
  }
  let restaurantMode = false;
  let restaurantNames = [];       // unique rotation restaurant names
  let restaurantAssignment = [];  // slot index -> restaurant name (or "Other"), shuffled

  function getRestaurantNames() {
    return [...new Set((_restaurantsConfig?.restaurants || []).map(r => r.name).filter(Boolean))];
  }

  function renderRestaurantLegend() {
    const legend = document.getElementById("plinko-restaurant-legend");
    if (!legend) return;
    legend.innerHTML = restaurantAssignment.map((name, i) =>
      `<div class="plinko-legend-row"><span class="plinko-legend-num">${i + 1}</span><span>${esc(name)}</span></div>`
    ).join("");
  }

  let ballCount = 1;        // how many balls drop per release
  let balls = [];           // in-flight/settled balls: { x, y, vx, vy, moving }
  let dragBall = { x: 0, y: 0 }; // the draggable staging marker shown when idle
  let dragging = false;
  let spawningGold = false; // true while gold balls are still trickling in via setTimeout
  let stuckBeyondRecovery = false;
  let rafId = null;
  let initialized = false;
  let roundStartTime = 0;
  const MAX_ROUND_MS = 30000; // hard cap -- balls piled in one slot can shove each other forever otherwise
  let allPastLineSince = null; // when every ball first had crossed into its slot (still jiggling is fine)

  function layout() {
    cssW = board.clientWidth;
    cssH = board.clientHeight;
    if (cssW <= 0 || cssH <= 0) return;

    canvas.width  = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    trayFloorY = cssH;
    floorY = cssH - TRAY_H;

    // The win/lose comment centers on just the peg field + slots, not the
    // tray strip below them -- otherwise the tray's height would drag the
    // apparent center down, off the actual play area. floorY is exactly
    // the boundary between the two, so half of it is that region's center.
    const commentEl = document.getElementById("plinko-comment");
    if (commentEl) commentEl.style.top = `${floorY / 2}px`;

    // The peg field always uses the same dense, auto-fit grid regardless of
    // mode -- Restaurant Picker doesn't touch ball/peg size or row spacing
    // at all, it only changes how many (wider) slots the bottom is divided
    // into. Since the peg density near the walls is unchanged from normal
    // play, there's no edge gap for a ball to slip straight through; no
    // special-cased edge pegs needed.
    const cols = Math.max(4, Math.floor(cssW / COL_SPACE) - 1);
    const colSpace = cssW / (cols + 1);
    const usableW = cols * colSpace;
    const xOffset = (cssW - usableW) / 2;

    const pegAreaH = Math.max(BASE_ROW_SPACE * 3, cssH - TOP_MARGIN - SLOT_H - TRAY_H);
    const rows = Math.max(4, Math.round(pegAreaH / BASE_ROW_SPACE));
    pegRowCount = rows;
    pegsBottomY = TOP_MARGIN + rows * BASE_ROW_SPACE;

    pegs = [];
    for (let r = 0; r < rows; r++) {
      const y = TOP_MARGIN + r * BASE_ROW_SPACE;
      const rowOffset = (r % 2 === 0) ? 0 : colSpace / 2;
      const rowCols = (r % 2 === 0) ? cols + 1 : cols;
      for (let c = 0; c < rowCols; c++) {
        const x = xOffset + rowOffset + c * colSpace;
        // Keep pegs clear of the side walls by more than a ball's width --
        // a peg sitting right next to a wall can pinch a ball between the
        // two, trapping it in a stuck jitter instead of letting it fall.
        const wallClearance = BALL_R + PEG_R + 2;
        if (x > wallClearance && x < cssW - wallClearance) pegs.push({ x, y });
      }
    }

    // Restaurant Picker mode divides the (unchanged) board width into a
    // slot per rotation restaurant plus one "Other" -- independent of the
    // peg grid's own column count above, so the pegs stay dense/normal
    // while the slots themselves get wider to fit fewer of them.
    slotCount = (restaurantMode && restaurantNames.length) ? restaurantNames.length + 1 : cols + 1;
    slotW = cssW / slotCount;
    // The top tip of each slot divider is itself a small bumper peg -- a
    // ball landing right on a boundary can still bounce to either side,
    // instead of being forced into whichever slot half it's nominally over.
    for (let i = 0; i <= slotCount; i++) pegs.push({ x: i * slotW, y: pegsBottomY });
    buildPegGrid();
    if (coloredSlots === null) coloredSlots = 2 + Math.floor(Math.random() * 3); // 2-4
    coloredSlots = Math.max(MIN_COLORED, Math.min(coloredSlots, maxColoredForSlots()));
    coloredSlotIndices = pickColoredIndices(coloredSlots);
    ballCount = Math.min(ballCount, maxBallsForSlots());

    if (restaurantMode && restaurantNames.length) {
      // Randomize which restaurant sits behind which number every time --
      // otherwise it'd always read 1, 2, 3... in rotation-list order.
      restaurantAssignment = shuffled([...restaurantNames, "Other"]);
      renderRestaurantLegend();
    }

    updateControlLabels();
    resetBalls();
    draw();
  }

  function setColoredSlots(n) {
    if (!slotCount) return;
    coloredSlots = Math.max(MIN_COLORED, Math.min(maxColoredForSlots(), n));
    coloredSlotIndices = pickColoredIndices(coloredSlots);
    updateControlLabels();
    draw();
  }

  function setBallCount(n) {
    ballCount = Math.max(1, Math.min(maxBallsForSlots(), n));
    updateControlLabels();
  }

  function updateControlLabels() {
    const colorsLabel = document.getElementById("plinko-colored-count");
    if (colorsLabel) colorsLabel.textContent = coloredSlots;
    const colorsSlider = document.getElementById("plinko-colors-slider");
    if (colorsSlider) {
      colorsSlider.max = maxColoredForSlots();
      colorsSlider.value = coloredSlots;
    }
    const ballsLabel = document.getElementById("plinko-ball-count");
    if (ballsLabel) ballsLabel.textContent = ballCount;
    const ballsSlider = document.getElementById("plinko-balls-slider");
    if (ballsSlider) {
      ballsSlider.max = maxBallsForSlots();
      ballsSlider.value = ballCount;
    }
    // Shown to everyone, for transparency -- a live preview of what the
    // current Colors/Balls setting would actually pay out.
    const debugEl = document.getElementById("plinko-debug-gold");
    if (debugEl) {
      const perHit = computePerHit(slotCount, coloredSlots, ballCount, pegRowCount);
      const cap = slotCount <= MOBILE_SLOT_THRESHOLD ? MAX_GOLD_MOBILE : MAX_GOLD_DESKTOP;
      const maxTotal = Math.min(cap, perHit * ballCount);
      debugEl.textContent = `${perHit}/hit, up to ${maxTotal}`;
    }
  }

  function resetBalls() {
    // trayGoldCount (persisted) is the single source of truth for how much
    // gold is in the tray -- the physical ball objects are just a rendering
    // of that number, rebuilt from scratch every reset rather than
    // incrementally patched. That's what guarantees a mid-shower interrupt,
    // the countdown's full wipe, or anything else always shows the right
    // amount instead of stale ball objects drifting out of sync with the
    // real count (e.g. old gold visibly left sitting in the tray after a
    // wipe wants it to read zero).
    // Clear everything -- black balls AND any old gold placeholders alike.
    // Gold gets rebuilt from trayGoldCount below; keeping old gold objects
    // around here would double-count them once the fresh placeholders are
    // pushed on top.
    balls = [];
    // Bagging normally happens once a shower finishes settling, inside
    // evaluateOutcome() -- but hitting reset mid-shower skips that
    // entirely, so a round that keeps getting interrupted could pile past
    // TRAY_CAPACITY forever and never actually bag. Every reset re-checks
    // this directly so the bag conversion is automatic no matter how (or
    // how many times) the round got cut short.
    bagUpTray();
    const d = GOLD_R * 2;
    const cols = Math.max(1, Math.floor(cssW / d));
    const maxRows = Math.max(1, Math.floor(TRAY_H / d));
    const shownCount = Math.max(0, Math.min(trayGoldCount, cols * maxRows));
    for (let i = 0; i < shownCount; i++) {
      balls.push({ x: 0, y: 0, vx: 0, vy: 0, moving: false, isReward: true, r: GOLD_R });
    }
    layoutTrayPile();
    dragBall = { x: cssW / 2, y: TOP_MARGIN / 2 };
    allPastLineSince = null;
    spawningGold = false;
    goldShowerActive = false;
    roundOver = false;
    rampProgress = 0;
    rampTarget = 0;
    hideComment();
    // Cancel any still-pending "swing the bar shut" timer from a previous
    // round's win -- otherwise it can fire during THIS round and stomp on
    // its state (see the comment on barCloseTimer's declaration).
    clearTimeout(barCloseTimer);
    barCloseTimer = null;
  }

  // ── Reward / comment feedback shown after a round settles ──────────────
  // Difficulty-scaled payout: perHit = GOLD_RATE * (effectiveSlots/coloredSlots)
  // / ballsDropped * rowBonus(pegRows), where effectiveSlots = min(slotCount,
  // pegRows + 1) -- see the comments at the actual computation below for
  // why raw slotCount isn't used directly and why tall boards get an
  // accelerating (not linear) bonus. Fewer colored slots and fewer balls
  // dropped both raise the per-hit prize; total spawn is capped so a
  // jackpot can't melt a phone.
  const GOLD_RATE = 4;

  // A real Galton board with N rows of pegs can only ever spread a ball
  // across N+1 distinct columns, so a wide board with 20 slots but only
  // 5-7 peg rows doesn't actually have 20 meaningfully-different outcomes,
  // just a handful. Capping the slot count used here by the board's actual
  // row depth means a short-but-wide desktop board pays about the same as
  // a normal mobile-depth board instead of cashing in on slots that were
  // never really reachable/distinct in the first place. That cap only
  // applies below ROW_BONUS_THRESHOLD, though -- once a board is actually
  // deep enough (10+ rows) for row depth itself to matter, a wider desktop
  // board's real slot count should count in full and keep outpacing a
  // narrower mobile board at that same row count, not get flattened down
  // toward it.
  //
  // Flat up through 10 rows (that's the "not meaningfully harder than
  // mobile" range -- mobile boards can often reach into the high single
  // digits/low teens on row count too, so the bonus needs real headroom
  // above that before kicking in, or a mobile board ends up getting the
  // same accelerating multiplier a genuinely deep desktop board was meant
  // for). Past 10, a real Galton board's odds of landing any one specific
  // slot don't fall off linearly as it gets taller -- variance spreads out
  // fast, so a specific hit gets sharply rarer, and each drop also just
  // takes longer to resolve. So ROW_BONUS_EXPONENT accelerates the payout
  // curve rather than scaling it straight-line: 10 rows -> 1x, 12 rows ->
  // ~2x, 14 rows -> ~4x, 16 rows -> ~6x.
  const ROW_BONUS_THRESHOLD = 10;
  const ROW_BONUS_EXPONENT = 1.6;
  function rowBonus(rows) {
    if (rows <= ROW_BONUS_THRESHOLD) return 1;
    return 1 + Math.pow((rows - ROW_BONUS_THRESHOLD) / 2, ROW_BONUS_EXPONENT);
  }

  // Floor of 1 (not a higher number) so dropping fewer balls for a bigger
  // individual payout stays visible instead of getting clamped to the same
  // value as dropping more.
  function computePerHit(slots, colors, ballsDropped, rows) {
    // Below the threshold: capped by reachable columns (the "wide-but-
    // shallow shouldn't overpay" fix). At/above it: the real slot count,
    // uncapped -- a genuinely deep board's wider slot count is a real
    // difficulty difference worth paying for, not something to flatten
    // away just because rows also happen to be high.
    const effectiveSlots = rows >= ROW_BONUS_THRESHOLD ? slots : Math.min(slots, rows + 1);
    return Math.max(1, Math.round(
      GOLD_RATE * (effectiveSlots / Math.max(1, colors)) / Math.max(1, ballsDropped) * rowBonus(rows)
    ));
  }

  const GOLD_R = BALL_R * 0.75; // smaller than a regular ball
  const MAX_GOLD_MOBILE = 150, MAX_GOLD_DESKTOP = 400;

  // ── 3-minute round + high score ──────────────────────────────────────
  // The clock counts DOWN, not up. It starts the moment the first ball
  // drops (not just from opening the panel) -- and does NOT survive a
  // refresh. The board itself (black balls) was never persisted across a
  // reload either, so a page that persisted the countdown but not the
  // board looked completely untouched while a leftover timer from an
  // earlier visit kept silently ticking in the background -- surprising
  // whoever's looking at it with a "TIME'S UP" screen they never saw
  // start. A fresh load now always means a fresh, un-started clock; only
  // an actual drop in THIS session starts it.
  // Tracked as remaining time (not a fixed end timestamp) so the reward
  // shower phase can pause it -- winning shouldn't burn round time while
  // the gold is falling/settling. Only ticks down while a round is active
  // AND no shower is in progress; resumes the instant the next ball drops.
  const PLINKO_ROUND_MS = 3 * 60 * 1000;
  let plinkoRemainingMs = null; // null = round hasn't started yet
  let plinkoLastTickAt = null;
  let plinkoGameOver = false;

  function formatClock(ms) {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // Session total of golden balls won, shown in the top control bar and
  // remembered per-browser.
  let goldTotal = Number(localStorage.getItem("plinkoGoldTotal")) || 0;
  function updateGoldCount(add) {
    if (add) {
      goldTotal += add;
      localStorage.setItem("plinkoGoldTotal", String(goldTotal));
    }
    const el = document.getElementById("plinko-gold-count");
    if (el) el.innerHTML = `&#x1F7E1; ${goldTotal}`;
    if (add) flashGoldAward(add, el);
  }

  // A brief "+N" pop right when gold is actually awarded -- updating the
  // number alone was easy to miss in the moment.
  function flashGoldAward(add, anchorEl) {
    if (anchorEl) {
      const flash = document.createElement("span");
      flash.className = "plinko-gold-flash";
      flash.textContent = `+${add}`;
      anchorEl.appendChild(flash);
      flash.addEventListener("animationend", () => flash.remove());
    }
    // Big version centered over the peg field itself -- the small badge
    // flash above is easy to miss (or entirely off-screen) on a wide
    // desktop layout where the controls row isn't in your eyeline.
    const boardFlashHost = document.getElementById("plinko-gold-flash-board");
    if (boardFlashHost) {
      const bigFlash = document.createElement("span");
      bigFlash.className = "plinko-gold-flash-big";
      bigFlash.textContent = `+${add}`;
      boardFlashHost.appendChild(bigFlash);
      bigFlash.addEventListener("animationend", () => bigFlash.remove());
    }
  }
  updateGoldCount(0);

  // Bags: once the tray holds TRAY_CAPACITY gold balls, they're swept into
  // a bag -- the bag tally (persisted per-browser) is painted in the tray
  // corner as the money-bag sign.
  //
  // trayGoldCount is the real, persisted running total, kept alongside the
  // physical ball objects in `balls` (every gold ball dropped is also
  // simulated -- now that gold overlaps and skips collision with other
  // gold, there's no packing/jam risk from letting all of them actually
  // fall). It's what gates bagging and what's shown in the live readout.
  let goldBags = Number(localStorage.getItem("plinkoGoldBags")) || 0;
  let trayGoldCount = Number(localStorage.getItem("plinkoTrayGoldCount")) || 0;
  function saveTrayGoldCount() {
    localStorage.setItem("plinkoTrayGoldCount", String(trayGoldCount));
  }
  function bagUpTray() {
    if (trayGoldCount < TRAY_CAPACITY) return;
    const bagsGained = Math.floor(trayGoldCount / TRAY_CAPACITY);
    goldBags += bagsGained;
    localStorage.setItem("plinkoGoldBags", String(goldBags));
    trayGoldCount -= bagsGained * TRAY_CAPACITY;
    saveTrayGoldCount();
    // Swept into the bag -- remove exactly as many physical gold balls as
    // just got bagged, leaving any remainder still visibly sitting in the
    // tray (matching the remaining trayGoldCount).
    let toRemove = bagsGained * TRAY_CAPACITY;
    balls = balls.filter(b => {
      if (b.isReward && toRemove > 0) { toRemove--; return false; }
      return true;
    });
    layoutTrayPile(); // close up the gap left by whatever just got bagged
  }

  // Once gold stops moving, its final resting spot isn't physics-simulated
  // any more -- it's calculated directly: pack every tray ball into a
  // simple bottom-up grid sized off its own diameter, so any number of
  // balls just fills up the tray row by row with zero overlap and zero
  // per-ball movement, instead of relying on collision response to spread
  // them out (which is what kept jamming all session).
  function layoutTrayPile() {
    const d = GOLD_R * 2;
    const cols = Math.max(1, Math.floor(cssW / d));
    const maxRows = Math.max(1, Math.floor(TRAY_H / d));
    const capacity = cols * maxRows;

    const nonReward = balls.filter(b => !b.isReward);
    let trayBalls = balls.filter(b => b.isReward);
    // More gold than physically fits the tray box even packed edge-to-edge
    // just isn't individually rendered -- trayGoldCount (the live X/150
    // readout) still tracks the true total regardless.
    if (trayBalls.length > capacity) trayBalls = trayBalls.slice(0, capacity);

    trayBalls.forEach((b, i) => {
      const row = Math.floor(i / cols);
      const rowStart = row * cols;
      const ballsInRow = Math.min(cols, trayBalls.length - rowStart);
      const col = i - rowStart;
      const rowW = ballsInRow * d;
      const xOffset = (cssW - rowW) / 2;
      b.x = xOffset + col * d + GOLD_R;
      b.y = trayFloorY - GOLD_R - row * d;
      b.vx = 0; b.vy = 0; b.moving = false;
    });

    balls = nonReward.concat(trayBalls);
  }

  // The reward balls actually drop through the machine like real balls
  // (same pegs, same physics) rather than a decorative overlay -- they
  // start above the board (anywhere along the top, not scattered through
  // the whole field) and trickle in one at a time with a slight random
  // stagger, then fall and settle like anything else.
  function spawnGoldBalls(count) {
    trayGoldCount += count;
    saveTrayGoldCount();

    // Retract the floor bar so the gold has somewhere to drop into the
    // tray; wake the settled black balls so they fall along with it
    // instead of hanging in the air.
    goldShowerActive = true;
    showerStartedAt = performance.now();
    rampTarget = 1;
    balls.forEach(b => { if (!b.isReward) b.moving = true; });
    startPhysics();
    // The staggered trickle runs on its own setTimeout chain, independent
    // of the physics loop -- without this flag, the loop can see "nothing
    // is moving right now" in the gap between two trickled-in balls and
    // conclude the round is over (calling evaluateOutcome, showing the win
    // comment, and stopping) long before all the reward balls have even
    // been added, silently orphaning the rest.
    spawningGold = true;
    let spawned = 0;
    function spawnOne() {
      balls.push({
        x: GOLD_R + Math.random() * (cssW - 2 * GOLD_R),
        y: -Math.random() * 120,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0,
        moving: true,
        isReward: true,
        r: GOLD_R,
      });
      spawned++;
      if (spawned < count) setTimeout(spawnOne, 12 + Math.random() * 25);
      else spawningGold = false;
    }
    spawnOne();
  }

  function showCommentFrom(list, isWin) {
    const el = document.getElementById("plinko-comment");
    if (!el) return;
    const safeList = (list && list.length) ? list : ["No luck this round."];
    el.textContent = safeList[Math.floor(Math.random() * safeList.length)];
    el.classList.toggle("win", !!isWin);
    el.classList.add("show");
  }

  function showComment() {
    showCommentFrom(typeof PLINKO_COMMENTS !== "undefined" ? PLINKO_COMMENTS : null, false);
  }

  function showWinComment() {
    showCommentFrom(typeof PLINKO_WIN_COMMENTS !== "undefined" ? PLINKO_WIN_COMMENTS : null, true);
  }

  function hideComment() {
    document.getElementById("plinko-comment")?.classList.remove("show", "win");
  }

  // Once every ball has settled, check whether any of the ORIGINAL (non-
  // reward) balls landed in a colored slot -- each hit pays out the
  // difficulty-scaled prize. If none did, a random consolation comment
  // instead. Once those reward balls finish falling and settle, this runs
  // again -- that second pass is where the winning comment shows, once the
  // whole shower has actually landed.
  function evaluateOutcome() {
    if (roundOver) return; // outcome already shown; loop re-entry (e.g. the bar shutting) is a no-op
    // Restaurant Picker: no colors/reward, but the winning restaurant's
    // name shows in the same stamped gold "win" style as a real win,
    // instead of leaving you to go look the number up in the legend.
    if (restaurantMode) {
      const settled = balls.find(b => b.slotIndex != null) || balls[0];
      const idx = settled?.slotIndex ?? Math.max(0, Math.min(slotCount - 1, Math.floor((settled?.x || 0) / slotW)));
      const name = restaurantAssignment[idx] || "Other";
      showCommentFrom([name], true);
      roundOver = true;
      return;
    }
    // Shower finished: every gold ball is down in the tray. Bag the tray
    // if it's full and show the win right away, but hold the bar open a
    // few seconds longer before swinging it shut instead of slamming it
    // closed the instant the last coin lands.
    if (goldShowerActive) {
      layoutTrayPile(); // pack this shower's new arrivals in with the rest
      bagUpTray();
      showWinComment();
      roundOver = true;
      clearTimeout(barCloseTimer);
      barCloseTimer = setTimeout(() => {
        barCloseTimer = null;
        goldShowerActive = false;
        rampTarget = 0;
        startPhysics(); // keep frames coming for the bar-shut animation
      }, 6000 + Math.random() * 3000);
      return;
    }
    // Use the slot each ball was frozen into the instant it first touched
    // down (not its current x), so later jostling from more balls piling
    // in can't disagree with what the ball visibly landed in. Tray gold
    // left over from earlier rounds doesn't count -- originals only.
    const coloredHits = balls.filter(b => {
      if (b.isReward) return false;
      const idx = b.slotIndex ?? Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
      return coloredSlotIndices.has(idx);
    });
    if (coloredHits.length > 0) {
      const originals = Math.max(1, balls.filter(b => !b.isReward).length);
      const perHit = computePerHit(slotCount, coloredSlots, originals, pegRowCount);
      // The leftmost/rightmost slots are riskier to land in (edge pegs
      // funnel balls away from them) -- landing a colored hit there pays
      // double, matched by the subtle "×2" drawn on that slot above.
      const weightedHits = coloredHits.reduce((sum, b) => {
        const idx = b.slotIndex ?? Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
        return sum + (idx === 0 || idx === slotCount - 1 ? 2 : 1);
      }, 0);
      const cap = slotCount <= MOBILE_SLOT_THRESHOLD ? MAX_GOLD_MOBILE : MAX_GOLD_DESKTOP;
      const total = Math.min(cap, perHit * weightedHits);
      updateGoldCount(total);
      spawnGoldBalls(total);
    } else {
      showComment();
      roundOver = true;
    }
  }

  // Hex <-> HSL round trip, used to find the theme's true opposite on the
  // color wheel (hue + 180deg) rather than just reusing --ink.
  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  function complementaryOf(hex) {
    const [h, s, l] = hexToHsl(hex);
    // A pure hue-only flip can land close to the original for very
    // desaturated/near-neutral themes (white, grey, offwhite) -- floor the
    // saturation and keep lightness readable so it still visibly contrasts.
    const s2 = Math.max(s, 0.65);
    const l2 = Math.min(Math.max(l, 0.35), 0.65);
    return hslToHex(h + 180, s2, l2);
  }
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Colored slots are all one color -- the true opposite of the theme's own
  // accent on the color wheel (hue rotated 180deg), not a rainbow of
  // different hues.
  function slotColor(i, alpha, accentColor) {
    // Restaurant Picker is just a number picker -- no colors/reward game
    // layered on top, so every slot stays neutral.
    if (restaurantMode) return `rgba(120,120,120,${alpha * 0.35})`;
    if (!coloredSlotIndices.has(i)) return `rgba(120,120,120,${alpha * 0.35})`;
    const hex = accentColor.startsWith("#") ? complementaryOf(accentColor) : "#e63946";
    return hexToRgba(hex, alpha);
  }

  // Hoisted out of draw() -- this array and closure used to get allocated
  // fresh every single frame for no reason, since none of it changes
  // frame to frame.
  const TRAY_TEXT_FONT = '900 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const TRAY_TEXT_SHADOW_OFFSETS = [
    [-1, -1], [1, -1],
    [-1, 1],  [1, 1],
  ];
  function fillTrayText(text, x, y, align) {
    ctx.textAlign = align;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    TRAY_TEXT_SHADOW_OFFSETS.forEach(([dx, dy]) => ctx.fillText(text, x + dx, y + dy));
    ctx.fillStyle = "#ffd400";
    ctx.fillText(text, x, y);
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);

    const inkColor = cachedInkColor;
    const accentColor = cachedAccentColor;

    // gold tray -- an open holding pen below the slots where reward balls
    // collect and stay visible; drawn first so slots/balls sit on top.
    ctx.fillStyle = "rgba(255, 196, 0, 0.15)";
    ctx.fillRect(0, floorY, cssW, trayFloorY - floorY);

    // slot columns -- bottoms follow the bar, so tilting it visibly drags
    // the slot floor down with it
    for (let i = 0; i < slotCount; i++) {
      const cx = (i + 0.5) * slotW;
      ctx.fillStyle = slotColor(i, 0.9, accentColor);
      ctx.fillRect(i * slotW, pegsBottomY, slotW, rampYAt(cx) - pegsBottomY);
      // Edge slots (leftmost/rightmost) pay double when colored -- a small,
      // subtle marker so that's discoverable without reading a rules page.
      if (!restaurantMode && (i === 0 || i === slotCount - 1) && coloredSlotIndices.has(i)) {
        ctx.save();
        ctx.font = `700 ${Math.max(9, Math.min(13, slotW * 0.22))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillText("×2", cx, rampYAt(cx) - 4);
        ctx.restore();
      }
    }
    // slot dividers, down to wherever the bar currently sits under each
    ctx.strokeStyle = inkColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    for (let i = 0; i <= slotCount; i++) {
      const x = i * slotW;
      ctx.beginPath();
      ctx.moveTo(x, pegsBottomY);
      ctx.lineTo(x, rampYAt(x));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The floor bar itself: a solid hinged plate, drawn as a thick slab so
    // it reads as a real mechanism. Once it's swung most of the way open,
    // the whole thing retracts out of view -- the entire floor is the
    // hatch the gold drops through, not just a sliver at one corner.
    if (rampProgress < 0.6) {
      const x0 = 0, x1 = cssW;
      ctx.beginPath();
      ctx.moveTo(x0, rampYAt(x0));
      ctx.lineTo(x1, rampYAt(x1));
      ctx.lineTo(x1, rampYAt(x1) + BAR_H);
      ctx.lineTo(x0, rampYAt(x0) + BAR_H);
      ctx.closePath();
      ctx.fillStyle = inkColor;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#a07800";
      ctx.stroke();
    }

    // Restaurant Picker mode -- a plain number per slot; the legend below
    // the board maps each number to a restaurant (or "Other").
    if (restaurantMode && restaurantAssignment.length === slotCount) {
      ctx.fillStyle = inkColor;
      ctx.font = `900 ${Math.max(12, Math.min(20, slotW * 0.32))}px inherit`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < slotCount; i++) {
        ctx.fillText(String(i + 1), (i + 0.5) * slotW, pegsBottomY + (floorY - pegsBottomY) / 2);
      }
    }

    // pegs -- filled in ink (black in light mode, bright accent in dark
    // mode) with an accent-colored outline so they never blend into the
    // board background regardless of theme (some themes use the same
    // color for --accent and --bg, which would otherwise wash things out).
    // Every peg used to be its own beginPath+fill+stroke (2 draw calls
    // each, so 60-200+ separate GPU commands every frame just for the peg
    // field) -- batched into ONE path so it's one fill + one stroke total,
    // since they all share the same style anyway.
    ctx.fillStyle = inkColor;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pegs.forEach(p => {
      const pr = p.r || PEG_R;
      ctx.moveTo(p.x + pr, p.y);
      ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
    });
    ctx.fill();
    ctx.stroke();

    // drag lane hint + staging marker, only while no round is in flight
    // (gold held in the tray doesn't block the next drop)
    if (!balls.some(b => !b.isReward)) {
      ctx.strokeStyle = "rgba(128,128,128,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, dragBall.y);
      ctx.lineTo(cssW, dragBall.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.fillStyle = inkColor;
      ctx.arc(dragBall.x, dragBall.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = accentColor;
      ctx.stroke();
    }

    // in-flight / settled balls -- same ink-fill/accent-stroke pairing as
    // the staging marker, guaranteed to contrast against the board bg even
    // in themes where --accent and --bg are the same color. Reward balls
    // (from landing in a colored slot) render gold instead so they read as
    // a distinct payout, even though they're falling through the same pegs.
    // Batched by color group instead of a fill+stroke pair per ball (which
    // meant up to ~800 separate draw calls once a big reward payout was
    // sitting in the tray) -- one path, one fill, one stroke per group.
    ctx.fillStyle = inkColor;
    ctx.beginPath();
    balls.forEach(b => { if (!b.isReward) { const r = b.r || BALL_R; ctx.moveTo(b.x + r, b.y); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); } });
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    ctx.fillStyle = "#ffc400";
    ctx.beginPath();
    balls.forEach(b => { if (b.isReward) { const r = b.r || BALL_R; ctx.moveTo(b.x + r, b.y); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); } });
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000";
    ctx.stroke();

    // Bag tally + live tray fill -- pinned to the TOP of the tray strip
    // (not the bottom) since the pile fills bottom-up and was burying this
    // text; small font + a light stamped outline (same trick as the
    // win/lose comment's outline, just much thinner/softer) so it stays
    // legible sitting right over the gold pile without reading as a heavy
    // black blob.
    ctx.font = TRAY_TEXT_FONT;
    ctx.textBaseline = "alphabetic";
    fillTrayText(`\u{1F4B0} ×${goldBags}`, 8, floorY + 28, "left");
    // Live tray fill -- the physics pile is capped for stability (see
    // bagUpTray), so this is the real running total toward the next bag.
    fillTrayText(`${trayGoldCount} / ${TRAY_CAPACITY}`, cssW - 8, floorY + 28, "right");
    ctx.textAlign = "left";
  }

  // Is this ball meaningfully embedded in an already-settled ball? (A
  // couple px of squish is allowed so piles still pack snugly.)
  function overlapsSettledBall(b) {
    const br = b.r || BALL_R;
    for (const o of balls) {
      if (o === b || o.moving) continue;
      const or2 = o.r || BALL_R;
      const dx = b.x - o.x, dy = b.y - o.y;
      const min = br + or2 - 2;
      if (dx * dx + dy * dy < min * min) return true;
    }
    return false;
  }

  // Is this ball supported from below by a settled ball? Needed because a
  // ball perched on the pile never touches the floor, so the floor-contact
  // settle can never fire for it.
  function restingOnPile(b) {
    const br = b.r || BALL_R;
    for (const o of balls) {
      if (o === b || o.moving) continue;
      const or2 = o.r || BALL_R;
      const dx = b.x - o.x, dy = b.y - o.y;
      const min = br + or2 + 1.5;
      if (dy < 0 && -dy > (br + or2) * 0.35 && dx * dx + dy * dy < min * min) return true;
    }
    return false;
  }

  function stepBall(b) {
    if (!b.moving) return;

    b.vy += GRAVITY;
    b.x  += b.vx;
    b.y  += b.vy;

    // walls
    const br = b.r || BALL_R;
    if (b.x - br < 0) { b.x = br; b.vx = -b.vx * 0.7; }
    if (b.x + br > cssW) { b.x = cssW - br; b.vx = -b.vx * 0.7; }

    // Safety net against getting wedged (e.g. wall + peg, or peg + peg) --
    // if a ball hasn't made real downward progress for a while, give it a
    // small random shove instead of leaving it jittering in place forever.
    // If several shoves in a row still don't free it, give up and signal
    // the whole game to restart rather than stay stuck indefinitely.
    if (b._stallY === undefined) { b._stallY = b.y; b._stallFrames = 0; b._nudges = 0; }
    if (Math.abs(b.y - b._stallY) < 0.5) {
      b._stallFrames++;
      if (b._stallFrames > 45) {
        b._nudges++;
        // A gold ball queuing at the hatch is normal congestion, not a
        // wedged board -- keep nudging it rather than nuking the round.
        if (b._nudges > 6) {
          if (b.isReward) { b._nudges = 0; } else { stuckBeyondRecovery = true; }
          return;
        }
        b.vx += (Math.random() - 0.5) * 3;
        b.vy += 0.8;
        b._stallFrames = 0;
      }
    } else {
      b._stallY = b.y;
      b._stallFrames = 0;
      b._nudges = 0;
    }

    // pegs -- only the 3x3 spatial-hash neighborhood around the ball, with
    // a squared-distance early reject (no sqrt until an actual hit). Balls
    // already below the peg field skip the lookup entirely.
    if (b.y < pegsBottomY + PEG_R * 4) {
      for (const p of pegsNear(b.x, b.y)) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const minDist = br + (p.r || PEG_R);
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < minDist * minDist) {
          const dist = Math.sqrt(d2);
          const nx = dx / dist, ny = dy / dist;
          const overlap = minDist - dist;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * RESTITUTION + (Math.random() - 0.5) * 0.6;
          b.vy = (b.vy - 2 * dot * ny) * RESTITUTION;
        }
      }
    }

    // A bit below the divider tips (giving the tip-bumper collision above
    // first crack at redirecting a borderline ball), the dividers become
    // solid walls -- whichever slot the ball ends up in, it's locked to for
    // the rest of the drop. Gold reward balls are exempt: they fall
    // straight through the slot area into the tray below.
    if (!b.isReward && b.y > pegsBottomY + PEG_R * 3) {
      const idx = Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
      const left  = idx * slotW + br + 1;
      const right = (idx + 1) * slotW - br - 1;
      if (b.x < left)  { b.x = left;  b.vx = 0; }
      if (b.x > right) { b.x = right; b.vx = 0; }
    }

    // settle into a slot -- freeze which slot it landed in right now, since
    // ball-ball jostling afterward (from more balls piling in) can still
    // shove a settled ball a few pixels sideways into a neighboring slot's
    // territory without this, making the win/lose check disagree with
    // whatever slot the ball visibly landed in first.
    const settleY = floorFor(b);
    if (b.y + br >= settleY) {
      if (b.isReward && settleY < trayFloorY - 0.5) {
        // Gold resting on the still-shut bar never truly settles (stays
        // "moving") -- it just waits flat, with no need to roll anywhere
        // now that the whole floor drops away at once. Staying in the
        // moving state is what lets it notice and fall through the instant
        // the bar retracts; a fully settled ball would never wake back up.
        b.y = settleY - br;
        b.vx = 0;
        b.vy = 0;
      } else if (b.vy > 1.5) {
        // A real bounce on impact instead of dead-stopping on first touch
        // (which read as the floor being sticky) -- the ball only settles
        // once it comes down soft.
        b.y = settleY - br;
        b.vy = -b.vy * RESTITUTION;
        b.vx *= 0.92;
      } else if (Math.abs(b.vx) > 0.35) {
        // Landed soft but still carrying sideways momentum -- roll along
        // the floor with friction (bouncing off walls/the pile) instead of
        // freezing mid-roll where it first touched down.
        b.y = settleY - br;
        b.vy = 0;
        b.vx *= 0.965;
      } else if (!b.isReward && overlapsSettledBall(b)) {
        // Came to rest INSIDE the pile -- pop it up gently and let the
        // collision pass walk it to a free spot, so settled balls take up
        // real space instead of stacking into each other. Gold is exempt --
        // it's allowed to pile up overlapping (a simple, never-jams stand-in
        // for a mound of coins) instead of needing real packing physics.
        b.y = settleY - br;
        b.vy = -1.4;
        b.vx += (Math.random() - 0.5) * 0.8;
      } else {
        b.y = settleY - br;
        b.vx = 0; b.vy = 0;
        b.moving = false;
        b.slotIndex = Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
      }
    } else if (Math.abs(b.vx) < 0.25 && b.vy < 0.7 && !overlapsSettledBall(b) && restingOnPile(b)) {
      // Perched on top of the pile, basically stationary, and not embedded
      // in anyone -- settle right there. Without this, a ball resting on
      // other balls (never touching the floor) would stay "moving" forever.
      b.vx = 0; b.vy = 0;
      b.moving = false;
      b.slotIndex = Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
    }
  }

  // Balls bounce off each other too, not just pegs/walls -- also what keeps
  // several balls that land in the same slot from perfectly overlapping
  // and hiding one another; they shove apart until they visibly fit.
  function resolveBallCollisions() {
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        // Two settled balls have already been shoved apart -- skipping
        // them turns the O(n^2) pass into near-O(moving x n), which is
        // what matters once ~100 gold balls have piled up in the tray.
        if (!a.moving && !b.moving) continue;
        // Gold passes THROUGH regular balls (otherwise it would pile on
        // top of the black balls in the slots and never reach the tray) --
        // and now also passes through OTHER gold once it's down there. The
        // tray pile is allowed to overlap freely (a simple coin-mound look)
        // instead of needing real non-overlap packing physics, which is
        // what kept jamming once the pile got crowded.
        if (a.isReward || b.isReward) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minDist = (a.r || BALL_R) + (b.r || BALL_R);
        // Cheap axis reject before any sqrt.
        if (dx > minDist || dx < -minDist || dy > minDist || dy < -minDist) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          if (a.moving && b.moving) {
            const overlap = (minDist - dist) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            const avn = a.vx * nx + a.vy * ny;
            const bvn = b.vx * nx + b.vy * ny;
            a.vx += (bvn - avn) * nx; a.vy += (bvn - avn) * ny;
            b.vx += (avn - bvn) * nx; b.vy += (avn - bvn) * ny;
          } else {
            // One of the pair is settled pile: the pile doesn't budge --
            // the mover takes the FULL separation, with a small upward
            // kick when the contact is mostly side-on, so it climbs over
            // the pile instead of tunneling through it at floor level.
            const m = a.moving ? a : b;
            const sign = a.moving ? -1 : 1;
            const overlap = minDist - dist;
            m.x += sign * nx * overlap;
            m.y += sign * ny * overlap;
            if (Math.abs(ny) < 0.35) m.vy -= 0.5;
            const mvn = m.vx * nx + m.vy * ny;
            m.vx -= mvn * nx * 1.4;
            m.vy -= mvn * ny * 1.4;
          }
        }
      }
    }
  }

  // Ball-ball collisions can shove a resting ball straight through the
  // floor or out of its slot's side walls (the shove itself doesn't know
  // about those boundaries) -- clamp everyone back inside afterward.
  function clampToBounds(b) {
    const br = b.r || BALL_R;
    const fy = floorFor(b);
    if (b.y + br > fy) { b.y = fy - br; b.vy = 0; }
    if (!b.isReward && b.y > pegsBottomY) {
      const idx = Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
      const left  = idx * slotW + br + 1;
      const right = (idx + 1) * slotW - br - 1;
      if (b.x < left)  b.x = left;
      if (b.x > right) b.x = right;
    }
    if (b.x - br < 0) b.x = br;
    if (b.x + br > cssW) b.x = cssW - br;
  }

  function step() {
    // The bar is open if and only if a shower is running -- derived every
    // frame rather than trusting that every code path remembered to shut
    // it, so it can never be left hanging open after a round ends.
    rampTarget = (spawningGold || goldShowerActive) ? 1 : 0;

    // Shower watchdog: if gold has been rolling for way too long (wedged
    // in the hatch, jiggle equilibrium in the pile, etc.), drop every
    // remaining gold ball straight into the tray and finish the round
    // rather than leaving the bar open with the machine stuck.
    if (goldShowerActive && !spawningGold && performance.now() - showerStartedAt > 12000) {
      balls.forEach(b => {
        if (!b.isReward || !b.moving) return;
        const br = b.r || BALL_R;
        b.y = trayFloorY - br;
        b.vx = 0; b.vy = 0;
        b.moving = false;
      });
    }

    // Animate the floor bar toward its open/shut target. While it moves,
    // wake any settled black ball the bar has dropped away from beneath,
    // so it visibly rides the ramp instead of floating in place.
    if (rampProgress !== rampTarget) {
      const d = rampTarget - rampProgress;
      rampProgress += Math.sign(d) * Math.min(Math.abs(d), 0.06);
      balls.forEach(b => {
        if (!b.isReward && !b.moving && b.y + (b.r || BALL_R) < rampYAt(b.x) - 0.5) b.moving = true;
      });
    }

    // Several balls can end up in a shoving match squeezed into one narrow
    // slot, each pushing the others just enough that none of them ever
    // individually satisfies "touching the floor" -- rather than wait on
    // that (or the much longer stuck-timeout below), once every ball has
    // crossed the line into its slot, a short grace period for the jiggling
    // to visually settle is enough; then force the finish immediately
    // instead of waiting on a timer.
    const allPastLine = balls.length > 0 && balls.every(b => !b.moving || b.y > pegsBottomY + PEG_R * 3);
    if (allPastLine) {
      if (allPastLineSince === null) allPastLineSince = performance.now();
    } else {
      allPastLineSince = null;
    }
    const settledEnough = allPastLineSince !== null && performance.now() - allPastLineSince > 600;

    // Longer-running backstop for anything that never even reaches its
    // slot (e.g. wedged higher up in the peg field) -- force everything to
    // settle once a round has been running too long, regardless of position.
    // The reward shower is exempt -- once gold balls start falling, let the
    // whole thing play out to the winning comment with no time limit.
    const inRewardPhase = spawningGold || goldShowerActive;
    const timedOut = !inRewardPhase && performance.now() - roundStartTime > MAX_ROUND_MS;

    if (settledEnough || timedOut) {
      balls.forEach(b => {
        if (!b.moving) return;
        const br = b.r || BALL_R;
        // While a gold shower is in progress, no gold ball -- on the bar,
        // mid-air, or already past the gate and still bouncing in the tray
        // -- gets force-frozen by this timer. Freezing it wherever it
        // happened to be mid-bounce is exactly what read as it "cutting
        // off." The 12s shower watchdog (showerStartedAt, elsewhere) is
        // the only backstop that still applies during a shower.
        if (b.isReward && goldShowerActive) return;
        b.y = Math.min(b.y, floorFor(b) - br);
        b.vx = 0; b.vy = 0;
        b.moving = false;
        b.slotIndex = Math.max(0, Math.min(slotCount - 1, Math.floor(b.x / slotW)));
      });
    }
    balls.forEach(stepBall);
    resolveBallCollisions();
    balls.forEach(clampToBounds);
    draw();
    if (stuckBeyondRecovery) {
      stuckBeyondRecovery = false;
      cancelAnimationFrame(rafId);
      layout(); // full reset: fresh pegs, fresh winning slot, empty board
      return;
    }
    if (balls.some(b => b.moving) || spawningGold || rampProgress !== rampTarget) {
      rafId = requestAnimationFrame(step);
    } else if (pendingRelayout) {
      // A resize that arrived mid-drop (e.g. a mobile browser's address bar
      // showing/hiding, which fires ResizeObserver too) is applied now
      // instead of yanking the board out from under an active drop.
      pendingRelayout = false;
      layout();
    } else {
      // Balls stay right where they landed -- no auto-reset. The board only
      // clears when the user clicks the restart button.
      evaluateOutcome();
    }
  }

  function startPhysics() {
    roundStartTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(step);
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx, y: cy };
  }

  canvas.addEventListener("pointerdown", e => {
    // The 3-minute round is over -- no more drops until the high-score
    // lightbox is dismissed (see endPlinkoRound/closePlinkoGameOver).
    if (plinkoGameOver) return;
    // Tray gold from earlier rounds doesn't count as an active round --
    // only the black balls do.
    if (balls.some(b => !b.isReward)) {
      // Round is over (comment showing, everything settled) -- clicking
      // ANYWHERE on the machine resets it, no need to find the ↻ button.
      // Mid-drop clicks still do nothing.
      if (!spawningGold && !balls.some(b => b.moving)) layout();
      return;
    }
    const p = pointerPos(e);
    if (Math.hypot(p.x - dragBall.x, p.y - dragBall.y) > BALL_R * 3) return;
    e.preventDefault();
    dragging = true;
    canvas.classList.add("dragging");
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    // Hovering the painted bag tally shows what a bag is worth -- the bag
    // is canvas pixels, not a DOM node, so the tooltip rides canvas.title.
    const hp = pointerPos(e);
    const overBag = hp.x >= 4 && hp.x <= 80 && hp.y >= trayFloorY - 26 && hp.y <= trayFloorY;
    canvas.title = overBag ? `1 bag = ${TRAY_CAPACITY} golden balls` : "";
    if (!dragging) return;
    dragBall.x = Math.max(BALL_R, Math.min(cssW - BALL_R, hp.x));
    draw();
  });
  function releaseDrag() {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("dragging");
    balls = balls.filter(b => b.isReward); // tray stash stays put
    roundOver = false;
    // Countdown starts on the first drop, not just from opening the panel.
    if (plinkoRemainingMs === null) {
      plinkoRemainingMs = PLINKO_ROUND_MS;
      plinkoLastTickAt = Date.now();
    }
    for (let i = 0; i < ballCount; i++) {
      // Every ball drops near the release point -- not stacked on the exact
      // same pixel, but not scattered across the whole board either.
      const x = i === 0 ? dragBall.x : dragBall.x + (Math.random() - 0.5) * 60;
      balls.push({
        x: Math.max(BALL_R, Math.min(cssW - BALL_R, x)),
        y: dragBall.y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0,
        moving: true,
      });
    }
    startPhysics();
  }
  canvas.addEventListener("pointerup", releaseDrag);
  canvas.addEventListener("pointercancel", releaseDrag);

  let pendingRelayout = false;
  const ro = new ResizeObserver(() => {
    if (balls.some(b => b.moving)) { pendingRelayout = true; return; }
    layout();
  });

  document.getElementById("plinko-colors-slider")?.addEventListener("input", e => setColoredSlots(Number(e.target.value)));
  document.getElementById("plinko-balls-slider")?.addEventListener("input", e => setBallCount(Number(e.target.value)));

  document.getElementById("plinko-restart-btn")?.addEventListener("click", () => {
    cancelAnimationFrame(rafId);
    dragging = false;
    canvas.classList.remove("dragging");
    layout(); // fresh pegs, winning slot, colored slots, and an empty board
  });

  document.getElementById("plinko-restaurant-mode")?.addEventListener("change", e => {
    restaurantMode = e.target.checked;
    if (restaurantMode) restaurantNames = getRestaurantNames();
    const legend = document.getElementById("plinko-restaurant-legend");
    legend?.classList.toggle("open", restaurantMode);
    cancelAnimationFrame(rafId);
    dragging = false;
    canvas.classList.remove("dragging");
    layout();
  });

  const card = document.getElementById("plinko-card");
  toggleBtn.addEventListener("click", () => {
    const open = !toggleBtn.classList.contains("open");
    toggleBtn.classList.toggle("open", open);
    panel.classList.toggle("open", open);
    card?.classList.toggle("plinko-card-open", open);
    if (open && !initialized) {
      initialized = true;
      requestAnimationFrame(() => { layout(); ro.observe(board); });
      startClock();
    }
  });

  // A simple stopwatch, not tied to any round -- starts the moment the
  // panel is first opened and just keeps counting for the rest of the
  // session, even if the panel is later collapsed and reopened.
  // Counts DOWN from 3:00, not up -- sits at the full duration until the
  // first drop actually starts plinkoRemainingMs (see releaseDrag above).
  function startClock() {
    const el = document.getElementById("plinko-clock");
    if (!el) return;
    tickPlinkoClock();
    setInterval(tickPlinkoClock, 1000);
  }
  function tickPlinkoClock() {
    const el = document.getElementById("plinko-clock");
    if (!el) return;
    if (plinkoRemainingMs === null) { el.textContent = formatClock(PLINKO_ROUND_MS); return; }
    const now = Date.now();
    // Frozen while the reward shower is playing out -- winning shouldn't
    // burn round time while the gold is falling/settling. Resumes counting
    // (and starts accruing elapsed time again) the instant the shower ends
    // or the next ball drops, whichever comes first.
    const paused = spawningGold || goldShowerActive;
    if (!paused) plinkoRemainingMs -= now - plinkoLastTickAt;
    plinkoLastTickAt = now;
    el.textContent = formatClock(plinkoRemainingMs);
    if (plinkoRemainingMs <= 0 && !plinkoGameOver) endPlinkoRound();
  }

  // Round's over: lock the board, show the score, and ask for initials
  // (or let them skip) before anything actually wipes.
  function endPlinkoRound() {
    plinkoGameOver = true;
    dragging = false;
    canvas.classList.remove("dragging");
    cancelAnimationFrame(rafId);
    document.getElementById("plinko-gameover-score").textContent = goldTotal;
    const initialsInput = document.getElementById("plinko-gameover-initials");
    initialsInput.value = "";
    document.getElementById("plinko-gameover-entry").style.display = "block";
    document.getElementById("plinko-leaderboard").style.display = "none";
    document.getElementById("plinko-gameover-lightbox").classList.add("open");
    setTimeout(() => initialsInput.focus(), 50);
  }

  async function submitPlinkoScore() {
    const btn = document.getElementById("plinko-gameover-submit-btn");
    const initials = (document.getElementById("plinko-gameover-initials").value || "").trim().toUpperCase().slice(0, 3) || "???";
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      if (APPS_SCRIPT_URL) {
        const params = new URLSearchParams({ type: "plinkoScore", name: initials, score: String(goldTotal) });
        await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
      }
    } catch (err) {
      console.warn("[plinko] score submit failed:", err);
    }
    btn.disabled = false;
    btn.textContent = "Submit";
    showPlinkoLeaderboard();
  }

  async function showPlinkoLeaderboard() {
    document.getElementById("plinko-gameover-entry").style.display = "none";
    const boardEl = document.getElementById("plinko-leaderboard");
    const listEl = document.getElementById("plinko-leaderboard-list");
    boardEl.style.display = "block";
    listEl.innerHTML = `<li class="plinko-leaderboard-loading">Loading…</li>`;
    try {
      if (!PLINKO_SCORES_GID || !SHEET_ID) throw new Error("not configured");
      const rows = parseCSV(await fetchCSV(PLINKO_SCORES_GID)).slice(1); // drop header row
      const scores = rows
        .map(r => ({ name: (r[1] || "").trim(), score: Number(r[2]) || 0 }))
        .filter(r => r.name)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      listEl.innerHTML = scores.length
        ? scores.map(s => `<li><span class="plinko-leaderboard-name">${esc(s.name)}</span><span class="plinko-leaderboard-value">${s.score}</span></li>`).join("")
        : `<li class="plinko-leaderboard-empty">No scores yet.</li>`;
    } catch (err) {
      listEl.innerHTML = `<li class="plinko-leaderboard-empty">High scores aren't hooked up yet.</li>`;
    }
  }

  // The actual wipe -- fires whether they submitted, skipped, or just
  // closed the leaderboard after a real game-over. Nothing session-related
  // survives a round. Skipped entirely when this lightbox was only opened
  // to LOOK UP the high scores (via the trophy button) -- the round hasn't
  // actually ended in that case, so there's nothing to wipe.
  function closePlinkoGameOver() {
    document.getElementById("plinko-gameover-lightbox").classList.remove("open");
    if (plinkoLeaderboardOnly) {
      plinkoLeaderboardOnly = false;
      document.getElementById("plinko-gameover-title").style.display = "";
      document.getElementById("plinko-gameover-score-row").style.display = "";
      return;
    }
    goldTotal = 0;
    localStorage.setItem("plinkoGoldTotal", "0");
    goldBags = 0;
    localStorage.setItem("plinkoGoldBags", "0");
    trayGoldCount = 0;
    saveTrayGoldCount();
    updateGoldCount(0);
    plinkoRemainingMs = null;
    plinkoLastTickAt = null;
    plinkoGameOver = false;
    layout(); // fresh board -- next drop starts a brand new countdown
  }

  // Trophy button -- look up the high scores any time, without ending or
  // affecting the current round.
  let plinkoLeaderboardOnly = false;
  function openPlinkoLeaderboard() {
    plinkoLeaderboardOnly = true;
    document.getElementById("plinko-gameover-title").style.display = "none";
    document.getElementById("plinko-gameover-score-row").style.display = "none";
    document.getElementById("plinko-gameover-lightbox").classList.add("open");
    showPlinkoLeaderboard();
  }
  window.submitPlinkoScore = submitPlinkoScore;
  window.closePlinkoGameOver = closePlinkoGameOver;
  window.openPlinkoLeaderboard = openPlinkoLeaderboard;
})();

// ── Game mode toggle (Drop Game <-> Wheel of Fortune) ───────────────────
// Both boards/control sets live in the DOM together; only one shows
// at a time, picked by [data-mode] on the card. Kept as its own tiny IIFE
// since it only needs to know about the arrow button and the card, not
// any of the three games' internals.
(function() {
  const card = document.getElementById("plinko-card");
  const btn  = document.getElementById("game-mode-toggle-btn");
  if (!card || !btn) return;

  const MODES = ["plinko", "wheel"];
  const NEXT_LABEL = { plinko: "Wheel", wheel: "Drop Game" };
  card.dataset.mode = "plinko";

  btn.addEventListener("click", () => {
    const i = MODES.indexOf(card.dataset.mode);
    const mode = MODES[(i + 1) % MODES.length];
    card.dataset.mode = mode;
    btn.title = NEXT_LABEL[mode];
    // Home (Drop Game) points forward, into Wheel/Roulette; anywhere else
    // points back, signaling the cycle leads back to Drop Game.
    btn.innerHTML = mode === "plinko" ? "&#8594;" : "&#8592;";
    document.dispatchEvent(new CustomEvent("gamemodechange", { detail: { mode } }));
  });
})();

// ── Wheel of Fortune ─────────────────────────────────────────────────────
// A canvas wheel divided into equal wedges, one per user-typed item.
// Items are hand-entered (no menu/history tie-in, unlike the Drop Game),
// so they're kept in localStorage per-browser -- there's no shared sheet
// for this, it's just a spin-the-wheel toy.
(function() {
  const board     = document.getElementById("wheel-board");
  const canvasWrap= document.getElementById("wheel-canvas-wrap");
  const canvas    = document.getElementById("wheel-canvas");
  const pointerEl = board?.querySelector(".wheel-pointer");
  const form      = document.getElementById("wheel-item-form");
  const input     = document.getElementById("wheel-item-input");
  const listEl    = document.getElementById("wheel-item-list");
  const spinBtn   = document.getElementById("wheel-spin-btn");
  const clearBtn  = document.getElementById("wheel-clear-btn");
  const shuffleBtn= document.getElementById("wheel-shuffle-btn");
  const resultEl  = document.getElementById("wheel-result");
  const confettiEl = document.getElementById("wheel-confetti");
  const presetSelect = document.getElementById("wheel-preset-select");
  const savePresetBtn = document.getElementById("wheel-save-preset-btn");
  const saveNewPresetBtn = document.getElementById("wheel-save-new-preset-btn");
  const deletePresetBtn = document.getElementById("wheel-delete-preset-btn");
  const customPresetGroup = document.getElementById("wheel-preset-custom-group");
  const editToggleBtn = document.getElementById("wheel-edit-toggle-btn");
  const editPanel = document.getElementById("wheel-edit-panel");
  if (!board || !canvasWrap || !canvas || !form || !input || !listEl || !spinBtn || !resultEl) return;

  // Save/Save As New/Delete + the Add-item form + the item list all live in
  // a collapsible slidedown -- same open/close pattern as the site's other
  // rotation-panel toggles. Everything else in .wheel-controls (preset
  // picker, Clear All/Shuffle/Spin/Reset) stays visible without expanding.
  editToggleBtn?.addEventListener("click", () => {
    const open = !editToggleBtn.classList.contains("open");
    editToggleBtn.classList.toggle("open", open);
    editPanel?.classList.toggle("open", open);
  });

  const ctx = canvas.getContext("2d");
  // Same cap as the Drop Game's canvas -- a 3x phone gets no visible
  // benefit from rendering 2.25x the pixels of a 2x cap on a static wheel.
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const DEFAULT_ITEMS = ["Item 1", "Item 2", "Item 3", "Item 4"];

  function loadItems() {
    try {
      const saved = JSON.parse(localStorage.getItem("wheelItems") || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* fall through to defaults */ }
    return DEFAULT_ITEMS.slice();
  }
  let items = loadItems();
  function saveItems() { localStorage.setItem("wheelItems", JSON.stringify(items)); }

  // ── Presets ──────────────────────────────────────────────────────────
  // Each preset has a built-in default list; "Save Preset" persists your
  // own edited version per-browser (localStorage), which then takes over
  // from the built-in default whenever that preset is picked again.
  const MEAT_TYPES = ["Chicken", "Beef", "Pork", "Shrimp", "Duck", "Lamb", "Fish", "Veg"];
  const EVENT_ITEMS = ["Hiking", "Movie", "BBQ", "Mahjong", "Boating/Kayak", "Gun Shooting", "Boardgames", "Eat & Chill"];
  const NAME_ITEMS = ["Clive", "Cynthia", "Edward", "Ben", "Landen", "Luis", "Samson"];

  function getAllRestaurantNames() {
    return [...new Set((_restaurantsConfig?.restaurants || []).map(r => r.name).filter(Boolean))];
  }

  // Aggregates History+Ratings across every restaurant (not just whichever
  // one is on screen) to find items worth spinning for when you can't
  // decide what to eat -- same "popular" (2+ separate weeks) and
  // "controversial" (3+ weeks, split opinion) thresholds buildMenuPanel
  // already uses per-restaurant, just without the restaurant filter.
  function computeGlobalFoodPicks() {
    const stats = new Map(); // item lower -> { label, weeksOrdered, ratingSum, ratingCount }
    function entryFor(label) {
      const key = label.toLowerCase();
      if (!stats.has(key)) stats.set(key, { label, weeksOrdered: new Set(), ratingSum: 0, ratingCount: 0 });
      return stats.get(key);
    }
    (_historyRows || []).forEach(r => {
      const item = (r[3] || "").trim();
      if (!item || item.startsWith("Sauce: ")) return;
      const week = (r[1] || "").trim();
      const e = entryFor(item);
      if (week) e.weeksOrdered.add(`${week}|${(r[2] || "").trim().toLowerCase()}`);
    });
    (_allRatingRows || []).forEach(r => {
      const item = (r[3] || "").trim();
      const rating = Number(r[r.length - 1]);
      if (!item || isNaN(rating)) return;
      const e = entryFor(item);
      e.ratingSum += rating;
      e.ratingCount += 1;
    });
    const picks = [];
    stats.forEach(s => {
      const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null;
      const popular = s.weeksOrdered.size >= 2;
      const controversial = s.weeksOrdered.size > 2 && avg !== null && avg < 5;
      if (popular || controversial) picks.push(s.label);
    });
    return picks.length ? picks : MEAT_TYPES.slice();
  }

  const PRESETS = {
    restaurants: { label: "Restaurant Picker", build: getAllRestaurantNames },
    foodPopular: { label: "Food: Popular Picks", build: computeGlobalFoodPicks },
    foodMeat:    { label: "Food: Meat Types", build: () => MEAT_TYPES.slice() },
    event:       { label: "Event", build: () => EVENT_ITEMS.slice() },
    names:       { label: "Names", build: () => NAME_ITEMS.slice() },
  };

  function loadPresetOverrides() {
    try { return JSON.parse(localStorage.getItem("wheelPresetOverrides") || "{}"); }
    catch { return {}; }
  }
  // Custom, user-named presets (as many as you like) -- separate from the
  // 4 built-ins above, which can only be overwritten, not multiplied.
  function loadCustomPresets() {
    try { return JSON.parse(localStorage.getItem("wheelCustomPresets") || "{}"); }
    catch { return {}; }
  }
  function saveCustomPresets(obj) { localStorage.setItem("wheelCustomPresets", JSON.stringify(obj)); }

  function presetItems(key) {
    if (key.startsWith("custom:")) {
      const customs = loadCustomPresets();
      const found = customs[key.slice(7)];
      return Array.isArray(found) && found.length ? found.slice() : DEFAULT_ITEMS.slice();
    }
    const overrides = loadPresetOverrides();
    if (Array.isArray(overrides[key]) && overrides[key].length) return overrides[key].slice();
    const built = PRESETS[key]?.build() || [];
    return built.length ? built : DEFAULT_ITEMS.slice();
  }

  function renderCustomPresetOptions() {
    if (!customPresetGroup) return;
    const customs = loadCustomPresets();
    const names = Object.keys(customs).sort((a, b) => a.localeCompare(b));
    const selected = presetSelect?.value;
    customPresetGroup.innerHTML = names.map(n =>
      `<option value="custom:${escAttr(n)}">${esc(n)}</option>`
    ).join("");
    if (selected && presetSelect) presetSelect.value = selected;
  }

  function updatePresetButtons() {
    const key = presetSelect?.value || "";
    if (savePresetBtn) savePresetBtn.disabled = !key;
    if (deletePresetBtn) deletePresetBtn.disabled = !key.startsWith("custom:");
  }

  presetSelect?.addEventListener("change", () => {
    const key = presetSelect.value;
    updatePresetButtons();
    if (!key) return;
    items = presetItems(key);
    saveItems();
    renderItemList();
    rotation = 0;
    hideResult();
    drawWheel();
  });

  // Overwrites whichever preset (built-in or custom) is currently selected
  // with the current items -- does NOT create a new one.
  savePresetBtn?.addEventListener("click", () => {
    const key = presetSelect?.value;
    if (!key) return;
    if (key.startsWith("custom:")) {
      const customs = loadCustomPresets();
      customs[key.slice(7)] = items.slice();
      saveCustomPresets(customs);
    } else {
      const overrides = loadPresetOverrides();
      overrides[key] = items.slice();
      localStorage.setItem("wheelPresetOverrides", JSON.stringify(overrides));
    }
    savePresetBtn.textContent = "Saved!";
    setTimeout(() => { savePresetBtn.textContent = "Save"; }, 1200);
  });

  // Saves the CURRENT items as a brand-new named preset, separate from the
  // 4 built-ins -- as many of these as you want.
  saveNewPresetBtn?.addEventListener("click", () => {
    if (!items.length) return;
    const name = (prompt("Name this preset:") || "").trim();
    if (!name) return;
    const customs = loadCustomPresets();
    customs[name] = items.slice();
    saveCustomPresets(customs);
    renderCustomPresetOptions();
    if (presetSelect) presetSelect.value = `custom:${name}`;
    updatePresetButtons();
  });

  deletePresetBtn?.addEventListener("click", () => {
    const key = presetSelect?.value || "";
    if (!key.startsWith("custom:")) return;
    const customs = loadCustomPresets();
    delete customs[key.slice(7)];
    saveCustomPresets(customs);
    renderCustomPresetOptions();
    if (presetSelect) presetSelect.value = "";
    updatePresetButtons();
  });

  renderCustomPresetOptions();

  function shuffleArrayInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  let cssSize = 0;
  let rotation = 0; // radians, current wheel orientation
  let spinning = false;
  let lastPinIndex = 0; // which rim pin last passed the pointer, for the flick effect

  function renderItemList() {
    listEl.innerHTML = items.map((it, i) => `
      <span class="wheel-item-chip">
        <span class="wheel-item-text" contenteditable="true" spellcheck="false" data-i="${i}">${esc(it)}</span>
        <button type="button" class="wheel-item-chip-remove" data-i="${i}" aria-label="Remove ${escAttr(it)}">&times;</button>
      </span>
    `).join("");
    listEl.querySelectorAll(".wheel-item-chip-remove").forEach(b => {
      b.addEventListener("click", () => {
        items.splice(Number(b.dataset.i), 1);
        saveItems();
        renderItemList();
        drawWheel();
      });
    });
    listEl.querySelectorAll(".wheel-item-text").forEach(t => {
      t.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); t.blur(); }
      });
      t.addEventListener("blur", () => {
        const i = Number(t.dataset.i);
        const v = t.textContent.trim();
        if (!v) { t.textContent = items[i]; return; } // no blanking out an item this way
        if (v !== items[i]) {
          items[i] = v;
          saveItems();
          drawWheel();
        }
      });
    });
    spinBtn.disabled = items.length < 2;
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    items.push(v);
    input.value = "";
    saveItems();
    renderItemList();
    drawWheel();
  });

  clearBtn?.addEventListener("click", () => {
    items = [];
    saveItems();
    renderItemList();
    rotation = 0;
    hideResult();
    drawWheel();
  });

  shuffleBtn?.addEventListener("click", () => {
    if (spinning) return;
    shuffleArrayInPlace(items);
    saveItems();
    renderItemList();
    drawWheel();
  });

  // No separate reset button -- clicking the wheel itself resets it (a
  // no-op mid-spin, same guard the old button had).
  canvas.addEventListener("click", () => {
    if (spinning) return;
    rotation = 0;
    lastPinIndex = 0;
    hideResult();
    drawWheel();
  });

  function layout() {
    const w = board.clientWidth, h = board.clientHeight;
    if (w <= 0 || h <= 0) return;
    // Only the vertical axis needs the big reserve -- it's clearance for
    // the pointer's pivot (which sits ~40px above the canvas) plus a real
    // gap above THAT (about a pin-circle's width) so it never reads as
    // flush against the board's own edge. The width doesn't need nearly as
    // much margin; computing the two limits separately (instead of
    // reserving the same amount out of whichever of w/h is smaller) means
    // a narrow mobile board -- where width, not height, is what's actually
    // tight -- lets the wheel use almost the full width instead of being
    // shrunk by a vertical-only reserve it doesn't need sideways.
    const maxByWidth  = w - 24;
    const maxByHeight = h - 140;
    cssSize = Math.max(60, Math.min(maxByWidth, maxByHeight));
    canvasWrap.style.width  = `${cssSize}px`;
    canvasWrap.style.height = `${cssSize}px`;
    canvas.width  = Math.round(cssSize * DPR);
    canvas.height = Math.round(cssSize * DPR);
    canvas.style.width  = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWheel();
  }

  // Canvas's `font` setter needs a REAL font-family -- "inherit" isn't one
  // (it's a CSS cascade keyword, not a <family-name>), so that assignment
  // was silently rejected and the canvas kept falling back to its default
  // 10px font no matter how big fontSize was computed. Match the site's
  // actual body font stack instead.
  const CANVAS_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

  function hexToHsl(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  // Wedges pull from the current theme's own accent color: itself, a
  // lighter tint, a darker shade, and its color-wheel complement -- a mix
  // of related and contrasting tones instead of a fixed hardcoded palette.
  function themeWedgeColors() {
    const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#fcf811";
    const [h, s, l] = hexToHsl(accent);
    // A pale/desaturated theme accent (e.g. a light pastel) produced a tint
    // barely distinguishable from the page background -- force a minimum
    // saturation and a wider lightness spread so all four wedges stay
    // clearly readable against each other and the surrounding page.
    const sat = Math.max(s, 55);
    return [
      accent,
      hslToHex(h, sat, Math.min(88, l + 32)),
      hslToHex(h, sat, Math.max(16, l - 32)),
      hslToHex((h + 180) % 360, sat, l),
    ];
  }
  // The pointer's glow isn't canvas -- it's a plain DOM element, so it
  // can't pull from --accent directly the way the wedges do. Instead, the
  // same hue-rotate-180 trick used for the wedges' complement color drives
  // three CSS custom properties (a light core, the true complement, and a
  // dark edge) that the pointer's CSS gradient/glow reads -- so the flapper
  // always glows in whatever color contrasts with the current theme,
  // instead of a fixed hardcoded red.
  function updatePointerGlow() {
    if (!pointerEl) return;
    const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#fcf811";
    const [h] = hexToHsl(accent);
    const compH = (h + 180) % 360;
    pointerEl.style.setProperty("--pointer-core", hslToHex(compH, 90, 88));
    pointerEl.style.setProperty("--pointer-mid",  hslToHex(compH, 85, 62));
    pointerEl.style.setProperty("--pointer-edge", hslToHex(compH, 80, 36));
  }

  // Shared by the Wheel-of-Fortune view and the Roulette view -- same
  // picks, same wedge/pin rendering, just drawn onto whichever canvas
  // context is passed in with whichever rotation (Roulette's wheel never
  // rotates, so it always passes 0).
  function drawPockets(pctx, size, extraRotation) {
    const n = items.length;
    const r = size / 2;
    pctx.clearRect(0, 0, size, size);
    if (!n) return r;

    // The pie sits inside a fixed outer border ring, with a bleed gap
    // between the two -- like a real wheel's housing. The ring does NOT
    // rotate (drawn outside the rotated context below). Flat off-white
    // backing regardless of theme, stroked at the same weight as the
    // wedge lines.
    const outerR = r - 4;
    const pieR = r - 20;
    pctx.beginPath();
    pctx.arc(r, r, outerR, 0, Math.PI * 2);
    pctx.fillStyle = "#faf7ef";
    pctx.fill();
    pctx.lineWidth = 1.25;
    pctx.strokeStyle = "#000";
    pctx.stroke();

    // Drop shadow under the pie for depth -- a backdrop disc drawn with
    // canvas shadow enabled; the wedges then cover the disc itself, so
    // only its shadow (spilling into the bleed gap) stays visible.
    pctx.save();
    // Dense and tight: high opacity, little blur, small offset -- reads as
    // the pie sitting just barely off the housing, not floating high.
    pctx.shadowColor = "rgba(0, 0, 0, 0.65)";
    pctx.shadowBlur = 5;
    pctx.shadowOffsetX = 0;
    pctx.shadowOffsetY = 3;
    pctx.beginPath();
    pctx.arc(r, r, pieR, 0, Math.PI * 2);
    pctx.fillStyle = "#666";
    pctx.fill();
    pctx.restore();

    const colors = themeWedgeColors();
    const slice = (Math.PI * 2) / n;
    // Starting point for how big the text COULD be, given wedge width and
    // radius -- longer labels shrink from here on a per-item basis (see
    // fitLabel below), so a few long names don't drag every other wedge's
    // font size down with them.
    const baseFontSize = Math.max(12, Math.min(r * 0.26, (r * 1.15) / n));
    const minFontSize = 9;
    // Radial room for the text -- kept well short of the hub (not just
    // rim-to-hub) so labels stay out in the wedge's outer band instead of
    // crowding together near the center once they're long enough to reach
    // that far in.
    const availableLen = pieR * 0.55;

    // Cap at 2 words first (reads better truncated at a word boundary than
    // mid-word, e.g. a long restaurant name), then shrink the font until
    // what's left actually fits the wedge; only chops mid-word as a last
    // resort if it's still too wide even at the smallest readable size.
    function fitLabel(text) {
      const words = text.trim().split(/\s+/);
      let label = words.length > 2 ? words.slice(0, 2).join(" ") + "…" : text;

      let fsize = baseFontSize;
      pctx.font = `900 ${fsize}px ${CANVAS_FONT_FAMILY}`;
      let w = pctx.measureText(label).width;
      if (w > availableLen) {
        fsize = Math.max(minFontSize, fsize * (availableLen / w));
        pctx.font = `900 ${fsize}px ${CANVAS_FONT_FAMILY}`;
        w = pctx.measureText(label).width;
      }
      while (w > availableLen && label.length > 4) {
        label = label.slice(0, -2).trimEnd() + "…";
        w = pctx.measureText(label).width;
      }
      return { label, size: fsize };
    }

    pctx.save();
    pctx.translate(r, r);
    pctx.rotate(extraRotation);
    for (let i = 0; i < n; i++) {
      const start = i * slice, end = start + slice;
      const wedgeColor = colors[i % colors.length];
      pctx.beginPath();
      pctx.moveTo(0, 0);
      pctx.arc(0, 0, pieR, start, end);
      pctx.closePath();
      pctx.fillStyle = wedgeColor;
      pctx.fill();
      pctx.lineWidth = 1.25;
      pctx.strokeStyle = "#000";
      pctx.stroke();

      const { label, size: fsize } = fitLabel(items[i]);
      pctx.save();
      pctx.rotate(start + slice / 2);
      pctx.textAlign = "right";
      pctx.textBaseline = "middle";
      pctx.fillStyle = "#000"; // always black -- auto contrast (white on light/yellow) wasn't reliable
      pctx.font = `900 ${fsize}px ${CANVAS_FONT_FAMILY}`;
      pctx.fillText(label, pieR - 12, 0);
      pctx.restore();
    }
    // Pins at each wedge boundary, on the rim -- rotate along with the
    // wheel (drawn inside the same rotated context) since they're
    // physically part of the wheel, unlike the fixed pointer above it.
    const pinR = Math.max(3, r * 0.02);
    for (let i = 0; i < n; i++) {
      const angle = i * slice;
      const px = Math.cos(angle) * pieR;
      const py = Math.sin(angle) * pieR;
      pctx.beginPath();
      pctx.arc(px, py, pinR, 0, Math.PI * 2);
      pctx.fillStyle = "#ffc400";
      pctx.fill();
      pctx.lineWidth = Math.max(1, pinR * 0.35);
      pctx.strokeStyle = "#5c3a1e";
      pctx.stroke();
    }
    pctx.restore();

    pctx.beginPath();
    pctx.arc(r, r, Math.max(8, r * 0.06), 0, Math.PI * 2);
    pctx.fillStyle = "#000";
    pctx.fill();
    return r;
  }

  function drawWheel() {
    if (!cssSize) return;
    drawPockets(ctx, cssSize, rotation);
  }

  // The pointer is fixed at the top (12 o'clock); work out which wedge is
  // currently under it given the wheel's current rotation.
  function indexAtPointer() {
    const n = items.length;
    if (!n) return -1;
    const slice = (Math.PI * 2) / n;
    const twoPi = Math.PI * 2;
    const norm = ((-Math.PI / 2 - rotation) % twoPi + twoPi) % twoPi;
    return Math.floor(norm / slice) % n;
  }

  // Re-triggers the flick animation by forcing a reflow -- toggling the
  // class alone wouldn't restart an already-running/just-finished one.
  function flickPointer() {
    if (!pointerEl) return;
    pointerEl.classList.remove("flick");
    void pointerEl.offsetWidth;
    pointerEl.classList.add("flick");
  }

  // Shared by both the Wheel and Roulette result overlays. Named apart
  // from the pre-existing header-box confetti easter egg (.confetti-piece)
  // so the two never collide.
  const CONFETTI_COLORS = ["#ffc400", "#ff5a5f", "#00c2a8", "#7a5cff", "#ff8fd0", "#4ea1ff", "#8bd450", "#ff9f45"];
  function spawnConfettiPiece(container, fallSeconds) {
    const el = document.createElement("div");
    el.className = "wheel-confetti-piece";
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    el.style.setProperty("--confetti-drift", `${Math.round((Math.random() - 0.5) * 160)}px`);
    // Falls well past the board's own height so it drops fully out of view
    // ("below the table") instead of visibly stopping/landing anywhere.
    const fallDist = container.clientHeight + 150 + Math.random() * 100;
    el.style.setProperty("--confetti-fall", `${Math.round(fallDist)}px`);
    el.style.setProperty("--confetti-spin", `${Math.round((Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540))}deg`);
    el.style.animationDuration = `${fallSeconds}s`;
    container.appendChild(el);
    setTimeout(() => el.remove(), fallSeconds * 1000 + 100);
  }

  // Keeps spawning new pieces for a full 3s (a continuous rain, not one
  // single burst) -- each piece then falls on its own for fallSeconds and
  // disappears off the bottom.
  function launchConfetti(container) {
    if (!container) return;
    const spawnWindow = 2000;
    const fallSeconds = 1.4;
    const startTime = performance.now();

    function tick() {
      if (performance.now() - startTime >= spawnWindow) return;
      for (let i = 0; i < 5; i++) spawnConfettiPiece(container, fallSeconds);
      setTimeout(tick, 60);
    }
    tick();
  }

  function hideResult() { resultEl.classList.remove("show"); }
  function showResult(text) {
    resultEl.textContent = text;
    resultEl.classList.add("show");
    launchConfetti(confettiEl);
  }

  function spin() {
    if (spinning || items.length < 2) return;
    spinning = true;
    hideResult();
    spinBtn.disabled = true;

    const n = items.length;
    const slice = (Math.PI * 2) / n;
    // A pin is drawn at wheel-local angle i*slice, so in canvas space it
    // sits at (i*slice + rotation). The pointer is fixed at canvas angle
    // -PI/2 (top), not 0 -- so "a pin is at the pointer" happens when
    // (rotation + PI/2) crosses a multiple of slice, not when rotation
    // itself does. Using plain rotation/slice (no +PI/2) only happened to
    // line up for exactly 4 items; for any other count the flick fired a
    // fraction of a turn early/late relative to the pin actually being at
    // the pointer.
    const pointerPhase = Math.PI / 2;
    lastPinIndex = Math.floor((rotation + pointerPhase) / slice);

    const extraSpins = 6 + Math.random() * 3;
    const target = rotation + extraSpins * Math.PI * 2 + Math.random() * Math.PI * 2;
    const duration = 5800; // spins a bit longer than before
    const startRot = rotation;
    const startTime = performance.now();
    // Quintic (not cubic) ease-out -- a longer, smoother glide into the
    // stop instead of an abrupt-feeling deceleration ("some grease").
    const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      rotation = startRot + (target - startRot) * easeOutQuint(t);
      drawWheel();

      // Every rim pin that's swept past the fixed pointer since last frame
      // triggers a click/flick, same as a real wheel's flapper.
      const pinIndex = Math.floor((rotation + pointerPhase) / slice);
      if (pinIndex !== lastPinIndex) {
        lastPinIndex = pinIndex;
        flickPointer();
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        spinning = false;
        spinBtn.disabled = items.length < 2;
        const idx = indexAtPointer();
        if (idx >= 0) showResult(items[idx]);
      }
    }
    requestAnimationFrame(step);
  }

  spinBtn.addEventListener("click", spin);

  // Board is display:none until Wheel mode is opened, so clientWidth/Height
  // read 0 until then -- lay out the instant mode switches, then keep in
  // sync with manual resize-grip drags via ResizeObserver.
  document.addEventListener("gamemodechange", e => { if (e.detail.mode === "wheel") layout(); });
  // Wedge colors are derived from --accent, but neither theme swatches nor
  // dark mode fired any event before now -- nothing ever told the wheel to
  // redraw, so it stayed stuck on whatever theme was active when it was
  // last drawn.
  document.addEventListener("themechange", () => { drawWheel(); updatePointerGlow(); });
  updatePointerGlow();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => { if (board.offsetParent) layout(); }).observe(board);
  }

  renderItemList();
})();
