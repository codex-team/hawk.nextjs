import { describe, expect, it } from 'vitest';
import { findMissingInstrumentationFiles } from '../src/config/instrumentation';
import { createTempDir } from './helpers';

describe('findMissingInstrumentationFiles', () => {
  it('returns both files for a project without instrumentation', async () => {
    const dir = await createTempDir({ 'package.json': '{}' });

    await expect(findMissingInstrumentationFiles(dir)).resolves.toEqual(['instrumentation', 'instrumentation-client']);
  });

  it('finds files in the project root and in src', async () => {
    const dir = await createTempDir({
      'instrumentation.ts': '',
      'src/instrumentation-client.js': '',
    });

    await expect(findMissingInstrumentationFiles(dir)).resolves.toEqual([]);
  });

  it('uses pageExtensions of the project', async () => {
    const dir = await createTempDir({
      'instrumentation.page.ts': '',
      'instrumentation-client.ts': '',
    });

    await expect(findMissingInstrumentationFiles(dir, ['page.ts'])).resolves.toEqual(['instrumentation-client']);
  });
});
