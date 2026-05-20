const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateString(value) {
  return typeof value === "string" && DATE_RE.test(value);
}

export function parseIsoDate(value) {
  if (!isIsoDateString(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return date;
}

export function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDate(date);
}

export function diffNights(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

export function enumerateNights(startDate, endDate) {
  const nights = diffNights(startDate, endDate);
  const result = [];

  for (let index = 0; index < nights; index += 1) {
    result.push(addDays(startDate, index));
  }

  return result;
}

function getTimePartsInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return values;
}

export function getWallClockEpochMsForNow(timeZone) {
  const parts = getTimePartsInZone(new Date(), timeZone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function getWallClockEpochMsForLocalDateTime(isoDate, time = "00:00:00") {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute, second = "00"] = time.split(":").map(Number);

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function isArrivalWithin24Hours(checkInDate, checkInTime, timeZone) {
  const arrivalMs = getWallClockEpochMsForLocalDateTime(checkInDate, checkInTime);
  const nowMs = getWallClockEpochMsForNow(timeZone);
  return arrivalMs - nowMs < 24 * 60 * 60 * 1000;
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function getCurrentIsoDateInZone(timeZone) {
  const parts = getTimePartsInZone(new Date(), timeZone);
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
