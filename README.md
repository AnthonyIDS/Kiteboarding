# Kiteboarding St. Petersburg: team dashboard

A private dashboard for the team. It shows lesson requests, student availability, the instructor directory and a time-off calendar.

```
Google Sheets ──► Apps Script web app (doGet, JSON) ──► index.html on GitHub Pages
```

- **Data** stays in Google Sheets. The repo holds no data and no secrets.
- **`apps-script/dashboard-api.gs`** is a reference copy of the script that serves the sheets as JSON. The live copy lives in your spreadsheet's Apps Script project.
- **`index.html`** is the whole dashboard: one static file with no build step.

To preview with sample data, open `index.html?demo`. The page also shows sample data until `API_URL` is set.

## Setup

### 1. Add the script to a spreadsheet

The script can live in its own spreadsheet (the current setup) or in the lesson spreadsheet beside the Ninja Forms `doPost()`. It only reads the lesson and student sheets, so the form keeps working either way.

1. Open the spreadsheet that should hold the **Instructors** and **Time Off** tabs, then go to **Extensions → Apps Script**.
2. Next to **Files**, click **+ → Script** and name the new file `dashboard-api`. Replace its contents with [`apps-script/dashboard-api.gs`](apps-script/dashboard-api.gs).
3. Set the constants at the top of the file. Change only these lines:
   - `DASHBOARD_KEY`: a long random passphrase using only letters, numbers and dashes. This is the team's access key.
   - `LESSON_SHEET_ID`: the ID of the spreadsheet with the **Lesson Requests** tab. It's the part of its URL between `/d/` and `/edit`. Leave it `''` if that tab is in this spreadsheet.
   - `STUDENT_SHEET_ID`: the ID of the student availability spreadsheet.
   - `STUDENT_TAB`: the tab name in that spreadsheet. Leave it `''` to use the first tab.
4. Click **Save**.

If you add the script to a project that already has code, such as the one with `doPost()`, search that code for `function doGet` first. Only one `doGet` can exist per project.

### 2. Run `setupDashboardTabs` once

In the editor toolbar, choose **setupDashboardTabs** from the function menu and click **Run**.

- Google asks you to authorize the script, including access to the lesson and student spreadsheets.
- The function creates the **Instructors** tab (Name, Phone, Email, Color) and the **Time Off** tab (Instructor, Start Date, End Date, Notes) if they're missing, with bold, frozen headers.
- Check **Execution log**. It lists the row count for each tab, or an error if a spreadsheet can't be opened.

Fill in the tabs:

- **Instructors → Color** is optional. Use a hex value such as `#0e7490`. If it's blank or not a valid hex value, the dashboard picks a color for that person.
- **Time Off → End Date** can be left blank for single days. Anyone listed in Time Off who isn't on the Instructors tab still shows up on the calendar.

### 3. Deploy

**First time (no deployment yet):** click **Deploy → New deployment**, click the gear next to **Select type** and choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then click **Deploy** and copy the **Web app URL**.

**Every change after that**, including a new key, keep the same URL:

1. Click **Deploy → Manage deployments**.
2. Select the web app deployment and click **Edit** (the pencil icon).
3. Under **Version**, choose **New version**, then click **Deploy**.

Saving alone doesn't update the live script. Each deployment is a snapshot, so you must deploy a new version. If the script shares a project with the Ninja Forms `doPost()`, always use **Edit → New version**, never **New deployment**, so the form's URL keeps working. The dashboard needs **Who has access: Anyone** to fetch the data, and the access key protects it.

To test, open `<your /exec URL>?key=<your key>` in a browser's address bar. You should see JSON that starts with `{"ok":true`.

### 4. Set `API_URL`

In `index.html`, paste the `/exec` URL near the top of the script:

```js
const API_URL = 'https://script.google.com/macros/s/AKfy.../exec';
```

Commit and push. The URL alone gives no access to any data without the key. **Never put the key in this file.**

### 5. Turn on GitHub Pages

In the repository, go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then branch **main** and folder **/ (root)**, and click **Save**. After a minute or so, the dashboard is live at `https://<your-user>.github.io/<repo>/`.

On first visit, each team member enters the access key once. The browser remembers it until they click **Lock**.

## Using the dashboard

- **KPI tiles** count requests with Status = "New", requests from the last 7 days, instructors off today (with names), and students on the availability list.
- **Lesson requests** are listed newest first. Every form field appears automatically, so new form fields show up without any changes here. Put internal notes in the **Notes** column.
- **Student availability** shows that sheet as a table. Columns can be added, removed or renamed freely. Phone and email columns turn into tap-to-call and tap-to-email links.
- **Calendar**: click a day to see who's off.
- Press **Refresh** after you edit a sheet.

## Security note

The access key only keeps casual visitors out. It is **not** strong security:

- Anyone with the key can read every lesson request and every student's contact details. The key is stored in each team member's browser.
- The page carries `noindex`, so search engines shouldn't list it. The page itself is public, though. Only the data needs the key.
- **Rotate the key whenever someone leaves the team.** Change `DASHBOARD_KEY`, then deploy a new version with **Manage deployments → Edit → New version**, as in step 3. Then share the new key with the team. Old keys stop working immediately, and anyone using one is sent back to the key prompt.
- Don't share the key in public channels, and never commit it to this repository.
