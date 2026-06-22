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
import { isNtfyConfigured, sendNtfyNotification } from "./ntfy.js";

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

export async function sendReservationNtfy(env, reservationId, eventType, options = {}) {
  if (!isNtfyConfigured(env)) {
    await insertSyncLog(env, {
      unitId: null,
      syncType: "ntfy_notification",
      status: "skipped",
      message: `ntfy_not_configured — ${eventType} not sent for ${reservationId}`,
    });
    return { ok: false, reason: "ntfy_not_configured" };
  }

  const reservation = await getReservationForEmail(env, reservationId);

  if (!reservation) {
    throw new Error("reservation_not_found");
  }

  const unitLabel = reservation.unit_display_name || reservation.unit_code || reservation.unit_type || "reservation";
  const guestName = reservation.guest_name || "Guest";
  const dates = `${reservation.check_in_date} → ${reservation.check_out_date}`;
  const total = Number(reservation.total_amount || 0).toFixed(2);

  let title;
  let message;

  switch (eventType) {
    case "new_booking": {
      title = `New booking: ${reservation.public_reference}`;
      message = `${unitLabel} — ${guestName}\n${dates}\nTotal: CHF ${total}`;
      break;
    }
    case "cancellation": {
      title = `Cancelled: ${reservation.public_reference}`;
      message = `${unitLabel} — ${guestName}\n${dates}\nStatus: cancelled`;
      break;
    }
    case "modification": {
      const delta = options.deltaAmount != null ? `CHF ${Number(options.deltaAmount).toFixed(2)}` : "N/A";
      title = `Modified: ${reservation.public_reference}`;
      message = `${unitLabel} — ${guestName}\n${dates}\nDelta: ${delta}`;
      break;
    }
    case "payment_confirmed": {
      title = `Payment: ${reservation.public_reference}`;
      message = `${unitLabel} — ${guestName}\n${dates}\nStatus: confirmed, Total: CHF ${total}`;
      break;
    }
    default:
      throw new Error(`unknown_ntfy_event_type:${eventType}`);
  }

  try {
    await sendNtfyNotification(env, title, message, { tags: "reservation" });
    await insertSyncLog(env, {
      unitId: reservation.unit_id || null,
      syncType: "ntfy_notification",
      status: "success",
      message: `${eventType} notification sent for ${reservation.public_reference}`,
      payloadSummary: { reservationId, eventType },
    });
    return { ok: true };
  } catch (error) {
    await insertSyncLog(env, {
      unitId: reservation.unit_id || null,
      syncType: "ntfy_notification",
      status: "failed",
      message: error.message,
      payloadSummary: { reservationId, eventType },
    });
    throw error;
  }
}
