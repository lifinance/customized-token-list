# AGENTS.md

LI.FI's own custom token list. The API merges `tokens/` into the list served at `https://li.quest/v1/tokens`; `denyTokens/` blocks scam tokens per chain and `approvalResetTokens/` marks legacy ERC-20s that need an approval reset. Most changes are JSON edits, usually opened by the `lifi-customizedtokenlist-bot` from an issue form. The process for humans is in [README.md](README.md).

## Layout

| Path                                            | What lives there                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tokens/<CHAIN_KEY>.json`                       | One JSON array per chain of `{address, chainId, logoURI, decimals, name, symbol}`                                |
| `denyTokens/<CHAIN_KEY>.json`                   | Blocked tokens per chain, `{address, chainId, reason}`                                                           |
| `approvalResetTokens/<CHAIN_KEY>.json`          | Tokens that need an approval reset before a new allowance                                                        |
| `schema/`                                       | JSON schemas the tests validate each entry type against                                                          |
| `tokenlist/`                                    | Standalone partner token lists (for example `megaeth.tokenlist.json`)                                            |
| `test/`                                         | Vitest suite: schema, one-chainId-per-file and file name checks over all lists; `validateImages.ts` checks logos |
| `scripts/detect-token-updates.ts`               | CI-only: detects metadata changes to existing tokens and builds a Slack payload                                  |
| `.github/scripts/apply-*.mjs`                   | CI-only: the bot's issue-to-PR scripts for `/add-token` and `/deny-token`                                        |
| `.github/workflows/`, `.github/ISSUE_TEMPLATE/` | CI, the bot workflow and the issue forms                                                                         |

## Commands

pnpm (version pinned in `package.json` `packageManager`).

```bash
pnpm install          # also installs the husky commit-msg hook (commitlint)
pnpm test             # vitest run: validates every list against schema/
pnpm test:affected    # fast loop; run the full `pnpm test` before pushing
pnpm lint             # oxlint
pnpm format:check     # oxfmt --check (CI runs this and lint)
pnpm format           # oxfmt, writes
pnpm validateImages   # ts-node test/validateImages.ts: fetches every logoURI
```

CI (`lint.yml`, `validate.yml`) runs `format:check`, `lint` and `test` on every PR. `semantic-pr.yml` requires a conventional PR title.

## Conventions

- The file name is LI.FI's internal chain key (`ETH`, `ARB`, `BAS`, ...); the canonical identifier inside each entry is the numeric `chainId`.
- Append new entries at the end of the chain's array. A new chain needs its `tokens/<CHAIN_KEY>.json` file first, and `@lifi/types` must be recent enough to know the `chainId`, or the tests fail.
- Addresses must be unique per file; the bot scripts reject duplicates and unknown chain IDs, and reject a whole bulk batch if one entry fails.
- Non-EVM address validation in the bot only knows Solana and Sui; see [TODO.md](TODO.md) before adding another non-EVM chain.
- Fork PRs are auto-closed (`close-fork-prs.yml`); external requests go through the issue forms.
- Commits follow Conventional Commits (`.commitlintrc.json`).

## Config and env

No runtime service and no `.env`. The only env vars are read in CI: `PAYLOAD` by `.github/scripts/apply-*.mjs`, and `BEFORE_SHA`, `AFTER_SHA`, `GITHUB_REPOSITORY`, `GITHUB_OUTPUT`, `GITHUB_SERVER_URL` by `scripts/detect-token-updates.ts`. The workflows set them.

## Deeper docs

- [README.md](README.md): request flows, bot automation, manual edits, blocking tokens
- [CONTRIBUTING.md](CONTRIBUTING.md): short pointer for contributors
- [TODO.md](TODO.md): known limitations

## Ownership

API Core squad, reviewer Callum (`@CallumGrindle`).
Review requests: request the reviewer above on the PR.
