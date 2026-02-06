#!/usr/bin/env node
/**
 * Availability Checker
 * Scans all 4 calendars for the upcoming week to identify:
 * - PTO / vacation / off days
 * - Travel days (flights)
 * - Long-running meetings (>2 hours)
 * - All-day events that affect availability
 * - Conferences / multi-day events
 *
 * Usage: node availability-check.js [weeks-ahead] [json|text]
 *   weeks-ahead: 0 = this week, 1 = next week (default: 1)
 *   output: json or text (default: text)
 *
 * Pure Node.js — zero npm dependencies.
 */

const https = require('https');
const http = require('http');

const TZ = 'America/New_York';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CALENDARS = [
  { name: 'Family', url: 'https://p169-caldav.icloud.com/published/2/Mjc5ODA2NTExMjc5ODA2NTm0HKQycMPQjutsHPuwH1FUqgrfjM8DQXbGhkemJP7enEuF5jKGZOjFba8-BP0-lxhGncaYJYB2B6pLjJv3LvA' },
  { name: 'Personal', url: 'https://p169-caldav.icloud.com/published/2/Mjc5ODA2NTExMjc5ODA2NTm0HKQycMPQjutsHPuwH1GBWxl_Vku9XiUbKsshz74QAautkInohok2whfL89HPPQ0552TouFXOJKt-SI2exBk' },
  { name: 'Work', url: 'https://outlook.office365.com/owa/calendar/b71231cfcdd94878814781534989f562@alpa.org/b82c125c7e7f4f63aef6c2b2a79487243471766741358735786/calendar.ics' },
  { name: 'Gmail', url: 'https://calendar.google.com/calendar/ical/castro770%40gmail.com/public/basic.ics' },
];

// ── HTTP fetch ──────────────────────────────────────────────────────────────

function fetchUrl(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'));
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { headers: { 'User-Agent': 'OpenClaw-AvailCheck/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, depth + 1).then(resolve, reject);
      }
      if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── iCal parsing ────────────────────────────────────────────────────────────

function parseICalDate(val) {
  const match = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss] = match;
  
  // All-day events (VALUE=DATE, no time component) — use noon ET to keep the date stable
  const isAllDay = /VALUE=DATE(?![-T])/.test(val) || (!hh && !val.includes('T'));
  if (isAllDay) {
    // Noon UTC+5 offset = 17:00 UTC keeps us solidly on the right ET date
    return new Date(Date.UTC(+y, +mo - 1, +d, 17, 0, 0));
  }
  
  if (val.includes('Z')) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +(hh || 0), +(mm || 0), +(ss || 0)));
  }
  // TZID times — treat as ET wall clock, approximate with noon-safe offset
  const iso = `${y}-${mo}-${d}T${hh || '00'}:${mm || '00'}:${ss || '00'}`;
  return new Date(iso);
}

function parseRRule(str) {
  const parts = {};
  str.split(';').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  return parts;
}

function expandRecurring(ev, winStart, winEnd) {
  const out = [];
  const rr = parseRRule(ev.rrule);
  if (rr.FREQ !== 'WEEKLY' && rr.FREQ !== 'DAILY') return out;
  const step = (rr.FREQ === 'WEEKLY' ? 7 : 1) * (parseInt(rr.INTERVAL) || 1) * 86400000;
  const until = rr.UNTIL ? parseICalDate(rr.UNTIL) : null;
  const count = rr.COUNT ? parseInt(rr.COUNT) : null;
  const dur = ev.dtend - ev.dtstart;
  let dt = new Date(ev.dtstart);
  let n = 0;
  while (n < 1000) {
    if (until && dt > until) break;
    if (count && n >= count) break;
    if (dt > winEnd) break;
    const end = new Date(dt.getTime() + dur);
    if (dt >= winStart || end >= winStart) {
      out.push({ ...ev, dtstart: new Date(dt), dtend: end });
    }
    dt = new Date(dt.getTime() + step);
    n++;
  }
  return out;
}

function parseEvents(ical) {
  const events = [];
  const blocks = ical.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);
    const ev = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx);
      const val = line.substring(colonIdx + 1);
      if (key.startsWith('DTSTART')) ev.dtstartRaw = line;
      if (key.startsWith('DTEND')) ev.dtendRaw = line;
      if (key === 'SUMMARY') ev.summary = val.trim();
      if (key === 'LOCATION') ev.location = val.replace(/\\,/g, ',').replace(/\\n/g, '\n').trim();
      if (key === 'DESCRIPTION') ev.description = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();
      if (key === 'UID') ev.uid = val;
      if (key.startsWith('RRULE')) ev.rrule = val;
      if (key.startsWith('RECURRENCE-ID')) ev.recurrenceId = line;
      // Check for BUSYSTATUS
      if (key === 'X-MICROSOFT-CDO-BUSYSTATUS') ev.busyStatus = val.trim();
      if (key === 'TRANSP') ev.transp = val.trim();
    }
    if (!ev.dtstartRaw || !ev.summary) continue;
    const dtstart = parseICalDate(ev.dtstartRaw);
    const dtend = ev.dtendRaw ? parseICalDate(ev.dtendRaw) : dtstart;
    if (!dtstart) continue;
    const allDay = /VALUE=DATE(?![-T])/.test(ev.dtstartRaw) || (ev.dtstartRaw.indexOf('T') === -1 && !ev.dtstartRaw.includes('VALUE='));
    events.push({
      summary: ev.summary,
      dtstart,
      dtend: dtend || dtstart,
      location: ev.location || '',
      description: ev.description || '',
      uid: ev.uid,
      rrule: ev.rrule || null,
      recurrenceId: ev.recurrenceId || null,
      allDay,
      busyStatus: ev.busyStatus || '',
      transp: ev.transp || '',
    });
  }
  return events;
}

// ── ET date helpers ─────────────────────────────────────────────────────────

function getETDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value),
    day: parseInt(parts.find(p => p.type === 'day').value),
    weekday: parts.find(p => p.type === 'weekday').value,
  };
}

function getETDayName(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(date);
}

function fmtET(date, opts) {
  return date.toLocaleString('en-US', { timeZone: TZ, ...opts });
}

function weekMonday(date) {
  const et = getETDateParts(date);
  const dayIdx = DAY_NAMES.indexOf(et.weekday);
  const diff = (dayIdx === 0 ? -6 : 1) - dayIdx;
  const monday = new Date(date.getTime() + diff * 86400000);
  const mp = getETDateParts(monday);
  return new Date(Date.UTC(mp.year, mp.month - 1, mp.day, 12, 0, 0));
}

function weekSunday(monday) {
  const d = new Date(monday.getTime() + 6 * 86400000);
  const sp = getETDateParts(d);
  return new Date(Date.UTC(sp.year, sp.month - 1, sp.day, 23, 59, 59, 999));
}

// ── Event classification ────────────────────────────────────────────────────

const PTO_RE = /\b(PTO|vacation|off work|day off|out of office|OOO|holiday|leave)\b/i;
const TRAVEL_RE = /\b(flight|frontier|F9|travel|airport|TPA|ATL|fly)\b/i;
const CONFERENCE_RE = /\b(conference|summit|convention|retreat|offsite|training|workshop|seminar)\b/i;

function classifyEvent(ev, calName) {
  const text = `${ev.summary} ${ev.location} ${ev.description}`;
  const durationHrs = (ev.dtend - ev.dtstart) / 3600000;
  
  const result = {
    summary: ev.summary,
    calendar: calName,
    dtstart: ev.dtstart,
    dtend: ev.dtend,
    allDay: ev.allDay,
    durationHrs: Math.round(durationHrs * 10) / 10,
    dayET: getETDayName(ev.dtstart),
    timeET: ev.allDay ? 'All day' : fmtET(ev.dtstart, { hour: 'numeric', minute: '2-digit', hour12: true }),
    tags: [],
  };

  // Skip transparent/free events (holidays shown as free, etc.)
  if (ev.transp === 'TRANSPARENT' || ev.busyStatus === 'FREE') {
    return null;
  }

  // Classify
  if (PTO_RE.test(text) || (ev.allDay && /\boff\b/i.test(ev.summary))) {
    result.tags.push('pto');
  }
  if (TRAVEL_RE.test(text)) {
    result.tags.push('travel');
  }
  if (CONFERENCE_RE.test(text)) {
    result.tags.push('conference');
  }
  if (ev.allDay && durationHrs >= 24) {
    result.tags.push('all-day');
  }
  if (!ev.allDay && durationHrs >= 2) {
    result.tags.push('long-meeting');
  }
  // Multi-day events
  if (durationHrs >= 48) {
    result.tags.push('multi-day');
  }

  // Only return events that affect availability
  if (result.tags.length === 0) return null;

  // For travel/flight events: only report if they impact working hours (9 AM - 5 PM ET)
  // Include 1-hour airport buffer (leave 1h before departure, arrive 1h after landing)
  if (result.tags.includes('travel') && !ev.allDay) {
    const BUFFER_MS = 100 * 60 * 1000; // 1h40m (departure is takeoff time, doors close 20min before, boarding starts 20min before that, plus travel to airport)
    const impactStart = new Date(ev.dtstart.getTime() - BUFFER_MS); // leave for airport
    const impactEnd = new Date(ev.dtend.getTime() + BUFFER_MS);     // get from airport

    // Get the ET hours for the impact window
    const startHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(impactStart));
    const startMin = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, minute: 'numeric' }).format(impactStart));
    const endHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(impactEnd));
    const endMin = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, minute: 'numeric' }).format(impactEnd));

    const impactStartDecimal = startHour + startMin / 60;  // e.g., 14.5 = 2:30 PM
    const impactEndDecimal = endHour + endMin / 60;

    const WORK_START = 9;  // 9 AM ET
    const WORK_END = 17;   // 5 PM ET

    // Check if impact window overlaps with working hours
    const overlaps = impactStartDecimal < WORK_END && impactEndDecimal > WORK_START;
    if (!overlaps) return null;

    // Round to next half hour: e.g., 9:18 → 9:30, 2:26 → 2:00 (round down for leave), 9:03 → 9:30 (round up for avail)
    function roundUpToHalfHour(date) {
      const d = new Date(date);
      const min = d.getMinutes();
      if (min === 0 || min === 30) return d;
      if (min < 30) { d.setMinutes(30, 0, 0); }
      else { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); }
      return d;
    }
    function roundDownToHalfHour(date) {
      const d = new Date(date);
      const min = d.getMinutes();
      if (min === 0 || min === 30) return d;
      if (min < 30) { d.setMinutes(0, 0, 0); }
      else { d.setMinutes(30, 0, 0); }
      return d;
    }

    // Add context about when they need to leave / will be available
    if (impactStartDecimal >= WORK_START && impactStartDecimal < WORK_END) {
      const leaveRounded = roundDownToHalfHour(impactStart);
      const leaveTime = fmtET(leaveRounded, { hour: 'numeric', minute: '2-digit', hour12: true });
      result.workImpact = `Leave by ${leaveTime}`;
    }
    if (impactEndDecimal > WORK_START && impactEndDecimal <= WORK_END) {
      const availRounded = roundUpToHalfHour(impactEnd);
      const availTime = fmtET(availRounded, { hour: 'numeric', minute: '2-digit', hour12: true });
      result.workImpact = (result.workImpact ? result.workImpact + ', a' : 'A') + `vailable by ${availTime}`;
    }
  }

  return result;
}

// ── Dedup events across calendars ───────────────────────────────────────────

function deduplicateEvents(events) {
  const dominated = new Set();
  for (let i = 0; i < events.length; i++) {
    if (dominated.has(i)) continue;
    for (let j = i + 1; j < events.length; j++) {
      if (dominated.has(j)) continue;
      const a = events[i], b = events[j];
      if (Math.abs(a.dtstart - b.dtstart) > 30 * 60000) continue;
      const wordsA = new Set((a.summary || '').toLowerCase().match(/[a-z0-9]+/g) || []);
      const wordsB = new Set((b.summary || '').toLowerCase().match(/[a-z0-9]+/g) || []);
      const intersection = [...wordsA].filter(w => w.length > 2 && wordsB.has(w));
      const smaller = Math.min(wordsA.size, wordsB.size);
      if (smaller > 0 && intersection.length / smaller >= 0.5) {
        const aScore = (a.calendar === 'Work' ? 10 : 0) + (a.location || '').length;
        const bScore = (b.calendar === 'Work' ? 10 : 0) + (b.location || '').length;
        dominated.add(aScore >= bScore ? j : i);
      }
    }
  }
  return events.filter((_, idx) => !dominated.has(idx));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const weeksAhead = process.argv[2] !== undefined ? parseInt(process.argv[2]) : 1;
  const mode = (process.argv[3] || 'text').toLowerCase();

  const now = new Date();
  const targetMonday = new Date(weekMonday(now).getTime() + weeksAhead * 7 * 86400000);
  const targetSunday = weekSunday(targetMonday);

  // Fetch all calendars
  const feeds = await Promise.all(CALENDARS.map(c => fetchUrl(c.url).catch(() => '')));

  let availItems = [];

  for (let ci = 0; ci < CALENDARS.length; ci++) {
    if (!feeds[ci]) continue;
    const allEvents = parseEvents(feeds[ci]);

    for (const ev of allEvents) {
      if (ev.recurrenceId) continue;

      let instances = [];
      if (ev.rrule) {
        instances = expandRecurring(ev, targetMonday, targetSunday);
      } else if (ev.dtstart <= targetSunday && ev.dtend >= targetMonday) {
        instances.push(ev);
      }

      for (const inst of instances) {
        const classified = classifyEvent(inst, CALENDARS[ci].name);
        if (classified) availItems.push(classified);
      }
    }
  }

  // Dedup
  availItems = deduplicateEvents(availItems);
  availItems.sort((a, b) => a.dtstart - b.dtstart);

  // Format week label
  const mp = getETDateParts(targetMonday);
  const weekLabel = fmtET(targetMonday, { month: 'short', day: 'numeric' });

  if (mode === 'json') {
    console.log(JSON.stringify({ weekOf: weekLabel, weekStart: targetMonday.toISOString(), weekEnd: targetSunday.toISOString(), items: availItems }, null, 2));
  } else {
    if (availItems.length === 0) {
      console.log(`📅 Week of ${weekLabel}: No availability impacts — normal schedule.`);
    } else {
      console.log(`📅 Availability — Week of ${weekLabel}\n`);
      for (const item of availItems) {
        const tagIcons = {
          'pto': '🏖️',
          'travel': '✈️',
          'conference': '🎯',
          'long-meeting': '📋',
          'all-day': '📌',
          'multi-day': '🗓️',
        };
        const icon = tagIcons[item.tags[0]] || '📌';
        const dayStr = DAY_SHORT[DAY_NAMES.indexOf(item.dayET)];
        const timeStr = item.allDay ? 'All day' : `${item.timeET} (${item.durationHrs}h)`;
        const workNote = item.workImpact ? ` (${item.workImpact})` : '';
        // For multi-day or all-day events spanning multiple days, show date range
        let dateRange = '';
        if (item.allDay && item.durationHrs >= 24) {
          const startLabel = fmtET(item.dtstart, { month: 'short', day: 'numeric' });
          // DTEND for VALUE=DATE is exclusive (day after last day), so subtract 1 day
          const endDate = new Date(item.dtend.getTime() - 86400000);
          const endLabel = fmtET(endDate, { month: 'short', day: 'numeric' });
          const endDay = DAY_SHORT[DAY_NAMES.indexOf(getETDayName(endDate))];
          if (startLabel !== endLabel) {
            dateRange = ` (${dayStr} ${startLabel} – ${endDay} ${endLabel})`;
          }
        }
        console.log(`${icon} ${dayStr}: ${item.summary} — ${timeStr}${dateRange}${workNote}`);
        if (item.tags.includes('travel') && item.location) {
          console.log(`   📍 ${item.location.split('\n')[0]}`);
        }
      }
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
