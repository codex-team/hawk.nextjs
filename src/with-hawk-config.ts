import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import type { CommitsOptions } from './commits';
import { RELEASE_ENV_VARIABLE, resolveRelease } from './release';
import { getIntegrationId } from './token';
import type { BuildMetadata, UploadReleaseOptions } from './upload-release';
import { uploadRelease } from './upload-release';
import { consoleColors, log } from './utils/log';

/**
 * Options of the Hawk Next.js integration
 */
export interface HawkNextOptions {
  /**
   * Hawk Integration Token. Default is the HAWK_TOKEN environment variable
   */
  token?: string;

  /**
   * Unique identifier of the release.
   * Default is HAWK_RELEASE environment variable, commit SHA from CI or git, or the build time
   */
  release?: string | number;

  /**
   * Whether to remove client source maps after sending. Default is true
   */
  removeSourceMaps?: boolean;

  /**
   * Options for sending recent commits with the release, or false to skip. Enabled by default
   */
  commits?: boolean | CommitsOptions;

  /**
   * Collector endpoint overwrite
   */
  collectorEndpoint?: string;
}

/**
 * Context passed by Next.js to the config function
 */
interface NextConfigContext {
  /**
   * Default Next.js config
   */
  defaultConfig: NextConfig;
}

/**
 * Next.js config exported as a function
 */
export type NextConfigFunction = (phase: string, context: NextConfigContext) => NextConfig | Promise<NextConfig>;

/**
 * Part of the `package.json` used by the plugin
 */
interface PackageJson {
  /**
   * Package version
   */
  version: string;
}

/**
 * Minimal Next.js version with the `compiler.runAfterProductionCompile` hook
 */
const MIN_NEXT_VERSION = '15.4.1';

/**
 * Number of recent commits sent by default
 */
const DEFAULT_COMMITS_NUMBER = 5;

/**
 * Checks that semver version is greater than or equal to the minimal one. Pre-release tags are ignored
 * @param version - version to check, e.g. `15.4.1-canary.2`
 * @param minVersion - minimal allowed version, e.g. `15.4.1`
 */
export function isVersionAtLeast(version: string, minVersion: string): boolean {
  const toNumbers = (value: string): number[] => value.split('-')[0].split('.').map(Number);
  const actual = toNumbers(version);
  const min = toNumbers(minVersion);

  for (const [i, minPart] of min.entries()) {
    const part = actual[i] ?? 0;

    if (part !== minPart) {
      return part > minPart;
    }
  }

  return true;
}

/**
 * Returns version of Next.js installed in the project
 * @param projectDir - directory to resolve the `next` package from
 */
function getNextVersion(projectDir: string): string | undefined {
  try {
    const requireFromProject = createRequire(path.join(projectDir, 'package.json'));

    return (requireFromProject('next/package.json') as PackageJson).version;
  } catch (_error) {
    return undefined;
  }
}

/**
 * Converts `commits` option to the uploading options
 * @param commits - `commits` option passed to the plugin
 */
function getCommitsOptions(commits: HawkNextOptions['commits'] = true): UploadReleaseOptions['commits'] {
  if (commits === false) {
    return false;
  }

  const custom = commits === true ? {} : commits;

  return {
    repo: custom.repo,
    number: custom.number ?? DEFAULT_COMMITS_NUMBER,
  };
}

/**
 * Returns Next.js config extended with the Hawk settings
 * @param config - Next.js config of the project
 * @param options - Hawk plugin options
 */
function applyHawkConfig(config: NextConfig, options: HawkNextOptions): NextConfig {
  const projectDir = process.cwd();
  const release = resolveRelease(options.release, projectDir);

  /**
   * Next.js loads config several times during the build, including child processes.
   * Save the release to the environment, so every load resolves the same value
   */
  process.env[RELEASE_ENV_VARIABLE] = release;

  const result: NextConfig = {
    ...config,
    env: {
      ...config.env,
      [RELEASE_ENV_VARIABLE]: release,
    },
  };

  const nextVersion = getNextVersion(projectDir);

  if (nextVersion !== undefined && !isVersionAtLeast(nextVersion, MIN_NEXT_VERSION)) {
    log(`Next.js ${nextVersion} is not supported, update it to ${MIN_NEXT_VERSION} or newer to send releases`, consoleColors.fgYellow);

    return result;
  }

  const token = options.token ?? process.env.HAWK_TOKEN;
  const hasToken = token !== undefined && token !== '';
  const canUpload = hasToken && (options.collectorEndpoint !== undefined || getIntegrationId(token) !== undefined);

  if (canUpload && config.productionBrowserSourceMaps === undefined) {
    result.productionBrowserSourceMaps = true;
  }

  const uploadOptions: UploadReleaseOptions = {
    token,
    release,
    collectorEndpoint: options.collectorEndpoint,
    removeSourceMaps: options.removeSourceMaps ?? true,
    stripSourceMappingUrls: config.experimental?.sri === undefined,
    commits: getCommitsOptions(options.commits),
  };

  const userHook = config.compiler?.runAfterProductionCompile;

  result.compiler = {
    ...config.compiler,
    runAfterProductionCompile: async (metadata: BuildMetadata): Promise<void> => {
      if (userHook !== undefined) {
        await userHook(metadata);
      }

      await uploadRelease(metadata, uploadOptions);
    },
  };

  return result;
}

/**
 * Wraps Next.js config to send releases with source maps to Hawk.
 *
 * - exposes the release id to the app code as `process.env.HAWK_RELEASE`
 * - enables client source maps for production builds
 * - after `next build` sends client source maps and recent commits to Hawk and removes the maps
 * @param nextConfig - Next.js config object
 * @param options - Hawk plugin options
 */
export function withHawkConfig(nextConfig: NextConfig, options?: HawkNextOptions): NextConfig;

/**
 * Wraps Next.js config function to send releases with source maps to Hawk
 * @param nextConfig - function returning Next.js config
 * @param options - Hawk plugin options
 */
export function withHawkConfig(nextConfig: NextConfigFunction, options?: HawkNextOptions): NextConfigFunction;

/**
 * Wraps Next.js config object or function to send releases with source maps to Hawk
 * @param nextConfig - Next.js config object or function
 * @param options - Hawk plugin options
 */
export function withHawkConfig(nextConfig: NextConfig | NextConfigFunction, options: HawkNextOptions = {}): NextConfig | NextConfigFunction {
  if (typeof nextConfig === 'function') {
    return async (phase, context) => applyHawkConfig(await nextConfig(phase, context), options);
  }

  return applyHawkConfig(nextConfig, options);
}
