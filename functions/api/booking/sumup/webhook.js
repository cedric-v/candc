import { getReservationByCheckoutId } from "../../../_lib/db.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { getCheckout, verifyWebhookSignature } from "../../../_lib/sumup.js";
import { applySumupCheckoutStatus } from "../../../_lib/payment-confirmation.js";
import { getConfig } from "../../../_lib/env.js";
import { sendAdminAlert } from "../../../_lib/alerts.js";

// Voie nominale de confirmation d'un paiement SumUp. Le traitement lui-même
// vit dans `_lib/payment-confirmation.js` : il est partagé avec la
// réconciliation (`_lib/payment-reconciliation.js`), qui rattrape un webhook
// jamais délivré. Ce fichier ne fait que l'authentification, la lecture du
// checkout chez SumUp et le renvoi du résultat.
export async function onRequestPost(context) {
  try {
    const config = getConfig(context.env);
    const rawBody = await context.request.text();

    // When SUMUP_WEBHOOK_SECRET is configured, require a valid HMAC
    // signature over the raw body before processing anything.
    if (config.sumUpWebhookSecret) {
      const signature = context.request.headers.get("x-sumup-webhook-signature") || "";
      const isValid = await verifyWebhookSignature(rawBody, signature, config.sumUpWebhookSecret);

      if (!isValid) {
        console.error("Rejected SumUp webhook with missing or invalid signature");
        return unauthorized("Invalid webhook signature");
      }
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return badRequest("Request body must be valid JSON");
    }

    if (typeof payload?.id !== "string" || payload.id.trim() === "" || payload.id.length > 200) {
      return badRequest("Missing SumUp checkout id");
    }

    const checkoutId = payload.id.trim();
    const checkout = await getCheckout(context.env, checkoutId);
    const reservation = await getReservationByCheckoutId(context.env, checkoutId);

    if (!reservation) {
      return json({}, { status: 202 });
    }

    await applySumupCheckoutStatus(context.env, {
      checkoutId,
      checkout,
      reservation,
      source: "webhook",
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to process SumUp webhook:", error);
    try {
      await sendAdminAlert(context.env, {
        key: "sumup_webhook_failed",
        subject: "⚠️ SumUp webhook: traitement échoué",
        message: `Un webhook SumUp n'a pas pu être traité. Si le paiement a bien été encaissé, la réservation n'a peut-être PAS été confirmée — vérifier manuellement.

${error?.stack || error?.message || String(error)}`,
        tags: "critical",
      });
    } catch {
      // Alerting must never mask the original error.
    }
    return serverError("Failed to process SumUp webhook");
  }
}
