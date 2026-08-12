import {
  createManageToken,
  getExpiringPendingPaymentReservations,
  getReservationForCalendarSync,
  getReservationForEmail,
  hasSuccessfulEmailLog,
  hasSuccessfulEmailLogForDate,
  insertEmailLog,
  insertSyncLog,
  releaseExpiredPendingPayments,
  updateReservationGoogleCalendarEventId,
} from "./db.js";
import { getCurrentIsoDateInZone, getCurrentTimePartsInZone } from "./date.js";
import { getConfig } from "./env.js";
import { isEmailConfigured, sendTransactionalEmail } from "./email.js";
import { isGoogleCalendarConfigured, upsertReservationEvent } from "./google-calendar.js";
import { isNtfyConfigured, sendNtfyNotification } from "./ntfy.js";

// Réservations créées par les vérifications automatiques (npm run
// check:payment, funnel_check) : marquées par la remarque [smoke-test].
// Aucun e-mail/notification ne doit partir pour elles.
function isSmokeTestReservation(reservation) {
  return (
    typeof reservation.remarks === "string" &&
    reservation.remarks.includes("[smoke-test]")
  );
}

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

  // Réservations de test (check-live-payment / fumée) : aucun e-mail ni
  // notification — ne pas consommer le quota Resend/ntfy ni polluer la
  // boîte admin (CC automatique).
  if (!options.force && isSmokeTestReservation(reservation)) {
    return { ok: true, skipped: true, reason: "smoke_test" };
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

  const manageToken = await createManageToken(env, reservationId);
  const response = await sendReservationEmail(env, reservationId, "arrival_instructions", {
    manageToken,
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

  // Réservations de test : ne pas consommer le quota journalier ntfy.sh ni
  // envoyer de push parasite à l'hôte.
  if (isSmokeTestReservation(reservation)) {
    return { ok: true, skipped: true, reason: "smoke_test" };
  }

  const unitLabel = reservation.unit_display_name || reservation.unit_code || reservation.unit_type || "reservation";
  const guestName =
    [reservation.guest_first_name, reservation.guest_last_name].filter(Boolean).join(" ") || "Guest";
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

export async function sendPaymentReminderEmail(env, reservationId) {
  const reservation = await getReservationForEmail(env, reservationId);

  if (!reservation) {
    throw new Error("reservation_not_found");
  }

  const manageToken = await createManageToken(env, reservationId);
  return sendReservationEmail(env, reservationId, "payment_reminder", {
    manageToken,
    dedupe: true,
  });
}

export async function sendPaymentExpiredEmail(env, reservationId) {
  const reservation = await getReservationForEmail(env, reservationId);

  if (!reservation) {
    throw new Error("reservation_not_found");
  }

  const manageToken = await createManageToken(env, reservationId);
  return sendReservationEmail(env, reservationId, "payment_expired", {
    manageToken,
    dedupe: true,
  });
}

// Maintenance des holds de paiement en attente, exécutée avant chaque
// synchronisation Booking ICS (le cron horaire) :
//   1. envoie un rappel aux clients dont le hold expire bientôt ;
//   2. libère les holds expirés (réservations -> payment_expired, ou
//      revert des ajustements non payés) ;
//   3. notifie les clients dont le hold vient d'expirer.
// Les échecs d'e-mail ne bloquent jamais la libération ni la synchronisation.
export async function runPendingPaymentHoldMaintenance(env) {
  const config = getConfig(env);
  const reminderWindow = config.pendingPaymentReminderWindowMinutes;
  const results = {
    reminders: [],
    expired: [],
    reverted: [],
  };

  try {
    const expiring = await getExpiringPendingPaymentReservations(env, reminderWindow);

    for (const reservation of expiring) {
      try {
        await sendPaymentReminderEmail(env, reservation.id);
        results.reminders.push({ reservationId: reservation.id, status: "sent" });
      } catch (error) {
        results.reminders.push({ reservationId: reservation.id, status: "failed", error: error.message });
      }
    }
  } catch (error) {
    await insertSyncLog(env, {
      unitId: null,
      syncType: "pending_payment_hold_maintenance",
      status: "failed",
      message: `Reminder step failed: ${error.message}`,
    });
  }

  let releaseResult;
  try {
    releaseResult = await releaseExpiredPendingPayments(env);
  } catch (error) {
    await insertSyncLog(env, {
      unitId: null,
      syncType: "pending_payment_hold_maintenance",
      status: "failed",
      message: `Release step failed: ${error.message}`,
    });
    return { ok: false, results };
  }

  for (const reservationId of releaseResult.expiredInitial) {
    results.expired.push({ reservationId });
    try {
      await sendPaymentExpiredEmail(env, reservationId);
      results.expired[results.expired.length - 1].email = "sent";
    } catch (error) {
      results.expired[results.expired.length - 1].email = "failed";
      results.expired[results.expired.length - 1].error = error.message;
    }
  }

  for (const reservationId of releaseResult.revertedAdjustments) {
    results.reverted.push({ reservationId });
  }

  if (
    releaseResult.expiredInitial.length > 0 ||
    releaseResult.revertedAdjustments.length > 0
  ) {
    await insertSyncLog(env, {
      unitId: null,
      syncType: "pending_payment_hold_maintenance",
      status: "success",
      message: `Released ${releaseResult.expiredInitial.length} expired hold(s), reverted ${releaseResult.revertedAdjustments.length} unpaid adjustment(s)`,
      payloadSummary: results,
    });
  }

  return { ok: true, results };
}
