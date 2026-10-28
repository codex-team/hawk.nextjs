import { execFileSync } from 'node:child_process';
import process from 'node:process';

/**
 * Name of the variable that holds the release id.
 * It is inlined into the app code as `process.env.HAWK_RELEASE`
 */
export const RELEASE_ENV_VARIABLE = 'HAWK_RELEASE';

/**
 * Environment variables with the commit SHA exposed by popular CI and hosting providers
 */
export const COMMIT_SHA_ENV_VARIABLES = [
  'GITHUB_SHA',
  'CI_COMMIT_SHA',
  'CI_MERGE_REQUEST_SOURCE_BRANCH_SHA',
  'BITBUCKET_COMMIT',
  'CIRCLE_SHA1',
  'BUILDKITE_COMMIT',
  'DRONE_COMMIT_SHA',
  'TRAVIS_COMMIT',
  'VERCEL_GIT_COMMIT_SHA',
  'CF_PAGES_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'HEROKU_BUILD_COMMIT',
  'SOURCE_VERSION',
  'GIT_COMMIT',
  'COMMIT_REF',
];

/**
 * Returns SHA of the current git commit
 * @param cwd - directory inside the repository
 * @returns undefined when git is not available or cwd is not a repository
 */
function getGitRevision(cwd: string): string | undefined {
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return revision !== '' ? revision : undefined;
  } catch (_error) {
    return undefined;
  }
}

/**
 * Returns the release id for the current build.
 *
 * Sources, in order of priority:
 * 1. `release` passed to the plugin
 * 2. HAWK_RELEASE environment variable
 * 3. commit SHA from CI environment variables
 * 4. `git rev-parse HEAD`
 * 5. build start time
 * @param release - release id passed to the plugin
 * @param cwd - directory to run git in
 */
export function resolveRelease(release: string | number | undefined, cwd: string): string {
  if (release !== undefined && String(release) !== '') {
    return String(release);
  }

  const candidates = [RELEASE_ENV_VARIABLE, ...COMMIT_SHA_ENV_VARIABLES].map(name => process.env[name]);
  const fromEnv = candidates.find(value => value !== undefined && value !== '');

  if (fromEnv !== undefined) {
    return fromEnv;
  }

  return getGitRevision(cwd) ?? new Date().toISOString();
}
