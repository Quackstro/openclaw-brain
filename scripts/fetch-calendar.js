#!/usr/bin/env node
const fs = require('fs');
const https = require('https');

const configPath = '/home/clawdbot/clawd/calendars.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const TIMEZONE = config.timezone || 'America/New_York';

const targetDate = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
const targetYMD = targetDate.replace(/-/g, '');

function fetchCalendar(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseDateTime(dtLine, tzid = null) {
  // Extract date/time from DTSTART or DTEND line
  // Formats: 20260121, 20260121T120000, 20260121T120000Z
  const match = dtLine.match(/(\d{8})(T(\d{6})(Z)?)?/);
  if (!match) return null;
  
  const dateStr = match[1];
  const timeStr = match[3] || null;
  const isUTC = match[4] === 'Z';
  
  if (!timeStr) {
    return { date: dateStr, allDay: true };
  }
  
  // Build a Date object
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1;
  const day = parseInt(dateStr.slice(6, 8));
  const hour = parseInt(timeStr.slice(0, 2));
  const minute = parseInt(timeStr.slice(2, 4));
  
  let dt;
  if (isUTC) {
    dt = new Date(Date.UTC(year, month, day, hour, minute));
  } else {
    // Assume it's already in the event's timezone (usually specified by TZID)
    // Create date as if it's local, then format in target timezone
    dt = new Date(year, month, day, hour, minute);
  }
  
  return { date: dateStr, time: dt, allDay: false, isUTC };
}

function formatTime(dt, isUTC = false) {
  const options = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE
  };
  return dt.toLocaleTimeString('en-US', options);
}

function parseICS(ics, targetYMD) {
  const events = [];
  const eventBlocks = ics.split('BEGIN:VEVENT');
  
  for (let block of eventBlocks.slice(1)) {
    const endIdx = block.indexOf('END:VEVENT');
    if (endIdx === -1) continue;
    block = block.slice(0, endIdx);
    
    const summary = block.match(/SUMMARY:(.+)/)?.[1]?.trim() || 'Untitled';
    const dtstartLine = block.match(/DTSTART[^:\n]*:([^\n]+)/)?.[1] || '';
    
    const parsed = parseDateTime(dtstartLine);
    if (!parsed) continue;
    
    // Check if event matches target date
    const eventDateYMD = parsed.date;
    
    // For timed events in UTC, check the date in target timezone
    let matchesDate = eventDateYMD === targetYMD;
    
    if (parsed.time && parsed.isUTC) {
      const localDate = parsed.time.toLocaleDateString('en-CA', { timeZone: TIMEZONE }).replace(/-/g, '');
      matchesDate = localDate === targetYMD;
    }
    
    if (matchesDate) {
      let displayTime = 'All day';
      let sortKey = '00000000';
      
      if (!parsed.allDay && parsed.time) {
        displayTime = formatTime(parsed.time, parsed.isUTC);
        // Sort key: use hours/minutes in 24h format for sorting
        const h = parsed.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE });
        sortKey = h.replace(':', '');
      }
      
      events.push({ time: displayTime, summary, sortKey });
    }
  }
  
  return events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

async function main() {
  console.log(`📅 Calendar for ${targetDate} (Eastern Time)\n`);
  
  let allEvents = [];
  for (const cal of config.calendars) {
    try {
      const ics = await fetchCalendar(cal.url);
      const events = parseICS(ics, targetYMD);
      allEvents.push(...events);
    } catch (e) {
      console.error(`Error fetching ${cal.name}: ${e.message}`);
    }
  }
  
  // De-duplicate by summary+time
  const seen = new Set();
  allEvents = allEvents.filter(e => {
    const key = `${e.time}|${e.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  allEvents.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  
  if (allEvents.length === 0) {
    console.log('No events scheduled.');
  } else {
    for (const e of allEvents) {
      console.log(`  • ${e.time} — ${e.summary}`);
    }
  }
}

main();
