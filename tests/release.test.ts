import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_SHA_ENV_VARIABLES, RELEASE_ENV_VARIABLE, resolveRelease } from '../src/config/release';
import { createTempDir } from './helpers';

describe('resolveRelease', () => {
  beforeEach(() => {
    for (const name of [RELEASE_ENV_VARIABLE, ...COMMIT_SHA_ENV_VARIABLES]) {
      vi.stubEnv(name, '');
    }
  });

  it('prefers the release passed to the plugin', () => {
    vi.stubEnv(RELEASE_ENV_VARIABLE, 'from-env');

    expect(resolveRelease('1.2.3', process.cwd())).toBe('1.2.3');
    expect(resolveRelease(42, process.cwd())).toBe('42');
  });

  it('uses HAWK_RELEASE before CI variables', () => {
    vi.stubEnv(RELEASE_ENV_VARIABLE, 'from-env');
    vi.stubEnv('GITHUB_SHA', 'github-sha');

    expect(resolveRelease(undefined, process.cwd())).toBe('from-env');
  });

  it('uses commit SHA from CI variables', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'vercel-sha');

    expect(resolveRelease(undefined, process.cwd())).toBe('vercel-sha');
  });

  it('uses current git commit', () => {
    expect(resolveRelease(undefined, process.cwd())).toMatch(/^[0-9a-f]{40}$/);
  });

  it('falls back to the build time outside a git repository', async () => {
    const dir = await createTempDir();

    expect(Number.isNaN(Date.parse(resolveRelease(undefined, dir)))).toBe(false);
  });
});
