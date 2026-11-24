import {
  getCheckout,
  isSumUpConfigured,
} from "./sumup.js";
import { applySumupCheckoutStatus } from "./payment-confirmation.js";
import {
  getReservationByCheckoutId,
  insertSyncLog,
  listSumupPaymentsAwaitingConfirmation,
} from "./db.js";
import { sendAdminAlert } from "./alerts.js";
import { getConfig } from "./env.js";

// Réconciliation des paiements SumUp : le webhook est la voie nominale, mais
// un webhook perdu (configuration côté SumUp, incident réseau, redéploiement
// pendant la livraison) laissait la réservation en `pending_payment` — puis le
// job de maintenance libérait les dates et envoyait « réservation expirée »
// ALORS QUE LE CLIENT AVAIT PAYÉ (incident 24.11.2026, PARK-20270127-19C5ABBA :
// transaction SumUp encaissée 20 s après la création, e-mail d'expiration
// 32 min plus tard).
//
// On relit donc le statut réel des checkouts restés « en attente » en base et
// on applique exactement le même traitement que le webhook
// (`applySumupCheckoutStatus`). Fail-open : une erreur SumUp/D1 n'échoue jamais
// le cron et ne libère jamais un hold dont on n'a pas pu vérifier le statut
// (voir `deferredReservationIds`).
//
// Appelé :
//   - par la maintenance des holds (toutes les 20 min), AVANT la libération des
//     holds expirés ;
//   - par `resume_payment`, avant de créer un nouveau checkout : sans cela le
//     client qui a déjà payé paierait une seconde fois (son lien lui propose
//     « payer maintenant ») ;
//   - par l'action admin `reconcile_payments` (réparation manuelle).
// Statuts pour lesquels un checkout SumUp peut encore révéler un paiement non
// enregistré (hold actif ou hold libéré mais payé).
export function reservationMayAwaitSumupConfirmation(reservation) {
  return ["pending_payment", "pending_adjustment_payment", "payment_expired"].includes(
    reservation?.status,
  );
}

export async function reconcileSumupPayments(env, options = {}) {
  const results = {
    checked: 0,
    confirmed: 0,
    recovered: [],
    conflicts: [],
    unpaid: 0,
    deferredReservationIds: [],
    errors: [],
  };

  if (!isSumUpConfigured(env)) {
    results.skipped = "sumup_not_configured";
    return results;
  }

  let candidates;

  try {
    candidates = await listSumupPaymentsAwaitingConfirmation(env, {
      reservationId: options.reservationId || null,
      windowHours: options.windowHours || getConfig(env).paymentReconcileWindowHours,
      limit: options.limit,
    });
  } catch (error) {
    results.errors.push({ stage: "list", error: error.message });
    return results;
  }

  for (const candidate of candidates) {
    results.checked += 1;

    let checkout;
    try {
      checkout = await getCheckout(env, candidate.provider_checkout_id);
    } catch (error) {
      // Statut inconnu : surtout ne pas libérer ce hold, on retentera au
      // prochain cycle (20 min). Le client garde son lien de paiement.
      results.errors.push({
        reservationId: candidate.reservation_id,
        checkoutId: candidate.provider_checkout_id,
        error: error.message,
      });
      results.deferredReservationIds.push(candidate.reservation_id);
      continue;
    }

    if (!checkout || checkout.status !== "PAID") {
      results.unpaid += 1;
      continue;
    }

    // On relit la réservation juste avant d'appliquer le statut : son statut a
    // pu changer entre la sélection et cet appel.
    const reservation = await getReservationByCheckoutId(env, candidate.provider_checkout_id);

    if (!reservation) {
      results.errors.push({
        reservationId: candidate.reservation_id,
        checkoutId: candidate.provider_checkout_id,
        error: "reservation_not_found",
      });
      continue;
    }

    try {
      const applied = await applySumupCheckoutStatus(env, {
        checkoutId: candidate.provider_checkout_id,
        checkout,
        reservation,
        source: "reconciliation",
      });

      const entry = {
        reservationId: candidate.reservation_id,
        publicReference: candidate.public_reference,
        checkoutId: candidate.provider_checkout_id,
        previousStatus: applied.previousReservationStatus,
        status: applied.reservationStatus,
      };

      if (applied.conflict) {
        results.conflicts.push(entry);
      } else if (applied.reservationStatus === "confirmed") {
        results.confirmed += 1;
        if (applied.recoveredExpiredPayment) {
          results.recovered.push(entry);
        }
      }

      await insertSyncLog(env, {
        unitId: reservation.unit_id || null,
        syncType: "payment_reconciled",
        status: applied.conflict ? "warning" : "success",
        message: applied.conflict
          ? `SumUp checkout ${candidate.provider_checkout_id} for ${candidate.public_reference} is paid but the dates are taken: refund required`
          : `SumUp checkout ${candidate.provider_checkout_id} confirmed for ${candidate.public_reference} (payment status not updated by a webhook)`,
        payloadSummary: {
          reservationId: candidate.reservation_id,
          checkoutId: candidate.provider_checkout_id,
          amount: Number(candidate.amount),
          currency: candidate.currency,
          previousStatus: applied.previousReservationStatus,
          nextStatus: applied.reservationStatus,
          paymentStatus: applied.paymentStatus,
          source: "reconciliation",
        },
      });
    } catch (error) {
      results.errors.push({
        reservationId: candidate.reservation_id,
        checkoutId: candidate.provider_checkout_id,
        error: error.message,
      });
      results.deferredReservationIds.push(candidate.reservation_id);
    }
  }

  // Une réservation ressuscitée alors qu'elle avait été annoncée « expirée »
  // est exactement le symptôme d'un webhook perdu : l'hôte doit le savoir
  // (et vérifier l'abonnement webhook dans le tableau de bord SumUp).
  if (results.recovered.length > 0 || results.conflicts.length > 0) {
    try {
      await sendAdminAlert(env, {
        key: "sumup_payment_reconciled",
        subject: "⚠️ SumUp: paiement payé sans webhook (réconciliation)",
        message: [
          "Le webhook SumUp n'a pas mis à jour la réservation, mais le paiement a bien été encaissé.",
          "",
          ...results.recovered.map(
            (entry) =>
              `- ${entry.publicReference}: ${entry.previousStatus} → confirmed (checkout ${entry.checkoutId})`,
          ),
          ...results.conflicts.map(
            (entry) =>
              `- ${entry.publicReference}: payé mais dates indisponibles → remboursement requis (checkout ${entry.checkoutId})`,
          ),
          "",
          "Vérifier l'abonnement webhook dans le tableau de bord SumUp (URL https://candc.ch/api/booking/sumup/webhook).",
        ].join("\n"),
        tags: "warning",
      });
    } catch {
      // L'alerte ne doit jamais faire échouer la réconciliation.
    }
  }

  return results;
}
