-- 0019 : lier chaque entrée de journal à la réservation concernée.
--
-- Jusqu'ici le lien n'existait que dans `payload_summary` JSON
-- ({"reservationId": "..."}) : impossible de filtrer, d'indexer ou de joindre
-- proprement. L'historique par réservation de /admin/booking (« Details ▾ » →
-- History) en dépend, et il rend le journal lisible après un changement de
-- dates (départ anticipé, modification client, annulation).
--
-- Le code (insertSyncLog / listRecentSyncLogs dans functions/_lib/db.js) reste
-- fonctionnel SANS cette migration : il retombe sur une requête sans la
-- colonne. Appliquer ensuite le backfill pour peupler l'historique déjà écrit.
--
--   wrangler d1 migrations apply candc-booking --remote

ALTER TABLE sync_logs ADD COLUMN reservation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sync_logs_reservation
  ON sync_logs (reservation_id, created_at DESC);

-- Backfill : les entrées déjà écrites portent l'id de la réservation dans leur
-- payload JSON. La sous-requête écarte les valeurs orphelines (réservation
-- supprimée, payload d'un autre type) pour ne pas casser une future FK.
UPDATE sync_logs
   SET reservation_id = json_extract(payload_summary, '$.reservationId')
 WHERE reservation_id IS NULL
   AND payload_summary IS NOT NULL
   AND json_extract(payload_summary, '$.reservationId') IS NOT NULL
   AND json_extract(payload_summary, '$.reservationId') IN (SELECT id FROM reservations);
