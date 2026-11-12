import { readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';

/** @type {Set<string>} */
const registeredFamilies = new Set();

/**
 * Derive CSS font-family name from a font filename (e.g. Poppins-Regular.ttf → Poppins).
 * @param {string} filename
 */
function familyNameFromFilename(filename) {
  const stem = basename(filename, extname(filename));
  return stem.replace(
    /-(Regular|Bold|Italic|BoldItalic|Light|Medium|SemiBold|ExtraBold|Thin|Black|ExtraLight)$/i,
    '',
  );
}

/**
 * @param {string} fontsDir
 */
export function registerFontsFromDir(fontsDir) {
  registeredFamilies.clear();

  let entries;
  try {
    entries = readdirSync(fontsDir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`Cannot read fontsDir "${fontsDir}": ${e.message}`);
  }

  const fontFiles = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => /\.(ttf|otf)$/i.test(name));

  if (fontFiles.length === 0) {
    throw new Error(`No .ttf or .otf fonts found in "${fontsDir}"`);
  }

  for (const file of fontFiles) {
    const family = familyNameFromFilename(file);
    const fullPath = join(fontsDir, file);
    GlobalFonts.registerFromPath(fullPath, family);
    registeredFamilies.add(family);
  }
}

export function listFonts() {
  return [...registeredFamilies].sort();
}

/**
 * @param {string} fontFamily
 */
export function assertFontRegistered(fontFamily) {
  if (!registeredFamilies.has(fontFamily)) {
    const available = listFonts();
    throw new Error(
      `Font "${fontFamily}" is not registered. Available fonts: ${
        available.length ? available.join(', ') : '(none)'
      }`,
    );
  }
}
