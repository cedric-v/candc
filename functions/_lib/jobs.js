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

function redactSecret(value, visibleChars = 6) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (value.length <= visibleChars) {
    return "***";
  }

  return `***${value.slice(-visibleChars)}`;
}

function sanitizeCalendarUrl(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?token=" : ""}${redactSecret(url.searchParams.get("t") || url.searchParams.get("token") || "configured")}`;
  } catch {
    return redactSecret(value);
  }
}

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

function buildValidationResultStatus(results) {
  if (!results.length) {
    return "skipped";
  }

  const healthyStatuses = new Set(["success", "sent", "skipped", "shared"]);

  if (results.every((result) => healthyStatuses.has(result.status))) {
    return "success";
  }

  if (results.some((result) => healthyStatuses.has(result.status))) {
    return "partial";
  }

  return "failed";
}

export async function runBookingIcsSync(env, unitCode = null) {
  const bookingSources = await getImportCalendarSources(env, "booking", unitCode);
  const airbnbSources = await getImportCalendarSources(env, "airbnb", unitCode);
  const sources = [...bookingSources, ...airbnbSources];
  const results = [];

  for (const sourceRecord of sources) {
    const importUrl = sourceRecord.import_url || null;
    const syncType = `${sourceRecord.source_code}_ics_import`;

    if (!importUrl) {
      await insertSyncLog(env, {
        unitId: sourceRecord.unit_id,
        syncType,
        status: "skipped",
        message: `Missing import URL for ${sourceRecord.source_code} ICS source`,
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        sourceCode: sourceRecord.source_code,
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
        syncType,
        status: "success",
        message: `Imported ${events.length} external blocks from ${sourceRecord.source_code}`,
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
          events: events.length,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        sourceCode: sourceRecord.source_code,
        status: "success",
        importedEvents: events.length,
      });
    } catch (error) {
      await insertSyncLog(env, {
        unitId: sourceRecord.unit_id,
        syncType,
        status: "failed",
        message: error.message,
        payloadSummary: {
          unitCode: sourceRecord.unit_code,
          sourceId: sourceRecord.id,
        },
      });
      results.push({
        unitCode: sourceRecord.unit_code,
        sourceCode: sourceRecord.source_code,
        status: "failed",
        error: error.message,
      });
    }
  }

  await insertSyncLog(env, {
    unitId: null,
    syncType: "calendar_sync_job",
    status: buildValidationResultStatus(results),
    message: `Processed ${results.length} active OTA calendar source(s)`,
    payloadSummary: {
      unitCode: unitCode || null,
      results,
    },
  });

  return {
    ok: results.every((result) => ["success", "shared"].includes(result.status)),
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

  await insertSyncLog(env, {
    unitId: null,
    syncType: "arrival_email_job",
    status: buildValidationResultStatus(results),
    message: `Processed ${results.length} arrival reservation(s) for ${isoDate}`,
    payloadSummary: {
      targetDate: isoDate,
      results,
    },
  });

  return {
    ok: results.every((result) => result.status !== "failed"),
    targetDate: isoDate,
    results,
  };
}

export async function validateCalendarSources(env, unitCode = null) {
  const bookingSources = await getImportCalendarSources(env, "booking", unitCode);
  const airbnbSources = await getImportCalendarSources(env, "airbnb", unitCode);
  const sources = [...bookingSources, ...airbnbSources];
  const config = getConfig(env);
  const exportChecksSeen = new Set();
  const results = [];

  for (const sourceRecord of sources) {
    const result = {
      unitCode: sourceRecord.unit_code,
      unitDisplayName: sourceRecord.display_name,
      sourceCode: sourceRecord.source_code,
      importUrl: sanitizeCalendarUrl(sourceRecord.import_url || null),
      importStatus: "skipped",
      importEventCount: 0,
      exportStatus: "skipped",
      exportEventCount: 0,
      errors: [],
    };

    if (sourceRecord.import_url) {
      try {
        const importIcs = await fetchIcs(sourceRecord.import_url);
        result.importEventCount = parseIcsEvents(importIcs).length;
        result.importStatus = "success";
      } catch (error) {
        result.importStatus = "failed";
        result.errors.push(`import:${error.message}`);
      }
    } else {
      result.errors.push("import:missing_import_url");
    }

    const exportFeedToken = sourceRecord.export_feed_token || null;
    const exportCacheKey = `${sourceRecord.unit_code}:${exportFeedToken || ""}`;
    if (exportFeedToken && !exportChecksSeen.has(exportCacheKey)) {
      exportChecksSeen.add(exportCacheKey);
      const exportUrl = `${config.publicBaseUrl}/api/booking/ics/${encodeURIComponent(exportFeedToken)}`;
      result.exportUrl = `${config.publicBaseUrl}/api/booking/ics/${redactSecret(exportFeedToken)}`;
      try {
        const exportIcs = await fetchIcs(exportUrl);
        result.exportEventCount = parseIcsEvents(exportIcs).length;
        result.exportStatus = "success";
      } catch (error) {
        result.exportStatus = "failed";
        result.errors.push(`export:${error.message}`);
      }
    } else if (exportFeedToken) {
      result.exportStatus = "shared";
      result.exportUrl = `${config.publicBaseUrl}/api/booking/ics/${redactSecret(exportFeedToken)}`;
    } else {
      result.errors.push("export:missing_feed_token");
    }

    result.status =
      result.importStatus === "success" &&
      ["success", "shared"].includes(result.exportStatus)
        ? "success"
        : result.importStatus === "failed" || result.exportStatus === "failed"
          ? "failed"
          : "skipped";

    results.push(result);
  }

  await insertSyncLog(env, {
    unitId: null,
    syncType: "calendar_source_validation",
    status: buildValidationResultStatus(results),
    message: `Validated ${results.length} OTA calendar source(s)`,
    payloadSummary: {
      unitCode: unitCode || null,
      results,
    },
  });

  return {
    ok: results.every((result) => result.status === "success"),
    results,
  };
}
