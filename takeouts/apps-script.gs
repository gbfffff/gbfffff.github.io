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
      // stops asking for this specific person for this dish. History rows
      // are per-orderer (one row per person per item, not aggregated), so
      // the match has to include the name -- data.raterName is only used
      // to find the right row here, and is never written to the Ratings
      // sheet itself, so ratings stay anonymous there either way.
      markHistoryRowRated(ss, data.date, data.restaurant, data.item, data.raterName, now);
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

// Finds the History row for this date+restaurant+item+person and records
// that THIS person has rated it. Rated (column 7) is a comma-joined list
// of who has rated the row so far, NOT a single 1/0 flag -- a row can
// represent multiple co-orderers of the same shared/combined item (see
// the Names column, which is itself comma-joined), and each of them needs
// to be tracked independently. Setting a bare 1 here used to mark the row
// "done" for every name on it the instant the FIRST co-orderer rated it,
// silently suppressing the rating prompt for everyone else who ordered
// the same item. The match MUST include the rater's name, or it can flip
// a completely different person's row instead of theirs.
// Columns 7/8 (Rated/RatedAt) may not exist yet on a sheet created before
// this feature -- backfill the header in that case so the row write below
// lands in the right columns.
function markHistoryRowRated(ss, date, restaurant, item, raterName, now) {
  const sheet = getOrCreateSheet(ss, HISTORY_SHEET);
  if (sheet.getLastRow() === 0) return;

  const headerRange = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 8));
  const header = headerRange.getValues()[0];
  if (header[6] !== "Rated" || header[7] !== "RatedAt") {
    sheet.getRange(1, 7, 1, 2).setValues([["Rated", "RatedAt"]]);
  }

  // The client trims restaurant/item before echoing them back on submit
  // (getPendingRatings builds its keys with .trim()), but the raw sheet
  // cell can carry incidental whitespace (e.g. the restaurant name is
  // originally written from a DOM badge's textContent) -- trim both sides
  // so that whitespace alone can't make an otherwise-correct match fail.
  const wantRestaurant = String(restaurant).trim();
  const wantItem = String(item).trim();
  const wantNameTrimmed = String(raterName || "").trim();
  const wantName = wantNameTrimmed.toLowerCase();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Names column: one name per row on legacy data, but tolerate a
    // comma-joined list too in case a row ever aggregates multiple people.
    const names = String(row[5] || "").split(",").map(n => n.trim().toLowerCase());
    if (sameDate(row[1], date) &&
        String(row[2]).trim() === wantRestaurant &&
        String(row[3]).trim() === wantItem &&
        names.includes(wantName)) {
      // Legacy rows may already have a bare "1" from before this change --
      // treat that as "no per-name record", starting the list fresh with
      // just this rater rather than trying to interpret it as a name.
      const existingRaw = String(row[6] || "").trim();
      const alreadyRated = existingRaw && existingRaw !== "1"
        ? existingRaw.split(",").map(n => n.trim())
        : [];
      if (!alreadyRated.some(n => n.toLowerCase() === wantName)) {
        alreadyRated.push(wantNameTrimmed);
      }
      sheet.getRange(i + 1, 7, 1, 2).setValues([[alreadyRated.join(", "), now]]);
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
