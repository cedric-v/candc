-- Set base rate of parking to 40 CHF from May 20 to May 31, 2026 (inclusive)
-- Checkout is June 1, 2026 (exclusive)
INSERT OR REPLACE INTO rate_periods (
  id, unit_id, start_date, end_date, nightly_base_rate, label, priority, is_active, created_at, updated_at
) VALUES (
  'rate_parking_may_2026',
  'unit_parking_space',
  '2026-05-20',
  '2026-06-01',
  40.0,
  'Parking May 2026 Special Rate',
  100,
  1,
  '2026-05-20T18:05:00.000Z',
  '2026-05-20T18:05:00.000Z'
);
