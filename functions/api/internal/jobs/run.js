import { hasValidInternalToken } from "../../../_lib/auth.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { runArrivalEmails, runBookingIcsSync } from "../../../_lib/jobs.js";

export async function onRequest(context) {
  try {
    if (!hasValidInternalToken(context.request, context.env)) {
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
      return json(await runBookingIcsSync(context.env, payload.unitCode || null));
    }

    if (action === "arrival_emails") {
      return json(await runArrivalEmails(context.env, payload.targetDate || null));
    }

    if (action === "all") {
      const bookingSync = await runBookingIcsSync(context.env, payload.unitCode || null);
      const arrivalEmails = await runArrivalEmails(context.env, payload.targetDate || null);

      return json({
        ok: bookingSync.ok && arrivalEmails.ok,
        bookingSync,
        arrivalEmails,
      });
    }

    return badRequest("Unsupported action");
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to run internal jobs", error.message);
  }
}
