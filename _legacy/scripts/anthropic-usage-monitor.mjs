#!/usr/bin/env node
/**
 * Anthropic Usage Monitor
 * 
 * Monitors Anthropic API usage (5-hour and 7-day windows) and sends
 * Telegram notifications when usage crosses configurable thresholds
 * or when limits reset.
 * 
 * Usage: node anthropic-usage-monitor.mjs [--dry-run] [--verbose]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Configuration ──────────────────────────────────────────────────
const THRESHOLDS = [25, 50, 75, 90, 95, 99]; // percentage thresholds
const RESET_DROP_THRESHOLD = 15; // if usage drops by more than this %, consider it a reset

const AUTH_PROFILES_PATH = "/home/clawdbot/.openclaw/agents/main/agent/auth-profiles.json";
const STATE_FILE_PATH = "/home/clawdbot/clawd/scripts/.usage-monitor-state.json";
const OPENCLAW_CONFIG_PATH = "/home/clawdbot/.openclaw/openclaw.json";

// Anthropic OAuth constants (from pi-ai)
const CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

// CLI flags
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

// ── Helpers ────────────────────────────────────────────────────────
function log(...args) {
  if (VERBOSE || DRY_RUN) console.log(`[${new Date().toISOString()}]`, ...args);
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ── Telegram ───────────────────────────────────────────────────────
function getTelegramConfig() {
  const config = loadJson(OPENCLAW_CONFIG_PATH);
  const botToken = config?.channels?.telegram?.botToken;
  if (!botToken) throw new Error("No Telegram bot token found in config");
  return { botToken, chatId: "8511108690" };
}

async function sendTelegram(message) {
  const { botToken, chatId } = getTelegramConfig();
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would send Telegram:\n${message}`);
    return;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
      disable_notification: false,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Telegram send failed: ${resp.status} ${err}`);
  } else {
    log("Telegram message sent successfully");
  }
}

// ── OAuth Token Management ─────────────────────────────────────────
function loadAuthProfiles() {
  const data = loadJson(AUTH_PROFILES_PATH);
  if (!data?.profiles) throw new Error("Cannot read auth profiles");
  return data;
}

function saveAuthProfiles(data) {
  saveJson(AUTH_PROFILES_PATH, data);
}

async function refreshToken(refreshTokenStr) {
  log("Refreshing Anthropic OAuth token...");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshTokenStr,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${resp.status} ${err}`);
  }
  const data = await resp.json();
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

async function getValidToken() {
  const store = loadAuthProfiles();
  
  // Try profiles in order of preference
  for (const profileId of ["anthropic:claude-cli", "anthropic:manual"]) {
    const profile = store.profiles[profileId];
    if (!profile) continue;
    
    if (profile.type === "oauth") {
      let { access, refresh, expires } = profile;
      
      if (Date.now() >= expires) {
        // Need to refresh
        try {
          const refreshed = await refreshToken(refresh);
          // Update stored profile
          store.profiles[profileId] = {
            ...profile,
            access: refreshed.access,
            refresh: refreshed.refresh,
            expires: refreshed.expires,
          };
          saveAuthProfiles(store);
          log(`Token refreshed for ${profileId}, expires at ${new Date(refreshed.expires).toISOString()}`);
          return refreshed.access;
        } catch (err) {
          log(`Failed to refresh ${profileId}: ${err.message}`);
          continue;
        }
      }
      return access;
    }
    
    if (profile.type === "token" && profile.token) {
      return profile.token;
    }
  }
  
  throw new Error("No valid Anthropic token found");
}

// ── Usage API ──────────────────────────────────────────────────────
async function fetchUsage(token) {
  const resp = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "openclaw-usage-monitor",
      Accept: "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Usage API failed: ${resp.status} ${err}`);
  }
  return resp.json();
}

// ── State Management ───────────────────────────────────────────────
function loadState() {
  const state = loadJson(STATE_FILE_PATH);
  return state || {
    windows: {},
    lastCheck: null,
  };
}

function saveState(state) {
  state.lastCheck = new Date().toISOString();
  saveJson(STATE_FILE_PATH, state);
}

// ── Threshold Logic ────────────────────────────────────────────────
function getHighestCrossedThreshold(usedPercent) {
  let highest = null;
  for (const t of THRESHOLDS) {
    if (usedPercent >= t) highest = t;
  }
  return highest;
}

function checkWindow(windowName, utilization, resetsAt, state) {
  // Anthropic returns utilization already as a percentage (0-100+)
  const usedPercent = Math.round(utilization * 100) / 100; // 2 decimal places
  const notifications = [];
  
  const prev = state.windows[windowName] || {
    lastPercent: 0,
    alertedThresholds: [],
    lastResetAt: null,
  };
  
  log(`${windowName}: ${usedPercent}% (prev: ${prev.lastPercent}%)`);
  
  // Check for reset: usage dropped significantly
  const dropped = prev.lastPercent - usedPercent;
  if (dropped > RESET_DROP_THRESHOLD && prev.lastPercent > 0) {
    notifications.push({
      type: "reset",
      window: windowName,
      message: `🔄 <b>${windowName} limit has reset!</b>\nUsage dropped from ${prev.lastPercent}% → ${usedPercent}%` +
        (resetsAt ? `\nNext reset: ${formatResetTime(resetsAt)}` : ""),
    });
    // Clear alerted thresholds on reset
    prev.alertedThresholds = [];
  }
  
  // Check threshold crossings (going up)
  for (const threshold of THRESHOLDS) {
    if (usedPercent >= threshold && !prev.alertedThresholds.includes(threshold)) {
      const emoji = threshold >= 95 ? "🚨" : threshold >= 90 ? "⚠️" : threshold >= 75 ? "📊" : "📈";
      notifications.push({
        type: "threshold",
        window: windowName,
        threshold,
        message: `${emoji} <b>Anthropic ${windowName} usage: ${usedPercent}%</b>\nCrossed ${threshold}% threshold` +
          (resetsAt ? `\nResets: ${formatResetTime(resetsAt)}` : ""),
      });
      prev.alertedThresholds.push(threshold);
    }
  }
  
  // Update state
  prev.lastPercent = usedPercent;
  if (resetsAt) prev.lastResetAt = resetsAt;
  state.windows[windowName] = prev;
  
  return notifications;
}

function formatResetTime(resetsAt) {
  const resetDate = new Date(resetsAt);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  
  if (diffMs <= 0) return "imminent";
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `in ${days}d ${remainHours}h (${resetDate.toISOString().replace("T", " ").slice(0, 16)} UTC)`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  log("Starting Anthropic usage check...");
  
  try {
    // Get a valid token
    const token = await getValidToken();
    log("Got valid token");
    
    // Fetch usage
    const usage = await fetchUsage(token);
    log("Usage data:", JSON.stringify(usage, null, 2));
    
    // Load state
    const state = loadState();
    const allNotifications = [];
    
    // Check each window
    if (usage.five_hour?.utilization !== undefined) {
      const notifs = checkWindow(
        "5-Hour",
        usage.five_hour.utilization,
        usage.five_hour.resets_at,
        state
      );
      allNotifications.push(...notifs);
    }
    
    if (usage.seven_day?.utilization !== undefined) {
      const notifs = checkWindow(
        "7-Day",
        usage.seven_day.utilization,
        usage.seven_day.resets_at,
        state
      );
      allNotifications.push(...notifs);
    }
    
    if (usage.seven_day_sonnet?.utilization !== undefined) {
      const notifs = checkWindow(
        "7-Day Sonnet",
        usage.seven_day_sonnet.utilization,
        null,
        state
      );
      allNotifications.push(...notifs);
    }
    
    if (usage.seven_day_opus?.utilization !== undefined) {
      const notifs = checkWindow(
        "7-Day Opus",
        usage.seven_day_opus.utilization,
        null,
        state
      );
      allNotifications.push(...notifs);
    }
    
    // Save state
    saveState(state);
    
    // Send notifications
    if (allNotifications.length > 0) {
      // Group notifications into a single message if multiple
      if (allNotifications.length === 1) {
        await sendTelegram(allNotifications[0].message);
      } else {
        const combined = allNotifications.map(n => n.message).join("\n\n");
        await sendTelegram(`🤖 <b>Anthropic Usage Alert</b>\n\n${combined}`);
      }
      log(`Sent ${allNotifications.length} notification(s)`);
    } else {
      log("No thresholds crossed, no notifications needed");
    }
    
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
