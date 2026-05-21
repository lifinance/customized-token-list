/**
 * Detect updates to existing tokens between two git revisions and, if any are
 * found, emit a Slack Block Kit payload to GITHUB_OUTPUT.
 *
 * Why: the consuming API caches the token list for 1h, but already-existing
 * tokens whose metadata changed (logoURI, name, etc.) are not refreshed
 * automatically — the team has to call `PATCH /tokens` with an admin API key.
 * This script + its workflow notify Slack so a human can trigger that refresh.
 *
 * Scope: only `tokens/**` (the main list). Newly-added tokens are intentionally
 * ignored — they get picked up by the regular cache cycle. Removals are also
 * ignored for now.
 */

import { execFileSync } from 'child_process'
import { appendFileSync, readFileSync, existsSync } from 'fs'
import * as path from 'path'

type Token = {
  name: string
  address: string
  symbol: string
  decimals: number
  chainId: number
  logoURI: string
}

type Update = {
  chainKey: string
  chainId: number
  symbol: string
  address: string
  changedFields: string[]
}

const COMPARED_FIELDS: (keyof Token)[] = ['name', 'symbol', 'decimals', 'logoURI']
const ZERO_SHA = '0000000000000000000000000000000000000000'
const TOKENS_DIR = 'tokens'

const env = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const git = (args: string[]): string =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

const readBlobAtRev = (rev: string, file: string): Token[] => {
  try {
    const raw = git(['show', `${rev}:${file}`])
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // File didn't exist at that rev (new file) — treat as empty list.
    return []
  }
}

const readBlobOnDisk = (file: string): Token[] => {
  if (!existsSync(file)) return []
  return JSON.parse(readFileSync(file, 'utf8'))
}

const key = (t: Pick<Token, 'chainId' | 'address'>): string =>
  `${t.chainId}:${t.address.toLowerCase()}`

const diffFields = (prev: Token, next: Token): string[] =>
  COMPARED_FIELDS.filter((f) => prev[f] !== next[f])

const chainKeyFromFile = (file: string): string => path.basename(file, '.json')

const escapeMrkdwn = (s: string): string =>
  s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))

const buildBlocks = (
  updates: Update[],
  prLink: string | null,
  commitSha: string,
  commitUrl: string,
  author: string
): unknown => {
  const totalFields = updates.reduce((n, u) => n + u.changedFields.length, 0)
  const lead = prLink
    ? `A <${prLink}|recent PR> changed *${totalFields} field${totalFields === 1 ? '' : 's'} across ${updates.length} token${updates.length === 1 ? '' : 's'}*.`
    : `A <${commitUrl}|recent commit> changed *${totalFields} field${totalFields === 1 ? '' : 's'} across ${updates.length} token${updates.length === 1 ? '' : 's'}*.`

  const rows = updates
    .map(
      (u) =>
        `*${escapeMrkdwn(u.chainKey)} (${u.chainId})* — \`${escapeMrkdwn(u.symbol)}\` \`${u.address}\`\n   ↳ changed: ${u.changedFields.map((f) => `\`${f}\``).join(', ')}`
    )
    .join('\n')

  const contextText = `Triggered by <${commitUrl}|\`${commitSha.slice(0, 7)}\`> · merged by ${escapeMrkdwn(author)}`

  return {
    text: 'Manual cache refresh required after recent update in customized-token-list',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Manual cache refresh required after recent update in customized-token-list',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${lead} Call \`PATCH /tokens\` with an admin API key to push them live before the 1h cache TTL expires.`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: rows },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Please mark this message with a :white_check_mark: reaction once the cache refresh has been triggered, so the team knows it's handled.",
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: contextText }],
      },
    ],
  }
}

const setOutput = (name: string, value: string): void => {
  const file = process.env.GITHUB_OUTPUT
  if (!file) {
    console.log(`[no GITHUB_OUTPUT] ${name}=${value.slice(0, 200)}`)
    return
  }
  // Use a unique heredoc delimiter so embedded JSON can't terminate it.
  const delim = `EOF_${Math.random().toString(36).slice(2)}`
  appendFileSync(file, `${name}<<${delim}\n${value}\n${delim}\n`)
}

const main = (): void => {
  const before = env('BEFORE_SHA')
  const after = env('AFTER_SHA')

  if (before === ZERO_SHA) {
    console.log('First push to branch (zero before-SHA); nothing to diff.')
    setOutput('has_updates', 'false')
    return
  }

  const changed = git(['diff', '--name-only', `${before}..${after}`, '--', `${TOKENS_DIR}/`])
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.json'))

  if (changed.length === 0) {
    console.log('No tokens/*.json changes in this push.')
    setOutput('has_updates', 'false')
    return
  }

  const updates: Update[] = []

  // Bucket by (chainId, lowercased address). A handful of legacy entries
  // share the same key with different metadata (e.g. wrapped/unwrapped
  // variants recorded under the same address), so we compare *sets* of
  // entries per key rather than singletons — otherwise a single Map would
  // silently drop duplicates and flag every untouched sibling as "changed".
  const bucket = (list: Token[]): Map<string, Token[]> => {
    const m = new Map<string, Token[]>()
    for (const t of list) {
      const k = key(t)
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }

  // Order-insensitive set equality on the compared fields. Uses Map.forEach
  // rather than `for...of` because the repo's tsconfig has no explicit target,
  // and ts-node's default (ES5) silently breaks Map iteration via for-of.
  const norm = (t: Token): string => JSON.stringify(COMPARED_FIELDS.map((f) => [f, t[f]]))

  for (const file of changed) {
    const oldBuckets = bucket(readBlobAtRev(before, file))
    const newBuckets = bucket(readBlobOnDisk(file))

    newBuckets.forEach((newEntries, k) => {
      const oldEntries = oldBuckets.get(k)
      if (!oldEntries) return // newly-added token — skip

      const oldSorted = oldEntries.map(norm).sort()
      const newSorted = newEntries.map(norm).sort()
      if (oldSorted.length === newSorted.length && oldSorted.every((v, i) => v === newSorted[i])) {
        return
      }

      // Something differs. Pair each new entry to the closest old sibling
      // (fewest changed fields) and emit one Update with that field list.
      const remainingOld = oldEntries.slice()
      for (const next of newEntries) {
        let bestIdx = -1
        let bestDiff: string[] = COMPARED_FIELDS.slice()
        for (let i = 0; i < remainingOld.length; i++) {
          const d = diffFields(remainingOld[i], next)
          if (d.length < bestDiff.length) {
            bestDiff = d
            bestIdx = i
            if (d.length === 0) break
          }
        }
        if (bestIdx >= 0) remainingOld.splice(bestIdx, 1)
        if (bestDiff.length === 0) continue
        updates.push({
          chainKey: chainKeyFromFile(file),
          chainId: next.chainId,
          symbol: next.symbol,
          address: next.address,
          changedFields: bestDiff,
        })
      }
    })
  }

  if (updates.length === 0) {
    console.log('Changed token files contained no updates to existing tokens.')
    setOutput('has_updates', 'false')
    return
  }

  const repo = env('GITHUB_REPOSITORY')
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com'
  const commitUrl = `${server}/${repo}/commit/${after}`

  // Squash-merge subjects look like "feat: foo (#42)" — extract the PR number.
  const subject = git(['log', '-1', '--pretty=%s', after]).trim()
  const prMatch = subject.match(/\(#(\d+)\)\s*$/)
  const prLink = prMatch ? `${server}/${repo}/pull/${prMatch[1]}` : null

  const author = git(['log', '-1', '--pretty=%an', after]).trim() || 'unknown'

  const payload = buildBlocks(updates, prLink, after, commitUrl, author)
  setOutput('has_updates', 'true')
  setOutput('slack_payload', JSON.stringify(payload))
  console.log(`Detected ${updates.length} updated token(s); Slack payload prepared.`)
}

main()
