import { fetchIcsText, parseIcsEvents } from "./ics-import.js";
import { externalBlockSourceTag, getImportCalendarSources } from "./db.js";

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
        const conflictsForSource = parseIcsEvents(body)
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