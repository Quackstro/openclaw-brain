#!/usr/bin/env node
/**
 * Kayak Price Checker for Frontier Flights
 *
 * Usage:
 *   node price-check.mjs ATL TPA 2026-03-12
 *   node price-check.mjs ATL TPA 2026-03-12 2026-03-17
 *
 * Scrapes Kayak for Frontier-only flights and outputs structured JSON.
 */

import { chromium } from 'playwright';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const PAGE_LOAD_TIMEOUT = 30000;
const RENDER_WAIT_MS = 12000;

/**
 * Parse Frontier flights from page text content.
 * Kayak flight cards contain text like:
 *   "SaveShare10:50 pm – 12:26 am+1Frontiernonstop1h 36mATL-TPA$27BasicSelect$74EconomySelect"
 *   or with multiple fare classes
 */
function parseFrontierFlights(pageText, route) {
  const flights = [];

  // Strategy: Split the text into segments around "Frontier" mentions,
  // then extract surrounding flight data.
  // We'll use a broad regex that captures flight card blocks.

  // First, try to find flight result card segments
  // Kayak structures results as cards. We look for time patterns followed by airline info.
  const timePattern = /(\d{1,2}:\d{2}\s*[ap]m)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[ap]m)(\+\d)?/gi;

  // Find all time matches and their positions
  const timeMatches = [];
  let m;
  while ((m = timePattern.exec(pageText)) !== null) {
    timeMatches.push({ index: m.index, match: m });
  }

  for (const tm of timeMatches) {
    // Get a chunk of text after this time match (enough for the rest of the card)
    const chunk = pageText.substring(tm.index, tm.index + 500);

    // Must contain "Frontier"
    if (!/frontier/i.test(chunk)) continue;

    const departure = tm.match[1].trim();
    const arrival = tm.match[2].trim();
    const nextDay = tm.match[3] ? tm.match[3].trim() : '';

    // Extract duration
    const durMatch = chunk.match(/(\d+h\s*\d+m)/);
    const duration = durMatch ? durMatch[1] : '';

    // Extract stops
    const stopsMatch = chunk.match(/(nonstop|\d+\s*stops?)/i);
    const stops = stopsMatch ? stopsMatch[1].toLowerCase() : '';

    // Extract prices — look for dollar amounts
    // Patterns: "$27Basic", "$74Economy", "$27basic economy", etc.
    const priceMatches = [...chunk.matchAll(/\$(\d+)\s*(Basic|Economy|standard|Saver|main|first)/gi)];

    let basicPrice = null;
    let economyPrice = null;

    for (const pm of priceMatches) {
      const price = parseInt(pm[1]);
      const fareClass = pm[2].toLowerCase();
      if (fareClass === 'basic' || fareClass === 'saver' || fareClass === 'standard') {
        if (basicPrice === null || price < basicPrice) basicPrice = price;
      } else if (fareClass === 'economy' || fareClass === 'main') {
        if (economyPrice === null || price < economyPrice) economyPrice = price;
      }
    }

    // If we didn't match specific fare classes, try generic sequential $ amounts
    if (basicPrice === null) {
      const genericPrices = [...chunk.matchAll(/\$(\d+)/g)].map(p => parseInt(p[1]));
      if (genericPrices.length >= 1) basicPrice = genericPrices[0];
      if (genericPrices.length >= 2) economyPrice = genericPrices[1];
    }

    // Skip if no price found at all
    if (basicPrice === null && economyPrice === null) continue;

    // Deduplicate: skip if we already have a flight with the same departure time
    const isDupe = flights.some(f => f.departure === departure && f.arrival === arrival);
    if (isDupe) continue;

    flights.push({
      airline: 'Frontier',
      departure,
      arrival: arrival + (nextDay ? nextDay : ''),
      duration,
      stops,
      basicPrice,
      economyPrice,
    });
  }

  return flights;
}

/**
 * Apply stealth patches to a page to avoid bot detection.
 */
async function applyStealthPatches(page) {
  await page.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Override chrome runtime
    window.chrome = {
      runtime: {},
      loadTimes: () => ({}),
      csi: () => ({}),
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
    };

    // Override permissions
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }

    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Fix platform
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });
  });
}

/**
 * Scrape Kayak for a single route+date.
 */
async function scrapeDate(browser, origin, dest, date) {
  const route = `${origin}-${dest}`;
  const kayakUrl = `https://www.kayak.com/flights/${origin}-${dest}/${date}?sort=price_a`;

  const context = await browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  const page = await context.newPage();
  await applyStealthPatches(page);

  try {
    // First visit the homepage to get cookies
    await page.goto('https://www.kayak.com/', {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT,
    });
    await page.waitForTimeout(2000 + Math.random() * 2000);

    // Now navigate to the search results
    await page.goto(kayakUrl, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT,
    });

    // Wait for results to render with some random jitter
    await page.waitForTimeout(RENDER_WAIT_MS + Math.random() * 3000);

    // Simulate human-like scrolling
    await page.evaluate(() => {
      window.scrollBy(0, 300 + Math.random() * 200);
    });
    await page.waitForTimeout(1000 + Math.random() * 1000);

    // Check for CAPTCHA — be more specific about what constitutes a real CAPTCHA
    const pageContent = await page.content();
    const pageUrl = page.url();
    const hasCaptcha = /recaptcha|hcaptcha|challenge-platform|px-captcha|security.check/i.test(pageContent)
      || /verify.*human|are you a robot|complete.*captcha/i.test(pageContent)
      || pageUrl.includes('challenge');

    if (hasCaptcha) {
      return {
        route,
        date,
        error: 'captcha',
        message: 'Kayak presented a CAPTCHA challenge. Try again later or use a different approach.',
        checkedAt: new Date().toISOString(),
      };
    }

    // Try clicking "Show more results" or waiting for lazy-loaded content
    try {
      // Sometimes Kayak has a cookie consent banner — dismiss it
      const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("OK"), button:has-text("Got it")');
      if (await acceptBtn.count() > 0) {
        await acceptBtn.first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch (_) { /* ignore */ }

    // Extract all text from result cards
    // Kayak uses various selectors; grab all visible text from the results area
    const bodyText = await page.evaluate(() => {
      // Try to get the results container first
      const results = document.querySelector('[class*="resultsList"], [class*="Results"], [data-resultid], .nrc6');
      if (results) return results.innerText;
      // Fallback: get the whole body text
      return document.body.innerText;
    });

    if (!bodyText || bodyText.trim().length < 50) {
      return {
        route,
        date,
        error: 'no_results',
        message: 'No flight results found on the page.',
        checkedAt: new Date().toISOString(),
      };
    }

    // Parse Frontier flights from the text
    const flights = parseFrontierFlights(bodyText, route);

    if (flights.length === 0) {
      // Check if there were results but just no Frontier ones
      const hasAnyFlights = /\$\d+/.test(bodyText) && /[ap]m/i.test(bodyText);
      return {
        route,
        date,
        error: 'no_results',
        message: hasAnyFlights
          ? 'Flight results found but no Frontier flights on this route/date.'
          : 'No flight results found on the page.',
        flights: [],
        checkedAt: new Date().toISOString(),
      };
    }

    // Find cheapest
    const prices = flights
      .map(f => f.basicPrice ?? f.economyPrice ?? Infinity)
      .filter(p => p !== Infinity);
    const cheapest = prices.length > 0 ? Math.min(...prices) : null;

    return {
      route,
      date,
      flights,
      cheapest,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: node price-check.mjs <origin> <dest> <date> [date2] [date3] ...');
    console.error('Example: node price-check.mjs ATL TPA 2026-03-12');
    process.exit(1);
  }

  const origin = args[0].toUpperCase();
  const dest = args[1].toUpperCase();
  const dates = args.slice(2);

  // Validate dates
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`Invalid date format: ${d} (expected YYYY-MM-DD)`);
      process.exit(1);
    }
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--no-first-run',
      ],
    });

    if (dates.length === 1) {
      // Single date: output single result object
      const result = await scrapeDate(browser, origin, dest, dates[0]);
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Multiple dates: output array of results
      const results = [];
      for (const date of dates) {
        const result = await scrapeDate(browser, origin, dest, date);
        results.push(result);
        // Small delay between requests to be less bot-like
        if (dates.indexOf(date) < dates.length - 1) {
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        }
      }
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (err) {
    console.log(JSON.stringify({
      error: 'scrape_failed',
      message: err.message,
      checkedAt: new Date().toISOString(),
    }, null, 2));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
