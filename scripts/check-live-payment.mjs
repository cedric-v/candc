#!/usr/bin/env node
/**
 * Live smoke check for the booking payment funnel.
 *
 * Creates a real reservation on the live site through the public API and
 * verifies that a SumUp hosted-checkout link is returned. If the SumUp
 * secrets are not bound to the current deployment, the API answers with
 * `payment.status = "configuration_required"` (no payment link) — this
 * script then fails with exit code 1.
 *
 * The smoke reservation is cancelled immediately afterwards via its manage
 * link so it never blocks the calendar.
 *
 * Usage:
 *   npm run check:payment
 *   BASE_URL=https://candc.ch npm run check:payment
 *   UNIT_CODE=eco-studio npm run check:payment
 *
 * Options (env vars):
 *   BASE_URL    base URL of the site to check (default https://candc.ch)
 *   UNIT_CODE   rentable unit to book (default parking-space)
 *   OFFSET_DAYS how many days from today the smoke stay starts (default 45)
 *
 * Exit codes: 0 = payment configured, 1 = payment not configured / error.
 */
const BASE_URL = (process.env.BASE_URL || "https://candc.ch").replace(/\/+$/, "");
const API = `${BASE_URL}/api/booking/reservations`;
const UNIT_CODE = process.env.UNIT_CODE || "parking-space";
const LOCALE = process.env.LOCALE || "fr";

const offsetDays = Number(process.env.OFFSET_DAYS || 45);
const checkIn = new Date(Date.now() + offsetDays * 86400000);
const checkOut = new Date(checkIn.getTime() + 2 * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);

const payload = {
  unitCode: UNIT_CODE,
  locale: LOCALE,
  checkInDate: iso(checkIn),
  checkOutDate: iso(checkOut),
  adults: 2,
  children: 0,
  infants: 0,
  vehicleType: UNIT_CODE === "parking-space" ? "van" : "",
  wcShowerRequested: false,
  nonRefundableSelected: false,
  guestFirstName: "Smoke",
  guestLastName: "Test",
  guestEmail: "smoke-test@example.com",
  guestMobilePhone: "+41791234567",
  guestDateOfBirth: "1990-01-01",
  guestAddressStreet: "1 Test St",
  guestAddressZip: "1700",
  guestAddressCity: "Fribourg",
  guestAddressCountry: "CH",
  guestNationality: "CH",
  guestIdDocumentNumber: "X0000000",
  additionalGuests: [],
  remarks: "[smoke-test] automatic payment-config check - safe to delete",
  acceptedTerms: true,
};

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function cancelSmokeReservation(reservation) {
  const manageUrl = reservation && reservation.manageUrl;
  if (!manageUrl) {
    return;
  }
  // The public manageUrl serves the HTML page (GET only). The cancellation
  // action must be posted to the API route.
  const token = manageUrl.split("/").pop();
  const apiUrl = `${BASE_URL}/api/booking/manage/${encodeURIComponent(token)}`;
  try {
    const cancel = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const cancelBody = await cancel.json();
    if (cancel.ok && cancelBody.status === "cancelled") {
      console.log(`✓ Smoke reservation ${reservation.publicReference} cancelled.`);
    } else {
      console.warn(
        `! Could not cancel smoke reservation ${reservation.publicReference}: ${JSON.stringify(cancelBody)}`,
      );
    }
  } catch (error) {
    console.warn(`! Cancel request failed for ${reservation.publicReference}: ${error.message}`);
  }
}

const startedAt = Date.now();
let response;
try {
  response = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
} catch (error) {
  fail(`POST ${API} unreachable: ${error.message}`);
}
const durationMs = Date.now() - startedAt;

let body;
try {
  body = await response.json();
} catch {
  fail(`POST ${API} returned non-JSON (HTTP ${response.status})`);
}

if (!response.ok) {
  fail(`POST ${API} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
}

const payment = body.payment || {};
const reservation = body.reservation || {};

if (payment.status === "configuration_required" || !payment.hostedCheckoutUrl) {
  await cancelSmokeReservation(reservation);
  fail(
    `Payment is NOT configured on ${BASE_URL}. The SumUp secrets are not bound to the ` +
      `current deployment (reservation ${reservation.id || "?"}, HTTP ${response.status}, ${durationMs}ms). ` +
      `Re-add the secrets and redeploy — see DEPLOYMENT.md (section SumUp / Secrets).`,
  );
}

console.log(
  `✓ Payment configured on ${BASE_URL}: status=${payment.status}, checkout=${payment.checkoutId} (${durationMs}ms)`,
);

// Clean up: cancel the smoke reservation via its manage link.
await cancelSmokeReservation(reservation);
