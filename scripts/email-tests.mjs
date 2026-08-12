import { sendTransactionalEmail } from "../functions/_lib/email.js";

const EMAIL_ENV = {
  PUBLIC_BASE_URL: "https://candc.ch",
  TIMEZONE: "Europe/Zurich",
  EMAIL_FROM: "C&C Reservations <reservations@candc.ch>",
  EMAIL_REPLY_TO: "bonjour@candc.ch",
  RESEND_API_KEY: "test-key",
  ADMIN_NOTIFICATION_EMAIL: "admin@candc.ch",
};

const REVIEW_SUBJECTS = {
  fr: "Comment s'est passé votre séjour ?",
  en: "How was your stay at C&C?",
  de: "Wie war Ihr Aufenthalt bei C&C?",
  es: "¿Qué tal tu estancia en C&C?",
  pt: "Como foi a sua estadia no C&C?",
  it: "Com'è andato il tuo soggiorno al C&C?",
  nl: "Hoe was uw verblijf bij C&C?",
};

const PARKING_REVIEW_LINK = "https://g.page/r/CbsI1IDQnZP4EBM/review";
const STUDIO_REVIEW_LINK = "https://g.page/r/Ca5HhJ5WSkT6EBM/review";

const PAYMENT_REMINDER_SUBJECTS = {
  fr: "C&C Parking rappel de paiement - PARK-0001",
  en: "C&C Parking payment reminder - PARK-0001",
  de: "C&C Parking Zahlungserinnerung - PARK-0001",
  es: "C&C Parking recordatorio de pago - PARK-0001",
  pt: "C&C Parking lembrete de pagamento - PARK-0001",
  it: "C&C Parking promemoria di pagamento - PARK-0001",
  nl: "C&C Parking betalingsherinnering - PARK-0001",
};

const PAYMENT_EXPIRED_SUBJECTS = {
  fr: "C&C Parking réservation expirée - PARK-0001",
  en: "C&C Parking reservation expired - PARK-0001",
  de: "C&C Parking Reservierung abgelaufen - PARK-0001",
  es: "C&C Parking reserva expirada - PARK-0001",
  pt: "C&C Parking reserva expirada - PARK-0001",
  it: "C&C Parking prenotazione scaduta - PARK-0001",
  nl: "C&C Parking reservering verlopen - PARK-0001",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (attendu: ${JSON.stringify(expected)}, obtenu: ${JSON.stringify(actual)})`);
  }
}

function makeReservation(overrides = {}) {
  return {
    id: "r-test",
    public_reference: "PARK-0001",
    guest_first_name: "Ada",
    guest_last_name: "Lovelace",
    guest_email: "ada@example.com",
    unit_type: "parking",
    currency: "CHF",
    check_in_date: "2027-06-01",
    check_out_date: "2027-06-08",
    check_in_start_time: "15:00:00",
    check_in_end_time: "21:00:00",
    check_out_time: "10:00:00",
    total_amount: 100,
    payment_status: "paid",
    status: "confirmed",
    wc_shower_requested: true,
    ...overrides,
  };
}

async function runReviewEmailTests() {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "mock" }), { status: 200 });
  };

  // 1) The review request subject must be 100% in the reservation's language.
  for (const [locale, expectedSubject] of Object.entries(REVIEW_SUBJECTS)) {
    await sendTransactionalEmail(EMAIL_ENV, "review_request", makeReservation({ locale }), {});
    const payload = sent[sent.length - 1];
    assertEqual(payload.subject, expectedSubject, `Review subject should be localized for ${locale}`);

    // Sanity guard: no English fallback wording leaking into a non-English subject.
    if (locale !== "en") {
      const lower = payload.subject.toLowerCase();
      assert(
        !["your stay", "review", "feedback", "hello", "thanks"].some((w) => lower.includes(w)),
        `Review subject for ${locale} must not contain English fallback wording`,
      );
    }
  }

  // 2) The review link must match the unit type (parking vs studio).
  const parkingPayload = await sendTransactionalEmail(
    EMAIL_ENV,
    "review_request",
    makeReservation({ locale: "en" }),
    {},
  );
  assert(
    sent[sent.length - 1].text.includes(PARKING_REVIEW_LINK),
    "Parking review email should contain the parking review link",
  );

  await sendTransactionalEmail(
    EMAIL_ENV,
    "review_request",
    makeReservation({ locale: "en", unit_type: "studio", public_reference: "STUDIO-0002" }),
    {},
  );
  assert(
    sent[sent.length - 1].text.includes(STUDIO_REVIEW_LINK),
    "Studio review email should contain the studio review link",
  );
}

async function runPendingPaymentEmailTests() {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "mock" }), { status: 200 });
  };

  // Subjects must be localized in the reservation's language.
  for (const [locale, expectedSubject] of Object.entries(PAYMENT_REMINDER_SUBJECTS)) {
    await sendTransactionalEmail(EMAIL_ENV, "payment_reminder", makeReservation({ locale }), {
      manageToken: "tok",
    });
    const payload = sent[sent.length - 1];
    assertEqual(payload.subject, expectedSubject, `Payment reminder subject should be localized for ${locale}`);
    assert(
      payload.text.includes("https://candc.ch/booking/manage/tok"),
      `Payment reminder for ${locale} should contain the management link`,
    );
  }

  for (const [locale, expectedSubject] of Object.entries(PAYMENT_EXPIRED_SUBJECTS)) {
    await sendTransactionalEmail(EMAIL_ENV, "payment_expired", makeReservation({ locale }), {
      manageToken: "tok",
    });
    const payload = sent[sent.length - 1];
    assertEqual(payload.subject, expectedSubject, `Payment expired subject should be localized for ${locale}`);
    assert(
      payload.text.includes("PARK-0001"),
      `Payment expired email for ${locale} should mention the reservation reference`,
    );
  }
}

async function main() {
  await runReviewEmailTests();
  await runPendingPaymentEmailTests();
  console.log("Email tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
