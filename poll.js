require('dotenv').config({ quiet: true });

const { readFile, writeFile } = require('fs/promises');
const path = require('path');

const [, , id] = process.argv;

if (!id) {
  console.error('Usage: node poll "<id>"');
  process.exit(1);
}

const endpoint = process.env.RUNPOD_ENDPOINT_ID || 'qwen-image-edit-2511';
const pollInterval = 5000;
const pollLimit = 60;
const testsPath = path.join(__dirname, 'tests.json');
const appendTest = async (entry) => writeFile(testsPath, JSON.stringify([...JSON.parse(await readFile(testsPath, 'utf8')), entry], null, 2) + '\n');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const poll = async (jobId) => {
  for (let attempt = 0; attempt < pollLimit; attempt += 1) {
    const res = await fetch(`https://api.runpod.ai/v2/${endpoint}/status/${jobId}`, { headers: { Authorization: `Bearer ${process.env.RUNPOD_API_KEY || ''}` } });
    const data = await res.json();
    process.stdout.write(`\r[poll] ${attempt + 1}/${pollLimit} ${data?.status || 'UNKNOWN'}   `);
    if (data?.status === 'COMPLETED' || data?.status === 'FAILED') return data;
    await wait(pollInterval);
  }
  throw new Error('Polling timed out');
};

const main = async () => {
  const data = await poll(id);
  const outputUrl = data?.output?.result;
  let outputFile;
  if (outputUrl) {
    const ext = path.extname(new URL(outputUrl).pathname) || '.jpg';
    outputFile = `output-${id}${ext}`;
    const fileRes = await fetch(outputUrl);
    await writeFile(outputFile, Buffer.from(await fileRes.arrayBuffer()));
  }
  const { output: apiOutput, ...rest } = data || {};
  const { image, images, image_base64, imageBase64, ...outputRest } = apiOutput || {};
  const response = { ...rest, output: apiOutput ? outputRest : apiOutput, outputFile };
  console.log(JSON.stringify({ response }, null, 2));
  await appendTest(response);
};

main().catch((err) => console.error(err));
