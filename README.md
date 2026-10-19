# Kiteboarding St. Petersburg: team dashboard

A private dashboard that shows the team the lesson requests from the website form.

```
Google Sheet ("Lesson Requests" tab) ──► Apps Script web app (JSON) ──► index.html on GitHub Pages
```

- **Data** stays in Google Sheets. The repo holds no data and no secrets.
- **`apps-script/dashboard-api.gs`** is a reference copy of the script that serves the **Lesson Requests** tab as JSON. The live copy lives in Apps Script. It never changes the **Lesson Requests** tab, so the form that writes there keeps working. Team notes and **Jetski Needed** are saved on their own tab, **Dashboard Notes**, which the script creates the first time someone saves.
- **`index.html`** is the whole dashboard: one static file with no build step.
- **`marketing.html`** is the marketing dashboard (see [Marketing dashboard](#marketing-dashboard)). It has its own script, [`apps-script/marketing-api.gs`](apps-script/marketing-api.gs), which lives in the marketing spreadsheet, with its own web app URL and access key.

To preview with sample data, open `index.html?demo` or `marketing.html?demo`.

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
- **Google Calendar (optional)**: to show your instructors' Google Calendars instead of the built-in lesson calendar, open Google Calendar on a computer and click the **gear → Settings**. In the left-hand list, scroll down to **Settings for my calendars**, click the calendar's name, then **Integrate calendar**, and copy the **Calendar ID**. Paste it between the quotes next to the instructor's name in `GOOGLE_CALENDARS` near the top of the script in `index.html`. Each calendar shows in that instructor's color. Team members see the events if each calendar is shared with their Google account and they're signed in to Google. Don't make the calendars public if they hold student names. If every ID is blank, the built-in calendar shows instead.
- **Lesson calendar** shows each request on the day the person asked for, using the sheet's date column (for example **Preferred Date**) and time column (for example **Preferred Time**) if there is one. Colors match the status. Click a day to see who asked for it, with their phone and email. A second-choice date column (for example **Alternate Date**) shows up too, marked "2nd".
- **Weekly availability**: if the sheet has an availability column (for example **Availability** or **Preferred Days**), anyone who wrote a weekday there shows up in teal, with their name and phone number, on every matching day from today on. It understands things like "Monday", "Tues & Thurs", "Mon-Fri", "Weekends" and "Any day". Cancelled and completed requests are left off. Requests with no readable date or weekday are counted under the calendar.
- **Student availability** groups open requests into **Flexible**, **Weekends** and **Weekdays** using the availability column. "Flexible", "Any day" and every-day answers go under Flexible. Someone free on both a weekday and a weekend day appears in both lists.
- **Instructor's clients** (under Student availability): pick an instructor from the dropdown to see all of their students, with status, availability, phone, email and their next lesson booked from the dashboard. Current students come first, then cancelled or completed ones in gray. **No instructor yet** lists students who still need one. The browser remembers your last choice.
- **Instructor colors**: if the sheet has an **Instructor** column, each student is colored by their instructor on the calendar, in the availability lists and on the request cards. Brad is green, Anthony is blue and Nate is purple. Other instructors get the next free color automatically. To change a color, edit `INSTRUCTOR_COLORS` near the top of the script in `index.html` (choices: green, blue, purple, orange, pink, teal). Students with no instructor yet are gray.
- **Lesson requests** are listed newest first. Every form field appears automatically, so new form fields show up without any changes here. Search, or filter by status.
- **Jetski Needed and team notes**: every request card has a **Jetski Needed** No/Yes switch and a box to leave a note for the team. Type your name once next to **Add note**; the browser remembers it. When Jetski Needed is Yes, an orange **Jetski needed** badge shows on the card, in the calendar's day list and in the student availability lists, for everyone. Notes show newest first with who wrote them and when. Others see a change after they press **Refresh**. Everything is stored on the **Dashboard Notes** tab (one row per student), so you can read it in the sheet too. Don't rename that tab or its **Request ID** column, or the notes stop matching their students.
- **Add to calendar**: every open request card has an **Add to calendar** button. Pick the instructor, date, start time and length, then click **Add to calendar**. The lesson goes on that instructor's Google Calendar as "Kite lesson: (student)", with the student's phone, email and lesson type in the description, and a note saying who booked it is added to the card. Lessons added this way appear under **Upcoming lessons**, where **Edit** changes the date, time, length or instructor, and **Delete** removes the lesson after you confirm. Each change is noted on the student's card. Only lessons added from the dashboard can be changed there; anything else on the calendars is changed in Google Calendar itself. The calendars are listed in `DASH_CALENDARS` in `dashboard-api.gs`. The account that deploys the script needs **Make changes to events** access to each one: the instructor opens their calendar's settings, goes to **Share with specific people**, adds that account and picks **Make changes to events**. Running **checkDashboard** shows whether each calendar can be reached.
- You can still put notes in the sheet's own **Notes** column and update **Status** as you go (for example New → Contacted → Booked).
- Press **Refresh** to see new submissions.

## Marketing dashboard

`marketing.html` is laid out the way a marketing agency would report, top to bottom. It's live at `https://anthonyids.github.io/Kiteboarding/marketing.html`, and the **Marketing** button on the team dashboard opens it. Pick a month at the top; every section follows it.

1. **Scorecard** ("Are we on track this month?"): Leads, Booked lessons, Conversion rate, Revenue and Cost per booking, each compared with the month before, with a progress bar toward the month's goal.
2. **Funnel** ("Where do we lose people?"): Impressions → Website visits → Leads → Bookings, with the share that made it from each step.
3. **Channels** ("What's working?"): each channel's bookings (or leads, revenue, spend), plus spend and cost per booking by channel.
4. **Content calendar** ("What's due and is it done?"): every post with a **Completed** No/Yes switch, like **Jetski Needed** on the team dashboard. Overdue and due-soon posts are flagged; **To do** shows what's left, and a category filter narrows the list.
5. **Content categories** ("Is the mix balanced, and what's next?"): one card per category (Learn to Kite, Gear Reviews, Spots & Conditions, ...) with its published and planned counts, its next date, and its idea bank. A bar shows each category's share of posts, and a category with nothing planned is flagged.
6. **Reputation and reach** ("Is the brand growing?"): followers, Google reviews, rating, calls and profile views, with the change from last month.
7. **Season trend** ("How does this year compare?"): each month this year next to the same month last year.

It reads three tabs of the marketing spreadsheet and never changes them:

| Tab | One row per | Columns it understands |
| --- | --- | --- |
| **Monthly Numbers** | month (and channel) | Month (or Date), Channel, Spend, Impressions, Website Visits, Leads, Bookings, Revenue, Followers, Google Reviews, Rating, Calls, Profile Views |
| **Content Calendar** | post or idea | Publish Date (or Due), Title, Platform, Owner, Status, Link, Category. Rows with Status `Idea` go to their category's idea bank instead of the calendar. |
| **Goals** (optional) | month | Month, Leads Goal, Bookings Goal, Revenue Goal |

Column names don't have to match exactly ("Website Sessions" counts as visits, "Lessons Booked" as bookings), any column can be missing, and its section simply hides. Other number columns still show up in the charts. The tab names are set at the top of `marketing-api.gs`.

The **Completed** switches are saved on their own tab, **Marketing Completed**, in the marketing spreadsheet. The script creates it the first time someone flips a switch. A post whose **Status** says Published, Posted or Done counts as completed until someone flips its switch.

### Set up the marketing script

The marketing script is attached to the marketing spreadsheet, separate from the team dashboard's script.

1. Open the **2025/ 26 KSP - Marketing** spreadsheet and click **Extensions → Apps Script**.
2. Open the script file on the left. Select everything (**Ctrl+A**, or **Cmd+A** on a Mac) and delete it.
3. Open [`apps-script/marketing-api.gs`](apps-script/marketing-api.gs) on GitHub, click **Copy raw file** (two overlapping squares), and paste it into the empty file.
4. Near the top, type your marketing access key between the quotes in `const MARKETING_KEY = '';`. Use only letters, numbers and dashes. Leave `MARKETING_SHEET_ID` as `''`.
5. Check the three tab names under it (`ANALYTICS_TAB`, `CONTENT_TAB`, `GOALS_TAB`) match the tabs at the bottom of your sheet, then click **Save**.
6. Pick **checkMarketing** in the toolbar and click **Run**. Allow access if Google asks. The **Execution log** lists each tab with the columns it found.
7. Click **Deploy → Manage deployments**, click the pencil (**Edit**), set **Version** to **New version**, and click **Deploy**. The web app URL stays the same.
8. Open the marketing page, type the marketing key, and press **Refresh**.

The page remembers the marketing key separately from the team key, so each page asks for its own.

## Updating the script (after a change to `dashboard-api.gs`)

1. Open [`apps-script/dashboard-api.gs`](apps-script/dashboard-api.gs) on GitHub and click the **Copy raw file** button (two overlapping squares, top right of the code).
2. In your spreadsheet, go to **Extensions → Apps Script** and open the `dashboard-api` file.
3. Before replacing anything, copy your two settings lines, `DASHBOARD_KEY` and `SHEET_ID`, somewhere safe (a note on your phone is fine).
4. Select everything in the file (**Ctrl+A**, or **Cmd+A** on a Mac), then paste (**Ctrl+V** / **Cmd+V**).
5. Put your `DASHBOARD_KEY` and `SHEET_ID` values back in those two lines, then click **Save**.
6. Choose **checkDashboard** in the toolbar and click **Run**. If Google asks for permission again, approve it. Adding lessons asks for permission to manage your calendars the first time.
7. Click **Deploy → Manage deployments → Edit** (pencil), set **Version** to **New version**, and click **Deploy**. The URL stays the same.
8. Open the dashboard and press **Refresh**.

## Security note

The access key only keeps casual visitors out. It is **not** strong security:

- Anyone with the key can read every lesson request, including names, phone numbers and emails, and can add team notes, change Jetski Needed and add lessons to the instructors' calendars. The key is stored in each team member's browser.
- The page carries `noindex`, so search engines shouldn't list it. The page itself is public, though. Only the data needs the key.
- **Rotate the key whenever someone leaves the team.** Change `DASHBOARD_KEY` in Apps Script, deploy a new version (step 3), and share the new key. Old keys stop working immediately.
- Don't share the key in public channels, and never commit it to this repository.
- The marketing page has its own key (`MARKETING_KEY` in `marketing-api.gs`). Anyone with it can read the marketing tabs and flip the Completed switches, nothing else.
