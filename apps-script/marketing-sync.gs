/**
 * Kiteboarding St. Petersburg: YouTube and website numbers (marketing-sync.gs)
 *
 * A second file in the marketing spreadsheet's Apps Script project, next to
 * marketing-api.gs. Once a day it copies monthly numbers from YouTube and
 * from Google Analytics (the website, via Site Kit) into the "Monthly
 * Numbers" tab, one row per month for the channels "YouTube" and "Website".
 * The marketing dashboard then shows them like any other row.
 *
 * It only fills its own cells: the Month and Channel of its rows, and
 *   YouTube: Video Views, Watch Hours, Followers (subscribers)
 *   Website: Website Visits (sessions), Website Users
 * Rows for other channels, and any other columns, are left alone.
 *
 * Setup: add the four services listed below (Services +), then run
 * setupAutoSync once. Everything here starts with "sync" or "SYNC_".
 */

// ---- Settings --------------------------------------------------------------

/**
 * Google Analytics 4 property ID: the number under Admin → Property details.
 * Leave blank to find it automatically when your Google account has one
 * property (or one with "kite" in its name).
 */
const SYNC_GA4_PROPERTY_ID = '';

/** How many months back to fill, including this one (24 = this season and last). */
const SYNC_MONTHS = 24;

// Needs these services (Services + in the editor), with their default names:
//   YouTube Data API v3 (YouTube), YouTube Analytics API (YouTubeAnalytics),
//   Google Analytics Data API (AnalyticsData), Google Analytics Admin API (AnalyticsAdmin)

// ---- Internals -------------------------------------------------------------

const SYNC_TAB = 'Monthly Numbers';
const SYNC_HOUR = 6; // daily run, around 6 am in the spreadsheet's time zone

/** Run once: syncs now and then every morning. Running it again is harmless. */
function setupAutoSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAnalytics') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAnalytics').timeBased().everyDays(1).atHour(SYNC_HOUR).create();
  Logger.log('Daily sync is on. Running it now...');
  syncAnalytics();
}

/** Copies YouTube and website numbers into the Monthly Numbers tab. */
function syncAnalytics() {
  const ss = mktSpreadsheet_();
  const tz = ss.getSpreadsheetTimeZone();
  const months = syncMonthList_(tz);
  const out = [];
  [['YouTube', syncYouTube_], ['Website', syncWebsite_]].forEach(function (src) {
    try {
      const rows = src[1](months, tz);
      out.push.apply(out, rows);
      Logger.log(src[0] + ': ' + rows.length + ' months.');
    } catch (err) {
      Logger.log(src[0] + ': skipped. ' + String((err && err.message) || err));
    }
  });
  if (!out.length) return;
  const n = syncWrite_(ss, tz, out);
  Logger.log('Updated ' + n.updated + ' rows and added ' + n.added + ' in "' + SYNC_TAB + '".');
}

/** [{ key: 'yyyy-MM', start: 'yyyy-MM-dd', end: 'yyyy-MM-dd', full: bool }], oldest first; the current month ends today. */
function syncMonthList_(tz) {
  const today = new Date();
  const y = +Utilities.formatDate(today, tz, 'yyyy');
  const m = +Utilities.formatDate(today, tz, 'MM') - 1;
  const list = [];
  for (let i = SYNC_MONTHS - 1; i >= 0; i--) {
    const first = new Date(y, m - i, 1);
    const last = new Date(y, m - i + 1, 0);
    list.push({
      key: Utilities.formatDate(first, tz, 'yyyy-MM'),
      start: Utilities.formatDate(first, tz, 'yyyy-MM-dd'),
      end: Utilities.formatDate(i === 0 ? today : last, tz, 'yyyy-MM-dd'),
      full: i > 0
    });
  }
  return list;
}

// ---- YouTube ---------------------------------------------------------------

function syncYouTube_(months) {
  if (typeof YouTube === 'undefined' || typeof YouTubeAnalytics === 'undefined') {
    throw new Error('Add the "YouTube Data API v3" and "YouTube Analytics API" services.');
  }
  const ch = (YouTube.Channels.list('statistics', { mine: true }).items || [])[0];
  if (!ch) throw new Error('No YouTube channel on this Google account.');
  const subsNow = +ch.statistics.subscriberCount || 0;

  // One report per month. (The API's "month" dimension is strict about date
  // ranges, so plain per-month totals are simpler and work for this month too.)
  const metrics = 'views,estimatedMinutesWatched,subscribersGained,subscribersLost';
  const byKey = {};
  months.forEach(function (mo) {
    const r = YouTubeAnalytics.Reports.query({ ids: 'channel==MINE', startDate: mo.start, endDate: mo.end, metrics: metrics });
    if (r.rows && r.rows[0]) byKey[mo.key] = r.rows[0];
  });

  // Subscribers at each month's end: today's count minus what came in after.
  let subs = subsNow;
  const out = [];
  for (let i = months.length - 1; i >= 0; i--) {
    const v = byKey[months[i].key];
    if (v) {
      out.push({ month: months[i].key, channel: 'YouTube', values: {
        'Video Views': +v[0] || 0,
        'Watch Hours': Math.round((+v[1] || 0) / 6) / 10,
        'Followers': Math.max(0, subs)
      } });
      subs -= (+v[2] || 0) - (+v[3] || 0);
    }
  }
  return syncTrimEmpty_(out.reverse(), 'Video Views');
}

// ---- Website (Google Analytics 4) -----------------------------------------

function syncWebsite_(months) {
  if (typeof AnalyticsData === 'undefined') throw new Error('Add the "Google Analytics Data API" service.');
  const id = syncGa4Property_();
  const r = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: months[0].start, endDate: months[months.length - 1].end }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }]
  }, 'properties/' + id);
  const byKey = {};
  (r.rows || []).forEach(function (row) {
    const ym = row.dimensionValues[0].value; // yyyyMM
    byKey[ym.slice(0, 4) + '-' + ym.slice(4)] = row.metricValues.map(function (x) { return +x.value || 0; });
  });
  const out = months.filter(function (mo) { return byKey[mo.key]; }).map(function (mo) {
    const v = byKey[mo.key];
    return { month: mo.key, channel: 'Website', values: { 'Website Visits': v[0], 'Website Users': v[1] } };
  });
  return syncTrimEmpty_(out, 'Website Visits');
}

function syncGa4Property_() {
  const set = String(SYNC_GA4_PROPERTY_ID).replace(/\D/g, '');
  if (set) return set;
  if (typeof AnalyticsAdmin === 'undefined') {
    throw new Error('Add the "Google Analytics Admin API" service, or set SYNC_GA4_PROPERTY_ID.');
  }
  const props = [];
  let page;
  do {
    const r = AnalyticsAdmin.AccountSummaries.list({ pageSize: 200, pageToken: page });
    (r.accountSummaries || []).forEach(function (a) {
      (a.propertySummaries || []).forEach(function (p) {
        props.push({ id: String(p.property).replace('properties/', ''), name: p.displayName || '' });
      });
    });
    page = r.nextPageToken;
  } while (page);
  const kite = props.filter(function (p) { return /kite/i.test(p.name); });
  const pick = props.length === 1 ? props[0] : kite.length === 1 ? kite[0] : null;
  if (pick) return pick.id;
  throw new Error(props.length
    ? 'Several Analytics properties. Put the right number in SYNC_GA4_PROPERTY_ID: ' +
      props.map(function (p) { return p.name + ' = ' + p.id; }).join(', ')
    : 'No Google Analytics property on this Google account.');
}

/** Drops leading months with no data, so a newer channel doesn't show zeros before it existed. */
function syncTrimEmpty_(rows, col) {
  let i = 0;
  while (i < rows.length && !rows[i].values[col]) i++;
  return rows.slice(i);
}

// ---- Writing ---------------------------------------------------------------

function syncWrite_(ss, tz, rows) {
  const sheet = ss.getSheetByName(SYNC_TAB);
  if (!sheet) throw new Error('No "' + SYNC_TAB + '" tab. Add it with a Month and a Channel column.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function (h) { return String(h).trim(); });
    const col = function (name) {
      const i = headers.findIndex(function (h) { return h.toLowerCase() === name.toLowerCase(); });
      return i >= 0 ? i : -1;
    };
    // Add any missing column at the end.
    const need = ['Month', 'Channel'];
    rows.forEach(function (r) { Object.keys(r.values).forEach(function (k) { if (need.indexOf(k) < 0) need.push(k); }); });
    need.forEach(function (name) {
      if (col(name) < 0) {
        headers.push(name);
        sheet.getRange(1, headers.length).setValue(name).setFontWeight('bold');
      }
    });
    const mCol = col('Month'), cCol = col('Channel');

    // Existing rows by month + channel.
    const lastRow = sheet.getLastRow();
    const data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    const at = {};
    data.forEach(function (r, i) {
      const k = syncMonthKey_(r[mCol], tz);
      const c = String(r[cCol] || '').trim().toLowerCase();
      if (k && c) at[k + '|' + c] = i;
    });

    let updated = 0;
    const added = [];
    rows.forEach(function (r) {
      const i = at[r.month + '|' + r.channel.toLowerCase()];
      if (i != null) {
        Object.keys(r.values).forEach(function (k) { data[i][col(k)] = r.values[k]; });
        updated++;
      } else {
        const row = headers.map(function () { return ''; });
        row[mCol] = new Date(+r.month.slice(0, 4), +r.month.slice(5) - 1, 1);
        row[cCol] = r.channel;
        Object.keys(r.values).forEach(function (k) { row[col(k)] = r.values[k]; });
        added.push(row);
      }
    });
    if (data.length) {
      // Write back only the synced columns, so formulas in other columns stay.
      need.slice(2).forEach(function (name) {
        const c = col(name);
        sheet.getRange(2, c + 1, data.length, 1).setValues(data.map(function (r) { return [r[c]]; }));
      });
    }
    if (added.length) {
      const start = lastRow + 1;
      sheet.getRange(start, 1, added.length, headers.length).setValues(added);
      sheet.getRange(start, mCol + 1, added.length, 1).setNumberFormat('mmm yyyy');
    }
    return { updated: updated, added: added.length };
  } finally {
    lock.releaseLock();
  }
}

/** 'yyyy-MM' from a date cell, or from text like "Oct 2026", "10/2026", "2026-10". */
function syncMonthKey_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM');
  }
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = s.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/);
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  if (m) {
    const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase());
    if (i >= 0) return m[2] + '-' + ('0' + (i + 1)).slice(-2);
  }
  return '';
}
