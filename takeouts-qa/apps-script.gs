// ─────────────────────────────────────────────────────────────────────────────
// Friday Takeout — Google Apps Script
//
// SETUP:
// 1. Open your Google Sheet → Extensions → Apps Script
// 2. Paste this entire file, replacing any existing code
// 3. Click Deploy → New deployment → Web App
//    • Execute as: Me
//    • Who has access: Anyone
// 4. Copy the web app URL into config.js → APPS_SCRIPT_URL
// 5. Tabs "Orders", "Drivers", "History", "Ratings", and "Overrides" are
//    created automatically (with headers) on first write to each -- no
//    manual setup.
//
// SHEET READING (for displaying orders on the site):
// 6. In your Google Sheet → File → Share → Publish to web
//    • Choose "Entire Document" and format "Comma-separated values (.csv)"
//    • Click Publish — this lets the site read orders without an API key
// 7. Note the "gid" of the "History", "Ratings", and "Overrides" tabs
//    (visible in the URL when that tab is open) → config.js needs these as
//    HISTORY_GID/RATINGS_GID/OVERRIDES_GID
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS_SHEET    = "Orders";
const DRIVERS_SHEET   = "Drivers";
const HISTORY_SHEET   = "History";
const RATINGS_SHEET   = "Ratings";
const OVERRIDES_SHEET = "Overrides";

function doGet(e) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const data = e.parameter;
  const now  = new Date();

  try {
    if (data.type === "order") {
      const sheet = getOrCreateSheet(ss, ORDERS_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Name", "Items", "Notes"]);
      }
      sheet.appendRow([now, data.date, data.name, data.items, data.notes || ""]);
    }

    if (data.type === "driver") {
      const sheet = getOrCreateSheet(ss, DRIVERS_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Name"]);
      }
      sheet.appendRow([now, data.date, data.name]);
    }

    // Logged once per week via the "Order Complete" button -- one row per
    // individual dish ordered that week, for future per-item rating/metrics.
    if (data.type === "history") {
      const sheet = getOrCreateSheet(ss, HISTORY_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Restaurant", "Item", "Qty", "Names", "Rated", "RatedAt"]);
      }
      const items = JSON.parse(data.items || "[]");
      items.forEach(function(it) {
        sheet.appendRow([now, data.date, data.restaurant, it.name, it.qty, (it.names || []).join(", "), 0, ""]);
      });
    }

    // Submitted from the "Rate Your Order" table, shown once the week's
    // History has been logged. One row per rating -- deliberately no name
    // column, so ratings stay anonymous even to someone reading the raw
    // sheet. Who still needs to rate what is worked out client-side from
    // the History sheet's names instead.
    if (data.type === "rating") {
      const sheet = getOrCreateSheet(ss, RATINGS_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Restaurant", "Item", "Rating"]);
      }
      sheet.appendRow([now, data.date, data.restaurant, data.item, data.rating]);

      // Flip the matching History row's Rated flag so "Rate Your Order"
      // stops asking for this dish once ANYONE who ordered it has rated it.
      // History rows are already aggregated across everyone who ordered
      // that dish that week, so there's no per-person flag to set here --
      // ratings stay anonymous either way.
      markHistoryRowRated(ss, data.date, data.restaurant, data.item, now);
    }

    // Manual restaurant-rotation override (e.g. an unpredictable event
    // forces a swap). Append-only, like the other tabs -- readers should
    // take the LATEST row for a given date as the effective override, since
    // an admin re-overriding the same week just appends another row.
    if (data.type === "override") {
      const sheet = getOrCreateSheet(ss, OVERRIDES_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Restaurant", "Reason"]);
      }
      sheet.appendRow([now, data.date, data.restaurant, data.reason || ""]);
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

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// Finds the History row for this date+restaurant+item and sets its Rated
// flag to 1 and RatedAt to the given timestamp. Columns 7/8 (Rated/RatedAt)
// may not exist yet on a sheet created before this feature -- backfill the
// header in that case so the row write below lands in the right columns.
function markHistoryRowRated(ss, date, restaurant, item, now) {
  const sheet = getOrCreateSheet(ss, HISTORY_SHEET);
  if (sheet.getLastRow() === 0) return;

  const headerRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 8));
  const header = headerRange.getValues()[0];
  if (header[6] !== "Rated" || header[7] !== "RatedAt") {
    sheet.getRange(1, 7, 1, 2).setValues([["Rated", "RatedAt"]]);
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (sameDate(row[1], date) && row[2] === restaurant && row[3] === item) {
      sheet.getRange(i + 1, 7, 1, 2).setValues([[1, now]]);
      break;
    }
  }
}

// The Date column holds plain "YYYY-MM-DD" strings when written, but Sheets
// silently auto-converts text that LOOKS like a date into a real Date cell
// -- reading it back then gives a JS Date object, not the original string.
// Comparing exact strings is fragile in the other direction too: the client
// builds its date string from whatever Google's CSV export happens to
// render that same Date-typed cell as (which can be a locale format like
// "7/4/2026", not necessarily "yyyy-MM-dd"), so reformatting to one fixed
// string and comparing can still mismatch. Parse both sides down to
// year/month/day and compare those instead -- immune to which string
// format either side used.
function dateParts(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // yyyy-MM-dd (ISO)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // M/D/yyyy (US locale)
  if (m) return [Number(m[3]), Number(m[1]), Number(m[2])];
  return null;
}
function sameDate(a, b) {
  const pa = dateParts(a), pb = dateParts(b);
  if (!pa || !pb) return String(a) === String(b);
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
}
