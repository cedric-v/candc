#!/usr/bin/env node
/**
 * scripts/gsc.mjs — requêtes en LECTURE SEULE vers Google Search Console.
 *
 * Utilise la clé de compte de service (jamais committée) pour obtenir un
 * token OAuth2 (JWT RS256 signé localement, zéro dépendance externe).
 *
 * Usage :
 *   node scripts/gsc.mjs sites                                   # liste les propriétés accessibles
 *   node scripts/gsc.mjs performance --site <url> [--days 28]    # top requêtes/pages/pays/appareils
 *   node scripts/gsc.mjs sitemaps --site <url>                   # état des sitemaps soumis
 *   node scripts/gsc.mjs inspect --site <url> --url <path>       # inspection d'une URL précise
 *   node scripts/gsc.mjs pages --site <url> [--days 28]          # top pages
 *
 * Options communes :
 *   --key <path>   chemin de la clé (défaut : GSC_KEY env, sinon
 *                  ~/.config/candc/gsc-service-account.json)
 *   --days N       fenêtre pour les rapports (défaut 28)
 *   --json         sortie brute JSON (sinon résumé lisible)
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";
const INSPECT_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

/* ------------------------------------------------------------------ */
/* Résolution de la clé de service                                     */
/* ------------------------------------------------------------------ */
function resolveKeyPath() {
  const flagIdx = process.argv.indexOf("--key");
  if (flagIdx !== -1 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1];
  if (process.env.GSC_KEY) return process.env.GSC_KEY;
  const candidates = [join(homedir(), ".config", "candc", "gsc-service-account.json")];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error(
      "Clé introuvable. Passez --key <chemin>, définissez GSC_KEY, ou déposez la clé dans ~/.config/candc/gsc-service-account.json",
    );
    process.exit(2);
  }
  return found;
}

async function getAccessToken(keyPath) {
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  if (!key.client_email || !key.private_key) {
    throw new Error("Clé invalide : client_email / private_key manquants");
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signingInput = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), key.private_key);
  const jwt = `${signingInput}.${signature.toString("base64url")}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Token OAuth2 refusé (${res.status}) : ${await res.text()}`);
  return (await res.json()).access_token;
}

/* ------------------------------------------------------------------ */
/* Petits utilitaires                                                  */
/* ------------------------------------------------------------------ */
function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function enc(s) {
  return encodeURIComponent(s);
}

function fmtNum(n) {
  return Number(n).toLocaleString("fr-CH");
}

async function api(token, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API GSC ${res.status} : ${await res.text()}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Rapports                                                            */
/* ------------------------------------------------------------------ */
async function reportPerformance(token, site, days, json) {
  const body = {
    startDate: isoDaysAgo(days),
    endDate: todayIso(),
    dimensions: ["query", "page", "country", "device"],
    rowLimit: 50,
  };
  const data = await api(token, `/sites/${enc(site)}/searchAnalytics/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (json || hasFlag("--json")) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rows = data.rows || [];
  const total = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + (r.clicks || 0),
      impressions: acc.impressions + (r.impressions || 0),
    }),
    { clicks: 0, impressions: 0 },
  );

  console.log(`\n📊 Performance ${site} — ${isoDaysAgo(days)} → ${todayIso()}`);
  console.log(`   ${fmtNum(total.clicks)} clics · ${fmtNum(total.impressions)} impressions\n`);

  // Regrouper par requête
  const byQuery = new Map();
  for (const r of rows) {
    const q = r.keys[0];
    const cur = byQuery.get(q) || { clicks: 0, impressions: 0, position: 0, count: 0 };
    cur.clicks += r.clicks || 0;
    cur.impressions += r.impressions || 0;
    cur.position += (r.position || 0) * (r.clicks || 0);
    cur.count += r.clicks || 0;
    byQuery.set(q, cur);
  }
  const topQueries = [...byQuery.entries()]
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 15);
  console.log("🔑 Top requêtes :");
  console.log("   " + ["requête", "clics", "imp.", "CTR", "pos."].join("\t"));
  for (const [q, v] of topQueries) {
    const avgPos = v.count ? (v.position / v.count).toFixed(1) : "-";
    const ctr = v.impressions ? ((v.clicks / v.impressions) * 100).toFixed(1) : "-";
    console.log(`   ${q.slice(0, 40).padEnd(42)} ${fmtNum(v.clicks).padStart(4)} ${fmtNum(v.impressions).padStart(6)} ${String(ctr).padStart(4)}% ${avgPos}`);
  }
  console.log("");
}

async function reportSitemaps(token, site, json) {
  const data = await api(token, `/sites/${enc(site)}/sitemaps`);
  if (json || hasFlag("--json")) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(`\n🗺️  Sitemaps ${site}`);
  for (const s of data.sitemap || []) {
    const errors = Number(s.errors || 0);
    const warnings = Number(s.warnings || 0);
    const indexed = Number(s.contents?.[0]?.indexed || 0);
    const submitted = Number(s.contents?.[0]?.submitted || 0);
    console.log(
      `   ${s.path}\n      soumis: ${s.lastSubmitted || "-"} · téléchargé: ${s.lastDownloaded || "-"}` +
        `\n      URLs soumises: ${submitted} · indexées: ${indexed}` +
        `\n      erreurs: ${errors} · avertissements: ${warnings}` +
        `\n      état: ${s.isPending ? "en attente" : errors ? "ERREURS" : warnings ? "avertissements" : "ok"}`,
    );
  }
  console.log("");
}

async function inspectUrl(token, site, urlPath, json) {
  const inspectionUrl = urlPath.startsWith("http") ? urlPath : `https://${site.replace(/^sc-domain:/, "").replace(/\/$/, "")}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`;
  const body = { inspectionUrl, siteUrl: site };
  const res = await fetch(INSPECT_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Inspection ${res.status} : ${await res.text()}`);
  const data = await res.json();

  if (json || hasFlag("--json")) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const r = data.inspectionResult || {};
  const i = r.indexStatusResult || {};
  console.log(`\n🔎 ${inspectionUrl}`);
  console.log(`   indexation : ${i.verdict || "-"} (${i.coverageState || "-"})`);
  if (i.robotsTxtState) console.log(`   robots.txt : ${i.robotsTxtState}`);
  if (i.indexingState) console.log(`   état : ${i.indexingState}`);
  if (i.pageFetchState) console.log(`   fetch : ${i.pageFetchState}`);
  if (i.googleCanonical) console.log(`   canonique Google : ${i.googleCanonical}`);
  if (i.userCanonical) console.log(`   canonique déclarée : ${i.userCanonical}`);
  if (i.crawledAs) console.log(`   explorée comme : ${i.crawledAs}`);
  if (i.lastCrawlTime) console.log(`   dernière exploration : ${i.lastCrawlTime}`);
  const m = r.mobileUsabilityResult;
  if (m && m.verdict) console.log(`   mobile : ${m.verdict}`);
  const rv = r.richResultsResult;
  if (rv && rv.verdict) console.log(`   rich results : ${rv.verdict} (${(rv.detectedItems || []).length} éléments détectés)`);
  console.log("");
}

/* ------------------------------------------------------------------ */
/* Audit d'indexation de toutes les URLs du sitemap                    */
/* ------------------------------------------------------------------ */
async function auditSite(token, site, { local = false, sitemapUrl = null, concurrency = 4 } = {}) {
  let xml;
  if (local) {
    const localPath = join(process.cwd(), "_site", "sitemap.xml");
    if (!existsSync(localPath)) throw new Error(`Sitemap local introuvable : ${localPath}`);
    xml = readFileSync(localPath, "utf8");
  } else {
    const domain = site.replace(/^sc-domain:/, "").replace(/\/+$/, "");
    const url =
      sitemapUrl ||
      (site.startsWith("https://") ? `${site.replace(/\/+$/, "")}/sitemap.xml` : `https://${domain}/sitemap.xml`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sitemap ${url} → HTTP ${res.status}`);
    xml = await res.text();
  }

  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!urls.length) throw new Error("Aucune URL trouvée dans le sitemap");
  console.log(`\n🔍 Audit d'indexation — ${urls.length} URLs (${site})`);

  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const url = urls[idx++];
      try {
        const res = await fetch(INSPECT_API, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inspectionUrl: url, siteUrl: site }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const r = data.inspectionResult || {};
        const i = r.indexStatusResult || {};
        results.push({
          url,
          verdict: i.verdict || "VERDICT_UNSPECIFIED",
          state: i.coverageState || "",
          reason: i.indexingState || "",
        });
      } catch (e) {
        results.push({ url, verdict: "ERROR", state: "", reason: e.message });
      }
      await new Promise((r) => setTimeout(r, 120)); // léger throttling (quotas API)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const groups = { PASS: [], PARTIAL: [], NEUTRAL: [], FAIL: [], VERDICT_UNSPECIFIED: [], ERROR: [] };
  for (const r of results) {
    if (groups[r.verdict]) groups[r.verdict].push(r);
    else groups.ERROR.push(r);
  }
  const icon = { PASS: "✅", PARTIAL: "🟡", NEUTRAL: "⚪", FAIL: "🔴", VERDICT_UNSPECIFIED: "❓", ERROR: "💥" };
  for (const [verdict, list] of Object.entries(groups)) {
    if (!list.length) continue;
    console.log(`\n${icon[verdict]} ${verdict} — ${list.length} URL(s)`);
    for (const r of list) {
      const extra = r.reason && r.reason !== r.state ? `  ${r.reason}` : "";
      console.log(`   ${r.url}${r.state ? `  [${r.state}]` : ""}${extra}`);
    }
  }

  const indexed = groups.PASS.length;
  const total = results.length;
  console.log(`\n📈 Taux d'indexation : ${indexed}/${total} (${total ? ((indexed / total) * 100).toFixed(0) : 0}%)`);
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */
async function main() {
  const cmd = process.argv[2];
  const keyPath = resolveKeyPath();
  const token = await getAccessToken(keyPath);
  const json = hasFlag("--json");

  if (cmd === "sites") {
    const data = await api(token, "/sites");
    if (json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    console.log("\n🌐 Propriétés accessibles :");
    for (const s of data.siteEntry || []) {
      console.log(`   ${s.siteUrl}  [${s.permissionLevel || "-"}]`);
    }
    console.log("");
    return;
  }

  const site = flag("--site");
  if (!site) {
    console.error("Paramètre --site <url> requis (ex. https://candc.ch/ ou sc-domain:...).");
    process.exit(2);
  }

  const days = Number(flag("--days", "28"));
  switch (cmd) {
    case "performance":
      await reportPerformance(token, site, days, json);
      break;
    case "pages": {
      const data = await api(token, `/sites/${enc(site)}/searchAnalytics/query`, {
        method: "POST",
        body: JSON.stringify({
          startDate: isoDaysAgo(days),
          endDate: todayIso(),
          dimensions: ["page"],
          rowLimit: 50,
        }),
      });
      if (json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      console.log(`\n📄 Pages ${site} — ${isoDaysAgo(days)} → ${todayIso()}`);
      for (const r of data.rows || []) {
        console.log(`   ${String(r.clicks || 0).padStart(4)} clics · ${String(r.impressions || 0).padStart(6)} imp. · ${((r.position || 0)).toFixed(1).padStart(5)} pos  ${r.keys[0]}`);
      }
      console.log("");
      break;
    }
    case "sitemaps":
      await reportSitemaps(token, site, json);
      break;
    case "inspect":
      await inspectUrl(token, site, flag("--url"), json);
      break;
    case "audit":
      await auditSite(token, site, {
        local: hasFlag("--local"),
        sitemapUrl: flag("--sitemap"),
        concurrency: Number(flag("--jobs", "4")),
      });
      break;
    default:
      console.error(`Commande inconnue : "${cmd}".\n\n` + [
        "Usage :",
        "  node scripts/gsc.mjs sites",
        "  node scripts/gsc.mjs performance --site <url> [--days 28]",
        "  node scripts/gsc.mjs pages --site <url> [--days 28]",
        "  node scripts/gsc.mjs sitemaps --site <url>",
        "  node scripts/gsc.mjs inspect --site <url> --url <path>",
        "  node scripts/gsc.mjs audit --site <url> [--local] [--sitemap <url>] [--jobs N]",
      ].join("\n"));
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
