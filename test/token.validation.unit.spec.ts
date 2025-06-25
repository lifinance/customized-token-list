import * as fs from 'fs'
import TokenSchema from '../tokenExpectedSchema.json'
import DenyTokenSchema from '../denyTokenExpectedSchema.json'
import Ajv from 'ajv'
import { ChainId } from '@lifi/types'

const tokensInEachFile = (path: string) =>
  fs.readdirSync(path).map((fileName) => ({
    fileName,
    contents: JSON.parse(fs.readFileSync(`${path}/${fileName}`, 'utf8')),
  }))

const reduceTokens = (path: string) =>
  tokensInEachFile(path).reduce(
    (allTokens, { contents }) => [...allTokens, ...Object.values(contents)],
    []
  )

describe('Token validation', () => {
  describe('should validate all tokens', () => {
    const allTokens = reduceTokens('./tokens')
    const tokenValidator = new Ajv().compile(TokenSchema)

    it.each(
      allTokens.map((token: any) => [
        // Used for test naming
        token.name ?? token.address ?? 'Unknown token',
        token.chainId ?? 'Unknown chain',
        // --------------------
        token,
      ])
    )('should be a valid token %s on chain %s', (_, __, token) => {
      expect(tokenValidator(token)).toBeTruthy()
    })

    it.each(tokensInEachFile('./tokens'))(
      'should have the same chainId in $fileName file',
      ({ contents }) => {
        const chainIds = contents.map((token: any) => token.chainId)
        expect(new Set(chainIds).size).toBe(1)
      }
    )
  })

  describe('should validate all deny tokens', () => {
    const allDenyTokens = reduceTokens('./denyTokens')
    const denyTokenValidator = new Ajv().compile(DenyTokenSchema)
    it.each(
      allDenyTokens.map((token: any) => [
        // Used for test naming
        token.name ?? token.address ?? 'Unknown token',
        token.chainId ?? 'Unknown chain',
        // --------------------
        token,
      ])
    )('Should be a valid deny token %s on chain %s', (_, __, token) => {
      expect(denyTokenValidator(token)).toBeTruthy()
    })
  })
})

describe('Token File Name Validation', () => {
  const tokenFileNames = fs.readdirSync('./tokens')
  // Remove .json from file name
  const chainNamesFromTokenFileNames = tokenFileNames.map((fileName) =>
    fileName.replace('.json', '')
  )
  const chainNamesFromTypes = Object.keys(ChainId)
  it.each(chainNamesFromTokenFileNames)('file name %s.json should be valid', (chainName) => {
    expect(chainNamesFromTypes.includes(chainName)).toBeTruthy()
  })
})
