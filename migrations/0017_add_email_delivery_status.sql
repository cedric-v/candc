-- Suivi de remise des e-mails transactionnels.
--
-- `email_logs.status = 'sent'` ne signifie que « Resend a accepté l'envoi ».
-- Un bounce (rejet côté fournisseur du destinataire) ou une plainte spam
-- survient ensuite et restait jusqu'ici invisible pour l'hôte : l'e-mail
-- d'arrivée du 01.11.2026 (PARK-20261101-B62F74EB) est logué `sent` alors que
-- Resend l'a rejeté (« 554 5.7.1 Command rejected »).
--
-- `delivery_status` reçoit le dernier événement Resend connu
-- (delivered / bounced / complained / failed / …) via le job
-- `runEmailDeliveryCheck` (actions `email_delivery_check`), et
-- `delivery_checked_at` l'horodatage de la dernière interrogation.
ALTER TABLE email_logs ADD COLUMN delivery_status TEXT;
ALTER TABLE email_logs ADD COLUMN delivery_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_email_logs_delivery_check
  ON email_logs (status, delivery_status, created_at DESC);
