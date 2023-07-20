import * as fs from 'fs'
import TokenSchema from '../expectedSchema.json'
import Ajv from 'ajv'

describe('Token validation', () => {
    let tokenValidator = new Ajv().compile(TokenSchema)
    let allTokens = fs.readdirSync('./tokens')
        .map(list => fs.readFileSync(`tokens/${list}`, 'utf8'))
        .map(blob => JSON.parse(blob))
        .reduce((allTokens, currentList) => [...allTokens, ...Object.values(currentList)], [])

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