---
name: quote-stay
description: Calculate a direct-booking price quote for a C&C stay (parking space or eco studio), including city tax and long-stay discounts. Use after availability is confirmed.
---

# Quote a stay

## 1. Browser WebMCP tool (when a booking page is open)

On https://candc.ch/fr/parking/booking/ use `quote_parking_stay`; on https://candc.ch/fr/eco-studio/booking/ use `quote_studio_stay`. Both take `checkInDate` and `checkOutDate` (YYYY-MM-DD), plus party details (adults, children; vehicle type for the parking).

## 2. Public API (headless)

```
POST https://candc.ch/api/booking/quote
Content-Type: application/json

{
  "unitCode": "parking-space",        // or "eco-studio"
  "checkInDate": "2026-10-15",
  "checkOutDate": "2026-10-17",
  "vehicleType": "van",               // parking only
  "adults": 2,
  "children": 0,
  "infants": 0                        // studio only
}
```

## Pricing reference

- Parking: 20 CHF / night + 3 CHF city tax per adult / night. Optional extras: indoor shower/WC 10 CHF / week, EV charging 15 CHF (10 h) or 30 CHF (full night).
- Studio: seasonal nightly rate (roughly 120–160 CHF), minimum 4 nights.
- Long-stay discounts apply automatically per unit (10 % from 7 nights, 20 % from 16, 25 % from 30, 30 % from 60). The quote exposes a single "Long-stay discount" line.

Always present the quote as an estimate until the reservation is confirmed by the user.
