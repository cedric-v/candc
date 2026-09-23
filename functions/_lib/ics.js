function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatUtcTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function unitNameFromCode(unitCode) {
  return unitCode === "eco-studio" ? "Studio" : "Parking";
}

function pushBlockEvent(lines, { uid, unitCode, startDate, endDate, description }) {
  const unitName = unitNameFromCode(unitCode);

  lines.push(
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtcTimestamp()}`,
    `DTSTART;VALUE=DATE:${startDate.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${endDate.replaceAll("-", "")}`,
    `SUMMARY:${escapeIcsText(`C&C ${unitName} unavailable`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
  );
}

// Flux iCal d'export : réservations directes confirmées + blocages manuels
// créés depuis l'admin. Ces événements sont importés par Booking.com / Airbnb
// pour fermer les mêmes dates de leur côté.
export function buildReservationFeed(reservations, manualBlocks = []) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//C&C//Booking Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const reservation of reservations) {
    const unitName = unitNameFromCode(reservation.unit_code);
    pushBlockEvent(lines, {
      uid: `${reservation.id}@candc.ch`,
      unitCode: reservation.unit_code,
      startDate: reservation.check_in_date,
      endDate: reservation.check_out_date,
      description: `Direct reservation block for ${unitName.toLowerCase()} availability sync.`,
    });
  }

  for (const block of manualBlocks) {
    const note = block.note ? `: ${block.note}` : ".";
    pushBlockEvent(lines, {
      uid: `manual-${block.id}@candc.ch`,
      unitCode: block.unit_code,
      startDate: block.start_date,
      endDate: block.end_date,
      description: `Manual calendar block${note}`,
    });
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
