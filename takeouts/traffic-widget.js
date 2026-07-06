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

  // Upper Capital Beltway (495) arc, I-270 corridor up toward Shady Grove
  // (roughly exit 12), and I-95 near College Park.
  const BBOX = { north: 39.14, south: 38.96, west: -77.20, east: -76.90 };
  // Centered near White Oak, MD -- view shows the northern Beltway up to
  // Gaithersburg (270) and east to College Park (95).
  const MAP_CENTER = [39.065, -77.027];

  const GAUGE_POINTS = [
    { lat: 39.0334, lon: -77.1198 }, // 495 @ 270 spur (Bethesda)
    { lat: 39.0421, lon: -77.0492 }, // 495 @ Georgia Ave (Silver Spring)
    { lat: 38.9958, lon: -76.9058 }, // 495 @ Kenilworth Ave (Greenbelt)
    { lat: 39.0600, lon: -77.1467 }, // 270 @ Randolph Rd (Rockville)
    { lat: 39.0839, lon: -77.1528 }, // 270 @ Montrose Rd
    { lat: 39.1157, lon: -77.1699 }, // 270 @ Shady Grove
    { lat: 38.9897, lon: -76.9378 }, // 95 @ College Park
  ];

  const REFRESH_MS = 2 * 60 * 1000;

  // The bar reads Good -> OK -> Bad left-to-right, but pct is a speed ratio
  // (higher = better), so the needle position is inverted from pct.
  function setNeedle(pct, color) {
    const badness = 100 - Math.max(0, Math.min(100, pct));
    const needleEl = document.getElementById("traffic-gauge-needle");
    needleEl.style.left = `${badness}%`;
    needleEl.style.background = color;
  }

  function classify(pct) {
    if (pct >= 75) return { label: "Good", color: "var(--green)" };
    if (pct >= 45) return { label: "OK", color: "#cc9900" };
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
    const detailEl = document.getElementById("traffic-gauge-detail");
    const updatedEl = document.getElementById("traffic-updated");
    try {
      const ratios = await Promise.all(GAUGE_POINTS.map(p => fetchFlowPoint(p).catch(() => null)));
      const valid = ratios.filter(r => r !== null);
      if (!valid.length) throw new Error("no data");

      const avgPct = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100);
      const { label, color } = classify(avgPct);

      setNeedle(avgPct, color);
      badgeEl.textContent = label;
      detailEl.textContent = `${avgPct}% of normal speed across ${valid.length} points`;
      updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      badgeEl.textContent = "Unavailable";
      detailEl.textContent = "Couldn't reach TomTom traffic data.";
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
  const DEFAULT_STYLE = "carto-light";

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
      minZoom: 9,
      maxZoom: 16,
      // Padded well beyond BBOX so the whole 495 loop -- including the
      // southern arc near Alexandria/National Harbor -- can be panned/
      // zoomed into, plus ~20mi (~0.37 deg lon at this latitude) further
      // west and east than the corridor itself.
      maxBounds: [[BBOX.south - 0.25, BBOX.west - 0.45], [BBOX.north + 0.05, BBOX.east + 0.45]],
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

  const incidentIcon = L.divIcon({
    className: "traffic-incident-marker",
    html: "&#9888;",
    iconSize: [16, 16],
  });

  async function updateIncidents() {
    const bboxParam = `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
    const fields = "{incidents{geometry{coordinates}}}";
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

  initMap();
  refreshAll();
  setInterval(refreshAll, REFRESH_MS);
})();
