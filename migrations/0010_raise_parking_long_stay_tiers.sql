UPDATE rentable_units
SET
  settings_json = json_set(
    COALESCE(settings_json, '{}'),
    '$.longStayDiscountTiers',
    json('[{"minNights":7,"rate":0.1},{"minNights":16,"rate":0.2},{"minNights":30,"rate":0.25},{"minNights":60,"rate":0.3}]'),
    '$.longStayDiscountRate',
    0.3
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE code = 'parking-space';
