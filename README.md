# C & C - Direct Booking Platform for an Eco Studio and Parking

Official website: [candc.ch](https://candc.ch)

Multilingual marketing site and direct booking platform for:

- `parking-space`
- `eco-studio`

The public site is built with `Eleventy`. The booking engine runs on `Cloudflare Pages Functions` with `D1`, unit-aware pricing and availability, hosted checkout via `SumUp`, OTA sync through ICS, and self-service reservation management.
The public booking funnel is also prepared for browser-based agent use with `llms.txt`, `.well-known/site-context.json`, and progressive `WebMCP` exposure on reservation flows.

Suggested GitHub description:

`Multilingual Eleventy site and Cloudflare-based direct booking engine for a parking space and eco studio, with unit-aware pricing, OTA calendar sync, SumUp checkout, and self-service reservation management.`

## Current scope

Implemented today:

- multilingual marketing site
- dedicated parking booking funnel
- dedicated studio booking funnel
- booking backend with unit-aware data model
- SumUp hosted checkout integration
- Booking.com and optional Airbnb ICS import pipeline
- direct reservation export ICS per unit
- optional Google Calendar sync pipeline, disabled by default
- multilingual transactional email pipeline (FR, EN, DE studio emails; fallback EN for es, pt, it, nl)
- customer self-service booking management page
- minimal admin interface
- internal jobs endpoint for sync and localized arrival and departure emails
- WebMCP-ready public parking and studio booking flows, plus reservation management flow
- Booking.com as the primary imported external availability source, with optional Airbnb ICS sources when configured per unit

Still to complete:

- production Google Calendar credentials and optional re-enablement
- deeper end-to-end production monitoring over time

## Supported languages

- French `fr`
- English `en`
- German `de`
- Spanish `es`
- Portuguese `pt`
- Italian `it`
- Dutch `nl`

## Agent readiness

The repository now exposes two layers for AI agents:

- discovery/context files:
  - `https://candc.ch/llms.txt`
  - `https://candc.ch/.well-known/site-context.json`
- browser-native WebMCP on the live reservation experience

Current public WebMCP surfaces:

- `/{locale}/parking/booking/`
  - declarative tool: `start_parking_reservation_checkout`
  - imperative tools: `check_parking_availability`, `quote_parking_stay`
- `/{locale}/eco-studio/booking/`
  - declarative tool: `start_studio_reservation_checkout`
  - imperative tools: `check_studio_availability`, `quote_studio_stay`
- `/booking/manage/{token}`
  - declarative tool: `update_existing_reservation`

Important limitation:

- WebMCP currently requires a visible browser context. It complements the public booking APIs, but does not replace them for headless use cases.

## Tech stack

- `Eleventy` for the website
- `Nunjucks` templates
- `Cloudflare Pages` for hosting
- `Cloudflare Pages Functions` for booking APIs
- `Cloudflare D1` for booking data
- `Cloudflare Cron Triggers` for scheduled sync jobs
- `SumUp` for payment
- `Google Calendar API` for optional internal reservation visibility

## Security posture

This repository is public, so operational secrets and private calendar endpoints must stay outside git.

Current protections and conventions:

- booking payloads are validated server-side before pricing or reservation creation
- booking management links are opaque random tokens stored as `SHA-256` hashes in D1
- SumUp webhook processing re-fetches checkout state from SumUp before updating a reservation
- internal sync and admin routes require dedicated tokens
- Google Calendar sync is disabled by default unless explicitly configured
- Cloudflare Zaraz is used for analytics instead of embedding GA or GTM snippets in templates

Required deployment posture:

- keep real `wrangler.toml` values, ICS import URLs, feed tokens, Google Calendar IDs, and API secrets out of the repo
- enforce Cloudflare WAF or Rate Limiting on `POST /api/booking/reservations`, `POST /api/booking/quote`, `POST /api/booking/sumup/webhook`, and internal/admin endpoints
- review admin and sync logs so they do not expose raw calendar URLs, feed tokens, or payment secrets
- never synchronize internal notes or confidential pricing data into public ICS feeds or public agent-facing surfaces

See `SECURITY.md` and `BOOKING_TECH_SETUP.md` for the operational checklist.

## Key routes

Marketing pages:

- `/fr/`
- `/fr/eco-studio/`
- `/fr/parking/`
- `/fr/contact/`

Booking pages:

- `/fr/parking/booking/`
- `/fr/eco-studio/booking/`
- equivalent routes exist for all supported languages

API routes already scaffolded:

- `GET /api/booking/availability`
- `POST /api/booking/quote`
- `POST /api/booking/reservations`
- `GET /api/booking/manage/:token`
- `POST /api/booking/manage/:token`
- `GET /api/booking/ics/:feedToken`
- `POST /api/booking/sumup/webhook`
- `POST /api/internal/sync/booking-ics`
- `POST /api/internal/sync/google-calendar`
- `POST /api/internal/jobs/run`
- `GET /api/admin/booking`
- `POST /api/admin/booking`

## Installation

```bash
npm install
```

## Development

```bash
npm start
```

The local Eleventy site runs on `http://localhost:8080`.

## Build

```bash
npm run build
```

The generated site is written to `_site/`.

## Tests

```bash
npm test
```

Smoke tests currently verify:

- main localized pages
- parking and studio booking pages
- sitemap hreflang output
- robots.txt

Business logic tests now also verify:

- studio 4-night minimum stay
- studio max occupancy
- parking/studio pricing rules and discounts
- merged long-stay tiers, including the 7-night threshold
- automatic refund allocation logic

## Project structure

- `src/` site pages, templates, assets, translations
- `functions/` Cloudflare Pages Functions and shared booking logic
- `migrations/` D1 schema
- `scripts/` smoke tests and utilities
- `BOOKING_SYSTEM_SPEC.md` functional spec
- `BOOKING_TECH_SETUP.md` technical setup
- `DEPLOYMENT.md` deployment notes
- `AGENTS.md` contributor and AI guidance

## Booking architecture

The booking system is already designed for multiple rentable units.

Current seeded units:

- `parking-space`
- `eco-studio`

Each unit can have:

- separate Booking.com ICS source
- separate export ICS feed
- separate rate periods
- separate business settings
- separate booking UI later on

Operational sync note:

- the admin UI exposes `Run calendar sync`
- the admin UI also exposes `Validate OTA feeds`
- there is intentionally no separate `Run Airbnb sync` action in the admin UI
- the sync job imports all active OTA calendar sources configured in the system, including `booking` and `airbnb` when present for a unit

Refund note:

- eligible paid SumUp charges are now refunded automatically for self-service cancellations and negative booking deltas
- if a transaction reference is missing or SumUp refunding fails mid-flow, the system falls back to a manual refund-due record

Current payment fee assumption for the parking funnel:

- `2.5 %` applied to all payments until debit vs credit card type can be differentiated reliably before payment

Current studio pricing baseline:

- `99 CHF` base nightly rate
- `7 CHF` per additional adult and night
- `5 CHF` per child and night
- infants `0-2` free
- free parking for `1 vehicle`
- private terrace included
- `10 %` discount from `7` nights
- `20 %` discount from `16` nights
- `25 %` discount from `30` nights
- `30 %` discount from `60` nights
- `10 %` discount for voluntary non-refundable bookings

Current parking long-stay baseline:

- `10 %` discount from `7` nights
- `20 %` discount from `16` nights
- `25 %` discount from `30` nights
- `30 %` discount from `60` nights

Long-stay discount note:

- long-stay discounts are now configured as unit-level tiers
- the customer quote always shows them as a single `Long-stay discount` line
- the admin UI supports up to `4` tiers per unit

## Deployment notes

The site is intended for `Cloudflare Pages`.

Important:

- the static website builds to `_site`
- booking APIs live under `functions/`
- Cloudflare bindings and secrets are documented in `wrangler.toml.example`
- copy `wrangler.toml.example` locally and keep the real `wrangler.toml` untracked

## Analytics

Audience analysis is managed via **Cloudflare Zaraz**.

No GTM or GA snippets should be added directly into templates unless intentionally changing the analytics strategy.

## License

This project is licensed under the [CC BY-NC-SA 4.0](./LICENSE).
