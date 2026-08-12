#!/usr/bin/env node
/**
 * Waits for the Cloudflare Pages production deployment of the current commit
 * to finish, then exits 0 (deployed) or 1 (deploy failed / timed out).
 *
 * Used by the post-deploy booking check workflow (.github/workflows/deploy-check.yml)
 * so the live funnel test only runs once the new code is actually live.
 *
 * Usage:
 *   CF_API_TOKEN=... CF_ACCOUNT_ID=... COMMIT_SHA=... node scripts/wait-for-pages-deploy.mjs
 *
 * Options (env vars):
 *   CF_API_TOKEN   Cloudflare API token (Pages read + account read)
 *   CF_ACCOUNT_ID  Cloudflare account id
 *   CF_PROJECT     Pages project name (default candc-ch)
 *   COMMIT_SHA     full commit hash being deployed (default $GITHUB_SHA)
 *   TIMEOUT_MS     max wait (default 600000 = 10 min)
 */
const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const PROJECT = process.env.CF_PROJECT || "candc-ch";
const COMMIT = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 600000);
const POLL_MS = 15000;

if (!TOKEN || !ACCOUNT || !COMMIT) {
  console.error("Missing CF_API_TOKEN / CF_ACCOUNT_ID / COMMIT_SHA");
  process.exit(2);
}

const startedAt = Date.now();

while (Date.now() - startedAt < TIMEOUT_MS) {
  let result;
  let status = 0;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects/${PROJECT}/deployments?per_page=10`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    status = response.status;
    const data = await response.json();
    result = data.success ? data.result : null;
  } catch (error) {
    console.log(`⏳ API error (${error.message}), retrying...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    continue;
  }

  if (status !== 200 || !result) {
    console.log(`⏳ API responded ${status}, retrying...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    continue;
  }

  const match = result.find(
    (deployment) =>
      deployment.environment === "production" &&
      deployment.deployment_trigger?.metadata?.commit_hash === COMMIT,
  );

  if (match) {
    const stage = match.latest_stage;
    console.log(
      `⏳ Deployment ${match.id.slice(0, 8)} at stage "${stage?.name || "?"}" (${stage?.status || "?"})...`,
    );
    if (stage?.name === "deploy" && stage?.status === "success") {
      console.log(`✓ Production deployment live: ${match.url}`);
      process.exit(0);
    }
    if (stage?.status === "failure") {
      console.error(`✗ Production deployment ${match.id.slice(0, 8)} failed at stage "${stage.name}"`);
      process.exit(1);
    }
  } else {
    console.log(`⏳ No production deployment for commit ${COMMIT.slice(0, 8)} yet...`);
  }

  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}

console.error(`✗ Timed out after ${TIMEOUT_MS / 1000}s waiting for deployment of ${COMMIT}`);
process.exit(1);
