import { getConfig } from "./env.js";
import { isEmailConfigured } from "./email.js";
import { isNtfyConfigured, sendNtfyNotification } from "./ntfy.js";

// Alerts the site admin (ADMIN_NOTIFICATION_EMAIL, default bonjour@candc.ch)
// when something goes wrong on the booking API. Used on server-error paths
// only (500s, payment-provider failures) — never for normal 400/409 answers,
// so the mailbox is not flooded with business-as-usual events.
//
// Delivery: ntfy push (if configured) + email via Resend (if configured).
// Dedupe: at most one alert per key per window (D1 email_logs, reservation_id
// NULL), so a repeated failing request cannot spam the admin.
//
// All failures inside this module are swallowed: alerting must never mask
// the original error.

const DEDUPE_WINDOW_MINUTES = 30;

function alertEmailType(key) {
  return `admin_alert:${key}`;
}

async function hasRecentAlert(env, key, recipient) {
  if (!env?.DB) {
    return false;
  }

  try {
    const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { results } = await env.DB.prepare(
      `
        SELECT id
        FROM email_logs
        WHERE email_type = ?
          AND recipient = ?
          AND status = 'alerted'
          AND created_at >= ?
        LIMIT 1
      `,
    )
      .bind(alertEmailType(key), recipient, cutoff)
      .all();

    return (results || []).length > 0;
  } catch {
    // Never let dedupe itself fail the alert.
    return false;
  }
}

async function logAlert(env, key, recipient, status) {
  if (!env?.DB) {
    return;
  }

  try {
    await env.DB.prepare(
      `
        INSERT INTO email_logs (
          id, reservation_id, email_type, recipient, status, provider_message_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        crypto.randomUUID(),
        null,
        alertEmailType(key),
        recipient,
        status,
        null,
        new Date().toISOString(),
      )
      .run();
  } catch {
    // Logging is best-effort.
  }
}

export async function sendAdminAlert(
  env,
  { key, subject, message, tags = "alert", priority = "high" },
) {
  const config = getConfig(env);
  const recipient = config.adminNotificationEmail || "bonjour@candc.ch";
  const results = { email: "skipped", ntfy: "skipped" };

  if (await hasRecentAlert(env, key, recipient)) {
    return { ok: true, skipped: true, reason: "already_alerted", results };
  }

  if (isNtfyConfigured(env)) {
    try {
      await sendNtfyNotification(env, subject, message, { tags, priority });
      results.ntfy = "sent";
    } catch (error) {
      results.ntfy = `failed:${error.message}`;
    }
  }

  if (isEmailConfigured(env)) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: config.emailFrom,
          to: [recipient],
          subject,
          text: message,
          ...(config.emailReplyTo ? { reply_to: config.emailReplyTo } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`email_send_failed:${response.status}:${await response.text()}`);
      }

      results.email = "sent";
    } catch (error) {
      results.email = `failed:${error.message}`;
    }
  }

  const delivered = results.email === "sent" || results.ntfy === "sent";
  await logAlert(env, key, recipient, delivered ? "alerted" : "failed");

  return { ok: delivered, results };
}
