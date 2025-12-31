require('dotenv').config({ quiet: true });

const { readFile, writeFile } = require('fs/promises');
const path = require('path');

const [imagesArg, prompt] = process.argv.slice(2);

if (!imagesArg || !prompt) {
  console.error('Usage: node curl "<images>" "<prompt>"');
  process.exit(1);
}

const endpoint = process.env.RUNPOD_ENDPOINT_ID || 'qwen-image-edit-2511';
const pollInterval = 5000;
const pollLimit = 60;
const testsPath = path.join(__dirname, 'tests.json');
const appendTest = async (entry) => writeFile(testsPath, JSON.stringify([...JSON.parse(await readFile(testsPath, 'utf8')), entry], null, 2) + '\n');
const formatByExt = { '.jpeg': 'jpeg', '.jpg': 'jpeg', '.png': 'png', '.webp': 'webp' };
const mimeByExt = { '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const max = 2560;

const readJpegSize = (buffer) => {
  for (let i = 2; i < buffer.length - 9;) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const marker = buffer[i + 1];
    const size = buffer.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    i += 2 + size;
  }
  return {};
};

const readPngSize = (buffer) => buffer.readUInt32BE(0) === 0x89504e47 ? { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) } : {};

const readWebpSize = (buffer) => (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.toString('ascii', 12, 16) === 'VP8X')
  ? { height: 1 + buffer.readUIntLE(27, 3), width: 1 + buffer.readUIntLE(24, 3) }
  : {};

const readSize = (buffer, ext) => ext === '.png' ? readPngSize(buffer) : ext === '.webp' ? readWebpSize(buffer) : readJpegSize(buffer);

const toImageInput = async (value) => {
  if (!value || /^https?:\/\//.test(value) || value.startsWith('data:')) return value;
  const filePath = path.resolve(value);
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext] || 'image/png';
  const buffer = await readFile(filePath);
  const size = readSize(buffer, ext);
  return { ext, filePath, input: `data:${mime};base64,${buffer.toString('base64')}`, size };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const poll = async (id) => {
  for (let attempt = 0; attempt < pollLimit; attempt += 1) {
    const res = await fetch(`https://api.runpod.ai/v2/${endpoint}/status/${id}`, { headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY || ''}` } });
    const data = await res.json();
    process.stdout.write(`\r[poll] ${attempt + 1}/${pollLimit} ${data?.status || 'UNKNOWN'}   `);
    if (data?.status === 'COMPLETED' || data?.status === 'FAILED') return data;
    await wait(pollInterval);
  }
  throw new Error('Polling timed out');
};

const main = async () => {
  const images = imagesArg.split(',').map((item) => item.trim()).filter(Boolean);
  const imageInputs = await Promise.all(images.map(toImageInput));
  const first = imageInputs[0] || {};
  const firstExt = first.ext || path.extname(images[0] || '').toLowerCase();
  const outputFormat = formatByExt[firstExt] || 'jpeg';
  const input = { enable_base64_output: false, enable_sync_mode: true, images: imageInputs.map((item) => item.input || item), output_format: outputFormat, prompt, seed: -1 };
  const safeInput = { ...input, images: imageInputs.map((item) => ((item.input || item).startsWith('data:') ? '[data]' : item.input || item)) };
  const request = { input };
  console.log(JSON.stringify({ request: { input: safeInput }, url: `https://api.runpod.ai/v2/${endpoint}/run` }, null, 2));
  const res = await fetch(`https://api.runpod.ai/v2/${endpoint}/run`, { body: JSON.stringify(request), headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY || ''}`, 'Content-Type': 'application/json' }, method: 'POST' });
  const initial = await res.json();
  const data = initial?.id ? await poll(initial.id) : initial;
  const outputUrl = data?.output?.result;
  let output;
  if (outputUrl) {
    const outExt = outputFormat === 'jpeg' ? '.jpg' : `.${outputFormat}`;
    const base = images[0] ? path.parse(path.resolve(images[0])).name : 'output';
    const dir = images[0] && !/^https?:\/\//.test(images[0]) ? path.parse(path.resolve(images[0])).dir : process.cwd();
    output = path.join(dir || '.', `${base}-${outExt}`);
    const fileRes = await fetch(outputUrl);
    await writeFile(output, Buffer.from(await fileRes.arrayBuffer()));
  }
  const { output: apiOutput, ...rest } = data || {};
  const { image, images: responseImages, image_base64, imageBase64, ...outputRest } = apiOutput || {};
  const response = { ...rest, output: apiOutput ? outputRest : apiOutput, outputFile: output };
  console.log(JSON.stringify({ response }, null, 2));
  await appendTest(response);
};

main().catch((err) => console.error(err));
