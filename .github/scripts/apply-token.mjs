#!/usr/bin/env node
/**
 * apply-token.mjs — Applies one or more token submissions to the right
 * tokens/<CHAIN_KEY>.json files.
 *
 * Called by .github/workflows/process-token-issue.yml when an issue with the
 * `token-request` label is being processed.
 *
 * Inputs (via env vars, set by the workflow's "Parse issue body" step):
 *   PAYLOAD — JSON string with shape:
 *     {
 *       partner: string,            // metadata, not used by this script
 *       contact: string,            // metadata, not used by this script
 *       justification: string,      // metadata, not used by this script
 *       tokens: [                   // 1 or more tokens to add (atomic)
 *         { chainId, address, symbol, name, decimals, logoURI },
 *         ...
 *       ],
 *       parseErrors: [              // populated by the workflow's parse step
 *         { line, content, error },   // for any unparseable lines in the
 *         ...                          // "Additional tokens" textarea
 *       ],
 *     }
 *
 * Behaviour (atomic):
 *   1. Surfaces any textarea parse errors collected upstream as immediate
 *      failures (before any per-token validation).
 *   2. Scans tokens/*.json once to build a chainId → filename map.
 *   3. Validates EVERY token (chainId known, address shape correct, no
 *      duplicates within the existing file, no duplicates within the same
 *      submission, decimals in range). Accumulates all failures rather than
 *      stopping at the first.
 *   4. If ANY token failed, writes nothing and exits 1 with all failures
 *      reported — the partner can fix and re-submit the whole batch.
 *   5. If all tokens passed, writes the affected files (one write per
 *      file, regardless of how many tokens went into it).
 *
 * Exit codes:
 *   0  success — all tokens applied
 *   1  validation failure — per-token messages in stderr (each prefixed ❌),
 *      surfaced back to the issue by the workflow.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS_DIR = resolve(REPO_ROOT, 'tokens');

// Hardcoded set of non-EVM chain IDs in this repo. See TODO.md for the
// known limitation — when a new non-EVM chain (Aptos, TON, BTC) is added
// to the repo, this set needs extending or the validation needs replacing
// with a self-derived check.
const NON_EVM_CHAIN_IDS = new Set([
  1151111081099710 /* SOL */,
  9270000000000000 /* SUI */,
]);

const failures = [];
const recordFailure = (msg) => failures.push(msg);

function abortWithFailures() {
  console.error(`❌ ${failures.length} validation ${failures.length === 1 ? 'error' : 'errors'} — no files written:`);
  for (const f of failures) console.error(`❌ ${f}`);
  process.exit(1);
}

// ---------- 1. Parse payload ----------

let payload;
try {
  payload = JSON.parse(process.env.PAYLOAD ?? '{}');
} catch (e) {
  console.error(`❌ PAYLOAD env var is not valid JSON: ${e.message}`);
  process.exit(1);
}

if (typeof payload !== 'object' || payload === null) {
  console.error('❌ PAYLOAD must be a JSON object.');
  process.exit(1);
}

const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
if (tokens.length === 0) {
  console.error('❌ No tokens to apply — payload.tokens is empty.');
  process.exit(1);
}

// Surface any textarea parse errors collected upstream.
for (const pe of payload.parseErrors ?? []) {
  recordFailure(
    `Additional tokens, line ${pe.line}: not valid JSON (${pe.error}). ` +
    `Got: ${pe.content}`
  );
}

// ---------- 2. Build chainId → filename map by scanning tokens/ ----------

if (!existsSync(TOKENS_DIR)) {
  console.error(`❌ tokens/ directory not found at ${TOKENS_DIR} — repo layout has changed.`);
  process.exit(1);
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
    console.error(
      `❌ Two token files share chainId ${cid}: ${chainIdToFile.get(cid)} ` +
      `and ${filename}. Resolve the ambiguity in the repo before retrying.`
    );
    process.exit(1);
  }
  chainIdToFile.set(cid, filename);
}

// ---------- 3. Validate every token, accumulate failures ----------

/**
 * Returns a normalised token entry, or pushes a failure message and returns null.
 * `idx` is the 1-based position in the submission (1 = primary, 2+ = additional).
 */
function validateToken(t, idx) {
  const label = `Token ${idx}`;
  if (typeof t !== 'object' || t === null) {
    recordFailure(`${label}: not a JSON object.`);
    return null;
  }

  const requireField = (key) => {
    const v = t[key];
    if (v === undefined || v === null || String(v).trim() === '') {
      recordFailure(`${label}: missing required field "${key}".`);
      return null;
    }
    return String(v).trim();
  };

  const chainIdRaw = requireField('chainId');
  const address = requireField('address');
  const symbol = requireField('symbol');
  const name = requireField('name');
  const decimalsRaw = requireField('decimals');
  const logoURI = requireField('logoURI');
  if (chainIdRaw === null || address === null || symbol === null ||
      name === null || decimalsRaw === null || logoURI === null) {
    return null;
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    recordFailure(`${label} (symbol "${symbol}"): chainId must be a positive integer, got "${chainIdRaw}".`);
    return null;
  }

  // ERC-20's decimals() returns a uint8, so 0-255 is the spec range.
  // Real tokens almost always use 6 / 8 / 18, but accepting the full uint8
  // range avoids rejecting weird-but-valid tokens.
  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    recordFailure(`${label} (symbol "${symbol}"): decimals must be a non-negative integer ≤ 255 (ERC-20 uint8), got "${decimalsRaw}".`);
    return null;
  }

  const targetFilename = chainIdToFile.get(chainId);
  if (!targetFilename) {
    const supported = [...chainIdToFile.keys()].sort((a, b) => a - b).slice(0, 20).join(', ');
    recordFailure(
      `${label} (symbol "${symbol}"): chainId ${chainId} is not supported in this repo. ` +
      `Supported chain IDs include: ${supported}, … (see README §"How to add a new chain").`
    );
    return null;
  }

  if (!NON_EVM_CHAIN_IDS.has(chainId) && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    recordFailure(`${label} (symbol "${symbol}", chainId ${chainId}): address "${address}" is not a valid EVM address.`);
    return null;
  }

  return {
    targetFilename,
    entry: { address, chainId, logoURI, decimals, name, symbol },
  };
}

// First pass: validate shape + chainId routing + address shape.
const validated = tokens.map((t, i) => validateToken(t, i + 1));

// Second pass: check for duplicates — both within this submission AND against
// what's already on disk. Done after the first pass so we have a stable mapping
// of (targetFilename → entries to add).
const submissionDupes = new Map(); // key: chainId|address.toLowerCase()
const stagedByFile = new Map();    // filename → existing list, plus entries we're staging

for (let i = 0; i < validated.length; i++) {
  const v = validated[i];
  if (!v) continue;
  const { targetFilename, entry } = v;
  const key = `${entry.chainId}|${entry.address.toLowerCase()}`;

  // Duplicate within this submission?
  if (submissionDupes.has(key)) {
    recordFailure(
      `Token ${i + 1} (symbol "${entry.symbol}", chainId ${entry.chainId}): address ${entry.address} ` +
      `is also requested by Token ${submissionDupes.get(key)} in this same submission.`
    );
    continue;
  }
  submissionDupes.set(key, i + 1);

  // Load file (lazily) and check for existing duplicate on-disk.
  let stage = stagedByFile.get(targetFilename);
  if (!stage) {
    const existing = JSON.parse(readFileSync(join(TOKENS_DIR, targetFilename), 'utf8'));
    stage = { existing, additions: [] };
    stagedByFile.set(targetFilename, stage);
  }
  const onDisk = stage.existing.find(
    (e) => String(e.address).toLowerCase() === entry.address.toLowerCase()
  );
  if (onDisk) {
    recordFailure(
      `Token ${i + 1} (symbol "${entry.symbol}", chainId ${entry.chainId}): address ${entry.address} ` +
      `is already in tokens/${targetFilename} as "${onDisk.symbol}" / "${onDisk.name}".`
    );
    continue;
  }
  stage.additions.push(entry);
}

if (failures.length > 0) abortWithFailures();

// ---------- 4. All passed — write all affected files ----------

const summary = [];
for (const [filename, stage] of stagedByFile.entries()) {
  const combined = [...stage.existing, ...stage.additions];
  writeFileSync(join(TOKENS_DIR, filename), JSON.stringify(combined, null, 2) + '\n');
  for (const e of stage.additions) {
    summary.push(`tokens/${filename}: + ${e.symbol} (${e.address}, chainId ${e.chainId})`);
  }
}

console.log(`✅ Applied ${tokens.length} token${tokens.length === 1 ? '' : 's'} across ${stagedByFile.size} file${stagedByFile.size === 1 ? '' : 's'}:`);
for (const line of summary) console.log(`  ${line}`);
