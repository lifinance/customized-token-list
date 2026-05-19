#!/usr/bin/env node
/**
 * apply-token.mjs — Applies a token submission to the right tokens/<KEY>.json file.
 *
 * Called by .github/workflows/add-token.yml.
 *
 * Inputs (via env vars, set by the workflow's "Parse issue body" step):
 *   PAYLOAD — JSON string with fields: partner, contact, chainId, address,
 *             symbol, name, decimals, logoURI, justification.
 *
 * Behaviour:
 *   1. Scans tokens/*.json and builds a map of chainId → filename by reading
 *      the first entry of each file. This makes the script self-updating: when
 *      a new chain file is added to the repo, no script change is needed.
 *   2. Looks up the partner-supplied chainId in that map.
 *   3. Refuses if no file is found for that chainId (new chains must be added
 *      manually first — see README §"How to add a new chain").
 *   4. Refuses on duplicate address (case-insensitive).
 *   5. Appends the new token as the last element (per the existing repo convention).
 *   6. Writes the file back with 2-space indent + trailing newline.
 *
 * Exit codes:
 *   0  success
 *   1  validation failure — message in stderr, surfaced back to the issue
 *      by the workflow.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS_DIR = resolve(REPO_ROOT, 'tokens');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function required(obj, key) {
  const v = obj[key];
  if (v === undefined || v === null || String(v).trim() === '') {
    fail(`Missing required field: ${key}`);
  }
  return String(v).trim();
}

// ---------- 1. Parse payload ----------

const payload = (() => {
  try {
    return JSON.parse(process.env.PAYLOAD ?? '{}');
  } catch (e) {
    fail(`PAYLOAD env var is not valid JSON: ${e.message}`);
  }
})();

const chainIdRaw = required(payload, 'chainId');
const chainId = Number(chainIdRaw);
if (!Number.isInteger(chainId) || chainId <= 0) {
  fail(`Chain ID must be a positive integer, got "${chainIdRaw}".`);
}

const address = required(payload, 'address');
const symbol = required(payload, 'symbol');
const name = required(payload, 'name');
const decimalsRaw = required(payload, 'decimals');
const logoURI = required(payload, 'logoURI');

const decimals = Number(decimalsRaw);
if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
  fail(`Decimals must be a non-negative integer ≤ 36, got "${decimalsRaw}".`);
}

// ---------- 2. Build chainId → filename map by scanning tokens/ ----------

if (!existsSync(TOKENS_DIR)) {
  fail(`tokens/ directory not found at ${TOKENS_DIR} — repo layout has changed.`);
}

const chainIdToFile = new Map();
for (const filename of readdirSync(TOKENS_DIR)) {
  if (!filename.endsWith('.json')) continue;
  const path = join(TOKENS_DIR, filename);
  let list;
  try {
    list = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  Skipping ${filename}: not valid JSON (${e.message})`);
    continue;
  }
  if (!Array.isArray(list) || list.length === 0) continue;
  const cid = list[0].chainId;
  if (typeof cid !== 'number') continue;
  if (chainIdToFile.has(cid)) {
    // Defensive: shouldn't happen in this repo, but if it ever does we'd rather
    // fail loudly than pick the wrong file silently.
    fail(
      `Two token files share chainId ${cid}: ${chainIdToFile.get(cid)} and ${filename}. ` +
      `Resolve the ambiguity in the repo before retrying.`
    );
  }
  chainIdToFile.set(cid, filename);
}

// ---------- 3. Resolve target file ----------

const targetFilename = chainIdToFile.get(chainId);
if (!targetFilename) {
  const supported = [...chainIdToFile.keys()].sort((a, b) => a - b).join(', ');
  fail(
    `Chain ID ${chainId} is not supported in this repo yet (no matching file in tokens/).\n` +
    `Supported chain IDs: ${supported}.\n` +
    `See README §"How to add a new chain" — an internal team member needs to create ` +
    `the chain file (and bump @lifi/types if needed) before tokens can be added.`
  );
}
const targetPath = join(TOKENS_DIR, targetFilename);

// ---------- 4. Validate address shape ----------

// EVM addresses are universally 0x + 40 hex. Solana / Sui use different formats;
// we identify those by the matching chain IDs in this repo.
const NON_EVM_CHAIN_IDS = new Set([1151111081099710 /* SOL */, 9270000000000000 /* SUI */]);
if (!NON_EVM_CHAIN_IDS.has(chainId) && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
  fail(`Address "${address}" does not look like a valid EVM address (0x + 40 hex chars).`);
}

// ---------- 5. Check duplicate, append, write ----------

const list = JSON.parse(readFileSync(targetPath, 'utf8'));
const existing = list.find((t) => String(t.address).toLowerCase() === address.toLowerCase());
if (existing) {
  fail(
    `Token at address ${address} is already in tokens/${targetFilename} ` +
    `(as "${existing.symbol}" / "${existing.name}"). Nothing to do.`
  );
}

// Field order matches the README example.
list.push({
  address,
  chainId,
  logoURI,
  decimals,
  name,
  symbol,
});

writeFileSync(targetPath, JSON.stringify(list, null, 2) + '\n');

console.log(`✅ Appended ${symbol} (${address}) to tokens/${targetFilename} (chainId ${chainId}).`);
