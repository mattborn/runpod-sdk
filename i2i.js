require('dotenv').config({ quiet: true });

const { readFile, writeFile } = require('fs/promises');
const path = require('path');
const { runpod } = require('@runpod/ai-sdk-provider');
const { generateImage } = require('ai');

const [, , imagesArg, prompt, modelId] = process.argv;
const testsPath = path.join(__dirname, 'tests.json');
const appendTest = async (entry) => writeFile(testsPath, JSON.stringify([...JSON.parse(await readFile(testsPath, 'utf8')), entry], null, 2) + '\n');

if (!prompt) {
  console.error('Usage: node i2i "<images>" "<prompt>" [model]');
  process.exit(1);
}

const mimeByExt = { '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const toImageInput = async (value) => {
  if (!value || /^https?:\/\//.test(value) || value.startsWith('data:')) return value;
  const filePath = path.resolve(value);
  const mime = mimeByExt[path.extname(filePath).toLowerCase()] || 'image/png';
  return `data:${mime};base64,${(await readFile(filePath)).toString('base64')}`;
};

const main = async () => {
  const images = imagesArg && imagesArg !== '-' ? imagesArg.split(',').map((item) => item.trim()).filter(Boolean) : [];
  const imageInputs = await Promise.all(images.map(toImageInput));
  const request = { model: modelId || 'pruna/p-image-t2i', prompt: imageInputs.length ? { images: imageInputs, text: prompt } : prompt, providerOptions: { runpod: { enable_safety_checker: false } } };
  const safePrompt = imageInputs.length ? { images: imageInputs.map((item) => (item.startsWith('data:') ? '[data]' : item)), text: prompt } : prompt;
  console.log(JSON.stringify({ request: { ...request, prompt: safePrompt } }, null, 2));
  const result = await generateImage({ model: runpod.image(request.model), prompt: request.prompt, providerOptions: request.providerOptions });
  const mediaType = result.image?.mediaType || 'image/png';
  const ext = `.${mediaType.split('/')[1] || 'png'}`.replace('.jpeg', '.jpg');
  const sourcePath = images[0] ? path.resolve(images[0]) : path.resolve(`output${ext}`);
  const parsed = path.parse(sourcePath);
  const output = path.join(parsed.dir || '.', `${parsed.name}-${ext}`);
  if (!result.image?.uint8Array) throw new Error('No image returned');
  await writeFile(output, result.image.uint8Array);
  const { image, images: responseImages, ...rest } = result;
  const response = { ...rest, output };
  console.log(JSON.stringify({ response }, null, 2));
  await appendTest(response);
};

main().catch((err) => console.error(err));
