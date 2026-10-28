import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFiles, readFileTail } from '../src/config/utils/fs';
import { createTempDir } from './helpers';

describe('listFiles', () => {
  it('lists files recursively with forward slashes and skips directories', async () => {
    const dir = await createTempDir({
      'a.js': 'a',
      'chunks/app/feed.js/page.js': 'b',
    });

    expect((await listFiles(dir)).sort()).toEqual(['a.js', 'chunks/app/feed.js/page.js']);
  });

  it('returns empty list when the directory does not exist', async () => {
    const dir = await createTempDir();

    expect(await listFiles(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('readFileTail', () => {
  it('returns the whole file when it fits', async () => {
    const dir = await createTempDir({ 'a.js': 'a();\n//# sourceMappingURL=a.js.map' });

    expect(await readFileTail(path.join(dir, 'a.js'), 1024)).toBe('a();\n//# sourceMappingURL=a.js.map');
  });

  it('returns whole last lines of a large file', async () => {
    const dir = await createTempDir({ 'a.js': `${'a();\n'.repeat(1000)}//# debugId=abc\n//# sourceMappingURL=a.js.map\n` });

    /* Last 64 bytes start in the middle of `a();`, which is dropped */
    expect(await readFileTail(path.join(dir, 'a.js'), 64)).toBe('\na();\na();\na();\n//# debugId=abc\n//# sourceMappingURL=a.js.map\n');
  });

  it('returns empty string when the last line does not fit', async () => {
    const dir = await createTempDir({ 'a.js': `a();\n${'b'.repeat(100)}` });

    expect(await readFileTail(path.join(dir, 'a.js'), 64)).toBe('');
  });

  it('drops a multibyte character cut at the start', async () => {
    const dir = await createTempDir({ 'a.js': `${'я'.repeat(100)}\nb();` });

    expect(await readFileTail(path.join(dir, 'a.js'), 11)).toBe('\nb();');
  });
});
