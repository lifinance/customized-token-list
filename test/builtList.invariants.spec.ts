import { describe, expect, it } from 'vitest'
import { reduceTokens } from './utils'
import { Token } from './type'

/**
 * Checks on the list in tokens/*.json. There is no separate build step;
 * reduceTokens() is the same aggregation the schema tests use.
 *
 * @uniswap/token-lists is not installed here, so this file does not call it.
 * Per-token shape is already covered against schema/tokenExpectedSchema.json.
 */

// Pairs that already appear twice. https://github.com/lifinance/customized-token-list/issues/880
// Drop a key in the PR that removes the extra row.
const KNOWN_DUPLICATE_KEYS = [
  '1:0x38eeb52f0771140d10c4e9a9a72349a329fe8a6a',
  '1:0x644192291cc835a93d6330b24ea5f5fedd0eef9e',
  '1337:0x2ff71b802a6788a052c7f1a58ec863af00000000',
  '137:0x644192291cc835a93d6330b24ea5f5fedd0eef9e',
  '42161:0x7b5eb3940021ec0e8e463d5dbb4b7b09a89ddf96',
  '43114:0x644192291cc835a93d6330b24ea5f5fedd0eef9e',
  '56:0x3fcd741646a9790635b938cdb69af5df356cbaab',
  '56:0x644192291cc835a93d6330b24ea5f5fedd0eef9e',
  '56:0xad6742a35fb341a9cc6ad674738dd8da98b94fb1',
  '999:0xca79db4b49f608ef54a5cb813fbed3a6387bc645',
]

const pairKey = (token: Token): string => `${token.chainId}:${token.address.toLowerCase()}`

const duplicatePairKeys = (tokens: Token[]): string[] => {
  const counts = new Map<string, number>()
  for (const token of tokens) {
    const key = pairKey(token)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort()
}

// data:image/<type>[;param][,;base64],<payload>
const DATA_IMAGE_URI = /^data:image\/[a-z0-9.+-]+(?:;[a-z0-9.+-]+(?:=[^;,]+)?)*,.+/i

const isDataImageUri = (uri: string): boolean => DATA_IMAGE_URI.test(uri)

const tokens = reduceTokens('./tokens') as Token[]

describe('built token list', () => {
  it('keeps (chainId, address) unique aside from the pairs in #880', () => {
    expect(duplicatePairKeys(tokens)).toEqual([...KNOWN_DUPLICATE_KEYS].sort())
  })

  it('uses an integer decimals between 0 and 36', () => {
    const outOfRange = tokens
      .filter(
        (token) => !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36
      )
      .map((token) => `${pairKey(token)} decimals=${String(token.decimals)}`)

    expect(outOfRange).toEqual([])
  })

  it('accepts a data image URI without fetching it', () => {
    expect(isDataImageUri('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isDataImageUri('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(
      true
    )
    expect(isDataImageUri('data:image/png;base64,')).toBe(false)
    expect(isDataImageUri('data:text/plain,hello')).toBe(false)
  })

  it('resolves every logoURI through fetch, or accepts a data image URI', async () => {
    const originalFetch = globalThis.fetch
    const fetched: string[] = []

    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      fetched.push(url)

      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new TypeError(`Unsupported protocol: ${parsed.protocol}`)
      }

      return new Response(null, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }) as typeof fetch

    try {
      const failures: string[] = []

      await Promise.all(
        tokens.map(async (token) => {
          if (isDataImageUri(token.logoURI)) return

          try {
            const response = await fetch(token.logoURI, { method: 'HEAD' })
            const contentType = response.headers.get('content-type') ?? ''
            if (!response.ok || !contentType.startsWith('image/')) {
              failures.push(`${pairKey(token)} ${token.logoURI}`)
            }
          } catch {
            failures.push(`${pairKey(token)} ${token.logoURI}`)
          }
        })
      )

      expect(failures).toEqual([])
      expect(fetched).toHaveLength(tokens.filter((token) => !isDataImageUri(token.logoURI)).length)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
