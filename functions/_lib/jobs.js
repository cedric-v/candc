import {
  getArrivalReservationsForDate,
  getImportCalendarSources,
  insertSyncLog,
  replaceExternalCalendarBlocks,
  updateCalendarSourceSync,
} from "./db.js";
import { getCurrentIsoDateInZone } from "./date.js";
import { getConfig } from "./env.js";
import { sendReservationEmail } from "./booking-ops.js";
import { parseIcsEvents } from "./ics-import.js";

async function fetchIcs(importUrl) {
  const response = await fetch(importUrl, {
    method: "GET",
    headers: {
      accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`ics_fetch_failed:${response.status}`);
  }

  return response.text();
}

export async function runBookingIcsSync(env, unitCode = null) {
  const sources = await getImportCalendarSources(env, "booking", unitCode);
  const results = [];

  for (const sourceRecord of sources) {
    const importUrl = sourceRecord.import_url || null;

    if (!importUrl) {
      await insertSyncLog(env, {
        unitId: sourceRecord.unit_id,
        syncType: "booking_ics_import",
        status: "skipped",
        message: "Missing import URL for Booking ICS source",
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        status: "skipped",
        reason: "missing_import_url",
      });
      continue;
    }

    try {
      const icsText = await fetchIcs(importUrl);
      const events = parseIcsEvents(icsText);

      await replaceExternalCalendarBlocks(env, sourceRecord, events);
      await updateCalendarSourceSync(env, sourceRecord.id, {
        unitId: sourceRecord.unit_id,
        syncType: "booking_ics_import",
        status: "success",
        message: `Imported ${events.length} external blocks`,
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
          events: events.length,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        status: "success",
        importedEvents: events.length,
      });
    } catch (error) {
      await insertSyncLog(env, {
        unitId: sourceRecord.unit_id,
        syncType: "booking_ics_import",
        status: "failed",
        message: error.message,
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        status: "failed",
        error: error.message,
      });
    }
  }

  return {
    ok: results.every((result) => result.status === "success"),
    results,
  };
}

export async function runArrivalEmails(env, targetDate = null) {
  const config = getConfig(env);
  const isoDate = targetDate || getCurrentIsoDateInZone(config.timeZone);
  const reservations = await getArrivalReservationsForDate(env, isoDate);
  const results = [];

  for (const reservation of reservations) {
    try {
      const response = await sendReservationEmail(env, reservation.id, "arrival_instructions", {
        dedupe: true,
        forDate: isoDate,
      });
      results.push({
        reservationId: reservation.id,
        publicReference: reservation.public_reference,
        status: response.skipped ? "skipped" : "sent",
      });
    } catch (error) {
      results.push({
        reservationId: reservation.id,
        publicReference: reservation.public_reference,
        status: "failed",
        error: error.message,
      });
    }
  }

  return {
    ok: results.every((result) => result.status !== "failed"),
    targetDate: isoDate,
    results,
  };
}
