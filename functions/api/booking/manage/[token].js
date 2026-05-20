import { buildQuote } from "../../../_lib/pricing.js";
import {
  cancelReservation,
  getAvailabilityConflictsExcludingReservation,
  getReservationForManageToken,
  getUnitByCode,
  insertPaymentRecord,
  updateReservationBookingDetails,
} from "../../../_lib/db.js";
import { isArrivalWithin24Hours } from "../../../_lib/date.js";
import { getConfig } from "../../../_lib/env.js";
import { badRequest, json, notFound, serverError } from "../../../_lib/http.js";
import { sendReservationEmail, syncReservationToGoogleCalendar } from "../../../_lib/booking-ops.js";
import { generateOpaqueToken, sha256Hex } from "../../../_lib/security.js";
import { createHostedCheckout, isSumUpConfigured } from "../../../_lib/sumup.js";
import { normalizeBookingInput, validateBookingInput } from "../../../_lib/validation.js";

function toManageResponse(reservation) {
  const canSelfManage = ["confirmed", "modified", "refund_due", "pending_refund"].includes(
    reservation.status,
  );
  const paymentPending = reservation.status === "pending_payment";

  return {
    reservation: {
      id: reservation.id,
      publicReference: reservation.public_reference,
      unitCode: reservation.unit_code,
      unitDisplayName: reservation.unit_display_name,
      unitType: reservation.unit_type,
      locale: reservation.locale,
      status: reservation.status,
      paymentStatus: reservation.payment_status || null,
      guestFirstName: reservation.guest_first_name,
      guestLastName: reservation.guest_last_name,
      guestEmail: reservation.guest_email,
      guestPhone: reservation.guest_phone || "",
      vehicleType: reservation.vehicle_type || "",
      vehicleLengthM: reservation.vehicle_length_m,
      adults: reservation.adults,
      children: reservation.children,
      remarks: reservation.remarks || "",
      checkInDate: reservation.check_in_date,
      checkOutDate: reservation.check_out_date,
      checkInStartTime: reservation.check_in_start_time,
      checkInEndTime: reservation.check_in_end_time,
      checkOutTime: reservation.check_out_time,
      wcShowerRequested: Boolean(reservation.wc_shower_requested),
      refundablePolicyType: reservation.refundable_policy_type,
      totalAmount: Number(reservation.total_amount),
      currency: reservation.currency,
    },
    permissions: {
      canUpdate: canSelfManage,
      canCancel:
        reservation.status !== "cancelled" &&
        (reservation.status === "pending_payment" ||
          reservation.refundable_policy_type === "flexible_24h"),
      paymentPending,
    },
    notices: paymentPending
      ? [
          "This reservation is still waiting for payment. Date changes are disabled until payment is completed.",
        ]
      : [],
  };
}

async function resolveReservation(env, token) {
  const tokenHash = await sha256Hex(token);
  return getReservationForManageToken(env, tokenHash);
}

function buildEditablePayload(reservation, rawBody) {
  const normalized = normalizeBookingInput({
    unitCode: reservation.unit_code,
    locale: reservation.locale,
    checkInDate: rawBody.checkInDate ?? reservation.check_in_date,
    checkOutDate: rawBody.checkOutDate ?? reservation.check_out_date,
    vehicleType: rawBody.vehicleType ?? reservation.vehicle_type,
    vehicleLengthM: rawBody.vehicleLengthM ?? reservation.vehicle_length_m,
    adults: rawBody.adults ?? reservation.adults,
    children: rawBody.children ?? reservation.children,
    wcShowerRequested:
      rawBody.wcShowerRequested ?? Boolean(reservation.wc_shower_requested),
    nonRefundableSelected: reservation.refundable_policy_type === "non_refundable",
    remarks: rawBody.remarks ?? reservation.remarks ?? "",
    guestFirstName: reservation.guest_first_name,
    guestLastName: reservation.guest_last_name,
    guestEmail: reservation.guest_email,
    guestPhone: reservation.guest_phone || "",
    acceptedTerms: true,
  });

  return normalized;
}

export async function onRequestGet(context) {
  try {
    const reservation = await resolveReservation(context.env, context.params.token);

    if (!reservation) {
      return notFound("Unknown or expired booking link");
    }

    return json(toManageResponse(reservation));
  } catch (error) {
    return serverError("Failed to load reservation", error.message);
  }
}

export async function onRequestPost(context) {
  try {
    const reservation = await resolveReservation(context.env, context.params.token);

    if (!reservation) {
      return notFound("Unknown or expired booking link");
    }

    const body = await context.request.json();
    const action = body?.action;

    if (!action) {
      return badRequest("action is required");
    }

    if (action === "cancel") {
      if (reservation.status === "cancelled") {
        return badRequest("Reservation is already cancelled");
      }

      if (reservation.status !== "pending_payment") {
        const within24h = isArrivalWithin24Hours(
          reservation.check_in_date,
          reservation.check_in_start_time,
          getConfig(context.env).timeZone,
        );

        if (reservation.refundable_policy_type !== "flexible_24h" || within24h) {
          return badRequest("This reservation is no longer eligible for self-service cancellation");
        }
      }

      if (reservation.payment_status === "paid" && reservation.status !== "pending_payment") {
        await insertPaymentRecord(context.env, {
          reservationId: reservation.id,
          provider: "sumup",
          providerCheckoutId: null,
          providerPaymentReference: null,
          type: "refund",
          status: "manual_refund_due",
          amount: Number(reservation.total_amount || 0),
          currency: reservation.currency,
          rawPayload: {
            reason: "customer_self_service_cancellation",
          },
        });
      }

      await cancelReservation(context.env, reservation.id);
      try {
        await sendReservationEmail(context.env, reservation.id, "booking_cancellation");
      } catch {
        // Email failures should not block cancellation.
      }
      try {
        await syncReservationToGoogleCalendar(context.env, reservation.id);
      } catch {
        // Calendar sync failures should not block cancellation.
      }

      return json({
        ok: true,
        action: "cancel",
        status: "cancelled",
      });
    }

    if (reservation.status === "pending_payment") {
      return badRequest("Changes are disabled until the initial payment is completed");
    }

    const unit = await getUnitByCode(context.env, reservation.unit_code);

    if (!unit) {
      return badRequest("Unknown unit");
    }

    const payload = buildEditablePayload(reservation, body);
    const errors = validateBookingInput(payload, { unit });

    if (errors.length > 0) {
      return badRequest("Invalid booking payload", errors);
    }

    const conflicts = await getAvailabilityConflictsExcludingReservation(
      context.env,
      unit.id,
      payload.checkInDate,
      payload.checkOutDate,
      reservation.id,
    );

    if (conflicts.length > 0) {
      return json(
        {
          error: "conflict",
          message: "Selected dates are no longer available",
          details: conflicts,
        },
        { status: 409 },
      );
    }

    const quote = await buildQuote(context.env, payload);
    const currentTotal = Number(reservation.total_amount || 0);
    const nextTotal = Number(quote.totalAmount || 0);
    const deltaAmount = Math.round((nextTotal - currentTotal + Number.EPSILON) * 100) / 100;

    if (action === "quote") {
      return json({
        ok: true,
        action: "quote",
        currentTotal,
        nextTotal,
        deltaAmount,
        quote,
      });
    }

    if (action !== "update") {
      return badRequest("Unsupported action");
    }

    let reservationStatus = deltaAmount < 0 ? "refund_due" : "modified";
    let calendarBlockStatus = "confirmed";
    let payment = null;

    if (deltaAmount > 0) {
      reservationStatus = "pending_adjustment_payment";
      calendarBlockStatus = "pending_payment";
    }

    await updateReservationBookingDetails(context.env, reservation.id, {
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      checkInStartTime: unit.checkInStartTime,
      checkInEndTime: unit.checkInEndTime,
      checkOutTime: unit.checkOutTime,
      adults: payload.adults,
      children: payload.children,
      vehicleType: payload.vehicleType,
      vehicleLengthM: payload.vehicleLengthM,
      remarks: payload.remarks,
      wcShowerRequested: payload.wcShowerRequested,
      refundablePolicyType: quote.refundablePolicyType,
      arrivalLessThan24h: quote.arrivalLessThan24h,
      baseRateSnapshot: quote.nightlyRates,
      baseAmount: quote.baseAmount,
      touristTaxAmount: quote.touristTaxAmount,
      optionsAmount: quote.optionsAmount,
      longStayDiscountAmount: quote.longStayDiscountAmount,
      nonRefundableDiscountAmount: quote.nonRefundableDiscountAmount,
      paymentFeeAmount: quote.paymentFeeAmount,
      totalAmount: quote.totalAmount,
      status: reservationStatus,
      calendarBlockStatus,
    });

    if (deltaAmount > 0) {
      if (isSumUpConfigured(context.env)) {
        const checkoutReference = `${reservation.public_reference}-ADJ-${generateOpaqueToken(6).slice(0, 6).toUpperCase()}`;
        const checkout = await createHostedCheckout(context.env, {
          amount: deltaAmount,
          checkoutReference,
          currency: quote.currency,
          description: `${unit.displayName} adjustment ${reservation.public_reference}`,
          redirectUrl: `${getConfig(context.env).publicBaseUrl}/booking/manage/${context.params.token}`,
          returnUrl: `${getConfig(context.env).publicBaseUrl}/api/booking/sumup/webhook`,
        });

        await insertPaymentRecord(context.env, {
          reservationId: reservation.id,
          provider: "sumup",
          providerCheckoutId: checkout.id,
          providerPaymentReference: checkout.transaction_id || null,
          type: "adjustment",
          status: (checkout.status || "PENDING").toLowerCase(),
          amount: deltaAmount,
          currency: quote.currency,
          rawPayload: checkout,
        });

        payment = {
          provider: "sumup",
          checkoutId: checkout.id,
          hostedCheckoutUrl: checkout.hosted_checkout_url || null,
          status: (checkout.status || "PENDING").toLowerCase(),
        };
      } else {
        payment = {
          provider: "sumup",
          status: "configuration_required",
        };
      }
    } else if (deltaAmount < 0) {
      await insertPaymentRecord(context.env, {
        reservationId: reservation.id,
        provider: "sumup",
        providerCheckoutId: null,
        providerPaymentReference: null,
        type: "refund",
        status: "manual_refund_due",
        amount: Math.abs(deltaAmount),
        currency: quote.currency,
        rawPayload: {
          reason: "customer_self_service_modification",
          previousTotal: currentTotal,
          nextTotal,
        },
      });
    }

    try {
      await sendReservationEmail(context.env, reservation.id, "booking_modification", {
        deltaAmount,
        manageToken: context.params.token,
      });
    } catch {
      // Email failures should not block customer updates.
    }
    try {
      await syncReservationToGoogleCalendar(context.env, reservation.id);
    } catch {
      // Calendar sync failures should not block customer updates.
    }

    return json({
      ok: true,
      action: "update",
      currentTotal,
      nextTotal,
      deltaAmount,
      reservationStatus,
      quote,
      payment,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to manage reservation", error.message);
  }
}
