// Drop Game (Plinko) + Wheel of Fortune -- extracted from the takeout app
// (which combined them under one card with a shared toggle) into their own
// standalone game, listed on the games/ hub alongside Polls. Restaurant
// Picker still pulls the live rotation list from the takeout app's own
// restaurants.json (the one real cross-app dependency); everything else
// here is self-contained, following the same pattern as games/polls/app.js
// (own config, own MOCK_MODE fallback, no shared modules).

const _cfg              = window.PLINKO_WHEEL_CONFIG || {};
const APPS_SCRIPT_URL   = _cfg.APPS_SCRIPT_URL   || "";
const SHEET_ID          = _cfg.SHEET_ID          || "";
const PLINKO_SCORES_GID = _cfg.PLINKO_SCORES_GID || "";

// No dedicated mock-data path is needed here -- the leaderboard code below
// already degrades gracefully (an unconfigured PLINKO_SCORES_GID/SHEET_ID
// just shows "High scores aren't hooked up yet." and score submission is a
// no-op) whenever APPS_SCRIPT_URL/SHEET_ID aren't set, same as it does in
// the takeout app before those secrets are configured.

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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
makeManualResizable(document.getElementById("plinko-board"), document.getElementById("plinko-board-grip"), 290, 3000);
// Same grip also resizes the Wheel board (only one of the two is ever
// visible at once) so switching modes doesn't reset size.
makeManualResizable(document.getElementById("wheel-board"), document.getElementById("plinko-board-grip"), 290, 3000);

// Restaurant Picker preset -- the one real dependency on the takeout app.
// _historyRows/_allRatingRows are intentionally left empty (rather than
// fetched) so the Wheel's "Food: Popular Picks" preset just falls back to
// its own hardcoded MEAT_TYPES list, same as it does today whenever those
// sheets have no data yet.
let _restaurantsConfig = null;
let _historyRows = [];
let _allRatingRows = [];

async function loadRestaurantsConfig() {
  try {
    const res = await fetch("../../takeouts/restaurants.json?v=" + Date.now());
    _restaurantsConfig = await res.json();
  } catch (err) {
    console.warn("[plinko-wheel] could not load restaurants.json:", err);
    _restaurantsConfig = { restaurants: [] };
  }
}

// ── Theme & dark mode (copied from the takeout app so Plinko/Wheel's
// theme-derived colors -- --theme-complement/--theme-arrow -- keep working
// standalone) ────────────────────────────────────────────────────────────
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

  if (switcher && window.visualViewport) {
    const MARGIN = 20;
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
// hue+180 math as the takeout app's version) as a CSS custom property, so
// Plinko's colored slots and the Wheel's wedges/pointer glow can key off
// var(--theme-complement)/var(--theme-arrow)/var(--theme-arrow-light).
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
    const darkerTone = hslToHex(h, Math.max(35, s * 0.5), Math.min(48, Math.max(35, l)));
    document.documentElement.style.setProperty("--theme-arrow", darkerTone);
    const lighterTone = hslToHex(h, Math.max(55, s), Math.min(72, Math.max(58, l)));
    document.documentElement.style.setProperty("--theme-arrow-light", lighterTone);
  }
  document.addEventListener("themechange", updateThemeComplement);
  updateThemeComplement();
})();

loadRestaurantsConfig();

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

  // Session total of golden balls won, shown in the top control bar --
  // scoped to THIS page load, not persisted. The countdown itself doesn't
  // survive a refresh (see plinkoRemainingMs above), so keeping gold/bags
  // persisted while the clock reset to a fresh 3:00 meant a refresh
  // mid-round could start a brand new round already sitting on gold/bags
  // from before. Everything resets together now.
  let goldTotal = 0;
  function updateGoldCount(add) {
    if (add) goldTotal += add;
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
  // a bag -- the bag tally is painted in the tray corner as the money-bag
  // sign. Scoped to this page load, same as goldTotal above -- not
  // persisted, so a refresh can't leave a fresh 3:00 countdown sitting on
  // top of gold/bags left over from before.
  //
  // trayGoldCount is the real running total, kept alongside the physical
  // ball objects in `balls` (every gold ball dropped is also simulated --
  // now that gold overlaps and skips collision with other gold, there's no
  // packing/jam risk from letting all of them actually fall). It's what
  // gates bagging and what's shown in the live readout.
  let goldBags = 0;
  let trayGoldCount = 0;
  function saveTrayGoldCount() {}
  function bagUpTray() {
    if (trayGoldCount < TRAY_CAPACITY) return;
    const bagsGained = Math.floor(trayGoldCount / TRAY_CAPACITY);
    goldBags += bagsGained;
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
    // Frozen while the reward shower is playing out (winning shouldn't
    // burn round time while the gold is falling/settling) AND for as long
    // as any win/lose comment is sitting on screen afterward -- the board
    // doesn't auto-clear, so that could otherwise be an arbitrarily long
    // stretch of real time nobody asked to spend. Resumes the instant the
    // comment is dismissed (restart) and the next ball drops.
    const commentShowing = document.getElementById("plinko-comment")?.classList.contains("show");
    const paused = spawningGold || goldShowerActive || commentShowing;
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
    goldBags = 0;
    trayGoldCount = 0;
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
//
// The games/ hub lists Plinko and Wheel as two separate tabs, each loading
// this same page with a ?mode= param to force+lock which board shows --
// switching games is the hub's job now, so the in-page toggle arrow hides
// itself whenever a mode was forced from outside. Visited with no ?mode=
// (e.g. directly), Wheel is the default on first load.
(function() {
  const card = document.getElementById("plinko-card");
  const btn  = document.getElementById("game-mode-toggle-btn");
  if (!card || !btn) return;

  const MODES = ["plinko", "wheel"];
  const NEXT_LABEL = { plinko: "Wheel", wheel: "Drop Game" };
  const forcedMode = new URLSearchParams(location.search).get("mode");
  card.dataset.mode = MODES.includes(forcedMode) ? forcedMode : "wheel";

  if (forcedMode) {
    btn.style.display = "none";
  } else {
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
  }
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
    // Responsive to the actual resizable box on both axes -- dragging the
    // grip shorter shrinks the wheel, same as before. Margins just kept
    // small so the wheel claims as much of that box as it can.
    const maxByWidth  = w - 12;
    const maxByHeight = h - 90;
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
    // Was 9 -- too small to read comfortably even for a short, ordinary
    // word (e.g. a plain 6-letter item name), especially once a wheel has
    // enough items to shrink baseFontSize a lot to begin with.
    const minFontSize = 11;
    // Radial room for the text -- kept well short of the hub (not just
    // rim-to-hub) so labels stay out in the wedge's outer band instead of
    // crowding together near the center once they're long enough to reach
    // that far in. Widened a bit (0.55 -> 0.65) so an ordinary short word
    // isn't needlessly shrunk/truncated before it actually needs to be.
    const availableLen = pieR * 0.65;

    // Starting point for how big the text COULD be, given wedge width and
    // radius -- longer labels shrink from here on a per-item basis (see
    // fitLabel below). But with few items on the wheel this could get
    // large enough that a short name (e.g. "Ben") rendered huge while a
    // slightly longer-but-still-short one (e.g. "Landen", "Samson") had to
    // truncate to "Land…"/"Sams…" right next to it -- awkward. Capping it
    // by what a representative ~10-character label needs to fit within
    // availableLen means anything under that length reliably shows in
    // full, instead of the font ballooning past what the wheel's actual
    // content needs.
    pctx.font = `900 100px ${CANVAS_FONT_FAMILY}`;
    const tenCharWidthAt100 = pctx.measureText("MMMMMMMMMM").width;
    const fitsTenCharsAt = (availableLen / tenCharWidthAt100) * 100;
    const baseFontSize = Math.min(
      Math.max(12, Math.min(r * 0.26, (r * 1.15) / n)),
      Math.max(minFontSize, fitsTenCharsAt)
    ) * 1.3;

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
