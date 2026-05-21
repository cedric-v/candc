-- Add cleaning fee configuration to eco-studio settings_json
UPDATE rentable_units
SET settings_json = '{"requiresVehicleType":false,"allowsWcShowerOption":false,"adultTouristTaxChf":3,"wcShowerCleaningFeeChf":0,"includedAdultsCount":1,"extraAdultNightlyRateChf":7,"extraChildNightlyRateChf":5,"longStayDiscountRate":0.25,"longStayDiscountTiers":[{"minNights":7,"rate":0.05},{"minNights":16,"rate":0.2},{"minNights":30,"rate":0.25},{"minNights":60,"rate":0.3}],"nonRefundableDiscountRate":0.1,"minStayNights":4,"maxGuests":4,"supportsInfants":true,"cleaningFeeChf":64,"cleaningFeeThresholdNights":5}',
    updated_at = '2026-05-20T16:55:00.000Z'
WHERE code = 'eco-studio';
