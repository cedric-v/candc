import { formatIsoDate } from "./date.js";

// Validation d'un corps ICS : on exige un vrai document VCALENDAR (début + fin)
// et pas seulement la présence d'une sous-chaîne. Une page d'erreur HTML, un
// portail captif ou une réponse tronquée ne doivent jamais être interprétés
// comme « un calendrier vide », sinon les blocages OTA déjà importés seraient
// supprimés et les dates rouvertes à la vente.
export function isIcsCalendarDocument(body) {
  if (typeof body !== "string" || !body.trim()) {
    return false;
  }

  const head = body.replace(/^\uFEFF/, "").trimStart();
  return head.startsWith("BEGIN:VCALENDAR") && head.includes("END:VCALENDAR");
}

// Téléchargement d'un flux ICS avec timeout : partagé par le cron d'import et
// par la relecture « juste-à-temps » des OTA.
export async function fetchIcsText(url, { timeoutMs = 5000, init = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      ...init,
      headers: {
        accept: "text/calendar,text/plain;q=0.9,*/*;q=0.8",
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ics_fetch_failed:${response.status}`);
    }

    const body = await response.text();

    if (!isIcsCalendarDocument(body)) {
      throw new Error("ics_invalid_body");
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

function unfoldIcsLines(icsText) {
  const rawLines = icsText.replace(/\r\n/g, "\n").split("\n");
  const lines = [];

  for (const rawLine of rawLines) {
    if ((rawLine.startsWith(" ") || rawLine.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
    } else {
      lines.push(rawLine);
    }
  }

  return lines;
}

function parseContentLine(line) {
  const separatorIndex = line.indexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  const rawKey = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [name, ...paramParts] = rawKey.split(";");
  const params = {};

  for (const part of paramParts) {
    const [paramKey, paramValue] = part.split("=");
    params[paramKey] = paramValue;
  }

  return {
    name,
    params,
    value,
  };
}

function parseIcsDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  if (/^\d{8}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
  }

  if (/^\d{8}T\d{6}Z$/.test(rawValue)) {
    return rawValue.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
  }

  const date = new Date(rawValue);
  if (!Number.isNaN(date.getTime())) {
    return formatIsoDate(date);
  }

  return null;
}

export function parseIcsEvents(icsText) {
  const lines = unfoldIcsLines(icsText);
  const events = [];
  let currentEvent = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (currentEvent?.uid && currentEvent?.startDate && currentEvent?.endDate) {
        events.push({
          uid: currentEvent.uid,
          startDate: currentEvent.startDate,
          endDate: currentEvent.endDate,
          summary: currentEvent.summary || null,
          description: currentEvent.description || null,
        });
      }

      currentEvent = null;
      continue;
    }

    if (!currentEvent) {
      continue;
    }

    const content = parseContentLine(line);

    if (!content) {
      continue;
    }

    if (content.name === "UID") {
      currentEvent.uid = content.value;
    } else if (content.name === "SUMMARY") {
      currentEvent.summary = content.value;
    } else if (content.name === "DESCRIPTION") {
      currentEvent.description = content.value;
    } else if (content.name === "DTSTART") {
      currentEvent.startDate = parseIcsDate(content.value);
    } else if (content.name === "DTEND") {
      currentEvent.endDate = parseIcsDate(content.value);
    }
  }

  return dedupeEvents(events);
}

function dedupeEvents(events) {
  const seen = new Set();
  const deduped = [];

  for (const event of events) {
    const key = `${event.uid}:${event.startDate}:${event.endDate}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}
