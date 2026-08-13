// Cookie helpers for the booking flow.
//
// The manage token must not travel in URLs (SumUp redirect_url, query
// strings): those end up in access logs, browser history and Referer headers.
// Instead we park it in a short-lived HttpOnly cookie so the post-payment
// confirmation page can still build the "manage my reservation" link.

export const MANAGE_TOKEN_COOKIE = "candc_manage_token";

export function setManageTokenCookie(headers, token, { secure = false } = {}) {
  const parts = [
    `${MANAGE_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    // Lax (not Strict) so the cookie is still sent on the top-level GET
    // navigation from SumUp back to /booking/confirmation/.
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  headers.append("Set-Cookie", parts.join("; "));
}

export function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = part.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function isSecureRequest(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
