import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: {
    /**
     * Adds typings of `process.env.HAWK_RELEASE` to every project that imports the package
     */
    banner: '/// <reference path="../global.d.ts" />',
  },
  clean: true,
  platform: 'node',
  target: 'node20',
});
