import { buildQuote } from "../../_lib/pricing.js";
import { getAvailabilityConflicts, getUnitByCode } from "../../_lib/db.js";
import { getConfig } from "../../_lib/env.js";
import { badRequest, conflict, json, serverError } from "../../_lib/http.js";
import { sendAdminAlert } from "../../_lib/alerts.js";
import { normalizeBookingInput, validateBookingInput } from "../../_lib/validation.js";

export async function onRequestPost(context) {
  try {
    const payload = normalizeBookingInput(await context.request.json());
    const unit = await getUnitByCode(context.env, payload.unitCode);

    if (!unit) {
      return badRequest("Unknown unit code");
    }

    const errors = validateBookingInput(payload, {
      unit,
      timeZone: getConfig(context.env).timeZone,
    });

    if (errors.length > 0) {
      return badRequest("Invalid booking payload", errors);
    }

    // A quote is only meaningful for an actually available stay. Without
    // this check the public quote tool (WebMCP) and any direct API caller
    // would receive a price for ranges that overlap booked nights.
    const conflicts = await getAvailabilityConflicts(
      context.env,
      unit.id,
      payload.checkInDate,
      payload.checkOutDate,
    );

    if (conflicts.length > 0) {
      return conflict("Selected dates are no longer available", conflicts);
    }

    const quote = await buildQuote(context.env, payload);

    return json({
      quote,
      bookingInput: {
        unitCode: payload.unitCode,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        vehicleType: payload.vehicleType,
        adults: payload.adults,
        children: payload.children,
        infants: payload.infants,
        wcShowerRequested: payload.wcShowerRequested,
        nonRefundableSelected: payload.nonRefundableSelected,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    console.error("Failed to build quote:", error);
    try {
      await sendAdminAlert(context.env, {
        key: "quote_failed",
        subject: "⚠️ Booking API: échec du calcul du tarif",
        message: `Le calcul du tarif a échoué (unitCode=${payload.unitCode}, ${payload.checkInDate} → ${payload.checkOutDate}).

${error?.stack || error?.message || String(error)}`,
        tags: "critical",
      });
    } catch {
      // Alerting must never mask the original error.
    }
    return serverError("Failed to build quote");
  }
}
