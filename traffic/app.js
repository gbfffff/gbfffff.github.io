const TOMTOM_KEY = (window.TRAFFIC_CONFIG && window.TRAFFIC_CONFIG.TOMTOM_KEY) || "";

// Bounding box: upper Capital Beltway (495) arc, I-270 corridor up to roughly
// exit 12 (Rockville/Shady Grove area), and I-95 near College Park.
const BBOX = { north: 39.14, south: 38.96, west: -77.20, east: -76.90 };
const MAP_CENTER = [39.05, -77.05];

// A handful of representative points spread across the covered highways,
// used to sample real-time speed vs free-flow speed for the gauge.
const GAUGE_POINTS = [
  { name: "495 @ I-270 spur (Bethesda)", lat: 39.0334, lon: -77.1198 },
  { name: "495 @ Georgia Ave (Silver Spring)", lat: 39.0421, lon: -77.0492 },
  { name: "495 @ New Hampshire Ave", lat: 39.0295, lon: -76.9718 },
  { name: "270 @ Montrose Rd", lat: 39.0839, lon: -77.1528 },
  { name: "270 @ Shady Grove", lat: 39.1157, lon: -77.1699 },
  { name: "95 @ College Park", lat: 38.9897, lon: -76.9378 },
];

const REFRESH_MS = 2 * 60 * 1000;

function setNeedle(pct) {
  const needle = document.getElementById("gauge-needle");
  const clamped = Math.max(0, Math.min(100, pct));
  needle.style.left = `${clamped}%`;
}

function classify(pct) {
  if (pct >= 75) return { label: "Good", color: "var(--green)" };
  if (pct >= 45) return { label: "OK", color: "var(--yellow)" };
  return { label: "Bad", color: "var(--red)" };
}

async function fetchFlowPoint(point) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${point.lat},${point.lon}&key=${TOMTOM_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`flowSegmentData ${res.status}`);
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
    const ratios = await Promise.all(GAUGE_POINTS.map(p => fetchFlowPoint(p).catch(() => null)));
    const valid = ratios.filter(r => r !== null);
    if (!valid.length) throw new Error("no data");

    const avgPct = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100);
    const { label, color } = classify(avgPct);

    setNeedle(avgPct);
    statusEl.textContent = label;
    statusEl.style.color = color;
    detailEl.textContent = `${avgPct}% of normal speed across ${valid.length} points`;
    updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    statusEl.textContent = "Unavailable";
    statusEl.style.color = "var(--text-dim)";
    detailEl.textContent = "Couldn't reach TomTom traffic data.";
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

const incidentIcon = L.divIcon({
  className: "incident-marker",
  html: "&#9888;",
  iconSize: [16, 16],
});

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
      const coords = incident.geometry && incident.geometry.coordinates;
      if (!coords) return;
      const [lon, lat] = Array.isArray(coords[0]) ? coords[0] : coords;
      L.marker([lat, lon], { icon: incidentIcon }).addTo(incidentLayer);
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
  setInterval(refreshAll, REFRESH_MS);
}
