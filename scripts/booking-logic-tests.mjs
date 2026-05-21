import { DEFAULT_UNITS } from "../functions/_lib/catalog.js";
import { calculateQuoteFromResolvedUnit } from "../functions/_lib/pricing.js";
import { buildAutomaticRefundPlan } from "../functions/_lib/refunds.js";
import { validateBookingInput } from "../functions/_lib/validation.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${expected}, got ${actual})`);
  }
}

function createNightlyRates(startDate, nights, amount) {
  const list = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < nights; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    list.push({
      date: date.toISOString().slice(0, 10),
      rate: amount,
      label: "default",
      ratePeriodId: null,
    });
  }
  return list;
}

function runValidationTests() {
  const studio = DEFAULT_UNITS.find((unit) => unit.code === "eco-studio");
  const errors = validateBookingInput(
    {
      unitCode: "eco-studio",
      checkInDate: "2026-06-25",
      checkOutDate: "2026-06-28",
      adults: 2,
      children: 1,
      infants: 0,
      vehicleType: "",
      guestFirstName: "",
      guestLastName: "",
      guestEmail: "",
    },
    { unit: { settings: studio.settings } },
  );

  assert(
    errors.some((item) => item.message.includes("Minimum stay is 4 night(s)")),
    "Studio validation should enforce a 4-night minimum stay",
  );

  const occupancyErrors = validateBookingInput(
    {
      unitCode: "eco-studio",
      checkInDate: "2026-06-25",
      checkOutDate: "2026-06-30",
      adults: 3,
      children: 2,
      infants: 0,
      vehicleType: "",
      guestFirstName: "",
      guestLastName: "",
      guestEmail: "",
    },
    { unit: { settings: studio.settings } },
  );

  assert(
    occupancyErrors.some((item) => item.message.includes("Maximum occupancy is 4")),
    "Studio validation should enforce max occupancy",
  );
}

function runPricingTests() {
  const parking = DEFAULT_UNITS.find((unit) => unit.code === "parking-space");
  const studio = DEFAULT_UNITS.find((unit) => unit.code === "eco-studio");
  const config = {
    touristTaxAdultChf: 3,
    wcShowerCleaningFeeChf: 10,
    paymentFeeRate: 0.025,
    paymentFeeFixedChf: 0,
    timeZone: "Europe/Zurich",
    checkInTime: "15:00:00",
  };

  const parkingQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 2, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-06-03",
      adults: 2,
      children: 1,
      infants: 0,
      wcShowerRequested: true,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parkingQuote.baseAmount, 40, "Parking base amount should total nightly rates");
  assertEqual(parkingQuote.touristTaxAmount, 12, "Parking tourist tax should charge adults only");
  assertEqual(parkingQuote.optionsAmount, 10, "Parking WC-shower should add a flat CHF 10");
  assertEqual(parkingQuote.totalAmount, 63.55, "Parking total should include 2.5% payment fee");

  const parkingLongStayQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 7, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-06-08",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parkingLongStayQuote.appliedLongStayDiscountRate, 0.05, "Parking should apply 5% long-stay discount from 7 nights");

  const studioQuote = calculateQuoteFromResolvedUnit(
    {
      ...studio,
      unitType: studio.unitType,
      displayName: studio.displayName,
      checkInStartTime: studio.checkInStartTime,
      currency: studio.currency,
    },
    createNightlyRates("2027-07-01", 7, 99),
    {
      unitCode: "eco-studio",
      checkInDate: "2027-07-01",
      checkOutDate: "2027-07-08",
      adults: 2,
      children: 1,
      infants: 1,
      wcShowerRequested: false,
      nonRefundableSelected: true,
    },
    config,
  );

  assertEqual(studioQuote.baseAmount, 693, "Studio base amount should total nightly rates");
  assertEqual(studioQuote.guestSurchargeAmount, 84, "Studio should charge extra adults and children");
  assertEqual(studioQuote.touristTaxAmount, 42, "Studio tourist tax should match adults only");
  assertEqual(studioQuote.longStayDiscountAmount, 38.85, "Studio 7+ night discount should now be folded into the long-stay discount");
  assertEqual(studioQuote.weeklyStayDiscountAmount, 0, "Legacy weekly discount should no longer be applied separately");
  assertEqual(studioQuote.nonRefundableDiscountAmount, 73.82, "Studio non-refundable discount should apply after the merged long-stay discount");

  const studioLongStayQuote = calculateQuoteFromResolvedUnit(
    {
      ...studio,
      unitType: studio.unitType,
      displayName: studio.displayName,
      checkInStartTime: studio.checkInStartTime,
      currency: studio.currency,
    },
    createNightlyRates("2027-08-01", 16, 99),
    {
      unitCode: "eco-studio",
      checkInDate: "2027-08-01",
      checkOutDate: "2027-08-17",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(studioLongStayQuote.appliedLongStayDiscountRate, 0.2, "Studio should apply 20% long-stay discount from 16 nights");

  const studioThirtyNightQuote = calculateQuoteFromResolvedUnit(
    {
      ...studio,
      unitType: studio.unitType,
      displayName: studio.displayName,
      checkInStartTime: studio.checkInStartTime,
      currency: studio.currency,
    },
    createNightlyRates("2027-09-01", 30, 99),
    {
      unitCode: "eco-studio",
      checkInDate: "2027-09-01",
      checkOutDate: "2027-10-01",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(studioThirtyNightQuote.appliedLongStayDiscountRate, 0.25, "Studio should apply 25% long-stay discount from 30 nights");

  const studioSixtyNightQuote = calculateQuoteFromResolvedUnit(
    {
      ...studio,
      unitType: studio.unitType,
      displayName: studio.displayName,
      checkInStartTime: studio.checkInStartTime,
      currency: studio.currency,
    },
    createNightlyRates("2027-11-01", 60, 99),
    {
      unitCode: "eco-studio",
      checkInDate: "2027-11-01",
      checkOutDate: "2027-12-31",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(studioSixtyNightQuote.appliedLongStayDiscountRate, 0.3, "Studio should apply 30% long-stay discount from 60 nights");
}

function runRefundPlanTests() {
  const payments = [
    {
      id: "initial",
      provider_payment_reference: "txn-initial",
      provider_checkout_id: "co-initial",
      type: "initial",
      status: "paid",
      amount: 120,
      currency: "CHF",
      created_at: "2026-05-01T10:00:00.000Z",
    },
    {
      id: "adjustment",
      provider_payment_reference: "txn-adjustment",
      provider_checkout_id: "co-adjustment",
      type: "adjustment",
      status: "paid",
      amount: 40,
      currency: "CHF",
      created_at: "2026-05-03T10:00:00.000Z",
    },
    {
      id: "refund-1",
      provider_payment_reference: "txn-adjustment",
      type: "refund",
      status: "refunded",
      amount: 10,
      raw_payload: JSON.stringify({
        refundMode: "automatic",
        refundedPaymentReference: "txn-adjustment",
      }),
      created_at: "2026-05-04T10:00:00.000Z",
    },
  ];

  const plan = buildAutomaticRefundPlan(payments, 45);
  assert(plan.canFullyRefund, "Refund plan should fully cover the requested refund");
  assertEqual(plan.items.length, 2, "Refund plan should split across paid transactions");
  assertEqual(plan.items[0].providerPaymentReference, "txn-adjustment", "Latest adjustment should be refunded first");
  assertEqual(plan.items[0].amount, 30, "Latest adjustment should refund only the remaining refundable amount");
  assertEqual(plan.items[1].providerPaymentReference, "txn-initial", "Initial payment should cover the remainder");
  assertEqual(plan.items[1].amount, 15, "Initial payment should cover the remaining CHF 15");
}

function main() {
  runValidationTests();
  runPricingTests();
  runRefundPlanTests();
  console.log("Booking logic tests passed.");
}

main();
