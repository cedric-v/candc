# Security Notes

## Public repository rules

This repository is public. Do not commit:

- real `wrangler.toml` values
- API keys or webhook secrets
- internal sync or admin tokens
- Booking.com or Airbnb ICS import URLs
- direct reservation export feed tokens
- private Google Calendar identifiers
- operational notes that should stay internal

Use `wrangler.toml.example` as the committed template and keep the live `wrangler.toml` local-only.

## Current server-side controls

- booking and quote payloads are validated server-side in `functions/_lib/validation.js`
- reservation management uses opaque random tokens stored as `SHA-256` hashes
- SumUp webhook handling re-checks the checkout via SumUp before changing reservation state
- internal sync routes and admin routes require dedicated tokens
- Google Calendar sync is opt-in and disabled by default

## Cloudflare protections to enable

Enable these controls in Cloudflare for production:

- WAF or Rate Limiting on `POST /api/booking/reservations`
- WAF or Rate Limiting on `POST /api/booking/quote`
- WAF or Rate Limiting on `POST /api/booking/sumup/webhook`
- strict token-gated access on `/api/internal/*` and `/api/admin/*`
- Bot management or managed challenge on high-risk write endpoints when legitimate traffic allows it

Recommended starting points:

- `POST /api/booking/reservations`: `10` requests per minute per IP with temporary block or managed challenge
- `POST /api/booking/quote`: `30` requests per minute per IP
- `POST /api/booking/sumup/webhook`: allowlist SumUp if possible, otherwise low-noise rate limiting plus request logging
- `/api/internal/*` and `/api/admin/*`: block by default unless valid token is present, and optionally restrict by IP for operations

Tune thresholds with real traffic once production telemetry exists.

## Calendar and sync hygiene

- keep OTA import URLs in D1 or Cloudflare secrets, not in git
- keep export feed tokens long, random, and rotatable
- never expose raw import URLs or feed tokens in admin responses, logs, screenshots, or docs
- never put internal notes, private pricing rationale, or payout details into ICS summaries or descriptions
- keep public ICS feeds limited to the minimum availability information needed by OTA sync

## Payment hygiene

- use SumUp hosted checkout so card data never touches this application
- store only the payment metadata needed for reconciliation and refunds
- do not trust webhook payload state alone; confirm with SumUp before final state changes
- keep refund fallbacks documented for cases where automatic refund coverage is incomplete

## Documentation expectations

Any security-sensitive change to booking, payment, or calendar sync should be reflected in:

- `README.md`
- `BOOKING_TECH_SETUP.md`
- `PROJECT_SUMMARY.md`
- `AGENTS.md` when contributor guidance changes
