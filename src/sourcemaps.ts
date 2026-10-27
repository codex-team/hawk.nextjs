import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { listFiles } from './utils/fs';

/**
 * Directory inside `distDir` with assets served to the browser
 */
export const STATIC_DIR = 'static';

/**
 * URL path the `distDir` assets are served from
 */
const PUBLIC_PATH_PREFIX = '/_next/';

/**
 * Number of hex characters of the chunk path hash added to the source map name
 */
const PATH_HASH_LENGTH = 8;

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
   * Public URL path of the chunk the map belongs to, encoded like Next.js does,
   * e.g. `/_next/static/chunks/app/blog/%5Bslug%5D/page-1f2e.js`
   */
  chunkUrl: string;

  /**
   * Unique file name to send the map with, e.g. `page-1f2e.0a1b2c3d.js.map`
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
 * Encodes every segment of the path like Next.js and Turbopack do in chunk URLs,
 * so `app/blog/[slug]/page.js` becomes `app/blog/%5Bslug%5D/page.js`
 * @param filePath - path with forward slashes
 */
function encodeUrlPath(filePath: string): string {
  return filePath.split('/').map(segment => encodeURIComponent(segment))
    .join('/');
}

/**
 * Returns a unique file name to send the chunk's map with.
 *
 * Hawk skips a map if a map with the same name is already saved for the release, and the collector may drop
 * directories from file names. Chunks of different routes can share a name (webpack builds `app/first/page-1f2e.js`
 * and `app/second/page-1f2e.js` for identical pages), so a short hash of the chunk path is added to the name
 * @param chunk - chunk path relative to the static directory, e.g. `chunks/app/first/page-1f2e.js`
 * @returns name like `page-1f2e.0a1b2c3d.js.map`
 */
function getSourceMapName(chunk: string): string {
  const extension = path.posix.extname(chunk);
  const hash = createHash('sha256').update(chunk)
    .digest('hex')
    .slice(0, PATH_HASH_LENGTH);

  return `${path.posix.basename(chunk, extension)}.${hash}${extension}.map`;
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
  const chunks = (await listFiles(staticDir)).filter(entry => /\.[cm]?js$/.test(entry)).sort();

  const maps = await Promise.all(chunks.map(async (chunk): Promise<ClientSourceMap | undefined> => {
    const mapPath = getSourceMapPath(chunk, await readFile(path.join(staticDir, chunk), 'utf8'));

    if (mapPath === undefined || !await fileExists(path.join(staticDir, mapPath))) {
      return undefined;
    }

    return {
      path: path.join(staticDir, mapPath),
      chunkUrl: `${PUBLIC_PATH_PREFIX}${STATIC_DIR}/${encodeUrlPath(chunk)}`,
      name: getSourceMapName(chunk),
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
