import path from 'path';
import json from "@eslint/json";
import { includeIgnoreFile } from '@eslint/compat';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
    {
		files: ["**/*.json"],
        language: "json/jsonc",
		...json.configs.recommended,
	},
    {
		ignores: [".github"]
	},
    includeIgnoreFile(path.join(__dirname, '.gitignore')),
]