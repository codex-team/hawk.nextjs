import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findClientSourceMaps, normalizeSourcePath, prepareSourceMap } from '../src/sourcemaps';
import { createTempDir, turbopackIndexedMap, turbopackMap } from './helpers';

describe('normalizeSourcePath', () => {
  it('removes Turbopack project prefix', () => {
    expect(normalizeSourcePath('turbopack:///[project]/app/page.tsx')).toBe('app/page.tsx');
  });

  it('removes webpack namespace prefix', () => {
    expect(normalizeSourcePath('webpack://_N_E/./app/page.tsx')).toBe('app/page.tsx');
  });

  it('keeps other paths as is', () => {
    expect(normalizeSourcePath('turbopack:///[turbopack]/runtime.ts')).toBe('turbopack:///[turbopack]/runtime.ts');
    expect(normalizeSourcePath('app/page.tsx')).toBe('app/page.tsx');
  });
});

describe('prepareSourceMap', () => {
  it('sets file to the chunk URL and normalizes sources', () => {
    const prepared = JSON.parse(prepareSourceMap(JSON.stringify(turbopackMap), '/_next/static/chunks/0a1b2c.js')) as typeof turbopackMap & { file: string };

    expect(prepared.file).toBe('/_next/static/chunks/0a1b2c.js');
    expect(prepared.sources).toEqual(['app/error-button.tsx', 'node_modules/next/dist/client.js']);
    expect(prepared.sourcesContent).toEqual(turbopackMap.sourcesContent);
    expect(prepared.mappings).toBe(turbopackMap.mappings);
  });

  it('normalizes sources of the indexed map sections', () => {
    const prepared = JSON.parse(prepareSourceMap(JSON.stringify(turbopackIndexedMap), '/_next/static/chunks/0a1b2c.js')) as typeof turbopackIndexedMap & { file: string };

    expect(prepared.file).toBe('/_next/static/chunks/0a1b2c.js');
    expect(prepared.sections[0].map.sources).toEqual(['app/error-button.tsx', 'node_modules/next/dist/client.js']);
    expect(prepared.sections[0].offset).toEqual(turbopackIndexedMap.sections[0].offset);
  });

  it('overrides file set by the bundler', () => {
    const prepared = JSON.parse(prepareSourceMap(JSON.stringify({
      ...turbopackMap,
      file: 'page.js',
    }), '/_next/static/chunks/app/page-1f2e.js')) as { file: string };

    expect(prepared.file).toBe('/_next/static/chunks/app/page-1f2e.js');
  });

  it('throws for invalid maps', () => {
    expect(() => prepareSourceMap('not json', '/_next/static/chunks/a.js')).toThrow();
    expect(() => prepareSourceMap('[]', '/_next/static/chunks/a.js')).toThrow('Source map is not a JSON object');
  });
});

describe('findClientSourceMaps', () => {
  it('finds maps by the sourceMappingURL comment of each chunk', async () => {
    const distDir = await createTempDir({
      /* Turbopack: map is hashed separately from the chunk */
      'static/chunks/0a1b2c.js': 'a();\n//# sourceMappingURL=9z8y7x.js.map',
      'static/chunks/9z8y7x.js.map': '{}',
      /* Turbopack with debug ids */
      'static/chunks/3d4e5f.js': 'b();\n//# debugId=abc\n//# sourceMappingURL=6g7h8i.js.map\n',
      'static/chunks/6g7h8i.js.map': '{}',
      /* webpack: map is next to the chunk with the same name */
      'static/chunks/app/page-1f2e.js': 'c();\n//# sourceMappingURL=page-1f2e.js.map',
      'static/chunks/app/page-1f2e.js.map': '{}',
      'static/immutable/chunks/j9k8.js': 'd();\n//# sourceMappingURL=l7m6.js.map',
      'static/immutable/chunks/l7m6.js.map': '{}',
    });

    const maps = await findClientSourceMaps(distDir);

    expect(maps.map(({ path: mapPath, chunkUrl }) => ({
      path: mapPath,
      chunkUrl,
    }))).toEqual([
      {
        path: path.join(distDir, 'static/chunks/9z8y7x.js.map'),
        chunkUrl: '/_next/static/chunks/0a1b2c.js',
      },
      {
        path: path.join(distDir, 'static/chunks/6g7h8i.js.map'),
        chunkUrl: '/_next/static/chunks/3d4e5f.js',
      },
      {
        path: path.join(distDir, 'static/chunks/app/page-1f2e.js.map'),
        chunkUrl: '/_next/static/chunks/app/page-1f2e.js',
      },
      {
        path: path.join(distDir, 'static/immutable/chunks/l7m6.js.map'),
        chunkUrl: '/_next/static/immutable/chunks/j9k8.js',
      },
    ]);
    expect(maps.map(map => map.name)).toEqual([
      expect.stringMatching(/^0a1b2c\.[\da-f]{8}\.js\.map$/),
      expect.stringMatching(/^3d4e5f\.[\da-f]{8}\.js\.map$/),
      expect.stringMatching(/^page-1f2e\.[\da-f]{8}\.js\.map$/),
      expect.stringMatching(/^j9k8\.[\da-f]{8}\.js\.map$/),
    ]);
  });

  it('encodes chunk URLs of dynamic routes like Next.js does', async () => {
    const distDir = await createTempDir({
      'static/chunks/app/blog/[slug]/page-1f2e.js': 'a();\n//# sourceMappingURL=page-1f2e.js.map',
      'static/chunks/app/blog/[slug]/page-1f2e.js.map': '{}',
      'static/chunks/app/@modal/(group)/page-3d4e.js': 'b();\n//# sourceMappingURL=page-3d4e.js.map',
      'static/chunks/app/@modal/(group)/page-3d4e.js.map': '{}',
    });

    expect(await findClientSourceMaps(distDir)).toEqual([
      expect.objectContaining({
        path: path.join(distDir, 'static/chunks/app/@modal/(group)/page-3d4e.js.map'),
        chunkUrl: '/_next/static/chunks/app/%40modal/(group)/page-3d4e.js',
      }),
      expect.objectContaining({
        path: path.join(distDir, 'static/chunks/app/blog/[slug]/page-1f2e.js.map'),
        chunkUrl: '/_next/static/chunks/app/blog/%5Bslug%5D/page-1f2e.js',
      }),
    ]);
  });

  it('gives unique names to maps of chunks with the same name in different directories', async () => {
    const distDir = await createTempDir({
      'static/chunks/app/first/page-1f2e.js': 'a();\n//# sourceMappingURL=page-1f2e.js.map',
      'static/chunks/app/first/page-1f2e.js.map': '{}',
      'static/chunks/app/second/page-1f2e.js': 'a();\n//# sourceMappingURL=page-1f2e.js.map',
      'static/chunks/app/second/page-1f2e.js.map': '{}',
    });

    const maps = await findClientSourceMaps(distDir);
    const names = maps.map(map => map.name);

    expect(maps).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names.every(name => /^page-1f2e\.[\da-f]{8}\.js\.map$/.test(name))).toBe(true);
    expect((await findClientSourceMaps(distDir)).map(map => map.name)).toEqual(names);
  });

  it('finds the comment at the end of a chunk larger than the part that is read', async () => {
    const distDir = await createTempDir({
      'static/chunks/large.js': `${'a();\n'.repeat(10_000)}//# debugId=abc\n//# sourceMappingURL=large-map.js.map\n`,
      'static/chunks/large-map.js.map': '{}',
      'static/chunks/long-line.js': `${'b'.repeat(10_000)}//# sourceMappingURL=long-line.js.map`,
      'static/chunks/long-line.js.map': '{}',
    });

    expect(await findClientSourceMaps(distDir)).toEqual([
      expect.objectContaining({
        path: path.join(distDir, 'static/chunks/large-map.js.map'),
        chunkUrl: '/_next/static/chunks/large.js',
      }),
    ]);
  });

  it('skips directories named like chunks', async () => {
    const distDir = await createTempDir({
      'static/chunks/app/feed.js/page-1f2e.js': 'a();\n//# sourceMappingURL=page-1f2e.js.map',
      'static/chunks/app/feed.js/page-1f2e.js.map': '{}',
    });

    expect(await findClientSourceMaps(distDir)).toEqual([
      expect.objectContaining({ chunkUrl: '/_next/static/chunks/app/feed.js/page-1f2e.js' }),
    ]);
  });

  it('skips chunks without a map, with a missing map or a non-relative map URL', async () => {
    const distDir = await createTempDir({
      'static/chunks/no-comment.js': 'a();',
      'static/chunks/missing.js': 'b();\n//# sourceMappingURL=missing.js.map',
      'static/chunks/data.js': 'c();\n//# sourceMappingURL=data:application/json;base64,e30=',
      'static/chunks/remote.js': 'd();\n//# sourceMappingURL=https://cdn.example.com/remote.js.map',
      'static/chunks/outside.js': 'e();\n//# sourceMappingURL=../../server/outside.js.map',
      'static/chunks/unreferenced.js.map': '{}',
      'static/css/styles.css': 'body{}\n/*# sourceMappingURL=styles.css.map*/',
      'static/css/styles.css.map': '{}',
      'server/outside.js.map': '{}',
    });

    expect(await findClientSourceMaps(distDir)).toEqual([]);
  });

  it('returns empty list when there is no static directory', async () => {
    const distDir = await createTempDir();

    expect(await findClientSourceMaps(distDir)).toEqual([]);
  });
});
