require('dotenv').config({ quiet: true });

const { runpod } = require('@runpod/ai-sdk-provider');
const { generateText } = require('ai');

const [, , prompt, modelId] = process.argv;

if (!prompt) {
  console.error('Usage: node text "<prompt>" [model]');
  process.exit(1);
}

const main = async () => console.log((await generateText({ model: runpod(modelId || 'qwen/qwen3-32b-awq'), prompt })).text);

main().catch((err) => console.error(err));
