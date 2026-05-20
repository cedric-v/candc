import { getConfig } from "../../../_lib/env.js";
import { getReservationsForIcsFeed, getUnitByCode, getUnitByFeedToken } from "../../../_lib/db.js";
import { buildReservationFeed } from "../../../_lib/ics.js";
import { notFound, serverError, text } from "../../../_lib/http.js";

export async function onRequestGet(context) {
  try {
    const { params, env } = context;
    const config = getConfig(env);
    let unit = await getUnitByFeedToken(env, params.feedToken);

    if (!unit) {
      if (!config.bookingIcsFeedToken || params.feedToken !== config.bookingIcsFeedToken) {
        return notFound();
      }

      unit = await getUnitByCode(env, config.defaultUnitCode);
    }

    const reservations = await getReservationsForIcsFeed(env, unit?.id ?? null);
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
