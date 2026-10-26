import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteClientSourceMaps, stripSourceMappingUrlComments } from '../src/cleanup';
import { listEntries } from '../src/utils/fs';
import { createTempDir } from './helpers';

describe('deleteClientSourceMaps', () => {
  it('removes JavaScript and CSS maps from the static directory only', async () => {
    const distDir = await createTempDir({
      'static/chunks/a.js': 'code',
      'static/chunks/a.js.map': '{}',
      'static/css/b.css.map': '{}',
      'server/chunks/c.js.map': '{}',
    });

    expect(await deleteClientSourceMaps(distDir)).toBe(2);
    expect(await listEntries(path.join(distDir, 'static/chunks'))).toEqual(['a.js']);
    expect(await listEntries(path.join(distDir, 'server/chunks'))).toEqual(['c.js.map']);
  });
});

describe('stripSourceMappingUrlComments', () => {
  it('removes trailing sourceMappingURL comments from JavaScript and CSS', async () => {
    const distDir = await createTempDir({
      'static/chunks/a.js': 'console.log(1);\n//# debugId=abc\n//# sourceMappingURL=a.js.map\n',
      'static/chunks/b.js': 'console.log("//# sourceMappingURL=inside-string.js.map");',
      'static/css/c.css': 'body{color:red}\n/*# sourceMappingURL=c.css.map*/',
    });

    expect(await stripSourceMappingUrlComments(distDir)).toBe(2);

    const read = (file: string): Promise<string> => readFile(path.join(distDir, 'static', file), 'utf8');

    expect(await read('chunks/a.js')).toBe('console.log(1);\n//# debugId=abc');
    expect(await read('chunks/b.js')).toBe('console.log("//# sourceMappingURL=inside-string.js.map");');
    expect(await read('css/c.css')).toBe('body{color:red}');
  });
});
