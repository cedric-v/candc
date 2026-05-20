import {
  getReservationForCalendarSync,
  insertSyncLog,
  updateReservationGoogleCalendarEventId,
} from "../../../_lib/db.js";
import { getConfig } from "../../../_lib/env.js";
import { isGoogleCalendarConfigured, upsertReservationEvent } from "../../../_lib/google-calendar.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";

function hasValidToken(request, env) {
  const config = getConfig(env);

  if (!config.internalSyncToken) {
    return false;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-sync-token");
  return bearerToken === config.internalSyncToken || headerToken === config.internalSyncToken;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!hasValidToken(request, env)) {
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

    const event = await upsertReservationEvent(env, reservation);
    await updateReservationGoogleCalendarEventId(env, reservation.id, event.id);
    await insertSyncLog(env, {
      unitId: reservation.unit_id || null,
      syncType: "google_calendar_sync",
      status: "success",
      message: `Synced reservation ${reservation.public_reference} to Google Calendar`,
      payloadSummary: {
        reservationId: reservation.id,
        publicReference: reservation.public_reference,
        googleEventId: event.id,
      },
    });

    return json({
      ok: true,
      reservationId: reservation.id,
      eventId: event.id,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to sync Google Calendar", error.message);
  }
}
