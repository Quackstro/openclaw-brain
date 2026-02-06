#!/usr/bin/env node
/**
 * Frontier Flight Planner — Phase 1
 * 
 * Fetches 3 iCal calendars, extracts booked Frontier flights, detects
 * the expected Tuesday-out / Thursday-return pattern per week, and reports
 * booking gaps across an 8-week lookahead window.
 *
 * Usage: node flight-planner.js [json|text]
 *   text (default): human-readable emoji report
 *   json:           structured JSON array
 *
 * Pure Node.js — zero npm dependencies.
 */

const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────

const CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')
);

const TZ = 'America/New_York';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── HTTP fetch (follows redirects, supports http + https) ───────────────────

function fetchUrl(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'));
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { headers: { 'User-Agent': 'OpenClaw-FlightPlanner/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, depth + 1).then(resolve, reject);
      }
      if (res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── iCal parsing (reused from calendar-monitor-reference.js) ────────────────

function parseICalDate(val) {
  const match = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss] = match;

  // All-day events (VALUE=DATE, no time component) — use noon+5h UTC to keep date stable in ET
  const isAllDay = /VALUE=DATE(?![-T])/.test(val) || (!hh && !val.includes('T'));
  if (isAllDay) {
    return new Date(Date.UTC(+y, +mo - 1, +d, 17, 0, 0));
  }

  if (val.includes('Z')) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +(hh || 0), +(mm || 0), +(ss || 0)));
  }

  // Treat as Eastern Time wall-clock (good enough for display & comparison)
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
      out.push({
        summary: ev.summary,
        dtstart: new Date(dt),
        dtend: end,
        location: ev.location,
        description: ev.description,
        allDay: ev.allDay,
      });
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
    // Unfold continuation lines (RFC 5545 §3.1)
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    const ev = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx);
      const val = line.substring(colonIdx + 1);

      if (key.startsWith('DTSTART'))    ev.dtstartRaw = line;
      if (key.startsWith('DTEND'))      ev.dtendRaw = line;
      if (key === 'SUMMARY')            ev.summary = val.trim();
      if (key === 'LOCATION')           ev.location = val.replace(/\\,/g, ',').replace(/\\n/g, '\n').trim();
      if (key === 'DESCRIPTION')        ev.description = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();
      if (key === 'UID')                ev.uid = val;
      if (key.startsWith('RRULE'))      ev.rrule = val;
      if (key.startsWith('RECURRENCE-ID')) ev.recurrenceId = line;
    }

    if (!ev.dtstartRaw || !ev.summary) continue;

    const dtstart = parseICalDate(ev.dtstartRaw);
    const dtend = ev.dtendRaw ? parseICalDate(ev.dtendRaw) : dtstart;
    if (!dtstart) continue;

    // Detect VALUE=DATE (all-day events)
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
    });
  }
  return events;
}

// ── Date helpers ────────────────────────────────────────────────────────────

/** Get ET date parts for a UTC Date. */
function getETDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long',
  }).formatToParts(date);
  return {
    year: parseInt(parts.find(p => p.type === 'year').value),
    month: parseInt(parts.find(p => p.type === 'month').value),
    day: parseInt(parts.find(p => p.type === 'day').value),
    weekday: parts.find(p => p.type === 'weekday').value,
  };
}

/** Get the Monday of the week containing `date` (ET wall-clock). */
function weekMonday(date) {
  const et = getETDateParts(date);
  const dayIdx = DAY_NAMES.indexOf(et.weekday);  // 0=Sun … 6=Sat
  const diff = (dayIdx === 0 ? -6 : 1) - dayIdx;
  // Build a date at noon ET for that Monday to avoid timezone edge cases
  const monday = new Date(date.getTime() + diff * 86400000);
  // Normalize to noon UTC to keep it stable
  const mp = getETDateParts(monday);
  return new Date(Date.UTC(mp.year, mp.month - 1, mp.day, 12, 0, 0));
}

/** Return the Sunday at end-of-day for a week starting on `monday`. */
function weekSunday(monday) {
  const d = new Date(monday.getTime() + 6 * 86400000);
  const sp = getETDateParts(d);
  return new Date(Date.UTC(sp.year, sp.month - 1, sp.day, 23, 59, 59, 999));
}

/** Format a Date for ET display. */
function fmtET(date, opts) {
  return date.toLocaleString('en-US', { timeZone: TZ, ...opts });
}

function fmtWeekLabel(monday) {
  // Label the week by the Tuesday (outbound day) since that's the travel day
  const tuesday = new Date(monday.getTime() + 1 * 86400000);
  return fmtET(tuesday, { month: 'short', day: 'numeric' });
}

function dayOfWeekET(date) {
  return parseInt(fmtET(date, { weekday: 'narrow' }).length ? 
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(date) : 'Monday'
  );
}

function getETDayName(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(date);
}

function getETHour(date) {
  return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(date));
}

// ── Collect events per calendar into a window ───────────────────────────────

function eventsInWindow(events, winStart, winEnd) {
  const result = [];
  for (const ev of events) {
    if (ev.recurrenceId) continue;
    if (ev.rrule) {
      result.push(...expandRecurring(ev, winStart, winEnd));
    } else if (ev.dtstart <= winEnd && ev.dtend >= winStart) {
      result.push({
        summary: ev.summary,
        dtstart: ev.dtstart,
        dtend: ev.dtend,
        location: ev.location,
        description: ev.description,
        allDay: ev.allDay,
      });
    }
  }
  result.sort((a, b) => a.dtstart - b.dtstart);
  return result;
}

// ── Frontier flight extraction ──────────────────────────────────────────────

const FRONTIER_RE = /frontier|(?:\b|[( ])F9\b/i;
const FLIGHT_NUM_RE = /(?:frontier|F9)\s*(?:flight\s*)?#?\s*(\d{2,5})/i;
const CONF_RE = /(?:confirmation|conf(?:irmation)?\s*(?:code|#)?|booking\s*(?:ref|code|#)?)\s*[:#]?\s*([A-Z0-9]{5,8})/i;

// Generic flight detection — matches "Flight to Tampa", "Flight to Atlanta", etc.
const GENERIC_FLIGHT_RE = /\bflight\b/i;
// City/airport patterns for direction detection
const TAMPA_RE = /\btampa\b|\bTPA\b/i;
const ATLANTA_RE = /\batlanta\b|\bATL\b|\blithia springs\b/i;

function extractFrontierFlights(personalEvents) {
  const flights = [];
  for (const ev of personalEvents) {
    const isFrontier = FRONTIER_RE.test(ev.summary) || FRONTIER_RE.test(ev.description);
    const isGenericFlight = GENERIC_FLIGHT_RE.test(ev.summary) || GENERIC_FLIGHT_RE.test(ev.description);
    
    if (!isFrontier && !isGenericFlight) continue;

    const numMatch = (ev.summary + ' ' + ev.description).match(FLIGHT_NUM_RE);
    const confMatch = (ev.description + ' ' + ev.summary).match(CONF_RE);

    const timeStr = fmtET(ev.dtstart, { hour: 'numeric', minute: '2-digit', hour12: true });
    const dayName = getETDayName(ev.dtstart);
    const hour = getETHour(ev.dtstart);
    const period = hour < 12 ? 'morning' : 'afternoon';

    // Determine direction from summary heuristics
    let direction = 'unknown';
    const text = (ev.summary + ' ' + (ev.location || '') + ' ' + ev.description).toUpperCase();
    if (text.includes('TPA') && text.includes('ATL')) {
      // Check order: "TPA to ATL" vs "ATL to TPA"
      const tpaIdx = text.indexOf('TPA');
      const atlIdx = text.indexOf('ATL');
      direction = tpaIdx < atlIdx ? 'outbound' : 'return';
    } else if (TAMPA_RE.test(ev.summary)) {
      // "Flight to Tampa" = return (ATL→TPA)
      direction = 'return';
    } else if (ATLANTA_RE.test(ev.summary)) {
      // "Flight to Atlanta" = outbound (TPA→ATL)
      direction = 'outbound';
    } else if (period === 'morning') {
      direction = 'outbound';
    } else {
      direction = 'return';
    }

    flights.push({
      summary: ev.summary,
      flightNumber: numMatch ? numMatch[1] : null,
      confirmationCode: confMatch ? confMatch[1] : null,
      dtstart: ev.dtstart,
      dtend: ev.dtend,
      day: dayName,
      time: timeStr,
      period,
      direction,
      isFrontier,
    });
  }
  return flights;
}

// ── Family-visit detection ──────────────────────────────────────────────────

const FAMILY_ATL_RE = /\b(ATL|atlanta)\b/i;
const FAMILY_FLIGHT_RE = /\b(flight|fly|travel|TPA|tampa|airport)\b/i;

function detectFamilyVisitATL(familyEvents, weekStart, weekEnd) {
  for (const ev of familyEvents) {
    if (ev.dtstart > weekEnd || ev.dtend < weekStart) continue;
    const text = ev.summary + ' ' + ev.location + ' ' + ev.description;
    if (FAMILY_ATL_RE.test(text) && FAMILY_FLIGHT_RE.test(text)) return true;
    // Also catch "TPA → ATL" style
    if (/TPA\s*(?:→|->|to)\s*ATL/i.test(text)) return true;
  }
  return false;
}

// ── Work-week detection ─────────────────────────────────────────────────────

function hasWorkEvents(workEvents, weekStart, weekEnd) {
  for (const ev of workEvents) {
    if (ev.dtstart > weekEnd || ev.dtend < weekStart) continue;
    // Ignore all-day events that look like holidays (optional refinement)
    return true;
  }
  return false;
}

/**
 * Detect personal time off — multi-day events on any calendar indicating
 * no work commute needed. Matches patterns like "Castro Off", "PTO",
 * "Vacation", "Time Off", "Day Off", "Leave", "Off Work", etc.
 * Returns the event summary if found, null otherwise.
 */
function detectTimeOff(allCalendarEvents, weekStart, weekEnd) {
  const OFF_KEYWORDS = /\boff\b|\bpto\b|\bvacation\b|\btime.?off\b|\bday.?off\b|\bleave\b|\bholiday\b|\bout.?of.?office\b|\booo\b/i;
  for (const ev of allCalendarEvents) {
    if (ev.dtstart > weekEnd || ev.dtend < weekStart) continue;
    // Calculate overlap with work week
    const overlapStart = Math.max(ev.dtstart.getTime(), weekStart.getTime());
    const overlapEnd = Math.min(ev.dtend.getTime(), weekEnd.getTime());
    const overlapDays = (overlapEnd - overlapStart) / 86400000;
    // Multi-day off event (2+ days overlap) = likely time off for the week
    if (overlapDays >= 2 && OFF_KEYWORDS.test(ev.summary)) {
      return ev.summary;
    }
  }
  return null;
}

/**
 * Detect "special travel" weeks — multi-day events (3+ days) on any calendar
 * that indicate the normal TPA↔ATL commute doesn't apply.
 * Examples: conferences, special meetings, off-site events, training.
 * Returns the event summary if found, null otherwise.
 */
function detectSpecialTravel(allCalendarEvents, weekStart, weekEnd) {
  const SPECIAL_KEYWORDS = /meeting|conference|training|retreat|summit|convention|off.?site|seminar|workshop|symposium|travel|trip/i;
  for (const ev of allCalendarEvents) {
    if (ev.dtstart > weekEnd || ev.dtend < weekStart) continue;
    // Calculate duration in days
    const overlapStart = Math.max(ev.dtstart.getTime(), weekStart.getTime());
    const overlapEnd = Math.min(ev.dtend.getTime(), weekEnd.getTime());
    const overlapDays = (overlapEnd - overlapStart) / 86400000;
    // Multi-day event (3+ days overlap with this week) = likely special travel
    if (overlapDays >= 3 && SPECIAL_KEYWORDS.test(ev.summary)) {
      return ev.summary;
    }
  }
  return null;
}

// ── Core: build 8-week report ───────────────────────────────────────────────

async function buildReport() {
  // 1. Fetch all calendars in parallel
  const [familyIcal, personalIcal, workIcal, gmailIcal] = await Promise.all([
    fetchUrl(CONFIG.calendars.family),
    fetchUrl(CONFIG.calendars.personal),
    fetchUrl(CONFIG.calendars.work),
    CONFIG.calendars.gmail ? fetchUrl(CONFIG.calendars.gmail) : Promise.resolve(''),
  ]);

  // 2. Parse
  const familyAll   = parseEvents(familyIcal);
  const personalAll = parseEvents(personalIcal);
  const workAll     = parseEvents(workIcal);
  const gmailAll    = gmailIcal ? parseEvents(gmailIcal) : [];

  // 3. Window: now → lookaheadWeeks out
  const now = new Date();
  const winStart = weekMonday(now);
  const winEnd = new Date(winStart.getTime() + CONFIG.lookaheadWeeks * 7 * 86400000);

  const familyEvents   = eventsInWindow(familyAll, winStart, winEnd);
  const personalEvents = eventsInWindow(personalAll, winStart, winEnd);
  const workEvents     = eventsInWindow(workAll, winStart, winEnd);
  const gmailEvents    = eventsInWindow(gmailAll, winStart, winEnd);

  // 4. Extract booked Frontier flights from all relevant calendars
  const bookedFlights = extractFrontierFlights(personalEvents);
  const familyFlights = extractFrontierFlights(familyEvents);
  const gmailFlights  = extractFrontierFlights(gmailEvents);
  const workFlights   = extractFrontierFlights(workEvents);
  const allFlights = [...bookedFlights, ...familyFlights, ...gmailFlights, ...workFlights];

  // 5. Build per-week analysis
  const outboundDayIdx = DAY_NAMES.indexOf(CONFIG.pattern.outbound.day);   // 2 = Tue
  const returnDayIdx   = DAY_NAMES.indexOf(CONFIG.pattern.return.day);     // 4 = Thu

  const weeks = [];
  let mon = new Date(winStart);

  for (let w = 0; w < CONFIG.lookaheadWeeks; w++) {
    const wkStart = new Date(mon);
    const wkEnd = weekSunday(mon);

    const daysUntil = Math.round((wkStart - now) / 86400000);

    // Work events this week?
    const workThisWeek = hasWorkEvents(workEvents, wkStart, wkEnd);

    // Family visiting ATL?
    const familyVisit = detectFamilyVisitATL(familyEvents, wkStart, wkEnd);

    // Time off? (PTO, vacation, "Castro Off", etc.)
    const allCalEvents = [...familyEvents, ...personalEvents, ...workEvents, ...gmailEvents];
    const timeOff = detectTimeOff(allCalEvents, wkStart, wkEnd);

    // Special travel week? (multi-day conference/meeting — no normal commute needed)
    const specialTravel = detectSpecialTravel(allCalEvents, wkStart, wkEnd);

    // Find flights for this week
    const outboundDate = new Date(wkStart);
    outboundDate.setDate(outboundDate.getDate() + ((outboundDayIdx - outboundDate.getDay() + 7) % 7));
    const returnDate = new Date(wkStart);
    returnDate.setDate(returnDate.getDate() + ((returnDayIdx - returnDate.getDay() + 7) % 7));

    // Match flights to expected days (same calendar day in ET)
    // Use ET date string for comparison to avoid UTC/local timezone mismatches
    const etDateStr = (d) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const dd = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${dd}`;
    };

    // Build the expected ET dates for outbound and return
    // outboundDate/returnDate are at midnight UTC — shift them to get the right ET calendar date
    const expectedOutboundETDate = (() => {
      // Walk from week start to find the correct day in ET
      for (let di = 0; di < 7; di++) {
        const candidate = new Date(wkStart.getTime() + di * 86400000 + 12 * 3600000); // noon UTC to stay in the right day
        if (getETDayName(candidate) === CONFIG.pattern.outbound.day) return etDateStr(candidate);
      }
      return null;
    })();

    const expectedReturnETDate = (() => {
      for (let di = 0; di < 7; di++) {
        const candidate = new Date(wkStart.getTime() + di * 86400000 + 12 * 3600000);
        if (getETDayName(candidate) === CONFIG.pattern.return.day) return etDateStr(candidate);
      }
      return null;
    })();

    const outboundFlight = allFlights.find(f => {
      return getETDayName(f.dtstart) === CONFIG.pattern.outbound.day && etDateStr(f.dtstart) === expectedOutboundETDate;
    }) || null;

    const returnFlight = allFlights.find(f => {
      return getETDayName(f.dtstart) === CONFIG.pattern.return.day && etDateStr(f.dtstart) === expectedReturnETDate;
    }) || null;

    // Calculate whether outbound/return dates are in the past (using ET dates for comparison)
    // Get today's date in ET as YYYY-MM-DD string
    const todayETStr = (() => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const d = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${d}`;
    })();
    
    // Get outbound and return dates in ET as YYYY-MM-DD strings
    const outboundETStr = expectedOutboundETDate; // Already computed above
    const returnETStr = expectedReturnETDate;     // Already computed above
    
    const outboundPast = outboundETStr < todayETStr;
    const returnPast = returnETStr < todayETStr;

    // Classify the week — ignore past dates when determining status
    let status;
    if (!workThisWeek) {
      status = 'OFF';
    } else if (timeOff) {
      status = 'TIME_OFF';
    } else if (specialTravel) {
      status = 'TRAVEL';
    } else if (familyVisit) {
      // Family visiting — outbound still needed, return not needed
      if (outboundFlight || outboundPast) {
        status = 'FAMILY_VISIT';
      } else {
        status = 'PARTIAL';   // still need outbound even with family visit
      }
    } else if ((outboundFlight || outboundPast) && (returnFlight || returnPast)) {
      // Both legs are either booked or in the past — consider it complete
      status = 'BOOKED';
    } else if (outboundFlight || returnFlight || outboundPast || returnPast) {
      // At least one leg is booked or past, but something future is missing
      const outboundOk = outboundFlight || outboundPast;
      const returnOk = returnFlight || returnPast;
      if (outboundOk && returnOk) {
        status = 'BOOKED';
      } else {
        status = 'PARTIAL';
      }
    } else {
      status = 'UNBOOKED';
    }

    const week = {
      weekOf: fmtWeekLabel(wkStart),
      weekStart: wkStart.toISOString(),
      weekEnd: wkEnd.toISOString(),
      daysUntil,
      status,
      outbound: outboundFlight ? {
        flightNumber: outboundFlight.flightNumber,
        confirmationCode: outboundFlight.confirmationCode,
        time: outboundFlight.time,
        summary: outboundFlight.summary,
        isFrontier: outboundFlight.isFrontier,
      } : null,
      return: returnFlight ? {
        flightNumber: returnFlight.flightNumber,
        confirmationCode: returnFlight.confirmationCode,
        time: returnFlight.time,
        summary: returnFlight.summary,
        isFrontier: returnFlight.isFrontier,
      } : null,
      outboundPast,
      returnPast,
      familyVisit,
      timeOff,
      specialTravel,
      workWeek: workThisWeek,
      urgent: (status === 'UNBOOKED' || status === 'PARTIAL') && daysUntil <= CONFIG.alertThresholdDays,
    };

    // Compute missing legs + booking links
    // SKIP past dates — only report gaps for future dates (using outboundPast/returnPast computed above)
    week.gaps = [];
    week.bookingLinks = {};
    
    if (workThisWeek && !familyVisit && !specialTravel && !timeOff) {
      if (!outboundFlight && !outboundPast) {
        week.gaps.push('outbound');
        week.bookingLinks.outbound = generateBookingLink('TPA', 'ATL', new Date(wkStart.getTime() + 1 * 86400000)); // Tuesday
      }
      if (!returnFlight && !returnPast) {
        week.gaps.push('return');
        week.bookingLinks.return = generateBookingLink('ATL', 'TPA', new Date(wkStart.getTime() + 3 * 86400000)); // Thursday
      }
    } else if (workThisWeek && familyVisit) {
      if (!outboundFlight && !outboundPast) {
        week.gaps.push('outbound');
        week.bookingLinks.outbound = generateBookingLink('TPA', 'ATL', new Date(wkStart.getTime() + 1 * 86400000));
      }
      // return not needed
    }

    weeks.push(week);
    mon.setDate(mon.getDate() + 7);
  }

  return weeks;
}

// ── Text formatter ──────────────────────────────────────────────────────────

function formatText(weeks) {
  const lines = [`✈️  ${CONFIG.lookaheadWeeks}-Week Flight Status\n`];

  for (const w of weeks) {
    const urgency = w.urgent ? ` (${w.daysUntil <= 0 ? 'THIS WEEK!' : w.daysUntil + ' days away!'})` : '';

    let icon, label;
    switch (w.status) {
      case 'BOOKED':       icon = '✅'; label = 'Booked'; break;
      case 'PARTIAL':
        if (w.gaps.includes('outbound')) {
          icon = '⚠️'; label = 'OUTBOUND MISSING';
        } else {
          icon = '⚠️'; label = 'RETURN MISSING';
        }
        break;
      case 'UNBOOKED':     icon = '🔴'; label = 'NOT BOOKED'; break;
      case 'OFF':          icon = '🏠'; label = 'Off — no work events'; break;
      case 'TIME_OFF':     icon = '🏖️'; label = `Time off — ${w.timeOff}`; break;
      case 'TRAVEL':       icon = '🗓️'; label = `Special travel — ${w.specialTravel}`; break;
      case 'FAMILY_VISIT': icon = '👨‍👩‍👧'; label = 'Family visiting ATL — no return needed'; break;
      case 'EXCEPTION':    icon = '❓'; label = 'Exception'; break;
      default:             icon = '❓'; label = w.status;
    }

    lines.push(`Week of ${w.weekOf}: ${icon} ${label}${urgency}`);

    if (w.status === 'OFF' || w.status === 'TRAVEL' || w.status === 'TIME_OFF') {
      lines.push('');
      continue;
    }

    // Outbound line — skip if date is in the past
    if (w.outbound) {
      const fn = w.outbound.flightNumber ? `${w.outbound.isFrontier !== false ? 'Frontier ' : 'F'}${w.outbound.flightNumber}` : w.outbound.summary;
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.outbound.day)]}: ${fn} (${w.outbound.time})`);
    } else if (w.workWeek && !w.outboundPast) {
      const bookLink = w.bookingLinks && w.bookingLinks.outbound ? `\n     🔗 Book: ${w.bookingLinks.outbound}` : '';
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.outbound.day)]}: Not booked${bookLink}`);
    }
    // If outbound is past and not booked, just skip showing it

    // Return line — skip if date is in the past
    if (w.familyVisit && w.status === 'FAMILY_VISIT') {
      if (!w.returnPast) {
        lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: Skipped (family in ATL)`);
      }
    } else if (w.return) {
      const fn = w.return.flightNumber ? `${w.return.isFrontier !== false ? 'Frontier ' : 'F'}${w.return.flightNumber}` : w.return.summary;
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: ${fn} (${w.return.time})`);
    } else if (w.workWeek && !w.returnPast) {
      const bookLink = w.bookingLinks && w.bookingLinks.return ? `\n     🔗 Book: ${w.bookingLinks.return}` : '';
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: Not booked${bookLink}`);
    }
    // If return is past and not booked, just skip showing it

    lines.push('');
  }

  return lines.join('\n');
}

// ── Booking link generator ──────────────────────────────────────────────

function generateBookingLink(origin, destination, date) {
  const dp = getETDateParts(date);
  const dateStr = `${dp.year}-${String(dp.month).padStart(2,'0')}-${String(dp.day).padStart(2,'0')}`;
  return `https://booking.flyfrontier.com/Flight/Select?o1=${origin}&d1=${destination}&dd1=${dateStr}&ADT=1&mon=true`;
}

// ── Price checking via Kayak ─────────────────────────────────────────────────

const { execSync } = require('child_process');

/**
 * Run price-check.mjs for a given route and date.
 * Returns parsed JSON result or null on failure.
 */
function checkPrice(origin, dest, date) {
  try {
    const scriptPath = path.join(__dirname, 'price-check.mjs');
    const result = execSync(
      `node "${scriptPath}" ${origin} ${dest} ${date}`,
      {
        timeout: 60000,  // 60s per check
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_PATH: path.join(__dirname, '..', 'node_modules') },
      }
    );
    return JSON.parse(result.trim());
  } catch (err) {
    return null;
  }
}

/**
 * Run price checks for all gaps in the report.
 * Mutates week objects to add `priceInfo` field.
 */
async function enrichWithPrices(weeks) {
  for (const w of weeks) {
    if (!w.gaps || w.gaps.length === 0) continue;

    for (const gap of w.gaps) {
      // Determine origin, dest, and date for this gap
      let origin, dest, targetDate;
      if (gap === 'outbound') {
        origin = 'TPA';
        dest = 'ATL';
        // Tuesday of this week
        const tueOffset = 1; // Monday + 1 = Tuesday
        targetDate = new Date(new Date(w.weekStart).getTime() + tueOffset * 86400000);
      } else {
        origin = 'ATL';
        dest = 'TPA';
        // Thursday of this week
        const thuOffset = 3; // Monday + 3 = Thursday
        targetDate = new Date(new Date(w.weekStart).getTime() + thuOffset * 86400000);
      }

      const dp = getETDateParts(targetDate);
      const dateStr = `${dp.year}-${String(dp.month).padStart(2,'0')}-${String(dp.day).padStart(2,'0')}`;

      const priceResult = checkPrice(origin, dest, dateStr);

      if (!w.priceInfo) w.priceInfo = {};
      w.priceInfo[gap] = priceResult;
    }
  }
}

/**
 * Format price info for a gap into a display line.
 */
function formatPriceLine(priceResult) {
  if (!priceResult) return '     💰 Price check failed';
  if (priceResult.error) {
    if (priceResult.error === 'captcha') return '     💰 Kayak blocked (CAPTCHA)';
    return '     💰 No Frontier prices found';
  }
  if (!priceResult.flights || priceResult.flights.length === 0) return '     💰 No Frontier flights found';

  const summaries = priceResult.flights
    .slice(0, 3)  // Show up to 3 options
    .map(f => `$${f.basicPrice ?? f.economyPrice ?? '?'} (${f.departure})`)
    .join(' / ');

  return `     💰 Frontier ${summaries} via Kayak`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2).map(a => a.toLowerCase());
  const mode = args.find(a => a === 'json' || a === 'text') || 'text';
  const withPrices = args.includes('--prices');

  const weeks = await buildReport();

  // Optionally enrich with Kayak prices
  if (withPrices) {
    await enrichWithPrices(weeks);
  }

  if (mode === 'json') {
    console.log(JSON.stringify(weeks, null, 2));
  } else {
    console.log(formatTextWithPrices(weeks, withPrices));
  }
}

/**
 * Enhanced text formatter that includes price info when available.
 */
function formatTextWithPrices(weeks, showPrices) {
  const lines = [`✈️  ${CONFIG.lookaheadWeeks}-Week Flight Status\n`];

  for (const w of weeks) {
    const urgency = w.urgent ? ` (${w.daysUntil <= 0 ? 'THIS WEEK!' : w.daysUntil + ' days away!'})` : '';

    let icon, label;
    switch (w.status) {
      case 'BOOKED':       icon = '✅'; label = 'Booked'; break;
      case 'PARTIAL':
        if (w.gaps.includes('outbound')) {
          icon = '⚠️'; label = 'OUTBOUND MISSING';
        } else {
          icon = '⚠️'; label = 'RETURN MISSING';
        }
        break;
      case 'UNBOOKED':     icon = '🔴'; label = 'NOT BOOKED'; break;
      case 'OFF':          icon = '🏠'; label = 'Off — no work events'; break;
      case 'TIME_OFF':     icon = '🏖️'; label = `Time off — ${w.timeOff}`; break;
      case 'TRAVEL':       icon = '🗓️'; label = `Special travel — ${w.specialTravel}`; break;
      case 'FAMILY_VISIT': icon = '👨‍👩‍👧'; label = 'Family visiting ATL — no return needed'; break;
      case 'EXCEPTION':    icon = '❓'; label = 'Exception'; break;
      default:             icon = '❓'; label = w.status;
    }

    lines.push(`Week of ${w.weekOf}: ${icon} ${label}${urgency}`);

    if (w.status === 'OFF' || w.status === 'TRAVEL' || w.status === 'TIME_OFF') {
      lines.push('');
      continue;
    }

    // Outbound line — skip if date is in the past
    if (w.outbound) {
      const fn = w.outbound.flightNumber ? `${w.outbound.isFrontier !== false ? 'Frontier ' : 'F'}${w.outbound.flightNumber}` : w.outbound.summary;
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.outbound.day)]}: ${fn} (${w.outbound.time})`);
    } else if (w.workWeek && !w.outboundPast) {
      const bookLink = w.bookingLinks && w.bookingLinks.outbound ? `\n     🔗 Book: ${w.bookingLinks.outbound}` : '';
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.outbound.day)]}: Not booked${bookLink}`);
      // Add price info for outbound gap
      if (showPrices && w.priceInfo && w.priceInfo.outbound) {
        lines.push(formatPriceLine(w.priceInfo.outbound));
      }
    }
    // If outbound is past and not booked, just skip showing it

    // Return line — skip if date is in the past
    if (w.familyVisit && w.status === 'FAMILY_VISIT') {
      if (!w.returnPast) {
        lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: Skipped (family in ATL)`);
      }
    } else if (w.return) {
      const fn = w.return.flightNumber ? `${w.return.isFrontier !== false ? 'Frontier ' : 'F'}${w.return.flightNumber}` : w.return.summary;
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: ${fn} (${w.return.time})`);
    } else if (w.workWeek && !w.returnPast) {
      const bookLink = w.bookingLinks && w.bookingLinks.return ? `\n     🔗 Book: ${w.bookingLinks.return}` : '';
      lines.push(`  → ${DAY_SHORT[DAY_NAMES.indexOf(CONFIG.pattern.return.day)]}: Not booked${bookLink}`);
      // Add price info for return gap
      if (showPrices && w.priceInfo && w.priceInfo.return) {
        lines.push(formatPriceLine(w.priceInfo.return));
      }
    }
    // If return is past and not booked, just skip showing it

    lines.push('');
  }

  return lines.join('\n');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
