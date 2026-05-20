ALTER TABLE rentable_units
ADD COLUMN google_calendar_id TEXT;

UPDATE rentable_units
SET google_calendar_id = 'REPLACE_WITH_PARKING_GOOGLE_CALENDAR_ID'
WHERE code = 'parking-space'
  AND (google_calendar_id IS NULL OR google_calendar_id = '');

UPDATE external_calendar_sources
SET import_url = 'REPLACE_WITH_PARKING_BOOKING_ICS_URL'
WHERE source_code = 'booking'
  AND unit_id = 'unit_parking_space'
  AND (import_url IS NULL OR import_url = '');

UPDATE external_calendar_sources
SET import_url = 'REPLACE_WITH_STUDIO_BOOKING_ICS_URL'
WHERE source_code = 'booking'
  AND unit_id = 'unit_eco_studio'
  AND (import_url IS NULL OR import_url = '');
