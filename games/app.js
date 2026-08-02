// Hub shell for the games/ site. Each game (Wheel, Plinko, Polls) is a
// fully independent standalone page/app -- its own app.js, config.js,
// theme switcher, etc. -- so they're each loaded lazily into their own
// <iframe> (only when its tab is first opened) rather than injected as
// scripts into this document; Polls and Plinko/Wheel declare colliding
// top-level globals (esc, SHEET_ID, APPS_SCRIPT_URL, ...) since neither
// was written expecting to share a page with the other, so an iframe
// boundary is what keeps "loaded individually" from meaning "loaded, but
// broken." Wheel and Plinko are two tabs but the SAME underlying page
// (plinko-wheel/index.html), each forcing its board via a ?mode= param --
// see that page's own mode-toggle script for why order matters there.
const GAME_SRC = {
  "wheel": "plinko-wheel/index.html?mode=wheel",
  "plinko": "plinko-wheel/index.html?mode=plinko",
  "polls": "polls/index.html",
};

const tabs   = document.querySelectorAll(".hub-tab");
const frames = {
  "wheel": document.getElementById("frame-wheel"),
  "plinko": document.getElementById("frame-plinko"),
  "polls": document.getElementById("frame-polls"),
};

function openGame(key) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.game === key));
  Object.keys(frames).forEach(k => frames[k].classList.toggle("active", k === key));
  const frame = frames[key];
  if (frame && !frame.src) frame.src = GAME_SRC[key];
}

tabs.forEach(tab => tab.addEventListener("click", () => openGame(tab.dataset.game)));

// Each embedded game posts its own resolved --bg/--ink whenever its theme
// switcher changes (see notifyHubOfTheme() in polls/app.js and
// plinko-wheel/app.js) -- applied to the hub's own :root so the header/tabs/
// page background actually match instead of staying a fixed color while
// only the iframe content themes itself.
window.addEventListener("message", e => {
  if (e.data?.type !== "gbf-theme") return;
  if (e.data.bg) document.documentElement.style.setProperty("--bg", e.data.bg);
  if (e.data.ink) document.documentElement.style.setProperty("--ink", e.data.ink);
});

openGame("wheel");
