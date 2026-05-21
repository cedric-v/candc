CREATE TABLE IF NOT EXISTS rentable_units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  unit_type TEXT NOT NULL,
  public_reference_prefix TEXT NOT NULL,
  display_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  default_base_rate REAL,
  google_calendar_id TEXT,
  check_in_start_time TEXT NOT NULL,
  check_in_end_time TEXT NOT NULL,
  check_out_time TEXT NOT NULL,
  max_concurrent_reservations INTEGER NOT NULL DEFAULT 1,
  features_json TEXT,
  settings_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rentable_units_type
  ON rentable_units (unit_type, is_active);

CREATE TABLE IF NOT EXISTS external_calendar_sources (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  source_code TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  import_url TEXT,
  export_feed_token TEXT,
  is_reference INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES rentable_units(id)
);

CREATE INDEX IF NOT EXISTS idx_external_calendar_sources_unit
  ON external_calendar_sources (unit_id, source_code, is_active);

CREATE INDEX IF NOT EXISTS idx_external_calendar_sources_feed_token
  ON external_calendar_sources (export_feed_token);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  unit_code TEXT NOT NULL,
  public_reference TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL DEFAULT 'fr',
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  guest_first_name TEXT NOT NULL,
  guest_last_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  vehicle_type TEXT,
  vehicle_length_m REAL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL DEFAULT 0,
  infants INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  guest_details_json TEXT,
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  check_in_start_time TEXT NOT NULL,
  check_in_end_time TEXT NOT NULL,
  check_out_time TEXT NOT NULL,
  wc_shower_requested INTEGER NOT NULL DEFAULT 0,
  wc_shower_confirmed INTEGER NOT NULL DEFAULT 0,
  refundable_policy_type TEXT NOT NULL,
  booked_at TEXT NOT NULL,
  arrival_less_than_24h INTEGER NOT NULL DEFAULT 0,
  base_rate_snapshot TEXT NOT NULL,
  base_amount REAL NOT NULL,
  tourist_tax_amount REAL NOT NULL,
  options_amount REAL NOT NULL,
  guest_surcharge_amount REAL NOT NULL DEFAULT 0,
  long_stay_discount_amount REAL NOT NULL,
  non_refundable_discount_amount REAL NOT NULL,
  weekly_stay_discount_amount REAL NOT NULL DEFAULT 0,
  payment_fee_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  google_calendar_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES rentable_units(id)
);

CREATE INDEX IF NOT EXISTS idx_reservations_unit_dates
  ON reservations (unit_code, check_in_date, check_out_date);

CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations (status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_checkout_id TEXT,
  provider_payment_reference TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CHF',
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_reservation
  ON payments (reservation_id);

CREATE TABLE IF NOT EXISTS rate_periods (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  nightly_base_rate REAL NOT NULL,
  label TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES rentable_units(id)
);

CREATE INDEX IF NOT EXISTS idx_rate_periods_window
  ON rate_periods (unit_id, start_date, end_date, is_active, priority);

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  source TEXT NOT NULL,
  external_uid TEXT,
  reservation_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES rentable_units(id),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_window
  ON calendar_blocks (unit_id, start_date, end_date, status);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_external_uid
  ON calendar_blocks (external_uid);

CREATE TABLE IF NOT EXISTS booking_tokens (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX IF NOT EXISTS idx_booking_tokens_reservation
  ON booking_tokens (reservation_id, purpose);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  unit_id TEXT,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  payload_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES rentable_units(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_type_created
  ON sync_logs (sync_type, created_at DESC);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  reservation_id TEXT,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

CREATE INDEX IF NOT EXISTS idx_email_logs_reservation
  ON email_logs (reservation_id, email_type);

INSERT OR IGNORE INTO rentable_units (
  id, code, unit_type, public_reference_prefix, display_name, currency, default_base_rate, google_calendar_id,
  check_in_start_time, check_in_end_time, check_out_time, max_concurrent_reservations,
  features_json, settings_json, is_active, created_at, updated_at
) VALUES
  (
    'unit_parking_space',
    'parking-space',
    'parking',
    'PARK',
    'C&C Parking Space',
    'CHF',
    20,
    'REPLACE_WITH_PARKING_GOOGLE_CALENDAR_ID',
    '15:00:00',
    '21:00:00',
    '10:00:00',
    1,
    '["electricity","drinking_water","waste_disposal","private_terrace"]',
    '{"requiresVehicleType":true,"allowsWcShowerOption":true,"adultTouristTaxChf":3,"wcShowerCleaningFeeChf":10,"longStayDiscountRate":0.15,"longStayDiscountTiers":[{"minNights":7,"rate":0.05},{"minNights":30,"rate":0.15}],"nonRefundableDiscountRate":0.1,"minStayNights":1}',
    1,
    '2026-05-20T00:00:00.000Z',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'unit_eco_studio',
    'eco-studio',
    'studio',
    'STUDIO',
    'C&C Eco Studio',
    'CHF',
    99,
    NULL,
    '15:00:00',
    '21:00:00',
    '10:00:00',
    1,
    '["free_parking_one_vehicle","private_terrace"]',
    '{"requiresVehicleType":false,"allowsWcShowerOption":false,"adultTouristTaxChf":3,"wcShowerCleaningFeeChf":0,"includedAdultsCount":1,"extraAdultNightlyRateChf":7,"extraChildNightlyRateChf":5,"longStayDiscountRate":0.25,"longStayDiscountTiers":[{"minNights":7,"rate":0.05},{"minNights":16,"rate":0.2},{"minNights":30,"rate":0.25},{"minNights":60,"rate":0.3}],"nonRefundableDiscountRate":0.1,"minStayNights":4,"maxGuests":4,"supportsInfants":true}',
    1,
    '2026-05-20T00:00:00.000Z',
    '2026-05-20T00:00:00.000Z'
  );

INSERT OR IGNORE INTO external_calendar_sources (
  id, unit_id, source_code, source_kind, import_url, export_feed_token, is_reference,
  is_active, last_synced_at, created_at, updated_at
) VALUES
  (
    'calendar_parking_booking',
    'unit_parking_space',
    'booking',
    'ics',
    'REPLACE_WITH_PARKING_BOOKING_ICS_URL',
    'REPLACE_WITH_PARKING_EXPORT_FEED_TOKEN',
    1,
    1,
    NULL,
    '2026-05-20T00:00:00.000Z',
    '2026-05-20T00:00:00.000Z'
  ),
  (
    'calendar_studio_booking',
    'unit_eco_studio',
    'booking',
    'ics',
    'REPLACE_WITH_STUDIO_BOOKING_ICS_URL',
    'REPLACE_WITH_STUDIO_EXPORT_FEED_TOKEN',
    1,
    1,
    NULL,
    '2026-05-20T00:00:00.000Z',
    '2026-05-20T00:00:00.000Z'
  );
