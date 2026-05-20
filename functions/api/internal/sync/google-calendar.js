import { hasValidInternalToken } from "../../../_lib/auth.js";
import { syncReservationToGoogleCalendar } from "../../../_lib/booking-ops.js";
import { getReservationForCalendarSync } from "../../../_lib/db.js";
import { isGoogleCalendarConfigured } from "../../../_lib/google-calendar.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!hasValidInternalToken(request, env)) {
      return unauthorized("Missing or invalid internal sync token");
    }

    if (!isGoogleCalendarConfigured(env)) {
      return badRequest("Google Calendar is not configured");
    }

    const rawBody = await request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (!payload.reservationId) {
      return badRequest("reservationId is required");
    }

    const reservation = await getReservationForCalendarSync(env, payload.reservationId);

    if (!reservation) {
      return badRequest("Unknown reservationId");
    }

    const result = await syncReservationToGoogleCalendar(env, reservation.id);

    return json({
      ok: result.ok,
      reservationId: reservation.id,
      eventId: result.eventId || null,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to sync Google Calendar", error.message);
  }
}
