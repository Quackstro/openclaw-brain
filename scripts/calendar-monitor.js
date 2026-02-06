#!/usr/bin/env node
/**
 * Family Calendar Monitor
 * Fetches iCal webcal feed, parses events, returns upcoming ones.
 * Usage: node calendar-monitor.js [days-ahead] [output-mode]
 *   days-ahead: how many days to look ahead (default: 2)
 *   output-mode: "json" or "text" (default: "text")
 */

const https = require('https');

const CALENDARS = [
  { name: 'Family', url: 'https://p169-caldav.icloud.com/published/2/Mjc5ODA2NTExMjc5ODA2NTm0HKQycMPQjutsHPuwH1FUqgrfjM8DQXbGhkemJP7enEuF5jKGZOjFba8-BP0-lxhGncaYJYB2B6pLjJv3LvA' },
  { name: 'Personal', url: 'https://p169-caldav.icloud.com/published/2/Mjc5ODA2NTExMjc5ODA2NTm0HKQycMPQjutsHPuwH1GBWxl_Vku9XiUbKsshz74QAautkInohok2whfL89HPPQ0552TouFXOJKt-SI2exBk' },
  { name: 'Work', url: 'https://outlook.office365.com/owa/calendar/b71231cfcdd94878814781534989f562@alpa.org/b82c125c7e7f4f63aef6c2b2a79487243471766741358735786/calendar.ics' },
  { name: 'Gmail', url: 'https://calendar.google.com/calendar/ical/castro770%40gmail.com/public/basic.ics' },
];
const TZ = 'America/New_York';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'OpenClaw-CalMonitor/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseICalDate(val) {
  // Handle TZID format: DTSTART;TZID=America/New_York:20240402T093000
  // Handle UTC format: 20240402T093000Z
  // Handle DATE format: 20240402
  const match = val.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  
  // All-day events (VALUE=DATE, no time component) — use 17:00 UTC to keep date stable in ET
  const isAllDay = /VALUE=DATE(?![-T])/.test(val) || (!hh && !val.includes('T'));
  if (isAllDay) {
    return new Date(Date.UTC(+y, +m - 1, +d, 17, 0, 0));
  }
  
  // UTC time (timestamp ends with Z, e.g., 20260203T140000Z)
  // Note: Don't match 'Z' in TZID — check for trailing Z after timestamp
  if (/\d{6}Z/.test(val)) {
    return new Date(Date.UTC(+y, +m - 1, +d, +(hh||0), +(mm||0), +(ss||0)));
  }
  
  // Check for TZID — extract the timezone if specified
  const tzidMatch = val.match(/TZID=([^:;]+)/);
  let sourceTZ = tzidMatch ? tzidMatch[1] : TZ; // Default to ET if no TZID
  
  // Map Microsoft/Windows timezone names to IANA names
  const tzMap = {
    'Eastern Standard Time': 'America/New_York',
    'Eastern Daylight Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Central Daylight Time': 'America/Chicago',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Pacific Daylight Time': 'America/Los_Angeles',
    'Mountain Standard Time': 'America/Denver',
    'Mountain Daylight Time': 'America/Denver',
    'UTC': 'UTC',
  };
  if (tzMap[sourceTZ]) sourceTZ = tzMap[sourceTZ];
  
  // For times with TZID or bare times, the time value is in the specified timezone.
  // We need to convert to UTC by figuring out the offset at that time.
  // 
  // Strategy: Create a reference date, format it in the source TZ, and calculate offset.
  const hour = +(hh || 0);
  const minute = +(mm || 0);
  const second = +(ss || 0);
  
  // Build a UTC date first as a reference point
  const refUtc = new Date(Date.UTC(+y, +m - 1, +d, hour, minute, second));
  
  // Get the offset by comparing wall-clock times
  // This uses Intl to get the actual offset including DST
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    
    // Get what time it would be in the source TZ at our reference UTC point
    const parts = formatter.formatToParts(refUtc);
    const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '0');
    const tzHour = getPart('hour');
    const tzMinute = getPart('minute');
    
    // The difference tells us the offset
    // If refUtc is 15:00 UTC and sourceTZ shows 10:00, offset is -5 hours
    let offsetMinutes = (hour * 60 + minute) - (tzHour * 60 + tzMinute);
    
    // Handle day boundary wrap (e.g., 23:00 vs 04:00 next day)
    if (offsetMinutes > 720) offsetMinutes -= 1440;
    if (offsetMinutes < -720) offsetMinutes += 1440;
    
    // The actual UTC time = local time + offset (since offset is UTC - local)
    // If event is 15:00 ET and ET is UTC-5, then UTC = 15:00 + 5:00 = 20:00
    return new Date(Date.UTC(+y, +m - 1, +d, hour, minute + offsetMinutes, second));
  } catch {
    // Fallback: assume ET (UTC-5, ignoring DST)
    return new Date(Date.UTC(+y, +m - 1, +d, hour + 5, minute, second));
  }
}

function parseRRule(rruleStr) {
  const parts = {};
  rruleStr.split(';').forEach(p => {
    const [k, v] = p.split('=');
    parts[k] = v;
  });
  return parts;
}

function expandRecurring(event, windowStart, windowEnd) {
  const instances = [];
  const rrule = parseRRule(event.rrule);
  const freq = rrule.FREQ;
  const until = rrule.UNTIL ? parseICalDate(rrule.UNTIL) : null;
  const count = rrule.COUNT ? parseInt(rrule.COUNT) : null;
  
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return instances; // only handle common cases
  
  const intervalDays = freq === 'WEEKLY' ? 7 : 1;
  const interval = rrule.INTERVAL ? parseInt(rrule.INTERVAL) : 1;
  const stepMs = intervalDays * interval * 86400000;
  
  let dt = new Date(event.dtstart);
  let duration = event.dtend - event.dtstart;
  let n = 0;
  const maxIterations = 1000;
  
  while (n < maxIterations) {
    if (until && dt > until) break;
    if (count && n >= count) break;
    if (dt > windowEnd) break;
    
    const end = new Date(dt.getTime() + duration);
    if (dt >= windowStart || end >= windowStart) {
      // Check if this instance is overridden by a RECURRENCE-ID
      if (!event.overrides || !event.overrides.has(dt.getTime())) {
        instances.push({
          summary: event.summary,
          dtstart: new Date(dt),
          dtend: end,
          location: event.location,
          description: event.description,
        });
      }
    }
    dt = new Date(dt.getTime() + stepMs);
    n++;
  }
  
  return instances;
}

function parseEvents(ical) {
  const events = [];
  const blocks = ical.split('BEGIN:VEVENT');
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split('END:VEVENT')[0];
    const lines = block.replace(/\r\n /g, '').split(/\r?\n/);
    
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
    }
    
    if (!ev.dtstartRaw || !ev.summary) continue;
    
    const dtstart = parseICalDate(ev.dtstartRaw);
    const dtend = ev.dtendRaw ? parseICalDate(ev.dtendRaw) : dtstart;
    if (!dtstart) continue;
    
    events.push({
      summary: ev.summary,
      dtstart,
      dtend: dtend || dtstart,
      location: ev.location || '',
      description: ev.description || '',
      uid: ev.uid,
      rrule: ev.rrule || null,
      recurrenceId: ev.recurrenceId || null,
    });
  }
  
  return events;
}

function getUpcoming(events, daysAhead) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysAhead * 86400000);
  
  let upcoming = [];
  
  for (const ev of events) {
    if (ev.recurrenceId) continue; // skip overrides for now
    
    if (ev.rrule) {
      upcoming.push(...expandRecurring(ev, now, windowEnd));
    } else if (ev.dtstart >= now && ev.dtstart <= windowEnd) {
      upcoming.push({
        summary: ev.summary,
        dtstart: ev.dtstart,
        dtend: ev.dtend,
        location: ev.location,
        description: ev.description,
      });
    }
  }
  
  // Sort by start time
  upcoming.sort((a, b) => a.dtstart - b.dtstart);
  return upcoming;
}

function formatEvent(ev) {
  const opts = { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
  const start = ev.dtstart.toLocaleString('en-US', opts);
  const endOpts = { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true };
  const end = ev.dtend.toLocaleString('en-US', endOpts);
  
  let line = `• ${ev.summary} — ${start} to ${end}`;
  if (ev.location) line += `\n  📍 ${ev.location.split('\n')[0]}`;
  return line;
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function deduplicateEvents(events) {
  const dominated = new Set();
  for (let i = 0; i < events.length; i++) {
    if (dominated.has(i)) continue;
    for (let j = i + 1; j < events.length; j++) {
      if (dominated.has(j)) continue;
      const a = events[i], b = events[j];
      // Check if times overlap or are within 30 min
      const timesClose = Math.abs(a.dtstart - b.dtstart) < 30 * 60000;
      if (!timesClose) continue;
      // Check if names are similar using word overlap
      const wordsA = new Set((a.summary || '').toLowerCase().match(/[a-z0-9]+/g) || []);
      const wordsB = new Set((b.summary || '').toLowerCase().match(/[a-z0-9]+/g) || []);
      const intersection = [...wordsA].filter(w => w.length > 2 && wordsB.has(w));
      const smaller = Math.min(wordsA.size, wordsB.size);
      const similar = smaller > 0 && intersection.length / smaller >= 0.5;
      if (!similar) continue;
      // Keep the one with more detail (prefer Work > Family/Personal, or longer location)
      const aScore = (a.calendar === 'Work' ? 10 : 0) + (a.location || '').length;
      const bScore = (b.calendar === 'Work' ? 10 : 0) + (b.location || '').length;
      if (aScore >= bScore) {
        dominated.add(j);
      } else {
        dominated.add(i);
      }
    }
  }
  return events.filter((_, idx) => !dominated.has(idx));
}

async function main() {
  const daysAhead = parseInt(process.argv[2]) || 2;
  const mode = process.argv[3] || 'text';
  
  let allUpcoming = [];
  
  for (const cal of CALENDARS) {
    const ical = await fetch(cal.url);
    const events = parseEvents(ical);
    const upcoming = getUpcoming(events, daysAhead);
    for (const ev of upcoming) {
      ev.calendar = cal.name;
    }
    allUpcoming.push(...upcoming);
  }
  
  // Sort all by start time
  allUpcoming.sort((a, b) => a.dtstart - b.dtstart);
  
  // Deduplicate overlapping events across calendars (e.g. work events shared to family)
  // If two events have similar names and overlapping times, keep the Work version (more detail)
  allUpcoming = deduplicateEvents(allUpcoming);
  
  if (mode === 'json') {
    console.log(JSON.stringify(allUpcoming, null, 2));
  } else {
    if (allUpcoming.length === 0) {
      console.log(`No upcoming events in the next ${daysAhead} day(s).`);
    } else {
      console.log(`📅 ${allUpcoming.length} upcoming event(s) in the next ${daysAhead} day(s):\n`);
      for (const ev of allUpcoming) {
        console.log(`[${ev.calendar}] ${formatEvent(ev)}`);
        console.log('');
      }
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
