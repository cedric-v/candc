import { buildQuote } from "../../_lib/pricing.js";
import { getUnitByCode } from "../../_lib/db.js";
import { getConfig } from "../../_lib/env.js";
import { badRequest, json, serverError } from "../../_lib/http.js";
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
    return serverError("Failed to build quote");
  }
}
