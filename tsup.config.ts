import { readFileSync } from 'node:fs';
import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

/**
 * Part of the `package.json` used by the build
 */
interface PackageJson {
  /**
   * Package version
   */
  version: string;
}

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as PackageJson;

/**
 * Adds typings of `process.env.HAWK_RELEASE` to every project that imports the package
 */
const globalTypesBanner = '/// <reference path="../global.d.ts" />';

/**
 * esbuild plugin type, taken from the tsup options to avoid a direct esbuild dependency
 */
type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

/**
 * React components are emitted into a separate file with the `'use client'` directive.
 * Runtime builds import that file instead of bundling a copy, so the directive is kept
 */
const reactEntryPlugin: EsbuildPlugin = {
  name: 'hawk-react-entry',
  setup(build) {
    const file = build.initialOptions.format === 'cjs' ? './react.cjs' : './react.js';

    build.onResolve({ filter: /^\.\.\/react$/ }, () => ({
      path: file,
      external: true,
    }));
  },
};

/**
 * Options of the runtime builds
 */
const runtime: Options = {
  target: 'es2022',
  define: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- global constant replaced in the code
    HAWK_NEXTJS_VERSION: JSON.stringify(version),
  },
  esbuildPlugins: [reactEntryPlugin],
};

export default defineConfig([
  {
    entry: { config: 'src/config/index.ts' },
    format: ['esm', 'cjs'],
    dts: { banner: globalTypesBanner },
    platform: 'node',
    target: 'node20',
  },
  {
    ...runtime,
    entry: { server: 'src/server/index.ts' },
    format: ['esm', 'cjs'],
    platform: 'node',
  },
  {
    ...runtime,
    entry: { edge: 'src/server/edge.ts' },
    format: ['esm'],
    platform: 'neutral',
  },
  {
    ...runtime,
    entry: { client: 'src/client/index.ts' },
    format: ['esm'],
    platform: 'browser',
  },
  {
    /**
     * esbuild keeps the `'use client'` directive of the entry
     */
    ...runtime,
    entry: { react: 'src/react/index.tsx' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
  },
  {
    entry: { index: 'src/index.types.ts' },
    format: ['esm'],
    dts: {
      only: true,
      banner: globalTypesBanner,
    },
  },
]);
