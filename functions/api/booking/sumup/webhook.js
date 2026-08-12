import {
  createManageToken,
  getAvailabilityConflictsExcludingReservation,
  getPaymentsForReservation,
  getReservationByCheckoutId,
  getReservationForEmail,
  hasSuccessfulEmailLog,
  insertSyncLog,
  updatePaymentByCheckoutId,
  updateReservationAndCalendarStatus,
} from "../../../_lib/db.js";
import {
  sendImmediateArrivalEmailIfNeeded,
  sendReservationEmail,
  sendReservationNtfy,
  syncReservationToGoogleCalendar,
} from "../../../_lib/booking-ops.js";
import { isGoogleCalendarConfigured } from "../../../_lib/google-calendar.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { getCheckout, mapCheckoutStatus, verifyWebhookSignature } from "../../../_lib/sumup.js";
import { attemptAutomaticRefund } from "../../../_lib/refunds.js";
import { getConfig } from "../../../_lib/env.js";

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
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

    const mappedStatus = mapStatusForPaymentType(checkout.status, reservation.payment_type);

    await updatePaymentByCheckoutId(context.env, checkoutId, {
      providerPaymentReference: checkout.transaction_id || null,
      status: mappedStatus.paymentStatus,
      rawPayload: checkout,
    });

    // Confirmation uniquement si le paiement est effectivement payé ET que
    // les dates sont toujours disponibles. La revérification est la garantie
    // anti-double-réservation : une réservation non payée a pu être libérée
    // (hold expiré) et les dates reprises par un autre client.
    if (mappedStatus.reservationStatus === "confirmed") {
      const fullReservation = await getReservationForEmail(context.env, reservation.id);

      if (fullReservation) {
        const conflicts = await getAvailabilityConflictsExcludingReservation(
          context.env,
          fullReservation.unit_id,
          fullReservation.check_in_date,
          fullReservation.check_out_date,
          fullReservation.id,
        );

        if (conflicts.length > 0) {
          await handlePaymentConflict(context, fullReservation, reservation, checkoutId, conflicts);
          return new Response(null, { status: 204 });
        }
      }
    }

    await updateReservationAndCalendarStatus(
      context.env,
      reservation.id,
      mappedStatus.reservationStatus,
      mappedStatus.calendarBlockStatus,
    );

    if (mappedStatus.reservationStatus === "confirmed") {
      try {
        const confirmationSent = await hasSuccessfulEmailLog(
          context.env,
          reservation.id,
          "booking_confirmation",
          reservation.guest_email,
        );

        if (!confirmationSent) {
          const manageToken = await createManageToken(context.env, reservation.id);
          await sendReservationEmail(context.env, reservation.id, "booking_confirmation", {
            manageToken,
          });
        }
      } catch {
        // Email failures should not block webhook processing.
      }
      try {
        await sendImmediateArrivalEmailIfNeeded(context.env, reservation.id);
      } catch {
        // Email dedupe / send failures should not block webhook processing.
      }
      try {
        await sendReservationNtfy(context.env, reservation.id, "payment_confirmed");
      } catch {
        // ntfy failures should not block webhook processing.
      }
    }

    if (mappedStatus.reservationStatus === "confirmed" && isGoogleCalendarConfigured(context.env)) {
      try {
        await syncReservationToGoogleCalendar(context.env, reservation.id);
      } catch {
        // Sync errors are logged by the shared helper.
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to process SumUp webhook:", error);
    return serverError("Failed to process SumUp webhook");
  }
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
async function handlePaymentConflict(context, reservation, minimalReservation, checkoutId, conflicts) {
  const { env } = context;
  const payments = await getPaymentsForReservation(env, reservation.id);
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
    // Notification failures must not block webhook processing.
  }
}
