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
 * A 409 (`conflict`) is NOT a payment problem: the requested window may be
 * booked (direct stay, OTA import, admin manual block). The script therefore
 * walks forward in time and checks the next free window instead of failing —
 * otherwise a busy calendar turns the post-deploy check red for weeks and
 * hides a genuine "SumUp secrets missing" failure.
 *
 * Usage:
 *   npm run check:payment
 *   BASE_URL=https://candc.ch npm run check:payment
 *   UNIT_CODE=eco-studio npm run check:payment
 *
 * Options (env vars):
 *   BASE_URL          base URL of the site to check (default https://candc.ch)
 *   UNIT_CODE         rentable unit to book (default parking-space)
 *   OFFSET_DAYS       how many days from today the first smoke stay starts (default 45)
 *   OFFSET_STEP_DAYS  how far to jump when a window is taken (default 15)
 *   MAX_DATE_ATTEMPTS how many windows to try before giving up (default 8)
 *
 * Exit codes: 0 = payment configured, 1 = payment not configured / error.
 */
const BASE_URL = (process.env.BASE_URL || "https://candc.ch").replace(/\/+$/, "");
const API = `${BASE_URL}/api/booking/reservations`;
const UNIT_CODE = process.env.UNIT_CODE || "parking-space";
const LOCALE = process.env.LOCALE || "fr";

const baseOffsetDays = Number(process.env.OFFSET_DAYS || 45);
const offsetStepDays = Number(process.env.OFFSET_STEP_DAYS || 15);
const maxDateAttempts = Math.max(1, Number(process.env.MAX_DATE_ATTEMPTS || 8));

// L'éco-studio impose un séjour minimum de 4 nuits : une fenêtre de 2 nuits
// serait rejetée en 400 par la validation publique.
const stayNights = UNIT_CODE === "eco-studio" ? 4 : 2;

const iso = (date) => date.toISOString().slice(0, 10);

function buildPayload(offsetDays) {
  const checkIn = new Date(Date.now() + offsetDays * 86400000);
  const checkOut = new Date(checkIn.getTime() + stayNights * 86400000);

  return {
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
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function describeConflicts(body) {
  const details = Array.isArray(body?.details) ? body.details : [];
  const ranges = details.map(
    (detail) =>
      `${detail.start_date ?? "?"}→${detail.end_date ?? "?"}${detail.source ? ` ${detail.source}` : ""}`,
  );

  return ranges.length > 0 ? ranges.join(", ") : "no detail returned";
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

async function createSmokeReservation(payload) {
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

  return { response, body, durationMs };
}

let accepted = null;

for (let attempt = 0; attempt < maxDateAttempts; attempt += 1) {
  const offsetDays = baseOffsetDays + attempt * offsetStepDays;
  const payload = buildPayload(offsetDays);
  const window = `${payload.checkInDate} → ${payload.checkOutDate}`;
  const { response, body, durationMs } = await createSmokeReservation(payload);

  if (response.ok) {
    console.log(`✓ Smoke stay ${window} accepted (${durationMs}ms).`);
    accepted = { body, payload };
    break;
  }

  // Dates prises : on essaie la fenêtre suivante (bloc direct, OTA ou manuel).
  // Le conflit est intentionnel côté API et aucune réservation n'est laissée
  // en base (le perdant d'une course est annulé par l'API elle-même).
  if (response.status === 409 && body?.error === "conflict") {
    console.warn(`! ${window} unavailable (${describeConflicts(body)}) — trying a later window…`);
    continue;
  }

  fail(`POST ${API} failed: HTTP ${response.status} ${JSON.stringify(body)}`);
}

if (!accepted) {
  fail(
    `No free window for ${UNIT_CODE} after ${maxDateAttempts} attempt(s), starting in ` +
      `${baseOffsetDays} days (step ${offsetStepDays} d). The calendar looks full — this is a ` +
      `booking conflict, NOT a SumUp configuration problem. Raise OFFSET_DAYS / ` +
      `MAX_DATE_ATTEMPTS, or free up dates in the admin dashboard.`,
  );
}

const payment = accepted.body.payment || {};
const reservation = accepted.body.reservation || {};

if (payment.status === "configuration_required" || !payment.hostedCheckoutUrl) {
  await cancelSmokeReservation(reservation);
  fail(
    `Payment is NOT configured on ${BASE_URL}. The SumUp secrets are not bound to the ` +
      `current deployment (reservation ${reservation.id || "?"}, stay ` +
      `${accepted.payload.checkInDate} → ${accepted.payload.checkOutDate}). ` +
      `Re-add the secrets and redeploy — see DEPLOYMENT.md (section SumUp / Secrets).`,
  );
}

console.log(
  `✓ Payment configured on ${BASE_URL}: status=${payment.status}, checkout=${payment.checkoutId}`,
);

// Clean up: cancel the smoke reservation via its manage link.
await cancelSmokeReservation(reservation);
