function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function buildAutomaticRefundPlan(payments, requestedAmount) {
  const targetAmount = roundMoney(requestedAmount);

  if (!(targetAmount > 0)) {
    return {
      requestedAmount: targetAmount,
      plannedAmount: 0,
      uncoveredAmount: 0,
      items: [],
      canFullyRefund: true,
    };
  }

  const refundedByPaymentReference = new Map();
  for (const payment of payments || []) {
    if (payment.type !== "refund") {
      continue;
    }

    const payload = safeParseJson(payment.raw_payload);
    const refundedPaymentReference = payload.refundedPaymentReference || null;
    const refundMode = payload.refundMode || null;

    if (!refundedPaymentReference || refundMode !== "automatic") {
      continue;
    }

    refundedByPaymentReference.set(
      refundedPaymentReference,
      roundMoney(
        (refundedByPaymentReference.get(refundedPaymentReference) || 0) + toNumber(payment.amount),
      ),
    );
  }

  const chargePayments = (payments || [])
    .filter(
      (payment) =>
        ["initial", "adjustment"].includes(payment.type) &&
        payment.status === "paid" &&
        payment.provider_payment_reference &&
        toNumber(payment.amount) > 0,
    )
    .sort((left, right) => {
      const leftTime = new Date(left.created_at).getTime();
      const rightTime = new Date(right.created_at).getTime();
      return rightTime - leftTime;
    });

  const items = [];
  let remaining = targetAmount;

  for (const chargePayment of chargePayments) {
    if (!(remaining > 0)) {
      break;
    }

    const alreadyRefunded = refundedByPaymentReference.get(chargePayment.provider_payment_reference) || 0;
    const availableAmount = roundMoney(toNumber(chargePayment.amount) - alreadyRefunded);

    if (!(availableAmount > 0)) {
      continue;
    }

    const refundAmount = roundMoney(Math.min(remaining, availableAmount));
    items.push({
      sourcePaymentId: chargePayment.id,
      providerPaymentReference: chargePayment.provider_payment_reference,
      checkoutId: chargePayment.provider_checkout_id || null,
      currency: chargePayment.currency,
      amount: refundAmount,
    });
    remaining = roundMoney(remaining - refundAmount);
  }

  return {
    requestedAmount: targetAmount,
    plannedAmount: roundMoney(targetAmount - remaining),
    uncoveredAmount: remaining,
    items,
    canFullyRefund: !(remaining > 0),
  };
}
