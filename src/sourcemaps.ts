import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listEntries } from './utils/fs';

/**
 * Directory inside `distDir` with assets served to the browser
 */
export const STATIC_DIR = 'static';

/**
 * URL path the `distDir` assets are served from
 */
const PUBLIC_PATH_PREFIX = '/_next/';

/**
 * Trailing `//# sourceMappingURL=...` comment of a JavaScript file
 */
export const JS_SOURCE_MAPPING_URL = /(?:^|\n)\/\/[#@] sourceMappingURL=([^\s'"`*]+)\s*$/;

/**
 * Prefixes of the bundler-specific source paths that are removed to show project-relative paths in Hawk
 */
const SOURCE_PATH_PREFIXES = [
  /^turbopack:\/\/\/\[project\]\//,
  /^webpack:\/\/[^/]*\/(\.\/)?/,
];

/**
 * Client source map found in the build output
 */
export interface ClientSourceMap {
  /**
   * Absolute path to the map file
   */
  path: string;

  /**
   * Public URL path of the chunk the map belongs to, e.g. `/_next/static/chunks/0a1b2c.js`
   */
  chunkUrl: string;

  /**
   * File name to send the map with: chunk name with `.map`, e.g. `0a1b2c.js.map`
   */
  name: string;
}

/**
 * Regular or indexed (sectioned) source map. Only fields modified by the plugin are listed
 */
interface RawSourceMap {
  /**
   * Generated file the map belongs to
   */
  file?: unknown;

  /**
   * Original sources
   */
  sources?: unknown;

  /**
   * Sections of the indexed source map
   */
  sections?: unknown;
}

/**
 * Section of the indexed source map
 */
interface SourceMapSection {
  /**
   * Regular source map of the section
   */
  map?: unknown;
}

/**
 * Checks that the value can be treated as a source map object
 * @param value - parsed JSON
 */
function isRawSourceMap(value: unknown): value is RawSourceMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Removes bundler-specific prefix from the source path
 * @param source - source path from the map, e.g. `turbopack:///[project]/app/page.tsx`
 * @returns project-relative path, e.g. `app/page.tsx`
 */
export function normalizeSourcePath(source: string): string {
  const prefix = SOURCE_PATH_PREFIXES.find(pattern => pattern.test(source));

  return prefix !== undefined ? source.replace(prefix, '') : source;
}

/**
 * Normalizes paths in `sources` of the map
 * @param map - source map to update in place
 */
function normalizeSources(map: RawSourceMap): void {
  if (Array.isArray(map.sources)) {
    map.sources = (map.sources as unknown[]).map(source => (typeof source === 'string' ? normalizeSourcePath(source) : source));
  }
}

/**
 * Returns path of the chunk's source map relative to the static directory
 * @param chunk - chunk path relative to the static directory, e.g. `chunks/0a1b2c.js`
 * @param content - chunk code ending with the `sourceMappingURL` comment
 * @returns undefined when the chunk has no map or refers to it by an absolute or data URL
 */
function getSourceMapPath(chunk: string, content: string): string | undefined {
  const url = JS_SOURCE_MAPPING_URL.exec(content)?.[1];

  if (url === undefined || url.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return undefined;
  }

  try {
    const mapPath = path.posix.join(path.posix.dirname(chunk), decodeURIComponent(url));

    return mapPath.startsWith('../') ? undefined : mapPath;
  } catch (_error) {
    return undefined;
  }
}

/**
 * Checks that the file exists
 * @param filePath - absolute path to check
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);

    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * Finds source maps of the client JavaScript chunks.
 *
 * Turbopack hashes maps separately from chunks (`0a1b2c.js` may refer to `9z8y.js.map`),
 * so maps are found by the `sourceMappingURL` comment of each chunk
 * @param distDir - absolute path to the Next.js build output directory
 */
export async function findClientSourceMaps(distDir: string): Promise<ClientSourceMap[]> {
  const staticDir = path.join(distDir, STATIC_DIR);
  const chunks = (await listEntries(staticDir)).filter(entry => /\.[cm]?js$/.test(entry)).sort();

  const maps = await Promise.all(chunks.map(async (chunk): Promise<ClientSourceMap | undefined> => {
    const mapPath = getSourceMapPath(chunk, await readFile(path.join(staticDir, chunk), 'utf8'));

    if (mapPath === undefined || !await fileExists(path.join(staticDir, mapPath))) {
      return undefined;
    }

    return {
      path: path.join(staticDir, mapPath),
      chunkUrl: `${PUBLIC_PATH_PREFIX}${STATIC_DIR}/${chunk}`,
      name: `${path.posix.basename(chunk)}.map`,
    };
  }));

  return maps.filter(map => map !== undefined);
}

/**
 * Prepares source map content for sending to Hawk.
 *
 * Hawk finds a map for a stack frame by checking that the frame URL contains the map's `file` field.
 * Turbopack does not fill `file`, so it is set to the public path of the chunk, e.g. `/_next/static/chunks/0a1b2c.js`.
 * Bundler-specific prefixes are removed from sources to show project-relative paths.
 * @param content - source map JSON
 * @param chunkUrl - public URL path of the chunk the map belongs to
 * @returns updated source map JSON
 */
export function prepareSourceMap(content: string, chunkUrl: string): string {
  const map = JSON.parse(content) as unknown;

  if (!isRawSourceMap(map)) {
    throw new Error('Source map is not a JSON object');
  }

  map.file = chunkUrl;
  normalizeSources(map);

  if (Array.isArray(map.sections)) {
    for (const section of map.sections as unknown[]) {
      const sectionMap = isRawSourceMap(section) ? (section as SourceMapSection).map : undefined;

      if (isRawSourceMap(sectionMap)) {
        normalizeSources(sectionMap);
      }
    }
  }

  return JSON.stringify(map);
}
