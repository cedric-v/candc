import { formatIsoDate } from "./date.js";

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
