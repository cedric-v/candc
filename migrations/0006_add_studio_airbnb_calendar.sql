-- Add Airbnb calendar source for eco-studio
INSERT OR IGNORE INTO external_calendar_sources (
  id, unit_id, source_code, source_kind, import_url, export_feed_token, is_reference,
  is_active, last_synced_at, created_at, updated_at
) VALUES (
  'calendar_studio_airbnb',
  'unit_eco_studio',
  'airbnb',
  'ics',
  'REPLACE_WITH_STUDIO_AIRBNB_ICS_URL',
  NULL,
  0,
  1,
  NULL,
  '2026-05-20T17:20:00.000Z',
  '2026-05-20T17:20:00.000Z'
);
