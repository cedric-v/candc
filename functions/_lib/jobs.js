import {
  anonymizeExpiredGuestSensitiveData,
  countFutureExternalBlocks,
  createManageToken,
  externalBlockSourceTag,
  findExternalDirectOverlapsForUnit,
  getArrivalReservationsForDate,
  getDepartureReservationsForDate,
  getImportCalendarSources,
  getReviewRequestReservationsForDate,
  getUnitByCode,
  insertSyncLog,
  listEmailLogsPendingDeliveryCheck,
  replaceExternalCalendarBlocks,
  setEmailDeliveryStatus,
  updateCalendarSourceSync,
} from "./db.js";
import { getCurrentIsoDateInZone } from "./date.js";
import { getConfig } from "./env.js";
import { sendReservationEmail } from "./booking-ops.js";
import { fetchIcsText, parseIcsEvents } from "./ics-import.js";
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
  // Timeout + validation stricte du corps : voir `fetchIcsText` (ics-import.js).
  return fetchIcsText(importUrl, { timeoutMs: 15000 });
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
  const config = getConfig(env);
  const todayIso = getCurrentIsoDateInZone(config.timeZone);
  // Toutes les OTA actives (booking, airbnb, ...) : source-agnostique.
  const sources = await getImportCalendarSources(env, null, unitCode);
  const results = [];
  const syncedUnitIds = new Map();

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
      const futureBlocksBefore = await countFutureExternalBlocks(
        env,
        sourceRecord.unit_id,
        externalBlockSourceTag(sourceRecord),
        todayIso,
      );

      const icsText = await fetchIcs(importUrl);
      const events = parseIcsEvents(icsText, { timeZone: config.timeZone });

      await replaceExternalCalendarBlocks(env, sourceRecord, events);

      // Un flux qui devient vide alors qu'il bloquait des nuits est suspect
      // (feed tronqué / réinitialisé côté OTA) : les dates viennent d'être
      // ré-ouvertes à la vente, l'hôte doit le savoir immédiatement.
      if (events.length === 0 && futureBlocksBefore > 0) {
        await insertSyncLog(env, {
          unitId: sourceRecord.unit_id,
          syncType: "ota_feed_emptied",
          status: "warning",
          message: `${sourceRecord.source_code} feed for ${sourceRecord.unit_code} returned 0 events while ${futureBlocksBefore} future block(s) were stored`,
          payloadSummary: {
            unitCode: sourceRecord.unit_code,
            sourceId: sourceRecord.id,
            previousFutureBlocks: futureBlocksBefore,
          },
        });
        try {
          await sendAdminAlert(env, {
            key: `ota_feed_emptied:${sourceRecord.unit_code}:${sourceRecord.source_code}`,
            subject: `⚠️ Flux ${sourceRecord.source_code} (${sourceRecord.unit_code}) vide`,
            message:
              `Le flux ICS ${sourceRecord.source_code} de ${sourceRecord.unit_code} a renvoyé 0 événement ` +
              `alors que ${futureBlocksBefore} blocage(s) à venir étaient stockés. ` +
              `Les dates ont été ré-ouvertes à la vente : vérifier le calendrier OTA et re-bloquer si nécessaire.`,
            tags: "warning",
          });
        } catch {
          // L'alerte ne doit jamais faire échouer la synchronisation.
        }
      }

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
      syncedUnitIds.set(
        sourceRecord.unit_id,
        sourceRecord.unit_code || sourceRecord.unit_id,
      );
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

  // Rapprochement après import : un bloc OTA fraîchement importé peut
  // recouvrir une réservation directe déjà confirmée (l'OTA n'avait pas encore
  // repris notre flux d'export). On alerte l'hôte immédiatement plutôt que de
  // laisser le surbooking être découvert à l'arrivée du client.
  const overbookings = [];
  for (const [syncedUnitId, syncedUnitCode] of syncedUnitIds.entries()) {
    try {
      const overlaps = await findExternalDirectOverlapsForUnit(env, syncedUnitId);
      if (overlaps.length > 0) {
        overbookings.push({ unitCode: syncedUnitCode, overlaps });
      }
    } catch (error) {
      console.error(`Overbooking reconciliation failed for ${syncedUnitCode}:`, error);
    }
  }

  for (const { unitCode: conflictingUnitCode, overlaps } of overbookings) {
    const lines = overlaps.map(
      (item) =>
        `- ${item.external_source} ${item.external_start_date} → ${item.external_end_date} ` +
        `vs ${item.public_reference} ${item.check_in_date} → ${item.check_out_date} ` +
        `(${item.guest_first_name} ${item.guest_last_name})`,
    );
    try {
      await sendAdminAlert(env, {
        key: `overbooking_detected:${conflictingUnitCode}`,
        subject: `⚠️ Surbooking détecté sur ${conflictingUnitCode}`,
        message: `Un calendrier OTA et une réservation directe se chevauchent sur l'unité "${conflictingUnitCode}".\n\n` +
          `${lines.join("\n")}\n\n` +
          "Vérifier le calendrier admin et contacter le voyageur concerné (relogement / annulation).",
        tags: "warning",
        priority: "urgent",
      });
    } catch (error) {
      console.error("Failed to send overbooking alert:", error);
    }
  }

  await insertSyncLog(env, {
    unitId: null,
    syncType: "calendar_sync_job",
    status: buildValidationResultStatus(results),
    message: `Processed ${results.length} active OTA calendar source(s)${overbookings.length > 0 ? ` — ${overbookings.length} overbooking(s) detected` : ""}`,
    payloadSummary: {
      unitCode: unitCode || null,
      results,
      overbookings,
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
        // Pas de rotation : l'e-mail d'arrivée ne doit pas invalider le lien de
        // gestion déjà reçu (confirmation, relances). Voir AGENTS.md
        // (« Management links »).
        manageTokenFactory: () => createManageToken(env, reservation.id),
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
  const sources = await getImportCalendarSources(env, null, unitCode);
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
        result.importEventCount = parseIcsEvents(importIcs, { timeZone: config.timeZone }).length;
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
        result.exportEventCount = parseIcsEvents(exportIcs, { timeZone: config.timeZone }).length;
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

// Vérification de la remise réelle des e-mails transactionnels.
//
// `email_logs.status = 'sent'` ne veut dire que « Resend a accepté l'envoi ».
// Un bounce (« 554 5.7.1 Command rejected » côté fournisseur du destinataire,
// incident du 01.11.2026 sur l'e-mail d'arrivée de PARK-20261101-B62F74EB)
// survenait après coup et restait invisible : l'hôte croyait le client
// informé. Ce job interroge l'API Resend pour les e-mails envoyés dont la
// remise est encore inconnue, stocke `delivery_status` (lisible dans l'admin)
// et alerte l'admin sur bounce / plainte spam.
//
// Totalement fail-open : une erreur Resend ou D1 n'empêche jamais les autres
// jobs du cron et ne fait jamais échouer le worker.
export async function runEmailDeliveryCheck(env, options = {}) {
  const config = getConfig(env);
  const results = { checked: 0, bounced: [], failed: [], skipped: false, errors: 0 };

  if (!config.resendApiKey) {
    await insertSyncLog(env, {
      unitId: null,
      syncType: "email_delivery_check",
      status: "skipped",
      message: "resend_not_configured — delivery check skipped",
      payloadSummary: { reason: "resend_not_configured" },
    });
    return { ok: true, ...results, skipped: true, reason: "resend_not_configured" };
  }

  const limit = Number(options.limit || 20);
  const rows = await listEmailLogsPendingDeliveryCheck(env, {
    lookbackHours: Number(options.lookbackHours || 72),
    limit,
  });

  for (const row of rows) {
    const messageId = String(row.provider_message_id || "");
    // Les logs d'échec de configuration stockent un motif à la place d'un id.
    if (!messageId || messageId.startsWith("email_not_")) {
      continue;
    }

    try {
      const response = await fetchWithTimeout(
        `https://api.resend.com/emails/${encodeURIComponent(messageId)}`,
        { headers: { authorization: `Bearer ${config.resendApiKey}` } },
        8000,
      );

      const deliveryStatus = response.body?.last_event;
      if (!response.ok || !deliveryStatus) {
        // Transitoire : on laisse `delivery_status` à NULL pour un prochain passage.
        results.errors += 1;
        continue;
      }

      await setEmailDeliveryStatus(env, row.id, String(deliveryStatus));
      results.checked += 1;

      if (["bounced", "complained", "failed"].includes(deliveryStatus)) {
        const entry = {
          reservationId: row.reservation_id,
          emailType: row.email_type,
          recipient: row.recipient,
          deliveryStatus,
          diagnostic: response.body?.bounce?.diagnosticCode || response.body?.bounce?.message || null,
        };
        if (deliveryStatus === "bounced") {
          results.bounced.push(entry);
        } else {
          results.failed.push(entry);
        }
      }
    } catch (error) {
      results.errors += 1;
      console.error(`Email delivery check failed for ${row.id}:`, error);
    }

    // Resend limite à 2 requêtes/seconde : on étale les appels (~1,8 req/s).
    await new Promise((resolve) => setTimeout(resolve, 550));
  }

  const problems = [...results.bounced, ...results.failed];

  await insertSyncLog(env, {
    unitId: null,
    syncType: "email_delivery_check",
    status: problems.length > 0 ? "warning" : "success",
    message:
      problems.length > 0
        ? `Checked ${results.checked} email(s) — ${problems.length} undelivered (admin alerted)`
        : `Checked ${results.checked} email(s) — all delivered`,
    payloadSummary: results,
  });

  for (const problem of problems) {
    try {
      await sendAdminAlert(env, {
        key: `email_not_delivered:${problem.reservationId}:${problem.emailType}`,
        subject:
          problem.deliveryStatus === "bounced"
            ? `⚠️ E-mail rejeté (bounce) : ${problem.emailType} — ${problem.recipient}`
            : `⚠️ E-mail non remis (${problem.deliveryStatus}) : ${problem.emailType} — ${problem.recipient}`,
        message:
          `Resend signale que l'e-mail "${problem.emailType}" n'a pas été remis.\n\n` +
          `Destinataire : ${problem.recipient}\n` +
          `Réservation : ${problem.reservationId}\n` +
          `État : ${problem.deliveryStatus}\n` +
          (problem.diagnostic ? `Diagnostic : ${problem.diagnostic}\n` : "") +
          "\nLe Journal (email_logs) affiche « sent » : Resend a accepté l'envoi, la remise a échoué après coup.\n" +
          "Renvoyer l'e-mail depuis /admin/booking (bouton « Resend » dans le détail de la réservation) " +
          "et contacter le voyageur si le rejet se répète (WhatsApp / téléphone).",
        tags: "warning",
        priority: "high",
      });
    } catch (error) {
      console.error("Failed to send email delivery alert:", error);
    }
  }

  return { ok: problems.length === 0, ...results };
}
