import {
  getReservationByCheckoutId,
  hasSuccessfulEmailLog,
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
import { getConfig } from "../../../_lib/env.js";

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
          await sendReservationEmail(context.env, reservation.id, "booking_confirmation", {});
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
