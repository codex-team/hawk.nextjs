import { readFile } from 'node:fs/promises';
import { deleteClientSourceMaps, stripSourceMappingUrlComments } from './cleanup';
import type { Commit } from './commits';
import { getCommits } from './commits';
import { findClientSourceMaps, prepareSourceMap } from './sourcemaps';
import { getDefaultCollectorEndpoint, getIntegrationId } from './token';
import type { Collector } from './uploader';
import { sendCommits, sendSourceMap } from './uploader';
import { consoleColors, getErrorMessage, log } from './utils/log';
import { mapConcurrently } from './utils/pool';

/**
 * Max number of source maps sent at the same time
 */
const MAX_PARALLEL_UPLOADS = 5;

/**
 * Timeout of a single request to the collector, in milliseconds
 */
const REQUEST_TIMEOUT = 30_000;

/**
 * Data passed by Next.js to the `runAfterProductionCompile` hook
 */
export interface BuildMetadata {
  /**
   * Absolute path to the project directory
   */
  projectDir: string;

  /**
   * Absolute path to the build output directory
   */
  distDir: string;
}

/**
 * Options of the release uploading
 */
export interface UploadReleaseOptions {
  /**
   * Hawk Integration Token
   */
  token: string | undefined;

  /**
   * Release id
   */
  release: string;

  /**
   * Collector endpoint overwrite
   */
  collectorEndpoint: string | undefined;

  /**
   * Whether to remove client source maps after sending
   */
  removeSourceMaps: boolean;

  /**
   * Whether to remove `sourceMappingURL` comments from the client assets after removing maps.
   * Should be disabled when assets are protected with Subresource Integrity
   */
  stripSourceMappingUrls: boolean;

  /**
   * Commits sending options or false to skip sending
   */
  commits: false | {
    /**
     * Path to the repository. Default is the project directory
     */
    repo?: string;

    /**
     * Number of recent commits to send
     */
    number: number;
  };
}

/**
 * Returns collector settings or undefined when the token is missing or invalid
 * @param options - token, release and endpoint overwrite
 */
function getCollector(options: UploadReleaseOptions): Collector | undefined {
  if (options.token === undefined || options.token === '') {
    log('Integration Token is not provided, release will not be sent', consoleColors.fgYellow);

    return undefined;
  }

  const integrationId = getIntegrationId(options.token);
  const endpoint = options.collectorEndpoint ?? (integrationId !== undefined ? getDefaultCollectorEndpoint(integrationId) : undefined);

  if (endpoint === undefined) {
    log('Invalid Integration Token, release will not be sent', consoleColors.fgRed);

    return undefined;
  }

  return {
    endpoint,
    token: options.token,
    release: options.release,
    timeout: REQUEST_TIMEOUT,
  };
}

/**
 * Sends recent commits. Sent before source maps, so the release record is created by a single request
 * @param collector - endpoint, token and release to send the commits with
 * @param repo - path to the repository
 * @param count - number of commits
 */
async function uploadCommits(collector: Collector, repo: string, count: number): Promise<void> {
  let commits: Commit[];

  try {
    commits = await getCommits(repo, count);
  } catch (_error) {
    /**
     * Usual for builds in Docker or CI steps without the `.git` directory, so not an error
     */
    log('Commits are not sent: git history is not available. Pass `commits: false` to skip them', consoleColors.fgYellow);

    return;
  }

  if (commits.length === 0) {
    return;
  }

  try {
    await sendCommits(collector, commits);
    log(`Recent commits sent: ${commits.length}`, consoleColors.fgGreen);
  } catch (error) {
    log(`(⌐■_■) Sending commits failed: ${getErrorMessage(error)}`, consoleColors.fgRed);
  }
}

/**
 * Sends client source maps, one map per request
 * @param collector - endpoint, token and release to send the maps with
 * @param distDir - absolute path to the build output directory
 */
async function uploadSourceMaps(collector: Collector, distDir: string): Promise<void> {
  const maps = await findClientSourceMaps(distDir);

  if (maps.length === 0) {
    log('No client source maps found. Make sure `productionBrowserSourceMaps` is not disabled in next.config', consoleColors.fgYellow);

    return;
  }

  let sentCount = 0;

  await mapConcurrently(maps, MAX_PARALLEL_UPLOADS, async (map) => {
    try {
      const content = prepareSourceMap(await readFile(map.path, 'utf8'), map.chunkUrl);

      await sendSourceMap(collector, map.name, content);
      sentCount += 1;
    } catch (error) {
      log(`(⌐■_■) ${map.chunkUrl}.map – sending failed: ${getErrorMessage(error)}`, consoleColors.fgRed);
    }
  });

  const color = sentCount === maps.length ? consoleColors.fgGreen : consoleColors.fgYellow;

  log(`${sentCount} of ${maps.length} source maps sent for release "${collector.release}"`, color);
}

/**
 * Removes client source maps and references to them
 * @param distDir - absolute path to the build output directory
 * @param stripSourceMappingUrls - whether to remove `sourceMappingURL` comments
 */
async function removeSourceMaps(distDir: string, stripSourceMappingUrls: boolean): Promise<void> {
  const removedCount = await deleteClientSourceMaps(distDir);

  if (removedCount > 0) {
    log(`${removedCount} client source maps removed`);
  }

  if (stripSourceMappingUrls) {
    await stripSourceMappingUrlComments(distDir);
  }
}

/**
 * Sends release with client source maps and commits to Hawk, then removes source maps.
 * Never throws: errors are printed to the build output and the build continues
 * @param metadata - project and output directories passed by Next.js
 * @param options - token, release and what to send
 */
export async function uploadRelease(metadata: BuildMetadata, options: UploadReleaseOptions): Promise<void> {
  const startedAt = Date.now();

  try {
    const collector = getCollector(options);

    if (collector === undefined) {
      return;
    }

    try {
      if (options.commits !== false) {
        await uploadCommits(collector, options.commits.repo ?? metadata.projectDir, options.commits.number);
      }

      await uploadSourceMaps(collector, metadata.distDir);
    } finally {
      if (options.removeSourceMaps) {
        await removeSourceMaps(metadata.distDir, options.stripSourceMappingUrls);
      }
    }

    log(`Release "${collector.release}" processed in ${Date.now() - startedAt} ms`);
  } catch (error) {
    log(`(⌐■_■) Release uploading failed: ${getErrorMessage(error)}`, consoleColors.fgRed);
  }
}
