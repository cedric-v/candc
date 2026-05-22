import {
  getReservationByCheckoutId,
  updatePaymentByCheckoutId,
  updateReservationAndCalendarStatus,
} from "../../../_lib/db.js";
import { sendImmediateArrivalEmailIfNeeded, syncReservationToGoogleCalendar } from "../../../_lib/booking-ops.js";
import { isGoogleCalendarConfigured } from "../../../_lib/google-calendar.js";
import { badRequest, json, serverError } from "../../../_lib/http.js";
import { getCheckout, mapCheckoutStatus } from "../../../_lib/sumup.js";

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
    const payload = await context.request.json();

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
        await sendImmediateArrivalEmailIfNeeded(context.env, reservation.id);
      } catch {
        // Email dedupe / send failures should not block webhook processing.
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
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to process SumUp webhook", error.message);
  }
}
