import { getConfig } from "./env.js";
import { constantTimeEqual, sha256Hex } from "./security.js";

async function tokensMatch(provided, expected) {
  if (!expected || !provided) {
    return false;
  }

  // Hash both sides first so the comparison time does not depend on the
  // length of the provided value, then compare the digests in constant time.
  const providedHash = await sha256Hex(provided);
  const expectedHash = await sha256Hex(expected);
  return constantTimeEqual(providedHash, expectedHash);
}

export async function hasValidInternalToken(request, env) {
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

  return (
    (await tokensMatch(bearerToken, config.internalSyncToken)) ||
    (await tokensMatch(headerToken, config.internalSyncToken)) ||
    (await tokensMatch(urlToken, config.internalSyncToken))
  );
}

export async function hasValidAdminToken(request, env) {
  const config = getConfig(env);

  if (!config.adminAccessToken) {
    return false;
  }

  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerToken = request.headers.get("x-admin-token");
  return (
    (await tokensMatch(bearerToken, config.adminAccessToken)) ||
    (await tokensMatch(headerToken, config.adminAccessToken))
  );
}
