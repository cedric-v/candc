import { getReservationsForIcsFeed, getUnitByFeedToken } from "../../../_lib/db.js";
import { buildReservationFeed } from "../../../_lib/ics.js";
import { notFound, serverError, text } from "../../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    const { params, env } = context;
    let token = params.feedToken;

    if (typeof token === "string" && token.endsWith(".ics")) {
      token = token.slice(0, -4);
    }

    if (!token) {
      return notFound();
    }

    const unit = await getUnitByFeedToken(env, token);

    if (!unit) {
      return notFound();
    }

    const reservations = await getReservationsForIcsFeed(env, unit.id);
    const body = buildReservationFeed(reservations);

    return text(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    return serverError("Failed to generate ICS feed", error.message);
  }
}
