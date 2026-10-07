/**
 * Kiteboarding St. Petersburg: team dashboard API (dashboard-api.gs)
 *
 * Add this as a SECOND file in the Apps Script project bound to the lesson
 * spreadsheet. It adds doGet() only. The existing doPost() that receives
 * Ninja Forms submissions stays as it is.
 *
 * Apps Script files share one global scope. Apart from doGet,
 * setupDashboardTabs and the three settings below, every global here starts
 * with "dash" or "DASH_" so nothing collides with the existing script.
 *
 * GET <exec url>?key=DASHBOARD_KEY returns
 *   { ok, updated, lessons, instructors, timeOff, students }
 * where each of the last four is { headers: [...], rows: [{ header: value }] }.
 */

// ---- Settings --------------------------------------------------------------

/** Shared team access key. Change it, and rotate it when someone leaves. */
const DASHBOARD_KEY = 'CHANGE-ME';

/** ID of the student availability spreadsheet (the long ID in its URL). */
const STUDENT_SHEET_ID = '';

/** Tab name in the student spreadsheet. Leave blank to use the first tab. */
const STUDENT_TAB = '';

// ---- Internals -------------------------------------------------------------

const DASH_LESSONS_TAB = 'Lesson Requests';
const DASH_INSTRUCTORS_TAB = 'Instructors';
const DASH_TIMEOFF_TAB = 'Time Off';

const DASH_TAB_HEADERS = {};
DASH_TAB_HEADERS[DASH_INSTRUCTORS_TAB] = ['Name', 'Phone', 'Email', 'Color'];
DASH_TAB_HEADERS[DASH_TIMEOFF_TAB] = ['Instructor', 'Start Date', 'End Date', 'Notes'];

function doGet(e) {
  try {
    if (!DASHBOARD_KEY || DASHBOARD_KEY === 'CHANGE-ME') {
      return dashJson_({ ok: false, error: 'DASHBOARD_KEY is not set in dashboard-api.gs' });
    }
    const key = (e && e.parameter && e.parameter.key) || '';
    if (key !== DASHBOARD_KEY) {
      return dashJson_({ ok: false, error: 'unauthorized' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone();
    const instructorsSheet = dashEnsureTab_(ss, DASH_INSTRUCTORS_TAB);
    const timeOffSheet = dashEnsureTab_(ss, DASH_TIMEOFF_TAB);

    return dashJson_({
      ok: true,
      updated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
      lessons: dashReadSheet_(ss.getSheetByName(DASH_LESSONS_TAB), tz),
      instructors: dashReadSheet_(instructorsSheet, tz),
      timeOff: dashReadSheet_(timeOffSheet, tz),
      students: dashReadStudents_()
    });
  } catch (err) {
    return dashJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

/**
 * Run once from the editor (select it in the toolbar, then Run). Creates the
 * Instructors and Time Off tabs if they're missing, and confirms the student
 * spreadsheet can be opened. The first run asks you to authorize access.
 */
function setupDashboardTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  Object.keys(DASH_TAB_HEADERS).forEach(function (name) {
    dashEnsureTab_(ss, name);
  });

  const lessons = dashReadSheet_(ss.getSheetByName(DASH_LESSONS_TAB), tz);
  const students = dashReadStudents_();
  Logger.log('Lesson Requests: %s rows', lessons.rows.length);
  Logger.log('Instructors: %s rows', dashReadSheet_(ss.getSheetByName(DASH_INSTRUCTORS_TAB), tz).rows.length);
  Logger.log('Time Off: %s rows', dashReadSheet_(ss.getSheetByName(DASH_TIMEOFF_TAB), tz).rows.length);
  Logger.log('Students: %s', students.error ? 'ERROR: ' + students.error : students.rows.length + ' rows');
  if (DASHBOARD_KEY === 'CHANGE-ME') Logger.log('Reminder: set DASHBOARD_KEY before deploying.');
}

/** Returns the named tab, creating it with bold, frozen headers if needed. */
function dashEnsureTab_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    try {
      sheet = ss.insertSheet(name);
    } catch (err) {
      // Another request may have created it a moment ago.
      sheet = ss.getSheetByName(name);
      if (!sheet) throw err;
    }
  }
  const headers = DASH_TAB_HEADERS[name];
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Reads a tab generically: the header row gives the keys, blank rows are skipped. */
function dashReadSheet_(sheet, tz) {
  const out = { headers: [], rows: [] };
  if (!sheet) return out;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return out;

  const range = sheet.getRange(1, 1, lastRow, lastCol);
  const values = range.getValues();
  const display = range.getDisplayValues();

  // Columns with a header. Duplicate headers get " (2)", " (3)", ...
  const cols = [];
  const seen = {};
  values[0].forEach(function (h, i) {
    const base = String(h).trim();
    if (!base) return;
    let name = base;
    let n = 2;
    while (seen[name]) name = base + ' (' + n++ + ')';
    seen[name] = true;
    cols.push({ index: i, name: name });
  });
  out.headers = cols.map(function (c) { return c.name; });

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const blank = cols.every(function (c) {
      const v = row[c.index];
      return v === null || v === '' || (typeof v === 'string' && v.trim() === '');
    });
    if (blank) continue;
    const obj = {};
    cols.forEach(function (c) {
      obj[c.name] = dashCell_(row[c.index], display[r][c.index], tz);
    });
    out.rows.push(obj);
  }
  return out;
}

/** Dates become yyyy-MM-dd, or yyyy-MM-ddTHH:mm:ss when the cell has a time. */
function dashCell_(value, displayValue, tz) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    const day = Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    // Time-only cells (e.g. "9:00 AM") sit on Sheets' 1899-12-30 epoch;
    // show them the way the sheet does instead of as a date.
    if (day === '1899-12-30' || day === '1899-12-29') return displayValue;
    const time = Utilities.formatDate(value, tz, 'HH:mm:ss');
    return time === '00:00:00' ? day : day + 'T' + time;
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

function dashReadStudents_() {
  if (!STUDENT_SHEET_ID) {
    return { headers: [], rows: [], error: 'STUDENT_SHEET_ID is not set in dashboard-api.gs' };
  }
  try {
    const ss = SpreadsheetApp.openById(STUDENT_SHEET_ID);
    const sheet = STUDENT_TAB ? ss.getSheetByName(STUDENT_TAB) : ss.getSheets()[0];
    if (!sheet) {
      return { headers: [], rows: [], error: 'Tab "' + STUDENT_TAB + '" was not found in the student spreadsheet' };
    }
    return dashReadSheet_(sheet, ss.getSpreadsheetTimeZone());
  } catch (err) {
    return { headers: [], rows: [], error: 'Could not open the student spreadsheet: ' + ((err && err.message) || err) };
  }
}

function dashJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
