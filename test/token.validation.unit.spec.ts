import * as fs from 'fs'
import TokenSchema from '../tokenExpectedSchema.json'
import DenyTokenSchema from '../denyTokenExpectedSchema.json'
import Ajv from 'ajv'

const reduceTokens = (path: string) => 
    fs.readdirSync(path)
        .map(list => JSON.parse(fs.readFileSync(`${path}/${list}`, 'utf8')))
        .reduce((allTokens, currentList) => [...allTokens, ...Object.values(currentList)], [])

describe('Token validation', () => { 
    describe('should validate all tokens', () => {
        const allTokens = reduceTokens('./tokens')
        const tokenValidator = new Ajv().compile(TokenSchema)
        test.each(
            allTokens.map((token: any) => [
                // Used for test naming
                token.name ?? token.address ?? 'Unknown token',
                token.chainId ?? 'Unknown chain',
                // --------------------
                token
            ])
        )(
            'Should be a valid token %s on chain %s', (_, __, token) => {
                expect(tokenValidator(token)).toBeTruthy()
            }
        )
    })

    describe('should validate all deny tokens', () => {
        const allDenyTokens = reduceTokens('./denyTokens')
        const denyTokenValidator = new Ajv().compile(DenyTokenSchema)
        test.each(
            allDenyTokens.map((token: any) => [
                // Used for test naming
                token.name ?? token.address ?? 'Unknown token',
                token.chainId ?? 'Unknown chain',
                // --------------------
                token
            ])
        )(
            'Should be a valid deny token %s on chain %s', (_, __, token) => {
                expect(denyTokenValidator(token)).toBeTruthy()
            }
        )
    })

})