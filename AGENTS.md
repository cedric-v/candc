# AGENTS.md

## Purpose

This repository contains:

- a multilingual Eleventy marketing site
- an in-progress direct booking platform for C & C

Use this file as a quick operational guide before editing code.

## Current architecture

- `src/` public site content, templates, assets, translations
- `functions/` Cloudflare Pages Functions and booking logic
- `migrations/` D1 schema
- `scripts/` smoke tests
- `src/llms.txt` and `src/.well-known/site-context.json` agent discovery/context files

Core booking docs:

- `BOOKING_SYSTEM_SPEC.md`
- `BOOKING_TECH_SETUP.md`
- `PROJECT_SUMMARY.md`

## Product model

The booking engine is multi-unit.

Current seeded units:

- `parking-space`
- `eco-studio`

Important:

- parking is exposed through a public booking funnel
- studio is also exposed through a public booking funnel

## Editing guidance

- preserve existing multilingual structure
- do not assume booking logic is parking-only unless the file is explicitly parking UI
- prefer extending unit-level settings instead of hardcoding business rules
- keep public site content static-friendly unless a dynamic flow is clearly required
- GA4 is loaded via a single consent-gated gtag snippet in
  `src/_includes/base.njk` (loaded only after the visitor accepts cookies in
  the banner); the measurement ID is injected at build time from the
  `GA_MEASUREMENT_ID` env var (Cloudflare Pages dashboard / local `.env`,
  see `.env.example`) — never hardcode it; do not add other GA/GTM snippets
  elsewhere, and do not load GA before consent
- preserve existing agent-ready surfaces unless you are intentionally changing discovery or WebMCP behavior

## Booking-specific guidance

Pending-payment behavior (important):

- a direct booking holds its dates for `PENDING_PAYMENT_HOLD_MINUTES` (default 30) via a `pending_payment` calendar block; after expiry the reservation becomes `payment_expired` and the dates are released
- the ICS export feed only contains confirmed stays (`confirmed`, `modified`, `refund_due`, `pending_refund`) — pending holds never block Booking.com/other OTAs
- availability is re-checked before confirming any payment (SumUp webhook) and before resuming payment (`resume_payment`); a conflict leads to a refund and `conflict_refund_due` (initial) or a revert to `modified` (unpaid adjustment)

When changing booking behavior, check all of:

- `functions/_lib/validation.js`
- `functions/_lib/pricing.js`
- `functions/_lib/db.js`
- `functions/_lib/catalog.js`
- `migrations/0001_booking_schema.sql`
- any follow-up migration if pricing tiers changed, notably `migrations/0008_merge_weekly_discount_into_long_stay_tiers.sql`

When changing public booking UI, also check:

- `src/_includes/booking-page.njk`
- `src/assets/js/booking-flow.js`
- `src/llms.txt`
- `src/.well-known/site-context.json`

When changing the customer-facing management or payment-confirmation pages, also check:

- `functions/_lib/manage-i18n.js` — UI strings for the manage + confirmation pages in all 7 site languages (fr, en, de, es, pt, it, nl)
- `functions/booking/manage/[token].js` — renders in the reservation's stored `locale` (Accept-Language fallback)
- `functions/booking/confirmation.js` — same locale logic for the post-payment page
- `functions/api/booking/manage/[token].js` — status notices must stay in sync with `manage-i18n.js`

Current WebMCP exposure:

- public parking booking page exposes:
  - declarative checkout form metadata
  - imperative read-only availability and quote tools
- public studio booking page exposes:
  - declarative checkout form metadata
  - imperative read-only availability and quote tools
- booking management page exposes declarative update metadata
- admin pages are intentionally not documented as public WebMCP surfaces

When changing sync behavior, also check:

- `functions/api/internal/sync/booking-ics.js`
- `functions/api/internal/sync/google-calendar.js`
- `functions/api/booking/sumup/webhook.js`
- `functions/_lib/ntfy.js`
- `functions/_lib/jobs.js`

## Admin alerts and monitoring

- `functions/_lib/alerts.js` — `sendAdminAlert()` warns the admin
  (`ADMIN_NOTIFICATION_EMAIL`, default bonjour@candc.ch) by email (Resend)
  and ntfy push on booking-critical server errors only: reservation
  creation 500, SumUp checkout/webhook failures, availability/quote 500s.
  Deduped to one alert per key per 30 min (via `email_logs`, reservation_id
  NULL). Never used for normal 400/409 responses. Check all error paths in:
  `functions/api/booking/reservations.js`, `availability.js`, `quote.js`,
  `functions/api/booking/sumup/webhook.js`.
- `runFunnelHealthCheck` (jobs.js, action `funnel_check`) — read-only
  periodic probe (availability + quote for future windows, no reservation
  created) triggered every 2 h by the sync worker; alerts the admin on
  failure. `functions/api/internal/jobs/run.js` exposes the action.
- `runSensitiveDataRetention` (jobs.js, action `retention`, daily 04:20 via
  sync worker, manual trigger in admin) — anonymizes the sensitive guest
  identity fields (`guest_id_document_number`, `guest_nationality`,
  `guest_date_of_birth`) once the stay ended more than
  `SENSITIVE_DATA_RETENTION_MONTHS` (default 12) ago; booking/billing data
  stays (10-year accounting records). See the privacy policy
  (`src/fr/legal.njk`, section "Durée de conservation des données").
- On direct-booking creation, in addition to the CC'd confirmation email, a
  dedicated `admin_new_booking` alert email (French, full guest contact
  details, ID document number masked for LPD/GDPR compliance) is sent to
  `ADMIN_NOTIFICATION_EMAIL` via `sendNewBookingAdminEmail` (booking-ops.js).
  The admin dashboard shows per-reservation expandable guest details with a
  masked-by-default ID document number (`functions/admin/booking.js`,
  `functions/api/admin/booking.js`, `listAdminReservations` in db.js).
- Post-deploy verification: `.github/workflows/deploy-check.yml` waits for
  the Cloudflare Pages deployment, builds, runs `npm test` and the live
  payment funnel check (`npm run check:payment`). Needs the optional
  `CF_API_TOKEN` repo secret (Pages read + account read) to wait for the
  exact deployment instead of a fixed delay.

## Verification

Run after meaningful changes:

```bash
npm run build
npm test
```

If editing functions-only logic, import checks via Node ESM are also useful.

After deploying to production (or after ANY Cloudflare env-var change), verify the live payment funnel:

```bash
npm run check:payment
```

(exit 0 = SumUp secrets bound and a hosted-checkout link is generated; exit 1 = secrets missing, restore with `npm run secrets:push` and redeploy — see DEPLOYMENT.md "Processus recommande").

A GitHub Action (`.github/workflows/deploy-check.yml`) runs this check
automatically after every push to `main` once the Pages deployment is live.

## Known unfinished areas

- production credential wiring
- Google Calendar remains optional and disabled by default in production until credentials are finalized
- automatic refunds now exist, but fallback to manual follow-up if SumUp transaction coverage is incomplete or a refund API call fails

## Current pricing note

- long-stay discounts are unit-specific tiers
- the quote UI now shows a single `Long-stay discount` line only
- the old separate `7+ nights` discount line has been merged into those tiers
- the admin UI supports up to `4` tiers per unit

## Contributor note

If you add a new rentable unit, update:

- `rentable_units` seed data
- any relevant `external_calendar_sources`
- front funnel entrypoints if the unit should be customer-facing

## Git hygiene (parallel work)

Another agent/session is working in parallel on this repository (e.g. manage-token
lifecycle refactors). The working tree can therefore contain uncommitted changes
that are NOT yours at any moment.

- always check `git status --short` before committing and stage ONLY the files
  you touched (explicit `git add <file>...`), never `git add -A`
- never commit or revert files modified by the parallel session
- if you need a full snapshot, prefer `git stash -u` or commit your own files only
