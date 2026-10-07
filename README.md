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

### 1. Add the script to the lesson spreadsheet

1. Open the lesson spreadsheet, then go to **Extensions → Apps Script**.
2. Next to **Files**, click **+ → Script** and name the new file `dashboard-api`.
3. Paste in the contents of [`apps-script/dashboard-api.gs`](apps-script/dashboard-api.gs).
4. Set the constants at the top of the file:
   - `DASHBOARD_KEY`: a long random passphrase. This is the team's access key.
   - `STUDENT_SHEET_ID`: the ID of the student availability spreadsheet. It's the part of the URL between `/d/` and `/edit`.
   - `STUDENT_TAB`: the tab name in that spreadsheet. Leave it `''` to use the first tab.
5. Click **Save**.

Leave the existing file with `doPost()` as it is. The new file adds only `doGet()`, and every other global in it starts with `dash`, so nothing collides. **One check:** search the existing file for `function doGet`. If it already has one, the two will clash, so tell me before you deploy.

### 2. Run `setupDashboardTabs` once

In the editor toolbar, choose **setupDashboardTabs** from the function menu and click **Run**.

- Google asks you to authorize the script. The script now also reads the student spreadsheet, so this is a new permission.
- The function creates the **Instructors** tab (Name, Phone, Email, Color) and the **Time Off** tab (Instructor, Start Date, End Date, Notes) if they're missing, with bold, frozen headers.
- Check **Execution log**. It lists the row count for each tab, or an error if the student spreadsheet can't be opened.

Fill in the tabs:

- **Instructors → Color** is optional. Use a hex value such as `#0e7490`. If it's blank or not a valid hex value, the dashboard picks a color for that person.
- **Time Off → End Date** can be left blank for single days. Anyone listed in Time Off who isn't on the Instructors tab still shows up on the calendar.

### 3. Redeploy without changing the URL

Your WordPress form already posts to this script's `/exec` URL, so **update the existing deployment instead of creating a new one**:

1. Click **Deploy → Manage deployments**.
2. Select the existing web app deployment and click **Edit** (the pencil icon).
3. Under **Version**, choose **New version**, then click **Deploy**.

The URL stays the same, and Ninja Forms submissions keep working. Leave the settings as they are: **Execute as: Me** and **Who has access: Anyone**. The dashboard needs "Anyone" to fetch the data, and the access key protects it.

To test, open `<your /exec URL>?key=<your key>` in a browser. You should see JSON that starts with `{"ok":true`.

### 4. Set `API_URL`

In `index.html`, paste the `/exec` URL near the top of the script:

```js
const API_URL = 'https://script.google.com/macros/s/AKfy.../exec';
```

Commit and push. The URL isn't a secret, since it's already in your website's form settings. **Never put the key in this file.**

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
- **Rotate the key whenever someone leaves the team.** Change `DASHBOARD_KEY`, then redeploy with **Manage deployments → Edit → New version**, as in step 3. Then share the new key with the team. Old keys stop working immediately, and anyone using one is sent back to the key prompt.
- Don't share the key in public channels, and never commit it to this repository.
