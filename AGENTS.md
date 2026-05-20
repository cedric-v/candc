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
- avoid adding direct GA/GTM snippets; analytics is managed through Cloudflare Zaraz
- preserve existing agent-ready surfaces unless you are intentionally changing discovery or WebMCP behavior

## Booking-specific guidance

When changing booking behavior, check all of:

- `functions/_lib/validation.js`
- `functions/_lib/pricing.js`
- `functions/_lib/db.js`
- `functions/_lib/catalog.js`
- `migrations/0001_booking_schema.sql`

When changing public booking UI, also check:

- `src/_includes/booking-page.njk`
- `src/assets/js/booking-flow.js`
- `src/llms.txt`
- `src/.well-known/site-context.json`

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

## Verification

Run after meaningful changes:

```bash
npm run build
npm test
```

If editing functions-only logic, import checks via Node ESM are also useful.

## Known unfinished areas

- production credential wiring
- Google Calendar remains optional and disabled by default in production until credentials are finalized
- automatic refunds now exist, but fallback to manual follow-up if SumUp transaction coverage is incomplete or a refund API call fails

## Contributor note

If you add a new rentable unit, update:

- `rentable_units` seed data
- any relevant `external_calendar_sources`
- front funnel entrypoints if the unit should be customer-facing
