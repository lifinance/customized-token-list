import * as fs from 'fs'
import TokenSchema from '../schema/tokenExpectedSchema.json'
import DenyTokenSchema from '../schema/denyTokenExpectedSchema.json'
import ApprovalResetTokenSchema from '../schema/approvalResetTokenExpectedSchema.json'
import Ajv from 'ajv'
import { ChainId } from '@lifi/types'
import { reduceTokens, tokensInEachFile } from './utils'
import { Token, DenyToken, ApprovalResetToken } from './type'

/**
 * Token validation including schema validation and chainId validation
 */
describe('Token validation', () => {
  describe('should validate all tokens', () => {
    const allTokens = reduceTokens('./tokens')
    const tokenValidator = new Ajv().compile<Token>(TokenSchema)

    describe('static resource validation', () => {
      it.each(
        allTokens.map((token: Token) => [
          // Used for test naming
          token.name,
          token.chainId,
          token,
        ])
      )('should be a valid token %s on chain %s', (_, __, token) => {
        expect(tokenValidator(token)).toBeTruthy()
      })

      it.each(tokensInEachFile('./tokens'))(
        'should have the same chainId in $fileName file',
        ({ contents }) => {
          const chainIds = contents.map((token: Token) => token.chainId)
          expect(new Set(chainIds).size).toBe(1)
        }
      )
    })
  })

  describe('should validate all deny tokens', () => {
    const allDenyTokens = reduceTokens('./denyTokens')
    const denyTokenValidator = new Ajv().compile<DenyToken>(DenyTokenSchema)

    it.each(
      allDenyTokens.map((token: DenyToken) => [
        // Used for test naming
        token.address,
        token.chainId,
        token,
      ])
    )('Should be a valid deny token %s on chain %s', (_, __, token) => {
      expect(denyTokenValidator(token)).toBeTruthy()
    })

    it.each(tokensInEachFile('./tokens'))(
      'should have the same chainId in $fileName file',
      ({ contents }) => {
        const chainIds = contents.map((token: DenyToken) => token.chainId)
        expect(new Set(chainIds).size).toBe(1)
      }
    )
  })

  describe('should validate all approval reset tokens', () => {
    const allApprovalResetTokens = reduceTokens('./approvalResetTokens')
    const approvalResetTokenValidator = new Ajv().compile<ApprovalResetToken>(
      ApprovalResetTokenSchema
    )

    it.each(
      allApprovalResetTokens.map((token: ApprovalResetToken) => [
        token.address,
        token.chainId,
        token,
      ])
    )('Should be a valid approval reset token %s on chain %s', (_, __, token) => {
      expect(approvalResetTokenValidator(token)).toBeTruthy()
    })

    it.each(tokensInEachFile('./tokens'))(
      'should have the same chainId in $fileName file',
      ({ contents }) => {
        const chainIds = contents.map((token: ApprovalResetToken) => token.chainId)
        expect(new Set(chainIds).size).toBe(1)
      }
    )
  })
})

/**
 * Token file name validation, ensure the file name is the same as the chain name
 */
describe('Token File Name Validation', () => {
  const getChainNamesFromTokenFileNames = (path: string) =>
    fs.readdirSync(path).map((fileName) => fileName.replace('.json', ''))
  const tokenFileNames = getChainNamesFromTokenFileNames('./tokens')
  const approvalResetTokenFileNames = getChainNamesFromTokenFileNames('./approvalResetTokens')
  const denyTokenFileNames = getChainNamesFromTokenFileNames('./denyTokens')
  const chainNamesFromTokenFileNames = [
    ...tokenFileNames,
    ...approvalResetTokenFileNames,
    ...denyTokenFileNames,
  ]
  const chainNamesFromTypes = Object.keys(ChainId)
  it.each(chainNamesFromTokenFileNames)('file name %s.json should be valid', (chainName) => {
    expect(chainNamesFromTypes.includes(chainName)).toBeTruthy()
  })
})
