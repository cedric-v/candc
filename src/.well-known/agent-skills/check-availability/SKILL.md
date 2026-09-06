---
name: check-availability
description: Check whether the C&C parking space or eco studio is available for a given date range. Use before quoting or booking. Requires check-in and check-out dates.
---

# Check availability

Two options, in order of preference:

## 1. Browser WebMCP tool (when a booking page is open)

On https://candc.ch/fr/parking/booking/ use the `check_parking_availability` tool; on https://candc.ch/fr/eco-studio/booking/ use `check_studio_availability`. Both take:

- `checkInDate` (YYYY-MM-DD)
- `checkOutDate` (YYYY-MM-DD)

## 2. Public API (headless)

```
GET https://candc.ch/api/booking/availability?from={YYYY-MM-DD}&to={YYYY-MM-DD}&unitCode={parking-space|eco-studio}
```

The response includes available day ranges, blocked ranges, and nightly rates.

## Guidance

- Check-out-only days can be bookable (departure days are not always blocked).
- Respect the studio's minimum stay of 4 nights when interpreting results.
- If dates are unavailable, offer the nearest alternative dates based on the blocked ranges.
