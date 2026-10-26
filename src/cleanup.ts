import { readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JS_SOURCE_MAPPING_URL, STATIC_DIR } from './sourcemaps';
import { listEntries } from './utils/fs';

/**
 * Trailing `/*# sourceMappingURL=... *\/` comment of a CSS file
 */
const CSS_SOURCE_MAPPING_URL = /(?:^|\n)\/\*[#@] sourceMappingURL=[^\s*]+\s*\*\/\s*$/;

/**
 * Removes all source maps (JavaScript and CSS) served to the browser
 * @param distDir - absolute path to the Next.js build output directory
 * @returns number of removed files
 */
export async function deleteClientSourceMaps(distDir: string): Promise<number> {
  const staticDir = path.join(distDir, STATIC_DIR);
  const maps = (await listEntries(staticDir)).filter(entry => entry.endsWith('.map'));

  await Promise.all(maps.map(entry => unlink(path.join(staticDir, entry))));

  return maps.length;
}

/**
 * Removes trailing `sourceMappingURL` comments from the client assets,
 * so browsers do not request removed source maps
 * @param distDir - absolute path to the Next.js build output directory
 * @returns number of updated files
 */
export async function stripSourceMappingUrlComments(distDir: string): Promise<number> {
  const staticDir = path.join(distDir, STATIC_DIR);
  const assets = (await listEntries(staticDir)).filter(entry => /\.([cm]?js|css)$/.test(entry));

  const updated = await Promise.all(assets.map(async (entry) => {
    const filePath = path.join(staticDir, entry);
    const pattern = entry.endsWith('.css') ? CSS_SOURCE_MAPPING_URL : JS_SOURCE_MAPPING_URL;
    const content = await readFile(filePath, 'utf8');
    const stripped = content.replace(pattern, '');

    if (stripped === content) {
      return false;
    }

    await writeFile(filePath, stripped);

    return true;
  }));

  return updated.filter(Boolean).length;
}
