// Traffic card: TomTom-powered gauge + minimalist map, styled to match the
// rest of the site. Reads the API key from window.TAKEOUT_CONFIG.TOMTOM_KEY
// (same config.js the rest of the app uses).
(function () {
  const TOMTOM_KEY = (window.TAKEOUT_CONFIG && window.TAKEOUT_CONFIG.TOMTOM_KEY) || "";

  const badgeEl = document.getElementById("traffic-badge");
  if (!badgeEl) return; // traffic card not present on this page

  if (!TOMTOM_KEY) {
    badgeEl.textContent = "No key";
    document.getElementById("traffic-gauge-detail").textContent = "Add TOMTOM_KEY to config.js.";
    return;
  }

  // Just a little over the 495 ring itself -- hugs the upper Beltway arc
  // this app actually cares about (270 spur through Silver Spring to
  // College Park, per GAUGE_POINTS below), not the full loop and nowhere
  // near Dulles/Annapolis. Kept tight on purpose: every degree wider here
  // is more TomTom map tiles loaded on every page view.
  const BBOX = { north: 39.77, south: 38.77, west: -77.85, east: -76.18 };
  const MAP_CENTER = [39.02, -77.02];

  // Traces the actual route from the restaurant rotation's home turf (270
  // corridor, Rockville/Gaithersburg -- geocoded from each restaurant's own
  // mapUrl in restaurants.json) down to College Park: 270 S -> 495 E through
  // Silver Spring/New Hampshire Ave (the segment most reliably congested)
  // -> 95 S/College Park. Eastbound-495 points (Georgia Ave onward) carry
  // double weight in the gauge average since that's the stretch that most
  // determines the real trip to College Park.
  const GAUGE_POINTS = [
    { name: "270 @ Ixtapalapa (Gaithersburg)", lat: 39.1466, lon: -77.2041, weight: 1 },
    { name: "270 @ Shanghai Taste (Rockville)", lat: 39.0920, lon: -77.1746, weight: 1 },
    { name: "270 @ Randolph Rd (Rockville)", lat: 39.0600, lon: -77.1467, weight: 1 },
    { name: "495 @ I-270 spur (Bethesda)", lat: 39.0334, lon: -77.1198, weight: 1 },
    { name: "495 @ Georgia Ave (Silver Spring)", lat: 39.0421, lon: -77.0492, weight: 2 },
    { name: "495 @ New Hampshire Ave", lat: 39.0295, lon: -76.9718, weight: 2 },
    { name: "495 @ New Hampshire Ave exit (interchange)", lat: 39.0335, lon: -76.9724, weight: 2 },
    { name: "495 @ Kenilworth Ave (Greenbelt)", lat: 38.9958, lon: -76.9058, weight: 2 },
    { name: "95 @ College Park", lat: 38.9897, lon: -76.9378, weight: 1 },
  ];

  // The bar reads Good -> OK -> Bad left-to-right, but pct is a speed ratio
  // (higher = better), so the needle position is inverted from pct.
  function setNeedle(pct, color) {
    const badness = 100 - Math.max(0, Math.min(100, pct));
    const needleEl = document.getElementById("traffic-gauge-needle");
    needleEl.style.left = `${badness}%`;
    needleEl.style.background = color;
  }

  function classify(pct) {
    if (pct >= 92) return { label: "Good", color: "var(--green)" };
    if (pct >= 60) return { label: "OK", color: "#cc9900" };
    return { label: "Bad", color: "var(--red)" };
  }

  async function fetchFlowPoint(point) {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${point.lat},${point.lon}&key=${TOMTOM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const seg = data.flowSegmentData;
    if (!seg || !seg.freeFlowSpeed) return null;
    // frc (functional road class) comes back with every flow query -- FRC0
    // is motorway/limited-access (what 495/270/95 mainline should read as);
    // anything higher means the point snapped to a ramp/arterial/local
    // street instead. Kept so the checkpoint list can flag it.
    return { ratio: Math.min(1, seg.currentSpeed / seg.freeFlowSpeed), frc: seg.frc || null };
  }

  // TomTom's functional road class labels, for the checkpoint list.
  const FRC_LABELS = {
    FRC0: "Motorway", FRC1: "Major road", FRC2: "Major road",
    FRC3: "Secondary road", FRC4: "Local road", FRC5: "Local road",
    FRC6: "Local road", FRC7: "Minor road",
  };

  // Kept around so the Checkpoint Details panel can render without
  // re-fetching -- updateGauge() already hits all 9 points anyway.
  let _lastPointResults = [];

  function renderCheckpointsList() {
    const el = document.getElementById("traffic-checkpoints-list");
    if (!el) return;
    el.innerHTML = _lastPointResults.map(p => {
      const known = p.ratio !== null && p.ratio !== undefined;
      const pct = known ? Math.round(p.ratio * 100) : null;
      const frcLabel = p.frc ? (FRC_LABELS[p.frc] || p.frc) : "";
      // A non-motorway frc is flagged -- likely means this point is
      // reading a ramp/local segment instead of the highway it's named for.
      const frcHtml = p.frc && p.frc !== "FRC0"
        ? ` <span class="traffic-cp-frc-flag" title="Not reading as a motorway segment">&#9888; ${frcLabel}</span>`
        : (frcLabel ? ` <span class="traffic-cp-frc">${frcLabel}</span>` : "");
      return `<div class="traffic-checkpoint-row">
        <span class="traffic-cp-name">${p.name}</span>
        <span class="traffic-cp-stat">${known ? `${pct}%` : "No data"}${frcHtml}</span>
      </div>`;
    }).join("");
  }

  async function updateGauge() {
    const detailEl = document.getElementById("traffic-gauge-detail");
    const updatedEl = document.getElementById("traffic-updated");
    try {
      const results = await Promise.all(GAUGE_POINTS.map(async p => {
        try {
          const flow = await fetchFlowPoint(p);
          return { ratio: flow?.ratio ?? null, frc: flow?.frc ?? null, weight: p.weight || 1, status: null };
        } catch (err) {
          return { ratio: null, frc: null, weight: p.weight || 1, status: err.status || null };
        }
      }));
      _lastPointResults = GAUGE_POINTS.map((p, i) => ({ ...p, ...results[i] }));
      renderCheckpointsList();

      const valid = results.filter(r => r.ratio !== null);
      if (!valid.length) {
        const status = results.find(r => r.status)?.status;
        const err = new Error("no data");
        err.status = status;
        throw err;
      }

      const weightSum = valid.reduce((a, r) => a + r.weight, 0);
      const avgPct = Math.round((valid.reduce((a, r) => a + r.ratio * r.weight, 0) / weightSum) * 100);
      const { label, color } = classify(avgPct);

      setNeedle(avgPct, color);
      badgeEl.textContent = label;
      detailEl.textContent = `${avgPct}% of normal speed across ${valid.length} points`;
      updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      badgeEl.textContent = "Unavailable";
      detailEl.textContent = err.status ? `Not enough API credit. (${err.status})` : "Not enough API credit.";
    }
  }

  const MAP_STYLES = {
    "carto-light": {
      label: "Light",
      url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      options: { attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: "abcd", maxZoom: 20 },
    },
    "carto-dark": {
      label: "Dark",
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      options: { attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: "abcd", maxZoom: 20 },
    },
    "tomtom-day": {
      label: "TomTom Day",
      url: `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
      options: { maxZoom: 18 },
    },
    "tomtom-night": {
      label: "TomTom Night",
      url: `https://api.tomtom.com/map/1/tile/basic/night/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`,
      options: { maxZoom: 18 },
    },
  };
  const DEFAULT_STYLE = "tomtom-night";

  let map, incidentLayer, baseLayer;

  function setBaseStyle(styleId) {
    const style = MAP_STYLES[styleId];
    if (!style) return;

    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer(style.url, style.options).addTo(map);
    baseLayer.bringToBack();

    document.querySelectorAll(".traffic-style-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.style === styleId);
    });
  }

  function initMap() {
    map = L.map("traffic-map", {
      center: MAP_CENTER,
      zoom: 11,
      // Matches the initial fit-to-BBOX zoom -- zooming out further would
      // just load more surrounding tiles for no reason, since maxBounds
      // already caps how far you can pan.
      minZoom: 11,
      maxZoom: 16,
      // Only a small pad beyond the now-tight BBOX.
      maxBounds: [[BBOX.south - 0.03, BBOX.west - 0.03], [BBOX.north + 0.03, BBOX.east + 0.03]],
      maxBoundsViscosity: 1.0,
    });

    setBaseStyle(DEFAULT_STYLE);

    L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`, {
      opacity: 0.9,
    }).addTo(map);

    incidentLayer = L.layerGroup().addTo(map);

    document.querySelectorAll(".traffic-style-btn").forEach(btn => {
      btn.addEventListener("click", () => setBaseStyle(btn.dataset.style));
    });
  }

  // TomTom iconCategory: 1 = Accident, 8 = Road Closed. Others (6 Jam,
  // 9 Road Works/Construction, etc.) are excluded. Each gets its own glyph
  // so the two are visually distinct on the map.
  const INCIDENT_ICONS = {
    1: L.divIcon({ className: "traffic-incident-marker traffic-incident-accident", html: "&#9888;", iconSize: [16, 16] }),
    8: L.divIcon({ className: "traffic-incident-marker traffic-incident-closed", html: "&#9940;", iconSize: [16, 16] }),
  };

  async function updateIncidents() {
    const bboxParam = `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
    const fields = "{incidents{geometry{coordinates}properties{iconCategory}}}";
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bboxParam}&fields=${encodeURIComponent(fields)}&language=en-US&key=${TOMTOM_KEY}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`incidentDetails ${res.status}`);
      const data = await res.json();

      incidentLayer.clearLayers();
      (data.incidents || []).forEach(incident => {
        const icon = INCIDENT_ICONS[incident.properties?.iconCategory];
        if (!icon) return;
        const coords = incident.geometry && incident.geometry.coordinates;
        if (!coords) return;
        const [lon, lat] = Array.isArray(coords[0]) ? coords[0] : coords;
        L.marker([lat, lon], { icon }).addTo(incidentLayer);
      });
    } catch (err) {
      // Leave existing markers in place on a transient failure.
    }
  }

  function refreshAll() {
    updateGauge();
    updateIncidents();
  }

  document.getElementById("traffic-refresh-btn").addEventListener("click", refreshAll);

  const toolsBtn = document.getElementById("traffic-tools-toggle-btn");
  const toolsPanel = document.getElementById("traffic-tools-panel");
  if (toolsBtn && toolsPanel) {
    toolsBtn.addEventListener("click", () => {
      const open = !toolsBtn.classList.contains("open");
      toolsBtn.classList.toggle("open", open);
      toolsPanel.classList.toggle("open", open);
    });
  }

  const checkpointsBtn = document.getElementById("traffic-checkpoints-toggle-btn");
  const checkpointsPanel = document.getElementById("traffic-checkpoints-panel");
  if (checkpointsBtn && checkpointsPanel) {
    checkpointsBtn.addEventListener("click", () => {
      const open = !checkpointsBtn.classList.contains("open");
      checkpointsBtn.classList.toggle("open", open);
      checkpointsPanel.classList.toggle("open", open);
    });
  }

  initMap();
  refreshAll();
})();
