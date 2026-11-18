#!/usr/bin/env node
/**
 * Waits for the Cloudflare Pages production deployment of the current commit
 * to finish, then exits 0 (deployed) or 1 (deploy failed / timed out).
 *
 * Used by the post-deploy booking check workflow (.github/workflows/deploy-check.yml)
 * so the live funnel test only runs once the new code is actually live.
 *
 * Terminal states handled:
 *   - deploy/success                 -> 0, the commit is live;
 *   - any stage failure              -> 1, the build/deploy itself failed
 *                                       (e.g. "build exceeded the time limit");
 *   - stage "skipped"                -> the commit's build was superseded by a
 *                                       newer push: Cloudflare never builds it,
 *                                       so waiting would fail forever. The
 *                                       canonical (live) production deployment
 *                                       is checked instead; it is accepted only
 *                                       if it contains this commit (git
 *                                       ancestry, see below) -> 0, otherwise the
 *                                       loop keeps polling.
 *   - queued / in progress           -> poll (a Pages build may legally take up
 *                                       to 20 min, hence the 25 min default
 *                                       timeout: it must outlast a stuck build
 *                                       queue instead of expiring first).
 *
 * Ancestry check: `git merge-base --is-ancestor COMMIT <canonical sha>` is used
 * when the commit objects are available locally (the workflow checks out the
 * repo with fetch-depth: 0). Without them (shallow clone, run outside a git
 * checkout) the canonical deployment is accepted with a warning — a skipped
 * build means "a newer main commit carries this code", which is exactly what a
 * superseded deployment is.
 *
 * History: before this, two benign situations turned the post-deploy check red
 * (18.11.2026, deployments 42560570 "skipped" and f084c491 stuck "queued" behind
 * a hung build) and `npm run check:payment` silently stopped running.
 *
 * Usage:
 *   CF_API_TOKEN=... CF_ACCOUNT_ID=... COMMIT_SHA=... node scripts/wait-for-pages-deploy.mjs
 *
 * Options (env vars):
 *   CF_API_TOKEN   Cloudflare API token (Pages read + account read)
 *   CF_ACCOUNT_ID  Cloudflare account id
 *   CF_PROJECT     Pages project name (default candc-ch)
 *   COMMIT_SHA     full commit hash being deployed (default $GITHUB_SHA)
 *   TIMEOUT_MS     max wait (default 1500000 = 25 min)
 *   POLL_MS        polling interval (default 15000)
 */
import { execFileSync } from "node:child_process";

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = process.env.CF_ACCOUNT_ID;
const PROJECT = process.env.CF_PROJECT || "candc-ch";
const COMMIT = process.env.COMMIT_SHA || process.env.GITHUB_SHA;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 1500000);
const POLL_MS = Number(process.env.POLL_MS || 15000);

const API = "https://api.cloudflare.com/client/v4";
const HEADERS = { Authorization: `Bearer ${TOKEN}` };

if (!TOKEN || !ACCOUNT || !COMMIT) {
  console.error("Missing CF_API_TOKEN / CF_ACCOUNT_ID / COMMIT_SHA");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const short = (sha) => (sha || "?").slice(0, 8);

async function apiGet(path) {
  const response = await fetch(`${API}${path}`, { headers: HEADERS });
  const data = await response.json();
  if (response.status !== 200 || !data.success) {
    throw new Error(`HTTP ${response.status}`);
  }
  return data.result;
}

/** true when `ancestor` is contained in `descendant` (both full shas). */
function isAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  if (ancestor === descendant) return true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    // exit 1 = not an ancestor; anything else = git/objects unavailable
    if (error.status === 1) {
      console.error(
        `✗ Canonical deployment ${short(descendant)} does NOT contain ${short(ancestor)}`,
      );
      return false;
    }
    console.log(
      `⚠ Cannot verify ancestry of ${short(ancestor)} (git: ${error.message.trim()}) — accepting the canonical deployment`,
    );
    return "assume";
  }
}

/** Accept the live production deployment in place of a superseded build. */
async function acceptCanonical(skipped) {
  let project;
  try {
    project = await apiGet(`/accounts/${ACCOUNT}/pages/projects/${PROJECT}`);
  } catch (error) {
    console.log(`⏳ Cannot read project canonical deployment (${error.message}), retrying...`);
    return false;
  }

  const canonical = project?.canonical_deployment;
  const sha = canonical?.deployment_trigger?.metadata?.commit_hash;
  const stage = canonical?.latest_stage;

  if (!canonical || stage?.name !== "deploy" || stage?.status !== "success") {
    console.log(
      `⏳ Deployment of ${short(COMMIT)} was superseded, but no live production deployment is available yet...`,
    );
    return false;
  }

  if (sha !== COMMIT) {
    const ancestry = isAncestor(COMMIT, sha);
    if (ancestry === false) return false;
  }

  console.log(
    `✓ Build of ${short(COMMIT)} was skipped (superseded by ${short(sha)} / ${canonical.id.slice(0, 8)}); live production deployment already contains it: ${canonical.url}`,
  );
  console.log(`  ℹ Superseded deployment id: ${skipped.id.slice(0, 8)} — nothing was built for this commit, which is normal on a fast-moving main.`);
  return true;
}

const startedAt = Date.now();
let lastMessage = "";

while (Date.now() - startedAt < TIMEOUT_MS) {
  let deployments;
  try {
    deployments = await apiGet(
      `/accounts/${ACCOUNT}/pages/projects/${PROJECT}/deployments?per_page=20`,
    );
  } catch (error) {
    console.log(`⏳ API error (${error.message}), retrying...`);
    await sleep(POLL_MS);
    continue;
  }

  const match = deployments.find(
    (deployment) =>
      deployment.environment === "production" &&
      deployment.deployment_trigger?.metadata?.commit_hash === COMMIT,
  );

  if (!match) {
    console.log(`⏳ No production deployment for commit ${short(COMMIT)} yet...`);
    await sleep(POLL_MS);
    continue;
  }

  const stage = match.latest_stage;
  const message = `⏳ Deployment ${match.id.slice(0, 8)} at stage "${stage?.name || "?"}" (${stage?.status || "?"})...`;
  // Avoid flooding the log when a build sits in the same stage for minutes.
  if (message !== lastMessage) {
    console.log(message);
    lastMessage = message;
  }

  if (stage?.name === "deploy" && stage?.status === "success") {
    console.log(`✓ Production deployment live: ${match.url}`);
    process.exit(0);
  }

  if (stage?.status === "failure") {
    console.error(
      `✗ Production deployment ${match.id.slice(0, 8)} failed at stage "${stage.name}"`,
    );
    process.exit(1);
  }

  if (stage?.status === "skipped") {
    if (await acceptCanonical(match)) process.exit(0);
  }

  await sleep(POLL_MS);
}

console.error(
  `✗ Timed out after ${Math.round(TIMEOUT_MS / 1000)}s waiting for deployment of ${short(COMMIT)}`,
);
process.exit(1);
