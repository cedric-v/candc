import { DEFAULT_UNITS } from "../functions/_lib/catalog.js";
import { calculateQuoteFromResolvedUnit } from "../functions/_lib/pricing.js";
import { buildAutomaticRefundPlan } from "../functions/_lib/refunds.js";
import { buildReservationFeed } from "../functions/_lib/ics.js";
import { isIcsCalendarDocument, parseIcsEvents } from "../functions/_lib/ics-import.js";
import { findLiveExternalConflicts, rangesOverlap } from "../functions/_lib/ota-availability.js";
import { validateBookingInput } from "../functions/_lib/validation.js";
import { sendAdminAlert } from "../functions/_lib/alerts.js";
import { normalizeTopicUrl } from "../functions/_lib/ntfy.js";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

function runGuestContactValidationTests() {
  const studio = DEFAULT_UNITS.find((unit) => unit.code === "eco-studio");
  const base = {
    unitCode: "eco-studio",
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-08",
    adults: 2,
    children: 0,
    infants: 0,
    vehicleType: "",
    guestFirstName: "Test",
    guestLastName: "User",
    guestEmail: "valid@example.com",
    guestMobilePhone: "+41 79 123 45 67",
    guestDateOfBirth: "1990-01-01",
    guestAddressStreet: "Rue de la Gare 1",
    guestAddressZip: "1000",
    guestAddressCity: "Lausanne",
    guestAddressCountry: "CH",
    guestNationality: "CH",
  };
  const options = { unit: { settings: studio.settings }, requireGuestInfo: true };

  const valid = validateBookingInput({ ...base }, options);
  assert(
    !valid.some((item) => item.field === "guestEmail" || item.field === "guestMobilePhone"),
    "Valid email and phone should pass validation",
  );

  const cases = [
    { name: "email with space", patch: { guestEmail: "a b@c.d" }, field: "guestEmail" },
    { name: "email with double @", patch: { guestEmail: "a@@b.c" }, field: "guestEmail" },
    { name: "email with double dot", patch: { guestEmail: "foo@bar..com" }, field: "guestEmail" },
    { name: "email without TLD", patch: { guestEmail: "user@example" }, field: "guestEmail" },
    { name: "non-numeric phone", patch: { guestMobilePhone: "abc" }, field: "guestMobilePhone" },
    { name: "too-short phone", patch: { guestMobilePhone: "123" }, field: "guestMobilePhone" },
    { name: "letters in phone", patch: { guestMobilePhone: "079 123 45 6a" }, field: "guestMobilePhone" },
  ];

  for (const { name, patch, field } of cases) {
    const errors = validateBookingInput({ ...base, ...patch }, options);
    assert(
      errors.some((item) => item.field === field),
      `${name} should be rejected on field ${field}`,
    );
  }
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
  assertEqual(parkingQuote.optionsAmount, 10, "Parking WC-shower should cost CHF 10 for a 2-night stay (first 7 nights)");
  assertEqual(parkingQuote.totalAmount, 63.55, "Parking total should include 2.5% payment fee");

  const parkingWc8NightQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 8, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-06-09",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: true,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parkingWc8NightQuote.optionsAmount, 20, "Parking WC-shower should cost CHF 20 for an 8-night stay (second commenced week)");

  const parkingWc15NightQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 15, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-06-16",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: true,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parkingWc15NightQuote.optionsAmount, 30, "Parking WC-shower should cost CHF 30 for a 15-night stay (third commenced week)");

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

  assertEqual(parkingLongStayQuote.appliedLongStayDiscountRate, 0.1, "Parking should apply 10% long-stay discount from 7 nights");

  const parking16NightQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 16, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-06-17",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parking16NightQuote.appliedLongStayDiscountRate, 0.2, "Parking should apply 20% long-stay discount from 16 nights");

  const parking30NightQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 30, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-07-01",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parking30NightQuote.appliedLongStayDiscountRate, 0.25, "Parking should apply 25% long-stay discount from 30 nights");

  const parking60NightQuote = calculateQuoteFromResolvedUnit(
    {
      ...parking,
      unitType: parking.unitType,
      displayName: parking.displayName,
      checkInStartTime: parking.checkInStartTime,
      currency: parking.currency,
    },
    createNightlyRates("2027-06-01", 60, 20),
    {
      unitCode: "parking-space",
      checkInDate: "2027-06-01",
      checkOutDate: "2027-07-31",
      adults: 1,
      children: 0,
      infants: 0,
      wcShowerRequested: false,
      nonRefundableSelected: false,
    },
    config,
  );

  assertEqual(parking60NightQuote.appliedLongStayDiscountRate, 0.3, "Parking should apply 30% long-stay discount from 60 nights");

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
  assertEqual(studioQuote.longStayDiscountAmount, 77.7, "Studio 7+ night discount should now be folded into the long-stay discount");
  assertEqual(studioQuote.weeklyStayDiscountAmount, 0, "Legacy weekly discount should no longer be applied separately");
  assertEqual(studioQuote.nonRefundableDiscountAmount, 69.93, "Studio non-refundable discount should apply after the merged long-stay discount");

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

function makeMockDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      const stmt = {
        _sql: sql,
        _bound: [],
        bind(...args) {
          this._bound = args;
          return this;
        },
        async all() {
          if (this._sql.includes("FROM email_logs")) {
            const [emailType, recipient, cutoff] = this._bound;
            return {
              results: rows.filter(
                (row) =>
                  row.status === "alerted" &&
                  row.email_type === emailType &&
                  row.recipient === recipient &&
                  row.created_at >= cutoff,
              ),
            };
          }
          return { results: [] };
        },
        async run() {
          rows.push({
            email_type: this._bound[2],
            recipient: this._bound[3],
            status: this._bound[4],
            created_at: this._bound[6],
          });
          return { meta: {} };
        },
      };
      return stmt;
    },
  };
}

async function runAlertTests() {
  // 1. Aucun canal configuré : l'alerte signale ok:false sans lever d'erreur.
  const envNoChannels = {
    PUBLIC_BASE_URL: "https://candc.ch",
    ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
  };
  const noChannelResult = await sendAdminAlert(envNoChannels, {
    key: "test_alert_no_channels",
    subject: "test",
    message: "test",
  });
  assert(!noChannelResult.ok, "Alert with no channels should report not delivered");
  assertEqual(noChannelResult.results.email, "skipped", "Email should be skipped when Resend is not configured");
  assertEqual(noChannelResult.results.ntfy, "skipped", "ntfy should be skipped when no topic URL");

  // 3. Normalisation d'URL ntfy : une valeur sans schéma reçoit https://.
  assertEqual(
    normalizeTopicUrl("ntfy.sh/candc-booking-1782"),
    "https://ntfy.sh/candc-booking-1782",
    "ntfy topic URL without scheme should be normalized",
  );
  assertEqual(
    normalizeTopicUrl("https://ntfy.sh/candc-booking-1782"),
    "https://ntfy.sh/candc-booking-1782",
    "ntfy topic URL with scheme should stay unchanged",
  );

  // 2. Canal e-mail simulé + D1 mock : la première alerte part, la seconde
  //    (même clé, fenêtre de 30 min) est dédupliquée.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://api.resend.com/emails")) {
      return { ok: true, json: async () => ({ id: "test-alert-id" }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const env = {
      PUBLIC_BASE_URL: "https://candc.ch",
      ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
      EMAIL_FROM: "C&C <reservations@candc.ch>",
      RESEND_API_KEY: "test-key",
      DB: makeMockDb(),
    };

    const first = await sendAdminAlert(env, { key: "dup_test", subject: "s", message: "m" });
    assert(first.ok, "First alert should be delivered");
    assertEqual(first.results.email, "sent", "Email channel should report sent");

    const second = await sendAdminAlert(env, { key: "dup_test", subject: "s", message: "m" });
    assert(Boolean(second.skipped), "Second alert with the same key should be deduped");

    const third = await sendAdminAlert(env, { key: "other_key", subject: "s", message: "m" });
    assert(third.ok, "Alert with a different key should not be deduped");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runOtaAvailabilityTests() {
  // Détection de chevauchement sur intervalles semi-ouverts : une arrivée le
  // jour du départ d'un autre séjour ne doit PAS être considérée en conflit.
  assert(rangesOverlap("2026-09-25", "2026-09-26", "2026-09-25", "2026-09-26"), "Same-night ranges must overlap");
  assert(rangesOverlap("2026-09-25", "2026-09-27", "2026-09-26", "2026-09-28"), "Partially overlapping ranges must overlap");
  assert(!rangesOverlap("2026-09-24", "2026-09-25", "2026-09-25", "2026-09-26"), "Check-out/check-in on the same day must not overlap");
  assert(!rangesOverlap("2026-09-20", "2026-09-22", "2026-09-25", "2026-09-26"), "Disjoint ranges must not overlap");

  // Feed Booking.com type VALUE=DATE : l'événement 25→26 doit être détecté
  // comme conflit par le contrôle OTA en direct.
  const bookingFeed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//admin.booking.com\\, b.v.//NONSGML v1.0//EN",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260925",
    "DTEND;VALUE=DATE:20260926",
    "UID:cc66db93e025f44bc848dfb7a599feb5@booking.com",
    "SUMMARY:CLOSED - Not available",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const events = parseIcsEvents(bookingFeed);
  assertEqual(events.length, 1, "Booking feed should expose one event");
  assertEqual(events[0].startDate, "2026-09-25", "Booking event start date should be parsed");
  assertEqual(events[0].endDate, "2026-09-26", "Booking event end date should be parsed");
  assert(
    events.some((event) => rangesOverlap(event.startDate, event.endDate, "2026-09-25", "2026-09-26")),
    "A direct stay on the same night must be flagged against the live Booking block",
  );

  // Validation stricte du corps ICS : jamais de « calendrier vide » par erreur.
  assert(isIcsCalendarDocument(bookingFeed), "A real VCALENDAR document must be accepted");
  assert(
    !isIcsCalendarDocument("<html>503 Service Unavailable</html>"),
    "An HTML error page must NOT be accepted as an empty calendar",
  );
  assert(
    !isIcsCalendarDocument("BEGIN:VCALENDAR\r\nVERSION:2.0"),
    "A truncated feed (no END:VCALENDAR) must NOT be accepted",
  );

  // Date-time ICS : la date retenue est la date LIEU (Europe/Zurich), pas la
  // date UTC — sinon un bloc à 22:30Z glisse sur la veille et décale le bloc.
  const dateTimeFeed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART:20260925T223000Z",
    "DTEND:20260926T223000Z",
    "UID:night-close@ota.example",
    "SUMMARY:CLOSED - Not available",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const localEvents = parseIcsEvents(dateTimeFeed, { timeZone: "Europe/Zurich" });
  assertEqual(localEvents[0].startDate, "2026-09-26", "Date-time values must resolve to the property-local date");
  assertEqual(localEvents[0].endDate, "2026-09-27", "Date-time end must resolve to the property-local date");

  const utcEvents = parseIcsEvents(dateTimeFeed);
  assertEqual(utcEvents[0].startDate, "2026-09-25", "Without a timezone, the UTC date is kept");

  const floatingEvents = parseIcsEvents(dateTimeFeed.replaceAll("T223000Z", "T223000"), {
    timeZone: "Europe/Zurich",
  });
  assertEqual(floatingEvents[0].startDate, "2026-09-25", "Floating date-times keep their stated date");

  // Contrôle OTA en direct : source-agnostique (booking, airbnb, vrbo, ...) +
  // fail-open sur toutes les erreurs (réseau, corps invalide, base).
  const sources = [
    { id: "s-booking", unit_id: "unit_x", source_code: "booking", source_kind: "ics", import_url: "https://ical.booking.com/v1/export?t=b", unit_code: "unit-x" },
    { id: "s-airbnb", unit_id: "unit_x", source_code: "airbnb", source_kind: "ics", import_url: "https://www.airbnb.example/cal.ics?t=a", unit_code: "unit-x" },
    { id: "s-vrbo", unit_id: "unit_x", source_code: "vrbo", source_kind: "ics", import_url: "https://www.vrbo.example/cal.ics?t=v", unit_code: "unit-x" },
  ];
  const emptyFeed = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR";
  const vrboFeed = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261010",
    "DTEND;VALUE=DATE:20261012",
    "UID:future-stay@vrbo.example",
    "SUMMARY:Reserved",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.includes("booking.com")) {
        return { ok: true, text: async () => bookingFeed };
      }
      if (target.includes("airbnb")) {
        return { ok: true, text: async () => emptyFeed };
      }
      return { ok: true, text: async () => vrboFeed };
    };

    const env = {
      PUBLIC_BASE_URL: "https://candc.ch",
      TIMEZONE: "Europe/Zurich",
      DB: makeImportSourcesMockDb(sources),
    };
    const live = await findLiveExternalConflicts(env, "unit-x", "2026-09-25", "2026-09-26");
    assertEqual(live.checkedSources, 3, "Every active ICS source must be checked (source-agnostic)");
    assertEqual(live.errors.length, 0, "Healthy sources must not report errors");
    assertEqual(live.conflicts.length, 1, "Only the overlapping source must raise a conflict");
    assertEqual(live.conflicts[0].source, "booking_ics", "Conflicts must carry the <source_code>_<source_kind> tag");
    assertEqual(live.conflicts[0].start_date, "2026-09-25", "Conflict must keep the block start date");

    // Fail-open : erreur réseau.
    globalThis.fetch = async () => {
      throw new Error("network_down");
    };
    const networkFailure = await findLiveExternalConflicts(env, "unit-x", "2026-09-25", "2026-09-26");
    assertEqual(networkFailure.conflicts.length, 0, "Network failures must not report conflicts");
    assertEqual(networkFailure.checkedSources, 0, "Unreadable sources must not count as checked");
    assertEqual(networkFailure.errors.length, 3, "Each failed source must be surfaced");

    // Fail-open : corps non-calendaire.
    globalThis.fetch = async () => ({ ok: true, text: async () => "<html>503 Service Unavailable</html>" });
    const invalidBody = await findLiveExternalConflicts(env, "unit-x", "2026-09-25", "2026-09-26");
    assertEqual(invalidBody.conflicts.length, 0, "A non-ICS body must not be treated as an empty calendar");
    assert(
      invalidBody.errors.every((item) => item.error === "ics_invalid_body"),
      "A non-ICS body must be surfaced as ics_invalid_body",
    );

    // Fail-open : base indisponible. Ne doit JAMAIS lever d'erreur, sinon le
    // webhook SumUp répond 500 après encaissement du paiement.
    const dbFailure = await findLiveExternalConflicts(
      { DB: makeImportSourcesMockDb([], { failWith: "d1_unavailable" }) },
      "unit-x",
      "2026-09-25",
      "2026-09-26",
    );
    assertEqual(dbFailure.conflicts.length, 0, "A DB failure must not throw nor report conflicts");
    assert(
      dbFailure.errors.some((item) => item.error.startsWith("sources_lookup_failed")),
      "A DB failure must be surfaced in errors",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function makeImportSourcesMockDb(sources, { failWith = null } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return this;
        },
        async all() {
          if (failWith) {
            throw new Error(failWith);
          }
          return { results: sql.includes("FROM external_calendar_sources") ? sources : [] };
        },
      };
    },
  };
}

function runIcsFeedTests() {
  const reservations = [
    {
      id: "res-1",
      unit_code: "eco-studio",
      check_in_date: "2026-11-10",
      check_out_date: "2026-11-13",
      status: "confirmed",
    },
  ];
  const manualBlocks = [
    {
      id: "block-1",
      unit_code: "parking-space",
      start_date: "2026-10-12",
      end_date: "2026-10-23",
      note: "Fermeture Booking.com, octobre",
    },
  ];

  const feed = buildReservationFeed(reservations, manualBlocks);

  assert(feed.startsWith("BEGIN:VCALENDAR"), "ICS feed should start with VCALENDAR");
  assert(feed.trimEnd().endsWith("END:VCALENDAR"), "ICS feed should end with END:VCALENDAR");
  assert(feed.includes("UID:res-1@candc.ch"), "Feed should include the reservation UID");
  assert(feed.includes("UID:manual-block-1@candc.ch"), "Feed should include the manual block UID");
  assert(feed.includes("DTSTART;VALUE=DATE:20261110"), "Feed should include the reservation start date");
  assert(feed.includes("DTSTART;VALUE=DATE:20261012"), "Feed should include the manual block start date");
  assert(feed.includes("DTEND;VALUE=DATE:20261023"), "Feed should include the manual block end date");
  assert(
    feed.includes("DESCRIPTION:Manual calendar block: Fermeture Booking.com\\, octobre"),
    "Manual block note should be escaped in the description",
  );

  // Sans blocages manuels, le flux doit rester valide et sans événement manuel.
  const feedWithoutBlocks = buildReservationFeed(reservations);
  assert(
    !feedWithoutBlocks.includes("UID:manual-"),
    "Feed without manual blocks should not contain manual events",
  );
}

// Politique des liens de gestion (« manage token »)
// --------------------------------------------------------------------------
// Incident du 26.10.2026 : les e-mails automatiques (`payment_expired`, puis
// `arrival_instructions`) émettaient un token ROTATIF et révoquaient donc le
// lien de l'e-mail de confirmation. Le client tombait sur « Unknown or expired
// booking link » au lieu de pouvoir payer.
//
// Règle : un e-mail automatique AJOUTE un lien valide, il n'en révoque jamais.
// La rotation est réservée aux actions explicites : bouton admin « régénérer le
// lien » (rotate_manage_token) et annulation d'une réservation.
const MANAGE_TOKEN_ROTATION_ALLOWLIST = new Set([
  // Action admin explicite de régénération du lien (bouton du dashboard).
  "functions/api/admin/booking.js",
]);

function listJsFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function runManageTokenPolicyTests() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const functionsRoot = join(projectRoot, "functions");
  const offenders = [];

  for (const file of listJsFiles(functionsRoot)) {
    if (!/rotate:\s*true/.test(readFileSync(file, "utf8"))) {
      continue;
    }

    const relativePath = relative(projectRoot, file).split("\\").join("/");
    if (!MANAGE_TOKEN_ROTATION_ALLOWLIST.has(relativePath)) {
      offenders.push(relativePath);
    }
  }

  assert(
    offenders.length === 0,
    `Automatic flows must not rotate manage tokens (use createManageToken without { rotate: true } so the customer's existing link keeps working). Offending file(s): ${offenders.join(", ") || "none"}`,
  );
}

async function runManageTokenLifecycleTests() {
  const { createManageToken } = await import("../functions/_lib/db.js");
  const executed = [];
  const env = {
    PUBLIC_BASE_URL: "https://candc.ch",
    DB: {
      prepare(sql) {
        const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
        executed.push(record);
        const statement = {
          bind(...args) {
            record.args = args;
            return statement;
          },
          async run() {
            return { success: true };
          },
        };
        return statement;
      },
    },
  };

  const token = await createManageToken(env, "res-1");
  assert(
    typeof token === "string" && token.length >= 20,
    "createManageToken should return an opaque token",
  );
  assert(
    !executed.some((statement) => /UPDATE booking_tokens/i.test(statement.sql)),
    "createManageToken without { rotate: true } must not revoke existing management links",
  );
  assert(
    executed.some((statement) => /INSERT INTO booking_tokens/i.test(statement.sql)),
    "createManageToken should insert the new token",
  );

  // La rotation reste disponible, mais uniquement sur demande explicite.
  executed.length = 0;
  await createManageToken(env, "res-1", { rotate: true });
  assert(
    executed.some(
      (statement) => /UPDATE booking_tokens/i.test(statement.sql) && /revoked_at/i.test(statement.sql),
    ),
    "createManageToken({ rotate: true }) must revoke the previous management links",
  );
}

// Suivi de remise des e-mails (bounces Resend)
// --------------------------------------------------------------------------
// Incident du 01.11.2026 : l'e-mail d'arrivée de PARK-20261101-B62F74EB est
// logué `sent` (Resend a accepté l'envoi) alors que la remise a échoué
// (« smtp; 554 5.7.1 Command rejected »). Le client n'a rien reçu et l'hôte
// n'en savait rien. `runEmailDeliveryCheck` comble ce trou : il enregistre
// l'état réel de remise et alerte l'admin sur bounce / plainte.
function makeDeliveryCheckDb(pendingRow) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
      statements.push(record);
      const stmt = {
        bind(...args) {
          record.args = args;
          return stmt;
        },
        async all() {
          if (/FROM email_logs/i.test(record.sql) && /delivery_status IS NULL/i.test(record.sql)) {
            return { results: pendingRow ? [pendingRow] : [] };
          }
          return { results: [] };
        },
        async first() {
          return null;
        },
        async run() {
          return { meta: {} };
        },
      };
      return stmt;
    },
  };
}

async function runEmailDeliveryCheckTests() {
  const { runEmailDeliveryCheck } = await import("../functions/_lib/jobs.js");

  const pendingRow = {
    id: "log-1",
    reservation_id: "res-1",
    email_type: "arrival_instructions",
    recipient: "guest@example.com",
    provider_message_id: "msg-1",
    created_at: new Date().toISOString(),
  };

  const db = makeDeliveryCheckDb(pendingRow);
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];

  globalThis.fetch = async (url, init = {}) => {
    fetchedUrls.push(String(url));
    if (String(url).includes("api.resend.com/emails/msg-1")) {
      return {
        ok: true,
        json: async () => ({
          id: "msg-1",
          last_event: "bounced",
          bounce: { diagnosticCode: ["smtp; 554 5.7.1 Command rejected"] },
        }),
      };
    }
    if (String(url).startsWith("https://api.resend.com/emails") && init.method === "POST") {
      return { ok: true, json: async () => ({ id: "alert-1" }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const env = {
      PUBLIC_BASE_URL: "https://candc.ch",
      ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
      EMAIL_FROM: "C&C <reservations@candc.ch>",
      RESEND_API_KEY: "test-key",
      DB: db,
    };

    const result = await runEmailDeliveryCheck(env, { limit: 1 });

    assertEqual(result.checked, 1, "One email delivery should be checked");
    assertEqual(result.bounced.length, 1, "The bounce should be reported");
    assertEqual(
      result.bounced[0].emailType,
      "arrival_instructions",
      "The bounced email type should be reported",
    );
    assert(
      fetchedUrls.some((url) => url.includes("api.resend.com/emails/msg-1")),
      "The delivery check must query the Resend API for the stored message id",
    );

    const statusUpdate = db.statements.find((statement) =>
      /UPDATE email_logs/i.test(statement.sql) && /delivery_status/i.test(statement.sql),
    );
    assert(Boolean(statusUpdate), "The delivery status must be stored in email_logs");
    assertEqual(statusUpdate.args[0], "bounced", "email_logs.delivery_status must store the Resend event");

    const alertLog = db.statements.find(
      (statement) =>
        /INSERT INTO email_logs/i.test(statement.sql) &&
        String(statement.args[2] || "").includes("admin_alert:email_not_delivered:res-1"),
    );
    assert(
      Boolean(alertLog),
      "A bounce must raise a deduped admin alert (host has to know the guest was not reached)",
    );

    assert(!result.ok, "A bounced email should report ok:false");

    // Resend injoignable / réponse inattendue : fail-open, aucun crash.
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    const degraded = await runEmailDeliveryCheck({ ...env, DB: makeDeliveryCheckDb(pendingRow) }, { limit: 1 });
    assertEqual(degraded.checked, 0, "An unreachable Resend API must not mark anything as checked");
    assert(degraded.errors > 0, "Network errors must be counted, not thrown");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Renvoi manuel depuis l'admin (`resend_email`) : il AJOUTE un lien de gestion
// valide et ne doit jamais révoquer les liens déjà reçus par le client.
function runAdminResendPolicyTests() {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const source = readFileSync(join(projectRoot, "functions/api/admin/booking.js"), "utf8");
  const start = source.indexOf('action === "resend_email"');
  const end = source.indexOf('action === "run_booking_sync"');

  assert(start > -1 && end > start, "The admin API must expose a resend_email action");

  const resendBlock = source.slice(start, end);
  assert(
    !/rotate\s*:/.test(resendBlock),
    "resend_email must not rotate manage tokens (previous links stay valid)",
  );
  assert(
    /RESENDABLE_EMAIL_TYPES/.test(resendBlock),
    "resend_email must restrict the email types an admin can replay",
  );
}

// Historique des réservations (migration 0019)
// --------------------------------------------------------------------------
// `sync_logs` porte désormais `reservation_id`, ce qui alimente le panneau
// « History » de /admin/booking. Deux exigences :
//   1. l'id de réservation est déduit de `payloadSummary` sans toucher les
//      ~30 appels existants ;
//   2. le journal ne casse jamais tant que la migration n'est pas appliquée
//      (déploiement de code avant migration = cas normal chez cet hôte).
function makeSyncLogMockDb({ missingColumn = false, rows = [] } = {}) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
      statements.push(record);
      const stmt = {
        bind(...args) {
          record.args = args;
          return stmt;
        },
        async run() {
          if (missingColumn && /reservation_id/i.test(record.sql)) {
            throw new Error("D1_ERROR: table sync_logs has no column named reservation_id");
          }
          return { meta: {} };
        },
        async all() {
          if (missingColumn && /sync_logs\.reservation_id/i.test(record.sql)) {
            throw new Error("D1_ERROR: no such column: sync_logs.reservation_id");
          }
          return { results: rows };
        },
      };
      return stmt;
    },
  };
}

async function runReservationHistoryTests() {
  const { insertSyncLog, listRecentSyncLogs } = await import("../functions/_lib/db.js");

  // 1. L'id de réservation est déduit de payloadSummary (aucun appel à changer).
  const db = makeSyncLogMockDb();
  await insertSyncLog({ DB: db }, {
    unitId: "unit-1",
    syncType: "early_departure",
    status: "success",
    message: "departure moved 2026-11-05 → 2026-11-03",
    payloadSummary: { reservationId: "res-42", previousCheckOutDate: "2026-11-05" },
  });

  const insertStatement = db.statements.find((statement) => /INSERT INTO sync_logs/i.test(statement.sql));
  assert(insertStatement, "insertSyncLog must insert into sync_logs");
  assert(
    /reservation_id/i.test(insertStatement.sql),
    "insertSyncLog must populate the reservation_id column (migration 0019)",
  );
  assertEqual(
    insertStatement.args[6],
    "res-42",
    "insertSyncLog must derive reservation_id from payloadSummary.reservationId",
  );

  // 2. Un id explicite est prioritaire (flux client : payload volontairement
  //    construit sans clé `reservationId`).
  const explicitDb = makeSyncLogMockDb();
  await insertSyncLog({ DB: explicitDb }, {
    reservationId: "res-7",
    unitId: "unit-1",
    syncType: "reservation_cancelled",
    status: "success",
    message: "cancelled by the customer",
  });
  const explicitStatement = explicitDb.statements.find((statement) =>
    /INSERT INTO sync_logs/i.test(statement.sql),
  );
  assertEqual(
    explicitStatement.args[6],
    "res-7",
    "insertSyncLog must use log.reservationId when payloadSummary has none",
  );

  // 3. Migration non appliquée : repli sans la colonne, jamais d'exception.
  const legacyDb = makeSyncLogMockDb({ missingColumn: true });
  await insertSyncLog({ DB: legacyDb }, {
    unitId: "unit-1",
    syncType: "early_departure",
    status: "success",
    message: "departure moved",
    payloadSummary: { reservationId: "res-42" },
  });
  assertEqual(
    legacyDb.statements.length,
    2,
    "insertSyncLog must retry without reservation_id when the migration is not applied",
  );
  assert(
    !/reservation_id/i.test(legacyDb.statements[1].sql),
    "The fallback insert must not reference reservation_id",
  );

  // 4. Une autre erreur D1 n'est jamais avalée.
  const brokenDb = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async run() {
          throw new Error("D1_ERROR: no such table: sync_logs");
        },
      };
    },
  };
  let thrown = null;
  try {
    await insertSyncLog({ DB: brokenDb }, { syncType: "x", status: "success" });
  } catch (error) {
    thrown = error;
  }
  assert(thrown, "insertSyncLog must rethrow errors unrelated to reservation_id");

  // 5. L'historique est filtré par réservation et renvoie l'avant/après.
  const historyRows = [
    {
      id: "log-1",
      reservation_id: "res-42",
      sync_type: "early_departure",
      status: "success",
      message: "departure moved 2026-11-05 → 2026-11-03",
      payload_summary: JSON.stringify({ previousCheckOutDate: "2026-11-05" }),
      created_at: "2026-11-18T12:00:00.000Z",
      unit_code: "parking-space",
      unit_display_name: "Parking space",
    },
  ];
  const listDb = makeSyncLogMockDb({ rows: historyRows });
  const history = await listRecentSyncLogs({ DB: listDb }, 50, { reservationId: "res-42" });
  const listStatement = listDb.statements[0];
  assert(
    /sync_logs\.reservation_id = \?/i.test(listStatement.sql),
    "listRecentSyncLogs must filter on the indexed reservation_id column",
  );
  assertEqual(listStatement.args[0], "res-42", "The reservation filter must be bound first");
  assertEqual(listStatement.args[1], 50, "The limit is bound after the filter");
  assertEqual(history.length, 1, "The history must return the matching log");
  assertEqual(history[0].sync_type, "early_departure", "The history keeps the event type");
  assert(
    history[0].payload_summary.includes("previousCheckOutDate"),
    "The history must expose the before/after payload so the admin can see the original dates",
  );

  // 6. Pre-migration : repli sur l'id présent dans le payload JSON.
  const legacyListDb = makeSyncLogMockDb({ missingColumn: true, rows: historyRows });
  const legacyHistory = await listRecentSyncLogs({ DB: legacyListDb }, 50, { reservationId: "res-42" });
  assert(
    /json_extract\(sync_logs\.payload_summary/i.test(legacyListDb.statements.at(-1).sql),
    "Without migration 0019 the filter must fall back to payload_summary JSON",
  );
  assertEqual(
    legacyHistory[0].reservation_id,
    "res-42",
    "The fallback must still attribute the log to the reservation",
  );
}

// Timeline d'une réservation (panneau « History » de /admin/booking)
// --------------------------------------------------------------------------
// Trois sources fusionnées et triées côté serveur : journal (`sync_logs`),
// e-mails (`email_logs`) et paiements (`payments`). Le test verrouille le tri,
// les libellés (avant/après, état de remise, montant) et le départage stable.
async function runReservationTimelineTests() {
  const { buildReservationTimeline, describeHistoryPayload } = await import(
    "../functions/_lib/reservation-history.js"
  );

  // 1. Le payload fournit le résumé lisible (avant/après des dates et montants).
  assertEqual(
    describeHistoryPayload({
      previousCheckOutDate: "2026-11-22",
      newCheckOutDate: "2026-11-18",
      previousTotal: 469.86,
      nextTotal: 469.86,
    }),
    "departure 2026-11-22 → 2026-11-18",
    "A total that does not change must not be repeated in the summary",
  );
  assertEqual(
    describeHistoryPayload({
      previousCheckInDate: "2026-11-01",
      newCheckInDate: "2026-11-03",
      previousTotal: "250",
      nextTotal: "212.5",
      refund: { mode: "automatic", amount: 37.5 },
    }),
    "check-in 2026-11-01 → 2026-11-03, total 250.00 → 212.50 CHF, refund automatic 37.50 CHF",
    "The summary must expose dates, totals and the refund",
  );
  assertEqual(describeHistoryPayload(null), "", "A missing payload yields no summary");

  // 2. Fusion des trois sources, tri du plus récent au plus ancien.
  const timeline = buildReservationTimeline({
    history: [
      {
        when: "2026-11-18T17:01:43.164Z",
        type: "early_departure",
        status: "success",
        message: "departure moved 2026-11-22 → 2026-11-18",
        payload: { previousCheckOutDate: "2026-11-22", newCheckOutDate: "2026-11-18" },
      },
      {
        when: "2026-10-26T11:48:13.435Z",
        type: "ntfy_notification",
        status: "failed",
        message: "ntfy_send_failed:429",
      },
    ],
    emails: [
      {
        when: "2026-10-26T11:48:12.907Z",
        type: "booking_confirmation",
        recipient: "guest@example.com",
        status: "sent",
        deliveryStatus: "bounced",
      },
    ],
    payments: [
      {
        when: "2026-10-26T11:49:00.000Z",
        type: "initial",
        status: "paid",
        amount: 469.86,
        currency: "CHF",
        provider: "sumup",
        provider_payment_reference: "txn-1",
      },
    ],
  });

  assertEqual(timeline.length, 4, "The timeline must merge history, emails and payments");
  assertEqual(timeline[0].type, "early_departure", "Newest event first");
  assertEqual(
    timeline[0].text,
    "departure 2026-11-22 → 2026-11-18",
    "The history event is summarised from its payload",
  );

  const paymentEvent = timeline.find((event) => event.kind === "payment");
  assert(paymentEvent, "Payments must appear in the timeline");
  assertEqual(paymentEvent.type, "payment: initial", "Payment events are labelled by type");
  assertEqual(paymentEvent.status, "paid", "Payment events carry the SumUp status");
  assertEqual(
    paymentEvent.text,
    "469.86 CHF · via sumup · ref txn-1",
    "Payment events show the amount, the provider and the transaction reference",
  );

  const emailEvent = timeline.find((event) => event.kind === "email");
  assertEqual(emailEvent.type, "email: booking_confirmation", "Emails are labelled by type");
  assertEqual(
    emailEvent.status,
    "BOUNCED (not received)",
    "A bounced email must be explicit, not just 'sent'",
  );
  assertEqual(emailEvent.text, "to guest@example.com", "Emails keep the recipient");

  const failedEvent = timeline.find((event) => event.type === "ntfy_notification");
  assertEqual(failedEvent.text, "ntfy_send_failed:429", "Without a payload, the raw message is used");

  // 3. Départage à la seconde identique : paiement, événement, e-mail.
  const sameInstant = buildReservationTimeline({
    history: [{ when: "2026-11-01T10:00:00.000Z", type: "wc_confirmation", status: "success" }],
    emails: [{ when: "2026-11-01T10:00:00.000Z", type: "booking_confirmation", status: "sent" }],
    payments: [{ when: "2026-11-01T10:00:00.000Z", type: "initial", status: "paid", amount: 10 }],
  });
  assertEqual(
    sameInstant.map((event) => event.kind).join(","),
    "payment,history,email",
    "Identical timestamps must be tie-broken deterministically",
  );

  // 4. Aucune source : liste vide (pas d'entrée fantôme).
  assertEqual(buildReservationTimeline({}).length, 0, "An empty reservation yields an empty timeline");
}

// ── Réconciliation des paiements SumUp ──────────────────────────────────────
// Le webhook est la voie nominale. Quand il n'arrive pas, un client peut avoir
// payé sans que la réservation soit confirmée : la maintenance des holds doit
// relire le statut réel chez SumUp AVANT de libérer les dates (incident
// 24.11.2026 : PARK-20270127-19C5ABBA payé à 18:08, « réservation expirée »
// envoyée à 18:40).
function makeReconciliationDb({
  candidateRow,
  reservation,
  fullReservation,
  conflicts = [],
  payments = [],
  missingWebhookRows = [],
}) {
  const statements = [];

  return {
    statements,
    prepare(sql) {
      const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
      statements.push(record);
      const statement = {
        bind(...args) {
          record.args = args;
          return statement;
        },
        async all() {
          if (/NOT EXISTS/i.test(record.sql) && /sumup_webhook_received/i.test(record.sql)) {
            return { results: missingWebhookRows };
          }
          if (/FROM payments INNER JOIN reservations/i.test(record.sql)) {
            return { results: candidateRow ? [candidateRow] : [] };
          }
          if (/FROM payments WHERE reservation_id = \?/i.test(record.sql)) {
            return { results: payments };
          }
          if (/FROM calendar_blocks/i.test(record.sql)) {
            return { results: conflicts };
          }
          return { results: [] };
        },
        async first() {
          if (/FROM reservations INNER JOIN payments/i.test(record.sql)) {
            return reservation;
          }
          if (/FROM reservations LEFT JOIN rentable_units/i.test(record.sql)) {
            return fullReservation;
          }
          return null;
        },
        async run() {
          return { meta: {} };
        },
      };
      return statement;
    },
    async batch(list) {
      return list.map(() => ({ meta: {} }));
    },
  };
}

function makeReconciliationFixtures(reservationStatus) {
  return {
    candidateRow: {
      payment_id: "pay-1",
      provider_checkout_id: "co-1",
      payment_type: "initial",
      payment_status: "pending",
      amount: 57.4,
      currency: "CHF",
      payment_created_at: new Date().toISOString(),
      reservation_id: "res-1",
      public_reference: "PARK-20270127-19C5ABBA",
      reservation_status: reservationStatus,
      unit_id: "unit_parking",
      unit_code: "parking-space",
      guest_email: "guest@example.com",
    },
    reservation: {
      id: "res-1",
      unit_id: "unit_parking",
      unit_code: "parking-space",
      public_reference: "PARK-20270127-19C5ABBA",
      status: reservationStatus,
      guest_email: "guest@example.com",
      provider_checkout_id: "co-1",
      payment_type: "initial",
    },
    fullReservation: {
      id: "res-1",
      unit_id: "unit_parking",
      unit_code: "parking-space",
      unit_type: "parking",
      public_reference: "PARK-20270127-19C5ABBA",
      status: reservationStatus,
      locale: "fr",
      guest_first_name: "Vincent",
      guest_last_name: "Bujard",
      guest_email: "guest@example.com",
      check_in_date: "2027-01-27",
      check_out_date: "2027-01-29",
      check_in_start_time: "15:00:00",
      check_in_end_time: "21:00:00",
      check_out_time: "10:00:00",
      adults: 1,
      children: 0,
      infants: 0,
      total_amount: 57.4,
      currency: "CHF",
      wc_shower_requested: 0,
      refundable_policy_type: "flexible_48h",
      payment_status: "pending",
      remarks: "",
    },
  };
}

function reconciliationEnv(db) {
  return {
    PUBLIC_BASE_URL: "https://candc.ch",
    ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
    EMAIL_FROM: "C&C <reservations@candc.ch>",
    RESEND_API_KEY: "test-key",
    SUMUP_API_KEY: "sumup-key",
    SUMUP_MERCHANT_CODE: "MERCHANT",
    DB: db,
  };
}

async function runPaymentReconciliationTests() {
  const { reconcileSumupPayments, reservationMayAwaitSumupConfirmation } = await import(
    "../functions/_lib/payment-reconciliation.js"
  );

  const originalFetch = globalThis.fetch;
  const emailBodies = [];

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);

    if (target.includes("/v0.1/checkouts/co-1")) {
      if (globalThis.__checkoutBehaviour === "unreachable") {
        throw new Error("network down");
      }
      return { ok: true, json: async () => ({ id: "co-1", ...globalThis.__checkoutPayload }) };
    }
    if (target.startsWith("https://api.resend.com/emails") && init.method === "POST") {
      emailBodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ id: "email-1" }) };
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  try {
    // 1. Hold libéré (`payment_expired`) mais checkout payé : la réconciliation
    //    doit confirmer la réservation, prévenir le client (payment_received) et
    //    alerter l'hôte sur le webhook perdu.
    globalThis.__checkoutBehaviour = "paid";
    globalThis.__checkoutPayload = { status: "PAID", transaction_id: "txn-1" };
    const fixtures = makeReconciliationFixtures("payment_expired");
    const db = makeReconciliationDb(fixtures);

    const recovered = await reconcileSumupPayments(reconciliationEnv(db), { reservationId: "res-1" });

    assertEqual(recovered.checked, 1, "The candidate checkout must be checked");
    assertEqual(recovered.confirmed, 1, "A paid checkout must confirm the reservation");
    assertEqual(recovered.recovered.length, 1, "A paid hold that had expired must be reported as recovered");

    const reservationUpdate = db.statements.find(
      (statement) => /UPDATE reservations SET status = \?/i.test(statement.sql),
    );
    assert(Boolean(reservationUpdate), "The reservation status must be updated");
    assertEqual(reservationUpdate.args[0], "confirmed", "A paid checkout confirms the reservation");

    const blockUpdate = db.statements.find(
      (statement) => /UPDATE calendar_blocks SET status = \?/i.test(statement.sql),
    );
    assertEqual(blockUpdate.args[0], "confirmed", "The released block must be re-confirmed");

    const paymentUpdate = db.statements.find(
      (statement) => /UPDATE payments SET/i.test(statement.sql),
    );
    assert(
      String(paymentUpdate.args[1]).includes("paid"),
      "The SumUp payment must be stored as paid",
    );

    const reconciledLog = db.statements.find(
      (statement) =>
        /INSERT INTO sync_logs/i.test(statement.sql) && statement.args[2] === "payment_reconciled",
    );
    assert(Boolean(reconciledLog), "The reconciliation must be logged for the reservation history");

    const recoveryEmail = db.statements.find(
      (statement) =>
        /INSERT INTO email_logs/i.test(statement.sql) && statement.args[2] === "payment_received",
    );
    assert(Boolean(recoveryEmail), "The guest must be told the payment was received");
    assert(
      emailBodies.some((body) => /paiement reçu/i.test(body.subject)),
      "The recovery e-mail must explain that the payment went through",
    );

    const adminAlert = db.statements.find(
      (statement) =>
        /INSERT INTO email_logs/i.test(statement.sql) &&
        String(statement.args[2] || "") === "admin_alert:sumup_payment_reconciled",
    );
    assert(Boolean(adminAlert), "A lost webhook must alert the admin");

    // 2. Toujours en attente (`pending_payment`) et payé : confirmation, sans
    //    e-mail de récupération (le client a déjà sa confirmation).
    emailBodies.length = 0;
    const pendingFixtures = makeReconciliationFixtures("pending_payment");
    const pendingDb = makeReconciliationDb(pendingFixtures);
    const pendingResult = await reconcileSumupPayments(reconciliationEnv(pendingDb), {
      reservationId: "res-1",
    });

    assertEqual(pendingResult.confirmed, 1, "A paid pending hold must be confirmed");
    assertEqual(pendingResult.recovered.length, 0, "Nothing was recovered from an expired state");
    assertEqual(
      pendingDb.statements.filter(
        (statement) =>
          /INSERT INTO email_logs/i.test(statement.sql) && statement.args[2] === "payment_received",
      ).length,
      0,
      "No recovery e-mail when the hold was still active",
    );

    // 3. SumUp injoignable : fail-open, hold reporté (jamais libéré à l'aveugle).
    globalThis.__checkoutBehaviour = "unreachable";
    const unreachableDb = makeReconciliationDb(makeReconciliationFixtures("pending_payment"));
    const unreachable = await reconcileSumupPayments(reconciliationEnv(unreachableDb), {});
    assertEqual(unreachable.confirmed, 0, "An unreachable SumUp API must not confirm anything");
    assertEqual(unreachable.errors.length, 1, "The SumUp error must be reported");
    assert(
      unreachable.deferredReservationIds.includes("res-1"),
      "A hold whose payment cannot be verified must not be released",
    );
    assert(
      !unreachableDb.statements.some((statement) => /UPDATE reservations SET status/i.test(statement.sql)),
      "An unreachable SumUp API must never touch the reservation",
    );

    // 4. Checkout non payé : rien à faire, aucune écriture.
    globalThis.__checkoutBehaviour = "paid";
    globalThis.__checkoutPayload = { status: "PENDING" };
    const unpaidDb = makeReconciliationDb(makeReconciliationFixtures("pending_payment"));
    const unpaid = await reconcileSumupPayments(reconciliationEnv(unpaidDb), {});
    assertEqual(unpaid.unpaid, 1, "A still pending checkout must be counted as unpaid");
    assert(
      !unpaidDb.statements.some((statement) => /UPDATE reservations SET status/i.test(statement.sql)),
      "An unpaid checkout must not change the reservation",
    );

    // 5. SumUp non configuré : sortie immédiate (aucun appel réseau).
    const skipped = await reconcileSumupPayments(
      { PUBLIC_BASE_URL: "https://candc.ch", DB: makeReconciliationDb({}) },
      {},
    );
    assertEqual(skipped.skipped, "sumup_not_configured", "Without SumUp credentials nothing is checked");

    // 6. Statuts concernés par la réconciliation.
    assert(reservationMayAwaitSumupConfirmation({ status: "pending_payment" }), "pending_payment is reconcilable");
    assert(reservationMayAwaitSumupConfirmation({ status: "payment_expired" }), "payment_expired is reconcilable");
    assert(
      !reservationMayAwaitSumupConfirmation({ status: "confirmed" }),
      "A confirmed reservation is never reconciled",
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__checkoutBehaviour;
    delete globalThis.__checkoutPayload;
  }
}

// Une libération de hold ne doit jamais toucher une réservation dont le statut
// de paiement n'a pas pu être vérifié chez SumUp.
async function runReleaseSkipTests() {
  const { releaseExpiredPendingPayments } = await import("../functions/_lib/db.js");

  const statements = [];
  const rows = [
    { reservation_id: "res-skip", reservation_status: "pending_payment", block_id: "block-1" },
    { reservation_id: "res-free", reservation_status: "pending_payment", block_id: "block-2" },
  ];
  const db = {
    prepare(sql) {
      const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
      statements.push(record);
      const statement = {
        bind(...args) {
          record.args = args;
          return statement;
        },
        async all() {
          return { results: rows };
        },
      };
      return statement;
    },
    async batch(list) {
      return list.map(() => ({ meta: {} }));
    },
  };

  const result = await releaseExpiredPendingPayments(
    { PUBLIC_BASE_URL: "https://candc.ch", PENDING_PAYMENT_HOLD_MINUTES: "30", DB: db },
    { skipReservationIds: ["res-skip"] },
  );

  assertEqual(result.expiredInitial.length, 1, "Only the verifiable hold may be released");
  assertEqual(result.expiredInitial[0], "res-free", "The deferred reservation must keep its hold");

  const reservationUpdate = statements.find(
    (statement) => /UPDATE reservations SET status = 'payment_expired'/i.test(statement.sql),
  );
  assert(
    reservationUpdate.args.every((arg) => arg !== "res-skip"),
    "A reservation whose payment could not be verified must not expire",
  );
}

// ── Garde-fous de confirmation SumUp ────────────────────────────────────────
// Un webhook (ou une relecture) sur un checkout qui n'est PAS payé ne doit
// jamais modifier la réservation : sinon un webhook tardif sur un ancien
// checkout (carte refusée, paiement réussi sur un second) repassait une
// réservation payée en `pending_payment`, puis la maintenance la déclarait
// « expirée » — le symptôme de PARK-20270127-19C5ABBA par un autre chemin.
async function runPaymentStateGuardTests() {
  const { applySumupCheckoutStatus } = await import("../functions/_lib/payment-confirmation.js");
  const { checkSumupWebhookDelivery } = await import("../functions/_lib/payment-reconciliation.js");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.startsWith("https://api.resend.com/emails") && init.method === "POST") {
      return { ok: true, json: async () => ({ id: "email-1" }) };
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  const touchesReservation = (db) =>
    db.statements.some((statement) => /UPDATE reservations SET status/i.test(statement.sql)) ||
    db.statements.some((statement) => /UPDATE calendar_blocks SET status/i.test(statement.sql));
  const paymentUpdates = (db) =>
    db.statements.filter((statement) => /UPDATE payments SET/i.test(statement.sql));

  try {
    // 1. FAILED / EXPIRED tardif sur un ancien checkout d'une réservation
    //    confirmée : la réservation n'est pas touchée.
    for (const status of ["FAILED", "EXPIRED", "PENDING", "CANCELLED"]) {
      const fixtures = makeReconciliationFixtures("confirmed");
      const db = makeReconciliationDb({
        ...fixtures,
        payments: [
          { provider_checkout_id: "co-1", type: "initial", status: "pending", amount: 57.4 },
          { provider_checkout_id: "co-2", type: "initial", status: "paid", amount: 57.4 },
        ],
      });
      const applied = await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status },
        reservation: fixtures.reservation,
      });
      assert(!touchesReservation(db), `A ${status} checkout must never change a confirmed reservation`);
      assertEqual(applied.reservationStatus, "confirmed", `${status}: the reservation stays confirmed`);
      assertEqual(paymentUpdates(db).length, 1, `${status}: the stale checkout row is still updated`);
    }

    // 2. Non payé sur une réservation expirée ou annulée : les dates libérées
    //    ne sont pas re-bloquées.
    for (const reservationStatus of ["payment_expired", "cancelled", "pending_payment"]) {
      const fixtures = makeReconciliationFixtures(reservationStatus);
      const db = makeReconciliationDb(fixtures);
      await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status: "FAILED" },
        reservation: fixtures.reservation,
      });
      assert(
        !touchesReservation(db),
        `A FAILED checkout must not touch a ${reservationStatus} reservation or its blocks`,
      );
    }

    // 3. Une ligne déjà `paid` n'est jamais rétrogradée.
    {
      const fixtures = makeReconciliationFixtures("confirmed");
      const db = makeReconciliationDb({
        ...fixtures,
        payments: [{ provider_checkout_id: "co-1", type: "initial", status: "paid", amount: 57.4 }],
      });
      await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status: "FAILED" },
        reservation: fixtures.reservation,
      });
      assertEqual(paymentUpdates(db).length, 0, "A paid payment row must never be downgraded");
    }

    // 4. Redélivrance PAID d'un checkout déjà payé sur un séjour `modified` :
    //    aucune écriture (avant : retour en `confirmed`).
    {
      const fixtures = makeReconciliationFixtures("modified");
      const db = makeReconciliationDb({
        ...fixtures,
        payments: [{ provider_checkout_id: "co-1", type: "initial", status: "paid", amount: 57.4 }],
      });
      const applied = await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status: "PAID", transaction_id: "txn-1" },
        reservation: fixtures.reservation,
      });
      assert(applied.noop, "A redelivered PAID webhook is a no-op");
      assert(!touchesReservation(db), "A redelivered PAID webhook must not reset a modified stay");
    }

    // 5. Second checkout payé alors que la réservation est déjà confirmée
    //    (double paiement) : argent enregistré, réservation intacte, hôte
    //    alerté pour rembourser.
    {
      const fixtures = makeReconciliationFixtures("confirmed");
      const db = makeReconciliationDb({
        ...fixtures,
        payments: [
          { provider_checkout_id: "co-1", type: "initial", status: "pending", amount: 57.4, currency: "CHF" },
          { provider_checkout_id: "co-2", type: "initial", status: "paid", amount: 57.4, currency: "CHF" },
        ],
      });
      const applied = await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status: "PAID", transaction_id: "txn-dup" },
        reservation: fixtures.reservation,
      });
      assert(applied.unexpectedPayment, "A second paid checkout is reported as unexpected");
      assert(!touchesReservation(db), "An unexpected payment must not change the reservation");
      assert(
        String(paymentUpdates(db)[0]?.args[1]).includes("paid"),
        "The unexpected payment must still be recorded as paid",
      );
      assert(
        db.statements.some(
          (statement) =>
            /INSERT INTO sync_logs/i.test(statement.sql) && statement.args[2] === "payment_unexpected",
        ),
        "The unexpected payment must be logged in the reservation history",
      );
      assert(
        db.statements.some(
          (statement) =>
            /INSERT INTO email_logs/i.test(statement.sql) &&
            statement.args[2] === "admin_alert:sumup_unexpected_payment:co-1",
        ),
        "The host must be alerted to refund an unexpected payment",
      );
    }

    // 6. Paiement payé après annulation : jamais de résurrection.
    {
      const fixtures = makeReconciliationFixtures("cancelled");
      const db = makeReconciliationDb(fixtures);
      const applied = await applySumupCheckoutStatus(reconciliationEnv(db), {
        checkoutId: "co-1",
        checkout: { id: "co-1", status: "PAID", transaction_id: "txn-late" },
        reservation: fixtures.reservation,
      });
      assert(applied.unexpectedPayment, "A payment on a cancelled reservation is unexpected");
      assert(!touchesReservation(db), "A cancelled reservation must never be resurrected by a payment");
    }

    // 7. Webhook muet : un paiement confirmé sans aucun webhook reçu alerte
    //    l'hôte une fois (marqueur sumup_webhook_missing).
    {
      const db = makeReconciliationDb({
        missingWebhookRows: [
          {
            provider_checkout_id: "co-1",
            payment_type: "initial",
            payment_created_at: "2026-11-24T18:08:07.670Z",
            payment_updated_at: "2026-11-24T19:00:15.476Z",
            reservation_id: "res-1",
            public_reference: "PARK-20270127-19C5ABBA",
          },
        ],
      });
      const result = await checkSumupWebhookDelivery(reconciliationEnv(db));
      assertEqual(result.missing.length, 1, "A paid checkout without webhook must be detected");
      const query = db.statements.find((statement) => /NOT EXISTS/i.test(statement.sql));
      assert(
        /sumup_webhook_missing/.test(query.sql),
        "Already reported payments must be excluded (alert once per payment)",
      );
      assert(
        db.statements.some(
          (statement) =>
            /INSERT INTO sync_logs/i.test(statement.sql) && statement.args[2] === "sumup_webhook_missing",
        ),
        "The missing webhook must be recorded so it is reported only once",
      );
      assert(
        db.statements.some(
          (statement) =>
            /INSERT INTO email_logs/i.test(statement.sql) &&
            statement.args[2] === "admin_alert:sumup_webhook_missing",
        ),
        "A silent webhook must alert the admin",
      );

      const quietDb = makeReconciliationDb({});
      const quiet = await checkSumupWebhookDelivery(reconciliationEnv(quietDb));
      assertEqual(quiet.missing.length, 0, "No alert when every payment received its webhook");
      assert(
        !quietDb.statements.some((statement) => /INSERT INTO email_logs/i.test(statement.sql)),
        "No alert e-mail when webhooks are delivered",
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Le webhook journalise chaque réception (base de la détection du webhook
// muet) et un rejet de signature alerte l'hôte au lieu d'échouer en silence.
async function runSumupWebhookHandlerTests() {
  const { onRequestPost } = await import("../functions/api/booking/sumup/webhook.js");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/v0.1/checkouts/co-1")) {
      return { ok: true, json: async () => ({ id: "co-1", status: "FAILED" }) };
    }
    if (target.startsWith("https://api.resend.com/emails") && init.method === "POST") {
      return { ok: true, json: async () => ({ id: "email-1" }) };
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  try {
    const fixtures = makeReconciliationFixtures("confirmed");
    const db = makeReconciliationDb(fixtures);
    const request = new Request("https://candc.ch/api/booking/sumup/webhook", {
      method: "POST",
      body: JSON.stringify({ event_type: "CHECKOUT_STATUS_CHANGED", id: "co-1" }),
    });
    const response = await onRequestPost({ env: reconciliationEnv(db), request });
    assertEqual(response.status, 204, "The webhook acknowledges a known checkout");
    assert(
      db.statements.some(
        (statement) =>
          /INSERT INTO sync_logs/i.test(statement.sql) && statement.args[2] === "sumup_webhook_received",
      ),
      "Every webhook reception must be logged",
    );
    assert(
      !db.statements.some((statement) => /UPDATE reservations SET status/i.test(statement.sql)),
      "A FAILED webhook must not touch a confirmed reservation",
    );

    const rejectedDb = makeReconciliationDb({});
    const rejected = await onRequestPost({
      env: { ...reconciliationEnv(rejectedDb), SUMUP_WEBHOOK_SECRET: "secret" },
      request: new Request("https://candc.ch/api/booking/sumup/webhook", {
        method: "POST",
        body: JSON.stringify({ id: "co-1" }),
      }),
    });
    assertEqual(rejected.status, 401, "An unsigned webhook is still rejected when a secret is set");
    assert(
      rejectedDb.statements.some(
        (statement) =>
          /INSERT INTO email_logs/i.test(statement.sql) &&
          statement.args[2] === "admin_alert:sumup_webhook_rejected",
      ),
      "A rejected webhook must alert the admin",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Le `return_url` d'un checkout SumUp est l'URL du WEBHOOK (SumUp y POSTe les
// changements de statut), pas la page de retour du navigateur (`redirect_url`).
// Le 26.10.2026 il a été pointé vers la page de confirmation : plus aucun
// webhook n'arrivait, et le 24.11.2026 une réservation payée
// (PARK-20270127-19C5ABBA) a été déclarée expirée. Ce test verrouille la
// sémantique : un retour en arrière casserait toute confirmation de paiement.
async function runSumupCheckoutRequestTests() {
  const { createHostedCheckout } = await import("../functions/_lib/sumup.js");

  const originalFetch = globalThis.fetch;
  let requestBody = null;

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith("/v0.1/checkouts") && init.method === "POST") {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ id: "co-1", status: "PENDING", hosted_checkout_url: "https://pay" }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    const env = {
      PUBLIC_BASE_URL: "https://candc.ch/",
      SUMUP_API_KEY: "sumup-key",
      SUMUP_MERCHANT_CODE: "MERCHANT",
    };

    await createHostedCheckout(env, {
      amount: 57.4,
      checkoutReference: "PARK-0001",
      currency: "CHF",
      description: "C&C Parking PARK-0001",
      redirectUrl: "https://candc.ch/booking/confirmation/?reference=PARK-0001",
    });

    assert(Boolean(requestBody), "The SumUp checkout request must be sent");
    assertEqual(
      requestBody.return_url,
      "https://candc.ch/api/booking/sumup/webhook",
      "return_url must be the webhook endpoint (SumUp POSTs the payment status there)",
    );
    assertEqual(
      requestBody.redirect_url,
      "https://candc.ch/booking/confirmation/?reference=PARK-0001",
      "redirect_url keeps returning the customer's browser to the shop",
    );

    // SumUp renvoie un return_url différent du webhook : alerte immédiate
    // (contrôle en production, pas seulement dans ce test).
    const alertStatements = [];
    const alertDb = {
      prepare(sql) {
        const record = { sql: sql.replace(/\s+/g, " ").trim(), args: [] };
        alertStatements.push(record);
        const statement = {
          bind(...args) {
            record.args = args;
            return statement;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return { meta: {} };
          },
        };
        return statement;
      },
    };
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).endsWith("/v0.1/checkouts") && init.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            id: "co-2",
            status: "PENDING",
            return_url: "https://candc.ch/booking/confirmation/?reference=PARK-0002",
          }),
        };
      }
      if (String(url).startsWith("https://api.resend.com/emails")) {
        return { ok: true, json: async () => ({ id: "email-1" }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const mismatched = await createHostedCheckout(
      {
        ...env,
        DB: alertDb,
        ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
        EMAIL_FROM: "C&C <reservations@candc.ch>",
        RESEND_API_KEY: "test-key",
      },
      {
        amount: 57.4,
        checkoutReference: "PARK-0002",
        currency: "CHF",
        description: "C&C Parking PARK-0002",
        redirectUrl: "https://candc.ch/booking/confirmation/?reference=PARK-0002",
      },
    );
    assertEqual(mismatched.id, "co-2", "A mismatched return_url must not block the checkout");
    assert(
      alertStatements.some(
        (statement) =>
          /INSERT INTO email_logs/i.test(statement.sql) &&
          statement.args[2] === "admin_alert:sumup_return_url_mismatch",
      ),
      "A return_url that is not the webhook must alert the admin",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  runValidationTests();
  runGuestContactValidationTests();
  runPricingTests();
  runRefundPlanTests();
  await runAlertTests();
  runIcsFeedTests();
  await runOtaAvailabilityTests();
  runManageTokenPolicyTests();
  await runManageTokenLifecycleTests();
  await runEmailDeliveryCheckTests();
  runAdminResendPolicyTests();
  await runReservationHistoryTests();
  await runReservationTimelineTests();
  await runPaymentReconciliationTests();
  await runSumupCheckoutRequestTests();
  await runReleaseSkipTests();
  await runPaymentStateGuardTests();
  await runSumupWebhookHandlerTests();
  console.log("Booking logic tests passed.");
}

await main();
