import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as ClientModule from '../src/client/index';
import type * as EdgeModule from '../src/server/edge';
import type * as ServerModule from '../src/server/index';

/**
 * Plain object type with the module exports. `readonly` is dropped, since re-exported constants lose it
 */
type Exports<Module> = { -readonly [Key in keyof Module]: Module[Key] };

describe('root import', () => {
  it('has the same API in the browser, Node.js and Edge builds', async () => {
    const [client, server, edge] = await Promise.all([
      import('../src/client/index'),
      import('../src/server/index'),
      import('../src/server/edge'),
    ]);
    const exportsOf = (module: object): string[] => Object.keys(module).sort();

    expect(exportsOf(client)).toEqual(exportsOf(server));
    expect(exportsOf(edge)).toEqual(exportsOf(server));

    expectTypeOf<Exports<typeof ClientModule>>().toEqualTypeOf<Exports<typeof ServerModule>>();
    expectTypeOf<Exports<typeof EdgeModule>>().toEqualTypeOf<Exports<typeof ServerModule>>();
  });
});
