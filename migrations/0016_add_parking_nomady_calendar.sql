-- Ajoute le calendrier Nomady du parking (import uniquement).
-- Nomady exporte ses disponibilites dans un flux iCal ; on l'importe pour
-- bloquer les dates vendues sur Nomady cote reservation directe. Comme
-- Airbnb, cette source n'a pas de token d'export : le flux d'export de
-- l'unite reste porte par la source Booking de reference
-- (calendar_parking_booking) et peut etre partage avec Nomady.
INSERT OR IGNORE INTO external_calendar_sources (
  id, unit_id, source_code, source_kind, import_url, export_feed_token, is_reference,
  is_active, last_synced_at, created_at, updated_at
) VALUES (
  'calendar_parking_nomady',
  'unit_parking_space',
  'nomady',
  'ics',
  'https://api.nomady.camp/calendar-export/2bb5b7eb-d471-4cd5-9083-dbc73b59c536/cabin/3718/availability.ics',
  NULL,
  0,
  1,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
