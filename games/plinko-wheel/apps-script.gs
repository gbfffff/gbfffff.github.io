// ─────────────────────────────────────────────────────────────────────────────
// Plinko / Wheel — High Score board — Google Apps Script
//
// This is its own dedicated Sheet/deployment, split out of the takeout
// app's apps-script.gs when Plinko/Wheel moved to their own games/ site --
// keeps the leaderboard independent of the order-taking app's Sheet.
//
// SETUP:
// 1. Create a new Google Sheet (or reuse one, doesn't matter).
// 2. Extensions → Apps Script → paste this entire file.
// 3. Deploy → New deployment → Web App
//    • Execute as: Me
//    • Who has access: Anyone
// 4. Copy the web app URL into config.js → APPS_SCRIPT_URL, and the
//    Sheet's ID (from its URL) into config.js → SHEET_ID.
// 5. The "PlinkoScores" tab is created automatically (with headers) on the
//    first score submission -- no manual setup needed for it.
// 6. In the Sheet → File → Share → Publish to web → "Entire Document",
//    format CSV → Publish. Note the "PlinkoScores" tab's gid (visible in
//    the URL when that tab is open) → config.js → PLINKO_SCORES_GID.
// ─────────────────────────────────────────────────────────────────────────────

const PLINKO_SCORES_SHEET = "PlinkoScores";
const PLINKO_TOP_N = 10;

function doGet(e) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const data = e.parameter;
  const now  = new Date();

  try {
    // Drop Game high score -- a 5-minute countdown round ends, the player
    // enters a 3-letter arcade-style initials, and their gold total for
    // that round gets submitted here. Only the top 10 ever survive; every
    // submission re-sorts and trims the sheet immediately rather than
    // growing forever and letting the site do the trimming client-side
    // (which would mean everyone's browser has to download and re-sort the
    // whole history just to show 10 rows).
    if (data.type === "plinkoScore") {
      const sheet = getOrCreateSheet(ss, PLINKO_SCORES_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Name", "Score"]);
      }
      const initials = String(data.name || "???").trim().toUpperCase().slice(0, 3) || "???";
      const score = Math.max(0, Math.round(Number(data.score) || 0));
      sheet.appendRow([now, initials, score]);
      trimPlinkoScores(sheet);
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Keeps only the PLINKO_TOP_N highest scores -- sorts every row (by Score,
// descending) and rewrites the sheet with just the survivors. Simple
// full-rewrite rather than surgical row deletion since this sheet is tiny
// (never more than a handful of rows above the cap between submissions).
function trimPlinkoScores(sheet) {
  if (sheet.getLastRow() <= 1) return; // header only, nothing to trim
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const rows = data.slice(1).sort((a, b) => Number(b[2]) - Number(a[2])).slice(0, PLINKO_TOP_N);
  sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), header.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
}

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
