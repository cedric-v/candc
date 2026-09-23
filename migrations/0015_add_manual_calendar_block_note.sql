-- Manual calendar blocks created from the admin dashboard.
-- Adds an optional free-text note so the host can remember why a period was
-- blocked (e.g. "Fermeture Booking.com - octobre 2026").
ALTER TABLE calendar_blocks ADD COLUMN note TEXT;
