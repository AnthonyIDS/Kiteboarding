# Kiteboarding St. Petersburg: team dashboard

A private dashboard that shows the team the lesson requests from the website form.

```
Google Sheet ("Lesson Requests" tab) ──► Apps Script web app (JSON) ──► index.html on GitHub Pages
```

- **Data** stays in Google Sheets. The repo holds no data and no secrets.
- **`apps-script/dashboard-api.gs`** is a reference copy of the script that serves the **Lesson Requests** tab as JSON. The live copy lives in Apps Script. It only reads the sheet, so the form that writes there keeps working.
- **`index.html`** is the whole dashboard: one static file with no build step.

To preview with sample data, open `index.html?demo`.

## Setup

### 1. Add the script

1. Open the spreadsheet that holds the script (the lesson spreadsheet itself, or a separate one), then go to **Extensions → Apps Script**.
2. Next to **Files**, click **+ → Script** and name the file `dashboard-api`, or open the existing `dashboard-api` file. Replace its contents with [`apps-script/dashboard-api.gs`](apps-script/dashboard-api.gs).
3. Change only these two lines at the top:
   - `DASHBOARD_KEY`: a long random passphrase using only letters, numbers and dashes. This is the team's access key.
   - `SHEET_ID`: the ID of the spreadsheet with the **Lesson Requests** tab. It's the part of its URL between `/d/` and `/edit`. Leave it `''` if the script is attached to that spreadsheet.
4. Click **Save**.

If the project already has other code, such as the form's `doPost()`, search it for `function doGet` first. Only one `doGet` can exist per project.

### 2. Run `checkDashboard` once

In the editor toolbar, choose **checkDashboard** from the function menu and click **Run**. Approve the authorization prompt. The **Execution log** shows the spreadsheet's name and how many lesson requests it found, or an error to fix.

### 3. Deploy

**First time (no deployment yet):** click **Deploy → New deployment**, click the gear next to **Select type** and choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy** and copy the **Web app URL**.

**Every change after that**, including a new key, keep the same URL:

1. Click **Deploy → Manage deployments**.
2. Click **Edit** (the pencil icon).
3. Under **Version**, choose **New version**, then click **Deploy**.

Saving alone doesn't update the live script. Each deployment is a snapshot, so you must deploy a new version. **Who has access** must be exactly **Anyone** (not "Anyone with Google account"), or the dashboard shows "The API did not return JSON".

To test, open `<your /exec URL>?key=<your key>` in a private browser window. You should see JSON that starts with `{"ok":true`.

### 4. Set `API_URL`

In `index.html`, the `/exec` URL goes near the top of the script:

```js
const API_URL = 'https://script.google.com/macros/s/AKfy.../exec';
```

The URL alone gives no access to any data without the key. **Never put the key in this file or anywhere in this repository.**

### 5. GitHub Pages

In the repository, go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then branch **main** and folder **/ (root)**, and click **Save**. The dashboard is live at `https://anthonyids.github.io/Kiteboarding/`.

On first visit, each team member enters the access key once. The browser remembers it until they click **Lock**.

## Using the dashboard

- **Tiles** count new requests (Status = "New"), requests from the last 7 days, booked requests, and the total.
- **Lesson calendar** shows each request on the day the person asked for, using the sheet's date column (for example **Preferred Date**) and time column (for example **Preferred Time**) if there is one. Colors match the status. Click a day to see who asked for it, with their phone and email. A second-choice date column (for example **Alternate Date**) shows up too, marked "2nd". Requests with no readable date are counted under the calendar.
- **Lesson requests** are listed newest first. Every form field appears automatically, so new form fields show up without any changes here. Search, or filter by status.
- Put internal notes in the sheet's **Notes** column and update **Status** as you go (for example New → Contacted → Booked).
- Press **Refresh** to see new submissions.

## Security note

The access key only keeps casual visitors out. It is **not** strong security:

- Anyone with the key can read every lesson request, including names, phone numbers and emails. The key is stored in each team member's browser.
- The page carries `noindex`, so search engines shouldn't list it. The page itself is public, though. Only the data needs the key.
- **Rotate the key whenever someone leaves the team.** Change `DASHBOARD_KEY` in Apps Script, deploy a new version (step 3), and share the new key. Old keys stop working immediately.
- Don't share the key in public channels, and never commit it to this repository.
