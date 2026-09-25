import { getConfig } from "./env.js";
import { fetchIcsText, parseIcsEvents } from "./ics-import.js";
import { externalBlockSourceTag, getImportCalendarSources, insertSyncLog } from "./db.js";
import { sendAdminAlert } from "./alerts.js";

// Vérification "juste-à-temps" des calendriers OTA (Booking.com, Airbnb, ...).
//
// Le contrôle de disponibilité standard (`getAvailabilityConflicts`) ne lit
// que la table `calendar_blocks`, alimentée par le cron ICS toutes les 20
// minutes. Une réservation OTA créée entre deux synchronisations n'y figure
// donc pas encore : une réservation directe pouvait être confirmée sur des
// dates déjà vendues sur une OTA (surbooking). Ce module relit les flux ICS à
// la demande, au moment critique, pour fermer cette fenêtre.
//
// Source-agnostique : toutes les sources `source_kind = 'ics'` actives sont
// prises en compte, quel que soit le `source_code`. Une source future non-ICS
// (API) devra fournir sa propre résolution de conflits.
//
// Fail-open total : la relecture est un filet de sécurité supplémentaire, pas
// un prérequis. Toute erreur (réseau, timeout, corps non-calendaire, base
// indisponible) est capturée et rendue dans `errors` — elle ne doit jamais
// empêcher ni retarder une réservation/confirmation, ni provoquer un 500 sur
// le webhook de paiement. Le contrôle DB et le cron restent les filets de
// dernier recours.

const DEFAULT_TIMEOUT_MS = 5000;

// Fuseau des nuits (TIMEZONE, ex. Europe/Zurich). Résolu défensivement : la
// relecture OTA ne doit JAMAIS échouer sur la configuration.
function safeTimeZone(env) {
  try {
    return getConfig(env).timeZone;
  } catch {
    return undefined;
  }
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

// Renvoie les conflits OTA détectés en direct pour la fenêtre demandée.
// Shape de `conflicts` alignée sur `getAvailabilityConflicts` (lignes de
// `calendar_blocks`) pour rester interchangeable dans les réponses 409.
export async function findLiveExternalConflicts(
  env,
  unitCode,
  startDate,
  endDate,
  { timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const conflicts = [];
  const errors = [];
  let checkedSources = 0;

  if (!unitCode || !startDate || !endDate) {
    return { conflicts, checkedSources, errors };
  }

  let sources = [];
  try {
    sources = (await getImportCalendarSources(env, null, unitCode)).filter(
      (source) => source.import_url,
    );
  } catch (error) {
    errors.push({ source: null, error: `sources_lookup_failed:${error.message}` });
    return { conflicts, checkedSources, errors };
  }

  const checked = await Promise.all(
    sources.map(async (source) => {
      const tag = externalBlockSourceTag(source);

      try {
        const body = await fetchIcsText(source.import_url, { timeoutMs });
        const conflictsForSource = parseIcsEvents(body, { timeZone: safeTimeZone(env) })
          .filter((event) => rangesOverlap(event.startDate, event.endDate, startDate, endDate))
          .map((event) => ({
            id: null,
            unit_id: source.unit_id,
            source: tag,
            external_uid: event.uid,
            reservation_id: null,
            start_date: event.startDate,
            end_date: event.endDate,
            status: "active",
          }));

        return { tag, conflicts: conflictsForSource };
      } catch (error) {
        return { tag, error: error.message };
      }
    }),
  );

  for (const result of checked) {
    if (result.error) {
      errors.push({ source: result.tag, error: result.error });
      continue;
    }

    checkedSources += 1;
    conflicts.push(...result.conflicts);
  }

  return { conflicts, checkedSources, errors };
}

// Observabilité du contrôle juste-à-temps.
//  - conflit détecté alors que la DB ne le voyait pas : c'est exactement la
//    fenêtre de synchro qui cause les surbookings → l'hôte doit le savoir ;
//  - mode dégradé (aucune source vérifiable) : on a vendu / confirmé sans
//    pouvoir croiser les OTA → signalement (dédupliqué côté `sendAdminAlert`).
// En mode sain, ne fait rien.
export async function reportLiveOtaCheck(env, { unitCode, startDate, endDate, result }) {
  const conflicts = result?.conflicts || [];
  const errors = result?.errors || [];
  const checkedSources = result?.checkedSources || 0;

  try {
    if (conflicts.length > 0) {
      const lines = conflicts.map(
        (item) => `- ${item.source} ${item.start_date} → ${item.end_date}`,
      );
      await insertSyncLog(env, {
        unitId: conflicts[0]?.unit_id || null,
        syncType: "ota_live_conflict",
        status: "warning",
        message: `Live OTA check blocked ${unitCode} ${startDate} → ${endDate} before the next ICS sync`,
        payloadSummary: { unitCode, startDate, endDate, conflicts },
      });
      await sendAdminAlert(env, {
        key: `ota_live_conflict:${unitCode}`,
        subject: `⚠️ Surbooking évité sur ${unitCode}`,
        message:
          `Une réservation ${startDate} → ${endDate} a été refusée sur ${unitCode} ` +
          `car une OTA venait de vendre ces dates (bloc pas encore importé par le cron).\n\n` +
          `${lines.join("\n")}\n\n` +
          "Le client n'a pas été facturé. Si le bloc OTA est un reflet obsolète " +
          "d'une de vos réservations annulées, rouvrir les dates sur l'OTA concernée.",
        tags: "warning",
        priority: "high",
      });
      return { reported: "conflict" };
    }

    if (checkedSources === 0 && errors.length > 0) {
      await insertSyncLog(env, {
        unitId: null,
        syncType: "ota_live_check_degraded",
        status: "warning",
        message: `Live OTA check could not verify any source for ${unitCode} ${startDate} → ${endDate}`,
        payloadSummary: { unitCode, startDate, endDate, errors },
      });
      await sendAdminAlert(env, {
        key: `ota_live_check_degraded:${unitCode}`,
        subject: `⚠️ Contrôle OTA live indisponible (${unitCode})`,
        message:
          `Aucun flux OTA n'a pu être relu pour ${unitCode} (${startDate} → ${endDate}). ` +
          `Le contrôle n'a reposé que sur la base locale, qui peut être à jour 20 min en retard.\n\n` +
          `Erreurs : ${errors.map((item) => `${item.source || "sources"}: ${item.error}`).join(", ")}`,
        tags: "warning",
      });
      return { reported: "degraded" };
    }

    return { reported: "none" };
  } catch (error) {
    // L'observabilité ne doit jamais faire échouer la réservation.
    return { reported: "failed", error: error.message };
  }
}