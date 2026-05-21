ALTER TABLE reservations ADD COLUMN infants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN guest_surcharge_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN weekly_stay_discount_amount REAL NOT NULL DEFAULT 0;

UPDATE rentable_units
SET
  default_base_rate = 99,
  features_json = '["free_parking_one_vehicle","private_terrace"]',
  settings_json = '{"requiresVehicleType":false,"allowsWcShowerOption":false,"adultTouristTaxChf":3,"wcShowerCleaningFeeChf":0,"includedAdultsCount":1,"extraAdultNightlyRateChf":7,"extraChildNightlyRateChf":5,"longStayDiscountRate":0.25,"longStayDiscountTiers":[{"minNights":7,"rate":0.1},{"minNights":16,"rate":0.2},{"minNights":30,"rate":0.25},{"minNights":60,"rate":0.3}],"nonRefundableDiscountRate":0.1,"minStayNights":4,"maxGuests":4,"supportsInfants":true}',
  updated_at = '2026-05-20T00:00:00.000Z'
WHERE code = 'eco-studio';
