-- Update Booking.com ICS import URLs for both units
UPDATE external_calendar_sources
SET import_url = 'https://ical.booking.com/v1/export?t=2faeb1bf-0c21-4b89-be6f-ae26b951fb77',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'calendar_studio_booking';

UPDATE external_calendar_sources
SET import_url = 'https://ical.booking.com/v1/export?t=a9da110d-8d82-4c99-98e4-3ff0aa1dfe00',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'calendar_parking_booking';
