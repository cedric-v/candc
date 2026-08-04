#!/usr/bin/env node
/**
 * Restore ALL Cloudflare Pages project secrets from a local, gitignored file
 * in a single command.
 *
 * Values are entered once in `./secrets.local.json` (never committed — see
 * `scripts/secrets.local.example.json` for the template) and re-pushed to
 * Cloudflare whenever needed. Even if a dashboard/API edit wipes the secret
 * values again, this restores everything in seconds:
 *
 *   npm run secrets:push
 *
 * Options (env vars):
 *   SECRETS_FILE    path to the JSON file (default ./secrets.local.json)
 *   PAGES_PROJECT   Pages project name (default candc-ch)
 *
 * Missing/empty values are skipped with a warning. Values are piped to
 * `wrangler pages secret put` via stdin — never logged, never echoed.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.env.SECRETS_FILE || join(here, "..", "secrets.local.json");
const project = process.env.PAGES_PROJECT || "candc-ch";

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`✗ Cannot read ${file}: ${error.message}`);
  console.error(`  Copy scripts/secrets.local.example.json to secrets.local.json and fill it in.`);
  process.exit(1);
}

const keys = Object.keys(data).filter(
  (key) => !key.startsWith("_") && typeof data[key] === "string" && data[key].trim().length > 0,
);

if (!keys.length) {
  console.error(`✗ No non-empty secret values found in ${file}.`);
  process.exit(1);
}

let failures = 0;
for (const key of keys) {
  const value = data[key];
  const result = spawnSync(
    "npx",
    ["wrangler", "pages", "secret", "put", key, "--project-name", project],
    { input: `${value}\n`, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );

  if (result.status === 0) {
    console.log(`✓ ${key}`);
  } else {
    console.error(`✗ ${key} (exit code ${result.status})`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`✗ ${failures} secret(s) failed to upload.`);
  process.exit(1);
}

console.log("\n✓ All secrets pushed. Next steps:");
console.log("  1. Deploy (push to main, or ask an agent to push an empty commit)");
console.log("  2. Verify with: npm run check:payment");
