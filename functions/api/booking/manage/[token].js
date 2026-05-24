import { buildQuote } from "../../../_lib/pricing.js";
import {
  cancelReservation,
  getAvailabilityConflictsExcludingReservation,
  getPaymentsForReservation,
  getReservationForManageToken,
  getUnitByCode,
  insertPaymentRecord,
  updateReservationAndCalendarStatus,
  updateReservationBookingDetails,
} from "../../../_lib/db.js";
import { isArrivalWithin48Hours } from "../../../_lib/date.js";
import { getConfig } from "../../../_lib/env.js";
import { badRequest, json, notFound, serverError } from "../../../_lib/http.js";
import { sendReservationEmail, sendReservationNtfy, syncReservationToGoogleCalendar } from "../../../_lib/booking-ops.js";
import { buildAutomaticRefundPlan } from "../../../_lib/refunds.js";
import { generateOpaqueToken, sha256Hex } from "../../../_lib/security.js";
import { createHostedCheckout, isSumUpConfigured, refundTransaction } from "../../../_lib/sumup.js";
import { normalizeBookingInput, validateBookingInput } from "../../../_lib/validation.js";

function toManageResponse(reservation, env) {
  const canSelfManage = ["confirmed", "modified", "refund_due", "pending_refund"].includes(
    reservation.status,
  );
  const paymentPending =
    reservation.status === "pending_payment" ||
    (reservation.status === "cancelled" && reservation.payment_status !== "paid") ||
    reservation.status === "payment_setup_failed";
  const canResumePayment = paymentPending;
  const within48h =
    reservation.status === "pending_payment"
      ? false
      : isArrivalWithin48Hours(
          reservation.check_in_date,
          reservation.check_in_start_time,
          getConfig(env).timeZone,
        );

  const hasFlexibleCancellation =
    reservation.refundable_policy_type === "flexible_48h" ||
    reservation.refundable_policy_type === "flexible_24h";

  const notices = [];
  if (paymentPending) {
    notices.push(
      "This reservation is still waiting for payment. Use the payment button below to confirm it. Date changes stay disabled until payment is completed.",
    );
  }
  if (reservation.status === "pending_refund") {
    notices.push("A refund is being processed or still needs follow-up. We will email you once it is completed.");
  }
  if (reservation.payment_status === "refunded") {
    notices.push("A refund has already been recorded for this reservation.");
  }

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
      infants: reservation.infants || 0,
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
        (reservation.status === "pending_payment" || (hasFlexibleCancellation && !within48h)),
      paymentPending,
      canResumePayment,
    },
    notices,
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
    infants: rawBody.infants ?? reservation.infants ?? 0,
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

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

async function recordManualRefundDue(env, reservation, amount, reason, meta = {}) {
  await insertPaymentRecord(env, {
    reservationId: reservation.id,
    provider: "sumup",
    providerCheckoutId: null,
    providerPaymentReference: null,
    type: "refund",
    status: "manual_refund_due",
    amount: roundMoney(amount),
    currency: reservation.currency,
    rawPayload: {
      reason,
      refundMode: "manual",
      ...meta,
    },
  });

  return {
    mode: "manual",
    amount: roundMoney(amount),
  };
}

async function attemptAutomaticRefund(env, reservation, amount, reason, meta = {}) {
  const targetAmount = roundMoney(amount);
  if (!(targetAmount > 0)) {
    return {
      mode: "none",
      amount: 0,
      remainingAmount: 0,
      fullyRefunded: true,
    };
  }

  if (!isSumUpConfigured(env)) {
    const manual = await recordManualRefundDue(env, reservation, targetAmount, reason, meta);
    return {
      ...manual,
      remainingAmount: targetAmount,
      fullyRefunded: false,
    };
  }

  const payments = await getPaymentsForReservation(env, reservation.id);
  const refundPlan = buildAutomaticRefundPlan(payments, targetAmount);

  if (!refundPlan.canFullyRefund) {
    const manual = await recordManualRefundDue(
      env,
      reservation,
      targetAmount,
      reason,
      {
        ...meta,
        refundPlan,
      },
    );

    return {
      ...manual,
      remainingAmount: targetAmount,
      fullyRefunded: false,
    };
  }

  let refundedAmount = 0;

  for (const item of refundPlan.items) {
    try {
      const refundResponse = await refundTransaction(env, item.providerPaymentReference, item.amount);
      refundedAmount = roundMoney(refundedAmount + item.amount);

      await insertPaymentRecord(env, {
        reservationId: reservation.id,
        provider: "sumup",
        providerCheckoutId: item.checkoutId,
        providerPaymentReference: item.providerPaymentReference,
        type: "refund",
        status: "refunded",
        amount: item.amount,
        currency: item.currency || reservation.currency,
        rawPayload: {
          reason,
          refundMode: "automatic",
          refundedPaymentReference: item.providerPaymentReference,
          sourcePaymentId: item.sourcePaymentId,
          sumUpResponse: refundResponse,
          ...meta,
        },
      });
    } catch (error) {
      const remainingAmount = roundMoney(targetAmount - refundedAmount);
      if (remainingAmount > 0) {
        await recordManualRefundDue(env, reservation, remainingAmount, reason, {
          ...meta,
          automaticRefundFailure: error.message,
          partialAutomaticRefundAmount: refundedAmount,
          refundPlan,
        });
      }

      return {
        mode: refundedAmount > 0 ? "partial_automatic_then_manual" : "manual",
        amount: refundedAmount,
        remainingAmount: remainingAmount > 0 ? remainingAmount : 0,
        fullyRefunded: false,
      };
    }
  }

  return {
    mode: "automatic",
    amount: refundedAmount,
    remainingAmount: 0,
    fullyRefunded: true,
  };
}

export async function onRequestGet(context) {
  try {
    const reservation = await resolveReservation(context.env, context.params.token);

    if (!reservation) {
      return notFound("Unknown or expired booking link");
    }

    return json(toManageResponse(reservation, context.env));
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
        const within48h = isArrivalWithin48Hours(
          reservation.check_in_date,
          reservation.check_in_start_time,
          getConfig(context.env).timeZone,
        );

        const hasFlexibleCancellation =
          reservation.refundable_policy_type === "flexible_48h" ||
          reservation.refundable_policy_type === "flexible_24h";

        if (!hasFlexibleCancellation || within48h) {
          return badRequest("This reservation is no longer eligible for self-service cancellation");
        }
      }

      if (reservation.status !== "pending_payment") {
        const payments = await getPaymentsForReservation(context.env, reservation.id);
        const hasPaidCharges = payments.some(
          (payment) =>
            ["initial", "adjustment"].includes(payment.type) && payment.status === "paid",
        );

        if (hasPaidCharges) {
        await attemptAutomaticRefund(
          context.env,
          reservation,
          Number(reservation.total_amount || 0),
          "customer_self_service_cancellation",
        );
        }
      }

      await cancelReservation(context.env, reservation.id);
      try {
        await sendReservationEmail(context.env, reservation.id, "booking_cancellation");
      } catch {
        // Email failures should not block cancellation.
      }
      try {
        await sendReservationNtfy(context.env, reservation.id, "cancellation");
      } catch {
        // ntfy failures should not block cancellation.
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

    if (action === "resume_payment") {
      const canResumePayment =
        reservation.status === "pending_payment" ||
        reservation.status === "payment_setup_failed" ||
        (reservation.status === "cancelled" && reservation.payment_status !== "paid");

      if (!canResumePayment) {
        return badRequest("This reservation no longer needs an initial payment");
      }

      const unit = await getUnitByCode(context.env, reservation.unit_code);

      if (!unit) {
        return badRequest("Unknown unit");
      }

      if (!isSumUpConfigured(context.env)) {
        return json(
          {
            ok: false,
            action: "resume_payment",
            payment: {
              provider: "sumup",
              status: "configuration_required",
            },
          },
          { status: 200 },
        );
      }

      await updateReservationAndCalendarStatus(
        context.env,
        reservation.id,
        "pending_payment",
        "pending_payment",
      );

      const checkoutReference = `${reservation.public_reference}-RETRY-${generateOpaqueToken(6).slice(0, 6).toUpperCase()}`;
      const checkout = await createHostedCheckout(context.env, {
        amount: Number(reservation.total_amount),
        checkoutReference,
        currency: reservation.currency,
        description: `${unit.displayName} ${reservation.public_reference}`,
        redirectUrl: `${getConfig(context.env).publicBaseUrl}/booking/confirmation/?reference=${encodeURIComponent(reservation.public_reference)}&manageToken=${encodeURIComponent(context.params.token)}`,
        returnUrl: `${getConfig(context.env).publicBaseUrl}/api/booking/sumup/webhook`,
      });

      await insertPaymentRecord(context.env, {
        reservationId: reservation.id,
        provider: "sumup",
        providerCheckoutId: checkout.id,
        providerPaymentReference: checkout.transaction_id || null,
        type: "initial",
        status: (checkout.status || "PENDING").toLowerCase(),
        amount: Number(reservation.total_amount),
        currency: reservation.currency,
        rawPayload: checkout,
      });

      return json({
        ok: true,
        action: "resume_payment",
        payment: {
          provider: "sumup",
          status: (checkout.status || "PENDING").toLowerCase(),
          checkoutId: checkout.id,
          hostedCheckoutUrl: checkout.hosted_checkout_url || null,
        },
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
    let refund = null;

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
      infants: payload.infants,
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
      guestSurchargeAmount: quote.guestSurchargeAmount,
      longStayDiscountAmount: quote.longStayDiscountAmount,
      nonRefundableDiscountAmount: quote.nonRefundableDiscountAmount,
      weeklyStayDiscountAmount: quote.weeklyStayDiscountAmount,
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
      refund = await attemptAutomaticRefund(
        context.env,
        reservation,
        Math.abs(deltaAmount),
        "customer_self_service_modification",
        {
          previousTotal: currentTotal,
          nextTotal,
        },
      );

      if (refund.fullyRefunded) {
        reservationStatus = "modified";
      } else {
        reservationStatus = refund.mode === "automatic" ? "modified" : "pending_refund";
      }

      await updateReservationAndCalendarStatus(
        context.env,
        reservation.id,
        reservationStatus,
        "confirmed",
      );
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
      await sendReservationNtfy(context.env, reservation.id, "modification", { deltaAmount });
    } catch {
      // ntfy failures should not block customer updates.
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
      refund,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Request body must be valid JSON");
    }

    return serverError("Failed to manage reservation", error.message);
  }
}
