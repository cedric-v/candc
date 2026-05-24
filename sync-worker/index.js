function getAuthHeaders(env) {
  const token = env.INTERNAL_SYNC_TOKEN;

  if (!token) {
    throw new Error("Missing INTERNAL_SYNC_TOKEN environment variable.");
  }

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

async function runJob(env, action) {
  const url = env.SYNC_URL || "https://candc.ch/api/internal/jobs/run";
  console.log(`Triggering ${action} job at ${url}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(env),
    body: JSON.stringify({
      action,
    })
  });

  const bodyText = await response.text();
  return {
    status: response.status,
    body: bodyText
  };
}

function isArrivalEmailWindow(env) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.TIMEZONE || "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return values.hour === 8;
}

function isDepartureEmailWindow(env) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: env.TIMEZONE || "Europe/Zurich",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return values.hour === 18;
}

export default {
  async scheduled(controller, env, ctx) {
    try {
      if (controller.cron === "0 * * * *") {
        const res = await runJob(env, "booking_ics");
        console.log(`Calendar sync complete: status ${res.status}, response: ${res.body}`);
        return;
      }

      if (controller.cron === "5 * * * *") {
        if (!isArrivalEmailWindow(env)) {
          console.log("Skipping arrival email cron outside the 08:00 local window.");
          return;
        }

        const res = await runJob(env, "arrival_emails");
        console.log(`Arrival email cron complete: status ${res.status}, response: ${res.body}`);
        return;
      }

      if (controller.cron === "10 * * * *") {
        if (!isDepartureEmailWindow(env)) {
          console.log("Skipping departure email cron outside the 18:00 local window.");
          return;
        }

        const res = await runJob(env, "departure_emails");
        console.log(`Departure email cron complete: status ${res.status}, response: ${res.body}`);
        return;
      }

      console.log(`No handler configured for cron ${controller.cron}`);
    } catch (err) {
      console.error(`Scheduled job failed: ${err.message}`);
    }
  },

  async fetch(request, env, ctx) {
    const urlObj = new URL(request.url);
    const triggerToken = urlObj.searchParams.get("token") || request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!triggerToken || triggerToken !== env.INTERNAL_SYNC_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const action = urlObj.searchParams.get("action") || "booking_ics";
      const res = await runJob(env, action);
      return new Response(JSON.stringify({
        success: true,
        action,
        status: res.status,
        response: JSON.parse(res.body)
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message
      }, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
