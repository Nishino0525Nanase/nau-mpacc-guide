// Rasterize the existing book-and-raindrop mark; no external image assets.
import {mkdirSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const source = fileURLToPath(new URL('../dist/favicon.svg', import.meta.url));
const destination = fileURLToPath(new URL('../dist/icons/', import.meta.url));
const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); }
catch { sharp = require(require.resolve('sharp', {paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)})); }
mkdirSync(destination, {recursive:true});
for (const size of [192, 512]) {
  const output = `${destination}app-${size}.png`;
  await sharp(source, {density:600}).resize(size,size).png().toFile(output);
  const png = readFileSync(output);
  if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`Icon has incorrect dimensions: ${output}`);
  process.stdout.write(`Created ${size}×${size} app icon.\n`);
}
