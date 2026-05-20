# C & C - Eco Studio & Parking

Official website: [candc.ch](https://candc.ch)

Multilingual marketing site and in-progress direct booking platform for:

- `parking-space`
- `eco-studio`

The public site is built with `Eleventy`. The booking engine is being added with `Cloudflare Pages Functions`, `D1`, ICS synchronization, SumUp payments, and Google Calendar sync.

## Current scope

Implemented today:

- multilingual marketing site
- dedicated parking booking funnel
- booking backend scaffold with unit-aware data model
- SumUp hosted checkout integration scaffold
- Booking.com ICS import scaffold
- Google Calendar sync scaffold
- transactional email pipeline
- customer self-service booking management page
- minimal admin interface
- internal jobs endpoint for sync and arrival emails

Still to complete:

- studio-specific booking funnel
- automatic SumUp refunds
- final Cloudflare cron deployment for internal jobs

## Supported languages

- French `fr`
- English `en`
- German `de`
- Spanish `es`
- Portuguese `pt`
- Italian `it`
- Dutch `nl`

## Tech stack

- `Eleventy` for the website
- `Nunjucks` templates
- `Cloudflare Pages` for hosting
- `Cloudflare Pages Functions` for booking APIs
- `Cloudflare D1` for booking data
- `Cloudflare Cron Triggers` for scheduled sync jobs
- `SumUp` for payment
- `Google Calendar API` for internal reservation visibility

## Key routes

Marketing pages:

- `/fr/`
- `/fr/eco-studio/`
- `/fr/parking/`
- `/fr/contact/`

Booking pages:

- `/fr/parking/booking/`
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
- parking booking pages
- sitemap hreflang output
- robots.txt

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

Current payment fee assumption for the parking funnel:

- `2.5 %` applied to all payments until debit vs credit card type can be differentiated reliably before payment

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
