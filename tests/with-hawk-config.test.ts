import type { NextConfig } from 'next';
import type * as NodeModule from 'node:module';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_ENV_VARIABLE } from '../src/release';
import { uploadRelease } from '../src/upload-release';
import type { NextConfigFunction } from '../src/with-hawk-config';
import { isVersionAtLeast, withHawkConfig } from '../src/with-hawk-config';
import { createToken, silenceLogs } from './helpers';

const nextPackage = vi.hoisted(() => ({ version: '16.4.3' }));

vi.mock('node:module', async importOriginal => ({
  ...await importOriginal<typeof NodeModule>(),
  createRequire: () => () => nextPackage,
}));

vi.mock('../src/upload-release', () => ({
  uploadRelease: vi.fn(() => Promise.resolve()),
}));

const token = createToken();
const metadata = {
  projectDir: '/project',
  distDir: '/project/.next',
};

/**
 * Calls the post-build hook of the config
 * @param config - config returned by withHawkConfig
 */
async function runHook(config: NextConfig): Promise<void> {
  await config.compiler?.runAfterProductionCompile?.(metadata);
}

describe('withHawkConfig', () => {
  beforeEach(() => {
    nextPackage.version = '16.4.3';
    vi.stubEnv(RELEASE_ENV_VARIABLE, '');
    vi.stubEnv('HAWK_TOKEN', '');
    vi.mocked(uploadRelease).mockClear();
    silenceLogs();
  });

  it('exposes the release to the app code and the environment', () => {
    const config = withHawkConfig({ env: { CUSTOM: 'value' } }, {
      token,
      release: '1.2.3',
    });

    expect(config.env).toEqual({
      CUSTOM: 'value',
      HAWK_RELEASE: '1.2.3',
    });
    expect(process.env.HAWK_RELEASE).toBe('1.2.3');
  });

  it('resolves the same release on repeated config loads', () => {
    const first = withHawkConfig({}, { token });
    const second = withHawkConfig({}, { token });

    expect(first.env?.HAWK_RELEASE).toBeTruthy();
    expect(second.env?.HAWK_RELEASE).toBe(first.env?.HAWK_RELEASE);
  });

  it('enables client source maps when the release can be sent', () => {
    expect(withHawkConfig({}, { token }).productionBrowserSourceMaps).toBe(true);
    expect(withHawkConfig({ productionBrowserSourceMaps: false }, { token }).productionBrowserSourceMaps).toBe(false);
  });

  it('does not enable source maps without a valid token', () => {
    expect(withHawkConfig({}).productionBrowserSourceMaps).toBeUndefined();
    expect(withHawkConfig({}, { token: 'invalid' }).productionBrowserSourceMaps).toBeUndefined();
  });

  it('enables source maps for an invalid token with collector endpoint overwrite', () => {
    const config = withHawkConfig({}, {
      token: 'self-hosted',
      collectorEndpoint: 'https://collector.test/release',
    });

    expect(config.productionBrowserSourceMaps).toBe(true);
  });

  it('reads the token from HAWK_TOKEN', async () => {
    vi.stubEnv('HAWK_TOKEN', token);

    const config = withHawkConfig({});

    expect(config.productionBrowserSourceMaps).toBe(true);

    await runHook(config);

    expect(vi.mocked(uploadRelease).mock.calls[0][1].token).toBe(token);
  });

  it('passes build metadata and options to the uploader', async () => {
    const config = withHawkConfig({}, {
      token,
      release: '1.2.3',
      commits: { repo: '/repo' },
    });

    await runHook(config);

    expect(uploadRelease).toHaveBeenCalledWith(metadata, {
      token,
      release: '1.2.3',
      collectorEndpoint: undefined,
      removeSourceMaps: true,
      stripSourceMappingUrls: true,
      commits: {
        repo: '/repo',
        number: 5,
      },
    });
  });

  it('disables commits and comments stripping when asked', async () => {
    const config = withHawkConfig({ experimental: { sri: { algorithm: 'sha256' } } }, {
      token,
      commits: false,
      removeSourceMaps: false,
    });

    await runHook(config);

    expect(vi.mocked(uploadRelease).mock.calls[0][1]).toMatchObject({
      commits: false,
      removeSourceMaps: false,
      stripSourceMappingUrls: false,
    });
  });

  it('calls the user hook before uploading', async () => {
    const order: string[] = [];
    const userHook = vi.fn(() => {
      order.push('user');

      return Promise.resolve();
    });

    vi.mocked(uploadRelease).mockImplementationOnce(() => {
      order.push('hawk');

      return Promise.resolve();
    });

    const config = withHawkConfig({ compiler: { runAfterProductionCompile: userHook } }, { token });

    await runHook(config);

    expect(userHook).toHaveBeenCalledWith(metadata);
    expect(order).toEqual(['user', 'hawk']);
  });

  it('keeps other compiler options', () => {
    const config = withHawkConfig({ compiler: { removeConsole: true } }, { token });

    expect(config.compiler?.removeConsole).toBe(true);
  });

  it('wraps config functions', async () => {
    const userConfig: NextConfigFunction = phase => ({ distDir: phase });
    const config = withHawkConfig(userConfig, {
      token,
      release: '1.2.3',
    });

    const result = await config('phase-production-build', { defaultConfig: {} });

    expect(result.distDir).toBe('phase-production-build');
    expect(result.env?.HAWK_RELEASE).toBe('1.2.3');
    expect(result.compiler?.runAfterProductionCompile).toBeTypeOf('function');
  });

  it('does not add the hook for unsupported Next.js versions', () => {
    nextPackage.version = '15.3.4';

    const config = withHawkConfig({}, {
      token,
      release: '1.2.3',
    });

    expect(config.env?.HAWK_RELEASE).toBe('1.2.3');
    expect(config.compiler).toBeUndefined();
    expect(config.productionBrowserSourceMaps).toBeUndefined();
  });
});

describe('isVersionAtLeast', () => {
  it('compares versions', () => {
    expect(isVersionAtLeast('15.4.1', '15.4.1')).toBe(true);
    expect(isVersionAtLeast('16.0.0', '15.4.1')).toBe(true);
    expect(isVersionAtLeast('15.10.0', '15.4.1')).toBe(true);
    expect(isVersionAtLeast('15.4.0', '15.4.1')).toBe(false);
    expect(isVersionAtLeast('14.2.30', '15.4.1')).toBe(false);
    expect(isVersionAtLeast('15.5.0-canary.3', '15.4.1')).toBe(true);
  });
});
