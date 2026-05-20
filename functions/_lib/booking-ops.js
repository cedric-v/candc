import {
  getReservationForCalendarSync,
  getReservationForEmail,
  hasSuccessfulEmailLog,
  hasSuccessfulEmailLogForDate,
  insertEmailLog,
  insertSyncLog,
  updateReservationGoogleCalendarEventId,
} from "./db.js";
import { getCurrentIsoDateInZone, getCurrentTimePartsInZone } from "./date.js";
import { getConfig } from "./env.js";
import { isEmailConfigured, sendTransactionalEmail } from "./email.js";
import { isGoogleCalendarConfigured, upsertReservationEvent } from "./google-calendar.js";

export async function syncReservationToGoogleCalendar(env, reservationId) {
  if (!isGoogleCalendarConfigured(env)) {
    return { ok: false, reason: "google_calendar_not_configured" };
  }

  const reservation = await getReservationForCalendarSync(env, reservationId);

  if (!reservation) {
    return { ok: false, reason: "reservation_not_found" };
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
      googleEventId: event.id,
    },
  });

  return { ok: true, eventId: event.id };
}

export async function sendReservationEmail(env, reservationId, emailType, options = {}) {
  const reservation = await getReservationForEmail(env, reservationId);

  if (!reservation) {
    throw new Error("reservation_not_found");
  }

  const recipient = options.to || reservation.guest_email;

  if (!isEmailConfigured(env)) {
    await insertEmailLog(env, {
      reservationId,
      emailType,
      recipient,
      status: "skipped",
      providerMessageId: "email_not_configured",
    });
    return { ok: false, reason: "email_not_configured" };
  }

  if (options.dedupe) {
    const alreadySent = options.forDate
      ? await hasSuccessfulEmailLogForDate(env, reservationId, emailType, recipient, options.forDate)
      : await hasSuccessfulEmailLog(env, reservationId, emailType, recipient);

    if (alreadySent) {
      return { ok: true, skipped: true, reason: "already_sent" };
    }
  }

  try {
    const response = await sendTransactionalEmail(env, emailType, reservation, options);
    await insertEmailLog(env, {
      reservationId,
      emailType,
      recipient,
      status: "sent",
      providerMessageId: response.id || null,
    });
    return { ok: true, response };
  } catch (error) {
    await insertEmailLog(env, {
      reservationId,
      emailType,
      recipient,
      status: "failed",
      providerMessageId: error.message,
    });
    throw error;
  }
}

export async function sendImmediateArrivalEmailIfNeeded(env, reservationId) {
  const config = getConfig(env);
  const reservation = await getReservationForEmail(env, reservationId);

  if (!reservation) {
    return { ok: false, reason: "reservation_not_found" };
  }

  if (!["confirmed", "modified", "refund_due", "pending_refund"].includes(reservation.status)) {
    return { ok: false, reason: "reservation_not_eligible" };
  }

  const today = getCurrentIsoDateInZone(config.timeZone);
  if (reservation.check_in_date !== today) {
    return { ok: false, reason: "not_same_day_arrival" };
  }

  const nowParts = getCurrentTimePartsInZone(config.timeZone);
  if (nowParts.hour < 8) {
    return { ok: false, reason: "before_arrival_email_window" };
  }

  const response = await sendReservationEmail(env, reservationId, "arrival_instructions", {
    dedupe: true,
    forDate: today,
  });

  return {
    ok: true,
    skipped: Boolean(response.skipped),
    reason: response.reason || null,
  };
}
