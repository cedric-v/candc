-- Update Airbnb ICS import URL for eco-studio
UPDATE external_calendar_sources
SET import_url = 'https://fr.airbnb.ch/calendar/ical/4116019.ics?t=c88cbc5bee954fe3976d8c365c860ff8',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'calendar_studio_airbnb';
