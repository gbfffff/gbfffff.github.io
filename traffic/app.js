const TOMTOM_KEY = (window.TRAFFIC_CONFIG && window.TRAFFIC_CONFIG.TOMTOM_KEY) || "";

// Bounding box: upper Capital Beltway (495) arc, I-270 corridor up to roughly
// exit 12 (Rockville/Shady Grove area), and I-95 near College Park.
const BBOX = { north: 39.14, south: 38.96, west: -77.20, east: -76.90 };
const MAP_CENTER = [39.05, -77.05];

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

function setNeedle(pct) {
  const needle = document.getElementById("gauge-needle");
  const clamped = Math.max(0, Math.min(100, pct));
  needle.style.left = `${clamped}%`;
}

function classify(pct) {
  if (pct >= 92) return { label: "Good", color: "var(--green)" };
  if (pct >= 60) return { label: "OK", color: "var(--yellow)" };
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
  // frc (functional road class) comes back with every flow query --
  // FRC0 is motorway/limited-access; higher numbers are ramps/arterials/
  // local streets. Kept around (not just the ratio) so a point that's
  // meant to be reading 495 itself but is actually snapping to a nearby
  // ramp or frontage road is visible in the checkpoint list, not silently
  // wrong.
  return {
    ratio: Math.min(1, seg.currentSpeed / seg.freeFlowSpeed),
    frc: seg.frc || null,
    currentSpeed: seg.currentSpeed,
    freeFlowSpeed: seg.freeFlowSpeed,
  };
}

// Per-point results from the most recent gauge fetch, kept around so the
// "Show checkpoints on map" toggle can plot each of the 9 individually
// without re-fetching -- updateGauge() already hits all 9 points anyway.
let _lastPointResults = [];

async function updateGauge() {
  const statusEl = document.getElementById("gauge-status");
  const detailEl = document.getElementById("gauge-detail");
  const updatedEl = document.getElementById("last-updated");

  try {
    const results = await Promise.all(GAUGE_POINTS.map(async p => {
      try {
        const flow = await fetchFlowPoint(p);
        return { ratio: flow?.ratio ?? null, frc: flow?.frc ?? null, currentSpeed: flow?.currentSpeed, freeFlowSpeed: flow?.freeFlowSpeed, weight: p.weight || 1, status: null };
      } catch (err) {
        return { ratio: null, frc: null, weight: p.weight || 1, status: err.status || null };
      }
    }));
    _lastPointResults = GAUGE_POINTS.map((p, i) => ({ ...p, ...results[i] }));
    if (checkpointsVisible) renderCheckpoints();
    renderGaugeCheckpointsList();

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

    setNeedle(avgPct);
    statusEl.textContent = label;
    statusEl.style.color = color;
    detailEl.textContent = `${avgPct}% of normal speed across ${valid.length} points`;
    updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    statusEl.textContent = "Unavailable";
    statusEl.style.color = "var(--text-dim)";
    detailEl.textContent = err.status ? `Not enough API credit. (${err.status})` : "Not enough API credit.";
  }
}

let map, incidentLayer, checkpointLayer;
let checkpointsVisible = false;

function initMap() {
  map = L.map("map", {
    center: MAP_CENTER,
    zoom: 11,
    minZoom: 10,
    maxZoom: 15,
    maxBounds: [[BBOX.south - 0.03, BBOX.west - 0.03], [BBOX.north + 0.03, BBOX.east + 0.03]],
    maxBoundsViscosity: 1.0,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`, {
    opacity: 0.9,
  }).addTo(map);

  incidentLayer = L.layerGroup().addTo(map);
  checkpointLayer = L.layerGroup();

  map.fitBounds([[BBOX.south, BBOX.west], [BBOX.north, BBOX.east]]);
}

// Plots each of the 9 GAUGE_POINTS used to compute the "Right Now" average,
// individually colored the same way the gauge classifies its overall score
// -- so a driver can see WHICH stretch is actually slow, not just the
// blended number.
function checkpointFillColor(pct) {
  if (pct === null) return getComputedStyle(document.documentElement).getPropertyValue("--text-dim").trim();
  const varName = pct >= 92 ? "--green" : pct >= 60 ? "--yellow" : "--red";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function renderCheckpoints() {
  checkpointLayer.clearLayers();
  _lastPointResults.forEach(p => {
    const known = p.ratio !== null && p.ratio !== undefined;
    const pct = known ? Math.round(p.ratio * 100) : null;
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 8,
      color: "#0a0a0a",
      weight: 2,
      fillColor: checkpointFillColor(pct),
      fillOpacity: 0.95,
      className: "checkpoint-marker",
    });
    marker.bindPopup(
      `<div class="checkpoint-popup"><span class="cp-name">${p.name}</span>${known ? `${pct}% of normal speed` : "No data"}</div>`
    );
    marker.addTo(checkpointLayer);
  });
}

// TomTom's functional road class -- FRC0 is motorway/limited-access (what
// 495/270/95 mainline should read as); everything above that is a ramp,
// arterial, or local street. Shown per-checkpoint so a point that's meant
// to be reading the highway itself but is actually snapping to a nearby
// interchange ramp or frontage road is visible here instead of silently
// skewing the average.
const FRC_LABELS = {
  FRC0: "Motorway", FRC1: "Major road", FRC2: "Major road",
  FRC3: "Secondary road", FRC4: "Local road", FRC5: "Local road",
  FRC6: "Local road", FRC7: "Minor road",
};

function renderGaugeCheckpointsList() {
  const el = document.getElementById("gauge-checkpoints-list");
  if (!el) return;
  el.innerHTML = _lastPointResults.map(p => {
    const known = p.ratio !== null && p.ratio !== undefined;
    const pct = known ? Math.round(p.ratio * 100) : null;
    const frcLabel = p.frc ? (FRC_LABELS[p.frc] || p.frc) : "";
    // A non-motorway frc is flagged -- likely means this point is reading
    // a ramp/local segment instead of the highway it's named for.
    const frcFlag = p.frc && p.frc !== "FRC0" ? ` <span class="cp-frc-flag" title="Not reading as a motorway segment">&#9888; ${frcLabel}</span>` : (frcLabel ? ` <span class="cp-frc">${frcLabel}</span>` : "");
    return `<div class="gauge-checkpoint-row">
      <span class="cp-row-name">${p.name}</span>
      <span class="cp-row-stat">${known ? `${pct}%` : "No data"}${frcFlag}</span>
    </div>`;
  }).join("");
}

function setCheckpointsVisible(visible) {
  checkpointsVisible = visible;
  const btn = document.getElementById("checkpoints-toggle");
  if (visible) {
    renderCheckpoints();
    checkpointLayer.addTo(map);
    btn.textContent = "Hide checkpoints";
    btn.classList.add("active");
  } else {
    map.removeLayer(checkpointLayer);
    btn.textContent = "Show 9 checkpoints on map";
    btn.classList.remove("active");
  }
}

document.getElementById("checkpoints-toggle").addEventListener("click", () => {
  setCheckpointsVisible(!checkpointsVisible);
});

document.getElementById("gauge-readout-toggle").addEventListener("click", () => {
  document.getElementById("gauge-checkpoints-panel").classList.toggle("open");
  document.getElementById("gauge-readout-toggle").classList.toggle("open");
});

// TomTom iconCategory: 1 = Accident, 8 = Road Closed. Others (6 Jam,
// 9 Road Works/Construction, etc.) are excluded. Each gets its own glyph
// so the two are visually distinct on the map.
const INCIDENT_ICONS = {
  1: L.divIcon({ className: "incident-marker incident-accident", html: "&#9888;", iconSize: [16, 16] }),
  8: L.divIcon({ className: "incident-marker incident-closed", html: "&#9940;", iconSize: [16, 16] }),
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
    // Leave existing markers in place rather than clearing on a transient failure.
  }
}

function refreshAll() {
  updateGauge();
  updateIncidents();
}

document.getElementById("refresh-btn").addEventListener("click", refreshAll);

if (!TOMTOM_KEY) {
  document.getElementById("gauge-status").textContent = "No API key";
  document.getElementById("gauge-detail").textContent = "Add your key to traffic/config.js (see config.example.js).";
} else {
  initMap();
  refreshAll();
}
