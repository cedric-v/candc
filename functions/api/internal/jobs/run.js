import { hasValidInternalToken } from "../../../_lib/auth.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { runArrivalEmails, runBookingIcsSync, runDepartureEmails, runFunnelHealthCheck, runReviewRequestEmails, validateCalendarSources } from "../../../_lib/jobs.js";
import { runPendingPaymentHoldMaintenance } from "../../../_lib/booking-ops.js";

export async function onRequest(context) {
  try {
    if (!(await hasValidInternalToken(context.request, context.env))) {
      return unauthorized("Missing or invalid internal sync token");
    }

    let payload = {};
    if (context.request.method === "POST") {
      const rawBody = await context.request.text();
      payload = rawBody ? JSON.parse(rawBody) : {};
    } else {
      const url = new URL(context.request.url);
      payload = {
        action: url.searchParams.get("action") || "all",
        unitCode: url.searchParams.get("unitCode") || null,
        targetDate: url.searchParams.get("targetDate") || null,
      };
    }
    const action = payload.action || "all";

    if (action === "booking_ics") {
      await runPendingPaymentHoldMaintenance(context.env);
      return json(await runBookingIcsSync(context.env, payload.unitCode || null));
    }

    if (action === "arrival_emails") {
      return json(await runArrivalEmails(context.env, payload.targetDate || null));
    }

    if (action === "hold_maintenance") {
      return json(await runPendingPaymentHoldMaintenance(context.env));
    }

    if (action === "departure_emails") {
      return json(await runDepartureEmails(context.env, payload.targetDate || null));
    }

    if (action === "review_emails") {
      return json(await runReviewRequestEmails(context.env, payload.targetDate || null));
    }

    if (action === "validate_calendars") {
      return json(await validateCalendarSources(context.env, payload.unitCode || null));
    }

    if (action === "funnel_check") {
      return json(await runFunnelHealthCheck(context.env));
    }

    if (action === "all") {
      await runPendingPaymentHoldMaintenance(context.env);
      const bookingSync = await runBookingIcsSync(context.env, payload.unitCode || null);
      const arrivalEmails = await runArrivalEmails(context.env, payload.targetDate || null);
      const departureEmails = await runDepartureEmails(context.env, payload.targetDate || null);
      const reviewEmails = await runReviewRequestEmails(context.env, payload.targetDate || null);

      return json({
        ok: bookingSync.ok && arrivalEmails.ok && departureEmails.ok && reviewEmails.ok,
        bookingSync,
        arrivalEmails,
        departureEmails,
        reviewEmails,
      });
    }

    return badRequest("Unsupported action");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    console.error("Failed to run internal jobs:", error);
    return serverError("Failed to run internal jobs");
  }
}
