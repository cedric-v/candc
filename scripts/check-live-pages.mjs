#!/usr/bin/env node
/**
 * Live HTTP check of key pages after deployment.
 *
 * Fetches the public URLs below and asserts, for each:
 *   - HTTP status 2xx (catches 404s and misrouted deploys)
 *   - an expected content-type family (text/html, image/*, ...)
 *   - for the homepage, a minimal content marker (catches CDN/error pages
 *     that would otherwise still return 200)
 *
 * Usage:
 *   npm run check:pages
 *   BASE_URL=https://candc.ch npm run check:pages
 *
 * Exit codes: 0 = all pages OK, 1 = at least one page failed.
 */
const BASE_URL = (process.env.BASE_URL || "https://candc.ch").replace(/\/+$/, "");
const TIMEOUT_MS = 30000;

const LANGS = ["fr", "de", "en", "es", "pt", "it", "nl"];

const CHECKS = [
  // Pages (status + content-type + optional marker)
  { path: "/", type: "html" }, // 301 -> /fr/ (followed)
  ...LANGS.map((lang) => ({ path: `/${lang}/`, type: "html" })),
  { path: "/fr/parking/", type: "html" },
  { path: "/fr/parking/booking/", type: "html" },
  { path: "/fr/eco-studio/", type: "html" },
  { path: "/fr/eco-studio/booking/", type: "html" },
  { path: "/fr/contact/", type: "html" },
  { path: "/fr/location/", type: "html" },
  { path: "/fr/about/", type: "html" },
  { path: "/fr/legal/", type: "html" },
  { path: "/en/legal/", type: "html" }, // served via _redirects -> /fr/legal/
  // Agent / SEO surfaces
  { path: "/sitemap.xml", type: "xml" },
  { path: "/robots.txt", type: "text" },
  { path: "/llms.txt", type: "text" },
  { path: "/.well-known/site-context.json", type: "json" },
  // Assets (images must be served, not 404)
  { path: "/favicon.ico", type: "image" },
  { path: "/assets/img/logo-cc.jpg", type: "image" },
  { path: "/assets/css/styles.css", type: "css" },
];

// Homepage marker: assert the real homepage content is served (not a 404 /
// error page or an empty shell). Queried on the fr homepage after redirect.
const HOME_MARKER = "C & C";

const typePrefix = {
  html: "text/html",
  xml: "xml",
  text: "text/plain",
  json: "json",
  image: "image/",
  css: "text/css",
};

let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`✗ ${message}`);
}

async function check({ path: urlPath, type }) {
  const url = `${BASE_URL}${urlPath}`;
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    fail(`GET ${url} unreachable: ${error.message}`);
    return;
  }
  const durationMs = Date.now() - startedAt;
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  const statusOk = res.ok;
  const typeOk = contentType.includes(typePrefix[type] || "");

  let markerOk = true;
  if (type === "html" && urlPath === "/") {
    try {
      const text = await res.text();
      markerOk = text.includes(HOME_MARKER);
    } catch {
      markerOk = false;
    }
  }

  if (!statusOk || !typeOk || !markerOk) {
    const why = [
      !statusOk ? `HTTP ${res.status}` : null,
      !typeOk ? `content-type "${contentType}" (expected ${typePrefix[type]})` : null,
      !markerOk ? `missing homepage marker "${HOME_MARKER}"` : null,
    ]
      .filter(Boolean)
      .join(", ");
    fail(`GET ${url}: ${why} (${durationMs}ms)`);
    return;
  }
  console.log(`✓ ${url} -> HTTP ${res.status} ${contentType} (${durationMs}ms)`);
}

console.log(`🌐 Live pages check on ${BASE_URL}...\n`);

await Promise.all(CHECKS.map(check));

console.log("\n" + "=".repeat(50));
if (failures === 0) {
  console.log(`✅ Live pages check passed (${CHECKS.length} URLs).`);
  process.exit(0);
}
console.log(`❌ ${failures} check(s) failed.`);
process.exit(1);
