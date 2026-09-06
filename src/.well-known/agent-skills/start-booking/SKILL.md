---
name: start-booking
description: Start the direct-booking checkout for a C&C parking space or eco studio reservation. The user always confirms dates, traveller details, and payment themselves.
---

# Start a booking

## Recommended flow

1. `check-availability` for the requested dates and unit.
2. `quote-stay` so the user sees the price including tax and discounts.
3. `start-booking` (this skill) to open the checkout.
4. The user fills in / confirms traveller details and pays via SumUp.

Never create a reservation without the user's explicit confirmation of dates and price.

## Browser WebMCP (when a booking page is open)

- Parking: https://candc.ch/fr/parking/booking/ — declarative tool `start_parking_reservation_checkout` attached to the booking form.
- Studio: https://candc.ch/fr/eco-studio/booking/ — declarative tool `start_studio_reservation_checkout`.

The tool prepares the reservation from the form fields (checkInDate, checkOutDate, adults, children, vehicleType/infants, contact details) and sends the traveller to payment.

## API (headless)

```
POST https://candc.ch/api/booking/reservations
Content-Type: application/json

{ "unitCode": "parking-space", "checkInDate": "...", "checkOutDate": "...", ... }
```

The response includes a reservation reference, a management URL of the form
`https://candc.ch/booking/manage/{token}`, and a payment link when applicable.

## After booking

- Point the user to the management link to view, modify, or cancel the reservation.
- Cancellation is free until 48 h before arrival (except non-refundable special offers) — see the cancellation-policy skill.
