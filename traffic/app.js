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
  return Math.min(1, seg.currentSpeed / seg.freeFlowSpeed);
}

async function updateGauge() {
  const statusEl = document.getElementById("gauge-status");
  const detailEl = document.getElementById("gauge-detail");
  const updatedEl = document.getElementById("last-updated");

  try {
    const results = await Promise.all(GAUGE_POINTS.map(async p => {
      try {
        return { ratio: await fetchFlowPoint(p), weight: p.weight || 1, status: null };
      } catch (err) {
        return { ratio: null, weight: p.weight || 1, status: err.status || null };
      }
    }));
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

let map, incidentLayer;

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

  map.fitBounds([[BBOX.south, BBOX.west], [BBOX.north, BBOX.east]]);
}

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
