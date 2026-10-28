import { access } from 'node:fs/promises';
import path from 'node:path';

/**
 * Extensions Next.js looks for when `pageExtensions` is not set
 */
const DEFAULT_PAGE_EXTENSIONS = ['tsx', 'ts', 'jsx', 'js'];

/**
 * Instrumentation files where the Hawk catchers are initialized
 */
const INSTRUMENTATION_FILES = ['instrumentation', 'instrumentation-client'];

/**
 * Checks whether the file exists
 * @param filePath - absolute path to the file
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);

    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Returns names of the instrumentation files missing in the project root and in `src`
 * @param projectDir - absolute path to the project directory
 * @param pageExtensions - `pageExtensions` from the Next.js config
 * @returns names without extensions, e.g. `instrumentation-client`
 */
export async function findMissingInstrumentationFiles(projectDir: string, pageExtensions = DEFAULT_PAGE_EXTENSIONS): Promise<string[]> {
  const missing: string[] = [];

  for (const name of INSTRUMENTATION_FILES) {
    const candidates = ['', 'src'].flatMap(dir => pageExtensions.map(extension => path.join(projectDir, dir, `${name}.${extension}`)));
    const found = await Promise.all(candidates.map(exists));

    if (!found.includes(true)) {
      missing.push(name);
    }
  }

  return missing;
}
