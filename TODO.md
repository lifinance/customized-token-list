# Known limitations & follow-up work

Tracked separately from the issue tracker so we don't lose context on intentional v1 simplifications. Promote to a real issue when someone starts work.

---

## Non-EVM address validation is hardcoded to Solana and Sui

**File:** [`.github/scripts/apply-token.mjs`](./.github/scripts/apply-token.mjs) (`NON_EVM_CHAIN_IDS` constant)

**What's there today:**
The `/add-token` automation validates that the partner-supplied address looks like an EVM address (`0x` + 40 hex) unless the chain is on a small allowlist of known non-EVM chains:

```js
const NON_EVM_CHAIN_IDS = new Set([
  1151111081099710 /* SOL */,
  9270000000000000 /* SUI */,
]);
```

**Why it's a limitation:**
If we add a new non-EVM chain to the repo (Aptos, TON, Bitcoin, Cosmos chains, etc.), the script will incorrectly reject valid addresses for that chain because they don't match the EVM regex. The fix needs to either:

- (a) extend the hardcoded set every time a new non-EVM chain lands, or
- (b) replace the hardcoded set with a self-derived check that infers EVM-ness from the chain's existing token entries (e.g. peek at `tokens/<CHAIN_KEY>.json[0].address` and only enforce the EVM regex if the existing entries are EVM-shaped).

**Why we haven't fixed it yet:**
Before changing this, we want to check in with the team to understand how non-EVM address validation is done today across the broader LI.FI stack — there may be a canonical source-of-truth or existing helper we should align with rather than building our own heuristic.

**Owner / next step:** raise in `#dev-backend-expansion` or `#dev-sc-review` to confirm the right pattern, then either (a) or (b) above. Estimated effort once the question is answered: ~10 minutes.

---
