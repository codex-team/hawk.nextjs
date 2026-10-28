import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MockInstance } from 'vitest';
import { afterEach, vi } from 'vitest';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, {
    recursive: true,
    force: true,
  })));
});

/**
 * Builds a fake Integration Token with the given integration id
 * @param integrationId - id to put into the token payload
 */
export function createToken(integrationId = 'test-integration'): string {
  return Buffer.from(JSON.stringify({
    integrationId,
    secret: 'test-secret',
  })).toString('base64');
}

/**
 * Creates a temporary directory with the given files. Removed after each test
 * @param files - map of relative file paths to their content
 * @returns absolute path to the directory
 */
export async function createTempDir(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hawk-nextjs-'));

  tempDirs.push(dir);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return dir;
}

/**
 * Hides plugin logs from the test output
 * @returns console.log spy to check printed messages
 */
export function silenceLogs(): MockInstance<typeof console.log> {
  return vi.spyOn(console, 'log').mockImplementation(() => undefined);
}

/**
 * Source map of a minified Turbopack client chunk (no `file` field)
 */
export const turbopackMap = {
  version: 3,
  sources: ['turbopack:///[project]/app/error-button.tsx', 'turbopack:///[project]/node_modules/next/dist/client.js'],
  sourcesContent: ['export function ErrorButton() {}', 'export {}'],
  names: ['ErrorButton'],
  mappings: 'AAAA',
};

/**
 * Indexed source map emitted by Turbopack with `turbopack.debugIds` enabled
 */
export const turbopackIndexedMap = {
  version: 3,
  sources: [],
  debugId: '7f4b8e8a-2d0e-4c3a-9a51-6b0b8f6f1c2e',
  sections: [
    {
      offset: {
        line: 1,
        column: 0,
      },
      map: turbopackMap,
    },
  ],
};
