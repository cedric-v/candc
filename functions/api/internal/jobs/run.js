import { hasValidInternalToken } from "../../../_lib/auth.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { runArrivalEmails, runBookingIcsSync } from "../../../_lib/jobs.js";

export async function onRequestPost(context) {
  try {
    if (!hasValidInternalToken(context.request, context.env)) {
      return unauthorized("Missing or invalid internal sync token");
    }

    const rawBody = await context.request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
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
