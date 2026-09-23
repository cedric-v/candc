import { getManualCalendarBlocksForUnit, getReservationsForIcsFeed, getUnitByFeedToken } from "./db.js";
import { buildReservationFeed } from "./ics.js";
import { notFound, serverError, text } from "./http.js";

// Shared ICS export handler used by both /api/booking/ics/{feedToken}
// and /api/booking/ics/{feedToken}.ics route variants.
export async function onRequestGet(context) {
  try {
    const { params, env } = context;
    const unit = await getUnitByFeedToken(env, params.feedToken);

    if (!unit) {
      return notFound();
    }

    const [reservations, manualBlocks] = await Promise.all([
      getReservationsForIcsFeed(env, unit.id),
      getManualCalendarBlocksForUnit(env, unit.id),
    ]);
    const body = buildReservationFeed(reservations, manualBlocks);

    return text(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Failed to generate ICS feed:", error);
    return serverError("Failed to generate ICS feed");
  }
}
