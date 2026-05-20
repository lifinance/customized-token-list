# LI.FI Custom Tokens

LI.FI supports any token passed to the API as long as we can validate it and find a USD price for it.

The API exposes a list of tokens that UIs can use as default to give their users tokens to choose from — for example, our widget uses that list at <https://li.quest/v1/tokens>.

We automatically include tokens in that token list if they are listed in one of the token lists we support:

- lists of assets the bridges support
- official lists of exchanges we support
- our own custom token list (this repository)

And if we can validate the token:

- we can find USD prices via Debank or Zerion APIs
- the token is not a spam/fee-taking token

You can also block scam tokens for a given chain by adding them to [`/denyTokens/<CHAIN_KEY>.json`](./denyTokens) — see [How to block a token](#how-to-block-a-token) below (internal team only; external partners should [contact LI.FI support](https://help.li.fi/hc/en-us/requests/new)).

---

## 🚀 How to request a change

Two flows, same bot:

- **Add a token to the list** → [Open an "Add a token" issue](../../issues/new?template=add-token.yml)
- **Report a scam token (deny)** → [Open a "Report a scam token" issue](../../issues/new?template=add-deny-token.yml)

Both use the same **two-lane model** to balance ease-of-submission for external contributors with low overhead for the internal team.

### 👤 External contributors (partners, projects, community)

Pick the right template above and fill in all required fields. The moment your issue is opened, an internal LI.FI team member is pinged on Slack. They will turn it into a pull request (typically within a few working days) and merge it once CI passes.

Both forms support **bulk submissions** — see the "Additional tokens / Additional spam tokens (optional)" textarea at the bottom of each form for the JSON-line format.

> ⚠️ **Do not open pull requests from forks.** Fork PRs are auto-closed by a workflow with a pointer back to the issue templates. The templates capture everything we need and are a faster path to merge.

### 🛠️ Internal team members (`@lifinance/fullstack` or `@lifinance/techsupport`)

You have two ways to ship a change, depending on where the request came from:

1. **Internal-originated change** — open a PR directly, wait for CI to pass, and self-merge. No second approver required.
2. **External-originated request** — find the open issue and comment `/add-token` (for token-request issues) or `/deny-token` (for deny-request issues) on it. A bot (`lifi-customizedtokenlist-bot`) will parse the issue, open a fully-populated PR, assign it to you, and link it back in the issue. Review the diff, wait for CI, self-merge.

> 💡 The bot routes by the issue's **label** (`token-request` vs `deny-request`), not by which command you type — so mistyping the command on the wrong issue still does the right thing.

---

## 🔁 How the bot automation works

When an authorised internal comments `/add-token` or `/deny-token` on a labelled issue, the [`process-token-issue` workflow](./.github/workflows/process-token-issue.yml) runs:

1. A GitHub App (`lifi-customizedtokenlist-bot`) mints a short-lived installation token.
2. The workflow verifies the commenter is a member of `@lifinance/fullstack` or `@lifinance/techsupport`. Non-members get a 👎 reaction; nothing else happens.
3. The bot reads the issue's label to determine the flow: `token-request` → add-flow, `deny-request` → deny-flow. Issues with neither label get a friendly 👎 explanation.
4. The bot parses the structured fields (the form for add-flow has different fields from deny-flow) and any optional "additional entries" from the bulk-paste textarea.
5. The appropriate apply script runs:
   - **Add flow:** [`scripts/apply-token.mjs`](./.github/scripts/apply-token.mjs) appends new entries to `tokens/<CHAIN_KEY>.json`.
   - **Deny flow:** [`scripts/apply-deny-token.mjs`](./.github/scripts/apply-deny-token.mjs) appends new entries to `denyTokens/<CHAIN_KEY>.json`.

   Both scripts scan their target directory at runtime to build a `chainId → filename` map (so they stay in sync with the repo — no hard-coded chain table to maintain) and refuse on duplicate addresses or unsupported chain IDs. **Atomic semantics:** if any one entry in a bulk submission fails validation, the whole batch is rejected with per-entry error messages posted back to the issue.
6. On success the bot opens a branch, commits, pushes, and opens a PR — all in the bot's identity, never using your personal credentials. The reporter/partner and your handle are credited in the PR body and commit trailer.
7. The PR is assigned to you. CI runs ([`lint.yml`](./.github/workflows/lint.yml) + [`validate.yml`](./.github/workflows/validate.yml)). Once green, you merge — and merging closes the originating issue automatically (`Closes #<n>` in the PR body).

The bot **never merges** — a human always pulls the trigger.

---

## 📦 What lives in this repo

| Path | Purpose |
|---|---|
| [`tokens/<CHAIN_KEY>.json`](./tokens) | One file per supported chain, containing a JSON array of `{address, chainId, logoURI, decimals, name, symbol}` entries. The filename uses LI.FI's internal chain key; the canonical identifier inside each entry is `chainId`. |
| [`denyTokens/<CHAIN_KEY>.json`](./denyTokens) | Blocked tokens (scams, etc.) per chain. |
| [`approvalResetTokens/<CHAIN_KEY>.json`](./approvalResetTokens) | Legacy ERC-20 tokens that require an approval reset before setting a new allowance (e.g. USDT on Ethereum). |
| [`schema/`](./schema) | JSON schemas defining the expected structure of each entry type. |
| [`.github/ISSUE_TEMPLATE/add-token.yml`](./.github/ISSUE_TEMPLATE/add-token.yml) | The structured form for "add a token" requests (`token-request` label). |
| [`.github/ISSUE_TEMPLATE/add-deny-token.yml`](./.github/ISSUE_TEMPLATE/add-deny-token.yml) | The structured form for "report a scam token" requests (`deny-request` label). |
| [`.github/workflows/process-token-issue.yml`](./.github/workflows/process-token-issue.yml) | The unified `/add-token` + `/deny-token` issue-to-PR converter (label-routed). |

Chain IDs (the canonical numeric identifier inside each entry, and what the issue form asks partners for) can be looked up at <https://chainlist.org> or via LI.FI's [`/chains` API](https://li.quest/v1/chains). The 3-letter filename keys (`ETH`, `ARB`, `BAS`, …) are LI.FI's internal convention; partners never need to know them.

---

## 👥 For internal team members

> The sections below are for members of `@lifinance/fullstack` or `@lifinance/techsupport`. External contributors should use the [issue form](#-external-contributors-partners-projects-community) — these manual paths require write access to the repo.

### How to add a new chain

We add tokens based on chains. You can find all supported chains via our API endpoint [`/chains`](https://li.quest/v1/chains).

The format of the file for a new chain is `[ChainKey].json` and you can find the ChainKey [in our chains documentation](https://docs.li.fi/introduction/chains).

At the same time, please ensure the package [`@lifi/types`](https://github.com/lifinance/types) is the latest version, otherwise you cannot pass the test.

The `/add-token` automation refuses to act on chains that don't yet have a file, so this is the prerequisite step for accepting any token request on a new chain. Open a PR directly that adds `tokens/<NEW_CHAIN_KEY>.json` with at least one entry, then partners can request tokens for that chain via the issue form.

### How to add a token manually (instead of via `/add-token`)

The recommended path for any token request is to drive it through the [issue form](../../issues/new?template=add-token.yml) + `/add-token` automation — it keeps attribution clean and handles validation. Edit the file directly only when the automation doesn't fit (e.g. a one-off internal cleanup):

Open `tokens/<CHAIN_KEY>.json`. Add the token as the last element in the list (don't forget the `,` after the previous token):

```json
  },
  {
    "address": "0x155f0DD04424939368972f4e1838687d6a831151",
    "chainId": 42161,
    "logoURI": "https://yoursite.com/token.svg",
    "decimals": 18,
    "name": "Nice Name",
    "symbol": "SYMBOL"
  }
]
```

### How to block a token

To block a scam token, find the file for the chain in the [`denyTokens/`](./denyTokens) folder.

Add the token as the last element in the list (don't forget the `,` after the previous token):

```json
  },
  {
    "address": "0xde3a24028580884448a5397872046a019649b084",
    "chainId": 43114,
    "reason": "Deprecated USDT token on AVA"
  }
]
```

Create a PR describing why we should block this token. Link the project, Coingecko page, and any supporting evidence.

### How to report EVM tokens requiring an approval reset

These lists of ERC-20 tokens help report the need for an initial approval reset transaction prior to setting a new allowance to the spender. Only a few legacy tokens are concerned (e.g. USDT on Ethereum mainnet).

To add a legacy token on any supported EVM chain, create a PR with the token address and chainId added to the corresponding chain file, e.g. [`./approvalResetTokens/ETH.json`](./approvalResetTokens/ETH.json).

When querying available token-swapping routes or quotes, if the source token is in the approval-reset list, the need for an approval reset transaction will be indicated via an optional `approvalReset` field in the response's `steps[].estimate` dataset.

---

## 🤖 Bot identity & permissions

- The bot is a GitHub App named `lifi-customizedtokenlist-bot`, installed on this repo only.
- It has the minimum permissions needed: read/write on contents, issues, and pull requests; read on org members (to check team membership).
- It does **not** receive webhooks and has **no** OAuth user-authentication flow — it only mints short-lived installation tokens inside Actions workflows.
- Branch protection on `main` restricts pushes to `@lifinance/fullstack`, `@lifinance/techsupport`, and the bot. If this isn't yet enforced on a fresh repo, see Settings → Branches.

---

## 📌 Known limitations

See [`TODO.md`](./TODO.md) for tracked v1 simplifications and follow-up work (currently: non-EVM address validation is hardcoded to Solana and Sui).
