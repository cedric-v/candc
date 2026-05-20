import {
  getImportCalendarSources,
  insertSyncLog,
  replaceExternalCalendarBlocks,
  updateCalendarSourceSync,
} from "../../../_lib/db.js";
import { getConfig } from "../../../_lib/env.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { parseIcsEvents } from "../../../_lib/ics-import.js";

function hasValidToken(request, env) {
  const config = getConfig(env);

  if (!config.internalSyncToken) {
    return false;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-sync-token");
  return bearerToken === config.internalSyncToken || headerToken === config.internalSyncToken;
}

async function resolveBookingImportUrl(env, sourceRecord) {
  if (sourceRecord.import_url) {
    return sourceRecord.import_url;
  }

  const config = getConfig(env);
  if (sourceRecord.unit_code === config.defaultUnitCode && config.bookingIcsImportUrl) {
    return config.bookingIcsImportUrl;
  }

  return null;
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

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!hasValidToken(request, env)) {
      return unauthorized("Missing or invalid internal sync token");
    }

    const rawBody = await request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const unitCode = typeof payload.unitCode === "string" && payload.unitCode.trim()
      ? payload.unitCode.trim()
      : null;

    const sources = await getImportCalendarSources(env, "booking", unitCode);

    if (sources.length === 0) {
      return badRequest("No active Booking ICS source found for the requested scope");
    }

    const results = [];

    for (const sourceRecord of sources) {
      const importUrl = await resolveBookingImportUrl(env, sourceRecord);

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

    return json({
      ok: results.every((result) => result.status === "success"),
      results,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to run Booking ICS sync", error.message);
  }
}
