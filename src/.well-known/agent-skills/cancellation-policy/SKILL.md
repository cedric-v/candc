---
name: cancellation-policy
description: Explain the C&C cancellation policy, reservation changes, and how to manage an existing reservation with its token.
---

# Cancellation and reservation management

## Cancellation policy

- Free cancellation until 48 h before arrival, full refund without fees.
- Reservations made through "Non-Refundable" special offers are excluded from this flexibility.

## Managing an existing reservation

Every direct reservation gets a management URL:

```
https://candc.ch/booking/manage/{token}
```

From there (or via the API with the token) the traveller can:

- view the reservation,
- update details: `POST https://candc.ch/api/booking/reservations/{token}/update`,
- refresh the quote: `POST https://candc.ch/api/booking/reservations/{token}/requote`,
- cancel: `POST https://candc.ch/api/booking/reservations/{token}/cancel`.

## Guidance

- Never cancel or modify a reservation without the user's explicit confirmation.
- For changes that alter dates or party size, run a fresh quote first and show the price difference.
