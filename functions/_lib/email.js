import { getConfig } from "./env.js";
import { formatIsoDate } from "./date.js";

function formatMoney(amount, currency = "CHF") {
  return new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function manageUrl(config, token) {
  return `${config.publicBaseUrl}/booking/manage/${token}`;
}

function bookingLabel(reservation) {
  return reservation.unit_type === "studio" ? "studio stay" : "parking stay";
}

function buildConfirmationText(reservation, token, includeWcUpsell) {
  const lines = [
    `Dear ${reservation.guest_first_name},`,
    "",
    `Thank you. Your ${bookingLabel(reservation)} reservation has been created.`,
    "",
    `Reference: ${reservation.public_reference}`,
    `Arrival: ${reservation.check_in_date} between ${reservation.check_in_start_time.slice(0, 5)} and ${reservation.check_in_end_time.slice(0, 5)}`,
    `Departure: ${reservation.check_out_date} by ${reservation.check_out_time.slice(0, 5)}`,
    `Total: ${formatMoney(reservation.total_amount, reservation.currency)}`,
    "",
  ];

  if (reservation.payment_status && reservation.payment_status !== "paid") {
    lines.push("If payment has not been completed yet, please use the payment link shown after booking or contact us if needed.");
    lines.push("");
  }

  if (reservation.unit_type === "parking") {
    lines.push(
      "Access to an indoor toilet and shower is available on request, only when we are on site, between 7 a.m. and 9 p.m.",
    );
  }

  if (includeWcUpsell && reservation.unit_type === "parking") {
    lines.push("This optional service is available for a cleaning fee of CHF 10 for your entire stay.");
  }

  lines.push(
    "",
    `Manage your reservation: ${token}`,
    "",
    "Cédric is available if needed via this messaging system or via WhatsApp __WHATSAPP_LINE__",
    "",
    "We look forward to meeting you.",
    "",
    "See you soon,",
    "Celine and Cedric",
  );

  return lines.join("\n");
}

function buildArrivalText(reservation) {
  if (reservation.unit_type !== "parking") {
    return [
      `Dear ${reservation.guest_first_name},`,
      "",
      "We are looking forward to welcoming you.",
      "",
      `Reference: ${reservation.public_reference}`,
      `Arrival: ${reservation.check_in_date}`,
      `Departure: ${reservation.check_out_date}`,
      "",
      "If you need assistance before arrival, Cédric is available via this messaging system or via WhatsApp __WHATSAPP_LINE__",
      "",
      "Kind regards,",
      "Celine and Cedric",
    ].join("\n");
  }

  const lines = [
    `Dear ${reservation.guest_first_name},`,
    "",
    "We hope you are well.",
    "",
    'You can find the place by searching for "C&C motorhome/RV/van/camping-car parking space" in Google Maps.',
    "",
    "When you arrive, you can park your vehicle just in front of the garage.",
    "",
    "The terrace on top of the garage is for you.",
    "Red cushions are available for use on the wooden pallets of the terrace. You can find them in the garage. They should just be stored back in the garage before nightfall or in case of rain.",
    "__GARAGE_INSTRUCTIONS__",
    "",
    'For the Wi-Fi in front of the garage, it is the "candc-studio" network. The password is "__WIFI_STUDIO_PASSWORD__".',
    "",
    'On the terrace, the best network is "candc".',
    "Here is the password:",
    "__WIFI_TERRACE_PASSWORD__",
    "",
    "You'll find an electric cable with a normal 220 V Swiss plug (3 pins) under the garage door, or on the right-hand side inside the garage, about 1 m high.",
    "",
    "The water tap is visible near the big gray box, in the corner.",
    "",
    "We do NOT have the infrastructure for blackwater (wastewater from the toilet system). You will need to go to a nearby campsite for that.",
    "",
    "You can take some wood to start a barbecue on the brasero, which is provided if you wish.",
    "",
    "On the left side of the entry, you will find a big gray box. This is for recyclable materials. There are separate options for PET bottles (not all plastics, only recyclable plastic bottles), aluminum cans, and glass bottles. The rest of the box is for dry paper and cardboard.",
    "",
    "You will also find a small green receptacle, which is for food remains. Everything else goes into a trash bag, which needs to be put in the big green container.",
  ];

  if (reservation.wc_shower_requested) {
    lines.push(
      "",
      "Indoor toilet and shower access has been added to your stay. It is available on request when we are on site, usually between 7 a.m. and 9 p.m.",
    );
  } else {
    lines.push(
      "",
      "Access to an indoor toilet and shower is available on request between 7 a.m. and 9 p.m. when we are on site. This optional service is provided for a cleaning fee of CHF 10 for the entire stay. Please contact us to check availability.",
    );
  }

  lines.push(
    "",
    "You can also charge your electric car if you have one, and we are on-site.",
    "We supply a charging cable compatible with the Type 13 socket (Swiss domestic: 220 V, 10 A) and fitted with a Type 2 connector (standard for most electric vehicles). This slow recharging service is available at an additional charge (CHF 15 for 10h, CHF 30 for the whole day or night).",
    "",
    "Upon your arrival and throughout your stay, Cédric will be available to assist you via this messaging system or via WhatsApp __WHATSAPP_LINE__",
    "",
    "We wish you a pleasant stay.",
    "",
    "Kind Regards,",
    "Celine and Cedric",
  );

  return lines.join("\n");
}

function buildModificationText(reservation, deltaAmount, manageLink) {
  const direction = deltaAmount > 0
    ? `An additional payment of ${formatMoney(deltaAmount, reservation.currency)} is required to confirm the change.`
    : deltaAmount < 0
      ? `A refund of ${formatMoney(Math.abs(deltaAmount), reservation.currency)} is due following your change.`
      : "The modification does not change the total amount.";

  return [
    `Dear ${reservation.guest_first_name},`,
    "",
    "Your reservation has been updated.",
    "",
    `Reference: ${reservation.public_reference}`,
    `Arrival: ${reservation.check_in_date}`,
    `Departure: ${reservation.check_out_date}`,
    `Updated total: ${formatMoney(reservation.total_amount, reservation.currency)}`,
    direction,
    "",
    `Manage your reservation: ${manageLink}`,
    "",
    "Kind regards,",
    "Celine and Cedric",
  ].join("\n");
}

function buildCancellationText(reservation) {
  return [
    `Dear ${reservation.guest_first_name},`,
    "",
    "Your reservation has been cancelled.",
    "",
    `Reference: ${reservation.public_reference}`,
    `Cancelled on: ${formatIsoDate(new Date())}`,
    "",
    "If a refund is due, we will process it manually as soon as possible.",
    "",
    "Kind regards,",
    "Celine and Cedric",
  ].join("\n");
}

function buildEmailPayload(type, reservation, config, options = {}) {
  const subjectPrefix = reservation.unit_type === "studio" ? "C&C Studio" : "C&C Parking";
  const manageLink = options.manageToken ? manageUrl(config, options.manageToken) : null;

  switch (type) {
    case "booking_confirmation":
      return {
        subject: `${subjectPrefix} booking confirmation - ${reservation.public_reference}`,
        text: buildConfirmationText(
          reservation,
          manageLink,
          !reservation.wc_shower_requested && reservation.unit_type === "parking",
        ),
      };
    case "booking_modification":
      return {
        subject: `${subjectPrefix} booking updated - ${reservation.public_reference}`,
        text: buildModificationText(reservation, options.deltaAmount || 0, manageLink || "-"),
      };
    case "booking_cancellation":
      return {
        subject: `${subjectPrefix} booking cancelled - ${reservation.public_reference}`,
        text: buildCancellationText(reservation),
      };
    case "arrival_instructions":
      return {
        subject: `${subjectPrefix} arrival information - ${reservation.public_reference}`,
        text: buildArrivalText(reservation),
      };
    default:
      throw new Error(`unknown_email_type:${type}`);
  }
}

export function isEmailConfigured(env) {
  const config = getConfig(env);
  return Boolean(config.resendApiKey && config.emailFrom);
}

export async function sendTransactionalEmail(env, type, reservation, options = {}) {
  const config = getConfig(env);

  if (!isEmailConfigured(env)) {
    throw new Error("email_not_configured");
  }

  const { subject, text } = buildEmailPayload(type, reservation, config, options);
  const to = options.to || reservation.guest_email;
  const cc = options.cc || config.adminNotificationEmail || null;
  const headers = {
    authorization: `Bearer ${config.resendApiKey}`,
    "content-type": "application/json",
  };
  const body = {
    from: config.emailFrom,
    to: [to],
    subject,
    text,
  };

  if (cc) {
    body.cc = [cc];
  }

  if (config.emailReplyTo) {
    body.reply_to = config.emailReplyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`email_send_failed:${response.status}:${await response.text()}`);
  }

  return response.json();
}
