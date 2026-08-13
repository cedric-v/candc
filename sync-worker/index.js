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
  return currentLocalHour(env) === 8;
}

function isDepartureEmailWindow(env) {
  return currentLocalHour(env) === 18;
}

function isReviewEmailWindow(env) {
  return currentLocalHour(env) === 12;
}

// Fenêtre quotidienne 04:20–04:39 (heure locale) pour l'anonymisation des
// données sensibles (LPD / RGPD). Testée en minutes pour tolérer le jitter
// du cron Cloudflare (contrairement à un test minute-à-minute exact) tout
// en ne se déclenchant qu'une seule fois par jour grâce aux déclenchements
// toutes les 20 min (04:20 entre dans la fenêtre, 04:40 en sort).
function isRetentionWindow(env) {
  return currentLocalHour(env) === 4 && currentLocalMinutes(env) >= 20 && currentLocalMinutes(env) < 40;
}

function currentLocalHour(env) {
  return currentLocalParts(env).hour;
}

function currentLocalMinutes(env) {
  return currentLocalParts(env).minute;
}

function currentLocalParts(env) {
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

  return values;
}

export default {
  // Un seul cron `*/20 * * * *` couvre tous les jobs (limite de 5 crons par
  // compte sur le plan Workers Free, partagée entre tous les workers) :
  //   - `booking_ics` (toutes les 20 min) : import ICS OTA + maintenance des
  //     holds de paiement (rappel, expiration, e-mails) exécutée en premier ;
  //   - e-mails d'arrivée / départ / avis : déclenchés toutes les 20 min mais
  //     filtrés en JS sur la fenêtre locale (08:00 / 18:00 / 12:00) ;
  //     la déduplication par `email_logs` évite tout envoi en double.
  async scheduled(controller, env, ctx) {
    try {
      const sync = await runJob(env, "booking_ics");
      console.log(`Calendar sync + hold maintenance: status ${sync.status}, response: ${sync.body}`);

      if (isArrivalEmailWindow(env)) {
        const res = await runJob(env, "arrival_emails");
        console.log(`Arrival email cron complete: status ${res.status}, response: ${res.body}`);
      }

      if (isDepartureEmailWindow(env)) {
        const res = await runJob(env, "departure_emails");
        console.log(`Departure email cron complete: status ${res.status}, response: ${res.body}`);
      }

      if (isReviewEmailWindow(env)) {
        const res = await runJob(env, "review_emails");
        console.log(`Review email cron complete: status ${res.status}, response: ${res.body}`);
      }

      // Vérification de santé du funnel de réservation (disponibilité +
      // tarif) toutes les 2 heures (heure paire, minute 20) ; en cas
      // d'échec, un e-mail / push admin est envoyé par le job lui-même.
      if (currentLocalHour(env) % 2 === 0 && currentLocalMinutes(env) === 20) {
        const res = await runJob(env, "funnel_check");
        console.log(`Funnel health check complete: status ${res.status}, response: ${res.body}`);
      }

      // Anonymisation quotidienne (fenêtre 04:20–04:39 heure locale) des
      // données sensibles des voyageurs au-delà de la période de
      // conservation (LPD / RGPD) ; idempotent et sans effet si rien n'est
      // à purger.
      if (isRetentionWindow(env)) {
        const res = await runJob(env, "retention");
        console.log(`Sensitive data retention complete: status ${res.status}, response: ${res.body}`);
      }
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
