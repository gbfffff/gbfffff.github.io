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
        sheet.appendRow(["Timestamp", "Date", "Restaurant", "Item", "Qty", "Names"]);
      }
      const items = JSON.parse(data.items || "[]");
      items.forEach(function(it) {
        sheet.appendRow([now, data.date, data.restaurant, it.name, it.qty, (it.names || []).join(", ")]);
      });
    }

    // Submitted from the "Rate Your Order" table, shown once the week's
    // History has been logged. One row per person+item rating.
    if (data.type === "rating") {
      const sheet = getOrCreateSheet(ss, RATINGS_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "Date", "Restaurant", "Item", "Name", "Rating"]);
      }
      sheet.appendRow([now, data.date, data.restaurant, data.item, data.name, data.rating]);
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
