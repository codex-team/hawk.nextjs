import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadReleaseOptions } from '../src/config/upload-release';
import { uploadRelease } from '../src/config/upload-release';
import { listFiles } from '../src/config/utils/fs';
import { createTempDir, createToken, silenceLogs, turbopackMap } from './helpers';

/**
 * Collector requests captured by the fetch mock
 */
interface CapturedRequest {
  /**
   * Value of the `release` field
   */
  release: string;

  /**
   * File name of the `file` part
   */
  fileName?: string;

  /**
   * Parsed source map from the `file` part
   */
  file?: Record<string, unknown>;

  /**
   * Parsed `commits` field
   */
  commits?: unknown[];
}

let requests: CapturedRequest[];

/**
 * Fetch mock that records multipart bodies and replies like the Hawk collector
 * @param _url - collector endpoint
 * @param init - request options with the multipart body
 */
async function collectorMock(_url: string, init: RequestInit): Promise<Response> {
  const body = init.body as FormData;
  const file = body.get('file') as File | null;
  const commits = body.get('commits') as string | null;

  if (file?.name.startsWith('broken.') === true) {
    return new Response('{"code":400,"error":true,"message":"Broken map"}', { status: 400 });
  }

  requests.push({
    release: body.get('release') as string,
    fileName: file?.name,
    file: file !== null ? JSON.parse(await file.text()) as Record<string, unknown> : undefined,
    commits: commits !== null ? JSON.parse(commits) as unknown[] : undefined,
  });

  return new Response('{"code":200,"error":false,"message":"OK"}');
}

const baseOptions: UploadReleaseOptions = {
  token: createToken(),
  release: 'release-1',
  collectorEndpoint: 'https://collector.test/release',
  removeSourceMaps: true,
  stripSourceMappingUrls: true,
  commits: false,
};

/**
 * Creates a fake Next.js build output
 */
async function createBuild(): Promise<string> {
  const map = JSON.stringify(turbopackMap);

  return createTempDir({
    'static/chunks/0a1b2c.js': 'a();\n//# sourceMappingURL=9z8y7x.js.map',
    'static/chunks/9z8y7x.js.map': map,
    'static/chunks/3d4e5f.js': 'b();\n//# sourceMappingURL=6g7h8i.js.map',
    'static/chunks/6g7h8i.js.map': map,
    'static/css/styles.css': 'body{}\n/*# sourceMappingURL=styles.css.map*/',
    'static/css/styles.css.map': '{}',
    'server/chunks/ssr/page.js.map': map,
  });
}

describe('uploadRelease', () => {
  beforeEach(() => {
    requests = [];
    vi.stubGlobal('fetch', vi.fn(collectorMock));
    silenceLogs();
  });

  it('sends every client map in a separate request and removes maps', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, baseOptions);

    expect(requests.map(request => request.fileName)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^0a1b2c\.[\da-f]{8}\.js\.map$/),
      expect.stringMatching(/^3d4e5f\.[\da-f]{8}\.js\.map$/),
    ]));
    expect(requests).toHaveLength(2);
    expect(requests.every(request => request.release === 'release-1')).toBe(true);
    expect(requests.map(request => request.file?.file)).toEqual(expect.arrayContaining([
      '/_next/static/chunks/0a1b2c.js',
      '/_next/static/chunks/3d4e5f.js',
    ]));

    expect(await listFiles(path.join(distDir, 'static/chunks'))).toEqual(expect.arrayContaining(['0a1b2c.js', '3d4e5f.js']));
    expect(await listFiles(path.join(distDir, 'static/chunks'))).toHaveLength(2);
    expect(await listFiles(path.join(distDir, 'static/css'))).toEqual(['styles.css']);
    expect(await listFiles(path.join(distDir, 'server/chunks/ssr'))).toEqual(['page.js.map']);
    expect(await readFile(path.join(distDir, 'static/chunks/0a1b2c.js'), 'utf8')).toBe('a();');
    expect(await readFile(path.join(distDir, 'static/css/styles.css'), 'utf8')).toBe('body{}');
  });

  it('keeps sending other maps when one fails and still removes maps', async () => {
    const distDir = await createBuild();
    const logSpy = silenceLogs();

    await writeFile(path.join(distDir, 'static/chunks/broken.js'), 'c();\n//# sourceMappingURL=broken-map.js.map');
    await writeFile(path.join(distDir, 'static/chunks/broken-map.js.map'), JSON.stringify(turbopackMap));

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, baseOptions);

    expect(requests).toHaveLength(2);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('/_next/static/chunks/broken.js.map – sending failed: Broken map');
    expect((await listFiles(path.join(distDir, 'static'))).some(entry => entry.endsWith('.map'))).toBe(false);
  });

  it('keeps maps and comments when removing is disabled', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      removeSourceMaps: false,
    });

    expect(requests).toHaveLength(2);
    expect(await listFiles(path.join(distDir, 'static/chunks'))).toHaveLength(4);
  });

  it('keeps sourceMappingURL comments when stripping is disabled', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      stripSourceMappingUrls: false,
    });

    expect(await readFile(path.join(distDir, 'static/chunks/0a1b2c.js'), 'utf8')).toContain('sourceMappingURL');
    expect(await listFiles(path.join(distDir, 'static/chunks'))).toHaveLength(2);
  });

  it('sends commits before source maps', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: process.cwd(),
      distDir,
    }, {
      ...baseOptions,
      commits: { number: 1 },
    });

    expect(requests).toHaveLength(3);
    expect(requests[0].commits).toEqual([
      expect.objectContaining({
        hash: expect.stringMatching(/^[0-9a-f]{40}$/) as unknown,
        title: expect.any(String) as unknown,
        author: expect.any(String) as unknown,
        date: expect.any(String) as unknown,
      }),
    ]);
  });

  it('sends source maps without commits when git history is not available', async () => {
    const logSpy = silenceLogs();
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      commits: {
        repo: path.join(distDir, 'missing'),
        number: 1,
      },
    });

    expect(requests).toHaveLength(2);
    expect(requests.every(request => request.commits === undefined)).toBe(true);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Commits are not sent: git history is not available');
  });

  it('does nothing without a token', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      token: undefined,
    });

    expect(requests).toHaveLength(0);
    expect(await listFiles(path.join(distDir, 'static/chunks'))).toHaveLength(4);
  });

  it('does nothing with an invalid token and no endpoint overwrite', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      token: 'invalid',
      collectorEndpoint: undefined,
    });

    expect(requests).toHaveLength(0);
  });

  it('uses the default collector endpoint built from the token', async () => {
    const distDir = await createBuild();

    await uploadRelease({
      projectDir: distDir,
      distDir,
    }, {
      ...baseOptions,
      token: createToken('my-project'),
      collectorEndpoint: undefined,
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://my-project.k1.hawk.so/release', expect.anything());
  });
});
