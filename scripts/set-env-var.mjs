#!/usr/bin/env node
/**
 * Safely set ONE plain-text environment variable on the Cloudflare Pages
 * project via the API, using a merge PATCH (same pattern as
 * `wrangler pages secret put`). Other variables — including the values of
 * the secrets — are left untouched.
 *
 * WHY THIS EXISTS
 * --------------
 * Editing environment variables in the Cloudflare dashboard rewrites the
 * whole env_vars map and stores secrets with EMPTY values, silently wiping
 * them. That is the root cause of the recurring "Réservation créée, mais le
 * paiement n'est pas encore configuré" bug. Use this script instead of the
 * dashboard for any plain-text variable change:
 *
 *   node scripts/set-env-var.mjs KEY VALUE [--preview]
 *   node scripts/set-env-var.mjs REVIEW_LINK_PARKING "https://g.page/r/.../review"
 *
 * After any change, deploy (push to main) and verify:
 *   npm run check:payment
 *
 * Requires the wrangler OAuth token (any recent `npx wrangler ...` command
 * refreshes it automatically).
 */
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "0bf811c45bce0791347e92465f3e06f8";
const PROJECT = process.env.PAGES_PROJECT || "candc-ch";

function findWranglerConfig() {
  const candidates = [
    process.env.WRANGLER_CONFIG,
    join(homedir(), "Library", "Preferences", ".wrangler", "config", "default.toml"),
    join(homedir(), ".config", ".wrangler", "config", "default.toml"),
    join(homedir(), ".wrangler", "config", "default.toml"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readOAuthToken(configPath) {
  const toml = readFileSync(configPath, "utf8");
  const match = toml.match(/^\s*oauth_token\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const [key, value, ...rest] = process.argv.slice(2);
const isPreview = rest.includes("--preview");
const environment = isPreview ? "preview" : "production";

if (!key || value === undefined) {
  fail("Usage: node scripts/set-env-var.mjs KEY VALUE [--preview]");
}

const configPath = findWranglerConfig();
if (!configPath) {
  fail("Wrangler config not found. Run any `npx wrangler` command once to log in.");
}
const token = readOAuthToken(configPath);
if (!token) {
  fail(`No oauth_token found in ${configPath}. Run ` + "`npx wrangler whoami` once to refresh it.");
}

const api = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;

const projectResponse = await fetch(api, { headers: { authorization: `Bearer ${token}` } });
const projectBody = await projectResponse.json();
if (!projectResponse.ok) {
  fail(`Cannot fetch project ${PROJECT}: ${JSON.stringify(projectBody.errors || projectBody)}`);
}
const project = projectBody.result;
const configHash =
  project.deployment_configs?.[environment]?.wrangler_config_hash || undefined;

const patchBody = {
  deployment_configs: {
    [environment]: {
      env_vars: {
        [key]: { value, type: "plain_text" },
      },
      ...(configHash ? { wrangler_config_hash: configHash } : {}),
    },
  },
};

const patchResponse = await fetch(api, {
  method: "PATCH",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(patchBody),
});
const patchBody2 = await patchResponse.json();
if (!patchResponse.ok) {
  fail(`PATCH failed: ${JSON.stringify(patchBody2.errors || patchBody2)}`);
}

console.log(`✓ ${key} set (${environment}) on project ${PROJECT}.`);
console.log("  Deploy (push to main) then verify with: npm run check:payment");
