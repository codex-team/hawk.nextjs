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

    expect(await findClientSourceMaps(distDir)).toEqual([
      {
        path: path.join(distDir, 'static/chunks/9z8y7x.js.map'),
        chunkUrl: '/_next/static/chunks/0a1b2c.js',
        name: '0a1b2c.js.map',
      },
      {
        path: path.join(distDir, 'static/chunks/6g7h8i.js.map'),
        chunkUrl: '/_next/static/chunks/3d4e5f.js',
        name: '3d4e5f.js.map',
      },
      {
        path: path.join(distDir, 'static/chunks/app/page-1f2e.js.map'),
        chunkUrl: '/_next/static/chunks/app/page-1f2e.js',
        name: 'page-1f2e.js.map',
      },
      {
        path: path.join(distDir, 'static/immutable/chunks/l7m6.js.map'),
        chunkUrl: '/_next/static/immutable/chunks/j9k8.js',
        name: 'j9k8.js.map',
      },
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
