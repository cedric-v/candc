import { DEFAULT_UNITS } from "../functions/_lib/catalog.js";
import { calculateQuoteFromResolvedUnit } from "../functions/_lib/pricing.js";
import { buildAutomaticRefundPlan } from "../functions/_lib/refunds.js";
import { buildReservationFeed } from "../functions/_lib/ics.js";
import { isIcsCalendarDocument, parseIcsEvents } from "../functions/_lib/ics-import.js";
import { findLiveExternalConflicts, rangesOverlap } from "../functions/_lib/ota-availability.js";
import { validateBookingInput } from "../functions/_lib/validation.js";
import { sendAdminAlert } from "../functions/_lib/alerts.js";
import { normalizeTopicUrl } from "../functions/_lib/ntfy.js";

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

    const env = { DB: makeImportSourcesMockDb(sources) };
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

async function main() {
  runValidationTests();
  runGuestContactValidationTests();
  runPricingTests();
  runRefundPlanTests();
  await runAlertTests();
  runIcsFeedTests();
  await runOtaAvailabilityTests();
  console.log("Booking logic tests passed.");
}

await main();
