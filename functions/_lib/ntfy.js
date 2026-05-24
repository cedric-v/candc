import { getConfig } from "./env.js";

export function isNtfyConfigured(env) {
  const config = getConfig(env);
  return Boolean(config.ntfyTopicUrl);
}

export async function sendNtfyNotification(env, title, message, options = {}) {
  const config = getConfig(env);

  if (!config.ntfyTopicUrl) {
    throw new Error("ntfy_not_configured");
  }

  const headers = { "content-type": "text/plain" };
  if (options.priority) {
    headers["priority"] = options.priority;
  }
  if (options.tags) {
    headers["tags"] = options.tags;
  }

  const response = await fetch(config.ntfyTopicUrl, {
    method: "POST",
    headers,
    body: message,
  });

  if (!response.ok) {
    throw new Error(`ntfy_send_failed:${response.status}:${await response.text()}`);
  }

  return { ok: true };
}
