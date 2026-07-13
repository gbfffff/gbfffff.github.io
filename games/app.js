// Hub shell for the games/ site. Each game (Polls, Plinko/Wheel) is a fully
// independent standalone page/app -- its own app.js, config.js, theme
// switcher, etc. -- so they're each loaded lazily into their own <iframe>
// (only when its tab is first opened) rather than injected as scripts into
// this document; the two games declare colliding top-level globals (esc,
// SHEET_ID, APPS_SCRIPT_URL, ...) since neither was written expecting to
// share a page with the other, so an iframe boundary is what keeps "loaded
// individually" from meaning "loaded, but broken."
const GAME_SRC = {
  "polls": "polls/index.html",
  "plinko-wheel": "plinko-wheel/index.html",
};

const tabs   = document.querySelectorAll(".hub-tab");
const frames = {
  "polls": document.getElementById("frame-polls"),
  "plinko-wheel": document.getElementById("frame-plinko-wheel"),
};

function openGame(key) {
  tabs.forEach(t => t.classList.toggle("active", t.dataset.game === key));
  Object.keys(frames).forEach(k => frames[k].classList.toggle("active", k === key));
  const frame = frames[key];
  if (frame && !frame.src) frame.src = GAME_SRC[key];
}

tabs.forEach(tab => tab.addEventListener("click", () => openGame(tab.dataset.game)));

openGame("polls");
