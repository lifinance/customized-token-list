import * as fs from 'fs'
import _ from 'lodash'
import { Token } from './type'

export const tokensInEachFile = (path: string) => {
  try {
    return fs.readdirSync(path).map((fileName) => ({
      fileName,
      contents: JSON.parse(fs.readFileSync(`${path}/${fileName}`, 'utf8')),
    }))
  } catch (error) {
    console.log(`Error reading directory ${path}:`, error)
    throw error
  }
}

export const reduceTokens = (path: string) =>
  tokensInEachFile(path).reduce(
    (allTokens, { contents }) => [...allTokens, ...Object.values(contents)],
    []
  )

/**
 * Check if the image url is valid using the header request with timeout
 */
const imageExists = async (url: string, timeout: number = 5000): Promise<boolean> => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Only request the header, rather than the whole image
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) return false
    const contentType = response.headers.get('content-type')
    return contentType ? contentType.startsWith('image/') : false
  } catch {
    return false
  }
}

type ImageCheckResult = {
  url: string
  exists: boolean
  chainId: number
  address: string
}

const checkImages = async (tokens: Token[]): Promise<ImageCheckResult[]> => {
  const promises = tokens.map(async (token) => {
    try {
      const exists = await imageExists(token.logoURI)

      return {
        url: token.logoURI,
        chainId: token.chainId,
        address: token.address,
        exists,
      }
    } catch (error) {
      return {
        url: token.logoURI,
        chainId: token.chainId,
        address: token.address,
        exists: false,
      }
    }
  })

  return Promise.all(promises)
}

export const checkImagesWithBatch = async (
  tokens: Token[],
  batchSize: number = 10
): Promise<ImageCheckResult[]> => {
  const allResults: ImageCheckResult[] = []
  const chunks = _.chunk(tokens, batchSize)

  for (const chunk of chunks) {
    const batchResults = await checkImages(chunk)
    allResults.push(...batchResults)
  }

  return allResults
}
