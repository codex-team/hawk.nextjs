import CodeX from 'eslint-config-codex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  ...CodeX,
  {
    name: 'hawk-nextjs/ignores',
    ignores: [
      'example/**',
    ],
  },
  {
    name: 'hawk-nextjs/typescript',
    files: [
      '**/*.ts',
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: dirname,
      },
    },
    rules: {
      /**
       * Imports are resolved by TypeScript
       */
      'n/no-missing-import': 'off',
    },
  },
  {
    name: 'hawk-nextjs/node',
    rules: {
      /**
       * Stable since Node.js 21, but available without flags in Node.js 20 required by Next.js 16
       */
      'n/no-unsupported-features/node-builtins': ['error', {
        ignores: [
          'fetch',
          'FormData',
          'Headers',
          'Request',
          'Response',
        ],
      }],
    },
  },
  {
    name: 'hawk-nextjs/scripts',
    files: [
      'scripts/**/*.mjs',
    ],
    rules: {
      /**
       * Development CLI tools print results and exit with an error code
       */
      'no-console': 'off',
      'n/no-process-exit': 'off',
    },
  },
  {
    name: 'hawk-nextjs/tests',
    files: [
      'tests/**/*.ts',
    ],
    rules: {
      /**
       * Tests use file paths and env variables as object keys and plain numbers in expectations
       */
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
