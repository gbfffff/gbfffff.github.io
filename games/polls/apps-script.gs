// ─────────────────────────────────────────────────────────────────────────────
// Polls — Google Apps Script
//
// SETUP:
// 1. Open your Google Sheet → Extensions → Apps Script
// 2. Paste this entire file, replacing any existing code
// 3. Click Deploy → New deployment → Web App
//    • Execute as: Me
//    • Who has access: Anyone
// 4. Copy the web app URL into config.js → APPS_SCRIPT_URL
// 5. Tabs "Polls" and "Votes" are created automatically (with headers) on
//    first write to each -- no manual setup.
//
// SHEET READING (for displaying polls/results on the site):
// 6. In your Google Sheet → File → Share → Publish to web
//    • Choose "Entire Document" and format "Comma-separated values (.csv)"
//    • Click Publish — this lets the site read polls/votes without an API key
// 7. Note the "gid" of the "Polls" and "Votes" tabs (visible in the URL when
//    that tab is open) → config.js needs these as POLLS_GID / VOTES_GID
// ─────────────────────────────────────────────────────────────────────────────

const POLLS_SHEET = "Polls";
const VOTES_SHEET = "Votes";

function doGet(e) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const data = e.parameter;
  const now  = new Date();

  try {
    // Creates a new poll. Options is a JSON array of option labels.
    // Type is "single" or "multi" (whether voters can pick more than one option).
    if (data.type === "poll") {
      const sheet = getOrCreateSheet(ss, POLLS_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "PollID", "Question", "Options", "VoteType", "Creator", "Closed"]);
      }
      sheet.appendRow([now, data.id, data.question, data.options, data.voteType || "single", data.creator || "", ""]);
    }

    // Records a single vote: one row per (voter, option) pair, so a "multi"
    // poll vote is submitted as several calls, one per selected option.
    if (data.type === "vote") {
      const sheet = getOrCreateSheet(ss, VOTES_SHEET);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["Timestamp", "PollID", "Option", "Voter"]);
      }
      sheet.appendRow([now, data.id, data.option, data.voter || ""]);
    }

    // Marks a poll closed so it stops accepting votes. Append-only like the
    // other tabs -- readers should take the LATEST "Closed" value for a given
    // PollID as authoritative.
    if (data.type === "close") {
      const sheet = getOrCreateSheet(ss, POLLS_SHEET);
      sheet.appendRow([now, data.id, "", "", "", "", "1"]);
    }

    // Permanently removes a poll: deletes every row for this PollID from both
    // Polls and Votes (unlike the other actions, this actually removes rows
    // rather than appending, since "deleted" should mean gone for good).
    if (data.type === "delete") {
      deleteRowsByPollId(getOrCreateSheet(ss, POLLS_SHEET), data.id, 1);
      deleteRowsByPollId(getOrCreateSheet(ss, VOTES_SHEET), data.id, 1);
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

// Deletes every row whose column `pollIdCol` (1-indexed) matches pollId.
// Walks bottom-to-top so deleting a row doesn't shift the index of rows not
// yet visited.
function deleteRowsByPollId(sheet, pollId, pollIdCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const ids = sheet.getRange(2, pollIdCol, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(pollId)) {
      sheet.deleteRow(i + 2);
    }
  }
}
