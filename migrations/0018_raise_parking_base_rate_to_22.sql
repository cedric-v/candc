-- Augmentation du tarif de base du parking : 20 CHF -> 22 CHF par nuitée.
-- Le tarif par défaut est utilisé pour toute nuitée qui ne tombe pas dans une
-- `rate_periods` active (périodes tarifaires spéciales gérées depuis l'admin).
-- Les `rate_periods` existantes (ex. tarif spécial mai 2026 à 40 CHF) sont
-- laissées intactes : elles priment sur le tarif de base (priority).
UPDATE rentable_units
SET
  default_base_rate = 22,
  updated_at = CURRENT_TIMESTAMP
WHERE code = 'parking-space';

-- Filet de sécurité : un tarif de base identique à l'ancien tarif standard
-- éventuellement laissé dans une période tarifaire est aligné sur 22 CHF.
UPDATE rate_periods
SET
  nightly_base_rate = 22,
  updated_at = CURRENT_TIMESTAMP
WHERE unit_id = 'unit_parking_space'
  AND nightly_base_rate = 20;
