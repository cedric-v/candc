async function runSync(env) {
  const url = env.SYNC_URL || "https://candc.ch/api/internal/jobs/run";
  const token = env.INTERNAL_SYNC_TOKEN;

  if (!token) {
    throw new Error("Missing INTERNAL_SYNC_TOKEN environment variable.");
  }

  console.log(`Triggering calendar synchronization job at ${url}...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      action: "booking_ics"
    })
  });

  const bodyText = await response.text();
  return {
    status: response.status,
    body: bodyText
  };
}

export default {
  async scheduled(controller, env, ctx) {
    try {
      const res = await runSync(env);
      console.log(`Cron sync complete: status ${res.status}, response: ${res.body}`);
    } catch (err) {
      console.error(`Cron sync failed: ${err.message}`);
    }
  },

  async fetch(request, env, ctx) {
    const urlObj = new URL(request.url);
    const triggerToken = urlObj.searchParams.get("token") || request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!triggerToken || triggerToken !== env.INTERNAL_SYNC_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const res = await runSync(env);
      return new Response(JSON.stringify({
        success: true,
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
