export default {
  async scheduled(controller, env, ctx) {
    const url = env.SYNC_URL || "https://candc.ch/api/internal/jobs/run";
    const token = env.INTERNAL_SYNC_TOKEN;

    if (!token) {
      console.error("Missing INTERNAL_SYNC_TOKEN environment variable.");
      return;
    }

    console.log(`Triggering calendar synchronization job at ${url}...`);

    try {
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
      console.log(`Synchronization endpoint response status: ${response.status}`);
      console.log(`Response body: ${bodyText}`);
    } catch (err) {
      console.error(`Failed to execute synchronization request: ${err.message}`);
    }
  }
};
