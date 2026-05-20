import {
  getAvailabilityConflicts,
  getLatestCalendarSyncForUnit,
  getNightlyRates,
  getUnitByCode,
} from "../../_lib/db.js";
import { getConfig } from "../../_lib/env.js";
import { isIsoDateString } from "../../_lib/date.js";
import { badRequest, json, serverError } from "../../_lib/http.js";

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const unitCode = url.searchParams.get("unitCode") || getConfig(env).defaultUnitCode;

    const unit = await getUnitByCode(env, unitCode);

    if (!unit) {
      return badRequest("Unknown unit code");
    }

    if ((from && !to) || (!from && to)) {
      return badRequest("Both from and to must be provided together");
    }

    if (!from || !to) {
      return json({
        unit: {
          code: unit.code,
          unitType: unit.unitType,
          displayName: unit.displayName,
          minStayNights: Number(unit.settings?.minStayNights || 1),
        },
        available: null,
        blockedRanges: [],
        nightlyRates: [],
        lastCalendarSyncAt: null,
        message: "Provide from and to to check a specific stay",
      });
    }

    if (!isIsoDateString(from) || !isIsoDateString(to)) {
      return badRequest("from and to must use YYYY-MM-DD format");
    }

    const conflicts = await getAvailabilityConflicts(env, unit.id, from, to);
    const nightlyRates = await getNightlyRates(env, unit, from, to);
    const latestSync = unit.id
      ? await getLatestCalendarSyncForUnit(env, unit.id, "booking")
      : null;

    return json({
      unit: {
        code: unit.code,
        unitType: unit.unitType,
        displayName: unit.displayName,
        minStayNights: Number(unit.settings?.minStayNights || 1),
      },
      available: conflicts.length === 0,
      blockedRanges: conflicts.map((conflict) => ({
        startDate: conflict.start_date,
        endDate: conflict.end_date,
        source: conflict.source,
        status: conflict.status,
      })),
      nightlyRates,
      lastCalendarSyncAt: latestSync?.last_synced_at || null,
    });
  } catch (error) {
    return serverError("Failed to compute availability", error.message);
  }
}
