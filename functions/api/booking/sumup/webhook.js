import {
  getReservationByCheckoutId,
  getReservationForCalendarSync,
  insertSyncLog,
  updateReservationGoogleCalendarEventId,
  updatePaymentByCheckoutId,
  updateReservationAndCalendarStatus,
} from "../../../_lib/db.js";
import { isGoogleCalendarConfigured, upsertReservationEvent } from "../../../_lib/google-calendar.js";
import { badRequest, json, serverError } from "../../../_lib/http.js";
import { getCheckout, mapCheckoutStatus } from "../../../_lib/sumup.js";

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();

    if (!payload?.id) {
      return badRequest("Missing SumUp checkout id");
    }

    const checkout = await getCheckout(context.env, payload.id);
    const reservation = await getReservationByCheckoutId(context.env, payload.id);

    if (!reservation) {
      return json({}, { status: 202 });
    }

    const mappedStatus = mapCheckoutStatus(checkout.status);

    await updatePaymentByCheckoutId(context.env, payload.id, {
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

    if (mappedStatus.reservationStatus === "confirmed" && isGoogleCalendarConfigured(context.env)) {
      try {
        const reservationForCalendar = await getReservationForCalendarSync(context.env, reservation.id);

        if (reservationForCalendar) {
          const event = await upsertReservationEvent(context.env, reservationForCalendar);
          await updateReservationGoogleCalendarEventId(context.env, reservation.id, event.id);
          await insertSyncLog(context.env, {
            unitId: reservation.unit_id || null,
            syncType: "google_calendar_sync",
            status: "success",
            message: `Synced reservation ${reservation.public_reference} after payment confirmation`,
            payloadSummary: {
              reservationId: reservation.id,
              googleEventId: event.id,
            },
          });
        }
      } catch (calendarError) {
        await insertSyncLog(context.env, {
          unitId: reservation.unit_id || null,
          syncType: "google_calendar_sync",
          status: "failed",
          message: calendarError.message,
          payloadSummary: {
            reservationId: reservation.id,
            publicReference: reservation.public_reference,
          },
        });
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
