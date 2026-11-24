import {
  createManageToken,
  getAvailabilityConflictsExcludingReservation,
  getPaymentsForReservation,
  getReservationForEmail,
  hasSuccessfulEmailLog,
  insertSyncLog,
  setReservationWcConfirmation,
  updatePaymentByCheckoutId,
  updateReservationAndCalendarStatus,
} from "./db.js";
import {
  sendImmediateArrivalEmailIfNeeded,
  sendReservationEmail,
  sendReservationNtfy,
  syncReservationToGoogleCalendar,
} from "./booking-ops.js";
import { isGoogleCalendarConfigured } from "./google-calendar.js";
import { mapCheckoutStatus } from "./sumup.js";
import { attemptAutomaticRefund } from "./refunds.js";
import { findLiveExternalConflicts, reportLiveOtaCheck } from "./ota-availability.js";

// Traitement « un statut de checkout SumUp est connu » : c'est le cœur de la
// confirmation de paiement, partagé par deux appelants :
//   - le webhook SumUp (`api/booking/sumup/webhook.js`), voie nominale ;
//   - la réconciliation (`_lib/payment-reconciliation.js`), filet de sécurité
//     quand le webhook n'arrive pas (incident 24.11.2026 : paiement encaissé,
//     hold expiré, client et hôte notifiés à tort).
// Toute évolution de la confirmation doit se faire ICI, jamais dans un
// appelant : les deux chemins doivent appliquer exactement les mêmes règles
// (revérification de disponibilité, remboursement en cas de conflit, e-mails).

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

// Un webhook SumUp peut être redélivré (timeout / 5xx côté SumUp). Le
// traitement d'un conflit doit être idempotent : un remboursement (auto ou
// `manual_refund_due`) déjà enregistré pour ce checkout interdit d'en créer un
// second.
function refundAlreadyRecorded(payments, checkoutId) {
  return (payments || []).some((payment) => {
    if (payment.type !== "refund") {
      return false;
    }

    if (payment.provider_checkout_id === checkoutId) {
      return true;
    }

    let payload = null;
    try {
      payload = payment.raw_payload ? JSON.parse(payment.raw_payload) : null;
    } catch {
      payload = null;
    }

    return payload?.checkoutId === checkoutId;
  });
}

// Statuts dont la réservation est déjà présente dans le flux ICS sortant.
// Elle peut donc être reflétée par Booking.com/Airbnb : une relecture OTA en
// direct la détecterait comme un conflit avec elle-même (notamment lors d'une
// redélivrance du webhook). On ne relit les flux en direct que pour une
// réservation pas encore exportée.
const EXPORTED_RESERVATION_STATUSES = new Set([
  "confirmed",
  "modified",
  "refund_due",
  "pending_refund",
]);

function mapStatusForPaymentType(checkoutStatus, paymentType) {
  if (paymentType !== "adjustment") {
    return mapCheckoutStatus(checkoutStatus);
  }

  switch (checkoutStatus) {
    case "PAID":
      return {
        paymentStatus: "paid",
        reservationStatus: "modified",
        calendarBlockStatus: "confirmed",
      };
    case "PENDING":
      return {
        paymentStatus: "pending",
        reservationStatus: "pending_adjustment_payment",
        calendarBlockStatus: "pending_payment",
      };
    default:
      return {
        paymentStatus: checkoutStatus.toLowerCase(),
        reservationStatus: "pending_adjustment_payment",
        calendarBlockStatus: "pending_payment",
      };
  }
}

// Applique à la réservation le statut d'un checkout SumUp.
//
// `reservation` est l'enregistrement minimal renvoyé par
// `getReservationByCheckoutId` (il porte `payment_type` et le statut courant),
// `checkout` le corps renvoyé par l'API SumUp. `source` ('webhook' ou
// 'reconciliation') n'est utilisé que pour la journalisation.
export async function applySumupCheckoutStatus(
  env,
  { checkoutId, checkout, reservation, source = "webhook" },
) {
  const previousReservationStatus = reservation.status;
  const mappedStatus = mapStatusForPaymentType(checkout.status, reservation.payment_type);

  await updatePaymentByCheckoutId(env, checkoutId, {
    providerPaymentReference: checkout.transaction_id || null,
    status: mappedStatus.paymentStatus,
    rawPayload: checkout,
  });

  // Confirmation uniquement si le paiement est effectivement payé ET que les
  // dates sont toujours disponibles. La revérification est la garantie
  // anti-double-réservation : une réservation non payée a pu être libérée
  // (hold expiré) et les dates reprises par un autre client.
  //
  // Elle couvre aussi le paiement complémentaire d'une modification de dates
  // (`payment_type = adjustment`) : `handlePaymentConflict` gère alors le cas
  // ajustement (remboursement du complément, séjour conservé sur les
  // nouvelles dates). Sans ce cas, la branche `isAdjustment` n'était jamais
  // atteinte et les ajustements passaient sans contrôle.
  const isAdjustmentPayment = reservation.payment_type === "adjustment";
  const needsAvailabilityRecheck =
    mappedStatus.paymentStatus === "paid" &&
    (mappedStatus.reservationStatus === "confirmed" || isAdjustmentPayment);

  if (needsAvailabilityRecheck) {
    const fullReservation = await getReservationForEmail(env, reservation.id);

    if (fullReservation) {
      const conflicts = await getAvailabilityConflictsExcludingReservation(
        env,
        fullReservation.unit_id,
        fullReservation.check_in_date,
        fullReservation.check_out_date,
        fullReservation.id,
      );

      // Relecture des flux OTA en direct : le bloc OTA peut ne pas encore
      // avoir été importé par le cron, auquel cas la vérification DB seule
      // raterait le conflit et confirmerait un surbooking.
      //
      // Uniquement pour un premier paiement de séjour jamais exporté : un
      // séjour déjà confirmé figure dans le flux ICS sortant et peut être
      // reflété par l'OTA — on le détecterait lui-même comme conflit (cas
      // aussi vrai pour les ajustements, dont le séjour est déjà confirmé).
      let liveConflicts = [];
      let liveChecks = null;
      if (
        !isAdjustmentPayment &&
        !EXPORTED_RESERVATION_STATUSES.has(fullReservation.status)
      ) {
        liveChecks = await findLiveExternalConflicts(
          env,
          fullReservation.unit_code,
          fullReservation.check_in_date,
          fullReservation.check_out_date,
          // Un webhook doit répondre vite : 3 s max par flux, en parallèle.
          { timeoutMs: 3000 },
        );
        liveConflicts = liveChecks.conflicts;
      }

      if (conflicts.length > 0 || liveConflicts.length > 0) {
        await handlePaymentConflict(
          env,
          fullReservation,
          reservation,
          checkoutId,
          conflicts.length > 0 ? conflicts : liveConflicts,
          source,
        );
        return {
          ok: true,
          source,
          previousReservationStatus,
          paymentStatus: mappedStatus.paymentStatus,
          reservationStatus: isAdjustmentPayment ? "modified" : "conflict_refund_due",
          conflict: true,
        };
      }

      // Aucun conflit : signalement si la relecture n'a pu vérifier aucune
      // source (on vient de confirmer sans pouvoir croiser les OTA).
      if (liveChecks) {
        await reportLiveOtaCheck(env, {
          unitCode: fullReservation.unit_code,
          startDate: fullReservation.check_in_date,
          endDate: fullReservation.check_out_date,
          result: liveChecks,
        });
      }
    }
  }

  await updateReservationAndCalendarStatus(
    env,
    reservation.id,
    mappedStatus.reservationStatus,
    mappedStatus.calendarBlockStatus,
  );

  // Option A : dès que le paiement est encaissé (hors conflit, le cas
  // conflit retourne avant ce point), l'accès WC-douche demandé et payé est
  // considéré comme confirmé. Idempotent : ne passe le flag à 1 que si la
  // demande est active et pas déjà confirmée.
  if (mappedStatus.paymentStatus === "paid") {
    try {
      await setReservationWcConfirmation(env, reservation.id, true);
    } catch {
      // L'auto-confirmation WC ne doit jamais bloquer la confirmation.
    }
  }

  if (mappedStatus.reservationStatus === "confirmed") {
    // Paiement reçu APRÈS la libération du hold (statut `payment_expired`) :
    // le client a reçu « réservation expirée, dates libérées ». Le prévenir
    // explicitement que son paiement a bien été encaissé et que son séjour
    // est confirmé (`payment_received`), sans quoi il paierait une seconde
    // fois via le lien de gestion.
    const recoveringExpiredPayment = previousReservationStatus === "payment_expired";

    try {
      if (recoveringExpiredPayment) {
        const manageToken = await createManageToken(env, reservation.id);
        await sendReservationEmail(env, reservation.id, "payment_received", {
          manageToken,
          dedupe: true,
        });
      } else {
        const confirmationSent = await hasSuccessfulEmailLog(
          env,
          reservation.id,
          "booking_confirmation",
          reservation.guest_email,
        );

        if (!confirmationSent) {
          const manageToken = await createManageToken(env, reservation.id);
          await sendReservationEmail(env, reservation.id, "booking_confirmation", {
            manageToken,
          });
        }
      }
    } catch {
      // Email failures should not block confirmation.
    }
    try {
      await sendImmediateArrivalEmailIfNeeded(env, reservation.id);
    } catch {
      // Email dedupe / send failures should not block the confirmation.
    }
    try {
      await sendReservationNtfy(env, reservation.id, "payment_confirmed");
    } catch {
      // ntfy failures should not block the confirmation.
    }
  }

  if (mappedStatus.reservationStatus === "confirmed" && isGoogleCalendarConfigured(env)) {
    try {
      await syncReservationToGoogleCalendar(env, reservation.id);
    } catch {
      // Sync errors are logged by the shared helper.
    }
  }

  return {
    ok: true,
    source,
    previousReservationStatus,
    paymentStatus: mappedStatus.paymentStatus,
    reservationStatus: mappedStatus.reservationStatus,
    conflict: false,
    recoveredExpiredPayment: previousReservationStatus === "payment_expired",
  };
}

// Conflit détecté au moment de la confirmation du paiement : les dates ont
// été reprises entre la création du hold et le paiement. On ne confirme pas.
//
//  - paiement initial : remboursement intégral et statut `conflict_refund_due`
//    (le client est notifié, la réservation n'est pas confirmée) ;
//  - paiement complémentaire (ajustement) : remboursement du montant de
//    l'ajustement, la réservation reste confirmée sur les nouvelles dates
//    (revert en `modified`) et l'hôte est notifié pour un éventuel suivi
//    manuel du complément.
async function handlePaymentConflict(env, reservation, minimalReservation, checkoutId, conflicts, source = "webhook") {
  const payments = await getPaymentsForReservation(env, reservation.id);

  // Idempotence : une redélivrance du webhook ne doit ni rembourser deux fois
  // ni ré-envoyer les e-mails d'annulation.
  if (refundAlreadyRecorded(payments, checkoutId)) {
    await insertSyncLog(env, {
      unitId: reservation.unit_id || null,
      syncType: "payment_conflict",
      status: "skipped",
      message: `Conflict for ${checkoutId} (${reservation.public_reference}) already handled, skipping ${source} redelivery`,
      payloadSummary: { reservationId: reservation.id, checkoutId, source },
    });
    return;
  }

  const checkoutPayment = payments.find((payment) => payment.provider_checkout_id === checkoutId);
  const isAdjustment = minimalReservation.payment_type === "adjustment";
  const refundAmount = isAdjustment
    ? roundMoney(checkoutPayment ? Number(checkoutPayment.amount) : 0)
    : roundMoney(reservation.total_amount || 0);

  const refund = await attemptAutomaticRefund(
    env,
    reservation,
    refundAmount,
    isAdjustment ? "adjustment_availability_conflict" : "availability_conflict_at_payment",
    { checkoutId, conflicts: conflicts.map((c) => ({ id: c.id, source: c.source, status: c.status })) },
  );

  if (isAdjustment) {
    await updateReservationAndCalendarStatus(env, reservation.id, "modified", "confirmed");
  } else {
    await updateReservationAndCalendarStatus(env, reservation.id, "conflict_refund_due", "released");
  }

  await insertSyncLog(env, {
    unitId: reservation.unit_id || null,
    syncType: "payment_conflict",
    status: "warning",
    message: isAdjustment
      ? `Adjustment payment ${checkoutId} for ${reservation.public_reference} conflicts with another booking; delta refunded, host follow-up needed`
      : `Payment ${checkoutId} for ${reservation.public_reference} conflicts with another booking; NOT confirmed, refund ${refund.mode}`,
    payloadSummary: {
      reservationId: reservation.id,
      conflicts: conflicts.map((c) => ({ id: c.id, source: c.source, status: c.status })),
      refund,
      source,
    },
  });

  try {
    if (isAdjustment) {
      await sendReservationNtfy(env, reservation.id, "modification", {
        deltaAmount: -refundAmount,
      });
    } else {
      await sendReservationEmail(env, reservation.id, "booking_cancellation");
      await sendReservationNtfy(env, reservation.id, "cancellation");
    }
  } catch {
    // Notification failures must not block the payment processing.
  }
}
