import { getConfig } from "./env.js";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function toBase64Url(input) {
  let bytes;

  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwt(unsignedJwt, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt),
  );

  return `${unsignedJwt}.${toBase64Url(signature)}`;
}

async function getAccessToken(env) {
  const config = getConfig(env);

  if (!config.googleServiceAccountEmail || !config.googleServiceAccountPrivateKey) {
    throw new Error("google_calendar_not_configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = toBase64Url(
    JSON.stringify({
      iss: config.googleServiceAccountEmail,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: GOOGLE_OAUTH_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  );
  const assertion = await signJwt(`${header}.${claimSet}`, config.googleServiceAccountPrivateKey);

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`google_oauth_failed:${response.status}:${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

function buildDescription(reservation) {
  const lines = [
    `Reference: ${reservation.public_reference}`,
    `Guest: ${reservation.guest_first_name} ${reservation.guest_last_name}`,
    `Email: ${reservation.guest_email}`,
    `Phone: ${reservation.guest_phone || "-"}`,
    `Unit: ${reservation.unit_display_name || reservation.unit_code}`,
    `Adults: ${reservation.adults}`,
    `Children: ${reservation.children}`,
    `Payment status: ${reservation.payment_status || "-"}`,
    `Reservation status: ${reservation.status}`,
    `Total: ${reservation.total_amount} ${reservation.currency}`,
  ];

  if (reservation.vehicle_type) {
    lines.push(`Vehicle: ${reservation.vehicle_type}`);
  }

  if (reservation.unit_type === "parking") {
    lines.push(`WC/Shower requested: ${reservation.wc_shower_requested ? "yes" : "no"}`);
    lines.push(`WC/Shower confirmed: ${reservation.wc_shower_confirmed ? "yes" : "no"}`);
  }

  if (reservation.remarks) {
    lines.push(`Remarks: ${reservation.remarks}`);
  }

  return lines.join("\n");
}

function buildEventPayload(reservation) {
  const summaryPrefix = reservation.unit_type === "parking" ? "Parking" : "Studio";

  return {
    summary: `${summaryPrefix} | ${reservation.guest_first_name} ${reservation.guest_last_name}`,
    description: buildDescription(reservation),
    start: {
      date: reservation.check_in_date,
      timeZone: "Europe/Zurich",
    },
    end: {
      date: reservation.check_out_date,
      timeZone: "Europe/Zurich",
    },
    extendedProperties: {
      private: {
        reservationId: reservation.id,
        publicReference: reservation.public_reference,
        unitCode: reservation.unit_code,
        paymentStatus: reservation.payment_status || "",
      },
    },
  };
}

export function isGoogleCalendarConfigured(env) {
  const config = getConfig(env);
  return Boolean(
    config.googleCalendarId &&
      config.googleServiceAccountEmail &&
      config.googleServiceAccountPrivateKey,
  );
}

export async function upsertReservationEvent(env, reservation) {
  const config = getConfig(env);

  if (!config.googleCalendarId) {
    throw new Error("google_calendar_not_configured");
  }

  const accessToken = await getAccessToken(env);
  const body = buildEventPayload(reservation);
  const eventId = reservation.google_calendar_event_id;
  const calendarId = encodeURIComponent(config.googleCalendarId);

  if (eventId) {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error(`google_calendar_update_failed:${response.status}:${await response.text()}`);
    }

    return response.json();
  }

  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`google_calendar_insert_failed:${response.status}:${await response.text()}`);
  }

  return response.json();
}
