# gbfffff.github.io

# gbfffff.github.io/polls
Create a poll on the fly (question + options, single- or multi-select), share the link, and watch results update live. No login and no build step — polls and votes are stored in a Google Sheet via an Apps Script web app, read back as published CSV, same pattern as `/takeouts`.

Without a configured Sheet the page runs in a local demo (mock) mode using `localStorage`, so it's usable out of the box.

**Setup:**
1. Create a Google Sheet, then Extensions → Apps Script, paste in `polls/apps-script.gs`, and deploy as a Web App (Execute as: Me, Who has access: Anyone).
2. File → Share → Publish to web → Entire Document → CSV.
3. Fill in `polls/config.js` with `APPS_SCRIPT_URL`, `SHEET_ID`, and the `POLLS_GID` / `VOTES_GID` tab IDs (created automatically on first write).

A vote is remembered per browser (`localStorage`) so results show immediately after voting instead of the form; there's no server-side authentication, so treat it as a casual/team tool rather than tamper-proof voting.

# gbfffff.github.io/takeouts
Rotation order stores in restaurants.json
Default schedule on Fridays only and rotate 1 by 1. 

# Place your order
Countdown clock does not close ordering function, but button would change to warn user the order submitted is late and there is no guarantee the order will be included. A confirmation message will pop and a submit anyway button will need to be pressed. 

# Worksheet & Order Closure
Handler of the week makes the order, and will press order complete button which stores the final order in the sheet history tab. That will make changing or deleting the order from worksheet not possible. The place your order page will be restricting order so late users will know they are too late. 

# History
The order history of the night will stay until the following monday at 6am. The historical orders by date will be stored under the restaurant rotation and data page and will be available to look at. 

# Restaurant rotation override
In the case of unpredictable events and we must use certain restaurant other than the one that is on rotation schedule, a button under the calendar can be used to do that. Once that's done, the 

# Rate Your Order
Once Worksheet is complete, names will be listed on the table under rate your order, and your dish will show up and you will be able to rate and submit. Once submitted, it will disappear. Data will only be seen in the rotation and data restaurant page. It is shown in the combined order, price, and ratings of the week's orders. 
