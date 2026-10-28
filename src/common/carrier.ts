import type { NextjsAddons } from './request';

/**
 * Global state shared by all copies of the package
 */
interface Carrier<Catcher> {
  /**
   * Catcher created by `init()`
   */
  catcher?: Catcher;

  /**
   * Sends the error with Next.js data. Used by the React components,
   * which are shared by all runtimes and don't know which catcher is active
   */
  capture?: (error: unknown, addons: NextjsAddons) => void;
}

/**
 * Key of the state stored in `globalThis`
 */
const CARRIER_KEY = Symbol.for('hawk.nextjs');

/**
 * `globalThis` with the package state
 */
interface GlobalWithCarrier<Catcher> {
  /**
   * Package state
   */
  [CARRIER_KEY]?: Carrier<Catcher>;
}

/**
 * Returns the global state. Next.js bundles `instrumentation.ts` and the routes into different chunks,
 * so a module-level variable would be duplicated and routes wouldn't see the catcher created in `register()`
 */
export function getCarrier<Catcher = unknown>(): Carrier<Catcher> {
  const store = globalThis as GlobalWithCarrier<Catcher>;

  store[CARRIER_KEY] ??= {};

  return store[CARRIER_KEY];
}
