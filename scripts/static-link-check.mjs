#!/usr/bin/env node
/**
 * Static broken-link and image checker.
 *
 * Crawls the Eleventy output (_site/) and verifies, for every page:
 *   - every internal href/src/srcset target resolves to an existing file,
 *     honoring the Cloudflare _redirects rules (e.g. / -> /fr/,
 *     /en/legal/ -> /fr/legal/). A target that only exists via a redirect
 *     is considered valid once its final target exists.
 *   - every <img> declares src, alt and width/height (anti-CLS)
 *   - og:image / twitter:image assets exist
 *
 * Run:   npm run test:links   (also part of `npm test`)
 * Exit:  0 = ok, 1 = at least one error (warnings do not fail the build)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, "..", "_site");
const BASE_URL = "https://candc.ch";
const SITE_HOSTS = new Set(["candc.ch", "www.candc.ch"]);

const errors = [];
const warnings = [];

function logError(pageUrl, target, reason) {
  errors.push(`${pageUrl} -> ${target}: ${reason}`);
}
function logWarning(pageUrl, target, reason) {
  warnings.push(`${pageUrl} -> ${target}: ${reason}`);
}

/* ------------------------------------------------------------------ */
/* _redirects support                                                  */
/* ------------------------------------------------------------------ */

function loadRedirects() {
  const file = path.join(SITE_DIR, "_redirects");
  if (!fs.existsSync(file)) return [];
  const rules = [];
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    rules.push({ from: parts[0], to: parts[1], status: parts[2] || "200" });
  }
  return rules;
}

/** Exact match first, then longest prefix match for splat (*) rules. */
function matchRedirect(rules, pathname) {
  for (const r of rules) {
    if (!r.from.includes("*") && r.from === pathname) return r;
  }
  let best = null;
  for (const r of rules) {
    if (!r.from.includes("*")) continue;
    const prefix = r.from.slice(0, r.from.indexOf("*"));
    if (pathname.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
      best = { ...r, prefix, splat: pathname.slice(prefix.length) };
    }
  }
  return best;
}

function resolveRedirectTarget(rule) {
  if (!rule) return null;
  let to = rule.to;
  if (rule.splat !== undefined) to = to.replace(":splat", rule.splat);
  if (/^https?:\/\//i.test(to)) {
    try {
      const u = new URL(to);
      if (!SITE_HOSTS.has(u.hostname)) return null; // external, cannot verify locally
      return u.pathname;
    } catch {
      return null;
    }
  }
  return to;
}

/* ------------------------------------------------------------------ */
/* Target resolution on disk                                           */
/* ------------------------------------------------------------------ */

function fileExists(rel) {
  return fs.existsSync(rel) && fs.statSync(rel).isFile();
}
function dirExists(rel) {
  return fs.existsSync(rel) && fs.statSync(rel).isDirectory();
}

function targetExists(pathname, rules, seen = new Set(), depth = 0) {
  if (depth > 8 || seen.has(pathname)) return false;
  seen.add(pathname);

  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    /* keep raw on malformed percent-encoding */
  }
  const rel = path.join(SITE_DIR, decoded);

  if (pathname.endsWith("/")) {
    if (fileExists(path.join(rel, "index.html"))) return true;
  } else {
    if (fileExists(rel)) return true;
    if (dirExists(rel)) return fileExists(path.join(rel, "index.html"));
    if (fileExists(`${rel}.html`)) return true;
    if (fileExists(path.join(rel, "index.html"))) return true;
  }

  const rule = matchRedirect(rules, pathname);
  if (rule) {
    const to = resolveRedirectTarget(rule);
    if (to) return targetExists(to, rules, seen, depth + 1);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* URL extraction / normalization                                      */
/* ------------------------------------------------------------------ */

function pageUrlPath(file) {
  const rel = path.relative(SITE_DIR, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}

/** Returns a root-relative pathname for local targets, or null when the
 *  URL is external / empty / non-navigable (mailto, tel, data, #fragment...). */
function normalizeUrl(raw, pageUrlPathname) {
  const value = (raw || "").trim();
  if (!value || value.startsWith("#")) return null;
  if (/^(mailto|tel|sms|data|javascript|blob|about|file):/i.test(value)) return null;

  const base = `${BASE_URL}${pageUrlPathname.endsWith("/") ? pageUrlPathname : `${pageUrlPathname}/`}`;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!SITE_HOSTS.has(url.hostname)) return null; // external link
  return url.pathname || "/";
}

function srcsetUrls(value) {
  const entries = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      entries.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) entries.push(current);
  return entries.map((e) => e.trim().split(/\s+/)[0]).filter(Boolean);
}

function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m;
  while ((m = re.exec(attrStr))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/* ------------------------------------------------------------------ */
/* Per-tag validation                                                  */
/* ------------------------------------------------------------------ */

function checkTarget(page, rawUrl, rules, kind, reason = null) {
  const pathname = normalizeUrl(rawUrl, page.url);
  if (!pathname) return; // external / anchor / protocol — out of scope
  if (!targetExists(pathname, rules)) {
    logError(page.url, pathname, `${kind} missing${reason ? ` (${reason})` : ""}`);
  }
}

function checkImg(page, attrs, rules) {
  const src = attrs.src;
  if (!("src" in attrs)) {
    logError(page.url, "<img>", "missing src attribute");
    return;
  }
  if (!src) {
    // src="" is a JS-filled placeholder (e.g. lightbox) — informational only
    logWarning(page.url, "<img>", "empty src attribute (JS placeholder?)");
    return;
  }
  checkTarget(page, src, rules, "image");

  if (!("alt" in attrs)) {
    logWarning(page.url, src, "<img> missing alt attribute");
  }
  if (!attrs.width || !attrs.height) {
    logError(page.url, src, "<img> missing width/height attributes (anti-CLS)");
  }
  if (attrs.srcset) {
    for (const u of srcsetUrls(attrs.srcset)) {
      checkTarget(page, u, rules, "image (srcset)");
    }
  }
}

function checkPage(file, rules) {
  const url = pageUrlPath(file);
  const page = { file, url };
  const html = fs.readFileSync(file, "utf8");
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m;

  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);

    switch (tag) {
      case "a":
        if (attrs.href) checkTarget(page, attrs.href, rules, "link");
        break;
      case "link":
        if (attrs.href) checkTarget(page, attrs.href, rules, "link");
        break;
      case "script":
        if (attrs.src) checkTarget(page, attrs.src, rules, "script");
        break;
      case "iframe":
        if (attrs.src) checkTarget(page, attrs.src, rules, "iframe");
        break;
      case "img":
        checkImg(page, attrs, rules);
        break;
      case "source":
        if (attrs.src) checkTarget(page, attrs.src, rules, "image (source)");
        if (attrs.srcset) {
          for (const u of srcsetUrls(attrs.srcset)) {
            checkTarget(page, u, rules, "image (srcset)");
          }
        }
        break;
      case "video":
      case "audio":
        if (attrs.src) checkTarget(page, attrs.src, rules, `${tag} source`);
        if (attrs.poster) checkTarget(page, attrs.poster, rules, "video poster");
        break;
      case "meta": {
        const prop = attrs.property || attrs.name || "";
        // og:image / twitter:image only — NOT og:image:width|height|type
        if (/^(og:image|og:image:url|og:image:secure_url|twitter:image)$/.test(prop) && attrs.content) {
          checkTarget(page, attrs.content, rules, "og:image");
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

console.log("🔗 Static link & image check...\n");

if (!fs.existsSync(SITE_DIR)) {
  console.error('❌ Build directory not found. Run "npm run build" first.');
  process.exit(1);
}

const rules = loadRedirects();
const pages = fs
  .readdirSync(SITE_DIR, { recursive: true })
  .filter((f) => typeof f === "string" && f.endsWith(".html"))
  .map((f) => path.join(SITE_DIR, f))
  .filter((f) => path.basename(f) !== "404.html"); // error page is not crawled

for (const file of pages) {
  checkPage(file, rules);
}

const summary = { links: 0, images: 0 };
for (const e of errors) {
  if (/ -> .*: (image|og:image)/.test(e)) summary.images += 1;
  else summary.links += 1;
}

console.log(`  ✓ ${pages.length} pages crawled`);
console.log(`  ✓ ${rules.length} _redirects rule(s) loaded`);

console.log("\n" + "=".repeat(50));
if (errors.length === 0) {
  console.log("✅ Static link & image check passed!");
  if (warnings.length > 0) {
    // Collapse identical warnings (e.g. the same JS-lightbox pattern on
    // every language page) into a single line.
    const counts = new Map();
    for (const w of warnings) counts.set(w, (counts.get(w) || 0) + 1);
    console.log(`\n⚠️  Warnings (${warnings.length}, ${counts.size} unique):`);
    for (const [w, n] of counts) {
      console.log(`  - ${w}${n > 1 ? ` (×${n})` : ""}`);
    }
  }
  process.exit(0);
} else {
  console.log(`\n❌ Errors (${errors.length}):`);
  const shown = errors.slice(0, 60);
  shown.forEach((e) => console.log(`  - ${e}`));
  if (errors.length > shown.length) {
    console.log(`  … and ${errors.length - shown.length} more`);
  }
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
  process.exit(1);
}
