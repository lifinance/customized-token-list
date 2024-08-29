import {
	ChainType,
	createConfig,
	EVM,
	getTokens,
	Solana,
} from "@lifi/sdk";
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

createConfig({
	providers: [EVM(), Solana()],
	integrator: "lifi",
	preloadChains: false,
});

async function getNativeTokens() {
	const tokens = await getTokens({
		chainTypes: [ChainType.EVM, ChainType.SVM],
	});

	return Object.entries(tokens.tokens).map(([, value]) => {
		return value?.[0];
	});
}

const tokensFolderPath = path.join(__dirname, "tokens");
const outputFilePath = path.join(__dirname, 'tokens', 'all.json');

async function getChainsTopTokens() {
	const files = await fs.readdir(tokensFolderPath);

  let allTokens = [];

	for (const file of files) {
		const filePath = path.join(tokensFolderPath, file);
    console.log(`Parsing file ${filePath}`);
		const data = await fs.readFile(filePath, "utf8");

    if (!data) {
      throw new Error(`File ${file} is not found.`);
    }

    const parsedData = JSON.parse(data);

    if (!Array.isArray(parsedData)) {
      throw new Error(`File ${file} does not contains an array.`);
    }

    allTokens = allTokens.concat(parsedData);
	}

  return allTokens;
}

(async () => {
	await getChainsTopTokens();

  await fs.writeFile(outputFilePath, JSON.stringify([...await getNativeTokens(), ...await getChainsTopTokens()], null, 2), 'utf8');
  console.log(`All tokens have been written to ${outputFilePath}`);
})();
