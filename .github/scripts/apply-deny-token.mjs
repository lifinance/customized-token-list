#!/usr/bin/env node
/**
 * apply-deny-token.mjs — Applies one or more deny-token entries to the right
 * denyTokens/<CHAIN_KEY>.json files.
 *
 * Called by .github/workflows/add-token.yml (the unified workflow that
 * handles both /add-token and /deny-token requests, dispatched by issue
 * label).
 *
 * Inputs (via env vars, set by the workflow's "Parse issue body" step):
 *   PAYLOAD — JSON string with shape:
 *     {
 *       partner: string,            // metadata, not used by this script
 *       contact: string,            // metadata, not used by this script
 *       justification: string,      // metadata, not used by this script
 *       tokens: [                   // 1 or more deny entries (atomic)
 *         { chainId, address, reason? },
 *         ...
 *       ],
 *       parseErrors: [              // populated by the workflow's parse step
 *         { line, content, error },   // for any unparseable lines in the
 *         ...                          // "Additional spam tokens" textarea
 *       ],
 *     }
 *
 * Behaviour (atomic):
 *   1. Surfaces any textarea parse errors collected upstream as immediate
 *      failures (before any per-entry validation).
 *   2. Scans denyTokens/*.json once to build a chainId → filename map.
 *   3. Validates EVERY entry (chainId known, address shape correct, no
 *      duplicates within the existing file, no duplicates within the same
 *      submission). Accumulates all failures rather than stopping at the
 *      first.
 *   4. If ANY entry failed, writes nothing and exits 1 with all failures
 *      reported.
 *   5. If all entries passed, writes the affected files.
 *
 * Entry shape (matches schema/denyTokenExpectedSchema.json):
 *   { address: string, chainId: integer, reason?: string }
 *
 * Exit codes:
 *   0  success — all entries applied
 *   1  validation failure — per-entry messages in stderr (each prefixed ❌),
 *      surfaced back to the issue by the workflow.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DENY_DIR = resolve(REPO_ROOT, 'denyTokens');

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
  console.error('❌ No deny entries to apply — payload.tokens is empty.');
  process.exit(1);
}

for (const pe of payload.parseErrors ?? []) {
  recordFailure(
    `Additional spam tokens, line ${pe.line}: not valid JSON (${pe.error}). ` +
    `Got: ${pe.content}`
  );
}

// ---------- 2. Build chainId → filename map by scanning denyTokens/ ----------

if (!existsSync(DENY_DIR)) {
  console.error(`❌ denyTokens/ directory not found at ${DENY_DIR} — repo layout has changed.`);
  process.exit(1);
}

const chainIdToFile = new Map();
for (const filename of readdirSync(DENY_DIR)) {
  if (!filename.endsWith('.json')) continue;
  const path = join(DENY_DIR, filename);
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
      `❌ Two deny-token files share chainId ${cid}: ${chainIdToFile.get(cid)} ` +
      `and ${filename}. Resolve the ambiguity in the repo before retrying.`
    );
    process.exit(1);
  }
  chainIdToFile.set(cid, filename);
}

// ---------- 3. Validate every entry, accumulate failures ----------

function validateEntry(t, idx) {
  const label = `Entry ${idx}`;
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
  if (chainIdRaw === null || address === null) return null;

  // Reason is optional per the schema; if provided we use it, otherwise the
  // entry just has address + chainId.
  const reasonRaw = t.reason;
  const reason = reasonRaw !== undefined && reasonRaw !== null && String(reasonRaw).trim() !== ''
    ? String(reasonRaw).trim()
    : null;

  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    recordFailure(`${label}: chainId must be a positive integer, got "${chainIdRaw}".`);
    return null;
  }

  const targetFilename = chainIdToFile.get(chainId);
  if (!targetFilename) {
    const supported = [...chainIdToFile.keys()].sort((a, b) => a - b).join(', ');
    recordFailure(
      `${label} (address "${address}"): chainId ${chainId} is not supported in denyTokens/ yet. ` +
      `Supported chain IDs: ${supported}.`
    );
    return null;
  }

  if (!NON_EVM_CHAIN_IDS.has(chainId) && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    recordFailure(`${label} (chainId ${chainId}): address "${address}" is not a valid EVM address.`);
    return null;
  }

  const entry = { chainId, address };
  if (reason !== null) entry.reason = reason;

  return { targetFilename, entry };
}

const validated = tokens.map((t, i) => validateEntry(t, i + 1));

// Second pass: duplicate detection within submission AND against existing file.
const submissionDupes = new Map();
const stagedByFile = new Map();

for (let i = 0; i < validated.length; i++) {
  const v = validated[i];
  if (!v) continue;
  const { targetFilename, entry } = v;
  const key = `${entry.chainId}|${entry.address.toLowerCase()}`;

  if (submissionDupes.has(key)) {
    recordFailure(
      `Entry ${i + 1} (chainId ${entry.chainId}, address ${entry.address}): also requested by Entry ` +
      `${submissionDupes.get(key)} in this same submission.`
    );
    continue;
  }
  submissionDupes.set(key, i + 1);

  let stage = stagedByFile.get(targetFilename);
  if (!stage) {
    const existing = JSON.parse(readFileSync(join(DENY_DIR, targetFilename), 'utf8'));
    stage = { existing, additions: [] };
    stagedByFile.set(targetFilename, stage);
  }
  const onDisk = stage.existing.find(
    (e) => String(e.address).toLowerCase() === entry.address.toLowerCase()
  );
  if (onDisk) {
    recordFailure(
      `Entry ${i + 1} (chainId ${entry.chainId}, address ${entry.address}): already in denyTokens/${targetFilename}` +
      (onDisk.reason ? ` (reason: "${onDisk.reason}")` : '') + '.'
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
  writeFileSync(join(DENY_DIR, filename), JSON.stringify(combined, null, 2) + '\n');
  for (const e of stage.additions) {
    const reasonSuffix = e.reason ? ` — ${e.reason}` : '';
    summary.push(`denyTokens/${filename}: + ${e.address} (chainId ${e.chainId})${reasonSuffix}`);
  }
}

console.log(`✅ Denied ${tokens.length} token${tokens.length === 1 ? '' : 's'} across ${stagedByFile.size} file${stagedByFile.size === 1 ? '' : 's'}:`);
for (const line of summary) console.log(`  ${line}`);
