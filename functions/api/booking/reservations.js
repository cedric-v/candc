import { getConfig } from "../../_lib/env.js";
import {
  getAvailabilityConflicts,
  getUnitByCode,
  insertPaymentRecord,
  insertPendingReservation,
  markReservationPaymentSetupFailed,
} from "../../_lib/db.js";
import { buildQuote } from "../../_lib/pricing.js";
import { badRequest, conflict, json, serverError } from "../../_lib/http.js";
import { generateOpaqueToken, sha256Hex } from "../../_lib/security.js";
import { sendReservationEmail } from "../../_lib/booking-ops.js";
import { createHostedCheckout, isSumUpConfigured } from "../../_lib/sumup.js";
import { normalizeBookingInput, validateBookingInput } from "../../_lib/validation.js";

export async function onRequestPost(context) {
  try {
    const payload = normalizeBookingInput(await context.request.json());
    const unit = await getUnitByCode(context.env, payload.unitCode);

    if (!unit) {
      return badRequest("Unknown unit code");
    }

    const errors = validateBookingInput(payload, { requireGuestInfo: true, unit });

    if (!payload.acceptedTerms) {
      errors.push({ field: "acceptedTerms", message: "Terms must be accepted" });
    }

    if (errors.length > 0) {
      return badRequest("Invalid reservation payload", errors);
    }

    const conflicts = await getAvailabilityConflicts(
      context.env,
      unit.id,
      payload.checkInDate,
      payload.checkOutDate,
    );

    if (conflicts.length > 0) {
      return conflict("Selected dates are no longer available", conflicts);
    }

    const config = getConfig(context.env);
    const pricing = await buildQuote(context.env, payload);
    const manageToken = generateOpaqueToken();
    const manageTokenHash = await sha256Hex(manageToken);

    const reservationRecord = await insertPendingReservation(
      context.env,
      unit,
      {
        ...payload,
        checkInStartTime: unit.checkInStartTime || config.checkInTime,
        checkInEndTime: unit.checkInEndTime || config.checkInEndTime,
        checkOutTime: unit.checkOutTime || config.checkOutTime,
      },
      pricing,
      manageTokenHash,
    );

    if (!isSumUpConfigured(context.env)) {
      try {
        await sendReservationEmail(
          context.env,
          reservationRecord.reservationId,
          "booking_confirmation",
          { manageToken },
        );
      } catch {
        // Email failures should not block reservation creation.
      }

      return json(
        {
          reservation: {
            id: reservationRecord.reservationId,
            unitCode: unit.code,
            publicReference: reservationRecord.publicReference,
            status: "pending_payment",
            manageUrl: `${config.publicBaseUrl}/booking/manage/${manageToken}`,
          },
          pricing,
          payment: {
            provider: "sumup",
            status: "configuration_required",
            message: "SUMUP_API_KEY and SUMUP_MERCHANT_CODE must be configured",
          },
        },
        { status: 201 },
      );
    }

    let checkout;

    try {
      checkout = await createHostedCheckout(context.env, {
        amount: pricing.totalAmount,
        checkoutReference: reservationRecord.publicReference,
        currency: pricing.currency,
        description: `${unit.displayName} ${reservationRecord.publicReference}`,
        redirectUrl: `${config.publicBaseUrl}/booking/confirmation/?reference=${encodeURIComponent(reservationRecord.publicReference)}&manageToken=${encodeURIComponent(manageToken)}`,
        returnUrl: `${config.publicBaseUrl}/api/booking/sumup/webhook`,
      });
    } catch (error) {
      await markReservationPaymentSetupFailed(
        context.env,
        reservationRecord.reservationId,
        error.message,
      );

      return serverError("Failed to create SumUp checkout", error.message);
    }

    await insertPaymentRecord(context.env, {
      reservationId: reservationRecord.reservationId,
      provider: "sumup",
      providerCheckoutId: checkout.id,
      providerPaymentReference: checkout.transaction_id || null,
      type: "initial",
      status: (checkout.status || "PENDING").toLowerCase(),
      amount: pricing.totalAmount,
      currency: pricing.currency,
      rawPayload: checkout,
    });

    try {
      await sendReservationEmail(
        context.env,
        reservationRecord.reservationId,
        "booking_confirmation",
        { manageToken },
      );
    } catch {
      // Email failures should not block reservation creation.
    }

    return json(
      {
        reservation: {
          id: reservationRecord.reservationId,
          unitCode: unit.code,
          publicReference: reservationRecord.publicReference,
          status: "pending_payment",
          manageUrl: `${config.publicBaseUrl}/booking/manage/${manageToken}`,
        },
        pricing,
        payment: {
          provider: "sumup",
          status: (checkout.status || "PENDING").toLowerCase(),
          checkoutId: checkout.id,
          checkoutReference: checkout.checkout_reference || reservationRecord.publicReference,
          hostedCheckoutUrl: checkout.hosted_checkout_url || null,
          redirectUrl: checkout.redirect_url || null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to create reservation", error.message);
  }
}
