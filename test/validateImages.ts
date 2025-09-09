import { checkImagesWithBatch, reduceTokens } from './utils'

const main = async () => {
  const allTokens = reduceTokens('./tokens')
  const results = await checkImagesWithBatch(allTokens)
  const invalidResults = results.filter((result) => !result.exists)

  if (invalidResults.length > 0) {
    console.log(`${invalidResults.length} images are invalid`)
    console.log(
      invalidResults.map((result) => `${result.address} on chain ${result.chainId}`).join('\n')
    )
    process.exit(0)
  }

  console.log('All images are valid')
  process.exit(0)
}

main()
