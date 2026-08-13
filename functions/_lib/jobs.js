import {
  anonymizeExpiredGuestSensitiveData,
  createManageToken,
  getArrivalReservationsForDate,
  getDepartureReservationsForDate,
  getImportCalendarSources,
  getReviewRequestReservationsForDate,
  getUnitByCode,
  insertSyncLog,
  replaceExternalCalendarBlocks,
  updateCalendarSourceSync,
} from "./db.js";
import { getCurrentIsoDateInZone } from "./date.js";
import { getConfig } from "./env.js";
import { sendReservationEmail } from "./booking-ops.js";
import { parseIcsEvents } from "./ics-import.js";
import { sendAdminAlert } from "./alerts.js";

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
        manageTokenFactory: () => createManageToken(env, reservation.id, { rotate: true }),
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

export async function runDepartureEmails(env, targetDate = null) {
  const config = getConfig(env);
  const today = targetDate || getCurrentIsoDateInZone(config.timeZone);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const reservations = await getDepartureReservationsForDate(env, tomorrowIso);
  const results = [];

  for (const reservation of reservations) {
    try {
      const response = await sendReservationEmail(env, reservation.id, "departure_instructions", {
        dedupe: true,
        forDate: tomorrowIso,
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
    syncType: "departure_email_job",
    status: buildValidationResultStatus(results),
    message: `Processed ${results.length} departure reservation(s) for ${tomorrowIso}`,
    payloadSummary: {
      targetDate: tomorrowIso,
      results,
    },
  });

  return {
    ok: results.every((result) => result.status !== "failed"),
    targetDate: tomorrowIso,
    results,
  };
}

export async function runReviewRequestEmails(env, targetDate = null) {
  const config = getConfig(env);
  const isoDate = targetDate || getCurrentIsoDateInZone(config.timeZone);
  const reservations = await getReviewRequestReservationsForDate(env, isoDate);
  const results = [];

  for (const reservation of reservations) {
    try {
      const response = await sendReservationEmail(env, reservation.id, "review_request", {
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
    syncType: "review_request_email_job",
    status: buildValidationResultStatus(results),
    message: `Processed ${results.length} review request(s) for departures on ${isoDate}`,
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

// Conformité LPD / RGPD : anonymise les données sensibles du voyageur
// (n° de pièce d'identité, nationalité, date de naissance) des réservations
// dont le séjour s'est terminé il y a plus de `SENSITIVE_DATA_RETENTION_MONTHS`
// mois (défaut 12). Les données de réservation et de facturation restent
// conservées (obligations comptables, 10 ans). Idempotent et sans risque.
export async function runSensitiveDataRetention(env) {
  const config = getConfig(env);
  const months = Math.max(1, Number(config.sensitiveDataRetentionMonths || 12));
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const result = await anonymizeExpiredGuestSensitiveData(env, cutoffIso);

  await insertSyncLog(env, {
    unitId: null,
    syncType: "sensitive_data_retention",
    status: "success",
    message: `Anonymized sensitive guest data for ${result.anonymized} reservation(s) with check-out before ${cutoffIso}`,
    payloadSummary: result,
  });

  return { ok: true, ...result };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// Vérification périodique (lire seule) que le funnel public de réservation
// répond correctement : disponibilité + tarif pour des fenêtres de dates
// lointaines (jamais de réservation créée). Si le site répond en erreur ou
// avec une forme inattendue, un e-mail / push admin est envoyé (dédupé sur
// 30 min) et un log est écrit. Un créneau indisponible n'est PAS une erreur :
// on essaie plusieurs fenêtres avant de conclure.
export async function runFunnelHealthCheck(env) {
  const config = getConfig(env);
  const baseUrl = config.publicBaseUrl;
  const unitCodes = [];
  for (const code of [...new Set([config.defaultUnitCode, "eco-studio"])]) {
    const unit = await getUnitByCode(env, code);
    if (unit) {
      unitCodes.push(code);
    }
  }

  const probeWindowDays = 30;
  const attemptsPerUnit = 6;
  const results = { ok: true, checks: [] };

  for (const unitCode of unitCodes) {
    const unitResult = { unitCode, status: "ok", details: [] };
    let unitOk = true;
    let foundWindow = false;

    for (let i = 0; i < attemptsPerUnit; i += 1) {
      const startDays = probeWindowDays * (i + 1);
      const from = new Date(Date.now() + startDays * 86400000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + (startDays + 5) * 86400000).toISOString().slice(0, 10);

      const availability = await fetchWithTimeout(
        `${baseUrl}/api/booking/availability?from=${from}&to=${to}&unitCode=${encodeURIComponent(unitCode)}`,
      );

      if (!availability.ok || !availability.body?.unit?.code) {
        unitOk = false;
        unitResult.details.push({
          step: "availability",
          from,
          to,
          status: "failed",
          http: availability.status,
        });
        break;
      }

      if (availability.body.available === false) {
        unitResult.details.push({ step: "availability", from, to, status: "unavailable_window" });
        continue;
      }

      const quote = await fetchWithTimeout(`${baseUrl}/api/booking/quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitCode,
          locale: "fr",
          checkInDate: from,
          checkOutDate: to,
          adults: 2,
          children: 0,
          infants: 0,
          vehicleType: unitCode === "parking-space" ? "van" : "",
          wcShowerRequested: false,
          nonRefundableSelected: false,
        }),
      });

      if (!quote.ok || typeof quote.body?.quote?.totalAmount !== "number") {
        unitOk = false;
        unitResult.details.push({ step: "quote", from, to, status: "failed", http: quote.status });
        break;
      }

      unitResult.details.push({
        step: "quote",
        from,
        to,
        status: "ok",
        totalAmount: quote.body.quote.totalAmount,
      });
      foundWindow = true;
      break;
    }

    if (!unitOk) {
      results.ok = false;
      unitResult.status = "failed";
    } else if (!foundWindow) {
      unitResult.details.push({ step: "all_windows_unavailable" });
    }

    results.checks.push(unitResult);
  }

  await insertSyncLog(env, {
    unitId: null,
    syncType: "funnel_health_check",
    status: results.ok ? "success" : "failed",
    message: results.ok
      ? "Booking funnel health check passed"
      : "Booking funnel health check FAILED — admin alerted",
    payloadSummary: { results },
  });

  if (!results.ok) {
    try {
      await sendAdminAlert(env, {
        key: "funnel_health_check_failed",
        subject: "⚠️ Funnel de réservation: vérification périodique en échec",
        message: `Le funnel de réservation (disponibilité / tarif) répond en erreur sur ${baseUrl}.

${JSON.stringify(results, null, 2)}`,
        tags: "critical",
      });
    } catch {
      // Alerting must never mask the original failure.
    }
  }

  return results;
}
