#!/bin/bash
# Fetch and parse iCloud calendar events for today
# Usage: ./fetch-calendar.sh [date] (default: today)

set -e

TARGET_DATE="${1:-$(date +%Y%m%d)}"
CALENDARS_FILE="/home/clawdbot/clawd/calendars.json"

if [ ! -f "$CALENDARS_FILE" ]; then
  echo "Error: calendars.json not found"
  exit 1
fi

# Extract URLs from JSON
URLS=$(jq -r '.calendars[].url' "$CALENDARS_FILE")

echo "=== Calendar Events for $(date -d "${TARGET_DATE}" +%Y-%m-%d 2>/dev/null || echo "$TARGET_DATE") ==="
echo ""

for URL in $URLS; do
  # Fetch the calendar
  ICS=$(curl -sL "$URL")
  
  # Extract calendar name
  CAL_NAME=$(echo "$ICS" | grep "X-WR-CALNAME:" | head -1 | cut -d: -f2-)
  
  # Parse events for the target date using awk
  echo "$ICS" | awk -v target="$TARGET_DATE" '
    BEGIN { in_event=0; summary=""; dtstart=""; dtend=""; }
    /^BEGIN:VEVENT/ { in_event=1; summary=""; dtstart=""; dtend=""; }
    /^END:VEVENT/ { 
      if (in_event && index(dtstart, target) > 0) {
        # Extract time portion
        if (match(dtstart, /T([0-9]{2})([0-9]{2})/, t)) {
          time = t[1] ":" t[2]
        } else {
          time = "All day"
        }
        print "  • " time " - " summary
      }
      in_event=0
    }
    in_event && /^SUMMARY:/ { summary=substr($0, 9) }
    in_event && /^DTSTART/ { 
      gsub(/.*:/, "", $0)
      dtstart=$0
    }
  '
done
