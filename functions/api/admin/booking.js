import { hasValidAdminToken } from "../../_lib/auth.js";
import {
  listAdminReservations,
  listRatePeriods,
  listRecentSyncLogs,
  listUnitsForAdmin,
  upsertRatePeriod,
} from "../../_lib/db.js";
import { runArrivalEmails, runBookingIcsSync } from "../../_lib/jobs.js";
import { badRequest, json, serverError, unauthorized } from "../../_lib/http.js";
import { isIsoDateString } from "../../_lib/date.js";

export async function onRequestGet(context) {
  try {
    if (!hasValidAdminToken(context.request, context.env)) {
      return unauthorized("Missing or invalid admin token");
    }

    const [units, reservations, ratePeriods, syncLogs] = await Promise.all([
      listUnitsForAdmin(context.env),
      listAdminReservations(context.env, 60),
      listRatePeriods(context.env),
      listRecentSyncLogs(context.env, 25),
    ]);

    return json({
      units,
      reservations,
      ratePeriods,
      syncLogs,
    });
  } catch (error) {
    return serverError("Failed to load admin dashboard", error.message);
  }
}

export async function onRequestPost(context) {
  try {
    if (!hasValidAdminToken(context.request, context.env)) {
      return unauthorized("Missing or invalid admin token");
    }

    const payload = await context.request.json();
    const action = payload?.action;

    if (action === "create_rate_period") {
      if (!payload.unitId) {
        return badRequest("unitId is required");
      }

      if (!isIsoDateString(payload.startDate) || !isIsoDateString(payload.endDate)) {
        return badRequest("startDate and endDate must use YYYY-MM-DD");
      }

      if (Number.isNaN(Number(payload.nightlyBaseRate))) {
        return badRequest("nightlyBaseRate must be numeric");
      }

      const ratePeriodId = await upsertRatePeriod(context.env, {
        unitId: payload.unitId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        nightlyBaseRate: Number(payload.nightlyBaseRate),
        label: typeof payload.label === "string" ? payload.label.trim() : "",
        priority: Number(payload.priority || 100),
        isActive: payload.isActive !== false,
      });

      return json({
        ok: true,
        action,
        ratePeriodId,
      });
    }

    if (action === "run_booking_sync") {
      return json(await runBookingIcsSync(context.env, payload.unitCode || null));
    }

    if (action === "run_arrival_emails") {
      return json(await runArrivalEmails(context.env, payload.targetDate || null));
    }

    return badRequest("Unsupported admin action");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to handle admin action", error.message);
  }
}
