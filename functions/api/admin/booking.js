import { hasValidAdminToken } from "../../_lib/auth.js";
import {
  listCalendarHealthForAdmin,
  listAdminReservations,
  listOperationalJobHealth,
  listRatePeriods,
  listRecentSyncLogs,
  listUnitsForAdmin,
  updateUnitSettings,
  upsertRatePeriod,
} from "../../_lib/db.js";
import { getConfig } from "../../_lib/env.js";
import { getCurrentIsoDateInZone, isIsoDateString } from "../../_lib/date.js";
import { runArrivalEmails, runBookingIcsSync, runSensitiveDataRetention, validateCalendarSources } from "../../_lib/jobs.js";
import { badRequest, json, serverError, unauthorized } from "../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    if (!(await hasValidAdminToken(context.request, context.env))) {
      return unauthorized("Missing or invalid admin token");
    }

    const url = new URL(context.request.url);
    const reservationOptions = {
      scope: url.searchParams.get("scope") || "upcoming",
      statusGroup: url.searchParams.get("status") || "active",
      unitCode: url.searchParams.get("unit") || null,
      limit: Number(url.searchParams.get("limit") || 100),
      todayIso: getCurrentIsoDateInZone(getConfig(context.env).timeZone),
    };

    const [units, reservations, ratePeriods, syncLogs, calendarHealth, operationalHealth] =
      await Promise.all([
      listUnitsForAdmin(context.env),
      listAdminReservations(context.env, reservationOptions),
      listRatePeriods(context.env),
      listRecentSyncLogs(context.env, 25),
      listCalendarHealthForAdmin(context.env),
      listOperationalJobHealth(context.env),
    ]);

    return json({
      units,
      reservations,
      ratePeriods,
      syncLogs,
      calendarHealth,
      operationalHealth,
    });
  } catch (error) {
    console.error("Failed to load admin dashboard:", error);
    return serverError("Failed to load admin dashboard");
  }
}

export async function onRequestPost(context) {
  try {
    if (!(await hasValidAdminToken(context.request, context.env))) {
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

    if (action === "update_long_stay_discounts") {
      if (!payload.unitId) {
        return badRequest("unitId is required");
      }

      const units = await listUnitsForAdmin(context.env);
      const unit = units.find((item) => item.id === payload.unitId);

      if (!unit) {
        return badRequest("Unknown unit");
      }

      const tiers = Array.isArray(payload.tiers) ? payload.tiers : [];
      const normalizedTiers = tiers
        .map((tier) => ({
          minNights: Number(tier?.minNights || 0),
          rate: Number(tier?.rate || 0),
        }))
        .filter((tier) => tier.minNights > 0 && tier.rate > 0);

      if (normalizedTiers.some((tier) => !Number.isFinite(tier.minNights) || !Number.isFinite(tier.rate))) {
        return badRequest("All tier values must be numeric");
      }

      const dedupedTiers = normalizedTiers
        .sort((left, right) => left.minNights - right.minNights)
        .filter(
          (tier, index, list) =>
            list.findIndex((candidate) => candidate.minNights === tier.minNights) === index,
        );

      const nextSettings = {
        ...(unit.settings || {}),
        longStayDiscountTiers: dedupedTiers,
      };

      await updateUnitSettings(context.env, payload.unitId, nextSettings);

      return json({
        ok: true,
        action,
        unitId: payload.unitId,
        tiers: dedupedTiers,
      });
    }

    if (action === "run_booking_sync") {
      return json(await runBookingIcsSync(context.env, payload.unitCode || null));
    }

    if (action === "run_arrival_emails") {
      return json(await runArrivalEmails(context.env, payload.targetDate || null));
    }

    if (action === "validate_calendar_sources") {
      return json(await validateCalendarSources(context.env, payload.unitCode || null));
    }

    if (action === "run_sensitive_data_retention") {
      return json(await runSensitiveDataRetention(context.env));
    }

    return badRequest("Unsupported admin action");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    console.error("Failed to handle admin action:", error);
    return serverError("Failed to handle admin action");
  }
}
