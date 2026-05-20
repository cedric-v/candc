import { getConfig } from "./env.js";

function buildHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return { message: response.statusText };
    }
  }

  return { message: await response.text() };
}

export function isSumUpConfigured(env) {
  const config = getConfig(env);
  return Boolean(config.sumUpApiKey && config.sumUpMerchantCode);
}

export async function createHostedCheckout(env, payload) {
  const config = getConfig(env);

  if (!config.sumUpApiKey || !config.sumUpMerchantCode) {
    throw new Error("sumup_not_configured");
  }

  const response = await fetch(`${config.sumUpApiBaseUrl}/v0.1/checkouts`, {
    method: "POST",
    headers: buildHeaders(config.sumUpApiKey),
    body: JSON.stringify({
      amount: payload.amount,
      checkout_reference: payload.checkoutReference,
      currency: payload.currency,
      description: payload.description,
      merchant_code: config.sumUpMerchantCode,
      redirect_url: payload.redirectUrl,
      return_url: payload.returnUrl,
      hosted_checkout: {
        enabled: true,
      },
    }),
  });

  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new Error(`sumup_checkout_create_failed:${response.status}:${JSON.stringify(details)}`);
  }

  return response.json();
}

export async function getCheckout(env, checkoutId) {
  const config = getConfig(env);

  if (!config.sumUpApiKey) {
    throw new Error("sumup_not_configured");
  }

  const response = await fetch(`${config.sumUpApiBaseUrl}/v0.1/checkouts/${checkoutId}`, {
    method: "GET",
    headers: buildHeaders(config.sumUpApiKey),
  });

  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new Error(`sumup_checkout_get_failed:${response.status}:${JSON.stringify(details)}`);
  }

  return response.json();
}

export async function refundTransaction(env, transactionId, amount = null) {
  const config = getConfig(env);

  if (!config.sumUpApiKey || !config.sumUpMerchantCode) {
    throw new Error("sumup_not_configured");
  }

  const body = amount === null || amount === undefined ? {} : { amount };
  const response = await fetch(
    `${config.sumUpApiBaseUrl}/v1.0/merchants/${encodeURIComponent(config.sumUpMerchantCode)}/payments/${encodeURIComponent(transactionId)}/refunds`,
    {
      method: "POST",
      headers: buildHeaders(config.sumUpApiKey),
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new Error(`sumup_refund_failed:${response.status}:${JSON.stringify(details)}`);
  }

  const responseText = await response.text();
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText };
  }
}

export function mapCheckoutStatus(status) {
  switch (status) {
    case "PAID":
      return {
        paymentStatus: "paid",
        reservationStatus: "confirmed",
        calendarBlockStatus: "confirmed",
      };
    case "PENDING":
      return {
        paymentStatus: "pending",
        reservationStatus: "pending_payment",
        calendarBlockStatus: "pending_payment",
      };
    case "FAILED":
      return {
        paymentStatus: "failed",
        reservationStatus: "pending_payment",
        calendarBlockStatus: "pending_payment",
      };
    case "CANCELLED":
    case "EXPIRED":
      return {
        paymentStatus: status.toLowerCase(),
        reservationStatus: "pending_payment",
        calendarBlockStatus: "pending_payment",
      };
    default:
      return {
        paymentStatus: "unknown",
        reservationStatus: "pending_payment",
        calendarBlockStatus: "pending_payment",
      };
  }
}
