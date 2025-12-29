require('dotenv').config({ quiet: true });

const { readFile, writeFile } = require('fs/promises');
const path = require('path');
const { runpod } = require('@runpod/ai-sdk-provider');
const { generateImage } = require('ai');

const [, , prompt, modelId] = process.argv;
const testsPath = path.join(__dirname, 'tests.json');
const appendTest = async (entry) => writeFile(testsPath, JSON.stringify([...JSON.parse(await readFile(testsPath, 'utf8')), entry], null, 2) + '\n');

if (!prompt) {
  console.error('Usage: node t2i "<prompt>" [model]');
  process.exit(1);
}

const main = async () => {
  const request = { model: modelId || 'pruna/p-image-t2i', prompt, providerOptions: { runpod: { enable_safety_checker: false } } };
  console.log(JSON.stringify({ request }, null, 2));
  const result = await generateImage({ model: runpod.image(request.model), prompt: request.prompt, providerOptions: request.providerOptions });
  if (!result.image?.uint8Array) throw new Error('No image returned');
  const mediaType = result.image.mediaType || 'image/png';
  const ext = `.${mediaType.split('/')[1] || 'png'}`.replace('.jpeg', '.jpg');
  const epoch = `${Math.floor(Date.now() / 1000)}`;
  const slug = `${prompt}`.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').slice(0, 69) || 'image';
  const output = `${slug}-${epoch}${ext}`;
  await writeFile(output, result.image.uint8Array);
  const { image, images: responseImages, ...rest } = result;
  const response = { ...rest, output };
  console.log(JSON.stringify({ response }, null, 2));
  await appendTest(response);
};

main().catch((err) => console.error(err));
