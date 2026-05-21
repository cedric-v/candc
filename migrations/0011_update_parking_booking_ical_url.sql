UPDATE external_calendar_sources
SET import_url = 'REPLACE_WITH_PARKING_BOOKING_ICS_URL',
    updated_at = CURRENT_TIMESTAMP
WHERE source_code = 'booking'
  AND unit_id = 'unit_parking_space';
