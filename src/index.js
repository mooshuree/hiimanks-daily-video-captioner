import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { assertFontRegistered, registerFontsFromDir } from './fonts.js';
import { renderLabel } from './label.js';

const configArg = process.argv[2];
if (process.argv.length > 3) {
  console.error('Usage: node src/index.js [path/to/config.json]');
  process.exit(1);
}

const config = loadConfig(configArg);
const fontsDir = resolve(process.cwd(), config.fontsDir);
const outputDir = resolve(process.cwd(), config.outputDir);

registerFontsFromDir(fontsDir);
await mkdir(outputDir, { recursive: true });

for (let i = 0; i < config.labels.length; i++) {
  const label = config.labels[i];
  try {
    assertFontRegistered(label.fontFamily);
  } catch (e) {
    throw new Error(`labels[${i}]: ${e.message}`);
  }
  let result;
  try {
    result = renderLabel(label, config.video.width);
  } catch (e) {
    throw new Error(`labels[${i}] (${label.name}): ${e.message}`);
  }
  const outPath = join(outputDir, `${label.name}.png`);
  await writeFile(outPath, result.buffer);
  console.log(
    `${label.name}: ${result.width}×${result.height}px, lines=${result.lineCount}, fontSize=${result.fontSize}, ${outPath}`,
  );
}
