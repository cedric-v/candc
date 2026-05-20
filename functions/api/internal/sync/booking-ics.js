import { hasValidInternalToken } from "../../../_lib/auth.js";
import { badRequest, json, serverError, unauthorized } from "../../../_lib/http.js";
import { runBookingIcsSync } from "../../../_lib/jobs.js";

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (!hasValidInternalToken(request, env)) {
      return unauthorized("Missing or invalid internal sync token");
    }

    let payload = {};
    if (request.method === "POST") {
      const rawBody = await request.text();
      payload = rawBody ? JSON.parse(rawBody) : {};
    } else {
      const url = new URL(request.url);
      payload = {
        unitCode: url.searchParams.get("unitCode") || null,
      };
    }

    const unitCode = typeof payload.unitCode === "string" && payload.unitCode.trim()
      ? payload.unitCode.trim()
      : null;
    const result = await runBookingIcsSync(env, unitCode);

    if (result.results.length === 0) {
      return badRequest("No active Booking ICS source found for the requested scope");
    }

    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to run Booking ICS sync", error.message);
  }
}
