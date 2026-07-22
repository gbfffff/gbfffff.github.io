
const _cfg            = window.TAKEOUT_CONFIG || {};
const APPS_SCRIPT_URL = _cfg.APPS_SCRIPT_URL  || "";
const FORM_URL        = _cfg.FORM_URL         || "";
const FORM_NAME_ENTRY = _cfg.FORM_NAME_ENTRY  || "";
const FORM_ORDER_ENTRY= _cfg.FORM_ORDER_ENTRY || "";
const SHEET_ID        = _cfg.SHEET_ID         || "";
const ORDERS_GID      = _cfg.ORDERS_GID       || "0";
const DRIVERS_GID     = _cfg.DRIVERS_GID      || "";
const HISTORY_GID     = _cfg.HISTORY_GID      || "";
const RATINGS_GID     = _cfg.RATINGS_GID      || "";
const OVERRIDES_GID   = _cfg.OVERRIDES_GID    || "";

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
// Cache-busting: app.js/gate.js/styles.css are renamed with the version
// baked into the filename (e.g. app.v1.9.1.js) rather than a "?v=" query
// param, so a stale browser cache can't serve old code under any
// circumstance. Bumping the version means: rename all three files (in BOTH
// takeouts/ and takeouts-qa/) to the new version, then update the
// <script>/<link> tags in both index.html files to match. config.js is
// exempt -- it's regenerated fresh by the deploy workflow every push, so it
// stays on the simpler "?v=" query-param scheme.
const APP_VERSION = "1.13.0";
const CHANGELOG = [
  { version: "1.13.0", date: "2026-07-12", notes: [
    "Drop Game (Plinko) and Wheel of Fortune moved out to their own standalone game at games/plinko-wheel/, alongside Polls under a new games/ hub -- no longer part of this app's order-taking page",
    "New \"Reports and Stats\" card under Rate Your Order: a grid of small widgets (Overall Satisfaction, Average $/Person, Dishes Logged, Food Chart preview, Favs and Hates, Restaurant Popularity) -- click any widget for a bigger detail view (trend chart, bar chart, or full pie + legend), which links straight through to that dish's/restaurant's report",
    "Override active for the week: the order deadline no longer marks late orders, the Worksheet no longer tags rows \"(late)\", and the countdown clock no longer flips to ORDERS CLOSED -- the deadline only applies to the normal Friday rotation with no override in effect",
    "Menu panel gets a search bar next to Random Pick -- filters the browsable menu in place instead of jumping to a category",
    "Fixed the traffic map's zoom buttons rendering on top of open modals (Food Chart, Item Stats, confirm/PIN/override dialogs, image lightbox)",
    "Food Chart (and its Reports and Stats preview) now defaults to sorting by Orders first, Rating as the tiebreaker, instead of Rating alone",
    "Overall Satisfaction's detail view is now a rating-over-time trend line (date on the x-axis) instead of a 1-10 histogram, matching the same chart style as the restaurant/item report trends",
    "Reports and Stats: Restaurant Popularity is now a plain ranked table (Orders + Avg Rating) instead of a pie, and Favs/Hates is now a 👍/💔 count pair instead of cramming item-name lists into the tile -- both still link through to the full detail",
    "Order form now allows ordering the same dish more than once -- adding it again (from the menu panel, search dropdown, or Enter) no longer gets silently ignored, and the selected-items pill shows a ×N count instead of stacking identical pills",
    "New \"Driver This Week\" card between Place Your Order and the Orders Worksheet -- shows that restaurant's usual driver (or whoever swapped in for this week), with an Edit button for a same-week swap",
    "Rate Your Order: the 1-10 slider is now a row of 10 tap buttons -- a lot easier to hit precisely with a finger than dragging a thin range slider",
    "Traffic card gets a Checkpoint Details toggle -- per-checkpoint % of normal speed, flagging any that resolve to a non-motorway road segment",
    "Override Restaurant picker is a single-column list in a narrower lightbox instead of a 2-column grid",
    "Random Pick's lightbox is 25% wider, and its width no longer shifts between a short and a long item name",
    "Removed the stripe divider's periodic scroll animation",
    "Fixed Rate Your Order silently un-selecting your picks before you hit Submit -- the 30s background data refresh was rebuilding the rating buttons from scratch and had nothing to restore an in-progress (not yet submitted) selection from",
    "History logs under the nominal Friday as usual when following the normal rotation, but under the actual date Order Complete was clicked when an override is active -- an overridden round can run past Friday, and used to show under the wrong date in every report/trend chart",
  ]},
  { version: "1.12.0", date: "2026-07-10", notes: [
    "Rotation panel gets a 'Food Chart' entry (star-bulleted, line 15) -- top/bottom-rated items across the WHOLE rotation, sortable by Orders or Rating, 10 per page, plus a 'back to top' close row",
    "Restaurant report modal shows a new Performance Trend chart -- one point per order date, averaging every rated item from that date together",
    "Drop Game: countdown payout formula reworked (row-depth bonus, effective-slot cap), payout preview no longer QA-only, gold/bags/tray no longer persist across a refresh, countdown pauses during the reward shower and while any comment is showing",
  ]},
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

// Today's actual calendar date in ET, as YYYY-MM-DD -- used to log History
// rows under the date Order Complete was ACTUALLY clicked, rather than
// always tagging them with the nominal currentFriday. Those two only
// diverge when a restaurant override lets the round run past Friday (the
// worksheet stays open through Monday 6am ET) -- without this, an
// overridden order completed on, say, Saturday would get logged under the
// wrong day's date in every report/trend chart that reads it back.
function getTodayET() {
  const now = new Date(debugNow());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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

  const rows = config.restaurants.map((r, i) => {
    const cur     = i === curIdx;
    const name    = r.name || r.ref || "?";
    const cuisine = r.cuisine ? `<span class="rotation-cuisine">${esc(r.cuisine)}</span>` : "";
    const curArrow = cur ? `<span class="rotation-row-current-arrow" aria-hidden="true">&#9654;</span>` : "";
    return `<div class="rotation-row${cur ? " rotation-row-current" : ""}" data-restaurant="${escAttr(name)}" title="View order history &amp; ratings for ${escAttr(name)}">
      <span class="rotation-idx">${i + 1}</span>
      ${curArrow}
      <span class="rotation-name">${esc(name)}</span>
      ${cuisine}
    </div>`;
  });

  // A standalone entry (not a restaurant) at line 15 -- a black star bullet
  // instead of the usual number badge marks it as different from the
  // rotation list around it. If there aren't 15 rows yet, splice just
  // clamps to the end, so it still shows up rather than being dropped.
  const foodChartRow = `<div class="rotation-row rotation-row-foodchart" id="rotation-food-chart-row" title="See top-rated items across the whole rotation">
      <span class="rotation-idx rotation-star">&#9733;</span>
      <span class="rotation-name">Food Chart</span>
      <span class="rotation-cuisine rotation-cuisine-stripes"></span>
    </div>`;
  rows.splice(14, 0, foodChartRow);
  // Last row: collapses the slidedown shut again -- same "back to top"
  // idea as the menu panel's category shortcut, just closing instead of
  // scrolling since this whole panel (not a section within it) is what's
  // open.
  rows.push(`<button type="button" class="rotation-back-to-top" id="rotation-back-to-top-btn">&#9650; Close</button>`);
  panel.innerHTML = rows.join("");

  panel.onclick = e => {
    if (e.target.closest("#rotation-back-to-top-btn")) {
      btn.classList.remove("open");
      panel.classList.remove("open");
      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (e.target.closest("#rotation-food-chart-row")) { openFoodChart(); return; }
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
  await loadDrivers();
}

// Who normally drives for each restaurant's pickup, before any this-week
// swap -- keys must match restaurants.json's exact "name".
const DRIVER_DEFAULTS = {
  "Yia Yia's Kitchen": "Edward",
  "Shanghai Taste": "Clive",
  "Ixtapalapa": "Clive",
  "Ah'Haan": "Clive",
  "Sardis": "Edward",
  "Mi La Cay": "Ben",
  "偉記": "Clive",
  "Big Greek": "Ben",
  "Taco Madre": "Edward",
  "Thai Cottage": "Clive",
  "Pollo Cabana": "Edward",
  "羊城": "Ben",
};

let _driverRows = []; // Timestamp, Date, Name -- append-only, latest row per date wins (same pattern as Overrides)
let _mockDrivers = [];
// Submitted this session, always merged back in on refetch -- the Sheet's
// CSV export lags several seconds behind a write, so an immediate refetch
// right after a swap would otherwise still show the old driver.
let _optimisticDrivers = [];

async function loadDrivers() {
  if (MOCK_MODE) { _driverRows = _mockDrivers; renderDriverCard(); return; }
  if (!DRIVERS_GID) { _driverRows = [..._optimisticDrivers]; renderDriverCard(); return; }
  try {
    const csv = await fetchCSV(DRIVERS_GID);
    _driverRows = parseCSV(csv).slice(1).concat(_optimisticDrivers);
  } catch {
    _driverRows = [..._optimisticDrivers];
  }
  renderDriverCard();
}

// Latest Drivers row for this date -- an explicit swap for the week,
// overriding the restaurant's usual default. No row yet just means nobody's
// swapped, so the caller falls back to DRIVER_DEFAULTS.
function getDriverSwap(date) {
  const rows = _driverRows.filter(r => (r[1] || "").trim() === date);
  if (!rows.length) return null;
  const latest = rows.reduce((best, r) =>
    new Date(r[0]).getTime() >= new Date(best[0]).getTime() ? r : best);
  return (latest[2] || "").trim() || null;
}

function renderDriverCard() {
  const el = document.getElementById("driver-name");
  if (!el) return;
  const name = getDriverSwap(currentFriday) || DRIVER_DEFAULTS[currentRestaurantObj?.name] || "TBD";
  el.textContent = name;
}

document.getElementById("driver-edit-btn")?.addEventListener("click", () => {
  const modal = document.getElementById("driver-edit-modal");
  const input = document.getElementById("driver-edit-input");
  if (!modal || !input) return;
  input.value = getDriverSwap(currentFriday) || DRIVER_DEFAULTS[currentRestaurantObj?.name] || "";
  modal.style.display = "flex";
  input.focus();
  input.select();
});
document.getElementById("driver-edit-cancel")?.addEventListener("click", () => {
  document.getElementById("driver-edit-modal").style.display = "none";
});
document.getElementById("driver-edit-input")?.addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("driver-edit-ok")?.click();
});
document.getElementById("driver-edit-ok")?.addEventListener("click", async () => {
  const input = document.getElementById("driver-edit-input");
  const name = input.value.trim();
  if (!name) return;
  document.getElementById("driver-edit-modal").style.display = "none";
  try {
    if (MOCK_MODE) {
      _mockDrivers.push([new Date().toISOString(), currentFriday, name]);
    } else if (APPS_SCRIPT_URL) {
      const params = new URLSearchParams({ type: "driver", date: currentFriday, name });
      await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { mode: "no-cors" });
      _optimisticDrivers.push([new Date().toISOString(), currentFriday, name]);
    }
  } catch (err) {
    console.warn("[driver] swap failed:", err);
  }
  await loadDrivers();
});

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

// Persists across buildMenuPanel() re-renders (e.g. when Favs/Dislikes
// data arrives later and rebuilds the whole panel) so typing a search,
// then having the panel refresh underneath you, doesn't clear it.
let _menuPanelSearchQuery = "";

// Filters the already-rendered menu panel in place rather than rebuilding
// it -- hides non-matching .mpi rows, then hides any section/category
// block whose rows are now all hidden, so an empty category doesn't just
// sit there with a bare header.
function filterMenuPanel(query) {
  const panel = document.getElementById("menu-panel");
  if (!panel) return;
  const q = foldDiacritics(query || "").toLowerCase().trim();

  let anyVisible = false;
  panel.querySelectorAll(".mpi").forEach(el => {
    const match = !q || foldDiacritics(el.dataset.name || "").toLowerCase().includes(q);
    el.style.display = match ? "" : "none";
    if (match) anyVisible = true;
  });
  panel.querySelectorAll(".mpi-popular-block, .mpi-dislike-block, .mpi-controversial-block, .mpi-cat-block").forEach(block => {
    const hasVisible = [...block.querySelectorAll(".mpi")].some(el => el.style.display !== "none");
    block.style.display = hasVisible ? "" : "none";
  });

  let empty = document.getElementById("menu-panel-search-empty");
  if (q && !anyVisible) {
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "menu-panel-search-empty";
      empty.className = "placeholder";
      empty.textContent = "No matching dishes.";
      panel.appendChild(empty);
    }
    empty.style.display = "block";
  } else if (empty) {
    empty.style.display = "none";
  }
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
    const oos         = !!item.outOfStock;
    const oosBadge     = oos ? `<span class="mpi-oos-badge">Out of Stock</span>` : "";
    return `<div class="mpi${oos ? " mpi-out-of-stock" : ""}" data-name="${escAttr(item.item)}" data-oos="${oos ? "1" : "0"}">
      <span class="mpi-left"><span class="mpi-name">${esc(item.item)}${orHint || sidesHint}${sauceHint}${!orHint && !sidesHint ? sizeHint || proteinHint : ""}</span>${desc}${oosBadge}</span>
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
  // Sits right next to Random Pick in the same flex row (wraps below it on
  // narrow screens) -- filters the panel in place, it doesn't jump/scroll
  // like the category shortcuts.
  const searchHtml = `<div class="menu-panel-search-wrap">
    <input type="text" id="menu-panel-search" class="menu-panel-search" placeholder="Search menu…" autocomplete="off" value="${escAttr(_menuPanelSearchQuery)}">
  </div>`;
  shortcuts.innerHTML = categoryBtnsHtml + randomBtnHtml + searchHtml;

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

  document.getElementById("menu-panel-search")?.addEventListener("input", e => {
    _menuPanelSearchQuery = e.target.value;
    filterMenuPanel(_menuPanelSearchQuery);
  });

  applyMenuTakenMarks();
  filterMenuPanel(_menuPanelSearchQuery);

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
    if (row.dataset.oos === "1") return;
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
    <div id="order-subtotal" class="order-subtotal"></div>
    <div id="active-prompts" class="active-prompts-container"></div>`;

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
      const oos         = !!m.outOfStock;
      const oosLbl      = oos ? `<span class="dd-oos">Out of Stock</span>` : "";
      return `<div class="menu-dropdown-item${taken ? " is-selected" : ""}${oos ? " is-oos" : ""}" data-name="${escAttr(m.item)}" data-oos="${oos ? "1" : "0"}">
        <span class="dd-name">${popularStar}${esc(m.item)}${proteinLbl}</span>
        <span class="dd-right">${oosLbl}${takenLbl}${price}</span>
      </div>`;
    }).join("");

    dropdown.style.display = "block";

    // .is-selected just marks "already in your order" (a visual checkmark
    // in the dropdown) -- it no longer disables the row, since ordering
    // the same item again (a 2nd/3rd of it) is allowed now. .is-oos DOES
    // block the click, since there's genuinely nothing to add.
    dropdown.querySelectorAll(".menu-dropdown-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        if (el.dataset.oos === "1") return;
        addItem(el.dataset.name);
        input.value = "";
        dropdown.style.display = "none";
      });
    });
  }

  function moveFocus(dir) {
    const items = [...dropdown.querySelectorAll(".menu-dropdown-item")];
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
  // Ordering the same item twice is allowed -- checkDuplicates() still
    // warns (e.g. someone else already has it), it just no longer blocks it.
    selectedItems.push(name);
    renderPills();
    checkDuplicates();
}

// Every item-configuration prompt (extras/combo/protein/orOptions/sidesPick/
// saucePick/size) is mounted as its own independent card inside
// #active-prompts instead of reusing a shared singleton element. That means
// starting a second item's prompt before finishing the first no longer
// leaves a stale, invisible listener bound to a shared "Add to Order"
// button (which used to silently add the abandoned first selection too) --
// each card just stacks up, visible, until it's added or closed with the
// ✕ on its own.
let _promptSeq = 0;
function mountPrompt(html) {
  const container = document.getElementById("active-prompts");
  if (!container) return null;
  const el = document.createElement("div");
  el.className = "order-prompt";
  el.innerHTML = `<button type="button" class="prompt-close-btn" aria-label="Cancel">✕</button>` + html;
  container.appendChild(el);
  return el;
}

// Builds the optional extras checklist HTML -- shared by showExtrasPrompt
// (an item with ONLY extras) and any required-picker prompt that ALSO has
// extras (orOptions/sidesPick/size), which render this section inline in
// the SAME card right under the required choices. That matches how the real
// ordering site shows every modifier group in one scrollable form instead
// of gating the optional toppings behind a separate "finish this step
// first" screen, which read as "the toppings are just missing" the one time
// someone stopped at the required step without continuing.
// Each extra is an independent checkbox (matches the real site's Toppings/
// Keto groups) -- any number can be picked at once, so "No Cilantro" and
// "No Onions" can both apply to the same taco. An extra with `max > 1`
// (e.g. Big Greek's "Extra Pita", orderable up to 3) renders as a +/-
// quantity stepper instead. An extra with `default: true` is pre-checked to
// match an ingredient the real site includes standard (e.g. a sandwich's
// Tomato/Onion) -- leaving it checked stays silent (it's just the default),
// unchecking it records "No {name}" so removing a default is still visible
// in the order line.
function extrasSectionHTML(meta, opts = {}) {
  const heading = opts.heading || `Add extra? <span style="font-size:0.72rem;opacity:0.7">(optional -- pick any number)</span>`;
  const divider = opts.divider ? "margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid var(--border);" : "";
  return `
    <div style="${divider}color:var(--text-muted);margin-bottom:0.5rem">${heading}</div>
    <div class="extras-options" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;max-height:220px;overflow-y:auto">
      ${meta.extras.map(e => {
        if (Number(e.max) > 1) {
          return `<div class="extras-option-qty" data-extra="${escAttr(e.name)}" data-price="${e.price}" data-max="${e.max}" data-qty="0" style="display:flex;align-items:center;gap:0.5rem;color:var(--text)">
            <button type="button" class="protein-btn qty-minus" style="padding:0.15rem 0.55rem" aria-label="Decrease">−</button>
            <span class="qty-value" style="min-width:1.4em;text-align:center;font-weight:700">0</span>
            <button type="button" class="protein-btn qty-plus" style="padding:0.15rem 0.55rem" aria-label="Increase">+</button>
            <span>${esc(e.name)} <span style="font-size:0.72rem;opacity:0.7">(up to ${e.max})</span>${Number(e.price) ? ` <span style="color:var(--gold)">+$${Number(e.price).toFixed(2)} ea</span>` : ""}</span>
          </div>`;
        }
        return `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
          <input type="checkbox" class="extras-option-checkbox" data-extra="${escAttr(e.name)}" data-price="${e.price}" data-default="${e.default ? "1" : "0"}" ${e.default ? "checked" : ""} style="accent-color:var(--gold);width:15px;height:15px">
          ${esc(e.name)}${Number(e.price) ? ` <span style="color:var(--gold)">+$${Number(e.price).toFixed(2)}</span>` : ""}
        </label>`;
      }).join("")}
    </div>`;
}

// Wires the +/- steppers within `el` and returns a function that reads back
// the chosen list at commit time: a checked non-default extra by name, a
// stepper with qty > 0 as "{name} xN" (or bare name if qty is 1), and "No
// {name}" for any DEFAULT extra the user unchecked.
function wireExtras(el) {
  const boxes    = [...el.querySelectorAll(".extras-option-checkbox")];
  const steppers = [...el.querySelectorAll(".extras-option-qty")];
  steppers.forEach(row => {
    const max     = Number(row.dataset.max) || 1;
    const valueEl = row.querySelector(".qty-value");
    row.querySelector(".qty-minus").addEventListener("click", () => {
      row.dataset.qty = Math.max(0, Number(row.dataset.qty) - 1);
      valueEl.textContent = row.dataset.qty;
    });
    row.querySelector(".qty-plus").addEventListener("click", () => {
      row.dataset.qty = Math.min(max, Number(row.dataset.qty) + 1);
      valueEl.textContent = row.dataset.qty;
    });
  });
  return function collectExtras() {
    const chosen = [];
    boxes.forEach(b => {
      if (b.dataset.default === "1") {
        if (!b.checked) chosen.push(`No ${b.dataset.extra}`);
      } else if (b.checked) {
        chosen.push(b.dataset.extra);
      }
    });
    steppers.forEach(row => {
      const qty = Number(row.dataset.qty);
      if (qty > 0) chosen.push(qty > 1 ? `${row.dataset.extra} x${qty}` : row.dataset.extra);
    });
    return chosen;
  };
}

// Combines a required-picker's chosen name(s) with whatever collectExtras()
// picked up into the final order-line name, parenthesized like sidesPick's
// multi-pick list -- smartSplit() only treats a comma as a new order item
// when it's outside parens, so this keeps "Taco + (No Cilantro, No Onions)"
// as one line, not two.
function withExtras(baseName, chosenExtras) {
  return chosenExtras.length ? `${baseName} + (${chosenExtras.join(", ")})` : baseName;
}

function showExtrasPrompt(baseName, meta) {
  const el = mountPrompt(
    extrasSectionHTML(meta, { heading: `Add extra to <strong>${esc(baseName)}</strong>? <span style="font-size:0.72rem;opacity:0.7">(optional -- pick any number)</span>` }) +
    `<div style="display:flex;gap:0.5rem">
      <button type="button" class="protein-btn protein-btn-add extras-skip-btn">Add to Order</button>
    </div>`);
  if (!el) return;

  const addBtn        = el.querySelector(".extras-skip-btn");
  const closeBtn      = el.querySelector(".prompt-close-btn");
  const collectExtras = wireExtras(el);

  addBtn.addEventListener("click", () => {
    const finalName = withExtras(baseName, collectExtras());
    // Ordering the same item twice is allowed -- checkDuplicates() still
    // warns (e.g. someone else already has it), it just no longer blocks it.
    selectedItems.push(finalName);
    renderPills();
    checkDuplicates();
    el.remove();
  });
  closeBtn.addEventListener("click", () => el.remove());
}

function showComboPrompt(baseName, meta) {
  const el = mountPrompt(`
    <div style="color:var(--text-muted);margin-bottom:0.5rem">Adding: <strong>${esc(baseName)}</strong></div>
    <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
      <input type="checkbox" class="combo-checkbox" style="accent-color:var(--gold);width:15px;height:15px" />
      Make it a combo &nbsp;<span style="color:var(--gold);font-weight:700">(+$${Number(meta.comboPrice).toFixed(2)})</span>
    </label>
    <div class="combo-side-wrap" style="display:none;margin-top:0.5rem;flex-direction:column;gap:0.4rem">
      <div style="font-size:0.75rem;color:var(--text-muted)">Side choice</div>
      <select class="combo-side-select" style="width:100%;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit">
        ${(meta.comboSides || []).map(s => `<option>${esc(s)}</option>`).join("")}
      </select>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Drink (included) — type your choice</div>
      <input type="text" class="combo-drink-input" placeholder="e.g. Coke, Sprite, water…" style="width:100%;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit;box-sizing:border-box" />
    </div>
    <div style="display:flex;gap:0.5rem;margin-top:0.6rem">
      <button type="button" class="protein-btn protein-btn-add combo-add-btn">Add to Order</button>
      <button type="button" class="protein-btn combo-skip-btn">Cancel</button>
    </div>`);
  if (!el) return;

  const checkbox   = el.querySelector(".combo-checkbox");
  const sideWrap   = el.querySelector(".combo-side-wrap");
  const sideSelect = el.querySelector(".combo-side-select");
  const drinkInput = el.querySelector(".combo-drink-input");
  const addBtn     = el.querySelector(".combo-add-btn");
  const skipBtn    = el.querySelector(".combo-skip-btn");
  const closeBtn   = el.querySelector(".prompt-close-btn");

  checkbox.addEventListener("change", () => {
    sideWrap.style.display = checkbox.checked ? "flex" : "none";
  });
  addBtn.addEventListener("click", () => {
    let finalName = baseName;
    if (checkbox.checked) {
      const drink = drinkInput.value.trim();
      finalName = drink
        ? `${baseName} + Combo (${sideSelect.value}, ${drink})`
        : `${baseName} + Combo (${sideSelect.value})`;
    }
    // Ordering the same item twice is allowed -- checkDuplicates() still
    // warns (e.g. someone else already has it), it just no longer blocks it.
    selectedItems.push(finalName);
    renderPills();
    checkDuplicates();
    el.remove();
  });
  skipBtn.addEventListener("click", () => el.remove());
  closeBtn.addEventListener("click", () => el.remove());
}

function showProteinPrompt(baseName) {
  const el = mountPrompt(`
    <span style="color:var(--text-muted)">Protein for <strong>${esc(baseName)}</strong>:</span>
    <div style="display:flex;gap:0.5rem;margin-top:0.4rem;align-items:center">
      <input type="text" class="protein-input" placeholder="e.g. Chicken, Beef, Al Pastor, Veggie…" style="flex:1;min-width:0;padding:0.4rem 0.6rem;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:0.85rem;font-family:inherit" />
      <button type="button" class="protein-btn protein-btn-add protein-add-btn">Add</button>
      <button type="button" class="protein-btn protein-skip-btn">Skip</button>
    </div>`);
  if (!el) return;

  const input    = el.querySelector(".protein-input");
  const addBtn   = el.querySelector(".protein-add-btn");
  const skipBtn  = el.querySelector(".protein-skip-btn");
  const closeBtn = el.querySelector(".prompt-close-btn");
  input.focus();

  function commit() {
    const protein = input.value.trim();
    const finalName = protein ? `${baseName} (${protein})` : baseName;
    // Ordering the same item twice is allowed -- checkDuplicates() still
    // warns (e.g. someone else already has it), it just no longer blocks it.
    selectedItems.push(finalName);
    renderPills();
    checkDuplicates();
    el.remove();
  }

  addBtn.addEventListener("click",  commit);
  skipBtn.addEventListener("click", () => { input.value = ""; commit(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
  closeBtn.addEventListener("click", () => el.remove());
}

function showOrOptionsPrompt(baseName, meta) {
  const hasExtras = meta.extras && meta.extras.length;
  const el = mountPrompt(`
    <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose one for <strong>${esc(baseName)}</strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
    <div class="or-options-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.6rem">
      ${meta.orOptions.map(opt =>
        `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
          <input type="checkbox" class="or-option-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
          ${esc(opt)}
        </label>`
      ).join("")}
    </div>` +
    (hasExtras ? extrasSectionHTML(meta, { divider: true }) : "") +
    `<div style="display:flex;gap:0.5rem">
      <button type="button" class="protein-btn protein-btn-add or-options-add-btn" disabled>Add to Order</button>
    </div>`);
  if (!el) return;

  const listEl   = el.querySelector(".or-options-list");
  const addBtn   = el.querySelector(".or-options-add-btn");
  const closeBtn = el.querySelector(".prompt-close-btn");
  const boxes    = [...listEl.querySelectorAll(".or-option-checkbox")];
  const collectExtras = hasExtras ? wireExtras(el) : () => [];

  listEl.addEventListener("change", e => {
    const box = e.target.closest(".or-option-checkbox");
    if (!box) return;
    if (box.checked) boxes.forEach(b => { if (b !== box) b.checked = false; });
    addBtn.disabled = !boxes.some(b => b.checked);
  });
  addBtn.addEventListener("click", () => {
    const chosen = boxes.find(b => b.checked);
    if (!chosen) return;
    const finalName = withExtras(`${baseName} (${chosen.dataset.option})`, collectExtras());
    selectedItems.push(finalName);
    renderPills();
    checkDuplicates();
    el.remove();
  });
  closeBtn.addEventListener("click", () => el.remove());
}

// For combo entrees that include "at least N regular sides" -- the picks are
// free (included in the base price), so the compact menu display just says
// "+ N sides" instead of listing every option inline.
function showSidesPickPrompt(baseName, meta) {
  const n = meta.sidesPick.count || 2;
  // A sidesPick->saucePick chain (Sardis/Pollo Cabana chicken orders) never
  // also has extras today, so extras only render inline here when there's
  // no saucePick to chain into afterward -- keeps this to two sections, not
  // three, in the one case that actually occurs.
  const hasExtras = !meta.saucePick && meta.extras && meta.extras.length;
  const el = mountPrompt(`
    <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose ${n} sides for <strong>${esc(baseName)}</strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
    <div class="sides-pick-list" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;max-height:220px;overflow-y:auto">
      ${meta.sidesPick.options.map(opt =>
        `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
          <input type="checkbox" class="sides-pick-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
          ${esc(opt)}
        </label>`
      ).join("")}
    </div>` +
    (hasExtras ? extrasSectionHTML(meta, { divider: true }) : "") +
    `<div style="display:flex;gap:0.5rem">
      <button type="button" class="protein-btn protein-btn-add sides-pick-add-btn" disabled>Add to Order</button>
    </div>`);
  if (!el) return;

  const listEl   = el.querySelector(".sides-pick-list");
  const addBtn   = el.querySelector(".sides-pick-add-btn");
  const closeBtn = el.querySelector(".prompt-close-btn");
  const boxes    = [...listEl.querySelectorAll(".sides-pick-checkbox")];
  const collectExtras = hasExtras ? wireExtras(el) : () => [];

  listEl.addEventListener("change", e => {
    const box = e.target.closest(".sides-pick-checkbox");
    if (!box) return;
    const checked = boxes.filter(b => b.checked);
    if (checked.length > n) box.checked = false;
    addBtn.disabled = boxes.filter(b => b.checked).length !== n;
  });
  addBtn.addEventListener("click", () => {
    const chosen = boxes.filter(b => b.checked).map(b => b.dataset.option);
    if (chosen.length !== n) return;
    const finalName = `${baseName} (${chosen.join(", ")})`;
    el.remove();
    if (meta.saucePick) {
      showSaucePickPrompt(finalName, meta);
      return;
    }
    const withExtrasName = withExtras(finalName, collectExtras());
    selectedItems.push(withExtrasName);
    renderPills();
    checkDuplicates();
  });
  closeBtn.addEventListener("click", () => el.remove());
}

// Sauce choices are included free with chicken orders but are tracked as
// their own order lines (rather than folded into the dish name) so the
// Worksheet's "Group Duplicates" view can tally them across everyone's
// orders, e.g. "6x Sauce: Aji Amarillo Aoli".
function showSaucePickPrompt(finalDishName, meta) {
  const n = meta.saucePick.count || 2;
  const el = mountPrompt(`
    <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose ${n} sauces for <strong>${esc(finalDishName)}</strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
    <div class="sauce-pick-list" style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:0.6rem;max-height:220px;overflow-y:auto">
      ${meta.saucePick.options.map(opt =>
        `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
          <input type="checkbox" class="sauce-pick-checkbox" data-option="${escAttr(opt)}" style="accent-color:var(--gold);width:15px;height:15px">
          ${esc(opt)}
        </label>`
      ).join("")}
    </div>
    <div style="display:flex;gap:0.5rem">
      <button type="button" class="protein-btn protein-btn-add sauce-pick-add-btn" disabled>Add to Order</button>
    </div>`);
  if (!el) {
    // Ordering the same item twice is allowed -- checkDuplicates() still
    // warns (e.g. someone else already has it), it just no longer blocks it.
    selectedItems.push(finalDishName);
    renderPills();
    checkDuplicates();
    return;
  }

  const listEl   = el.querySelector(".sauce-pick-list");
  const addBtn   = el.querySelector(".sauce-pick-add-btn");
  const closeBtn = el.querySelector(".prompt-close-btn");
  const boxes    = [...listEl.querySelectorAll(".sauce-pick-checkbox")];

  listEl.addEventListener("change", e => {
    const box = e.target.closest(".sauce-pick-checkbox");
    if (!box) return;
    const checked = boxes.filter(b => b.checked);
    if (checked.length > n) box.checked = false;
    addBtn.disabled = boxes.filter(b => b.checked).length !== n;
  });
  addBtn.addEventListener("click", () => {
    const chosen = boxes.filter(b => b.checked).map(b => b.dataset.option);
    if (chosen.length !== n) return;
    // Sauces are independent tally lines regardless of what happens to the
    // dish next, so push them now; the dish itself still needs to check for
    // a chained extras step before landing in the order. (No current item
    // combines sidesPick+saucePick with extras too, but handle it if one
    // ever does rather than silently dropping the extras group.)
    chosen.forEach(sauce => selectedItems.push(`Sauce: ${sauce}`));
    el.remove();
    if (meta.extras && meta.extras.length) {
      showExtrasPrompt(finalDishName, meta);
      return;
    }
    selectedItems.push(finalDishName);
    renderPills();
    checkDuplicates();
  });
  closeBtn.addEventListener("click", () => el.remove());
}

// For standalone Sides A La Carte items: one canonical item, priced
// automatically from the Regular/Large size chosen (no duplicate menu rows).
function showSizePrompt(baseName, meta) {
  const radioName  = `size-prompt-radio-${++_promptSeq}`;
  const hasExtras  = meta.extras && meta.extras.length;
  const el = mountPrompt(`
    <div style="color:var(--text-muted);margin-bottom:0.5rem">Choose an option for <strong>${esc(baseName)}</strong> <span style="font-size:0.72rem;color:var(--red)">(required)</span></div>
    <div class="size-prompt-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.6rem">
      ${Object.entries(meta.sizes).map(([size, price]) =>
        `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--text)">
          <input type="radio" name="${radioName}" class="size-prompt-radio" data-size="${escAttr(size)}" style="accent-color:var(--gold);width:15px;height:15px">
          ${esc(size)} <span style="color:var(--text-dim);font-size:0.8rem">$${Number(price).toFixed(2)}</span>
        </label>`
      ).join("")}
    </div>` +
    (hasExtras ? extrasSectionHTML(meta, { divider: true }) : "") +
    `<div style="display:flex;gap:0.5rem">
      <button type="button" class="protein-btn protein-btn-add size-prompt-add-btn" disabled>Add to Order</button>
    </div>`);
  if (!el) return;

  const listEl   = el.querySelector(".size-prompt-list");
  const addBtn   = el.querySelector(".size-prompt-add-btn");
  const closeBtn = el.querySelector(".prompt-close-btn");
  const boxes    = [...listEl.querySelectorAll(".size-prompt-radio")];
  const collectExtras = hasExtras ? wireExtras(el) : () => [];

  listEl.addEventListener("change", () => {
    addBtn.disabled = !boxes.some(b => b.checked);
  });
  addBtn.addEventListener("click", () => {
    const chosen = boxes.find(b => b.checked);
    if (!chosen) return;
    const finalName = withExtras(`${baseName} (${chosen.dataset.size})`, collectExtras());
    selectedItems.push(finalName);
    renderPills();
    checkDuplicates();
    el.remove();
  });
  closeBtn.addEventListener("click", () => el.remove());
}

function renderPills() {
  const container = document.getElementById("selected-pills");
  if (!container) return;

  // Ordering the same item more than once collapses into a single pill
  // with a ×N count rather than showing N identical pills side by side --
  // removing it takes off one copy at a time (the last one removes the
  // pill entirely), same as clicking it again in the panel adds another.
  const counts = new Map();
  selectedItems.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));

  container.innerHTML = [...counts.entries()].map(([item, count]) => {
    const taken = (takenItems[item.toLowerCase()] || []).length > 0;
    const qtyLabel = count > 1 ? `<span class="pill-qty">&times;${count}</span>` : "";
    // Only known menu items resolve to a price -- a free-text leftover or a
    // "Sauce: X" tally line (no catalog entry of its own) shows no price
    // badge rather than a misleading $0.00.
    const meta = findMenuItem(item.replace(/\s*\(.*\)\s*$/, "").trim()) || findMenuItem(item);
    const priceLabel = meta ? `<span class="pill-price">$${(priceForOrderLine(item) * count).toFixed(2)}</span>` : "";
    return `<span class="selected-pill${taken ? " is-taken" : ""}">
      ${esc(item)}${qtyLabel}${priceLabel}
      <button type="button" class="pill-remove" data-item="${escAttr(item)}">&times;</button>
    </span>`;
  }).join("");

  container.querySelectorAll(".pill-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = selectedItems.indexOf(btn.dataset.item);
      if (idx !== -1) selectedItems.splice(idx, 1);
      renderPills();
      checkDuplicates();
    });
  });

  // Running subtotal for what's been added so far -- visible immediately as
  // items go in, well before Submit Order.
  const subtotalEl = document.getElementById("order-subtotal");
  if (subtotalEl) {
    const total = selectedItems.reduce((sum, item) => sum + priceForOrderLine(item), 0);
    subtotalEl.textContent = selectedItems.length ? `Subtotal: $${total.toFixed(2)}` : "";
  }
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
  // Dedupe by item name -- now that the same item can appear more than
  // once in selectedItems (ordering 2+ of it), this would otherwise print
  // the same "already ordered by X" line twice for one item.
  const dups = [...new Set(selectedItems)]
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

  if (!isOverrideActive() && debugNow() > getOrderDeadline().getTime()) {
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
const _ratingTouched = new Set(); // item keys the user has actually picked a rating for
// The chosen 1-10 value per touched key, so an in-progress (not yet
// submitted) selection survives loadData()'s 30s auto-refresh -- that
// refresh calls renderRatingCard(), which rebuilds the rating buttons'
// HTML from scratch, and without this the fresh buttons would render
// un-selected even though _ratingTouched still (correctly) remembers which
// items were picked. This is what "resets my ratings before I submit" was.
const _ratingValues = new Map();

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

// The order-by deadline (late warnings, worksheet "(late)" tags, the
// countdown flipping to "ORDERS CLOSED") only applies to the normal Friday
// rotation flow. An override restarts the ordering session fresh for a
// different restaurant, with no Friday cutoff at all (see
// getWorksheetCloseCutoff) -- so none of the "late" UI should fire either
// while one's active for this date.
function isOverrideActive() {
  return !!getOverrideInfo(currentFriday);
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

// History's Date column (r[1]) now holds the actual day Order Complete was
// clicked, not always the nominal Friday (see the Order Complete handler),
// so it can no longer be string-matched against a given Friday the way
// Overrides' Date column still can. Instead, a History row "belongs" to a
// given week if its Timestamp (r[0], not the Date column) falls inside
// that week's actual ordering window -- the Saturday before that Friday
// through the following Monday 6am ET close (same window loadOrders()
// already uses), regardless of what day it happened to get logged under.
function latestHistoryTimestampForWeek(friday) {
  const windowStart = new Date(friday + "T00:00:00");
  windowStart.setDate(windowStart.getDate() - 6);
  const windowEnd = friday === currentFriday ? getWorksheetCloseCutoff() : new Date(friday + "T23:59:59");
  return _historyRows
    .map(r => new Date(r[0]).getTime())
    .filter(t => !isNaN(t) && t >= windowStart.getTime() && t <= windowEnd.getTime())
    .reduce((a, b) => Math.max(a, b), 0);
}

function getRoundCutoff(date) {
  return Math.max(latestHistoryTimestampForWeek(date), latestTimestampFor(_overrideRows, date));
}

// The week counts as complete only if the most recent completion (History
// log) is NEWER than the most recent restaurant override for the date. An
// override starts a brand-new ordering session, cancelling any earlier
// completion for everyone -- persistently, across reloads and devices --
// until a fresh Order Complete is logged for the new round.
function computeWeekComplete() {
  const histTs = latestHistoryTimestampForWeek(currentFriday);
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

// Same idea as computeItemStats, but across EVERY restaurant in the
// rotation at once (for the Food Chart) -- keyed by restaurant+item since
// two different restaurants could otherwise share an item name and get
// wrongly merged into one row.
function computeAllItemStats() {
  const stats = new Map(); // key: "restaurant|item" lowercase -> { restaurant, label, qty, weeksOrdered, ratingSum, ratingCount }

  function entryFor(restaurant, label) {
    const key = `${restaurant}|${label}`.toLowerCase();
    if (!stats.has(key)) stats.set(key, { restaurant, label, qty: 0, weeksOrdered: new Set(), ratingSum: 0, ratingCount: 0 });
    return stats.get(key);
  }

  _historyRows.forEach(r => {
    const restaurant = (r[2] || "").trim();
    const item = (r[3] || "").trim();
    if (!restaurant || !item) return;
    const e = entryFor(restaurant, item);
    e.qty += Number(r[4]) || 0;
    const week = (r[1] || "").trim();
    if (week) e.weeksOrdered.add(week);
  });

  _allRatingRows.forEach(r => {
    const restaurant = (r[2] || "").trim();
    const item = (r[3] || "").trim();
    const rating = Number(r[r.length - 1]);
    if (!restaurant || !item || isNaN(rating)) return;
    const e = entryFor(restaurant, item);
    e.ratingSum += rating;
    e.ratingCount += 1;
  });

  return stats;
}

// ── Reports and Stats: cross-restaurant stats shown under Rate Your Order ──
// A grid of small independent widgets (mini chart or a bare number) rather
// than one big chart -- each is its own question ("what do people like",
// "who orders the most", "when do orders come in"), so each gets its own
// tile and its own click-through to a bigger detail view instead of
// cramming everything into a single chart no one metric owns.

function computeOverallSatisfaction() {
  const ratings = _allRatingRows.map(r => Number(r[r.length - 1])).filter(n => !isNaN(n));
  if (!ratings.length) return null;
  return { avg: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length };
}

// Global equivalent of refreshMenuInsights' per-restaurant Favs/Dislikes:
// a Fav needs the item ordered in 2+ separate weeks (not just qty), a Hate
// is anything averaging under 3/10 -- same thresholds, just rolled up
// across every restaurant instead of whichever one is on screen.
function computeGlobalFavsAndHates() {
  const stats = computeAllItemStats();
  const favs = [], hates = [];
  stats.forEach(s => {
    const avg = s.ratingCount > 0 ? s.ratingSum / s.ratingCount : null;
    if (s.weeksOrdered.size >= 2) favs.push({ label: s.label, restaurant: s.restaurant, avg });
    if (avg !== null && avg < 3) hates.push({ label: s.label, restaurant: s.restaurant, avg });
  });
  favs.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  hates.sort((a, b) => a.avg - b.avg);
  return { favs, hates };
}

// Plain table, not a pie -- with a rotation of maybe half a dozen
// restaurants, "share of orders" as wedges is harder to read at a glance
// than just a ranked qty+rating list, and there's no page limit to fit
// (unlike the Food Chart's much longer dish list).
function computeRestaurantStats() {
  const stats = computeAllItemStats();
  const totals = new Map(); // restaurant -> qty
  _historyRows.forEach(r => {
    const restaurant = (r[2] || "").trim();
    if (!restaurant) return;
    totals.set(restaurant, (totals.get(restaurant) || 0) + (Number(r[4]) || 0));
  });
  return [...totals.entries()].map(([restaurant, qty]) => {
    let ratingSum = 0, ratingCount = 0;
    stats.forEach(s => { if (s.restaurant === restaurant) { ratingSum += s.ratingSum; ratingCount += s.ratingCount; } });
    return { restaurant, qty, avg: ratingCount ? ratingSum / ratingCount : null };
  }).sort((a, b) => b.qty - a.qty);
}

function computeAverageSpendPerPerson() {
  const entries = new Map(); // "person|date" -> subtotal
  const byRestaurant = new Map(); // restaurant -> [subtotal, ...]
  _historyRows.forEach(r => {
    const restaurant = (r[2] || "").trim();
    const item = (r[3] || "").trim();
    const date = (r[1] || "").trim();
    const qty = Number(r[4]) || 0;
    if (!restaurant || !item || !date) return;
    const menu = findRestaurantByName(restaurant)?.menu || allMenuItems;
    const price = resolveItemPrice(item, menu);
    const people = (r[5] || "").split(",").map(n => n.trim()).filter(Boolean);
    // Post-fix History rows are already one-row-per-person (qty is that
    // person's own count); legacy pre-fix rows can still list several
    // names on one combined row, in which case each named person is
    // counted for one unit of the item rather than trying to re-split qty.
    const names = people.length ? people : [""];
    names.forEach(person => {
      const key = `${person.toLowerCase()}|${restaurant}|${date}`;
      entries.set(key, (entries.get(key) || 0) + price * (people.length ? 1 : qty));
    });
  });
  entries.forEach((subtotal, key) => {
    if (subtotal <= 0) return;
    const restaurant = key.split("|")[1];
    if (!byRestaurant.has(restaurant)) byRestaurant.set(restaurant, []);
    byRestaurant.get(restaurant).push(subtotal);
  });
  const values = [...entries.values()].filter(v => v > 0);
  if (!values.length) return null;
  const byRestaurantAvg = [...byRestaurant.entries()]
    .map(([restaurant, vals]) => ({ restaurant, avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length }))
    .sort((a, b) => b.avg - a.avg);
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, count: values.length, byRestaurant: byRestaurantAvg };
}

// Top 5 items, same ranking the Food Chart defaults to now (qty first,
// ties broken by rating) -- a condensed preview so the widget doesn't need
// to be the full sortable/paginated table to be useful at a glance.
const FOOD_CHART_PREVIEW_ROWS = 5;
function computeFoodChartPreview() {
  const stats = computeAllItemStats();
  return [...stats.values()]
    .filter(s => s.ratingCount > 0)
    .map(s => ({ label: s.label, qty: s.qty, avg: s.ratingSum / s.ratingCount }))
    .sort((a, b) => (b.qty - a.qty) || (b.avg - a.avg))
    .slice(0, FOOD_CHART_PREVIEW_ROWS);
}

function renderFoodChartPreview(rows) {
  const el = document.getElementById("order-reports-foodchart-mini");
  const empty = document.getElementById("order-reports-foodchart-empty");
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";
  el.innerHTML = rows.map(r => `
    <div class="order-reports-foodchart-row">
      <span class="order-reports-foodchart-item">${esc(r.label)}</span>
      <span class="order-reports-foodchart-rating">${r.qty}&times; &middot; ${r.avg.toFixed(1)}/10</span>
    </div>`).join("");
}

function renderOrderReportsCard() {
  const card = document.getElementById("order-reports-card");
  if (!card) return;

  const sat   = computeOverallSatisfaction();
  const spend = computeAverageSpendPerPerson();
  const restStats = computeRestaurantStats();
  const totalQty = [...computeAllItemStats().values()].reduce((sum, s) => sum + s.qty, 0);

  if (!sat && !spend && !totalQty) { card.style.display = "none"; return; }
  card.style.display = "block";

  setStatTile("satisfaction", sat ? `${sat.avg.toFixed(1)}/10` : "—", sat ? `${sat.count} rating${sat.count === 1 ? "" : "s"}` : "No ratings yet");
  setStatTile("spend", spend ? `$${spend.avg.toFixed(2)}` : "—", spend ? `avg across ${spend.count} order${spend.count === 1 ? "" : "s"}` : "No price data yet");
  setStatTile("orders", totalQty, "dishes logged all-time");

  renderFoodChartPreview(computeFoodChartPreview());
  renderFavsAndHates(computeGlobalFavsAndHates());
  renderRestaurantStatsPreview(restStats);
}

function setStatTile(key, value, sub) {
  const valueEl = document.getElementById(`order-reports-${key}`);
  const subEl   = document.getElementById(`order-reports-${key}-sub`);
  if (valueEl) valueEl.textContent = value;
  if (subEl) subEl.textContent = sub;
}

const RESTAURANT_STATS_PREVIEW_ROWS = 5;
function renderRestaurantStatsPreview(stats) {
  const el = document.getElementById("order-reports-restaurants-mini");
  const empty = document.getElementById("order-reports-restaurants-empty");
  if (!el) return;
  if (!stats.length) {
    el.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";
  el.innerHTML = stats.slice(0, RESTAURANT_STATS_PREVIEW_ROWS).map(s => `
    <div class="order-reports-foodchart-row">
      <span class="order-reports-foodchart-item">${esc(s.restaurant)}</span>
      <span class="order-reports-foodchart-rating">${s.qty}&times;${s.avg != null ? ` &middot; ${s.avg.toFixed(1)}/10` : ""}</span>
    </div>`).join("");
}

// Just two big counts, not a list of item names -- a tile is meant to be
// read in a glance, and "how many" reads faster than a wall of dish names
// crammed into a small box. The full lists (with restaurant + rating) are
// one click away in the detail modal.
function renderFavsAndHates(data) {
  const favsCountEl  = document.getElementById("order-reports-favs-count");
  const hatesCountEl = document.getElementById("order-reports-hates-count");
  if (favsCountEl) favsCountEl.textContent = data.favs.length;
  if (hatesCountEl) hatesCountEl.textContent = data.hates.length;
}

let _lastFavsAndHates = null;

// One shared detail modal, filled in per-widget -- the tile grid stays
// small/scannable, and "click for detail" is the same gesture everywhere
// instead of a different modal shape per widget.
function openOrderReportsDetail(kind) {
  const modal = document.getElementById("order-reports-detail-modal");
  const title = document.getElementById("order-reports-detail-title");
  const body  = document.getElementById("order-reports-detail-body");
  if (!modal || !body) return;

  if (kind === "favshates") {
    const data = _lastFavsAndHates = computeGlobalFavsAndHates();
    title.textContent = "GBF Favs & Hates";
    body.innerHTML = renderFavsAndHatesDetailHtml(data);
  } else if (kind === "restaurants") {
    title.textContent = "Restaurant Stats";
    body.innerHTML = renderRestaurantStatsDetailHtml(computeRestaurantStats());
  } else if (kind === "satisfaction") {
    const sat = computeOverallSatisfaction();
    const trend = computeGlobalRatingTrend();
    title.textContent = "Overall Satisfaction — Rating Over Time";
    body.innerHTML = renderSatisfactionTrendHtml(sat);
    // renderTrendChart looks its target elements up by id, so it has to run
    // after the innerHTML above actually lands in the DOM.
    renderTrendChart(trend, {
      svg: "satisfaction-trend-chart", empty: "satisfaction-trend-empty",
      wrap: "satisfaction-trend-chart-wrap", tooltip: "satisfaction-trend-tooltip",
    });
  } else if (kind === "spend") {
    const spend = computeAverageSpendPerPerson();
    title.textContent = "Average $ / Person";
    body.innerHTML = renderSpendDetailHtml(spend);
  }

  modal.classList.add("open");
  bindOrderReportsDetailEvents(kind);
}
function closeOrderReportsDetail(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("order-reports-detail-modal")?.classList.remove("open");
}

function renderRestaurantStatsDetailHtml(stats) {
  if (!stats.length) return `<div class="placeholder">No order history logged yet.</div>`;
  const rows = stats.map((s, i) => `
    <tr class="order-reports-restaurant-detail-row" data-i="${i}">
      <td>${esc(s.restaurant)}</td>
      <td>${s.qty}</td>
      <td>${s.avg != null ? `${s.avg.toFixed(1)}/10` : "—"}</td>
    </tr>`).join("");
  return `<table class="report-table">
    <thead><tr><th>Restaurant</th><th>Orders</th><th>Avg Rating</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// Same chart markup shape openMenuReport's Restaurant Performance Trend
// uses -- one point per order date, but averaged across every restaurant
// instead of one, so renderTrendChart (the shared line-chart renderer) can
// draw it unchanged, it just needs its own set of element ids to target.
function renderSatisfactionTrendHtml(sat) {
  const summary = sat ? `<div class="order-reports-detail-summary">Average: <strong>${sat.avg.toFixed(1)}/10</strong> across ${sat.count} rating${sat.count === 1 ? "" : "s"}</div>` : `<div class="placeholder">No ratings logged yet.</div>`;
  return `${summary}
    <div class="item-detail-chart-wrap" id="satisfaction-trend-chart-wrap">
      <svg id="satisfaction-trend-chart" class="item-detail-chart"></svg>
      <div class="item-detail-tooltip" id="satisfaction-trend-tooltip"></div>
    </div>
    <div id="satisfaction-trend-empty" class="placeholder" style="display:none">No ratings logged yet.</div>`;
}

function renderSpendDetailHtml(spend) {
  if (!spend) return `<div class="placeholder">No price data logged yet.</div>`;
  const max = Math.max(...spend.byRestaurant.map(r => r.avg), 0.01);
  const rows = spend.byRestaurant.map(r => `
    <div class="order-reports-bar-row">
      <span class="order-reports-bar-label">${esc(r.restaurant)}</span>
      <div class="order-reports-bar-track"><div class="order-reports-bar-fill" style="width:${Math.round((r.avg / max) * 100)}%"></div></div>
      <span class="order-reports-bar-value">$${r.avg.toFixed(2)}</span>
    </div>`).join("");
  return `<div class="order-reports-detail-summary">Average: <strong>$${spend.avg.toFixed(2)}</strong> per person, per order, across ${spend.count} orders</div>
    <div class="order-reports-bar-list">${rows}</div>`;
}

function renderFavsAndHatesDetailHtml(data) {
  if (!data.favs.length && !data.hates.length) return `<div class="placeholder">No order history logged yet.</div>`;
  function rows(list, cls) {
    if (!list.length) return `<div class="placeholder">None yet.</div>`;
    return list.map((s, i) => `
      <div class="order-reports-favshates-row ${cls}" data-kind="${cls}" data-i="${i}">
        <span class="order-reports-favshates-label">${esc(s.label)}</span>
        <span class="order-reports-favshates-restaurant">${esc(s.restaurant)}</span>
        <span class="order-reports-favshates-rating">${s.avg != null ? `${s.avg.toFixed(1)}/10` : "—"}</span>
      </div>`).join("");
  }
  return `<div class="order-reports-favshates-cols">
    <div class="order-reports-favshates-col">
      <div class="item-detail-stats-label">&#9733; Favs (ordered 2+ separate weeks)</div>
      ${rows(data.favs, "fav")}
    </div>
    <div class="order-reports-favshates-col">
      <div class="item-detail-stats-label">Hates (avg rating under 3)</div>
      ${rows(data.hates, "hate")}
    </div>
  </div>`;
}

function bindOrderReportsDetailEvents(kind) {
  if (kind === "favshates") {
    document.getElementById("order-reports-detail-body")?.querySelectorAll(".order-reports-favshates-row").forEach(row => {
      const list = row.dataset.kind === "fav" ? _lastFavsAndHates.favs : _lastFavsAndHates.hates;
      const s = list[Number(row.dataset.i)];
      if (!s) return;
      row.addEventListener("click", () => {
        closeOrderReportsDetail();
        openItemDetail(s.restaurant, s.label);
      });
    });
    return;
  }
  if (kind === "restaurants") {
    document.getElementById("order-reports-detail-body")?.querySelectorAll(".order-reports-restaurant-detail-row").forEach(row => {
      row.addEventListener("click", () => {
        closeOrderReportsDetail();
        openMenuReport(row.querySelector("td").textContent);
      });
    });
  }
}

// ── Food Chart: top/bottom-rated items across the whole rotation ───────
// "Orders" is deliberately the loudest number on the row (see CSS) --
// more orders means more popular, which matters just as much as the
// rating itself for a quick read of what's actually worth getting.
const FOOD_CHART_PAGE_SIZE = 10;
let _foodChartSortCol = "orders"; // "rating" or "orders" -- which column is driving the sort
let _foodChartSortDir = "desc";   // "desc" = highest first (the default for either column); "asc" flips to lowest first
let _foodChartPage = 1;

function openFoodChart() {
  _foodChartSortCol = "orders";
  _foodChartSortDir = "desc";
  _foodChartPage = 1;
  renderFoodChart();
  document.getElementById("food-chart-modal")?.classList.add("open");
}
function closeFoodChart(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("food-chart-modal")?.classList.remove("open");
}
// Shared by both sortable headers -- clicking the column already driving
// the sort just flips direction; clicking the OTHER column switches to it
// (starting high-to-low, same convention either column starts with).
function foodChartSortBy(col) {
  if (_foodChartSortCol === col) {
    _foodChartSortDir = _foodChartSortDir === "desc" ? "asc" : "desc";
  } else {
    _foodChartSortCol = col;
    _foodChartSortDir = "desc";
  }
  _foodChartPage = 1;
  renderFoodChart();
}
function foodChartGoToPage(p) {
  _foodChartPage = p;
  renderFoodChart();
}
function renderFoodChart() {
  const stats = computeAllItemStats();
  const rows = [...stats.values()]
    .filter(s => s.ratingCount > 0)
    .map(s => ({ ...s, avg: s.ratingSum / s.ratingCount }));
  // Whichever column is driving the sort wins ties by the OTHER column
  // (qty then rating, or rating then qty) rather than falling back to
  // insertion order -- two dishes ordered the same number of times still
  // land in a sensible order relative to each other.
  const sortKey  = _foodChartSortCol === "orders" ? "qty" : "avg";
  const tieKey   = _foodChartSortCol === "orders" ? "avg" : "qty";
  const dir = _foodChartSortDir === "desc" ? -1 : 1;
  rows.sort((a, b) => dir * (a[sortKey] - b[sortKey]) || (b[tieKey] - a[tieKey]));

  const arrow = _foodChartSortDir === "desc" ? "&#9660;" : "&#9650;";
  const ratingThEl = document.getElementById("food-chart-rating-th");
  const ordersThEl = document.getElementById("food-chart-orders-th");
  if (ratingThEl) ratingThEl.innerHTML = `Rating ${_foodChartSortCol === "rating" ? arrow : ""}`;
  if (ordersThEl) ordersThEl.innerHTML = `QTY ${_foodChartSortCol === "orders" ? arrow : ""}`;

  const totalPages = Math.max(1, Math.ceil(rows.length / FOOD_CHART_PAGE_SIZE));
  _foodChartPage = Math.min(Math.max(1, _foodChartPage), totalPages);
  const start = (_foodChartPage - 1) * FOOD_CHART_PAGE_SIZE;
  const pageRows = rows.slice(start, start + FOOD_CHART_PAGE_SIZE);

  const tbody = document.getElementById("food-chart-tbody");
  const emptyEl = document.getElementById("food-chart-empty");
  if (!rows.length) {
    tbody.innerHTML = "";
    if (emptyEl) emptyEl.style.display = "block";
  } else {
    if (emptyEl) emptyEl.style.display = "none";
    tbody.innerHTML = pageRows.map(s => `<tr class="report-item-row" data-restaurant="${escAttr(s.restaurant)}" data-item="${escAttr(s.label)}">
      <td>
        <div class="food-chart-item-name">${esc(s.label)}</div>
        <div class="food-chart-restaurant">${esc(s.restaurant)}</div>
      </td>
      <td class="food-chart-orders">${s.qty}</td>
      <td>${s.avg.toFixed(1)}/10</td>
    </tr>`).join("");
    tbody.querySelectorAll(".report-item-row").forEach(tr => {
      tr.addEventListener("click", () => {
        // Both modals share the same overlay z-index/class -- leaving Food
        // Chart open underneath would just paint over Item Stats (later in
        // the DOM wins the stacking tie), so close it first.
        closeFoodChart();
        // Item Stats' price lookup needs the RIGHT restaurant's menu, not
        // whatever _reportMenu happened to be set to last (Food Chart
        // spans every restaurant, unlike the per-restaurant report modal).
        _reportMenu = findRestaurantByName(tr.dataset.restaurant)?.menu || allMenuItems;
        openItemDetail(tr.dataset.restaurant, tr.dataset.item, true);
      });
    });
  }

  const pagEl = document.getElementById("food-chart-pagination");
  if (!pagEl) return;
  if (totalPages <= 1) {
    pagEl.innerHTML = "";
    return;
  }
  let btns = "";
  for (let p = 1; p <= totalPages; p++) {
    btns += `<button type="button" class="food-chart-page-btn${p === _foodChartPage ? " active" : ""}" onclick="foodChartGoToPage(${p})">${p}</button>`;
  }
  pagEl.innerHTML = btns;
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

// Same idea, but averaged across EVERY item ordered that date, not just
// one -- "how did the whole group's order do" for a given restaurant, one
// point per date. Only rated items count toward the average; anything
// nobody bothered to rate just isn't in _allRatingRows at all, so it's
// already excluded rather than needing to be filtered out separately.
function computeRestaurantRatingTrend(restaurant) {
  const name = (restaurant || "").trim().toLowerCase();
  const byDate = new Map(); // date -> { sum, count }
  _allRatingRows.forEach(r => {
    if ((r[2] || "").trim().toLowerCase() !== name) return;
    const date = (r[1] || "").trim();
    const rating = Number(r[r.length - 1]);
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

// Same idea as computeRestaurantRatingTrend, but across every restaurant
// at once -- "how did satisfaction trend over time" for the Reports and
// Stats Overall Satisfaction widget, one point per order date.
function computeGlobalRatingTrend() {
  const byDate = new Map(); // date -> { sum, count }
  _allRatingRows.forEach(r => {
    const date = (r[1] || "").trim();
    const rating = Number(r[r.length - 1]);
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
// History row's Rated column (index 6) stores WHO has rated this row so
// far -- a comma-joined list of names, not a single 1/0 -- because a row
// can represent MULTIPLE co-orderers of the same shared/combined item
// (see the Names column), and each of them needs to be tracked
// independently. Without this, the first person to rate a shared item
// silently marked it "done" for every other co-orderer listed on that
// same row, and they'd never get prompted. Legacy rows written before
// this change just have a bare "1"/"true" with no record of WHO
// specifically rated it -- treated as fully rated for everyone, so old
// data doesn't suddenly resurface as newly-pending.
function isHistoryRowRated(r, name) {
  const raw = (r[6] ?? "").toString().trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === "1" || lower === "true") return true;
  return raw.split(",").map(n => n.trim().toLowerCase()).includes(name.trim().toLowerCase());
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
    if (isHistoryRowRated(r, name) || isRated(date, restaurant, item, name)) return;
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
  // Order Reports shares this function's refresh points (same underlying
  // _historyRows/_allRatingRows data) but isn't gated on "does anyone have
  // a pending rating" the way the rest of this function is below, so it's
  // refreshed unconditionally up front rather than duplicating every call
  // site that currently calls renderRatingCard().
  renderOrderReportsCard();

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
      _ratingValues.clear();
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
      // A 1-10 row of tap targets instead of a <input type="range"> --
      // dragging a thin slider precisely with a finger is exactly what
      // people meant by "sticky"/hard to hit on mobile; tapping a number is
      // a single unambiguous touch. The hidden input keeps .value/.dataset
      // so submitRatings() below didn't need to change at all.
      // Restores any not-yet-submitted pick from _ratingValues -- this
      // block gets rebuilt from scratch on every loadData() auto-refresh,
      // so without replaying the saved value here, an in-progress rating
      // would silently un-select itself out from under the user.
      const savedValue = _ratingValues.get(key);
      const scaleBtns = Array.from({ length: 10 }, (_, i) => i + 1)
        .map(n => `<button type="button" class="rating-item-btn${String(n) === savedValue ? " active" : ""}" data-value="${n}">${n}</button>`)
        .join("");
      return `<div class="rating-item-row" data-date="${escAttr(date)}" data-restaurant="${escAttr(restaurant)}" data-item="${escAttr(item)}">
        <span class="rating-item-name">${esc(item)}</span>
        <div class="rating-item-input-wrap">
          <input type="hidden" class="rating-item-slider" data-key="${escAttr(key)}" value="${escAttr(savedValue || "")}">
          <div class="rating-item-scale">${scaleBtns}</div>
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

  tableEl.querySelectorAll(".rating-item-input-wrap").forEach(wrap => {
    const hidden = wrap.querySelector(".rating-item-slider");
    const buttons = [...wrap.querySelectorAll(".rating-item-btn")];
    buttons.forEach(b => {
      b.addEventListener("click", () => {
        hidden.value = b.dataset.value;
        _ratingTouched.add(hidden.dataset.key);
        _ratingValues.set(hidden.dataset.key, b.dataset.value);
        buttons.forEach(x => x.classList.toggle("active", x === b));
      });
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
        if (histRow) {
          // Mirrors apps-script.gs's markHistoryRowRated -- Rated is a
          // comma-joined list of who's rated this row, not a single flag,
          // so a shared row (multiple co-orderers) tracks each person.
          const raw = String(histRow[6] || "").trim();
          const already = raw && raw !== "1" ? raw.split(",").map(n => n.trim()) : [];
          if (!already.some(n => n.toLowerCase() === lname)) already.push(name.trim());
          histRow[6] = already.join(", ");
          histRow[7] = now;
        }
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
    _ratingValues.clear();
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

// Finds the outermost parenthesized group that closes at the very end of
// `text`, depth-aware so a chosen option's own parens (e.g. sidesPick's
// "Lengua (Beef Tongue) (+$1.50)") don't get mistaken for the group boundary.
// Returns null if the text doesn't end in ")".
function extractTrailingGroup(text) {
  if (!text.endsWith(")")) return null;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    else if (text[i] === "(") {
      depth--;
      if (depth === 0) {
        return { name: text.slice(0, i).trim(), inner: text.slice(i + 1, text.length - 1) };
      }
    }
  }
  return null;
}

// Splits on top-level commas only (ignores commas nested inside parens) --
// shared by smartSplit (order items) and resolveItemPrice (chosen options
// within one item's sidesPick/orOptions group).
function splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter(Boolean);
}

// orOptions/sidesPick have no native per-choice pricing, so a choice that
// costs more/less than the item's base price gets its delta baked directly
// into the option's own label (e.g. "Lengua (Beef Tongue) (+$1.50)",
// "Solo Queso (Cheese Only) (-$5.50)"). Reads that trailing "(+$N.NN)" /
// "(-$N.NN)" back out; returns 0 if the label doesn't end in one.
function bakedDelta(optionText) {
  const m = optionText.match(/\(([+-])\$(\d+(?:\.\d+)?)\)\s*$/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * Number(m[2]);
}

// Resolves the price for one order-line item. meta.sizes is a generic
// {optionName: price} map -- Regular/Large for Sides A La Carte, but also
// Chicken/Steak, Fish/+Seafood, etc. for entrees priced by protein choice
// ("Pollo o Lomo Saltado (Steak)" -> meta.sizes.Steak). Falls through to the
// flat base price plus any baked-in deltas from a chosen orOptions/sidesPick
// option (or 0 for non-price-affecting suffixes, like a free protein name).
function resolveItemPrice(itemText, menu) {
  const m = itemText.match(/^(.*)\s\((.+)\)$/);
  if (m) {
    const meta = findMenuItem(m[1].trim(), menu);
    if (meta?.sizes && Object.prototype.hasOwnProperty.call(meta.sizes, m[2])) {
      return Number(meta.sizes[m[2]]) || 0;
    }
  }
  const group = extractTrailingGroup(itemText);
  const baseName = group ? group.name : itemText;
  const meta = findMenuItem(baseName, menu) || findMenuItem(itemText, menu);
  let price = Number(meta?.price) || 0;
  if (group) {
    splitTopLevel(group.inner).forEach(opt => { price += bakedDelta(opt); });
  }
  return price;
}

function smartSplit(orderText) {
  return splitTopLevel(orderText.replace(/ \| Notes:.*$/, ""));
}

// Prices one order-line item (an item name, optionally with a " + (...)"
// combo/extras suffix) -- shared by calcOrderTotal (summing a whole order)
// and the pill list (showing each item's own price as soon as it's added,
// before the order is even submitted).
function priceForOrderLine(part) {
  const plusIdx = part.indexOf(" + ");
  const baseName = plusIdx >= 0 ? part.slice(0, plusIdx).trim() : part.trim();
  const suffix   = plusIdx >= 0 ? part.slice(plusIdx + 3).trim() : "";
  const meta = findMenuItem(baseName.replace(/\s*\(.*\)\s*$/, "").trim()) || findMenuItem(baseName);
  if (!meta) return 0;
  let price = resolveItemPrice(baseName);
  if (suffix.startsWith("Combo") && meta.comboPrice) {
    price += Number(meta.comboPrice);
  } else if (suffix && meta.extras?.length) {
    // suffix can hold more than one extra now, parenthesized like
    // "(No Cilantro, No Onions)" -- sum whichever chosen names match a
    // real extra. Strip the wrapping parens first (old single-extra
    // orders saved before this change have no parens, so this is a no-op
    // for them and they still resolve the same as always). A quantity
    // extra (max > 1, e.g. Big Greek's "Extra Pita" up to 3) is saved as
    // "Extra Pita x2" -- strip the "xN" suffix to find the base extra,
    // then multiply its price by N.
    suffix.replace(/^\(|\)$/g, "").split(",").forEach(n => {
      const trimmed  = n.trim();
      const qtyMatch = trimmed.match(/^(.*)\s+x(\d+)$/);
      const name     = qtyMatch ? qtyMatch[1].trim() : trimmed;
      const qty      = qtyMatch ? Number(qtyMatch[2]) : 1;
      const ex = meta.extras.find(e => e.name === name);
      if (ex) price += (Number(ex.price) || 0) * qty;
    });
  }
  return price;
}

function calcOrderTotal(orderText) {
  return smartSplit(orderText).filter(Boolean).reduce((total, part) => total + priceForOrderLine(part), 0);
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
    // Saturday before this Friday through Monday 6am ET (when the worksheet
    // actually closes) -- covers a late/overridden order placed over the
    // weekend, which the old Friday-midnight cutoff used to hide entirely.
    const windowEnd = getWorksheetCloseCutoff();
    const saturday  = new Date(currentFriday + "T00:00:00");
    saturday.setDate(saturday.getDate() - 6);
    const roundCutoff = getRoundCutoff(currentFriday);
    const allRows = parseCSV(csv).slice(1).filter(r => {
      if (!r[1]) return false;
      const ts = r[0] ? new Date(r[0]) : null;
      if (!ts || ts < saturday || ts > windowEnd) return false;
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
    const overrideActive = isOverrideActive();
    const trs = rows.map(r => {
      const rowName    = (r[1] ?? "").trim();
      const items      = smartSplit(r[2] ?? "");
      const notes      = extractNotes(r[2] ?? "");
      const debugFakeTs = DEBUG_MODE ? _debugLateOverrides.get(rowName.toLowerCase()) : null;
      const ts         = debugFakeTs ? new Date(debugFakeTs) : (r[0] ? new Date(r[0]) : null);
      const isLate     = !overrideActive && ts && !isNaN(ts) && ts > deadline;
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

// The worksheet stays open through Monday 6:00 AM ET (see
// renderWorksheetResetNotice) before the rotation flips to the next
// restaurant -- so the Orders window for a given Friday should extend that
// far, not just to Friday midnight, or a legitimately late/overridden order
// placed over the weekend would be filtered out of view entirely.
function getWorksheetCloseCutoff() {
  const fri = currentFriday || toYMD((() => { const d = new Date(); while (d.getDay() !== 5) d.setDate(d.getDate() + 1); return d; })());
  const [y, mo, d] = fri.split("-").map(Number);
  const jan = new Date(y, 0, 1);
  const dstStart = new Date(y, 2, 8  + (7 - jan.getDay()) % 7);
  const dstEnd   = new Date(y, 10, 1 + (7 - new Date(y, 10, 1).getDay()) % 7);
  const monday   = new Date(y, mo - 1, d + 3); // Fri -> Sat -> Sun -> Mon
  const utcOffset = (monday >= dstStart && monday < dstEnd) ? 4 : 5;
  return new Date(Date.UTC(y, mo - 1, d + 3, 6 + utcOffset, 0, 0));
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
    const overrideActive = isOverrideActive();
    const diff = getDeadline() - debugNow();
    const closed = !overrideActive && diff <= 0;
    updateLateWarning(closed);
    if (closed) {
      el.innerHTML = `<span class="countdown-label" style="flex:1;cursor:pointer" id="deadline-label">ORDER BY<br><span class="countdown-label-time">${fmtTime()}</span></span>
        <span style="padding:0.75rem 1rem;font-weight:900;letter-spacing:0.18em;font-size:0.85rem;flex:1;text-align:center">ORDERS CLOSED</span>`;
      document.getElementById("deadline-label")?.addEventListener("click", showEditor);
      return;
    }
    // Clamped to 0 rather than going negative -- once overridden, the
    // original Friday deadline can be in the past, but the clock should
    // just read as "no time left on the old deadline" instead of counting
    // up into negative numbers.
    const clampedDiff = Math.max(diff, 0);
    const h = Math.floor(clampedDiff / 3600000);
    const m = Math.floor((clampedDiff % 3600000) / 60000);
    const s = Math.floor((clampedDiff % 60000) / 1000);
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
    // Source from --theme-color (the theme's actual vivid color), not
    // --accent -- --accent is now a lighter highlight tint of it, and
    // computing off that would double-lighten these derived colors.
    const style = getComputedStyle(document.body);
    const accent = (style.getPropertyValue("--theme-color").trim() || style.getPropertyValue("--accent").trim()) || "#fcf811";
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

    // A brighter/lighter sibling of the above, same hue -- for places (like
    // the Random Pick lightbox) that want the theme color to read as
    // vivid/bright rather than the deliberately muted "just barely visible"
    // darker tone.
    //
    // Clamping to a fixed [58,72] lightness band (the original approach)
    // only guarantees contrast against bg's that sit outside that band.
    // Several themes' accents already sit *inside* it -- yellow (l=53),
    // juicyyellow (l=50), green (l=54), pink (l=54) -- so the clamp barely
    // moved them and the "highlight" came out nearly identical to the bg.
    // Instead, pick whichever side of the lightness scale is far from the
    // source color: light bg's (l >= 50) get a dark, rich highlight; dark
    // bg's get a light, bright one. That guarantees a large delta no matter
    // where the source lightness started.
    const lighterTone = hslToHex(h, Math.max(60, s), l >= 50 ? 32 : 72);
    document.documentElement.style.setProperty("--theme-arrow-light", lighterTone);
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

  // Group by PERSON+item (not item alone, ignoring notes) -- each
  // co-orderer of the same dish gets their own History row now, instead
  // of being combined into one shared row with a multi-name Names column.
  // A shared row's Rated flag couldn't cleanly distinguish "person A
  // rated this" from "person B still hasn't," so the first co-orderer to
  // rate a combined item could end up silently marking it done for
  // everyone else who separately ordered it too. One row per person
  // avoids that ambiguity at the source, rather than needing to track it.
  const counts = new Map();
  rows.forEach(r => {
    const orderer = (r[1] || "").trim();
    smartSplit(r[2] ?? "").forEach(item => {
      const key = `${orderer.toLowerCase()}|${item.toLowerCase()}`;
      if (!counts.has(key)) counts.set(key, { name: item, qty: 0, names: orderer ? [orderer] : [] });
      counts.get(key).qty++;
    });
  });
  const items = [...counts.values()];

  btn.disabled = true;
  btn.textContent = "Logging…";
  btn.dataset.busy = "1";
  status.style.display = "none";
  const restaurant = document.getElementById("restaurant-name")?.textContent || "";
  // Following the normal rotation, the nominal Friday IS the real date this
  // gets completed on, so keep using currentFriday there. Only an
  // overridden round -- which can run past Friday since the worksheet
  // stays open through Monday 6am ET -- needs the actual completion date
  // instead, since currentFriday no longer reflects when it really happened.
  const completedDate = isOverrideActive() ? getTodayET() : currentFriday;
  try {
    if (MOCK_MODE) {
      const now = new Date().toISOString();
      items.forEach(it => _mockHistory.push([now, completedDate, restaurant, it.name, it.qty, it.names.join(", "), 0, ""]));
    } else {
      if (!APPS_SCRIPT_URL) throw new Error("APPS_SCRIPT_URL not configured");
      const params = new URLSearchParams({
        type: "history",
        date: completedDate,
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
      <button type="button" class="btn-secondary override-modal-item" data-name="${escAttr(n)}" style="margin-top:0;width:100%;font-size:0.85rem;padding:0.55rem 0.6rem">${esc(n)}</button>
    `).join("") + `
      <button type="button" class="btn-secondary override-modal-item" data-name="" style="margin-top:0;width:100%;font-size:0.85rem;padding:0.55rem 0.6rem">Clear override (use scheduled rotation)</button>
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
  renderRestaurantTrendChart(computeRestaurantRatingTrend(restaurantName));
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
// Tracks whether this modal was reached FROM the Food Chart, so it can
// offer a way back there -- otherwise closing it just closes it, there's
// nothing to return to.
let _itemDetailFromFoodChart = false;

function openItemDetail(restaurant, item, fromFoodChart) {
  document.getElementById("item-detail-title").textContent = item;
  _itemDetailFromFoodChart = !!fromFoodChart;
  const backLink = document.getElementById("item-detail-back-link");
  if (backLink) backLink.style.display = _itemDetailFromFoodChart ? "block" : "none";

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

function backToFoodChart() {
  closeItemDetail();
  openFoodChart();
}

function renderItemTrendChart(trend) {
  renderTrendChart(trend, {
    svg: "item-detail-chart", empty: "item-detail-empty",
    wrap: "item-detail-chart-wrap", tooltip: "item-detail-tooltip",
  });
}

// Whole-restaurant performance trend -- one point per date, averaging
// every rated item from that date's order together (not per-item). Lives
// at the top of the restaurant's own report modal, above the per-item
// Item Stats table.
function renderRestaurantTrendChart(trend) {
  renderTrendChart(trend, {
    svg: "restaurant-trend-chart", empty: "restaurant-trend-empty",
    wrap: "restaurant-trend-chart-wrap", tooltip: "restaurant-trend-tooltip",
  });
}

// Shared line-chart renderer -- takes { svg, empty, wrap, tooltip } element
// ids so both the per-item trend (openItemDetail) and the whole-restaurant
// trend (openMenuReport) can draw the exact same style of chart into their
// own separate DOM nodes without duplicating the SVG-building logic.
function renderTrendChart(trend, ids) {
  const svg   = document.getElementById(ids.svg);
  const empty = document.getElementById(ids.empty);
  if (!svg || !empty) return;
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

  const tooltip = document.getElementById(ids.tooltip);
  const wrapEl  = document.getElementById(ids.wrap);
  svg.querySelectorAll(".item-detail-hit").forEach(hit => {
    hit.addEventListener("mouseenter", () => {
      tooltip.textContent = `${hit.dataset.date} — ${hit.dataset.rating}/10`;
      tooltip.style.display = "block";
      const wrap = wrapEl.getBoundingClientRect();
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

  const totalSteps = 30 + Math.floor(Math.random() * 7);
  let step = 0;
  function tick() {
    const isLast = step >= totalSteps;
    // No more truncating during the spin -- the name box is a fixed
    // 3-line-tall box now (see .random-pick-name), so long names just wrap
    // instead of needing to be cut short to avoid resizing.
    nameEl.textContent = isLast
      ? _randomPickChosen.item
      : items[Math.floor(Math.random() * items.length)].item;
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
// The whole name is clickable too once a result has landed -- but a click
// mid-spin (while it's just cycling through random names) shouldn't do
// anything, so this only acts once .settled is actually on the element.
function randomPickNameClick() {
  if (!document.getElementById("random-pick-name")?.classList.contains("settled")) return;
  randomPickViewStats();
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


