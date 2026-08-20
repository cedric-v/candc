const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "content-security-policy": [
    "default-src 'self'",
    // Inline scripts/styles are required today by the manage, admin and
    // confirmation pages, and by the cookie banner in the static templates.
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

export async function onRequest(context) {
  // These legacy, language-neutral URLs used to be static noindex pages.
  // Handle them before static asset routing so search engines receive a real
  // permanent redirect even when an old deployment/cache still contains the
  // former HTML fallback.
  const { pathname } = new URL(context.request.url);
  const legacyRedirects = {
    "/parking": "/fr/parking/",
    "/parking/": "/fr/parking/",
    "/eco-studio": "/fr/eco-studio/",
    "/eco-studio/": "/fr/eco-studio/",
  };
  if (legacyRedirects[pathname]) {
    const location = new URL(legacyRedirects[pathname], context.request.url);
    return new Response(null, {
      status: 301,
      headers: {
        Location: location.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const response = await context.next();

  if (response) {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
  }

  return response;
}
