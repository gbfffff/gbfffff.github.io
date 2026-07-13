const _cfg = window.POLLS_CONFIG || {};

const APPS_SCRIPT_URL = _cfg.APPS_SCRIPT_URL || "";
const SHEET_ID         = _cfg.SHEET_ID        || "";
const POLLS_GID        = _cfg.POLLS_GID       || "";
const VOTES_GID        = _cfg.VOTES_GID       || "";

const MOCK_MODE = !SHEET_ID || !APPS_SCRIPT_URL;
if (MOCK_MODE) console.warn("[mock] Polls running on fake local data — configure config.js to use a real Google Sheet.");

// ── Mock store (used only when no Sheet is configured, so the page is
// still usable/demo-able straight out of the box) ──
const _mockPolls = JSON.parse(localStorage.getItem("polls_mock_polls") || "[]");
const _mockVotes = JSON.parse(localStorage.getItem("polls_mock_votes") || "[]");
function saveMock() {
  localStorage.setItem("polls_mock_polls", JSON.stringify(_mockPolls));
  localStorage.setItem("polls_mock_votes", JSON.stringify(_mockVotes));
}

// Deleted-poll IDs, hidden client-side immediately on delete since the
// published CSV export can lag several seconds behind a real Sheet edit --
// without this, a just-deleted poll would still show up until the CSV
// export catches up. Persisted so it stays hidden across refreshes too.
const _deletedIds = new Set(JSON.parse(localStorage.getItem("polls_deleted_ids") || "[]"));
function markDeleted(id) {
  _deletedIds.add(id);
  localStorage.setItem("polls_deleted_ids", JSON.stringify([..._deletedIds]));
}

const els = {
  mockBanner:      document.getElementById("mock-banner"),
  createView:      document.getElementById("create-view"),
  recentView:      document.getElementById("recent-view"),
  pollView:        document.getElementById("poll-view"),
  createForm:      document.getElementById("create-form"),
  questionInput:   document.getElementById("question-input"),
  voteTypeInput:   document.getElementById("vote-type-input"),
  optionsList:     document.getElementById("options-list"),
  addOptionBtn:    document.getElementById("add-option-btn"),
  creatorInput:    document.getElementById("creator-input"),
  recentList:      document.getElementById("recent-list"),
  recentEmpty:     document.getElementById("recent-empty"),
  refreshRecentBtn:document.getElementById("refresh-recent-btn"),
  pollQuestion:    document.getElementById("poll-question"),
  pollMeta:        document.getElementById("poll-meta"),
  backBtn:         document.getElementById("back-btn"),
  voteForm:        document.getElementById("vote-form"),
  voteOptions:     document.getElementById("vote-options"),
  resultsView:     document.getElementById("results-view"),
  resultsList:     document.getElementById("results-list"),
  resultsTotal:    document.getElementById("results-total"),
  shareRow:        document.getElementById("share-row"),
  shareLinkInput:  document.getElementById("share-link-input"),
  shareBtn:        document.getElementById("share-btn"),
  closePollBtn:    document.getElementById("close-poll-btn"),
  pollNotFound:    document.getElementById("poll-not-found"),
  toast:           document.getElementById("toast"),
};

// ── utils ──

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
  return res.text();
}

function makePollId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), 2500);
}

function submitToSheet(params) {
  if (MOCK_MODE) return Promise.resolve();
  const qs = new URLSearchParams(params);
  return fetch(`${APPS_SCRIPT_URL}?${qs.toString()}`, { mode: "no-cors" });
}

// ── data access (mock-aware) ──

// Returns { id, question, options: [...], voteType, creator, timestamp, closed } for every poll,
// deduped to the latest row per PollID (rows are append-only; a later row can flip "closed").
async function loadAllPolls() {
  if (MOCK_MODE) return _mockPolls.slice();
  if (!POLLS_GID) return [];
  const csv = await fetchCSV(POLLS_GID);
  const rows = parseCSV(csv).slice(1); // Timestamp, PollID, Question, Options, VoteType, Creator, Closed
  const byId = new Map();
  rows.forEach(r => {
    const [timestamp, id, question, optionsJson, voteType, creator, closed] = r;
    if (!id) return;
    const existing = byId.get(id) || { id, question: "", options: [], voteType: "single", creator: "", timestamp, closed: false };
    if (question) existing.question = question;
    if (optionsJson) { try { existing.options = JSON.parse(optionsJson); } catch (e) {} }
    if (voteType) existing.voteType = voteType;
    if (creator) existing.creator = creator;
    if (closed === "1") existing.closed = true;
    existing.timestamp = timestamp || existing.timestamp;
    byId.set(id, existing);
  });
  return [...byId.values()].filter(p => p.question && p.options.length && !_deletedIds.has(p.id));
}

async function loadPoll(id) {
  const polls = await loadAllPolls();
  return polls.find(p => p.id === id) || null;
}

// Returns { option: count } for a poll.
async function loadVoteCounts(id) {
  let rows;
  if (MOCK_MODE) {
    rows = _mockVotes.filter(v => v.id === id).map(v => [v.timestamp, v.id, v.option, v.voter]);
  } else {
    if (!VOTES_GID) return {};
    const csv = await fetchCSV(VOTES_GID);
    rows = parseCSV(csv).slice(1).filter(r => r[1] === id); // Timestamp, PollID, Option, Voter
  }
  const counts = {};
  rows.forEach(r => { const opt = r[2]; if (opt) counts[opt] = (counts[opt] || 0) + 1; });
  return counts;
}

// ── create-poll form ──

function addOptionField(value = "") {
  const row = document.createElement("div");
  row.className = "option-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "option-input";
  input.placeholder = `Option ${els.optionsList.children.length + 1}`;
  input.value = value;
  input.maxLength = 100;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "option-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => {
    if (els.optionsList.children.length > 2) row.remove();
  });
  row.appendChild(input);
  row.appendChild(removeBtn);
  els.optionsList.appendChild(row);
}

els.addOptionBtn.addEventListener("click", () => addOptionField());

els.createForm.addEventListener("submit", async e => {
  e.preventDefault();
  const question = els.questionInput.value.trim();
  const options = [...els.optionsList.querySelectorAll(".option-input")]
    .map(i => i.value.trim())
    .filter(Boolean);
  const unique = [...new Set(options)];
  if (!question || unique.length < 2) {
    showToast("Add a question and at least two distinct options.");
    return;
  }

  const id = makePollId();
  const voteType = els.voteTypeInput.value;
  const creator = els.creatorInput.value.trim();
  const poll = { id, question, options: unique, voteType, creator, timestamp: new Date().toISOString(), closed: false };

  if (MOCK_MODE) {
    _mockPolls.push(poll);
    saveMock();
  } else {
    await submitToSheet({ type: "poll", id, question, options: JSON.stringify(unique), voteType, creator });
  }

  els.createForm.reset();
  els.optionsList.innerHTML = "";
  addOptionField();
  addOptionField();

  history.pushState({}, "", `?poll=${id}`);
  showPollView(id);
});

// ── recent polls list ──

async function renderRecent() {
  els.recentList.innerHTML = "";
  let polls;
  try {
    polls = await loadAllPolls();
  } catch (err) {
    showToast("Couldn't load recent polls.");
    return;
  }
  polls.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  els.recentEmpty.classList.toggle("hidden", polls.length > 0);
  polls.slice(0, 25).forEach(p => {
    const li = document.createElement("li");
    li.className = "recent-item";

    const main = document.createElement("div");
    main.className = "recent-item-main";
    const a = document.createElement("a");
    a.href = `?poll=${encodeURIComponent(p.id)}`;
    a.textContent = p.question;
    a.addEventListener("click", e => {
      e.preventDefault();
      history.pushState({}, "", `?poll=${p.id}`);
      showPollView(p.id);
    });
    main.appendChild(a);
    if (p.closed) {
      const badge = document.createElement("span");
      badge.className = "closed-badge";
      badge.textContent = "closed";
      main.appendChild(badge);
    }
    li.appendChild(main);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "recent-delete";
    delBtn.title = "Delete poll";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete "${p.question}"? This can't be undone.`)) return;
      delBtn.disabled = true;
      await deletePoll(p.id);
      showToast("Poll deleted.");
      renderRecent();
    });
    li.appendChild(delBtn);
    els.recentList.appendChild(li);
  });
}

async function deletePoll(id) {
  markDeleted(id);
  if (MOCK_MODE) {
    const idx = _mockPolls.findIndex(p => p.id === id);
    if (idx !== -1) _mockPolls.splice(idx, 1);
    for (let i = _mockVotes.length - 1; i >= 0; i--) {
      if (_mockVotes[i].id === id) _mockVotes.splice(i, 1);
    }
    saveMock();
  } else {
    await submitToSheet({ type: "delete", id });
  }
}

els.refreshRecentBtn.addEventListener("click", renderRecent);

// ── single poll view ──

let _currentPoll = null;
let _resultsTimer = null;

function votedKey(id) { return `poll_voted_${id}`; }

async function showPollView(id) {
  clearInterval(_resultsTimer);
  els.createView.classList.add("hidden");
  els.recentView.classList.add("hidden");
  els.pollView.classList.remove("hidden");
  els.pollNotFound.classList.add("hidden");
  els.voteForm.classList.add("hidden");
  els.resultsView.classList.add("hidden");
  els.shareRow.classList.add("hidden");
  els.pollQuestion.textContent = "Loading…";
  els.pollMeta.textContent = "";

  let poll;
  try {
    poll = await loadPoll(id);
  } catch (err) {
    poll = null;
  }

  if (!poll) {
    els.pollQuestion.textContent = "";
    els.pollNotFound.classList.remove("hidden");
    return;
  }

  _currentPoll = poll;
  els.pollQuestion.textContent = poll.question;
  const bits = [];
  if (poll.creator) bits.push(`by ${poll.creator}`);
  bits.push(poll.voteType === "multi" ? "pick any number" : "pick one");
  if (poll.closed) bits.push("closed");
  els.pollMeta.textContent = bits.join(" · ");

  const shareUrl = new URL(location.href);
  shareUrl.searchParams.set("poll", poll.id);
  els.shareLinkInput.value = shareUrl.toString();
  els.shareRow.classList.remove("hidden");

  const alreadyVoted = localStorage.getItem(votedKey(id));
  if (alreadyVoted || poll.closed) {
    await renderResults(poll);
    els.resultsView.classList.remove("hidden");
    if (!poll.closed) _resultsTimer = setInterval(() => renderResults(poll), 8000);
  } else {
    renderVoteForm(poll);
    els.voteForm.classList.remove("hidden");
  }
}

function renderVoteForm(poll) {
  els.voteOptions.innerHTML = "";
  poll.options.forEach((opt, i) => {
    const label = document.createElement("label");
    label.className = "vote-option";
    const input = document.createElement("input");
    input.type = poll.voteType === "multi" ? "checkbox" : "radio";
    input.name = "vote-option";
    input.value = opt;
    label.appendChild(input);
    const span = document.createElement("span");
    span.textContent = opt;
    label.appendChild(span);
    els.voteOptions.appendChild(label);
  });
}

els.voteForm.addEventListener("submit", async e => {
  e.preventDefault();
  const checked = [...els.voteOptions.querySelectorAll("input:checked")].map(i => i.value);
  if (!checked.length) {
    showToast("Pick at least one option.");
    return;
  }
  const poll = _currentPoll;
  const submitBtn = els.voteForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  if (MOCK_MODE) {
    checked.forEach(opt => _mockVotes.push({ id: poll.id, option: opt, voter: "", timestamp: new Date().toISOString() }));
    saveMock();
  } else {
    await Promise.all(checked.map(opt => submitToSheet({ type: "vote", id: poll.id, option: opt })));
  }

  localStorage.setItem(votedKey(poll.id), JSON.stringify(checked));
  els.voteForm.classList.add("hidden");
  await renderResults(poll);
  els.resultsView.classList.remove("hidden");
  _resultsTimer = setInterval(() => renderResults(poll), 8000);
});

async function renderResults(poll) {
  let counts;
  try {
    counts = await loadVoteCounts(poll.id);
  } catch (err) {
    counts = {};
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  els.resultsList.innerHTML = "";
  poll.options.forEach(opt => {
    const count = counts[opt] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <div class="result-label"><span>${esc(opt)}</span><span>${count} (${pct}%)</span></div>
      <div class="result-bar-track"><div class="result-bar-fill" style="width:${pct}%"></div></div>
    `;
    els.resultsList.appendChild(row);
  });
  els.resultsTotal.textContent = total === 1 ? "1 vote" : `${total} votes`;
}

els.backBtn.addEventListener("click", () => {
  clearInterval(_resultsTimer);
  history.pushState({}, "", location.pathname);
  showCreateView();
});

els.shareBtn.addEventListener("click", async () => {
  const url = els.shareLinkInput.value;
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied.");
  } catch (err) {
    els.shareLinkInput.select();
    showToast(url);
  }
});

els.closePollBtn.addEventListener("click", async () => {
  if (!_currentPoll || !confirm("Close this poll? No further votes will be accepted.")) return;
  if (MOCK_MODE) {
    const p = _mockPolls.find(p => p.id === _currentPoll.id);
    if (p) { p.closed = true; saveMock(); }
  } else {
    await submitToSheet({ type: "close", id: _currentPoll.id });
  }
  showToast("Poll closed.");
  showPollView(_currentPoll.id);
});

// ── view switching ──

function showCreateView() {
  clearInterval(_resultsTimer);
  els.pollView.classList.add("hidden");
  els.createView.classList.remove("hidden");
  els.recentView.classList.remove("hidden");
  renderRecent();
}

function init() {
  els.mockBanner.classList.toggle("hidden", !MOCK_MODE);
  addOptionField();
  addOptionField();

  const params = new URLSearchParams(location.search);
  const pollId = params.get("poll");
  if (pollId) {
    showPollView(pollId);
  } else {
    showCreateView();
  }

  window.addEventListener("popstate", () => {
    const p = new URLSearchParams(location.search).get("poll");
    if (p) showPollView(p); else showCreateView();
  });
}

init();

// ── Theme & dark mode (matches /takeouts) ──────────────────────────────
(function() {
  const SWATCH_COLORS = {
    yellow: "#fcf811", green: "#39ff14", pink: "#fc16ac", lightpink: "#ffd1e8", cyan: "#04f2d6", white: "#ffffff", offwhite: "#fafcc4", grey: "#b8c4c6"
  };
  const switcher  = document.getElementById("theme-switcher");
  const darkBtn   = document.getElementById("dark-toggle");
  const currentEl = document.getElementById("theme-current");
  const swatches  = document.querySelectorAll(".theme-swatch");
  const themeColorMeta = document.getElementById("theme-color-meta");

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
  }

  function applyDark(on) {
    document.body.classList.toggle("dark", on);
    darkBtn.textContent = on ? "☀" : "☾";
    localStorage.setItem("darkMode", on ? "1" : "0");
    syncThemeColorMeta();
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
