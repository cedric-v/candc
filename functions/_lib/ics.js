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

export function buildReservationFeed(reservations) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//C&C//Booking Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const reservation of reservations) {
    const isStudio = reservation.unit_code === "eco-studio";
    const unitName = isStudio ? "Studio" : "Parking";
    const summary = `C&C ${unitName} unavailable`;
    const description = `Direct reservation block for ${unitName.toLowerCase()} availability sync.`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${reservation.id}@candc.ch`,
      `DTSTAMP:${formatUtcTimestamp()}`,
      `DTSTART;VALUE=DATE:${reservation.check_in_date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${reservation.check_out_date.replaceAll("-", "")}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
