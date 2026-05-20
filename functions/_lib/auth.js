import { getConfig } from "./env.js";

export function hasValidInternalToken(request, env) {
  const config = getConfig(env);

  if (!config.internalSyncToken) {
    return false;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-internal-sync-token");

  let urlToken = null;
  try {
    const url = new URL(request.url);
    urlToken = url.searchParams.get("token") || url.searchParams.get("sync_token");
  } catch {
    // ignore
  }

  return bearerToken === config.internalSyncToken ||
         headerToken === config.internalSyncToken ||
         urlToken === config.internalSyncToken;
}

export function hasValidAdminToken(request, env) {
  const config = getConfig(env);

  if (!config.adminAccessToken) {
    return false;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-admin-token");
  return bearerToken === config.adminAccessToken || headerToken === config.adminAccessToken;
}
