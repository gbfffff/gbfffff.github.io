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
// 5. Make sure your sheet has two tabs named "Orders" and "Drivers"
//    (the script will create headers automatically on first write)
//
// SHEET READING (for displaying orders on the site):
// 6. In your Google Sheet → File → Share → Publish to web
//    • Choose "Entire Document" and format "Comma-separated values (.csv)"
//    • Click Publish — this lets the site read orders without an API key
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS_SHEET  = "Orders";
const DRIVERS_SHEET = "Drivers";

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
