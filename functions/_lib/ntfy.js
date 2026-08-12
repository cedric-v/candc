import { getConfig } from "./env.js";

export function isNtfyConfigured(env) {
  const config = getConfig(env);
  return Boolean(config.ntfyTopicUrl);
}

// The topic URL is often pasted as "ntfy.sh/my-topic" without a scheme.
// fetch() requires an absolute URL, so normalize it here instead of failing
// silently on every send.
export function normalizeTopicUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export async function sendNtfyNotification(env, title, message, options = {}) {
  const config = getConfig(env);
  const topicUrl = normalizeTopicUrl(config.ntfyTopicUrl);

  if (!topicUrl) {
    throw new Error("ntfy_not_configured");
  }

  const headers = { "content-type": "text/plain" };
  if (title) {
    headers["Title"] = title;
  }
  if (options.priority) {
    headers["priority"] = options.priority;
  }
  if (options.tags) {
    headers["tags"] = options.tags;
  }

  const response = await fetch(topicUrl, {
    method: "POST",
    headers,
    body: message,
  });

  if (!response.ok) {
    throw new Error(`ntfy_send_failed:${response.status}:${await response.text()}`);
  }

  return { ok: true };
}
