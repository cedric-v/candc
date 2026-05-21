# C & C - Eco Studio & Parking

Official website: [candc.ch](https://candc.ch)

Multilingual marketing site and in-progress direct booking platform for:

- `parking-space`
- `eco-studio`

The public site is built with `Eleventy`. The booking engine is being added with `Cloudflare Pages Functions`, `D1`, ICS synchronization, SumUp payments, and optional Google Calendar sync.
The public booking funnel is also prepared for browser-based agent use with `llms.txt`, `.well-known/site-context.json`, and progressive `WebMCP` exposure on reservation flows.

## Current scope

Implemented today:

- multilingual marketing site
- dedicated parking booking funnel
- dedicated studio booking funnel
- booking backend scaffold with unit-aware data model
- SumUp hosted checkout integration
- Booking.com ICS import pipeline
- optional Google Calendar sync pipeline, disabled by default
- multilingual transactional email pipeline
- customer self-service booking management page
- minimal admin interface
- internal jobs endpoint for sync and localized arrival emails
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
- `15 %` discount from `30` nights

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

## Analytics

Audience analysis is managed via **Cloudflare Zaraz**.

No GTM or GA snippets should be added directly into templates unless intentionally changing the analytics strategy.

## License

This project is licensed under the [CC BY-NC-SA 4.0](./LICENSE).
